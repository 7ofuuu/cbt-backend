/**
 * Student Exam Controller - Refactored
 * Uses asyncHandler, resolveStudent middleware, and scoreService.
 * Student lookup boilerplate eliminated via req.student from middleware.
 */
const prisma = require('../config/db');
const { asyncHandler, AppError } = require('../utils/asyncHandler');
const { calculateScore } = require('../services/scoreService');
const activityLogService = require('../services/activityLogService');

// GET /api/student/exams - Get student's assigned exams
const getMyExams = asyncHandler(async (req, res) => {
  const student = req.student;

  const examParticipants = await prisma.examParticipant.findMany({
    where: { student_id: student.student_id },
    include: {
      exam: {
        include: {
          exam_questions: { select: { exam_question_id: true } },
          teacher: { select: { full_name: true } },
        },
      },
    },
  });

  const now = new Date();
  const exams = examParticipants
    .filter(ep => {
      const exam = ep.exam;
      const end = new Date(exam.end_date);
      // Only show exams that are:
      // 1. Exam status is SCHEDULED or ONGOING
      // 2. Still within time window (not expired)
      // 3. Participant hasn't completed the exam yet
      return ['SCHEDULED', 'ONGOING'].includes(exam.exam_status)
        && now <= end
        && ['NOT_STARTED', 'IN_PROGRESS'].includes(ep.exam_status);
    })
    .map(ep => {
      const exam = ep.exam;
      const start = new Date(exam.start_date);
      const end = new Date(exam.end_date);

      let timeStatus = 'Belum Mulai';
      if (now >= start && now <= end) timeStatus = 'Sedang Berlangsung';

      return {
        exam_participant_id: ep.exam_participant_id,
        exam_id: exam.exam_id,
        exam_name: exam.exam_name,
        subject: exam.subject,
        grade_level: exam.grade_level,
        major: exam.major,
        start_date: exam.start_date,
        end_date: exam.end_date,
        duration_minutes: exam.duration_minutes,
        total_questions: exam.exam_questions.length,
        exam_status: ep.exam_status,
        is_blocked: ep.is_blocked,
        is_shuffle: exam.is_shuffle_questions,
        teacher_name: exam.teacher?.full_name || 'N/A',
        time_status: timeStatus,
      };
    });

  res.json({ exams });
});

// POST /api/student/exams/start - Start an exam session
const startExam = asyncHandler(async (req, res) => {
  const student = req.student;
  const { exam_id, unlock_code } = req.body;

  if (!exam_id) throw new AppError('exam_id wajib diisi', 400);

  // Get participant with exam data (single query)
  const examParticipant = await prisma.examParticipant.findFirst({
    where: {
      exam_id: parseInt(exam_id),
      student_id: student.student_id,
    },
    include: {
      exam: {
        include: {
          exam_questions: {
            include: {
              question: {
                include: { answer_options: true },
              },
            },
            orderBy: { sequence: 'asc' },
          },
        },
      },
    },
  });

  if (!examParticipant) throw new AppError('Anda tidak terdaftar pada ujian ini', 404);

  // Check if blocked
  if (examParticipant.is_blocked) {
    if (!unlock_code) {
      throw new AppError('Akun Anda diblokir. Masukkan kode unlock untuk melanjutkan', 403);
    }
    if (examParticipant.unlock_code !== unlock_code.toUpperCase()) {
      throw new AppError('Kode unlock tidak valid', 400);
    }
    // Valid unlock code: unblock
    await prisma.examParticipant.update({
      where: { exam_participant_id: examParticipant.exam_participant_id },
      data: { is_blocked: false, block_reason: null, unlock_code: null },
    });
  }

  // Check if already completed
  if (['COMPLETED', 'GRADED'].includes(examParticipant.exam_status)) {
    throw new AppError('Ujian sudah selesai', 400);
  }

  // Check time window
  const now = new Date();
  const exam = examParticipant.exam;
  const start = new Date(exam.start_date);
  const end = new Date(exam.end_date);

  if (now < start) throw new AppError('Ujian belum dimulai', 400);
  if (now > end) throw new AppError('Waktu ujian sudah berakhir', 400);

  // Check if exam has questions (bank soal must be assigned first)
  if (!exam.exam_questions || exam.exam_questions.length === 0) {
    throw new AppError('Ujian belum memiliki soal. Hubungi guru untuk menambahkan bank soal.', 400);
  }

  // Update status to IN_PROGRESS if NOT_STARTED (atomic to prevent timer reset race)
  if (examParticipant.exam_status === 'NOT_STARTED') {
    const result = await prisma.examParticipant.updateMany({
      where: {
        exam_participant_id: examParticipant.exam_participant_id,
        exam_status: 'NOT_STARTED',
      },
      data: { exam_status: 'IN_PROGRESS', start_time: now },
    });
    // If another request already started it, refetch to get actual start_time
    if (result.count === 0) {
      const refetched = await prisma.examParticipant.findUnique({
        where: { exam_participant_id: examParticipant.exam_participant_id },
      });
      if (refetched) examParticipant.start_time = refetched.start_time;
    }
  }

  // Calculate remaining time
  const startTime = examParticipant.start_time || now;
  const durationMs = exam.duration_minutes * 60 * 1000;
  const examEndByDuration = new Date(startTime.getTime() + durationMs);
  const effectiveEnd = examEndByDuration < end ? examEndByDuration : end;
  const remainingMs = Math.max(0, effectiveEnd.getTime() - now.getTime());

  // Prepare questions (hide correct answers)
  let questions = exam.exam_questions.map(eq => ({
    exam_question_id: eq.exam_question_id,
    sequence: eq.sequence,
    score_weight: eq.score_weight,
    question: {
      question_id: eq.question.question_id,
      question_type: eq.question.question_type,
      question_text: eq.question.question_text,
      question_image: eq.question.question_image,
      answer_options: eq.question.answer_options.map(o => ({
        option_id: o.option_id,
        label: o.label,
        option_text: o.option_text,
        // is_correct intentionally omitted
      })),
    },
  }));

  // Shuffle if enabled
  if (exam.is_shuffle_questions) {
    for (let i = questions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [questions[i], questions[j]] = [questions[j], questions[i]];
    }
  }

  // Get existing answers
  const existingAnswers = await prisma.answer.findMany({
    where: { exam_participant_id: examParticipant.exam_participant_id },
    select: { question_id: true, mc_option_ids: true, essay_answer_text: true },
  });

  // Log activity
  await activityLogService.createLog({
    user_id: req.user.id,
    exam_participant_id: examParticipant.exam_participant_id,
    activity_type: 'START_EXAM',
    description: `Student started exam: ${exam.exam_name}`,
    ip_address: activityLogService.getIpAddress(req),
    user_agent: activityLogService.getUserAgent(req),
    metadata: { exam_id: exam.exam_id, exam_participant_id: examParticipant.exam_participant_id },
  });

  res.json({
    exam_participant_id: examParticipant.exam_participant_id,
    exam: {
      exam_id: exam.exam_id,
      exam_name: exam.exam_name,
      subject: exam.subject,
      duration_minutes: exam.duration_minutes,
      end_date: exam.end_date,
    },
    remaining_seconds: Math.floor(remainingMs / 1000),
    total_questions: questions.length,
    questions,
    existing_answers: existingAnswers,
  });
});

// POST /api/student/exams/answer - Submit answer for a question
const submitAnswer = asyncHandler(async (req, res) => {
  const student = req.student;
  const { exam_participant_id, question_id, mc_option_ids, essay_answer_text } = req.body;

  if (!exam_participant_id || !question_id) {
    throw new AppError('exam_participant_id dan question_id wajib diisi', 400);
  }

  // Verify participant belongs to this student and is in progress
  const participant = await prisma.examParticipant.findFirst({
    where: {
      exam_participant_id: parseInt(exam_participant_id),
      student_id: student.student_id,
      exam_status: 'IN_PROGRESS',
    },
    include: {
      exam: {
        include: {
          exam_questions: {
            where: { question_id: parseInt(question_id) },
            include: {
              question: { include: { answer_options: true } },
            },
          },
        },
      },
    },
  });

  if (!participant) {
    throw new AppError('Peserta ujian tidak valid atau ujian sudah selesai', 404);
  }

  // B1: Validate exam time hasn't expired
  const now = new Date();
  const startTime = participant.start_time || now;
  const deadline = new Date(startTime.getTime() + participant.exam.duration_minutes * 60000);
  const examEnd = new Date(participant.exam.end_date);
  const effectiveEnd = deadline < examEnd ? deadline : examEnd;
  if (now > effectiveEnd) {
    throw new AppError('Waktu ujian sudah habis', 400);
  }

  if (participant.is_blocked) {
    throw new AppError('Akun Anda diblokir. Tidak dapat mengirim jawaban', 403);
  }

  const examQuestion = participant.exam.exam_questions[0];
  if (!examQuestion) {
    throw new AppError('Soal tidak ditemukan dalam ujian ini', 404);
  }

  const question = examQuestion.question;

  // Handle answer deletion (clear answer)
  if (
    (mc_option_ids === null || mc_option_ids === undefined || (Array.isArray(mc_option_ids) && mc_option_ids.length === 0)) &&
    (!essay_answer_text || essay_answer_text.trim() === '')
  ) {
    await prisma.answer.deleteMany({
      where: {
        exam_participant_id: parseInt(exam_participant_id),
        question_id: parseInt(question_id),
      },
    });
    return res.json({ message: 'Jawaban dihapus', answer: null });
  }

  // Determine correctness based on question type
  let answerData = {
    exam_participant_id: parseInt(exam_participant_id),
    question_id: parseInt(question_id),
    mc_option_ids: null,
    essay_answer_text: null,
    is_correct: null,
  };

  if (question.question_type === 'ESSAY') {
    answerData.essay_answer_text = essay_answer_text || '';
    answerData.is_correct = null; // Graded manually
  } else if (question.question_type === 'SINGLE_CHOICE') {
    const selectedOptionId = Array.isArray(mc_option_ids) ? mc_option_ids[0] : mc_option_ids;
    answerData.mc_option_ids = String(selectedOptionId);
    const selectedOption = question.answer_options.find(o => o.option_id === parseInt(selectedOptionId));
    answerData.is_correct = selectedOption?.is_correct || false;
  } else if (question.question_type === 'MULTIPLE_CHOICE') {
    const selectedIds = Array.isArray(mc_option_ids) ? mc_option_ids : [mc_option_ids];
    answerData.mc_option_ids = selectedIds.join(',');

    const correctOptionIds = question.answer_options
      .filter(o => o.is_correct)
      .map(o => o.option_id)
      .sort((a, b) => a - b);
    const selectedSorted = selectedIds.map(Number).sort((a, b) => a - b);
    answerData.is_correct =
      correctOptionIds.length === selectedSorted.length &&
      correctOptionIds.every((id, i) => id === selectedSorted[i]);
  }

  // Upsert answer (atomic - prevents race condition with concurrent submissions)
  const answer = await prisma.answer.upsert({
    where: {
      exam_participant_id_question_id: {
        exam_participant_id: parseInt(exam_participant_id),
        question_id: parseInt(question_id),
      },
    },
    update: answerData,
    create: answerData,
  });

  res.json({ message: 'Jawaban berhasil disimpan', answer });
});

// POST /api/student/exams/finish - Finish exam and calculate score
const finishExam = asyncHandler(async (req, res) => {
  const student = req.student;
  const { exam_participant_id } = req.body;

  if (!exam_participant_id) throw new AppError('exam_participant_id wajib diisi', 400);

  // Atomically update status to prevent double-finish; skip if participant is blocked
  const updateResult = await prisma.examParticipant.updateMany({
    where: {
      exam_participant_id: parseInt(exam_participant_id),
      student_id: student.student_id,
      exam_status: 'IN_PROGRESS',
      is_blocked: false,
    },
    data: {
      exam_status: 'COMPLETED',
      end_time: new Date(),
    },
  });

  if (updateResult.count === 0) {
    // Distinguish blocked from already-finished so the client can react appropriately
    const ep = await prisma.examParticipant.findFirst({
      where: { exam_participant_id: parseInt(exam_participant_id), student_id: student.student_id },
      select: { is_blocked: true, exam_status: true },
    });
    if (ep?.is_blocked) throw new AppError('Ujian tidak dapat diselesaikan karena peserta diblokir', 403);
    throw new AppError('Ujian tidak ditemukan, bukan milik Anda, atau sudah selesai', 400);
  }

  // Fetch participant with exam questions and answers for scoring
  const participant = await prisma.examParticipant.findUnique({
    where: { exam_participant_id: parseInt(exam_participant_id) },
    include: {
      exam: {
        include: { exam_questions: true },
      },
      answers: {
        include: {
          question: {
            include: { answer_options: true },
          },
        },
      },
    },
  });

  // Calculate score using centralized service
  const { totalScore, totalWeight, finalScore, hasEssay, allEssayGraded } = calculateScore(
    participant.exam.exam_questions,
    participant.answers
  );

  // Upsert exam result
  await prisma.examResult.upsert({
    where: { exam_participant_id: parseInt(exam_participant_id) },
    update: { final_score: finalScore, submit_date: new Date() },
    create: { exam_participant_id: parseInt(exam_participant_id), final_score: finalScore },
  });

  // If no essay questions, mark as GRADED
  const newStatus = !hasEssay || allEssayGraded ? 'GRADED' : 'COMPLETED';
  if (newStatus === 'GRADED') {
    await prisma.examParticipant.update({
      where: { exam_participant_id: parseInt(exam_participant_id) },
      data: { exam_status: 'GRADED' },
    });
  }

  // Log activity
  await activityLogService.createLog({
    user_id: req.user.id,
    exam_participant_id: parseInt(exam_participant_id),
    activity_type: 'FINISH_EXAM',
    description: `Student finished exam: ${participant.exam.exam_name}`,
    ip_address: activityLogService.getIpAddress(req),
    user_agent: activityLogService.getUserAgent(req),
    metadata: {
      exam_id: participant.exam.exam_id,
      final_score: finalScore,
      has_essay: hasEssay,
    },
  });

  res.json({
    message: 'Ujian berhasil diselesaikan',
    result: {
      exam_participant_id: parseInt(exam_participant_id),
      final_score: finalScore,
      total_score: totalScore,
      total_weight: totalWeight,
      has_essay: hasEssay,
      status: newStatus,
    },
  });
});

// POST /api/student/exams/report-violation - Report anti-cheat violation
const reportViolation = asyncHandler(async (req, res) => {
  const student = req.student;
  const { exam_participant_id, violation_type, details } = req.body;

  if (!exam_participant_id || !violation_type) {
    throw new AppError('exam_participant_id dan violation_type wajib diisi', 400);
  }

  // B14: Validate input lengths to prevent abuse
  if (typeof violation_type !== 'string' || violation_type.length > 100) {
    throw new AppError('violation_type harus string maksimal 100 karakter', 400);
  }
  if (details && (typeof details !== 'string' || details.length > 500)) {
    throw new AppError('details harus string maksimal 500 karakter', 400);
  }

  const participant = await prisma.examParticipant.findFirst({
    where: {
      exam_participant_id: parseInt(exam_participant_id),
      student_id: student.student_id,
      exam_status: 'IN_PROGRESS',
    },
  });

  if (!participant) {
    throw new AppError('Peserta ujian tidak ditemukan atau ujian sudah selesai', 404);
  }

  // Block the participant
  await prisma.examParticipant.update({
    where: { exam_participant_id: parseInt(exam_participant_id) },
    data: {
      is_blocked: true,
      block_reason: `Auto-block: ${violation_type}${details ? ` - ${details}` : ''}`,
    },
  });

  // Log violation
  await activityLogService.createLog({
    user_id: req.user.id,
    exam_participant_id: parseInt(exam_participant_id),
    activity_type: 'EXAM_VIOLATION',
    description: `Violation reported: ${violation_type}`,
    ip_address: activityLogService.getIpAddress(req),
    user_agent: activityLogService.getUserAgent(req),
    metadata: { violation_type, details, exam_participant_id: parseInt(exam_participant_id) },
  });

  res.json({
    message: 'Pelanggaran dilaporkan',
    is_blocked: true,
  });
});

module.exports = { getMyExams, startExam, submitAnswer, finishExam, reportViolation };
