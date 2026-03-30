/**
 * Analytics Service
 * Provides question-level statistics for teacher dashboard audit.
 * Supports filtering by exam, question bank, subject, and question type.
 */
const prisma = require('../config/db');
const { buildSubjectFilter, isCoordinator } = require('./subjectAccessService');

/**
 * Calculate statistics for a set of answers
 * @param {Array} answers - Array of answer records
 * @param {string} questionType - SINGLE_CHOICE, MULTIPLE_CHOICE, or ESSAY
 * @returns {Object} Statistics object
 */
const calculateQuestionStats = (answers, questionType) => {
  const totalAttempts = answers.length;
  
  if (totalAttempts === 0) {
    return {
      total_attempts: 0,
      correct_count: 0,
      incorrect_count: 0,
      unanswered_count: 0,
      correct_rate: 0,
      incorrect_rate: 0,
      avg_manual_score: null,
    };
  }

  if (questionType === 'ESSAY') {
    // For essay: use manual_score statistics
    const gradedAnswers = answers.filter(a => a.manual_score !== null);
    const avgManualScore = gradedAnswers.length > 0
      ? gradedAnswers.reduce((sum, a) => sum + a.manual_score, 0) / gradedAnswers.length
      : null;
    
    return {
      total_attempts: totalAttempts,
      correct_count: null,
      incorrect_count: null,
      unanswered_count: answers.filter(a => !a.essay_answer_text).length,
      correct_rate: null,
      incorrect_rate: null,
      avg_manual_score: avgManualScore !== null ? Math.round(avgManualScore * 100) / 100 : null,
      graded_count: gradedAnswers.length,
      ungraded_count: totalAttempts - gradedAnswers.length,
    };
  }

  // For SINGLE_CHOICE and MULTIPLE_CHOICE
  const correctCount = answers.filter(a => a.is_correct === true).length;
  const incorrectCount = answers.filter(a => a.is_correct === false).length;
  const unansweredCount = answers.filter(a => a.is_correct === null && !a.mc_option_ids).length;

  return {
    total_attempts: totalAttempts,
    correct_count: correctCount,
    incorrect_count: incorrectCount,
    unanswered_count: unansweredCount,
    correct_rate: Math.round((correctCount / totalAttempts) * 10000) / 100,
    incorrect_rate: Math.round((incorrectCount / totalAttempts) * 10000) / 100,
    avg_manual_score: null,
  };
};

/**
 * Get question statistics with flexible filtering
 * @param {Object} filters - Filter options
 * @param {Object} teacher - Teacher object with subject and is_coordinator
 * @param {Object} pagination - Page and limit
 * @returns {Object} Statistics data with pagination
 */
const getQuestionStatistics = async (filters, teacher, pagination) => {
  const { exam_id, question_bank_id, subject, question_type, sort_by, order } = filters;
  const { page, limit, skip } = pagination;

  // Build subject filter based on teacher access
  let subjectCondition = {};
  if (isCoordinator(teacher)) {
    // Coordinator can filter by any subject or see all
    if (subject) {
      subjectCondition = { subject };
    }
  } else {
    // Regular teacher: only their subject
    subjectCondition = { subject: teacher.subject };
  }

  // Build question filter
  const questionWhere = {
    ...subjectCondition,
    ...(question_bank_id && { question_bank_id: parseInt(question_bank_id) }),
    ...(question_type && { question_type }),
  };

  // If filtering by exam, get questions in that exam
  let questionIdsInExam = null;
  if (exam_id) {
    const examQuestions = await prisma.examQuestion.findMany({
      where: { exam_id: parseInt(exam_id) },
      select: { question_id: true },
    });
    questionIdsInExam = examQuestions.map(eq => eq.question_id);
    
    if (questionIdsInExam.length === 0) {
      return {
        data: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
        filters_applied: filters,
      };
    }
    
    questionWhere.question_id = { in: questionIdsInExam };
  }

  // Get total count for pagination
  const totalQuestions = await prisma.question.count({ where: questionWhere });

  // Get questions with their answers
  const questions = await prisma.question.findMany({
    where: questionWhere,
    include: {
      question_bank: {
        select: { question_bank_id: true, name: true },
      },
      answers: {
        select: {
          is_correct: true,
          manual_score: true,
          mc_option_ids: true,
          essay_answer_text: true,
          exam_participant: {
            select: { exam_id: true },
          },
        },
        // If filtering by exam, only get answers from that exam
        ...(exam_id && {
          where: {
            exam_participant: { exam_id: parseInt(exam_id) },
          },
        }),
      },
      exam_questions: {
        select: { exam_id: true },
        distinct: ['exam_id'],
      },
    },
    skip,
    take: limit,
  });

  // Calculate statistics for each question
  let questionStats = questions.map(q => {
    const stats = calculateQuestionStats(q.answers, q.question_type);
    
    return {
      question_id: q.question_id,
      question_text: q.question_text,
      question_type: q.question_type,
      subject: q.subject,
      grade_level: q.grade_level,
      question_bank: q.question_bank,
      statistics: stats,
      exams_used_in: q.exam_questions.length,
    };
  });

  // Sort results
  const sortField = sort_by || 'incorrect_rate';
  const sortOrder = order || 'desc';
  
  questionStats.sort((a, b) => {
    let aVal, bVal;
    
    switch (sortField) {
      case 'correct_rate':
        aVal = a.statistics.correct_rate ?? -1;
        bVal = b.statistics.correct_rate ?? -1;
        break;
      case 'incorrect_rate':
        aVal = a.statistics.incorrect_rate ?? -1;
        bVal = b.statistics.incorrect_rate ?? -1;
        break;
      case 'total_attempts':
        aVal = a.statistics.total_attempts;
        bVal = b.statistics.total_attempts;
        break;
      case 'avg_manual_score':
        aVal = a.statistics.avg_manual_score ?? -1;
        bVal = b.statistics.avg_manual_score ?? -1;
        break;
      default:
        aVal = a.statistics.incorrect_rate ?? -1;
        bVal = b.statistics.incorrect_rate ?? -1;
    }
    
    return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
  });

  return {
    data: questionStats,
    pagination: {
      page,
      limit,
      total: totalQuestions,
      totalPages: Math.ceil(totalQuestions / limit),
    },
    filters_applied: {
      ...(exam_id && { exam_id: parseInt(exam_id) }),
      ...(question_bank_id && { question_bank_id: parseInt(question_bank_id) }),
      ...(subject && { subject }),
      ...(question_type && { question_type }),
      sort_by: sortField,
      order: sortOrder,
    },
  };
};

/**
 * Get summary statistics for dashboard overview
 * @param {Object} teacher - Teacher object
 * @returns {Object} Summary statistics
 */
const getDashboardSummary = async (teacher) => {
  const subjectFilter = buildSubjectFilter(teacher);

  // Count questions by type
  const questionCounts = await prisma.question.groupBy({
    by: ['question_type'],
    where: subjectFilter,
    _count: { question_id: true },
  });

  // Count total exams
  const examCount = await prisma.exam.count({
    where: subjectFilter,
  });

  // Count total question banks
  const bankCount = await prisma.questionBank.count({
    where: subjectFilter,
  });

  // Get recent exam performance (last 5 completed exams)
  const recentExams = await prisma.exam.findMany({
    where: {
      ...subjectFilter,
      exam_status: { in: ['ENDED', 'ONGOING'] },
    },
    include: {
      exam_participants: {
        where: { exam_status: { in: ['COMPLETED', 'GRADED'] } },
        include: {
          exam_result: { select: { final_score: true } },
        },
      },
    },
    orderBy: { end_date: 'desc' },
    take: 5,
  });

  const recentExamStats = recentExams.map(exam => {
    const scores = exam.exam_participants
      .filter(p => p.exam_result)
      .map(p => p.exam_result.final_score);
    
    return {
      exam_id: exam.exam_id,
      exam_name: exam.exam_name,
      subject: exam.subject,
      participant_count: exam.exam_participants.length,
      avg_score: scores.length > 0
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
        : null,
    };
  });

  return {
    questions: {
      total: questionCounts.reduce((sum, q) => sum + q._count.question_id, 0),
      by_type: questionCounts.reduce((obj, q) => {
        obj[q.question_type] = q._count.question_id;
        return obj;
      }, {}),
    },
    exams: { total: examCount },
    question_banks: { total: bankCount },
    recent_exams: recentExamStats,
  };
};

module.exports = {
  calculateQuestionStats,
  getQuestionStatistics,
  getDashboardSummary,
};
