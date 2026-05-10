/**
 * Analytics Service
 * Provides question-level statistics for teacher dashboard audit.
 * Supports filtering by exam, question bank, subject, and question type.
 */
const prisma = require('../config/db');
const { AppError } = require('../utils/asyncHandler');
const { buildSubjectFilter, isCoordinator, validateSubjectAccess } = require('./subjectAccessService');

const parsePositiveInt = (value, fieldName) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    throw new AppError(`${fieldName} harus berupa angka positif`, 400);
  }
  return parsed;
};

const parsePositiveIntOrDefault = (value, defaultValue, fieldName) => {
  if (value === undefined || value === null || value === '') return defaultValue;
  const parsed = parsePositiveInt(value, fieldName);
  return parsed ?? defaultValue;
};

const round2 = (value) => Math.round(value * 100) / 100;

const averageOf = (numbers) => {
  if (!Array.isArray(numbers) || numbers.length === 0) return null;
  const total = numbers.reduce((acc, value) => acc + value, 0);
  return round2(total / numbers.length);
};

const percentOf = (part, total) => {
  if (!total || total <= 0) return 0;
  return round2((part / total) * 100);
};

const quantile = (sortedNumbers, q) => {
  if (!Array.isArray(sortedNumbers) || sortedNumbers.length === 0) return null;
  const position = (sortedNumbers.length - 1) * q;
  const base = Math.floor(position);
  const remainder = position - base;
  const lower = sortedNumbers[base];
  const upper = sortedNumbers[base + 1] ?? lower;
  return round2(lower + remainder * (upper - lower));
};

const toISODate = (date) => new Date(date).toISOString().slice(0, 10);

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
  const examId = parsePositiveInt(exam_id, 'exam_id');
  const questionBankId = parsePositiveInt(question_bank_id, 'question_bank_id');

  if (!teacher?.subject && !isCoordinator(teacher)) {
    throw new AppError('Profil guru belum memiliki mata pelajaran', 400);
  }

  if (subject && !isCoordinator(teacher) && subject !== teacher.subject) {
    throw new AppError('Anda tidak dapat memfilter mata pelajaran di luar akses Anda', 403);
  }

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
    ...(questionBankId && { question_bank_id: questionBankId }),
    ...(question_type && { question_type }),
  };

  // If filtering by exam, get questions in that exam
  if (examId) {
    const exam = await prisma.exam.findUnique({
      where: { exam_id: examId },
      select: { exam_id: true, subject: true },
    });

    if (!exam) {
      throw new AppError('Ujian tidak ditemukan', 404);
    }

    validateSubjectAccess(teacher, exam.subject, 'ujian');

    const examQuestions = await prisma.examQuestion.findMany({
      where: { exam_id: examId },
      select: { question_id: true },
    });
    const questionIdsInExam = examQuestions.map(eq => eq.question_id);
    
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
        select: { question_bank_id: true, bank_name: true },
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
        ...(examId && {
          where: {
            exam_participant: { exam_id: examId },
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
      ...(examId && { exam_id: examId }),
      ...(questionBankId && { question_bank_id: questionBankId }),
      ...(!isCoordinator(teacher) && { subject: teacher.subject }),
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

/**
 * Teacher performance overview for interactive dashboard.
 * Returns trend, question alerts, and student watchlist.
 * @param {Object} teacher
 * @param {Object} query
 * @param {string|number} [query.days=30]
 * @param {string} [query.subject]
 * @returns {Promise<Object>}
 */
const getTeacherPerformanceOverview = async (teacher, query = {}) => {
  const requestedDays = parsePositiveIntOrDefault(query.days, 30, 'days');
  const days = Math.min(requestedDays, 180);
  const selectedExamId = parsePositiveInt(query.exam_id, 'exam_id');

  if (!teacher?.subject && !isCoordinator(teacher)) {
    throw new AppError('Profil guru belum memiliki mata pelajaran', 400);
  }

  let subjectCondition = buildSubjectFilter(teacher);
  if (isCoordinator(teacher) && query.subject) {
    subjectCondition = { subject: query.subject };
  }

  if (query.subject && !isCoordinator(teacher) && query.subject !== teacher.subject) {
    throw new AppError('Anda tidak dapat memfilter mata pelajaran di luar akses Anda', 403);
  }

  let selectedExam = null;
  if (selectedExamId) {
    selectedExam = await prisma.exam.findUnique({
      where: { exam_id: selectedExamId },
      select: {
        exam_id: true,
        exam_name: true,
        subject: true,
        grade_level: true,
        major: true,
        exam_status: true,
        start_date: true,
        end_date: true,
      },
    });

    if (!selectedExam) {
      throw new AppError('Ujian tidak ditemukan', 404);
    }

    validateSubjectAccess(teacher, selectedExam.subject, 'ujian');
  }

  const anchorDate = selectedExam?.end_date ? new Date(selectedExam.end_date) : new Date();
  anchorDate.setHours(0, 0, 0, 0);

  const fromDate = new Date(anchorDate);
  fromDate.setDate(fromDate.getDate() - days + 1);

  const examWhere = selectedExamId
    ? { exam_id: selectedExamId }
    : {
      ...subjectCondition,
      end_date: { gte: fromDate },
    };

  const exams = await prisma.exam.findMany({
    where: examWhere,
    select: {
      exam_id: true,
      exam_name: true,
      subject: true,
      grade_level: true,
      major: true,
      exam_status: true,
      end_date: true,
      exam_participants: {
        select: {
          exam_status: true,
          student_id: true,
          student: {
            select: {
              full_name: true,
              classroom: true,
            },
          },
          exam_result: {
            select: {
              final_score: true,
              submit_date: true,
            },
          },
        },
      },
    },
    orderBy: { end_date: 'desc' },
  });

  const statusCounts = {
    SCHEDULED: 0,
    ONGOING: 0,
    ENDED: 0,
  };

  const trendMap = new Map();
  const studentMap = new Map();

  for (let offset = 0; offset < days; offset++) {
    const current = new Date(fromDate);
    current.setDate(fromDate.getDate() + offset);
    trendMap.set(toISODate(current), []);
  }

  const allScores = [];
  const scoreDistribution = {
    remedial: 0,
    pass: 0,
    excellent: 0,
  };
  let totalParticipants = 0;
  let completedParticipants = 0;
  let gradedParticipants = 0;
  let gradingBacklog = 0;

  const recentExams = [];

  for (const exam of exams) {
    if (statusCounts[exam.exam_status] !== undefined) {
      statusCounts[exam.exam_status] += 1;
    }

    const examScores = [];
    let examCompleted = 0;
    let examGraded = 0;
    let examPendingReview = 0;

    for (const participant of exam.exam_participants) {
      totalParticipants += 1;

      const isCompleted = participant.exam_status === 'COMPLETED' || participant.exam_status === 'GRADED';
      if (isCompleted) {
        completedParticipants += 1;
        examCompleted += 1;
      }
      if (participant.exam_status === 'GRADED') {
        gradedParticipants += 1;
        examGraded += 1;
      }
      if (participant.exam_status === 'COMPLETED') {
        gradingBacklog += 1;
        examPendingReview += 1;
      }

      const studentId = participant.student_id;
      if (!studentMap.has(studentId)) {
        studentMap.set(studentId, {
          student_id: studentId,
          full_name: participant.student?.full_name || `Student ${studentId}`,
          classroom: participant.student?.classroom || '-',
          assigned_exams: 0,
          completed_exams: 0,
          not_started_exams: 0,
          in_progress_exams: 0,
          low_score_count: 0,
          scores: [],
        });
      }

      const studentStats = studentMap.get(studentId);
      studentStats.assigned_exams += 1;
      if (isCompleted) studentStats.completed_exams += 1;
      if (participant.exam_status === 'NOT_STARTED') studentStats.not_started_exams += 1;
      if (participant.exam_status === 'IN_PROGRESS') studentStats.in_progress_exams += 1;

      const score = participant.exam_result?.final_score;
      if (typeof score === 'number' && !Number.isNaN(score)) {
        const normalizedScore = round2(score);
        allScores.push(normalizedScore);
        examScores.push(normalizedScore);
        studentStats.scores.push(normalizedScore);

        if (normalizedScore >= 85) {
          scoreDistribution.excellent += 1;
        } else if (normalizedScore >= 75) {
          scoreDistribution.pass += 1;
        } else {
          scoreDistribution.remedial += 1;
        }

        if (normalizedScore < 75) {
          studentStats.low_score_count += 1;
        }

        const dateKey = toISODate(participant.exam_result?.submit_date || exam.end_date);
        if (trendMap.has(dateKey)) {
          trendMap.get(dateKey).push(normalizedScore);
        }
      }
    }

    recentExams.push({
      exam_id: exam.exam_id,
      exam_name: exam.exam_name,
      subject: exam.subject,
      grade_level: exam.grade_level,
      major: exam.major,
      exam_status: exam.exam_status,
      participant_count: exam.exam_participants.length,
      completed_count: examCompleted,
      graded_count: examGraded,
      pending_review_count: examPendingReview,
      unsubmitted_count: Math.max(0, exam.exam_participants.length - examCompleted),
      completion_rate: percentOf(examCompleted, exam.exam_participants.length),
      average_score: averageOf(examScores),
      end_date: exam.end_date,
    });
  }

  const trend = Array.from(trendMap.entries()).map(([date, scores]) => {
    const sortedScores = [...scores].sort((a, b) => a - b);
    const attempts = sortedScores.length;

    if (attempts === 0) {
      return {
        date,
        attempts: 0,
        average_score: null,
        min_score: null,
        p25_score: null,
        median_score: null,
        p75_score: null,
        max_score: null,
      };
    }

    return {
      date,
      attempts,
      average_score: averageOf(sortedScores),
      min_score: sortedScores[0],
      p25_score: quantile(sortedScores, 0.25),
      median_score: quantile(sortedScores, 0.5),
      p75_score: quantile(sortedScores, 0.75),
      max_score: sortedScores[sortedScores.length - 1],
    };
  });

  const examIds = exams.map((exam) => exam.exam_id);
  let questionAlerts = [];

  if (examIds.length > 0) {
    const questions = await prisma.question.findMany({
      where: {
        ...subjectCondition,
        exam_questions: {
          some: {
            exam_id: { in: examIds },
          },
        },
      },
      select: {
        question_id: true,
        question_bank_id: true,
        question_text: true,
        subject: true,
        question_type: true,
        answers: {
          where: {
            exam_participant: {
              exam_id: { in: examIds },
            },
          },
          select: {
            is_correct: true,
            manual_score: true,
            mc_option_ids: true,
            essay_answer_text: true,
          },
        },
      },
    });

    questionAlerts = questions
      .map((question) => {
        const stats = calculateQuestionStats(question.answers, question.question_type);
        const attempts = stats.total_attempts || 0;

        let severityScore = 0;
        if (question.question_type === 'ESSAY') {
          const averageManual = stats.avg_manual_score ?? 0;
          severityScore = 100 - averageManual;
        } else {
          severityScore = stats.incorrect_rate ?? 0;
        }

        return {
          question_id: question.question_id,
          question_bank_id: question.question_bank_id,
          question_text: question.question_text,
          subject: question.subject,
          question_type: question.question_type,
          total_attempts: attempts,
          incorrect_rate: stats.incorrect_rate,
          avg_manual_score: stats.avg_manual_score,
          severity_score: round2(severityScore),
        };
      })
      .filter((item) => item.total_attempts > 0)
      .sort((a, b) => {
        if (b.severity_score === a.severity_score) {
          return b.total_attempts - a.total_attempts;
        }
        return b.severity_score - a.severity_score;
      })
      .slice(0, 6);
  }

  const studentWatchlist = Array.from(studentMap.values())
    .map((student) => {
      const averageScore = averageOf(student.scores);
      const completionRate = percentOf(student.completed_exams, student.assigned_exams);
      const riskScore = round2(
        (100 - completionRate) * 0.5
        + (averageScore === null ? 35 : Math.max(0, 75 - averageScore) * 0.35)
        + Math.min(15, student.not_started_exams * 3 + student.low_score_count * 2)
      );

      return {
        student_id: student.student_id,
        full_name: student.full_name,
        classroom: student.classroom,
        assigned_exams: student.assigned_exams,
        completed_exams: student.completed_exams,
        completion_rate: completionRate,
        average_score: averageScore,
        low_score_count: student.low_score_count,
        risk_score: riskScore,
      };
    })
    .sort((a, b) => b.risk_score - a.risk_score)
    .slice(0, 8);

  return {
    meta: {
      days,
      from_date: toISODate(fromDate),
      to_date: toISODate(anchorDate),
      generated_at: new Date().toISOString(),
      subject: query.subject || teacher.subject || null,
      selected_exam: selectedExam,
    },
    summary: {
      total_exams: exams.length,
      status_counts: statusCounts,
      total_participants: totalParticipants,
      completed_participants: completedParticipants,
      graded_participants: gradedParticipants,
      graded_rate: percentOf(gradedParticipants, completedParticipants),
      completion_rate: percentOf(completedParticipants, totalParticipants),
      grading_backlog: gradingBacklog,
      average_score: averageOf(allScores),
      pass_rate: percentOf(allScores.filter((score) => score >= 75).length, allScores.length),
      score_samples: allScores.length,
      score_distribution: {
        ...scoreDistribution,
        remedial_rate: percentOf(scoreDistribution.remedial, allScores.length),
        pass_rate: percentOf(scoreDistribution.pass, allScores.length),
        excellent_rate: percentOf(scoreDistribution.excellent, allScores.length),
      },
    },
    trend,
    recent_exams: recentExams.slice(0, 6),
    question_alerts: questionAlerts,
    student_watchlist: studentWatchlist,
  };
};

/**
 * Admin audit overview for teacher/student performance and score trend.
 * Returns candlestick-ready score distribution per day.
 * @param {Object} query
 * @param {string|number} [query.days=30] - Range in days (max 365)
 * @param {string|number} [query.limit=8] - Max rows for teacher/student highlights (max 50)
 * @returns {Promise<Object>}
 */
const getAdminAuditOverview = async (query = {}) => {
  const requestedDays = parsePositiveIntOrDefault(query.days, 30, 'days');
  const requestedLimit = parsePositiveIntOrDefault(query.limit, 8, 'limit');
  const days = Math.min(requestedDays, 365);
  const limit = Math.min(requestedLimit, 50);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const fromDate = new Date(today);
  fromDate.setDate(fromDate.getDate() - days + 1);

  const exams = await prisma.exam.findMany({
    where: {
      end_date: { gte: fromDate },
    },
    select: {
      exam_id: true,
      exam_name: true,
      subject: true,
      grade_level: true,
      major: true,
      exam_status: true,
      end_date: true,
      teacher: {
        select: {
          teacher_id: true,
          full_name: true,
          subject: true,
        },
      },
      exam_participants: {
        select: {
          exam_status: true,
          student_id: true,
          student: {
            select: {
              full_name: true,
              classroom: true,
            },
          },
          exam_result: {
            select: {
              final_score: true,
              submit_date: true,
            },
          },
        },
      },
    },
    orderBy: { end_date: 'asc' },
  });

  const statusCounts = {
    SCHEDULED: 0,
    ONGOING: 0,
    ENDED: 0,
  };

  const teacherMap = new Map();
  const studentMap = new Map();
  const trendMap = new Map();

  for (let offset = 0; offset < days; offset++) {
    const current = new Date(fromDate);
    current.setDate(fromDate.getDate() + offset);
    trendMap.set(toISODate(current), []);
  }

  const allScores = [];
  let totalParticipants = 0;
  let completedParticipants = 0;
  let gradedParticipants = 0;
  let gradingBacklog = 0;

  for (const exam of exams) {
    if (statusCounts[exam.exam_status] !== undefined) {
      statusCounts[exam.exam_status] += 1;
    }

    const teacherId = exam.teacher?.teacher_id;
    if (teacherId && !teacherMap.has(teacherId)) {
      teacherMap.set(teacherId, {
        teacher_id: teacherId,
        full_name: exam.teacher.full_name,
        subject: exam.teacher.subject,
        total_exams: 0,
        ended_exams: 0,
        ongoing_exams: 0,
        scheduled_exams: 0,
        assigned_participants: 0,
        completed_participants: 0,
        grading_backlog: 0,
        scores: [],
      });
    }

    const teacherStats = teacherId ? teacherMap.get(teacherId) : null;
    if (teacherStats) {
      teacherStats.total_exams += 1;
      if (exam.exam_status === 'ENDED') teacherStats.ended_exams += 1;
      if (exam.exam_status === 'ONGOING') teacherStats.ongoing_exams += 1;
      if (exam.exam_status === 'SCHEDULED') teacherStats.scheduled_exams += 1;
    }

    for (const participant of exam.exam_participants) {
      totalParticipants += 1;

      const isCompleted = participant.exam_status === 'COMPLETED' || participant.exam_status === 'GRADED';
      if (isCompleted) completedParticipants += 1;
      if (participant.exam_status === 'GRADED') gradedParticipants += 1;
      if (participant.exam_status === 'COMPLETED') gradingBacklog += 1;

      if (teacherStats) {
        teacherStats.assigned_participants += 1;
        if (isCompleted) teacherStats.completed_participants += 1;
        if (participant.exam_status === 'COMPLETED') teacherStats.grading_backlog += 1;
      }

      const studentId = participant.student_id;
      if (studentId && !studentMap.has(studentId)) {
        studentMap.set(studentId, {
          student_id: studentId,
          full_name: participant.student?.full_name || `Student ${studentId}`,
          classroom: participant.student?.classroom || '-',
          assigned_exams: 0,
          completed_exams: 0,
          not_started_exams: 0,
          in_progress_exams: 0,
          low_score_count: 0,
          scores: [],
        });
      }

      const studentStats = studentId ? studentMap.get(studentId) : null;
      if (studentStats) {
        studentStats.assigned_exams += 1;
        if (isCompleted) studentStats.completed_exams += 1;
        if (participant.exam_status === 'NOT_STARTED') studentStats.not_started_exams += 1;
        if (participant.exam_status === 'IN_PROGRESS') studentStats.in_progress_exams += 1;
      }

      const score = participant.exam_result?.final_score;
      if (typeof score === 'number' && !Number.isNaN(score)) {
        const normalizedScore = round2(score);
        allScores.push(normalizedScore);

        if (teacherStats) {
          teacherStats.scores.push(normalizedScore);
        }

        if (studentStats) {
          studentStats.scores.push(normalizedScore);
          if (normalizedScore < 75) {
            studentStats.low_score_count += 1;
          }
        }

        const submitDate = participant.exam_result?.submit_date;
        if (submitDate) {
          const dateKey = toISODate(submitDate);
          if (trendMap.has(dateKey)) {
            trendMap.get(dateKey).push(normalizedScore);
          }
        }
      }
    }
  }

  const trend = Array.from(trendMap.entries()).map(([date, scores]) => {
    const sortedScores = [...scores].sort((a, b) => a - b);
    const attempts = sortedScores.length;

    if (attempts === 0) {
      return {
        date,
        attempts: 0,
        average_score: null,
        min_score: null,
        p25_score: null,
        median_score: null,
        p75_score: null,
        max_score: null,
      };
    }

    return {
      date,
      attempts,
      average_score: averageOf(sortedScores),
      min_score: sortedScores[0],
      p25_score: quantile(sortedScores, 0.25),
      median_score: quantile(sortedScores, 0.5),
      p75_score: quantile(sortedScores, 0.75),
      max_score: sortedScores[sortedScores.length - 1],
    };
  });

  const teacherPerformance = Array.from(teacherMap.values())
    .map((teacher) => {
      const averageScore = averageOf(teacher.scores);
      const completionRate = percentOf(teacher.completed_participants, teacher.assigned_participants);
      const passRate = percentOf(
        teacher.scores.filter((score) => score >= 75).length,
        teacher.scores.length
      );
      const riskScore = round2(
        (100 - completionRate) * 0.45
        + (averageScore === null ? 30 : Math.max(0, 75 - averageScore) * 0.45)
        + Math.min(10, teacher.grading_backlog * 1.5)
      );

      return {
        teacher_id: teacher.teacher_id,
        full_name: teacher.full_name,
        subject: teacher.subject,
        total_exams: teacher.total_exams,
        ended_exams: teacher.ended_exams,
        ongoing_exams: teacher.ongoing_exams,
        scheduled_exams: teacher.scheduled_exams,
        assigned_participants: teacher.assigned_participants,
        completed_participants: teacher.completed_participants,
        completion_rate: completionRate,
        grading_backlog: teacher.grading_backlog,
        average_score: averageScore,
        pass_rate: passRate,
        score_samples: teacher.scores.length,
        risk_score: riskScore,
      };
    })
    .sort((a, b) => {
      if (b.average_score === a.average_score) {
        return b.completion_rate - a.completion_rate;
      }
      if (a.average_score === null) return 1;
      if (b.average_score === null) return -1;
      return b.average_score - a.average_score;
    });

  const teacherAlerts = [...teacherPerformance]
    .sort((a, b) => b.risk_score - a.risk_score)
    .slice(0, limit);

  const studentRisk = Array.from(studentMap.values())
    .map((student) => {
      const averageScore = averageOf(student.scores);
      const completionRate = percentOf(student.completed_exams, student.assigned_exams);
      const passRate = percentOf(
        student.scores.filter((score) => score >= 75).length,
        student.scores.length
      );
      const riskScore = round2(
        (100 - completionRate) * 0.45
        + (averageScore === null ? 35 : Math.max(0, 75 - averageScore) * 0.45)
        + Math.min(20, student.not_started_exams * 4 + student.low_score_count * 2)
      );

      return {
        student_id: student.student_id,
        full_name: student.full_name,
        classroom: student.classroom,
        assigned_exams: student.assigned_exams,
        completed_exams: student.completed_exams,
        not_started_exams: student.not_started_exams,
        in_progress_exams: student.in_progress_exams,
        completion_rate: completionRate,
        average_score: averageScore,
        pass_rate: passRate,
        low_score_count: student.low_score_count,
        score_samples: student.scores.length,
        risk_score: riskScore,
      };
    })
    .sort((a, b) => b.risk_score - a.risk_score)
    .slice(0, limit);

  const studentTop = Array.from(studentMap.values())
    .map((student) => ({
      student_id: student.student_id,
      full_name: student.full_name,
      classroom: student.classroom,
      average_score: averageOf(student.scores),
      completion_rate: percentOf(student.completed_exams, student.assigned_exams),
      score_samples: student.scores.length,
    }))
    .filter((student) => student.average_score !== null && student.score_samples > 0)
    .sort((a, b) => b.average_score - a.average_score)
    .slice(0, limit);

  const examIds = exams.map((exam) => exam.exam_id);
  let questionAlerts = [];

  if (examIds.length > 0) {
    const questions = await prisma.question.findMany({
      where: {
        exam_questions: {
          some: {
            exam_id: { in: examIds },
          },
        },
      },
      select: {
        question_id: true,
        question_bank_id: true,
        question_text: true,
        subject: true,
        question_type: true,
        answers: {
          where: {
            exam_participant: {
              exam_id: { in: examIds },
            },
          },
          select: {
            is_correct: true,
            manual_score: true,
            mc_option_ids: true,
            essay_answer_text: true,
          },
        },
      },
    });

    questionAlerts = questions
      .map((question) => {
        const stats = calculateQuestionStats(question.answers, question.question_type);
        const attempts = stats.total_attempts || 0;

        let severityScore = 0;
        if (question.question_type === 'ESSAY') {
          const averageManual = stats.avg_manual_score ?? 0;
          severityScore = 100 - averageManual;
        } else {
          severityScore = stats.incorrect_rate ?? 0;
        }

        return {
          question_id: question.question_id,
          question_bank_id: question.question_bank_id,
          question_text: question.question_text,
          subject: question.subject,
          question_type: question.question_type,
          total_attempts: attempts,
          incorrect_rate: stats.incorrect_rate,
          avg_manual_score: stats.avg_manual_score,
          severity_score: round2(severityScore),
        };
      })
      .filter((item) => item.total_attempts > 0)
      .sort((a, b) => {
        if (b.severity_score === a.severity_score) {
          return b.total_attempts - a.total_attempts;
        }
        return b.severity_score - a.severity_score;
      })
      .slice(0, limit);
  }

  return {
    meta: {
      days,
      from_date: toISODate(fromDate),
      to_date: toISODate(today),
      generated_at: new Date().toISOString(),
    },
    summary: {
      total_exams: exams.length,
      status_counts: statusCounts,
      total_participants: totalParticipants,
      completed_participants: completedParticipants,
      graded_participants: gradedParticipants,
      completion_rate: percentOf(completedParticipants, totalParticipants),
      grading_backlog: gradingBacklog,
      average_score: averageOf(allScores),
      pass_rate: percentOf(allScores.filter((score) => score >= 75).length, allScores.length),
      score_samples: allScores.length,
    },
    trend,
    teacher_performance: teacherPerformance,
    teacher_alerts: teacherAlerts,
    student_risk: studentRisk,
    student_top: studentTop,
    question_alerts: questionAlerts,
  };
};

module.exports = {
  calculateQuestionStats,
  getQuestionStatistics,
  getDashboardSummary,
  getTeacherPerformanceOverview,
  getAdminAuditOverview,
};
