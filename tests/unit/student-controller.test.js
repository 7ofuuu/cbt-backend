/**
 * White Box Test: Student Exam Controller
 * WB-18
 * Target: src/controllers/studentController.js
 *   getMyExams, startExam, prefetchExam, submitAnswer, finishExam, reportViolation
 */
jest.mock('../../src/config/db');
jest.mock('../../src/services/activityLogService', () => ({
  logFromRequest: jest.fn().mockResolvedValue(undefined),
}));

const prisma = require('../../src/config/db');
const ctrl = require('../../src/controllers/studentController');

const student = { student_id: 1 };

const makeReqRes = (overrides = {}) => {
  const req = { body: {}, params: {}, query: {}, user: { id: 1 }, headers: {}, student, ...overrides };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  const next = jest.fn();
  return { req, res, next };
};
const flush = () => new Promise((r) => setImmediate(r));
const run = async (handler, overrides) => {
  const ctx = makeReqRes(overrides);
  handler(ctx.req, ctx.res, ctx.next);
  await flush();
  return ctx;
};

const HOUR = 60 * 60 * 1000;
const past = (ms) => new Date(Date.now() - ms);
const future = (ms) => new Date(Date.now() + ms);

beforeEach(() => jest.clearAllMocks());

// ─── getMyExams ───────────────────────────────────────────────────────────────

describe('getMyExams', () => {
  test('WB-SC-01: returns only active, not-yet-completed, in-window exams', async () => {
    prisma.examParticipant.findMany.mockResolvedValue([
      // eligible
      { exam_participant_id: 1, exam_status: 'NOT_STARTED', is_blocked: false, exam: { exam_id: 1, exam_name: 'A', exam_status: 'SCHEDULED', start_date: future(HOUR), end_date: future(2 * HOUR), exam_questions: [{ exam_question_id: 1 }], teacher: { full_name: 'G' }, is_shuffle_questions: false } },
      // completed → excluded
      { exam_participant_id: 2, exam_status: 'COMPLETED', is_blocked: false, exam: { exam_id: 2, exam_name: 'B', exam_status: 'ONGOING', start_date: past(HOUR), end_date: future(HOUR), exam_questions: [], teacher: { full_name: 'G' }, is_shuffle_questions: false } },
      // expired → excluded
      { exam_participant_id: 3, exam_status: 'NOT_STARTED', is_blocked: false, exam: { exam_id: 3, exam_name: 'C', exam_status: 'ONGOING', start_date: past(2 * HOUR), end_date: past(HOUR), exam_questions: [], teacher: { full_name: 'G' }, is_shuffle_questions: false } },
    ]);
    const { res } = await run(ctrl.getMyExams);
    const payload = res.json.mock.calls[0][0];
    expect(payload.exams).toHaveLength(1);
    expect(payload.exams[0].exam_id).toBe(1);
    expect(payload.exams[0].time_status).toBe('Belum Mulai');
  });
});

// ─── startExam ────────────────────────────────────────────────────────────────

describe('startExam', () => {
  const baseExam = {
    exam_id: 1, exam_name: 'UTS', subject: 'IPA', duration_minutes: 60,
    start_date: past(HOUR), end_date: future(HOUR),
    exam_questions: [{ exam_question_id: 1, question: { answer_options: [] } }],
  };

  test('WB-SC-02: missing exam_id → 400', async () => {
    const { next } = await run(ctrl.startExam, { body: {} });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-SC-03: not registered → 404', async () => {
    prisma.examParticipant.findFirst.mockResolvedValue(null);
    const { next } = await run(ctrl.startExam, { body: { exam_id: 1 } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('WB-SC-04: blocked without unlock_code → 403', async () => {
    prisma.examParticipant.findFirst.mockResolvedValue({ exam_participant_id: 1, is_blocked: true, exam_status: 'IN_PROGRESS', exam: baseExam });
    const { next } = await run(ctrl.startExam, { body: { exam_id: 1 } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  test('WB-SC-05: blocked with wrong unlock_code → 400', async () => {
    prisma.examParticipant.findFirst.mockResolvedValue({ exam_participant_id: 1, is_blocked: true, unlock_code: 'ABCDE', exam_status: 'IN_PROGRESS', exam: baseExam });
    const { next } = await run(ctrl.startExam, { body: { exam_id: 1, unlock_code: 'wrong' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-SC-06: already completed → 400', async () => {
    prisma.examParticipant.findFirst.mockResolvedValue({ exam_participant_id: 1, is_blocked: false, exam_status: 'COMPLETED', exam: baseExam });
    const { next } = await run(ctrl.startExam, { body: { exam_id: 1 } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-SC-07: before start time → 400', async () => {
    prisma.examParticipant.findFirst.mockResolvedValue({ exam_participant_id: 1, is_blocked: false, exam_status: 'NOT_STARTED', exam: { ...baseExam, start_date: future(HOUR), end_date: future(2 * HOUR) } });
    const { next } = await run(ctrl.startExam, { body: { exam_id: 1 } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-SC-08: no questions assigned → 400', async () => {
    prisma.examParticipant.findFirst.mockResolvedValue({ exam_participant_id: 1, is_blocked: false, exam_status: 'NOT_STARTED', exam: { ...baseExam, exam_questions: [] } });
    const { next } = await run(ctrl.startExam, { body: { exam_id: 1 } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-SC-09: NOT_STARTED → set IN_PROGRESS atomically, returns session state', async () => {
    prisma.examParticipant.findFirst.mockResolvedValue({ exam_participant_id: 1, is_blocked: false, exam_status: 'NOT_STARTED', start_time: null, exam: baseExam });
    prisma.examParticipant.updateMany.mockResolvedValue({ count: 1 });
    prisma.answer.findMany.mockResolvedValue([]);
    const { res } = await run(ctrl.startExam, { body: { exam_id: 1 } });
    expect(prisma.examParticipant.updateMany).toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload.exam_participant_id).toBe(1);
    expect(payload.total_questions).toBe(1);
    expect(typeof payload.remaining_seconds).toBe('number');
  });
});

// ─── prefetchExam ─────────────────────────────────────────────────────────────

describe('prefetchExam', () => {
  const examWithQuestions = {
    exam_id: 1, exam_name: 'UTS', subject: 'IPA', duration_minutes: 60,
    start_date: future(HOUR), end_date: future(2 * HOUR), is_shuffle_questions: false,
    access_password: 'PWD1234567',
    exam_questions: [
      { exam_question_id: 1, sequence: 1, score_weight: 10, question: { question_id: 1, question_type: 'SINGLE_CHOICE', question_text: 'Q', question_image: null, answer_options: [{ option_id: 1, label: 'A', option_text: 'a', is_correct: true }] } },
    ],
  };

  test('WB-SC-10: invalid examId → 400', async () => {
    const { next } = await run(ctrl.prefetchExam, { params: { examId: 'abc' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-SC-11: not registered → 404', async () => {
    prisma.examParticipant.findFirst.mockResolvedValue(null);
    const { next } = await run(ctrl.prefetchExam, { params: { examId: '1' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('WB-SC-12: exam already ended → 400', async () => {
    prisma.examParticipant.findFirst.mockResolvedValue({ exam_participant_id: 1, exam: { ...examWithQuestions, end_date: past(HOUR) } });
    const { next } = await run(ctrl.prefetchExam, { params: { examId: '1' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-SC-13: earlier than H-1 (no password) → 403', async () => {
    prisma.examParticipant.findFirst.mockResolvedValue({ exam_participant_id: 1, exam: { ...examWithQuestions, start_date: future(48 * HOUR), end_date: future(50 * HOUR), access_password: null } });
    const { next } = await run(ctrl.prefetchExam, { params: { examId: '1' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  test('WB-SC-14: valid → returns encrypted package (success envelope)', async () => {
    prisma.examParticipant.findFirst.mockResolvedValue({ exam_participant_id: 1, exam: examWithQuestions });
    const { res } = await run(ctrl.prefetchExam, { params: { examId: '1' } });
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.data.encrypted).toEqual(expect.objectContaining({ v: 1, ciphertext: expect.any(String) }));
    expect(payload.data.total_questions).toBe(1);
  });
});

// ─── submitAnswer ─────────────────────────────────────────────────────────────

describe('submitAnswer', () => {
  const makeParticipant = (question) => ({
    exam_participant_id: 1, is_blocked: false, start_time: past(5 * 60 * 1000),
    exam: { duration_minutes: 60, end_date: future(HOUR), exam_questions: [{ question }] },
  });

  test('WB-SC-15: missing fields → 400', async () => {
    const { next } = await run(ctrl.submitAnswer, { body: { exam_participant_id: 1 } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-SC-16: participant invalid/finished → 404', async () => {
    prisma.examParticipant.findFirst.mockResolvedValue(null);
    const { next } = await run(ctrl.submitAnswer, { body: { exam_participant_id: 1, question_id: 1 } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('WB-SC-17: time expired → 400', async () => {
    prisma.examParticipant.findFirst.mockResolvedValue({
      exam_participant_id: 1, is_blocked: false, start_time: past(2 * HOUR),
      exam: { duration_minutes: 60, end_date: past(HOUR), exam_questions: [{ question: { question_type: 'ESSAY', answer_options: [] } }] },
    });
    const { next } = await run(ctrl.submitAnswer, { body: { exam_participant_id: 1, question_id: 1, essay_answer_text: 'x' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-SC-18: blocked participant → 403', async () => {
    prisma.examParticipant.findFirst.mockResolvedValue({ ...makeParticipant({ question_type: 'ESSAY', answer_options: [] }), is_blocked: true });
    const { next } = await run(ctrl.submitAnswer, { body: { exam_participant_id: 1, question_id: 1, essay_answer_text: 'x' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  test('WB-SC-19: empty answer → deletes existing, returns null', async () => {
    prisma.examParticipant.findFirst.mockResolvedValue(makeParticipant({ question_type: 'ESSAY', answer_options: [] }));
    prisma.answer.deleteMany.mockResolvedValue({});
    const { res } = await run(ctrl.submitAnswer, { body: { exam_participant_id: 1, question_id: 1, essay_answer_text: '  ' } });
    expect(prisma.answer.deleteMany).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ answer: null }));
  });

  test('WB-SC-20: SINGLE_CHOICE correct option → is_correct true, upsert', async () => {
    prisma.examParticipant.findFirst.mockResolvedValue(makeParticipant({
      question_type: 'SINGLE_CHOICE',
      answer_options: [{ option_id: 1, is_correct: true }, { option_id: 2, is_correct: false }],
    }));
    prisma.answer.upsert.mockResolvedValue({ answer_id: 1, is_correct: true });
    const { res } = await run(ctrl.submitAnswer, { body: { exam_participant_id: 1, question_id: 1, mc_option_ids: [1] } });
    expect(prisma.answer.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ is_correct: true, mc_option_ids: '1' }) })
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('disimpan') }));
  });

  test('WB-SC-21: MULTIPLE_CHOICE exact match → is_correct true', async () => {
    prisma.examParticipant.findFirst.mockResolvedValue(makeParticipant({
      question_type: 'MULTIPLE_CHOICE',
      answer_options: [{ option_id: 1, is_correct: true }, { option_id: 2, is_correct: true }, { option_id: 3, is_correct: false }],
    }));
    prisma.answer.upsert.mockResolvedValue({});
    await run(ctrl.submitAnswer, { body: { exam_participant_id: 1, question_id: 1, mc_option_ids: [2, 1] } });
    expect(prisma.answer.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ is_correct: true }) })
    );
  });

  test('WB-SC-22: MULTIPLE_CHOICE partial selection → is_correct false', async () => {
    prisma.examParticipant.findFirst.mockResolvedValue(makeParticipant({
      question_type: 'MULTIPLE_CHOICE',
      answer_options: [{ option_id: 1, is_correct: true }, { option_id: 2, is_correct: true }],
    }));
    prisma.answer.upsert.mockResolvedValue({});
    await run(ctrl.submitAnswer, { body: { exam_participant_id: 1, question_id: 1, mc_option_ids: [1] } });
    expect(prisma.answer.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ is_correct: false }) })
    );
  });
});

// ─── finishExam ───────────────────────────────────────────────────────────────

describe('finishExam', () => {
  test('WB-SC-23: missing exam_participant_id → 400', async () => {
    const { next } = await run(ctrl.finishExam, { body: {} });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-SC-24: nothing updated + blocked → 403', async () => {
    prisma.examParticipant.updateMany.mockResolvedValue({ count: 0 });
    prisma.examParticipant.findFirst.mockResolvedValue({ is_blocked: true, exam_status: 'IN_PROGRESS' });
    const { next } = await run(ctrl.finishExam, { body: { exam_participant_id: 1 } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  test('WB-SC-25: nothing updated + not blocked → 400', async () => {
    prisma.examParticipant.updateMany.mockResolvedValue({ count: 0 });
    prisma.examParticipant.findFirst.mockResolvedValue({ is_blocked: false, exam_status: 'COMPLETED' });
    const { next } = await run(ctrl.finishExam, { body: { exam_participant_id: 1 } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-SC-26: valid, no essay → score saved + status GRADED', async () => {
    prisma.examParticipant.updateMany.mockResolvedValue({ count: 1 });
    prisma.examParticipant.findUnique.mockResolvedValue({
      exam: { exam_id: 1, exam_name: 'UTS', exam_questions: [{ question_id: 1, score_weight: 10 }] },
      answers: [{ question_id: 1, is_correct: true, mc_option_ids: null, manual_score: null, question: { question_type: 'SINGLE_CHOICE', answer_options: [] } }],
    });
    prisma.examResult.upsert.mockResolvedValue({});
    prisma.examParticipant.update.mockResolvedValue({});
    const { res } = await run(ctrl.finishExam, { body: { exam_participant_id: 1 } });
    expect(prisma.examResult.upsert).toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload.result.status).toBe('GRADED');
    expect(payload.result.final_score).toBe(100);
  });

  test('WB-SC-27: valid, ungraded essay → status COMPLETED', async () => {
    prisma.examParticipant.updateMany.mockResolvedValue({ count: 1 });
    prisma.examParticipant.findUnique.mockResolvedValue({
      exam: { exam_id: 1, exam_name: 'UTS', exam_questions: [{ question_id: 1, score_weight: 10 }] },
      answers: [{ question_id: 1, is_correct: null, mc_option_ids: null, manual_score: null, question: { question_type: 'ESSAY', answer_options: [] } }],
    });
    prisma.examResult.upsert.mockResolvedValue({});
    const { res } = await run(ctrl.finishExam, { body: { exam_participant_id: 1 } });
    expect(res.json.mock.calls[0][0].result.status).toBe('COMPLETED');
  });
});

// ─── reportViolation ──────────────────────────────────────────────────────────

describe('reportViolation', () => {
  test('WB-SC-28: missing fields → 400', async () => {
    const { next } = await run(ctrl.reportViolation, { body: { exam_participant_id: 1 } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-SC-29: violation_type too long → 400', async () => {
    const { next } = await run(ctrl.reportViolation, { body: { exam_participant_id: 1, violation_type: 'x'.repeat(101) } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-SC-30: details too long → 400', async () => {
    const { next } = await run(ctrl.reportViolation, { body: { exam_participant_id: 1, violation_type: 'TAB_SWITCH', details: 'd'.repeat(501) } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-SC-31: participant not found → 404', async () => {
    prisma.examParticipant.findFirst.mockResolvedValue(null);
    const { next } = await run(ctrl.reportViolation, { body: { exam_participant_id: 1, violation_type: 'TAB_SWITCH' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('WB-SC-32: valid → blocks participant, returns is_blocked true', async () => {
    prisma.examParticipant.findFirst.mockResolvedValue({ exam_participant_id: 1 });
    prisma.examParticipant.update.mockResolvedValue({});
    const { res } = await run(ctrl.reportViolation, { body: { exam_participant_id: 1, violation_type: 'TAB_SWITCH', details: 'x' } });
    expect(prisma.examParticipant.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ is_blocked: true }) })
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ is_blocked: true }));
  });
});
