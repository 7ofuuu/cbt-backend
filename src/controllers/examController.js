/**
 * Exam Controller - Refactored
 * Uses asyncHandler, resolveTeacher middleware, and examService.
 * Teacher lookup eliminated via req.teacher from middleware.
 * Subject-based access control: teachers only see/modify their subject's exams.
 * Coordinators have full access to all exams.
 */
const prisma = require('../config/db');
const { asyncHandler, AppError } = require('../utils/asyncHandler');
const { getTeacherExam, getExamOrFail, guardExamStatus, batchUpdateWeights, getQuestionsByBank, shuffleArray } = require('../services/examService');
const { buildPagination, paginatedResponse } = require('../services/userService');
const activityLogService = require('../services/activityLogService');
const { 
  validateSubjectAccess, 
  buildSubjectFilter, 
  getSubjectForCreate,
  isCoordinator,
} = require('../services/subjectAccessService');

// POST /api/exams - Create exam with optional auto-assign students
const createExam = asyncHandler(async (req, res) => {
  const teacher = req.teacher;
  const {
    exam_name, subject, grade_level, major, start_date, end_date,
    duration_minutes, is_shuffle_questions,
  } = req.body;

  // Validate required fields
  if (!exam_name || !grade_level || !start_date || !end_date || !duration_minutes) {
    throw new AppError('exam_name, grade_level, start_date, end_date, dan duration_minutes wajib diisi', 400);
  }

  // Determine subject: coordinator can specify any, regular teacher uses their own
  const finalSubject = getSubjectForCreate(teacher, subject);

  // B8: Validate duration_minutes is a positive integer
  const dur = parseInt(duration_minutes);
  if (isNaN(dur) || dur < 1) throw new AppError('duration_minutes harus bilangan positif', 400);

  const startDate = new Date(start_date);
  const endDate = new Date(end_date);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    throw new AppError('Format tanggal tidak valid', 400);
  }
  if (endDate <= startDate) {
    throw new AppError('end_date harus setelah start_date', 400);
  }

  const result = await prisma.$transaction(async (tx) => {
    const exam = await tx.exam.create({
      data: {
        exam_name,
        subject: finalSubject,
        grade_level,
        major: major || null,
        start_date: startDate,
        end_date: endDate,
        duration_minutes: dur,
        is_shuffle_questions: is_shuffle_questions ?? false,
        teacher_id: teacher.teacher_id,
      },
    });

    // Auto-assign students matching grade_level and major
    const studentFilter = { grade_level };
    if (major) studentFilter.major = major;

    const students = await tx.student.findMany({
      where: studentFilter,
      select: { student_id: true },
    });

    if (students.length > 0) {
      await tx.examParticipant.createMany({
        data: students.map(s => ({
          exam_id: exam.exam_id,
          student_id: s.student_id,
        })),
        skipDuplicates: true,
      });
    }

    return { exam, assignedCount: students.length };
  });

  // Activity log
  await activityLogService.createLog({
    user_id: req.user.id,
    activity_type: 'CREATE_EXAM',
    description: `${teacher.full_name} membuat ujian "${result.exam.exam_name}"`,
    metadata: { exam_id: result.exam.exam_id, exam_name: result.exam.exam_name, teacher_id: teacher.teacher_id },
  });

  res.status(201).json({
    message: 'Ujian berhasil dibuat',
    exam: result.exam,
    auto_assigned_students: result.assignedCount,
  });
});

// GET /api/exams - Get all exams with pagination
const getExams = asyncHandler(async (req, res) => {
  const teacher = req.teacher;
  const { skip, take, page, limit } = buildPagination(req.query, 20);

  // Build subject filter based on teacher's subject (coordinator sees all)
  const subjectFilter = buildSubjectFilter(teacher);
  const where = { ...subjectFilter };

  const [exams, total] = await Promise.all([
    prisma.exam.findMany({
      where,
      include: {
        teacher: {
          select: { teacher_id: true, full_name: true },
        },
        _count: {
          select: {
            exam_questions: true,
            exam_participants: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
      skip,
      take,
    }),
    prisma.exam.count({ where }),
  ]);

  res.json(paginatedResponse(exams, total, page, limit));
});

// GET /api/exams/:id - Get exam by ID
const getExamById = asyncHandler(async (req, res) => {
  const teacher = req.teacher;
  const exam = await getExamOrFail(req.params.id, {
    include: {
      teacher: {
        select: { teacher_id: true, full_name: true },
      },
      exam_questions: {
        include: {
          question: { include: { answer_options: true } },
        },
        orderBy: { sequence: 'asc' },
      },
      exam_participants: {
        include: {
          student: { select: { student_id: true, full_name: true, classroom: true } },
        },
      },
    },
  });

  // Validate subject access
  validateSubjectAccess(teacher, exam.subject, 'ujian');

  res.json({ exam });
});

// PUT /api/exams/:id - Update exam
const updateExam = asyncHandler(async (req, res) => {
  const teacher = req.teacher;
  const exam = await getExamOrFail(req.params.id);

  // Validate subject access
  validateSubjectAccess(teacher, exam.subject, 'ujian');

  guardExamStatus(exam);

  const {
    exam_name, subject, grade_level, major, start_date, end_date,
    duration_minutes, is_shuffle_questions,
  } = req.body;

  // Validate new subject if changing (only coordinator can change to different subject)
  let finalSubject = exam.subject;
  if (subject && subject !== exam.subject) {
    if (!isCoordinator(teacher)) {
      throw new AppError('Hanya koordinator yang dapat mengubah mata pelajaran ujian', 403);
    }
    finalSubject = subject;
  }

  // Validate dates if provided
  if (start_date && end_date) {
    const s = new Date(start_date);
    const e = new Date(end_date);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) throw new AppError('Format tanggal tidak valid', 400);
    if (e <= s) throw new AppError('end_date harus setelah start_date', 400);
  } else if (start_date && !end_date) {
    const s = new Date(start_date);
    if (isNaN(s.getTime())) throw new AppError('Format tanggal tidak valid', 400);
    if (s >= exam.end_date) throw new AppError('start_date harus sebelum end_date yang ada', 400);
  } else if (!start_date && end_date) {
    const e = new Date(end_date);
    if (isNaN(e.getTime())) throw new AppError('Format tanggal tidak valid', 400);
    if (e <= exam.start_date) throw new AppError('end_date harus setelah start_date yang ada', 400);
  }

  // B8: Validate duration_minutes in update
  if (duration_minutes !== undefined) {
    const durVal = parseInt(duration_minutes);
    if (isNaN(durVal) || durVal < 1) throw new AppError('duration_minutes harus bilangan positif', 400);
  }

  const updated = await prisma.exam.update({
    where: { exam_id: exam.exam_id },
    data: {
      ...(exam_name && { exam_name }),
      subject: finalSubject,
      ...(grade_level && { grade_level }),
      ...(major !== undefined && { major: major || null }),
      ...(start_date && { start_date: new Date(start_date) }),
      ...(end_date && { end_date: new Date(end_date) }),
      ...(duration_minutes !== undefined && { duration_minutes: parseInt(duration_minutes) }),
      ...(is_shuffle_questions !== undefined && { is_shuffle_questions }),
    },
  });

  // Activity log
  await activityLogService.createLog({
    user_id: req.user.id,
    activity_type: 'UPDATE_EXAM',
    description: `${teacher.full_name} memperbarui ujian "${updated.exam_name}"`,
    metadata: { exam_id: updated.exam_id, exam_name: updated.exam_name, updated_by: teacher.teacher_id },
  });

  res.json({ message: 'Ujian berhasil diperbarui', exam: updated });
});

// DELETE /api/exams/:id - Delete exam
const deleteExam = asyncHandler(async (req, res) => {
  const teacher = req.teacher;
  const exam = await getExamOrFail(req.params.id);

  // Validate subject access
  validateSubjectAccess(teacher, exam.subject, 'ujian');

  if (exam.exam_status === 'ONGOING') {
    throw new AppError('Tidak dapat menghapus ujian yang sedang berlangsung', 400);
  }

  await prisma.$transaction(async (tx) => {
    await tx.answer.deleteMany({
      where: { exam_participant: { exam_id: exam.exam_id } },
    });
    await tx.examResult.deleteMany({
      where: { exam_participant: { exam_id: exam.exam_id } },
    });
    await tx.examParticipant.deleteMany({ where: { exam_id: exam.exam_id } });
    await tx.examQuestion.deleteMany({ where: { exam_id: exam.exam_id } });
    await tx.exam.delete({ where: { exam_id: exam.exam_id } });
  });

  // Activity log
  await activityLogService.createLog({
    user_id: req.user.id,
    activity_type: 'DELETE_EXAM',
    description: `${teacher.full_name} menghapus ujian "${exam.exam_name}"`,
    metadata: { exam_id: exam.exam_id, exam_name: exam.exam_name, deleted_by: teacher.teacher_id },
  });

  res.json({ message: 'Ujian berhasil dihapus' });
});

// POST /api/exams/assign-question - Assign single question to exam
const assignQuestionToExam = asyncHandler(async (req, res) => {
  const teacher = req.teacher;
  const { exam_id, question_id, score_weight } = req.body;

  if (!exam_id || !question_id) {
    throw new AppError('exam_id dan question_id wajib diisi', 400);
  }

  const exam = await getExamOrFail(exam_id, {
    include: { exam_questions: { orderBy: { sequence: 'desc' }, take: 1 } },
  });

  // Validate subject access to the exam
  validateSubjectAccess(teacher, exam.subject, 'ujian');

  guardExamStatus(exam);

  // Verify question exists
  const question = await prisma.question.findUnique({
    where: { question_id: parseInt(question_id) },
  });
  if (!question) throw new AppError('Soal tidak ditemukan', 404);

  // Validate subject access to the question
  validateSubjectAccess(teacher, question.subject, 'soal');

  const lastSequence = exam.exam_questions.length > 0 ? exam.exam_questions[0].sequence : 0;

  const examQuestion = await prisma.examQuestion.create({
    data: {
      exam_id: parseInt(exam_id),
      question_id: parseInt(question_id),
      score_weight: score_weight ?? 10,
      sequence: lastSequence + 1,
    },
  });

  res.status(201).json({ message: 'Soal berhasil ditambahkan', exam_question: examQuestion });
});

// POST /api/exams/assign-bank - Assign bank of questions to exam (with optional shuffle)
const assignBankToExam = asyncHandler(async (req, res) => {
  const teacher = req.teacher;
  const { exam_id, question_bank_id, max_questions, shuffle } = req.body;

  if (!exam_id || !question_bank_id) {
    throw new AppError('exam_id dan question_bank_id wajib diisi', 400);
  }

  const exam = await getExamOrFail(exam_id, {
    include: { exam_questions: { orderBy: { sequence: 'desc' }, take: 1 } },
  });

  // Validate subject access to the exam
  validateSubjectAccess(teacher, exam.subject, 'ujian');

  guardExamStatus(exam);

  // Verify bank exists and validate access
  const bank = await prisma.questionBank.findUnique({
    where: { question_bank_id: parseInt(question_bank_id) },
  });
  if (!bank) throw new AppError('Bank soal tidak ditemukan', 404);
  validateSubjectAccess(teacher, bank.subject, 'bank soal');

  let questions = await prisma.question.findMany({
    where: { question_bank_id: parseInt(question_bank_id) },
    select: { question_id: true },
  });

  if (questions.length === 0) {
    throw new AppError('Tidak ada soal di bank tersebut', 404);
  }

  // Shuffle if requested
  if (shuffle) {
    questions = shuffleArray(questions);
  }

  // Limit if max_questions specified
  if (max_questions && max_questions < questions.length) {
    questions = questions.slice(0, max_questions);
  }

  let currentSequence = exam.exam_questions.length > 0 ? exam.exam_questions[0].sequence : 0;

  const examQuestionData = questions.map(q => ({
    exam_id: parseInt(exam_id),
    question_id: q.question_id,
    score_weight: 10,
    sequence: ++currentSequence,
  }));

  const result = await prisma.examQuestion.createMany({
    data: examQuestionData,
    skipDuplicates: true,
  });

  res.status(201).json({
    message: `${result.count} soal berhasil ditambahkan`,
    questions_added: result.count,
  });
});

// POST /api/exams/remove-questions - Remove multiple questions from exam
const removeMultipleQuestions = asyncHandler(async (req, res) => {
  const teacher = req.teacher;
  const { exam_id, exam_question_ids } = req.body;

  if (!exam_id || !Array.isArray(exam_question_ids) || exam_question_ids.length === 0) {
    throw new AppError('exam_id dan exam_question_ids wajib diisi', 400);
  }

  const exam = await getExamOrFail(exam_id);
  
  // Validate subject access
  validateSubjectAccess(teacher, exam.subject, 'ujian');
  
  guardExamStatus(exam);

  const result = await prisma.examQuestion.deleteMany({
    where: {
      exam_question_id: { in: exam_question_ids.map(Number) },
      exam_id: parseInt(exam_id),
    },
  });

  res.json({ message: `${result.count} soal berhasil dihapus dari ujian` });
});

// POST /api/exams/remove-bank - Remove all questions from a bank from exam
const removeBankFromExam = asyncHandler(async (req, res) => {
  const teacher = req.teacher;
  const { exam_id, question_bank_id } = req.body;

  if (!exam_id || !question_bank_id) {
    throw new AppError('exam_id dan question_bank_id wajib diisi', 400);
  }

  const exam = await getExamOrFail(exam_id);
  
  // Validate subject access
  validateSubjectAccess(teacher, exam.subject, 'ujian');
  
  guardExamStatus(exam);

  const bankQuestions = await prisma.question.findMany({
    where: { question_bank_id: parseInt(question_bank_id) },
    select: { question_id: true },
  });

  const result = await prisma.examQuestion.deleteMany({
    where: {
      exam_id: parseInt(exam_id),
      question_id: { in: bankQuestions.map(q => q.question_id) },
    },
  });

  res.json({ message: `${result.count} soal dari bank berhasil dihapus` });
});

// DELETE /api/exams/:id/clear-questions - Clear all questions from exam
const clearAllQuestions = asyncHandler(async (req, res) => {
  const teacher = req.teacher;
  const exam = await getExamOrFail(parseInt(req.params.id));

  // Validate subject access
  validateSubjectAccess(teacher, exam.subject, 'ujian');

  guardExamStatus(exam);

  const result = await prisma.examQuestion.deleteMany({
    where: { exam_id: exam.exam_id },
  });

  res.json({ message: `${result.count} soal berhasil dihapus dari ujian` });
});

// GET /api/exams/:id/questions-by-bank - Get questions grouped by bank
const getQuestionsByBankHandler = asyncHandler(async (req, res) => {
  const teacher = req.teacher;
  const exam = await getExamOrFail(parseInt(req.params.id));
  
  // Validate subject access
  validateSubjectAccess(teacher, exam.subject, 'ujian');
  
  const result = await getQuestionsByBank(exam.exam_id);
  res.json(result);
});

// PUT /api/exams/update-weight - Batch update question weights
const updateWeightMultiple = asyncHandler(async (req, res) => {
  const teacher = req.teacher;
  const { exam_id, updates } = req.body;

  if (!exam_id) throw new AppError('exam_id wajib diisi', 400);

  const exam = await getExamOrFail(exam_id);
  
  // Validate subject access
  validateSubjectAccess(teacher, exam.subject, 'ujian');
  
  guardExamStatus(exam);

  const count = await batchUpdateWeights(updates);

  res.json({ message: `${count} bobot berhasil diperbarui` });
});

// DELETE /api/exams/:examId/questions/:questionId - Remove single question from exam
const removeQuestionFromExam = asyncHandler(async (req, res) => {
  const teacher = req.teacher;
  const examId = parseInt(req.params.examId);
  const questionId = parseInt(req.params.questionId);

  const exam = await getExamOrFail(examId);
  
  // Validate subject access
  validateSubjectAccess(teacher, exam.subject, 'ujian');
  
  guardExamStatus(exam);

  const result = await prisma.examQuestion.deleteMany({
    where: {
      exam_id: examId,
      question_id: questionId,
    },
  });

  if (result.count === 0) {
    throw new AppError('Soal tidak ditemukan dalam ujian', 404);
  }

  res.json({ message: 'Soal berhasil dihapus dari ujian' });
});

// POST /api/exams/assign-students - Assign students by grade/major
const assignStudentToExam = asyncHandler(async (req, res) => {
  const teacher = req.teacher;
  const { exam_id, grade_level, major } = req.body;

  if (!exam_id || !grade_level) {
    throw new AppError('exam_id dan grade_level wajib diisi', 400);
  }

  const exam = await getExamOrFail(exam_id);
  
  // Validate subject access
  validateSubjectAccess(teacher, exam.subject, 'ujian');

  const studentFilter = { grade_level };
  if (major) studentFilter.major = major;

  const students = await prisma.student.findMany({
    where: studentFilter,
    select: { student_id: true },
  });

  if (students.length === 0) {
    throw new AppError('Tidak ada siswa yang sesuai kriteria', 404);
  }

  const result = await prisma.examParticipant.createMany({
    data: students.map(s => ({
      exam_id: parseInt(exam_id),
      student_id: s.student_id,
    })),
    skipDuplicates: true,
  });

  res.json({
    message: `${result.count} siswa berhasil ditambahkan ke ujian`,
    students_added: result.count,
  });
});

// POST /api/exams/reassign-students - Clear and re-assign students by grade/major
const reassignStudents = asyncHandler(async (req, res) => {
  const teacher = req.teacher;
  const { exam_id, grade_level, major } = req.body;

  if (!exam_id || !grade_level) {
    throw new AppError('exam_id dan grade_level wajib diisi', 400);
  }

  const exam = await getExamOrFail(exam_id);
  
  // Validate subject access
  validateSubjectAccess(teacher, exam.subject, 'ujian');
  
  guardExamStatus(exam);

  const result = await prisma.$transaction(async (tx) => {
    // Only delete participants that haven't started yet (NOT_STARTED)
    // Keep participants that are IN_PROGRESS, COMPLETED, or GRADED
    const deletedCount = await tx.examParticipant.deleteMany({
      where: {
        exam_id: parseInt(exam_id),
        exam_status: 'NOT_STARTED',
      },
    });

    // Build new student filter
    const studentFilter = { grade_level };
    if (major) studentFilter.major = major;

    const students = await tx.student.findMany({
      where: studentFilter,
      select: { student_id: true },
    });

    let assignedCount = 0;
    if (students.length > 0) {
      const created = await tx.examParticipant.createMany({
        data: students.map(s => ({
          exam_id: parseInt(exam_id),
          student_id: s.student_id,
        })),
        skipDuplicates: true,
      });
      assignedCount = created.count;
    }

    return { removed: deletedCount.count, assigned: assignedCount };
  });

  // Activity log
  await activityLogService.createLog({
    user_id: req.user.id,
    activity_type: 'REASSIGN_STUDENTS',
    description: `${teacher.full_name} melakukan reassign peserta ujian "${exam.exam_name}" (${grade_level} ${major || ''})`,
    metadata: { exam_id: parseInt(exam_id), grade_level, major, removed: result.removed, assigned: result.assigned },
  });

  res.json({
    message: `Peserta berhasil di-reassign. ${result.removed} dihapus, ${result.assigned} ditambahkan.`,
    removed: result.removed,
    assigned: result.assigned,
  });
});

module.exports = {
  createExam,
  getExams,
  getExamById,
  updateExam,
  deleteExam,
  assignQuestionToExam,
  assignBankToExam,
  removeMultipleQuestions,
  removeBankFromExam,
  clearAllQuestions,
  getQuestionsByBank: getQuestionsByBankHandler,
  updateWeightMultiple,
  removeQuestionFromExam,
  assignStudentToExam,
  reassignStudents,
};
