/**
 * Centralized score calculation service.
 * Consolidates the 4 duplicate implementations from:
 *   - studentController.finishExam
 *   - examResultController.calculateAndSaveResult
 *   - autoFinishService.calculateScore
 *   - userController.finalizeScore
 */
const prisma = require('../config/db');

/**
 * Calculate exam score for a participant.
 * Handles SINGLE_CHOICE, MULTIPLE_CHOICE, and ESSAY question types.
 *
 * @param {Array} examQuestions - Array of exam questions with score_weight, question_id
 * @param {Array} answers - Array of answers with question_id, is_correct, manual_score,
 *                          mc_option_ids, and question.answer_options
 * @returns {{ totalScore: number, totalWeight: number, finalScore: number, hasEssay: boolean, allEssayGraded: boolean }}
 */
/**
 * Score a single question. Returns the points obtained (0..scoreWeight).
 * Shared by calculateScore (totals) and the detailed-result review so the
 * per-question formula lives in exactly one place.
 *
 * @param {{ question_type: string, answer_options?: Array }} question
 * @param {number} scoreWeight
 * @param {{ is_correct?: boolean, manual_score?: number, mc_option_ids?: string }} answer
 * @returns {number}
 */
const scoreSingleQuestion = (question, scoreWeight, answer) => {
  if (!answer) return 0;
  const questionType = question?.question_type;

  if (questionType === 'ESSAY') {
    if (answer.manual_score !== null && answer.manual_score !== undefined) {
      return (answer.manual_score / 100) * scoreWeight;
    }
    return 0;
  }

  if (questionType === 'MULTIPLE_CHOICE') {
    if (!answer.mc_option_ids || !question?.answer_options) return 0;

    const selectedIds = answer.mc_option_ids
      .split(',')
      .map(id => parseInt(id.trim()))
      .filter(id => !isNaN(id));

    const correctOptionIds = question.answer_options
      .filter(o => o.is_correct)
      .map(o => o.option_id);

    const totalCorrectOptions = correctOptionIds.length;
    if (totalCorrectOptions === 0) return 0;

    let correctSelections = 0;
    let wrongSelections = 0;
    for (const selectedId of selectedIds) {
      if (correctOptionIds.includes(selectedId)) correctSelections++;
      else wrongSelections++;
    }

    const partialScore = Math.max(0, correctSelections - wrongSelections);
    return (partialScore / totalCorrectOptions) * scoreWeight;
  }

  // SINGLE_CHOICE: simple correct/incorrect
  return answer.is_correct ? scoreWeight : 0;
};

const calculateScore = (examQuestions, answers) => {
  let totalScore = 0;
  let totalWeight = 0;
  let hasEssay = false;
  let allEssayGraded = true;

  for (const examQuestion of examQuestions) {
    totalWeight += examQuestion.score_weight;

    const answer = answers.find(a => a.question_id === examQuestion.question_id);
    if (!answer) continue;

    const questionType = answer.question?.question_type;
    if (questionType === 'ESSAY') {
      hasEssay = true;
      if (answer.manual_score === null || answer.manual_score === undefined) {
        allEssayGraded = false;
      }
    }

    totalScore += scoreSingleQuestion(answer.question, examQuestion.score_weight, answer);
  }

  const finalScore = totalWeight > 0 ? Math.round(((totalScore / totalWeight) * 100) * 100) / 100 : 0;

  return {
    totalScore,
    totalWeight,
    finalScore,
    hasEssay,
    allEssayGraded,
  };
};

/**
 * Calculate and save exam result for a participant.
 * Fetches all necessary data, calculates score, and upserts result.
 *
 * @param {number} examParticipantId
 * @param {import('@prisma/client').PrismaClient} [tx] - Optional transaction client
 * @returns {{ finalScore: number, totalScore: number, totalWeight: number, hasEssay: boolean, allEssayGraded: boolean, status: string }}
 */
const calculateAndSaveResult = async (examParticipantId, tx = prisma) => {
  const participant = await tx.examParticipant.findUnique({
    where: { exam_participant_id: examParticipantId },
    include: {
      exam: {
        include: {
          exam_questions: true,
        },
      },
      answers: {
        include: {
          question: {
            include: {
              answer_options: true,
            },
          },
        },
      },
    },
  });

  if (!participant) {
    const { AppError } = require('../utils/asyncHandler');
    throw new AppError('Peserta ujian tidak ditemukan', 404);
  }

  const { totalScore, totalWeight, finalScore, hasEssay, allEssayGraded } = calculateScore(
    participant.exam.exam_questions,
    participant.answers
  );

  // Upsert exam result
  await tx.examResult.upsert({
    where: { exam_participant_id: examParticipantId },
    update: {
      final_score: finalScore,
      submit_date: new Date(),
    },
    create: {
      exam_participant_id: examParticipantId,
      final_score: finalScore,
    },
  });

  // Determine status: GRADED if no essay or all essay graded
  const newStatus = !hasEssay || allEssayGraded ? 'GRADED' : 'COMPLETED';

  await tx.examParticipant.update({
    where: { exam_participant_id: examParticipantId },
    data: { exam_status: newStatus },
  });

  return { finalScore, totalScore, totalWeight, hasEssay, allEssayGraded, status: newStatus };
};

module.exports = { calculateScore, calculateAndSaveResult, scoreSingleQuestion };
