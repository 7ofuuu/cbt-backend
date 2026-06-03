/**
 * White Box Test: Question Controller
 * WB-17
 * Target: src/controllers/questionController.js
 *   question bank CRUD, question CRUD, listing, assign bank to exam
 */
jest.mock('../../src/config/db');
jest.mock('../../src/services/activityLogService', () => ({
  logFromRequest: jest.fn().mockResolvedValue(undefined),
}));

const prisma = require('../../src/config/db');
const ctrl = require('../../src/controllers/questionController');

const coord = { teacher_id: 1, full_name: 'Koor', subject: 'IPA', is_coordinator: true };
const reg = { teacher_id: 2, full_name: 'Guru', subject: 'IPA', is_coordinator: false };

const makeReqRes = (overrides = {}) => {
  const req = { body: {}, params: {}, query: {}, user: { id: 1 }, headers: {}, teacher: reg, ...overrides };
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

// ─── createQuestionBank ───────────────────────────────────────────────────────

describe('createQuestionBank', () => {
  test('WB-QC-01: missing bank_name/grade_level → 400', async () => {
    const { next } = await run(ctrl.createQuestionBank, { body: { bank_name: 'A' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-QC-02: duplicate bank name → 409', async () => {
    prisma.questionBank.findUnique.mockResolvedValue({ question_bank_id: 9 });
    const { next } = await run(ctrl.createQuestionBank, { body: { bank_name: 'A', grade_level: '10' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 409 }));
  });

  test('WB-QC-03: valid → 201, subject derived from teacher', async () => {
    prisma.questionBank.findUnique.mockResolvedValue(null);
    prisma.questionBank.create.mockResolvedValue({ question_bank_id: 5, bank_name: 'A', subject: 'IPA' });
    const { res } = await run(ctrl.createQuestionBank, { body: { bank_name: 'A', grade_level: '10' } });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(prisma.questionBank.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ subject: 'IPA', teacher_id: 2 }) })
    );
  });
});

// ─── updateQuestionBank ───────────────────────────────────────────────────────

describe('updateQuestionBank', () => {
  test('WB-QC-04: not found → 404', async () => {
    prisma.questionBank.findUnique.mockResolvedValue(null);
    const { next } = await run(ctrl.updateQuestionBank, { params: { id: '1' }, body: {} });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('WB-QC-05: regular teacher, foreign subject → 403', async () => {
    prisma.questionBank.findUnique.mockResolvedValue({ question_bank_id: 1, subject: 'Fisika', bank_name: 'B' });
    const { next } = await run(ctrl.updateQuestionBank, { params: { id: '1' }, body: {} });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  test('WB-QC-06: non-coordinator changing subject → 403', async () => {
    prisma.questionBank.findUnique.mockResolvedValue({ question_bank_id: 1, subject: 'IPA', bank_name: 'B', grade_level: '10', major: null });
    const { next } = await run(ctrl.updateQuestionBank, { params: { id: '1' }, body: { subject: 'Fisika' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  test('WB-QC-07: valid update → 200', async () => {
    prisma.questionBank.findUnique.mockResolvedValue({ question_bank_id: 1, subject: 'IPA', bank_name: 'B', grade_level: '10', major: null, description: null });
    prisma.questionBank.update.mockResolvedValue({ question_bank_id: 1, bank_name: 'B2' });
    const { res } = await run(ctrl.updateQuestionBank, { params: { id: '1' }, body: { description: 'desc' } });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('diperbarui') }));
  });
});

// ─── deleteQuestionBank ───────────────────────────────────────────────────────

describe('deleteQuestionBank', () => {
  test('WB-QC-08: not found → 404', async () => {
    prisma.questionBank.findUnique.mockResolvedValue(null);
    const { next } = await run(ctrl.deleteQuestionBank, { params: { id: '1' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('WB-QC-09: bank used in active exam → 400', async () => {
    prisma.questionBank.findUnique.mockResolvedValue({ question_bank_id: 1, subject: 'IPA', bank_name: 'B', _count: { questions: 3 } });
    prisma.examQuestion.findFirst.mockResolvedValue({ exam_question_id: 1 });
    const { next } = await run(ctrl.deleteQuestionBank, { params: { id: '1' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-QC-10: valid → cascading delete in transaction, 200', async () => {
    prisma.questionBank.findUnique.mockResolvedValue({ question_bank_id: 1, subject: 'IPA', bank_name: 'B', _count: { questions: 3 } });
    prisma.examQuestion.findFirst.mockResolvedValue(null);
    prisma.answerOption.deleteMany.mockResolvedValue({});
    prisma.examQuestion.deleteMany.mockResolvedValue({});
    prisma.answer.deleteMany.mockResolvedValue({});
    prisma.question.deleteMany.mockResolvedValue({});
    prisma.questionBank.delete.mockResolvedValue({});
    const { res } = await run(ctrl.deleteQuestionBank, { params: { id: '1' } });
    expect(prisma.questionBank.delete).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('berhasil dihapus') }));
  });
});

// ─── createQuestion ───────────────────────────────────────────────────────────

describe('createQuestion', () => {
  const bank = { question_bank_id: 1, subject: 'IPA', grade_level: '10', major: null };

  test('WB-QC-11: missing question_bank_id → 400', async () => {
    const { next } = await run(ctrl.createQuestion, { body: { question_type: 'ESSAY', question_text: 'x' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-QC-12: invalid question_type → 400', async () => {
    const { next } = await run(ctrl.createQuestion, { body: { question_bank_id: 1, question_type: 'FOO', question_text: 'x' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-QC-13: MC with < 2 options → 400', async () => {
    const { next } = await run(ctrl.createQuestion, { body: { question_bank_id: 1, question_type: 'SINGLE_CHOICE', question_text: 'x', answer_options: [{ is_correct: true }] } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-QC-14: MC with no correct answer → 400', async () => {
    const { next } = await run(ctrl.createQuestion, { body: { question_bank_id: 1, question_type: 'SINGLE_CHOICE', question_text: 'x', answer_options: [{ is_correct: false }, { is_correct: false }] } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-QC-15: SINGLE_CHOICE with > 1 correct → 400', async () => {
    const { next } = await run(ctrl.createQuestion, { body: { question_bank_id: 1, question_type: 'SINGLE_CHOICE', question_text: 'x', answer_options: [{ is_correct: true }, { is_correct: true }] } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-QC-16: bank not found → 404', async () => {
    prisma.questionBank.findUnique.mockResolvedValue(null);
    const { next } = await run(ctrl.createQuestion, { body: { question_bank_id: 1, question_type: 'ESSAY', question_text: 'x' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('WB-QC-17: question subject differs from bank → 400', async () => {
    prisma.questionBank.findUnique.mockResolvedValue(bank);
    const { next } = await run(ctrl.createQuestion, { body: { question_bank_id: 1, question_type: 'ESSAY', question_text: 'x', subject: 'Fisika' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-QC-18: valid essay → 201', async () => {
    prisma.questionBank.findUnique.mockResolvedValue(bank);
    prisma.question.create.mockResolvedValue({ question_id: 7 });
    const { res } = await run(ctrl.createQuestion, { body: { question_bank_id: 1, question_type: 'ESSAY', question_text: 'x' } });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ question_id: 7 }));
  });

  test('WB-QC-19: valid MC → creates answer options', async () => {
    prisma.questionBank.findUnique.mockResolvedValue(bank);
    prisma.question.create.mockResolvedValue({ question_id: 8 });
    prisma.answerOption.createMany.mockResolvedValue({});
    await run(ctrl.createQuestion, { body: { question_bank_id: 1, question_type: 'SINGLE_CHOICE', question_text: 'x', answer_options: [{ label: 'A', is_correct: true }, { label: 'B', is_correct: false }] } });
    expect(prisma.answerOption.createMany).toHaveBeenCalled();
  });
});

// ─── getQuestions / getQuestionById ───────────────────────────────────────────

describe('getQuestions', () => {
  test('WB-QC-20: returns paginated questions', async () => {
    prisma.question.findMany.mockResolvedValue([{ question_id: 1 }]);
    prisma.question.count.mockResolvedValue(1);
    const { res } = await run(ctrl.getQuestions, { query: { page: '1', limit: '50' } });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ pagination: expect.objectContaining({ total: 1 }) }));
  });
});

describe('getQuestionById', () => {
  test('WB-QC-21: not found → 404', async () => {
    prisma.question.findUnique.mockResolvedValue(null);
    const { next } = await run(ctrl.getQuestionById, { params: { id: '1' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('WB-QC-22: foreign subject → 403', async () => {
    prisma.question.findUnique.mockResolvedValue({ question_id: 1, subject: 'Fisika' });
    const { next } = await run(ctrl.getQuestionById, { params: { id: '1' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  test('WB-QC-23: valid → returns question', async () => {
    prisma.question.findUnique.mockResolvedValue({ question_id: 1, subject: 'IPA' });
    const { res } = await run(ctrl.getQuestionById, { params: { id: '1' } });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ question: expect.objectContaining({ question_id: 1 }) }));
  });
});

// ─── updateQuestion ───────────────────────────────────────────────────────────

describe('updateQuestion', () => {
  const q = { question_id: 1, subject: 'IPA', grade_level: '10', major: null, question_type: 'SINGLE_CHOICE', question_bank: { subject: 'IPA', grade_level: '10', major: null } };

  test('WB-QC-24: not found → 404', async () => {
    prisma.question.findUnique.mockResolvedValue(null);
    const { next } = await run(ctrl.updateQuestion, { params: { id: '1' }, body: {} });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('WB-QC-25: non-coordinator changing subject → 403', async () => {
    prisma.question.findUnique.mockResolvedValue(q);
    const { next } = await run(ctrl.updateQuestion, { params: { id: '1' }, body: { subject: 'Fisika' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  test('WB-QC-26: grade mismatch with bank → 400', async () => {
    prisma.question.findUnique.mockResolvedValue(q);
    const { next } = await run(ctrl.updateQuestion, { params: { id: '1' }, body: { grade_level: '11' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-QC-27: answer_options on ESSAY → 400', async () => {
    prisma.question.findUnique.mockResolvedValue({ ...q, question_type: 'ESSAY' });
    prisma.question.update.mockResolvedValue({});
    const { next } = await run(ctrl.updateQuestion, { params: { id: '1' }, body: { answer_options: [{ label: 'A', is_correct: true }, { label: 'B' }] } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-QC-28: valid update → 200', async () => {
    prisma.question.findUnique.mockResolvedValue(q);
    prisma.question.update.mockResolvedValue({ question_id: 1 });
    const { res } = await run(ctrl.updateQuestion, { params: { id: '1' }, body: { question_text: 'baru' } });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('diupdate') }));
  });
});

// ─── deleteQuestion ───────────────────────────────────────────────────────────

describe('deleteQuestion', () => {
  test('WB-QC-29: not found → 404', async () => {
    prisma.question.findUnique.mockResolvedValue(null);
    const { next } = await run(ctrl.deleteQuestion, { params: { id: '1' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('WB-QC-30: used in active exam → 400', async () => {
    prisma.question.findUnique.mockResolvedValue({ question_id: 1, subject: 'IPA' });
    prisma.examQuestion.findFirst.mockResolvedValue({ exam_question_id: 1 });
    const { next } = await run(ctrl.deleteQuestion, { params: { id: '1' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-QC-31: valid → 200', async () => {
    prisma.question.findUnique.mockResolvedValue({ question_id: 1, subject: 'IPA' });
    prisma.examQuestion.findFirst.mockResolvedValue(null);
    prisma.question.delete.mockResolvedValue({});
    const { res } = await run(ctrl.deleteQuestion, { params: { id: '1' } });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('dihapus') }));
  });
});

// ─── getQuestionBank / getQuestionsByBank ─────────────────────────────────────

describe('getQuestionBank', () => {
  test('WB-QC-32: returns banks with mc/essay counts and totals', async () => {
    prisma.questionBank.findMany.mockResolvedValue([
      { question_bank_id: 1, bank_name: 'B', description: null, subject: 'IPA', grade_level: '10', major: null, teacher: { teacher_id: 2, full_name: 'G' }, _count: { questions: 3 }, questions: [{ question_type: 'ESSAY' }, { question_type: 'SINGLE_CHOICE' }, { question_type: 'MULTIPLE_CHOICE' }] },
    ]);
    const { res } = await run(ctrl.getQuestionBank);
    const payload = res.json.mock.calls[0][0];
    expect(payload.total_banks).toBe(1);
    expect(payload.total_questions).toBe(3);
    expect(payload.question_bank[0]).toMatchObject({ mc_count: 2, essay_count: 1 });
  });
});

describe('getQuestionsByBank', () => {
  test('WB-QC-33: bank not found → 404', async () => {
    prisma.questionBank.findUnique.mockResolvedValue(null);
    const { next } = await run(ctrl.getQuestionsByBank, { params: { questionBankId: '1' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('WB-QC-34: valid → returns questions with stats', async () => {
    prisma.questionBank.findUnique.mockResolvedValue({ question_bank_id: 1, subject: 'IPA', bank_name: 'B', grade_level: '10', major: null });
    prisma.question.findMany.mockResolvedValue([{ question_type: 'SINGLE_CHOICE' }, { question_type: 'ESSAY' }]);
    const { res } = await run(ctrl.getQuestionsByBank, { params: { questionBankId: '1' } });
    const payload = res.json.mock.calls[0][0];
    expect(payload.stats).toMatchObject({ total_questions: 2, total_pg_single: 1, total_essay: 1 });
  });
});

// ─── getAvailableQuestionsForExam ─────────────────────────────────────────────

describe('getAvailableQuestionsForExam', () => {
  test('WB-QC-35: exam not found → 404', async () => {
    prisma.exam.findUnique.mockResolvedValue(null);
    const { next } = await run(ctrl.getAvailableQuestionsForExam, { params: { exam_id: '1' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('WB-QC-36: valid → excludes already-used questions', async () => {
    prisma.exam.findUnique.mockResolvedValue({ exam_id: 1, exam_name: 'U', subject: 'IPA', grade_level: '10', major: null, exam_questions: [{ question_id: 1 }] });
    prisma.question.findMany.mockResolvedValue([{ question_id: 1, question_type: 'ESSAY' }, { question_id: 2, question_type: 'SINGLE_CHOICE' }]);
    const { res } = await run(ctrl.getAvailableQuestionsForExam, { params: { exam_id: '1' } });
    const payload = res.json.mock.calls[0][0];
    expect(payload.question_bank.available_count).toBe(1);
    expect(payload.question_bank.already_used).toBe(1);
  });
});

// ─── assignQuestionBankToExam ─────────────────────────────────────────────────

describe('assignQuestionBankToExam', () => {
  const exam = { exam_id: 1, subject: 'IPA', grade_level: '10', major: null, exam_status: 'SCHEDULED', exam_questions: [] };
  const bank = { question_bank_id: 2, subject: 'IPA', grade_level: '10', major: null };

  test('WB-QC-37: missing ids → 400', async () => {
    const { next } = await run(ctrl.assignQuestionBankToExam, { body: { exam_id: 1 } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-QC-38: exam not found → 404', async () => {
    prisma.exam.findUnique.mockResolvedValue(null);
    const { next } = await run(ctrl.assignQuestionBankToExam, { body: { exam_id: 1, question_bank_id: 2 } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('WB-QC-39: exam ONGOING → guardExamStatus 400', async () => {
    prisma.exam.findUnique.mockResolvedValue({ ...exam, exam_status: 'ONGOING' });
    const { next } = await run(ctrl.assignQuestionBankToExam, { body: { exam_id: 1, question_bank_id: 2 } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-QC-40: bank subject mismatch → 400', async () => {
    prisma.exam.findUnique.mockResolvedValue(exam);
    prisma.questionBank.findUnique.mockResolvedValue({ ...bank, subject: 'IPA' }); // access ok
    // make exam subject differ
    prisma.exam.findUnique.mockResolvedValue({ ...exam, subject: 'IPA' });
    prisma.questionBank.findUnique.mockResolvedValue({ ...bank, grade_level: '11' });
    const { next } = await run(ctrl.assignQuestionBankToExam, { body: { exam_id: 1, question_bank_id: 2 }, teacher: coord });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-QC-41: bank has no questions → 404', async () => {
    prisma.exam.findUnique.mockResolvedValue(exam);
    prisma.questionBank.findUnique.mockResolvedValue(bank);
    prisma.question.findMany.mockResolvedValue([]);
    const { next } = await run(ctrl.assignQuestionBankToExam, { body: { exam_id: 1, question_bank_id: 2 } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('WB-QC-42: valid → createMany sequence, 201', async () => {
    prisma.exam.findUnique.mockResolvedValue(exam);
    prisma.questionBank.findUnique.mockResolvedValue(bank);
    prisma.question.findMany.mockResolvedValue([{ question_id: 10 }, { question_id: 11 }]);
    prisma.examQuestion.createMany.mockResolvedValue({ count: 2 });
    const { res } = await run(ctrl.assignQuestionBankToExam, { body: { exam_id: 1, question_bank_id: 2 } });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ questions_added: 2 }));
  });
});
