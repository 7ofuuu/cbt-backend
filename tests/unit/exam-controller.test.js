/**
 * White Box Test: Exam Controller (CRUD + question/bank management)
 * WB-20
 * Target: src/controllers/examController.js
 *   createExam, getExams, getExamById, updateExam, deleteExam,
 *   assignQuestionToExam, assignBankToExam, removeMultipleQuestions,
 *   removeBankFromExam, clearAllQuestions, getQuestionsByBank,
 *   updateWeightMultiple, removeQuestionFromExam
 * (assignStudentToExam + reassignStudents covered by WB-5 / exam-assign.test.js)
 */
jest.mock('../../src/config/db');
jest.mock('../../src/services/activityLogService', () => ({
  logFromRequest: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/services/taxonomyValidationService', () => ({
  loadActiveTaxonomy: jest.fn().mockResolvedValue({ subjects: new Set(), gradeLevels: new Set(), majors: new Set() }),
  assertExamTaxonomy: jest.fn(),
}));

const prisma = require('../../src/config/db');
const ctrl = require('../../src/controllers/examController');

const coord = { teacher_id: 1, full_name: 'Koor', subject: 'IPA', is_coordinator: true };
const reg = { teacher_id: 2, full_name: 'Guru', subject: 'IPA', is_coordinator: false };

const makeReqRes = (overrides = {}) => {
  const req = { body: {}, params: {}, query: {}, user: { id: 1 }, headers: {}, teacher: coord, ...overrides };
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

beforeEach(() => {
  jest.clearAllMocks();
  prisma.$transaction.mockImplementation((fn) => (typeof fn === 'function' ? fn(prisma) : Promise.all(fn)));
});

// ─── createExam ───────────────────────────────────────────────────────────────

describe('createExam', () => {
  const validBody = { exam_name: 'UTS', grade_level: '10', start_date: '2026-01-01T08:00:00Z', end_date: '2026-01-01T10:00:00Z', duration_minutes: 60 };

  test('WB-EX-01: missing required fields → 400', async () => {
    const { next } = await run(ctrl.createExam, { body: { exam_name: 'X' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-EX-02: invalid duration → 400', async () => {
    const { next } = await run(ctrl.createExam, { body: { ...validBody, duration_minutes: 0 } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-EX-03: end_date not after start_date → 400', async () => {
    const { next } = await run(ctrl.createExam, { body: { ...validBody, end_date: '2026-01-01T07:00:00Z' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-EX-04: valid → 201, auto-assigns matching students', async () => {
    prisma.exam.create.mockResolvedValue({ exam_id: 1, exam_name: 'UTS' });
    prisma.student.findMany.mockResolvedValue([{ student_id: 1 }, { student_id: 2 }]);
    prisma.examParticipant.createMany.mockResolvedValue({ count: 2 });
    const { res } = await run(ctrl.createExam, { body: validBody });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ auto_assigned_students: 2 }));
  });
});

// ─── getExams / getExamById ───────────────────────────────────────────────────

describe('getExams', () => {
  test('WB-EX-05: returns paginated exams', async () => {
    prisma.exam.findMany.mockResolvedValue([{ exam_id: 1 }]);
    prisma.exam.count.mockResolvedValue(1);
    const { res } = await run(ctrl.getExams);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ pagination: expect.objectContaining({ total: 1 }) }));
  });
});

describe('getExamById', () => {
  test('WB-EX-06: not found → 404', async () => {
    prisma.exam.findUnique.mockResolvedValue(null);
    const { next } = await run(ctrl.getExamById, { params: { id: '1' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('WB-EX-07: regular teacher, foreign subject → 403', async () => {
    prisma.exam.findUnique.mockResolvedValue({ exam_id: 1, subject: 'Fisika' });
    const { next } = await run(ctrl.getExamById, { params: { id: '1' }, teacher: reg });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  test('WB-EX-08: valid → returns exam', async () => {
    prisma.exam.findUnique.mockResolvedValue({ exam_id: 1, subject: 'IPA' });
    const { res } = await run(ctrl.getExamById, { params: { id: '1' } });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ exam: expect.objectContaining({ exam_id: 1 }) }));
  });
});

// ─── updateExam ───────────────────────────────────────────────────────────────

describe('updateExam', () => {
  test('WB-EX-09: not found → 404', async () => {
    prisma.exam.findUnique.mockResolvedValue(null);
    const { next } = await run(ctrl.updateExam, { params: { id: '1' }, body: {} });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('WB-EX-10: ONGOING exam → guardExamStatus 400', async () => {
    prisma.exam.findUnique.mockResolvedValue({ exam_id: 1, subject: 'IPA', exam_status: 'ONGOING' });
    const { next } = await run(ctrl.updateExam, { params: { id: '1' }, body: { exam_name: 'X' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-EX-11: non-coordinator changing subject → 403', async () => {
    prisma.exam.findUnique.mockResolvedValue({ exam_id: 1, subject: 'IPA', exam_status: 'SCHEDULED', start_date: new Date(), end_date: new Date() });
    const { next } = await run(ctrl.updateExam, { params: { id: '1' }, body: { subject: 'Fisika' }, teacher: reg });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  test('WB-EX-12: end_date not after start_date → 400', async () => {
    prisma.exam.findUnique.mockResolvedValue({ exam_id: 1, subject: 'IPA', exam_status: 'SCHEDULED' });
    const { next } = await run(ctrl.updateExam, { params: { id: '1' }, body: { start_date: '2026-01-02T10:00:00Z', end_date: '2026-01-02T09:00:00Z' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-EX-13: valid → 200', async () => {
    prisma.exam.findUnique.mockResolvedValue({ exam_id: 1, subject: 'IPA', exam_status: 'SCHEDULED' });
    prisma.exam.update.mockResolvedValue({ exam_id: 1, exam_name: 'Baru' });
    const { res } = await run(ctrl.updateExam, { params: { id: '1' }, body: { exam_name: 'Baru' } });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('diperbarui') }));
  });
});

// ─── deleteExam ───────────────────────────────────────────────────────────────

describe('deleteExam', () => {
  test('WB-EX-14: ONGOING exam → 400', async () => {
    prisma.exam.findUnique.mockResolvedValue({ exam_id: 1, subject: 'IPA', exam_status: 'ONGOING' });
    const { next } = await run(ctrl.deleteExam, { params: { id: '1' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-EX-15: valid → cascading delete in transaction', async () => {
    prisma.exam.findUnique.mockResolvedValue({ exam_id: 1, subject: 'IPA', exam_status: 'SCHEDULED', exam_name: 'UTS' });
    prisma.answer.deleteMany.mockResolvedValue({});
    prisma.examResult.deleteMany.mockResolvedValue({});
    prisma.examParticipant.deleteMany.mockResolvedValue({});
    prisma.examQuestion.deleteMany.mockResolvedValue({});
    prisma.exam.delete.mockResolvedValue({});
    const { res } = await run(ctrl.deleteExam, { params: { id: '1' } });
    expect(prisma.exam.delete).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('dihapus') }));
  });
});

// ─── assignQuestionToExam ─────────────────────────────────────────────────────

describe('assignQuestionToExam', () => {
  const exam = { exam_id: 1, subject: 'IPA', grade_level: '10', major: null, exam_status: 'SCHEDULED', exam_questions: [] };

  test('WB-EX-16: missing ids → 400', async () => {
    const { next } = await run(ctrl.assignQuestionToExam, { body: { exam_id: 1 } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-EX-17: question not found → 404', async () => {
    prisma.exam.findUnique.mockResolvedValue(exam);
    prisma.question.findUnique.mockResolvedValue(null);
    const { next } = await run(ctrl.assignQuestionToExam, { body: { exam_id: 1, question_id: 5 } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('WB-EX-18: question grade mismatch → 400', async () => {
    prisma.exam.findUnique.mockResolvedValue(exam);
    prisma.question.findUnique.mockResolvedValue({ question_id: 5, subject: 'IPA', grade_level: '11', major: null });
    const { next } = await run(ctrl.assignQuestionToExam, { body: { exam_id: 1, question_id: 5 } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-EX-19: valid → 201, sequence incremented', async () => {
    prisma.exam.findUnique.mockResolvedValue({ ...exam, exam_questions: [{ sequence: 3 }] });
    prisma.question.findUnique.mockResolvedValue({ question_id: 5, subject: 'IPA', grade_level: '10', major: null });
    prisma.examQuestion.create.mockResolvedValue({ exam_question_id: 9, sequence: 4 });
    const { res } = await run(ctrl.assignQuestionToExam, { body: { exam_id: 1, question_id: 5 } });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(prisma.examQuestion.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sequence: 4 }) }));
  });
});

// ─── assignBankToExam ─────────────────────────────────────────────────────────

describe('assignBankToExam', () => {
  const exam = { exam_id: 1, subject: 'IPA', grade_level: '10', major: null, exam_status: 'SCHEDULED', exam_questions: [] };
  const bank = { question_bank_id: 2, subject: 'IPA', grade_level: '10', major: null };

  test('WB-EX-20: missing ids → 400', async () => {
    const { next } = await run(ctrl.assignBankToExam, { body: { exam_id: 1 } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-EX-21: bank not found → 404', async () => {
    prisma.exam.findUnique.mockResolvedValue(exam);
    prisma.questionBank.findUnique.mockResolvedValue(null);
    const { next } = await run(ctrl.assignBankToExam, { body: { exam_id: 1, question_bank_id: 2 } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('WB-EX-22: no questions in bank → 404', async () => {
    prisma.exam.findUnique.mockResolvedValue(exam);
    prisma.questionBank.findUnique.mockResolvedValue(bank);
    prisma.question.findMany.mockResolvedValue([]);
    const { next } = await run(ctrl.assignBankToExam, { body: { exam_id: 1, question_bank_id: 2 } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('WB-EX-23: valid with max_questions limit → 201', async () => {
    prisma.exam.findUnique.mockResolvedValue(exam);
    prisma.questionBank.findUnique.mockResolvedValue(bank);
    prisma.question.findMany.mockResolvedValue([{ question_id: 1 }, { question_id: 2 }, { question_id: 3 }]);
    prisma.examQuestion.createMany.mockResolvedValue({ count: 2 });
    const { res } = await run(ctrl.assignBankToExam, { body: { exam_id: 1, question_bank_id: 2, max_questions: 2 } });
    expect(res.status).toHaveBeenCalledWith(201);
    const createArg = prisma.examQuestion.createMany.mock.calls[0][0];
    expect(createArg.data).toHaveLength(2);
  });
});

// ─── remove/clear question helpers ────────────────────────────────────────────

describe('removeMultipleQuestions', () => {
  test('WB-EX-24: missing/empty ids → 400', async () => {
    const { next } = await run(ctrl.removeMultipleQuestions, { body: { exam_id: 1, exam_question_ids: [] } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-EX-25: valid → deletes and reports count', async () => {
    prisma.exam.findUnique.mockResolvedValue({ exam_id: 1, subject: 'IPA', exam_status: 'SCHEDULED' });
    prisma.examQuestion.deleteMany.mockResolvedValue({ count: 3 });
    const { res } = await run(ctrl.removeMultipleQuestions, { body: { exam_id: 1, exam_question_ids: [1, 2, 3] } });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('3') }));
  });
});

describe('removeBankFromExam', () => {
  test('WB-EX-26: valid → removes bank questions', async () => {
    prisma.exam.findUnique.mockResolvedValue({ exam_id: 1, subject: 'IPA', exam_status: 'SCHEDULED' });
    prisma.question.findMany.mockResolvedValue([{ question_id: 1 }, { question_id: 2 }]);
    prisma.examQuestion.deleteMany.mockResolvedValue({ count: 2 });
    const { res } = await run(ctrl.removeBankFromExam, { body: { exam_id: 1, question_bank_id: 2 } });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('2') }));
  });
});

describe('clearAllQuestions', () => {
  test('WB-EX-27: valid → clears all', async () => {
    prisma.exam.findUnique.mockResolvedValue({ exam_id: 1, subject: 'IPA', exam_status: 'SCHEDULED' });
    prisma.examQuestion.deleteMany.mockResolvedValue({ count: 5 });
    const { res } = await run(ctrl.clearAllQuestions, { params: { id: '1' } });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('5') }));
  });
});

describe('getQuestionsByBank handler', () => {
  test('WB-EX-28: valid → returns grouped questions', async () => {
    prisma.exam.findUnique
      .mockResolvedValueOnce({ exam_id: 1, subject: 'IPA' }) // getExamOrFail (no include)
      .mockResolvedValueOnce({ exam_id: 1, exam_name: 'UTS', exam_questions: [] }); // service getExamOrFail
    const { res } = await run(ctrl.getQuestionsByBank, { params: { id: '1' } });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ banks: expect.any(Array) }));
  });
});

describe('updateWeightMultiple', () => {
  test('WB-EX-29: missing exam_id → 400', async () => {
    const { next } = await run(ctrl.updateWeightMultiple, { body: { updates: [] } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-EX-30: valid → batch updates weights', async () => {
    prisma.exam.findUnique.mockResolvedValue({ exam_id: 1, subject: 'IPA', exam_status: 'SCHEDULED' });
    prisma.examQuestion.update.mockResolvedValue({});
    const { res } = await run(ctrl.updateWeightMultiple, { body: { exam_id: 1, updates: [{ exam_question_id: 1, score_weight: 5 }] } });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('1') }));
  });
});

describe('removeQuestionFromExam', () => {
  test('WB-EX-31: question not in exam → 404', async () => {
    prisma.exam.findUnique.mockResolvedValue({ exam_id: 1, subject: 'IPA', exam_status: 'SCHEDULED' });
    prisma.examQuestion.deleteMany.mockResolvedValue({ count: 0 });
    const { next } = await run(ctrl.removeQuestionFromExam, { params: { examId: '1', questionId: '9' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('WB-EX-32: valid → removes question', async () => {
    prisma.exam.findUnique.mockResolvedValue({ exam_id: 1, subject: 'IPA', exam_status: 'SCHEDULED' });
    prisma.examQuestion.deleteMany.mockResolvedValue({ count: 1 });
    const { res } = await run(ctrl.removeQuestionFromExam, { params: { examId: '1', questionId: '9' } });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('dihapus') }));
  });
});
