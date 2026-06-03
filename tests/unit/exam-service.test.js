/**
 * White Box Test: Exam Service
 * WB-13
 * Target: src/services/examService.js
 *   getTeacherExam, getExamOrFail, guardExamStatus, batchUpdateWeights,
 *   getQuestionsByBank, ensureAccessPassword, shuffleArray
 */
jest.mock('../../src/config/db');

const prisma = require('../../src/config/db');
const {
  getTeacherExam,
  getExamOrFail,
  guardExamStatus,
  batchUpdateWeights,
  getQuestionsByBank,
  ensureAccessPassword,
  shuffleArray,
} = require('../../src/services/examService');
const { AppError } = require('../../src/utils/asyncHandler');

beforeEach(() => jest.clearAllMocks());

// ─── getTeacherExam ───────────────────────────────────────────────────────────

describe('getTeacherExam', () => {
  test('WB-ES-01: found → returns exam, scoped by exam_id + teacher_id', async () => {
    prisma.exam.findFirst.mockResolvedValue({ exam_id: 1 });
    const exam = await getTeacherExam('1', 7);
    expect(exam).toEqual({ exam_id: 1 });
    expect(prisma.exam.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { exam_id: 1, teacher_id: 7 } })
    );
  });

  test('WB-ES-02: not found → AppError 404', async () => {
    prisma.exam.findFirst.mockResolvedValue(null);
    await expect(getTeacherExam('99', 7)).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ─── getExamOrFail ────────────────────────────────────────────────────────────

describe('getExamOrFail', () => {
  test('WB-ES-03: found → returns exam by id (no ownership check)', async () => {
    prisma.exam.findUnique.mockResolvedValue({ exam_id: 2 });
    expect(await getExamOrFail('2')).toEqual({ exam_id: 2 });
    expect(prisma.exam.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { exam_id: 2 } }));
  });

  test('WB-ES-04: not found → AppError 404', async () => {
    prisma.exam.findUnique.mockResolvedValue(null);
    await expect(getExamOrFail('2')).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ─── guardExamStatus ──────────────────────────────────────────────────────────

describe('guardExamStatus', () => {
  test('WB-ES-05: SCHEDULED exam → does not throw', () => {
    expect(() => guardExamStatus({ exam_status: 'SCHEDULED' })).not.toThrow();
  });

  test('WB-ES-06: ONGOING exam → AppError 400', () => {
    expect(() => guardExamStatus({ exam_status: 'ONGOING' })).toThrow(AppError);
  });

  test('WB-ES-07: ENDED exam → AppError 400', () => {
    try {
      guardExamStatus({ exam_status: 'ENDED' });
    } catch (e) {
      expect(e.statusCode).toBe(400);
    }
  });

  test('WB-ES-08: custom blocked status list is honoured', () => {
    expect(() => guardExamStatus({ exam_status: 'SCHEDULED' }, ['SCHEDULED'])).toThrow(AppError);
  });
});

// ─── batchUpdateWeights ───────────────────────────────────────────────────────

describe('batchUpdateWeights', () => {
  beforeEach(() => {
    prisma.$transaction.mockImplementation((ops) => Promise.all(ops));
    prisma.examQuestion.update.mockResolvedValue({});
  });

  test('WB-ES-09: empty/non-array updates → AppError 400', async () => {
    await expect(batchUpdateWeights([])).rejects.toMatchObject({ statusCode: 400 });
    await expect(batchUpdateWeights(null)).rejects.toMatchObject({ statusCode: 400 });
  });

  test('WB-ES-10: weight < 1 → AppError 400', async () => {
    await expect(batchUpdateWeights([{ exam_question_id: 1, score_weight: 0 }])).rejects.toMatchObject({ statusCode: 400 });
  });

  test('WB-ES-11: non-numeric weight → AppError 400', async () => {
    await expect(batchUpdateWeights([{ exam_question_id: 1, score_weight: 'abc' }])).rejects.toMatchObject({ statusCode: 400 });
  });

  test('WB-ES-12: valid updates → one update per item in a transaction, returns count', async () => {
    const count = await batchUpdateWeights([
      { exam_question_id: '1', score_weight: '5' },
      { exam_question_id: '2', score_weight: '10' },
    ]);
    expect(count).toBe(2);
    expect(prisma.examQuestion.update).toHaveBeenCalledTimes(2);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

// ─── getQuestionsByBank ───────────────────────────────────────────────────────

describe('getQuestionsByBank', () => {
  test('WB-ES-13: groups questions by their question bank', async () => {
    prisma.exam.findUnique.mockResolvedValue({
      exam_id: 1,
      exam_name: 'UTS',
      exam_questions: [
        { exam_question_id: 11, sequence: 1, score_weight: 5, question: { question_id: 1, question_bank: { question_bank_id: 100, bank_name: 'Bank A', subject: 'IPA' } } },
        { exam_question_id: 12, sequence: 2, score_weight: 5, question: { question_id: 2, question_bank: { question_bank_id: 100, bank_name: 'Bank A', subject: 'IPA' } } },
        { exam_question_id: 13, sequence: 3, score_weight: 5, question: { question_id: 3, question_bank: { question_bank_id: 200, bank_name: 'Bank B', subject: 'IPS' } } },
      ],
    });
    const out = await getQuestionsByBank('1');
    expect(out.total_questions).toBe(3);
    expect(out.banks).toHaveLength(2);
    expect(out.banks[0].questions).toHaveLength(2);
  });

  test('WB-ES-14: question without a bank → grouped under id 0 "Tanpa Bank"', async () => {
    prisma.exam.findUnique.mockResolvedValue({
      exam_id: 1,
      exam_name: 'UTS',
      exam_questions: [
        { exam_question_id: 11, sequence: 1, score_weight: 5, question: { question_id: 1, question_bank: null } },
      ],
    });
    const out = await getQuestionsByBank('1');
    expect(out.banks[0]).toMatchObject({ question_bank_id: 0, bank_name: 'Tanpa Bank' });
  });
});

// ─── ensureAccessPassword ─────────────────────────────────────────────────────

describe('ensureAccessPassword', () => {
  const DAY = 24 * 60 * 60 * 1000;

  test('WB-ES-15: earlier than H-1 → returns null, no write', async () => {
    const start = Date.now() + 2 * DAY;
    const result = await ensureAccessPassword({ exam_id: 1, start_date: new Date(start), access_password: null });
    expect(result).toBeNull();
    expect(prisma.exam.update).not.toHaveBeenCalled();
  });

  test('WB-ES-16: within H-1 and password already exists → returns existing, no write', async () => {
    const start = Date.now() + 1000;
    const result = await ensureAccessPassword({ exam_id: 1, start_date: new Date(start), access_password: 'EXIST12345' });
    expect(result).toBe('EXIST12345');
    expect(prisma.exam.update).not.toHaveBeenCalled();
  });

  test('WB-ES-17: within H-1 and no password → generates, persists, returns it', async () => {
    prisma.exam.update.mockResolvedValue({});
    const start = Date.now() + 1000;
    const result = await ensureAccessPassword({ exam_id: 5, start_date: new Date(start), access_password: null });
    expect(typeof result).toBe('string');
    expect(result).toHaveLength(10);
    expect(prisma.exam.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { exam_id: 5 }, data: { access_password: result } })
    );
  });
});

// ─── shuffleArray ─────────────────────────────────────────────────────────────

describe('shuffleArray', () => {
  test('WB-ES-18: returns a new array (does not mutate input)', () => {
    const input = [1, 2, 3, 4];
    const out = shuffleArray(input);
    expect(out).not.toBe(input);
    expect(input).toEqual([1, 2, 3, 4]);
  });

  test('WB-ES-19: preserves all elements (same multiset)', () => {
    const out = shuffleArray([1, 2, 3, 4, 5]);
    expect(out.slice().sort()).toEqual([1, 2, 3, 4, 5]);
  });

  test('WB-ES-20: single-element array returned intact', () => {
    expect(shuffleArray([42])).toEqual([42]);
  });
});
