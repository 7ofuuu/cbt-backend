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
      if (answer.manual_score !== null && answer.manual_score !== undefined) {
        const percentageOfWeight = (answer.manual_score / 100) * examQuestion.score_weight;
        totalScore += percentageOfWeight;
      } else {
        allEssayGraded = false;
      }
    } else if (questionType === 'MULTIPLE_CHOICE') {
      // Multiple choice: partial scoring based on correct options
      if (answer.mc_option_ids && answer.question?.answer_options) {
        const selectedIds = answer.mc_option_ids
          .split(',')
          .map(id => parseInt(id.trim()))
          .filter(id => !isNaN(id));

        const correctOptionIds = answer.question.answer_options
          .filter(o => o.is_correct)
          .map(o => o.option_id);

        const totalCorrectOptions = correctOptionIds.length;

        if (totalCorrectOptions > 0) {
          let correctSelections = 0;
          let wrongSelections = 0;

          for (const selectedId of selectedIds) {
            if (correctOptionIds.includes(selectedId)) {
              correctSelections++;
            } else {
              wrongSelections++;
            }
          }

          // Partial score: correct selections minus wrong selections, min 0
          const partialScore = Math.max(0, correctSelections - wrongSelections);
          const percentageOfWeight = (partialScore / totalCorrectOptions) * examQuestion.score_weight;
          totalScore += percentageOfWeight;
        }
      }
    } else {
      // SINGLE_CHOICE: simple correct/incorrect
      if (answer.is_correct) {
        totalScore += examQuestion.score_weight;
      }
    }
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

module.exports = { calculateScore, calculateAndSaveResult };
