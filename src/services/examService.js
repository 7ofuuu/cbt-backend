/**
 * Exam service - Business logic for exam CRUD operations.
 * Extracted from examController to keep controllers thin.
 */
const prisma = require('../config/db');
const { AppError } = require('../utils/asyncHandler');
const { buildPagination, paginatedResponse } = require('./userService');
const { generatePassword } = require('../utils/examCrypto');

// Exam access password (for encrypted pre-download) becomes available H-1.
const ACCESS_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Verify exam ownership by teacher.
 * @param {number} examId
 * @param {number} teacherId
 * @param {object} [includeOptions] - Prisma include options
 * @returns {Promise<object>} exam
 * @throws {AppError} 404 if not found
 */
const getTeacherExam = async (examId, teacherId, includeOptions = {}) => {
  const exam = await prisma.exam.findFirst({
    where: { exam_id: parseInt(examId), teacher_id: teacherId },
    ...includeOptions,
  });

  if (!exam) {
    throw new AppError('Ujian tidak ditemukan atau bukan milik Anda', 404);
  }

  return exam;
};

/**
 * Get exam by ID without teacher ownership check (for read-only access).
 * @param {number} examId
 * @param {object} [includeOptions] - Prisma include options
 * @returns {Promise<object>} exam
 * @throws {AppError} 404 if not found
 */
const getExamOrFail = async (examId, includeOptions = {}) => {
  const exam = await prisma.exam.findUnique({
    where: { exam_id: parseInt(examId) },
    ...includeOptions,
  });

  if (!exam) {
    throw new AppError('Ujian tidak ditemukan', 404);
  }

  return exam;
};

/**
 * Guard against modifying ONGOING/ENDED exams.
 * @param {object} exam
 * @param {string[]} [blockedStatuses=['ONGOING','ENDED']]
 */
const guardExamStatus = (exam, blockedStatuses = ['ONGOING', 'ENDED']) => {
  if (blockedStatuses.includes(exam.exam_status)) {
    throw new AppError(
      `Ujian dengan status ${exam.exam_status} tidak dapat dimodifikasi`,
      400
    );
  }
};

/**
 * Batch update question weights using a single transaction instead of N+1.
 * @param {Array<{exam_question_id: number, score_weight: number}>} updates
 * @returns {Promise<number>} count of updated records
 */
const batchUpdateWeights = async (updates) => {
  if (!Array.isArray(updates) || updates.length === 0) {
    throw new AppError('Data bobot tidak valid', 400);
  }

  // B13: Validate all weights are positive integers
  for (const { score_weight } of updates) {
    const w = parseInt(score_weight);
    if (isNaN(w) || w < 1) {
      throw new AppError('score_weight harus bilangan positif (minimal 1)', 400);
    }
  }

  // Use $transaction for batch, but single SQL per item (Prisma limitation)
  // At least they're wrapped in one transaction instead of N independent operations
  const result = await prisma.$transaction(
    updates.map(({ exam_question_id, score_weight }) =>
      prisma.examQuestion.update({
        where: { exam_question_id: parseInt(exam_question_id) },
        data: { score_weight: parseInt(score_weight) },
      })
    )
  );

  return result.length;
};

/**
 * Get exam questions grouped by question bank.
 * Uses DB-level grouping instead of JS array manipulation.
 * @param {number} examId
 * @param {number} teacherId
 * @returns {Promise<object>}
 */
const getQuestionsByBank = async (examId) => {
  const exam = await getExamOrFail(examId, {
    include: {
      exam_questions: {
        include: {
          question: {
            include: {
              answer_options: true,
              question_bank: {
                select: {
                  question_bank_id: true,
                  bank_name: true,
                  subject: true,
                },
              },
            },
          },
        },
        orderBy: { sequence: 'asc' },
      },
    },
  });

  // Group by question bank
  const bankMap = new Map();

  for (const eq of exam.exam_questions) {
    const bank = eq.question.question_bank;
    const bankId = bank?.question_bank_id || 0;

    if (!bankMap.has(bankId)) {
      bankMap.set(bankId, {
        question_bank_id: bankId,
        bank_name: bank?.bank_name || 'Tanpa Bank',
        subject: bank?.subject || '',
        questions: [],
      });
    }

    bankMap.get(bankId).questions.push({
      exam_question_id: eq.exam_question_id,
      sequence: eq.sequence,
      score_weight: eq.score_weight,
      question: eq.question,
    });
  }

  return {
    exam_id: exam.exam_id,
    exam_name: exam.exam_name,
    banks: Array.from(bankMap.values()),
    total_questions: exam.exam_questions.length,
  };
};

/**
 * Ensure an exam has an access password, generating it lazily once the exam is
 * within the H-1 window. Returns the password when available, or null when the
 * exam is still earlier than H-1 (so callers can signal "not yet available").
 * @param {{exam_id: number, start_date: Date|string, access_password: string|null}} exam
 * @returns {Promise<string|null>}
 */
const ensureAccessPassword = async (exam) => {
  const now = Date.now();
  const start = new Date(exam.start_date).getTime();
  if (now < start - ACCESS_WINDOW_MS) return null; // earlier than H-1
  if (exam.access_password) return exam.access_password;

  const password = generatePassword();
  await prisma.exam.update({
    where: { exam_id: exam.exam_id },
    data: { access_password: password },
  });
  return password;
};

/**
 * Fisher-Yates shuffle algorithm for question randomization.
 * @param {Array} array
 * @returns {Array} shuffled copy
 */
const shuffleArray = (array) => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

module.exports = {
  getTeacherExam,
  getExamOrFail,
  guardExamStatus,
  batchUpdateWeights,
  getQuestionsByBank,
  ensureAccessPassword,
  shuffleArray,
};
