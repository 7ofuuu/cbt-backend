/**
 * White Box Test: Exam Result Controller
 * WB-19
 * Target: src/controllers/examResultController.js
 */
jest.mock('../../src/config/db');
jest.mock('../../src/services/scoreService', () => ({
  calculateAndSaveResult: jest.fn(),
}));
jest.mock('../../src/services/activityLogService', () => ({
  logFromRequest: jest.fn().mockResolvedValue(undefined),
}));

const prisma = require('../../src/config/db');
const { calculateAndSaveResult } = require('../../src/services/scoreService');
const ctrl = require('../../src/controllers/examResultController');

const coord = { teacher_id: 1, full_name: 'Koor', subject: 'IPA', is_coordinator: true };
const reg = { teacher_id: 2, full_name: 'Guru', subject: 'IPA', is_coordinator: false };
const student = { student_id: 1 };

const makeReqRes = (overrides = {}) => {
  const req = { body: {}, params: {}, query: {}, user: { id: 1 }, headers: {}, teacher: coord, student, ...overrides };
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

beforeEach(() => jest.clearAllMocks());

// ─── getResultByParticipant ───────────────────────────────────────────────────

describe('getResultByParticipant', () => {
  test('WB-ER-01: not found → 404', async () => {
    prisma.examResult.findUnique.mockResolvedValue(null);
    const { next } = await run(ctrl.getResultByParticipant, { params: { exam_participant_id: '1' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('WB-ER-02: regular teacher, foreign subject → 403', async () => {
    prisma.examResult.findUnique.mockResolvedValue({ exam_participant: { exam: { subject: 'Fisika' } } });
    const { next } = await run(ctrl.getResultByParticipant, { params: { exam_participant_id: '1' }, teacher: reg });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  test('WB-ER-03: found + access ok → returns result', async () => {
    prisma.examResult.findUnique.mockResolvedValue({ exam_participant: { exam: { subject: 'IPA' } } });
    const { res } = await run(ctrl.getResultByParticipant, { params: { exam_participant_id: '1' } });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ result: expect.any(Object) }));
  });
});

// ─── getResultByExam ──────────────────────────────────────────────────────────

describe('getResultByExam', () => {
  test('WB-ER-04: exam not found → 404', async () => {
    prisma.exam.findUnique.mockResolvedValue(null);
    const { next } = await run(ctrl.getResultByExam, { params: { exam_id: '1' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('WB-ER-05: valid → paginated results', async () => {
    prisma.exam.findUnique.mockResolvedValue({ exam_id: 1, subject: 'IPA' });
    prisma.examResult.findMany.mockResolvedValue([{ exam_result_id: 1 }]);
    prisma.examResult.count.mockResolvedValue(1);
    const { res } = await run(ctrl.getResultByExam, { params: { exam_id: '1' } });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ pagination: expect.objectContaining({ total: 1 }) }));
  });
});

// ─── getMyResults ─────────────────────────────────────────────────────────────

describe('getMyResults', () => {
  const HOUR = 60 * 60 * 1000;

  test('WB-ER-06: exam not yet ended → score hidden (EXAM_NOT_ENDED)', async () => {
    prisma.examResult.findMany.mockResolvedValue([
      { exam_result_id: 1, final_score: 90, submit_date: new Date(), exam_participant: { exam_status: 'GRADED', exam: { end_date: new Date(Date.now() + HOUR) } } },
    ]);
    prisma.examParticipant.findMany.mockResolvedValue([]);
    const { res } = await run(ctrl.getMyResults);
    const r = res.json.mock.calls[0][0].results[0];
    expect(r.final_score).toBeNull();
    expect(r.score_hidden_reason).toBe('EXAM_NOT_ENDED');
  });

  test('WB-ER-07: ended but COMPLETED (essay ungraded) → score hidden (ESSAY_NOT_GRADED)', async () => {
    prisma.examResult.findMany.mockResolvedValue([
      { exam_result_id: 1, final_score: 90, submit_date: new Date(), exam_participant: { exam_status: 'COMPLETED', exam: { end_date: new Date(Date.now() - HOUR) } } },
    ]);
    prisma.examParticipant.findMany.mockResolvedValue([]);
    const { res } = await run(ctrl.getMyResults);
    const r = res.json.mock.calls[0][0].results[0];
    expect(r.score_hidden_reason).toBe('ESSAY_NOT_GRADED');
  });

  test('WB-ER-08: ended + GRADED → score visible', async () => {
    prisma.examResult.findMany.mockResolvedValue([
      { exam_result_id: 1, final_score: 90, submit_date: new Date(), exam_participant: { exam_status: 'GRADED', exam: { end_date: new Date(Date.now() - HOUR) } } },
    ]);
    prisma.examParticipant.findMany.mockResolvedValue([]);
    const { res } = await run(ctrl.getMyResults);
    expect(res.json.mock.calls[0][0].results[0].final_score).toBe(90);
  });

  test('WB-ER-09: expired-not-attempted exams are merged in as NOT_ATTEMPTED', async () => {
    prisma.examResult.findMany.mockResolvedValue([]);
    prisma.examParticipant.findMany.mockResolvedValue([
      { exam_participant_id: 5, student_id: 1, exam_id: 3, exam: { exam_id: 3, exam_name: 'X', end_date: new Date(Date.now() - HOUR) } },
    ]);
    const { res } = await run(ctrl.getMyResults);
    const r = res.json.mock.calls[0][0].results[0];
    expect(r.exam_participant.exam_status).toBe('NOT_ATTEMPTED');
  });
});

// ─── calculateAndSaveResult handler ──────────────────────────────────────────

describe('calculateAndSaveResult handler', () => {
  test('WB-ER-10: missing exam_participant_id → 400', async () => {
    const { next } = await run(ctrl.calculateAndSaveResult, { body: {} });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-ER-11: participant not found → 404', async () => {
    prisma.examParticipant.findUnique.mockResolvedValue(null);
    const { next } = await run(ctrl.calculateAndSaveResult, { body: { exam_participant_id: 5 } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('WB-ER-12: foreign subject (regular teacher) → 403', async () => {
    prisma.examParticipant.findUnique.mockResolvedValue({ exam: { subject: 'Fisika' } });
    const { next } = await run(ctrl.calculateAndSaveResult, { body: { exam_participant_id: 5 }, teacher: reg });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  test('WB-ER-13: valid → calls service, logs, returns result', async () => {
    prisma.examParticipant.findUnique.mockResolvedValue({ exam: { exam_id: 1, exam_name: 'UTS', subject: 'IPA' } });
    calculateAndSaveResult.mockResolvedValue({ finalScore: 80, totalScore: 32, totalWeight: 40, status: 'GRADED' });
    const { res } = await run(ctrl.calculateAndSaveResult, { body: { exam_participant_id: 5 } });
    expect(calculateAndSaveResult).toHaveBeenCalledWith(5);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ result: expect.objectContaining({ final_score: 80 }) }));
  });
});

// ─── updateManualScore ────────────────────────────────────────────────────────

describe('updateManualScore', () => {
  test('WB-ER-14: missing answer_id → 400', async () => {
    const { next } = await run(ctrl.updateManualScore, { body: { manual_score: 50 } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-ER-15: score out of range → 400', async () => {
    const { next } = await run(ctrl.updateManualScore, { body: { answer_id: 1, manual_score: -5 } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-ER-16: answer not found → 404', async () => {
    prisma.answer.findUnique.mockResolvedValue(null);
    const { next } = await run(ctrl.updateManualScore, { body: { answer_id: 1, manual_score: 80 } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('WB-ER-17: valid → updates, recalculates, returns new score/status', async () => {
    prisma.answer.findUnique.mockResolvedValue({ answer_id: 1, exam_participant_id: 5, exam_participant: { exam: { exam_id: 1, subject: 'IPA' } } });
    prisma.answer.update.mockResolvedValue({ answer_id: 1, manual_score: 80 });
    calculateAndSaveResult.mockResolvedValue({ finalScore: 88, status: 'GRADED' });
    const { res } = await run(ctrl.updateManualScore, { body: { answer_id: 1, manual_score: 80 } });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ recalculated: { final_score: 88, status: 'GRADED' } }));
  });
});

// ─── getDetailedResult ────────────────────────────────────────────────────────

describe('getDetailedResult', () => {
  test('WB-ER-18: no result + no participant → 404', async () => {
    prisma.examResult.findUnique.mockResolvedValue(null);
    prisma.examParticipant.findUnique.mockResolvedValue(null);
    const { next } = await run(ctrl.getDetailedResult, { params: { exam_participant_id: '1' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('WB-ER-19: fallback to participant when no result yet → review with score 0', async () => {
    prisma.examResult.findUnique.mockResolvedValue(null);
    prisma.examParticipant.findUnique.mockResolvedValue({
      exam_status: 'IN_PROGRESS', student: { student_id: 1 },
      exam: { exam_id: 1, exam_name: 'UTS', subject: 'IPA', exam_questions: [{ question_id: 1, sequence: 1, score_weight: 10, question: { question_id: 1, answer_options: [] } }] },
      answers: [],
    });
    const { res } = await run(ctrl.getDetailedResult, { params: { exam_participant_id: '1' } });
    const payload = res.json.mock.calls[0][0];
    expect(payload.exam_result).toBeNull();
    expect(payload.review[0].score_obtained).toBe(0);
  });

  test('WB-ER-20: result exists → SINGLE_CHOICE correct earns full weight', async () => {
    prisma.examResult.findUnique.mockResolvedValue({
      exam_result_id: 9, final_score: 100, submit_date: new Date(),
      exam_participant: {
        exam_status: 'GRADED', student: { student_id: 1 },
        exam: { exam_id: 1, exam_name: 'UTS', subject: 'IPA', exam_questions: [{ question_id: 1, sequence: 1, score_weight: 10, question: { question_id: 1, question_type: 'SINGLE_CHOICE', answer_options: [] } }] },
        answers: [{ question_id: 1, is_correct: true, mc_option_ids: null }],
      },
    });
    const { res } = await run(ctrl.getDetailedResult, { params: { exam_participant_id: '1' } });
    expect(res.json.mock.calls[0][0].review[0].score_obtained).toBe(10);
  });

  test('WB-ER-21: result exists → MULTIPLE_CHOICE partial scoring', async () => {
    prisma.examResult.findUnique.mockResolvedValue({
      exam_result_id: 9, final_score: 50, submit_date: new Date(),
      exam_participant: {
        exam_status: 'GRADED', student: { student_id: 1 },
        exam: { exam_id: 1, exam_name: 'UTS', subject: 'IPA', exam_questions: [{ question_id: 1, sequence: 1, score_weight: 20, question: { question_id: 1, question_type: 'MULTIPLE_CHOICE', answer_options: [{ option_id: 1, is_correct: true }, { option_id: 2, is_correct: true }] } }] },
        answers: [{ question_id: 1, is_correct: false, mc_option_ids: '1' }], // 1 of 2 correct, 0 wrong → 0.5 * 20 = 10
      },
    });
    const { res } = await run(ctrl.getDetailedResult, { params: { exam_participant_id: '1' } });
    expect(res.json.mock.calls[0][0].review[0].score_obtained).toBe(10);
  });
});

// ─── getCompletedExams / getArchivedExams ─────────────────────────────────────

describe('getCompletedExams', () => {
  test('WB-ER-22: filters ENDED + not submitted, returns formatted list', async () => {
    prisma.exam.findMany.mockResolvedValue([
      { exam_id: 1, exam_name: 'UTS', subject: 'IPA', grade_level: '10', major: 'IPA', start_date: 's', end_date: 'e', duration_minutes: 60, exam_status: 'ENDED', teacher: { teacher_id: 1, full_name: 'G' }, _count: { exam_participants: 2, exam_questions: 5 }, exam_participants: [] },
    ]);
    prisma.exam.count.mockResolvedValue(1);
    const { res } = await run(ctrl.getCompletedExams);
    const arg = prisma.exam.findMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({ exam_status: 'ENDED', teacher_submitted_at: null });
    expect(res.json.mock.calls[0][0].pagination.total).toBe(1);
  });
});

describe('getArchivedExams', () => {
  test('WB-ER-23: filters ENDED + submitted, includes teacher_submitted_at', async () => {
    prisma.exam.findMany.mockResolvedValue([
      { exam_id: 1, exam_name: 'UTS', subject: 'IPA', grade_level: '10', major: 'IPA', start_date: 's', end_date: 'e', teacher_submitted_at: 'ts', teacher: { teacher_id: 1, full_name: 'G' }, _count: { exam_participants: 2, exam_questions: 5 }, exam_participants: [] },
    ]);
    prisma.exam.count.mockResolvedValue(1);
    const { res } = await run(ctrl.getArchivedExams);
    const arg = prisma.exam.findMany.mock.calls[0][0];
    expect(arg.where.teacher_submitted_at).toEqual({ not: null });
    expect(res.json.mock.calls[0][0].data[0].teacher_submitted_at).toBe('ts');
  });
});

// ─── submitExam ───────────────────────────────────────────────────────────────

describe('submitExam', () => {
  test('WB-ER-24: not found → 404', async () => {
    prisma.exam.findUnique.mockResolvedValue(null);
    const { next } = await run(ctrl.submitExam, { params: { examId: '1' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('WB-ER-25: not ENDED → 400', async () => {
    prisma.exam.findUnique.mockResolvedValue({ exam_id: 1, exam_status: 'ONGOING', teacher_submitted_at: null, subject: 'IPA' });
    const { next } = await run(ctrl.submitExam, { params: { examId: '1' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-ER-26: already submitted → 400', async () => {
    prisma.exam.findUnique.mockResolvedValue({ exam_id: 1, exam_status: 'ENDED', teacher_submitted_at: new Date(), subject: 'IPA' });
    const { next } = await run(ctrl.submitExam, { params: { examId: '1' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-ER-27: valid → archives exam', async () => {
    prisma.exam.findUnique.mockResolvedValue({ exam_id: 1, exam_status: 'ENDED', teacher_submitted_at: null, subject: 'IPA' });
    prisma.exam.update.mockResolvedValue({});
    const { res } = await run(ctrl.submitExam, { params: { examId: '1' } });
    expect(prisma.exam.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ teacher_submitted_at: expect.any(Date) }) }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});
