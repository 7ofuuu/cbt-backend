/**
 * Exam Result Controller - Refactored
 * Uses asyncHandler, scoreService, and resolveTeacher/resolveStudent middleware.
 * Pagination added to getResultByExam and getCompletedExams.
 */
const prisma = require('../config/db');
const { asyncHandler, AppError } = require('../utils/asyncHandler');
const { calculateAndSaveResult } = require('../services/scoreService');
const { buildPagination, paginatedResponse } = require('../services/userService');
const activityLogService = require('../services/activityLogService');
const { validateSubjectAccess, buildSubjectFilter } = require('../services/subjectAccessService');
const { EXAM_LIST_INCLUDE, formatExamForList } = require('../services/examResultFormatter');

// GET /api/exam-results/participant/:exam_participant_id (all teachers can view)
const getResultByParticipant = asyncHandler(async (req, res) => {
  const teacher = req.teacher;
  const { exam_participant_id } = req.params;

  const result = await prisma.examResult.findUnique({
    where: { exam_participant_id: parseInt(exam_participant_id) },
    include: {
      exam_participant: {
        include: {
          student: {
            select: { student_id: true, full_name: true, classroom: true },
          },
          exam: {
            select: { exam_id: true, exam_name: true, subject: true, teacher_id: true },
          },
          answers: {
            include: {
              question: { include: { answer_options: true } },
            },
          },
        },
      },
    },
  });

  if (!result) throw new AppError('Hasil ujian tidak ditemukan', 404);

  validateSubjectAccess(teacher, result.exam_participant?.exam?.subject, 'hasil ujian');

  res.json({ result });
});

// GET /api/exam-results/exam/:exam_id - With pagination (all teachers can view)
const getResultByExam = asyncHandler(async (req, res) => {
  const teacher = req.teacher;
  const { exam_id } = req.params;
  const { skip, take, page, limit } = buildPagination(req.query, 20);

  // Verify exam exists
  const exam = await prisma.exam.findUnique({ where: { exam_id: parseInt(exam_id) } });
  if (!exam) throw new AppError('Ujian tidak ditemukan', 404);

  validateSubjectAccess(teacher, exam.subject, 'ujian');

  const where = {
    exam_participant: { exam_id: parseInt(exam_id) },
  };

  const [results, total] = await Promise.all([
    prisma.examResult.findMany({
      where,
      include: {
        exam_participant: {
          include: {
            student: {
              select: { student_id: true, full_name: true, classroom: true },
            },
          },
        },
      },
      orderBy: { final_score: 'desc' },
      skip,
      take,
    }),
    prisma.examResult.count({ where }),
  ]);

  res.json(paginatedResponse(results, total, page, limit));
});

// GET /api/exam-results/my-results - Student's own results
const getMyResults = asyncHandler(async (req, res) => {
  const student = req.student;
  const now = new Date();

  // 1. Get completed exam results (existing behavior)
  const completedResults = await prisma.examResult.findMany({
    where: {
      exam_participant: { student_id: student.student_id },
    },
    include: {
      exam_participant: {
        include: {
          exam: {
            select: {
              exam_id: true,
              exam_name: true,
              subject: true,
              grade_level: true,
              major: true,
              start_date: true,
              end_date: true,
            },
          },
        },
      },
    },
    orderBy: { submit_date: 'desc' },
  });

  // 2. Get expired exams where student never attempted (NOT_STARTED)
  const expiredNotAttempted = await prisma.examParticipant.findMany({
    where: {
      student_id: student.student_id,
      exam_status: 'NOT_STARTED',
      exam: {
        end_date: { lt: now },
      },
    },
    include: {
      exam: {
        select: {
          exam_id: true,
          exam_name: true,
          subject: true,
          grade_level: true,
          major: true,
          start_date: true,
          end_date: true,
        },
      },
    },
  });

  // Map expired not-attempted to the same response format
  const notAttemptedResults = expiredNotAttempted.map(ep => ({
    exam_result_id: null,
    exam_participant_id: ep.exam_participant_id,
    final_score: null,
    submit_date: ep.exam.end_date,
    exam_participant: {
      exam_participant_id: ep.exam_participant_id,
      student_id: ep.student_id,
      exam_id: ep.exam_id,
      exam_status: 'NOT_ATTEMPTED',
      exam: ep.exam,
    },
  }));

  // Combine and sort by submit_date descending
  const allResults = [...completedResults, ...notAttemptedResults];
  allResults.sort((a, b) => {
    const dateA = new Date(a.submit_date);
    const dateB = new Date(b.submit_date);
    return dateB - dateA;
  });

  // Hide final_score based on exam status conditions:
  // 1. Exam deadline hasn't passed yet - students can't see scores
  // 2. Essay exams that haven't been fully graded - score is preliminary
  const sanitizedResults = allResults.map(result => {
    const examEndDate = new Date(result.exam_participant?.exam?.end_date);
    const examNotEnded = examEndDate > now;
    const participantStatus = result.exam_participant?.exam_status;

    if (examNotEnded) {
      return { ...result, final_score: null, score_hidden: true, score_hidden_reason: 'EXAM_NOT_ENDED' };
    }

    // COMPLETED means essay hasn't been fully graded yet (GRADED = all graded)
    if (participantStatus === 'COMPLETED') {
      return { ...result, final_score: null, score_hidden: true, score_hidden_reason: 'ESSAY_NOT_GRADED' };
    }

    return result;
  });

  res.json({ results: sanitizedResults });
});

// POST /api/exam-results/calculate - Calculate and save result (any teacher can do)
const calculateAndSaveResultHandler = asyncHandler(async (req, res) => {
  const { exam_participant_id } = req.body;
  const teacher = req.teacher;

  if (!exam_participant_id) throw new AppError('exam_participant_id wajib diisi', 400);

  // Verify participant exists
  const participant = await prisma.examParticipant.findUnique({
    where: { exam_participant_id: parseInt(exam_participant_id) },
    include: { exam: { select: { exam_id: true, exam_name: true, subject: true } } },
  });
  if (!participant) throw new AppError('Peserta ujian tidak ditemukan', 404);

  validateSubjectAccess(teacher, participant.exam.subject, 'ujian');

  const result = await calculateAndSaveResult(parseInt(exam_participant_id));

  // Activity log
  await activityLogService.logFromRequest(req, 'CALCULATE_RESULT',
    `${teacher.full_name} menghitung hasil ujian "${participant.exam.exam_name}" untuk peserta #${exam_participant_id}`,
    {
      metadata: {
        exam_participant_id: parseInt(exam_participant_id),
        exam_id: participant.exam.exam_id,
        calculated_by: teacher.teacher_id,
        final_score: result.finalScore,
      },
    });

  res.json({
    message: 'Hasil ujian berhasil dihitung',
    result: {
      final_score: result.finalScore,
      total_score: result.totalScore,
      total_weight: result.totalWeight,
      status: result.status,
    },
  });
});

// PUT /api/exam-results/manual-score - Update manual score for essay (any teacher can do)
const updateManualScore = asyncHandler(async (req, res) => {
  const { answer_id, manual_score } = req.body;
  const teacher = req.teacher;

  if (!answer_id) throw new AppError('answer_id wajib diisi', 400);

  const score = parseFloat(manual_score);
  if (isNaN(score) || score < 0 || score > 100) {
    throw new AppError('Nilai manual harus antara 0 dan 100', 400);
  }

  const answer = await prisma.answer.findUnique({
    where: { answer_id: parseInt(answer_id) },
    include: {
      exam_participant: {
        include: { exam: { select: { exam_id: true, exam_name: true, subject: true } } },
      },
    },
  });

  if (!answer) throw new AppError('Jawaban tidak ditemukan', 404);

  validateSubjectAccess(teacher, answer.exam_participant?.exam?.subject, 'ujian');

  const updated = await prisma.answer.update({
    where: { answer_id: parseInt(answer_id) },
    data: { manual_score: score },
  });

  // Recalculate result and update status after grading
  const recalculated = await calculateAndSaveResult(answer.exam_participant_id);

  // Activity log
  await activityLogService.logFromRequest(req, 'UPDATE_MANUAL_SCORE',
    `${teacher.full_name} mengubah nilai manual jawaban #${answer_id} menjadi ${manual_score}`,
    {
      metadata: {
        answer_id: parseInt(answer_id),
        manual_score: score,
        exam_id: answer.exam_participant?.exam?.exam_id,
        updated_by: teacher.teacher_id,
        new_final_score: recalculated.finalScore,
        new_status: recalculated.status,
      },
    });

  res.json({
    message: 'Nilai manual berhasil diupdate',
    answer: updated,
    recalculated: {
      final_score: recalculated.finalScore,
      status: recalculated.status,
    },
  });
});

// GET /api/exam-results/detail/:exam_participant_id (all teachers can view)
const getDetailedResult = asyncHandler(async (req, res) => {
  const teacher = req.teacher;
  const { exam_participant_id } = req.params;
  const participantId = parseInt(exam_participant_id);

  // First try to find via ExamResult
  let result = await prisma.examResult.findUnique({
    where: { exam_participant_id: participantId },
    include: {
      exam_participant: {
        include: {
          student: true,
          exam: {
            include: {
              exam_questions: {
                include: {
                  question: { include: { answer_options: true } },
                },
                orderBy: { sequence: 'asc' },
              },
            },
          },
          answers: {
            include: {
              question: { include: { answer_options: true } },
            },
          },
        },
      },
    },
  });

  // If no ExamResult yet, fall back to ExamParticipant directly
  if (!result) {
    const participant = await prisma.examParticipant.findUnique({
      where: { exam_participant_id: participantId },
      include: {
        student: true,
        exam: {
          include: {
            exam_questions: {
              include: {
                question: { include: { answer_options: true } },
              },
              orderBy: { sequence: 'asc' },
            },
          },
        },
        answers: {
          include: {
            question: { include: { answer_options: true } },
          },
        },
      },
    });

    if (!participant) throw new AppError('Peserta ujian tidak ditemukan', 404);

    validateSubjectAccess(teacher, participant.exam?.subject, 'ujian');

    // Build review from participant data (no result yet)
    const detailedReview = participant.exam.exam_questions.map(eq => {
      const answer = participant.answers.find(a => a.question_id === eq.question_id);
      return {
        sequence: eq.sequence,
        question: eq.question,
        score_weight: eq.score_weight,
        answer: answer || null,
        is_correct: answer?.is_correct ?? null,
        score_obtained: 0,
      };
    });

    return res.json({
      exam_result: null,
      exam_status: participant.exam_status,
      student: participant.student,
      exam: {
        exam_id: participant.exam.exam_id,
        exam_name: participant.exam.exam_name,
        subject: participant.exam.subject,
      },
      review: detailedReview,
    });
  }

  validateSubjectAccess(teacher, result.exam_participant?.exam?.subject, 'ujian');

  // Map answers to exam questions for review, using same scoring logic as scoreService
  const detailedReview = result.exam_participant.exam.exam_questions.map(eq => {
    const answer = result.exam_participant.answers.find(a => a.question_id === eq.question_id);

    let scoreObtained = 0;
    if (answer) {
      if (eq.question.question_type === 'ESSAY') {
        scoreObtained = answer.manual_score != null
          ? (answer.manual_score / 100) * eq.score_weight
          : 0;
      } else if (eq.question.question_type === 'MULTIPLE_CHOICE') {
        // Partial scoring: correct_selected - wrong_selected, min 0
        const correctIds = new Set(
          eq.question.answer_options.filter(o => o.is_correct).map(o => o.option_id)
        );
        const selectedIds = answer.mc_option_ids
          ? answer.mc_option_ids.split(',').map(Number).filter(Boolean)
          : [];
        const correctSelected = selectedIds.filter(id => correctIds.has(id)).length;
        const wrongSelected = selectedIds.filter(id => !correctIds.has(id)).length;
        const totalCorrect = correctIds.size;
        if (totalCorrect > 0) {
          const ratio = Math.max(0, correctSelected - wrongSelected) / totalCorrect;
          scoreObtained = ratio * eq.score_weight;
        }
      } else {
        // SINGLE_CHOICE
        scoreObtained = answer.is_correct ? eq.score_weight : 0;
      }
    }

    return {
      sequence: eq.sequence,
      question: eq.question,
      score_weight: eq.score_weight,
      answer: answer || null,
      is_correct: answer?.is_correct ?? null,
      score_obtained: Math.round(scoreObtained * 100) / 100,
    };
  });

  res.json({
    exam_result: {
      exam_result_id: result.exam_result_id,
      final_score: Math.round(result.final_score * 100) / 100,
      submit_date: result.submit_date,
    },
    exam_status: result.exam_participant.exam_status,
    student: result.exam_participant.student,
    exam: {
      exam_id: result.exam_participant.exam.exam_id,
      exam_name: result.exam_participant.exam.exam_name,
      subject: result.exam_participant.exam.subject,
    },
    review: detailedReview,
  });
});

// GET /api/exam-results/completed-exams - All completed exams with stats (paginated, all teachers can view)
const getCompletedExams = asyncHandler(async (req, res) => {
  const teacher = req.teacher;
  const { skip, take, page, limit } = buildPagination(req.query, 10);
  const subjectFilter = buildSubjectFilter(teacher);

  const where = {
    ...subjectFilter,
    exam_status: 'ENDED',
    teacher_submitted_at: null,
  };

  const [completedExams, total] = await Promise.all([
    prisma.exam.findMany({
      where,
      include: EXAM_LIST_INCLUDE,
      orderBy: { end_date: 'desc' },
      skip,
      take,
    }),
    prisma.exam.count({ where }),
  ]);

  const formattedExams = completedExams.map((exam) => formatExamForList(exam));
  res.json(paginatedResponse(formattedExams, total, page, limit));
});

// POST /api/exam-results/:examId/submit - Archive exam (removes from active results list)
const submitExam = asyncHandler(async (req, res) => {
  const teacher = req.teacher;
  const examId = parseInt(req.params.examId);

  const exam = await prisma.exam.findUnique({
    where: { exam_id: examId },
    select: { exam_id: true, exam_status: true, teacher_submitted_at: true, subject: true, teacher: { select: { subject: true } } },
  });

  if (!exam) throw new AppError('Ujian tidak ditemukan', 404);
  validateSubjectAccess(teacher, exam.subject, 'ujian');
  if (exam.exam_status !== 'ENDED') throw new AppError('Ujian harus berstatus ENDED sebelum dapat disubmit', 400);
  if (exam.teacher_submitted_at) throw new AppError('Ujian sudah pernah disubmit', 400);

  await prisma.exam.update({
    where: { exam_id: examId },
    data: { teacher_submitted_at: new Date() },
  });

  res.json({ success: true, message: 'Ujian berhasil disubmit dan dipindahkan ke arsip' });
});

// GET /api/exam-results/archived-exams - Exams submitted by teacher (archived)
const getArchivedExams = asyncHandler(async (req, res) => {
  const teacher = req.teacher;
  const { skip, take, page, limit } = buildPagination(req.query, 10);
  const subjectFilter = buildSubjectFilter(teacher);

  const where = {
    ...subjectFilter,
    exam_status: 'ENDED',
    teacher_submitted_at: { not: null },
  };

  const [exams, total] = await Promise.all([
    prisma.exam.findMany({
      where,
      include: EXAM_LIST_INCLUDE,
      orderBy: { teacher_submitted_at: 'desc' },
      skip,
      take,
    }),
    prisma.exam.count({ where }),
  ]);

  const formatted = exams.map((exam) => formatExamForList(exam, { includeArchivedAt: true }));
  res.json(paginatedResponse(formatted, total, page, limit));
});

module.exports = {
  getResultByParticipant,
  getResultByExam,
  getMyResults,
  calculateAndSaveResult: calculateAndSaveResultHandler,
  updateManualScore,
  getDetailedResult,
  getCompletedExams,
  submitExam,
  getArchivedExams,
};
