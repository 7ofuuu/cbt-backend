/**
 * White Box Test: Score Service
 * WB-6 - SB-60 & SB-61
 * Target: src/services/scoreService.js
 */
jest.mock('../../src/config/db');

const prisma = require('../../src/config/db');
const { calculateScore, calculateAndSaveResult, scoreSingleQuestion } = require('../../src/services/scoreService');

// ─── scoreSingleQuestion ──────────────────────────────────────────────────────

describe('scoreSingleQuestion', () => {
  const single = (is_correct) => ({ is_correct, mc_option_ids: null, manual_score: null, question: { question_type: 'SINGLE_CHOICE', answer_options: [] } });
  const essay = (manual_score) => ({ is_correct: null, mc_option_ids: null, manual_score, question: { question_type: 'ESSAY', answer_options: [] } });
  const mc = (selectedCsv) => ({
    is_correct: null, manual_score: null, mc_option_ids: selectedCsv,
    question: { question_type: 'MULTIPLE_CHOICE', answer_options: [
      { option_id: 1, is_correct: true }, { option_id: 2, is_correct: true },
      { option_id: 3, is_correct: false }, { option_id: 4, is_correct: false },
    ] },
  });

  test('SQ-01: single benar -> full weight', () => {
    const a = single(true);
    expect(scoreSingleQuestion(a.question, 10, a)).toBe(10);
  });
  test('SQ-02: single salah -> 0', () => {
    const a = single(false);
    expect(scoreSingleQuestion(a.question, 10, a)).toBe(0);
  });
  test('SQ-03: essay dengan manual_score -> proporsional', () => {
    const a = essay(50);
    expect(scoreSingleQuestion(a.question, 10, a)).toBe(5);
  });
  test('SQ-04: essay tanpa manual_score -> 0', () => {
    const a = essay(null);
    expect(scoreSingleQuestion(a.question, 10, a)).toBe(0);
  });
  test('SQ-05: MC semua benar (1,2) -> full weight', () => {
    const a = mc('1,2');
    expect(scoreSingleQuestion(a.question, 10, a)).toBe(10);
  });
  test('SQ-06: MC partial (1 benar) -> setengah', () => {
    const a = mc('1');
    expect(scoreSingleQuestion(a.question, 10, a)).toBe(5);
  });
  test('SQ-07: MC 1 benar 1 salah -> net 0 -> 0', () => {
    const a = mc('1,3');
    expect(scoreSingleQuestion(a.question, 10, a)).toBe(0);
  });
});

// ─── Test Helpers ────────────────────────────────────────────────────────────

const makeExamQuestion = (question_id, score_weight) => ({ question_id, score_weight });

const makeSingleAnswer = (question_id, is_correct) => ({
  question_id,
  is_correct,
  mc_option_ids: null,
  manual_score: null,
  question: { question_type: 'SINGLE_CHOICE', answer_options: [] },
});

const makeEssayAnswer = (question_id, manual_score) => ({
  question_id,
  is_correct: null,
  mc_option_ids: null,
  manual_score,
  question: { question_type: 'ESSAY', answer_options: [] },
});

const makeMCAnswer = (question_id, selectedOptionIds, allOptions) => ({
  question_id,
  is_correct: null,
  mc_option_ids: selectedOptionIds.join(','),
  manual_score: null,
  question: {
    question_type: 'MULTIPLE_CHOICE',
    answer_options: allOptions,
  },
});

// ─── calculateScore (pure function) ─────────────────────────────────────────

describe('calculateScore - SINGLE_CHOICE', () => {
  test('WB-G1: correct answer adds full score_weight', () => {
    const q = [makeExamQuestion(1, 10)];
    const a = [makeSingleAnswer(1, true)];
    const result = calculateScore(q, a);
    expect(result.totalScore).toBe(10);
    expect(result.finalScore).toBe(100);
  });

  test('WB-G2: incorrect answer adds 0', () => {
    const q = [makeExamQuestion(1, 10)];
    const a = [makeSingleAnswer(1, false)];
    const result = calculateScore(q, a);
    expect(result.totalScore).toBe(0);
    expect(result.finalScore).toBe(0);
  });

  test('WB-G11: answer not found for question - skip (no score added)', () => {
    const q = [makeExamQuestion(1, 10), makeExamQuestion(2, 10)];
    const a = [makeSingleAnswer(1, true)]; // no answer for question 2
    const result = calculateScore(q, a);
    expect(result.totalScore).toBe(10);
    expect(result.totalWeight).toBe(20);
    expect(result.finalScore).toBe(50);
  });
});

describe('calculateScore - ESSAY', () => {
  test('WB-G7: manual_score = null → allEssayGraded = false, hasEssay = true', () => {
    const q = [makeExamQuestion(1, 20)];
    const a = [makeEssayAnswer(1, null)];
    const result = calculateScore(q, a);
    expect(result.hasEssay).toBe(true);
    expect(result.allEssayGraded).toBe(false);
    expect(result.totalScore).toBe(0);
  });

  test('WB-G8: manual_score = 80 → (80/100) * weight added to score', () => {
    const q = [makeExamQuestion(1, 20)];
    const a = [makeEssayAnswer(1, 80)];
    const result = calculateScore(q, a);
    expect(result.totalScore).toBeCloseTo(16); // (80/100) * 20
    expect(result.hasEssay).toBe(true);
    expect(result.allEssayGraded).toBe(true);
  });

  test('WB-G9: manual_score = 0 → contributes 0, not treated as ungraded', () => {
    const q = [makeExamQuestion(1, 20)];
    const a = [makeEssayAnswer(1, 0)];
    const result = calculateScore(q, a);
    expect(result.totalScore).toBe(0);
    expect(result.allEssayGraded).toBe(true);
  });

  test('WB-G15: multiple essays, some graded some not → allEssayGraded = false', () => {
    const q = [makeExamQuestion(1, 10), makeExamQuestion(2, 10)];
    const a = [makeEssayAnswer(1, 80), makeEssayAnswer(2, null)];
    const result = calculateScore(q, a);
    expect(result.allEssayGraded).toBe(false);
    expect(result.hasEssay).toBe(true);
  });
});

describe('calculateScore - MULTIPLE_CHOICE', () => {
  const options = [
    { option_id: 1, is_correct: true },
    { option_id: 2, is_correct: true },
    { option_id: 3, is_correct: false },
    { option_id: 4, is_correct: false },
  ];

  test('WB-G3: all correct selections → full score_weight', () => {
    const q = [makeExamQuestion(1, 20)];
    const a = [makeMCAnswer(1, [1, 2], options)];
    const result = calculateScore(q, a);
    // partialScore = (2 correct - 0 wrong) / 2 total correct = 1.0
    expect(result.totalScore).toBe(20);
  });

  test('WB-G4: partial correct without wrong selections → partial score', () => {
    const q = [makeExamQuestion(1, 20)];
    const a = [makeMCAnswer(1, [1], options)]; // 1 correct out of 2, 0 wrong
    const result = calculateScore(q, a);
    // partialScore = (1 - 0) / 2 * 20 = 10
    expect(result.totalScore).toBe(10);
  });

  test('WB-G5: correct minus wrong selections, minimum 0', () => {
    const q = [makeExamQuestion(1, 20)];
    const a = [makeMCAnswer(1, [1, 3], options)]; // 1 correct, 1 wrong
    const result = calculateScore(q, a);
    // partialScore = max(0, 1-1) / 2 * 20 = 0
    expect(result.totalScore).toBe(0);
  });

  test('WB-G6: all wrong selections → 0 (not negative)', () => {
    const q = [makeExamQuestion(1, 20)];
    const a = [makeMCAnswer(1, [3, 4], options)]; // 0 correct, 2 wrong
    const result = calculateScore(q, a);
    // partialScore = max(0, 0-2) = 0
    expect(result.totalScore).toBe(0);
  });

  test('WB-G-MC: mc_option_ids null → no score added', () => {
    const q = [makeExamQuestion(1, 20)];
    const a = [{
      question_id: 1,
      is_correct: null,
      mc_option_ids: null,
      manual_score: null,
      question: { question_type: 'MULTIPLE_CHOICE', answer_options: options },
    }];
    const result = calculateScore(q, a);
    expect(result.totalScore).toBe(0);
  });
});

describe('calculateScore - Mixed & Edge Cases', () => {
  test('WB-G10: empty examQuestions → finalScore = 0', () => {
    const result = calculateScore([], []);
    expect(result.finalScore).toBe(0);
    expect(result.totalWeight).toBe(0);
    expect(result.totalScore).toBe(0);
  });

  test('WB-G12: mix of SINGLE_CHOICE + ESSAY + MULTIPLE_CHOICE → all calculated correctly', () => {
    const questions = [
      makeExamQuestion(1, 10),  // SC
      makeExamQuestion(2, 20),  // Essay
      makeExamQuestion(3, 20),  // MC
    ];
    const answers = [
      makeSingleAnswer(1, true),       // +10
      makeEssayAnswer(2, 100),         // 100/100 * 20 = 20
      makeMCAnswer(3, [1, 2], [       // all correct
        { option_id: 1, is_correct: true },
        { option_id: 2, is_correct: true },
      ]),                              // +20
    ];
    const result = calculateScore(questions, answers);
    expect(result.totalScore).toBe(50);
    expect(result.totalWeight).toBe(50);
    expect(result.finalScore).toBe(100);
    expect(result.hasEssay).toBe(true);
    expect(result.allEssayGraded).toBe(true);
  });

  test('WB-G-final: finalScore formula = round((totalScore/totalWeight)*100, 2)', () => {
    const q = [makeExamQuestion(1, 3)];
    const a = [makeSingleAnswer(1, true)];
    const result = calculateScore(q, a);
    // totalScore = 3, totalWeight = 3, finalScore = 100
    expect(result.finalScore).toBe(100);
  });
});

// ─── calculateAndSaveResult (async, uses Prisma) ─────────────────────────────

describe('calculateAndSaveResult', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((fn) => fn(prisma));
  });

  const mockParticipant = {
    exam_participant_id: 1,
    exam: {
      exam_questions: [{ question_id: 1, score_weight: 10 }],
    },
    answers: [makeSingleAnswer(1, true)],
  };

  test('WB-GA1: participant not found → throws AppError 404', async () => {
    prisma.examParticipant.findUnique.mockResolvedValue(null);
    await expect(calculateAndSaveResult(999)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  test('WB-GA2: participant found → examResult.upsert called with correct finalScore', async () => {
    prisma.examParticipant.findUnique.mockResolvedValue(mockParticipant);
    prisma.examResult.upsert.mockResolvedValue({});
    prisma.examParticipant.update.mockResolvedValue({});

    const result = await calculateAndSaveResult(1);
    expect(result.finalScore).toBe(100);
    expect(prisma.examResult.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { exam_participant_id: 1 },
        update: expect.objectContaining({ final_score: 100 }),
      })
    );
  });

  test('WB-GA3: no essay → status = GRADED', async () => {
    prisma.examParticipant.findUnique.mockResolvedValue(mockParticipant);
    prisma.examResult.upsert.mockResolvedValue({});
    prisma.examParticipant.update.mockResolvedValue({});

    const result = await calculateAndSaveResult(1);
    expect(result.status).toBe('GRADED');
    expect(prisma.examParticipant.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { exam_status: 'GRADED' } })
    );
  });

  test('WB-GA4: essay all graded → status = GRADED', async () => {
    const participant = {
      ...mockParticipant,
      exam: { exam_questions: [{ question_id: 1, score_weight: 20 }] },
      answers: [makeEssayAnswer(1, 80)],
    };
    prisma.examParticipant.findUnique.mockResolvedValue(participant);
    prisma.examResult.upsert.mockResolvedValue({});
    prisma.examParticipant.update.mockResolvedValue({});

    const result = await calculateAndSaveResult(1);
    expect(result.status).toBe('GRADED');
  });

  test('WB-GA5: essay ungraded → status = COMPLETED', async () => {
    const participant = {
      ...mockParticipant,
      exam: { exam_questions: [{ question_id: 1, score_weight: 20 }] },
      answers: [makeEssayAnswer(1, null)],
    };
    prisma.examParticipant.findUnique.mockResolvedValue(participant);
    prisma.examResult.upsert.mockResolvedValue({});
    prisma.examParticipant.update.mockResolvedValue({});

    const result = await calculateAndSaveResult(1);
    expect(result.status).toBe('COMPLETED');
  });

  test('WB-GA6: custom tx argument is used instead of default prisma', async () => {
    const customTx = {
      examParticipant: {
        findUnique: jest.fn().mockResolvedValue(mockParticipant),
        update: jest.fn().mockResolvedValue({}),
      },
      examResult: { upsert: jest.fn().mockResolvedValue({}) },
    };

    const result = await calculateAndSaveResult(1, customTx);
    expect(customTx.examParticipant.findUnique).toHaveBeenCalled();
    expect(customTx.examResult.upsert).toHaveBeenCalled();
    expect(result.finalScore).toBe(100);
  });
});
