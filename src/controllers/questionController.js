/**
 * Question Controller - Refactored
 * Uses asyncHandler and resolveTeacher middleware.
 * Teacher lookup eliminated via req.teacher from middleware.
 * Subject-based access control: teachers only see/modify their subject's resources.
 * Coordinators have full access to all resources.
 */
const prisma = require('../config/db');
const { asyncHandler, AppError } = require('../utils/asyncHandler');
const { guardExamStatus } = require('../services/examService');
const activityLogService = require('../services/activityLogService');
const { 
  validateSubjectAccess, 
  buildSubjectFilter, 
  getSubjectForCreate,
  isCoordinator,
} = require('../services/subjectAccessService');

// ==================== QUESTION BANK CRUD ====================

// POST /api/questions/bank - Create Question Bank
const createQuestionBank = asyncHandler(async (req, res) => {
  const teacher = req.teacher;
  const { bank_name, description, subject, grade_level, major } = req.body;

  if (!bank_name || !grade_level) {
    throw new AppError('bank_name dan grade_level wajib diisi', 400);
  }

  // Determine subject: coordinator can specify any, regular teacher uses their own
  const finalSubject = getSubjectForCreate(teacher, subject);

  const existing = await prisma.questionBank.findUnique({ where: { bank_name } });
  if (existing) {
    throw new AppError(`Bank soal dengan nama "${bank_name}" sudah ada`, 409);
  }

  const bank = await prisma.questionBank.create({
    data: {
      bank_name,
      description: description || null,
      subject: finalSubject,
      grade_level,
      major: major || null,
      teacher_id: teacher.teacher_id,
    },
  });

  await activityLogService.logFromRequest(req, 'CREATE_QUESTION_BANK',
    `${teacher.full_name} membuat bank soal "${bank_name}"`,
    { metadata: { question_bank_id: bank.question_bank_id, bank_name, created_by: teacher.teacher_id } });

  res.status(201).json({ message: 'Bank soal berhasil dibuat', question_bank: bank });
});

// PUT /api/questions/bank/:id - Update Question Bank
const updateQuestionBank = asyncHandler(async (req, res) => {
  const teacher = req.teacher;
  const { id } = req.params;
  const { bank_name, description, subject, grade_level, major } = req.body;

  const bank = await prisma.questionBank.findUnique({
    where: { question_bank_id: parseInt(id) },
  });
  if (!bank) throw new AppError('Bank soal tidak ditemukan', 404);

  // Validate subject access
  validateSubjectAccess(teacher, bank.subject, 'bank soal');

  // Check uniqueness if name is changing
  if (bank_name && bank_name !== bank.bank_name) {
    const existing = await prisma.questionBank.findUnique({ where: { bank_name } });
    if (existing) throw new AppError(`Bank soal dengan nama "${bank_name}" sudah ada`, 409);
  }

  // Validate new subject if changing (only coordinator can change to different subject)
  let finalSubject = bank.subject;
  if (subject && subject !== bank.subject) {
    if (!isCoordinator(teacher)) {
      throw new AppError('Hanya koordinator yang dapat mengubah mata pelajaran bank soal', 403);
    }
    finalSubject = subject;
  }

  const updated = await prisma.questionBank.update({
    where: { question_bank_id: parseInt(id) },
    data: {
      bank_name: bank_name || bank.bank_name,
      description: description !== undefined ? description : bank.description,
      subject: finalSubject,
      grade_level: grade_level || bank.grade_level,
      major: major !== undefined ? major : bank.major,
    },
  });

  await activityLogService.logFromRequest(req, 'UPDATE_QUESTION_BANK',
    `${teacher.full_name} memperbarui bank soal "${updated.bank_name}"`,
    { metadata: { question_bank_id: parseInt(id), bank_name: updated.bank_name, updated_by: teacher.teacher_id } });

  res.json({ message: 'Bank soal berhasil diperbarui', question_bank: updated });
});

// DELETE /api/questions/bank/:id - Delete Question Bank
const deleteQuestionBank = asyncHandler(async (req, res) => {
  const teacher = req.teacher;
  const { id } = req.params;

  const bank = await prisma.questionBank.findUnique({
    where: { question_bank_id: parseInt(id) },
    include: { _count: { select: { questions: true } } },
  });
  if (!bank) throw new AppError('Bank soal tidak ditemukan', 404);

  // Validate subject access
  validateSubjectAccess(teacher, bank.subject, 'bank soal');

  // B3: Prevent deleting bank with questions assigned to active exams
  const activeUsage = await prisma.examQuestion.findFirst({
    where: {
      question: { question_bank_id: parseInt(id) },
      exam: { exam_status: { in: ['SCHEDULED', 'ONGOING'] } },
    },
  });
  if (activeUsage) throw new AppError('Bank soal memiliki soal yang masih digunakan di ujian aktif', 400);

  await prisma.$transaction(async (tx) => {
    await tx.answerOption.deleteMany({ where: { question: { question_bank_id: parseInt(id) } } });
    await tx.examQuestion.deleteMany({ where: { question: { question_bank_id: parseInt(id) } } });
    await tx.answer.deleteMany({ where: { question: { question_bank_id: parseInt(id) } } });
    await tx.question.deleteMany({ where: { question_bank_id: parseInt(id) } });
    await tx.questionBank.delete({ where: { question_bank_id: parseInt(id) } });
  });

  await activityLogService.logFromRequest(req, 'DELETE_QUESTION_BANK',
    `${teacher.full_name} menghapus bank soal "${bank.bank_name}" (${bank._count.questions} soal)`,
    { metadata: { question_bank_id: parseInt(id), bank_name: bank.bank_name, deleted_by: teacher.teacher_id } });

  res.json({
    message: `Bank soal "${bank.bank_name}" beserta ${bank._count.questions} soal berhasil dihapus`,
  });
});

// ==================== QUESTION CRUD ====================

// POST /api/questions - Create Question
const createQuestion = asyncHandler(async (req, res) => {
  const teacher = req.teacher;
  const {
    question_bank_id, question_type, question_text, subject, grade_level,
    major, question_image, question_explanation, answer_options,
  } = req.body;

  if (!question_bank_id) {
    throw new AppError('question_bank_id wajib diisi. Buat bank soal terlebih dahulu.', 400);
  }

  const validTypes = ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'ESSAY'];
  if (!question_type || !validTypes.includes(question_type)) {
    throw new AppError(`question_type harus salah satu dari: ${validTypes.join(', ')}`, 400);
  }
  if (!question_text) {
    throw new AppError('question_text wajib diisi', 400);
  }

  if (question_type !== 'ESSAY') {
    if (!answer_options || !Array.isArray(answer_options) || answer_options.length < 2) {
      throw new AppError('Soal pilihan ganda memerlukan minimal 2 opsi jawaban', 400);
    }
    const correctCount = answer_options.filter(o => o.is_correct).length;
    if (correctCount === 0) {
      throw new AppError('Minimal harus ada 1 jawaban yang benar', 400);
    }
    if (question_type === 'SINGLE_CHOICE' && correctCount > 1) {
      throw new AppError('Soal pilihan tunggal hanya boleh memiliki 1 jawaban benar', 400);
    }
  }

  const bank = await prisma.questionBank.findUnique({
    where: { question_bank_id: parseInt(question_bank_id) },
  });
  if (!bank) throw new AppError('Bank soal tidak ditemukan', 404);

  // Validate subject access to the bank
  validateSubjectAccess(teacher, bank.subject, 'bank soal');

  // Keep question dimensions aligned with its bank to avoid mixed bank metadata.
  if (subject && subject !== bank.subject) {
    throw new AppError('Mata pelajaran soal harus sama dengan mata pelajaran bank soal', 400);
  }
  if (grade_level && grade_level !== bank.grade_level) {
    throw new AppError('Tingkat soal harus sama dengan tingkat bank soal', 400);
  }
  const requestedMajor = major ?? null;
  const bankMajor = bank.major ?? null;
  if (major !== undefined && requestedMajor !== bankMajor) {
    throw new AppError('Jurusan soal harus sama dengan jurusan bank soal', 400);
  }

  const result = await prisma.$transaction(async (tx) => {
    const question = await tx.question.create({
      data: {
        question_type,
        question_text,
        subject: bank.subject,
        grade_level: bank.grade_level,
        major: bankMajor,
        question_image: question_image || null,
        question_explanation: question_explanation || null,
        teacher_id: teacher.teacher_id,
        question_bank_id: parseInt(question_bank_id),
      },
    });

    if (question_type !== 'ESSAY' && answer_options?.length > 0) {
      await tx.answerOption.createMany({
        data: answer_options.map(opt => ({
          question_id: question.question_id,
          label: opt.label,
          option_text: opt.option_text,
          is_correct: opt.is_correct ?? false,
        })),
      });
    }

    return question;
  });

  await activityLogService.logFromRequest(req, 'CREATE_QUESTION',
    `${teacher.full_name} membuat soal #${result.question_id} di bank soal #${question_bank_id}`,
    { metadata: { question_id: result.question_id, question_bank_id: parseInt(question_bank_id), created_by: teacher.teacher_id } });

  res.status(201).json({ message: 'Soal berhasil dibuat', question_id: result.question_id });
});

// GET /api/questions - Get all questions (with filters and pagination)
const getQuestions = asyncHandler(async (req, res) => {
  const teacher = req.teacher;
  const { subject, grade_level, major, question_type, page: pageStr, limit: limitStr } = req.query;

  // Build subject filter based on teacher's subject (coordinator sees all)
  const subjectFilter = buildSubjectFilter(teacher);
  
  const filters = { ...subjectFilter };
  // Allow additional subject filter from query only if coordinator or matches teacher's subject
  if (subject) {
    if (isCoordinator(teacher) || subject === teacher.subject) {
      filters.subject = subject;
    }
  }
  if (grade_level) filters.grade_level = grade_level;
  if (major) filters.major = major;
  if (question_type) filters.question_type = question_type;

  const page = Math.max(1, parseInt(pageStr) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(limitStr) || 50));
  const skip = (page - 1) * limit;

  const [questions, total] = await Promise.all([
    prisma.question.findMany({
      where: filters,
      include: { answer_options: true },
      orderBy: { created_at: 'desc' },
      skip,
      take: limit,
    }),
    prisma.question.count({ where: filters }),
  ]);

  res.json({
    questions,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// GET /api/questions/:id - Get single question
const getQuestionById = asyncHandler(async (req, res) => {
  const teacher = req.teacher;
  const question = await prisma.question.findUnique({
    where: { question_id: parseInt(req.params.id) },
    include: { answer_options: true },
  });

  if (!question) throw new AppError('Soal tidak ditemukan', 404);

  // Validate subject access
  validateSubjectAccess(teacher, question.subject, 'soal');

  res.json({ question });
});

// PUT /api/questions/:id - Update question
const updateQuestion = asyncHandler(async (req, res) => {
  const teacher = req.teacher;
  const { id } = req.params;
  const { question_text, subject, grade_level, major, question_image, question_explanation, answer_options } = req.body;

  const question = await prisma.question.findUnique({
    where: { question_id: parseInt(id) },
    include: {
      question_bank: {
        select: { subject: true, grade_level: true, major: true },
      },
    },
  });
  if (!question) throw new AppError('Soal tidak ditemukan', 404);

  // Validate subject access
  validateSubjectAccess(teacher, question.subject, 'soal');

  // Validate new subject if changing (only coordinator can change to different subject)
  let finalSubject = question.subject;
  if (subject && subject !== question.subject) {
    if (!isCoordinator(teacher)) {
      throw new AppError('Hanya koordinator yang dapat mengubah mata pelajaran soal', 403);
    }
    finalSubject = subject;
  }
  if (finalSubject !== question.question_bank.subject) {
    throw new AppError('Mata pelajaran soal harus sama dengan mata pelajaran bank soal', 400);
  }

  const finalGradeLevel = grade_level || question.grade_level;
  if (finalGradeLevel !== question.question_bank.grade_level) {
    throw new AppError('Tingkat soal harus sama dengan tingkat bank soal', 400);
  }

  const finalMajor = major !== undefined ? major : question.major;
  const normalizedFinalMajor = finalMajor ?? null;
  const normalizedBankMajor = question.question_bank.major ?? null;
  if (normalizedFinalMajor !== normalizedBankMajor) {
    throw new AppError('Jurusan soal harus sama dengan jurusan bank soal', 400);
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.question.update({
      where: { question_id: parseInt(id) },
      data: {
        question_text: question_text || question.question_text,
        subject: finalSubject,
        grade_level: finalGradeLevel,
        major: normalizedFinalMajor,
        question_image: question_image !== undefined ? question_image : question.question_image,
        question_explanation: question_explanation !== undefined ? question_explanation : question.question_explanation,
      },
    });

    if (answer_options?.length > 0) {
      // Block answer_options on ESSAY questions
      if (question.question_type === 'ESSAY') {
        throw new AppError('Soal essay tidak memerlukan opsi jawaban', 400);
      }

      // B5: Validate answer options on update (same rules as createQuestion)
      if (answer_options.length < 2) {
        throw new AppError('Soal pilihan ganda memerlukan minimal 2 opsi jawaban', 400);
      }
      const correctCount = answer_options.filter(o => o.is_correct).length;
      if (correctCount === 0) {
        throw new AppError('Minimal harus ada 1 jawaban yang benar', 400);
      }
      if (question.question_type === 'SINGLE_CHOICE' && correctCount > 1) {
        throw new AppError('Soal pilihan tunggal hanya boleh memiliki 1 jawaban benar', 400);
      }

      await tx.answerOption.deleteMany({ where: { question_id: parseInt(id) } });
      await tx.answerOption.createMany({
        data: answer_options.map(opt => ({
          question_id: parseInt(id),
          label: opt.label,
          option_text: opt.option_text,
          is_correct: opt.is_correct ?? false,
        })),
      });
    }

    return updated;
  });

  await activityLogService.logFromRequest(req, 'UPDATE_QUESTION',
    `${teacher.full_name} memperbarui soal #${id}`,
    { metadata: { question_id: parseInt(id), updated_by: teacher.teacher_id } });

  res.json({ message: 'Soal berhasil diupdate', question: result });
});

// DELETE /api/questions/:id - Delete question
const deleteQuestion = asyncHandler(async (req, res) => {
  const teacher = req.teacher;
  const { id } = req.params;

  const question = await prisma.question.findUnique({
    where: { question_id: parseInt(id) },
  });
  if (!question) throw new AppError('Soal tidak ditemukan', 404);

  // Validate subject access
  validateSubjectAccess(teacher, question.subject, 'soal');

  // B3: Prevent deleting questions assigned to active exams
  const activeUsage = await prisma.examQuestion.findFirst({
    where: {
      question_id: parseInt(id),
      exam: { exam_status: { in: ['SCHEDULED', 'ONGOING'] } },
    },
  });
  if (activeUsage) throw new AppError('Soal masih digunakan di ujian aktif', 400);

  await prisma.question.delete({ where: { question_id: parseInt(id) } });

  await activityLogService.logFromRequest(req, 'DELETE_QUESTION',
    `${teacher.full_name} menghapus soal #${id}`,
    { metadata: { question_id: parseInt(id), deleted_by: teacher.teacher_id } });

  res.json({ message: 'Soal berhasil dihapus' });
});

// GET /api/questions/banks - Get all question banks
const getQuestionBank = asyncHandler(async (req, res) => {
  const teacher = req.teacher;
  
  // Build subject filter based on teacher's subject (coordinator sees all)
  const subjectFilter = buildSubjectFilter(teacher);

  const questionBanks = await prisma.questionBank.findMany({
    where: subjectFilter,
    include: {
      teacher: { select: { teacher_id: true, full_name: true } },
      _count: { select: { questions: true } },
      questions: { select: { question_type: true } },
    },
    orderBy: { created_at: 'desc' },
  });

  const result = questionBanks.map(bank => {
    const mcCount = bank.questions.filter(s => s.question_type !== 'ESSAY').length;
    const essayCount = bank.questions.filter(s => s.question_type === 'ESSAY').length;
    return {
      question_bank_id: bank.question_bank_id,
      bank_name: bank.bank_name,
      description: bank.description,
      subject: bank.subject,
      grade_level: bank.grade_level,
      major: bank.major,
      teacher: bank.teacher,
      total_questions: bank._count.questions,
      mc_count: mcCount,
      essay_count: essayCount,
    };
  });

  res.json({
    question_bank: result,
    total_banks: result.length,
    total_questions: result.reduce((sum, b) => sum + b.total_questions, 0),
  });
});

// GET /api/questions/bank/:questionBankId - Get questions by bank
const getQuestionsByBank = asyncHandler(async (req, res) => {
  const teacher = req.teacher;
  const { questionBankId } = req.params;

  const bank = await prisma.questionBank.findUnique({
    where: { question_bank_id: parseInt(questionBankId) },
  });
  if (!bank) throw new AppError('Bank soal tidak ditemukan', 404);

  // Validate subject access
  validateSubjectAccess(teacher, bank.subject, 'bank soal');

  const questions = await prisma.question.findMany({
    where: { question_bank_id: bank.question_bank_id },
    include: { answer_options: true },
    orderBy: { created_at: 'desc' },
  });

  res.json({
    bankInfo: {
      question_bank_id: bank.question_bank_id,
      bank_name: bank.bank_name,
      subject: bank.subject,
      grade_level: bank.grade_level,
      major: bank.major,
    },
    questions,
    stats: {
      total_questions: questions.length,
      total_pg_single: questions.filter(s => s.question_type === 'SINGLE_CHOICE').length,
      total_pg_multiple: questions.filter(s => s.question_type === 'MULTIPLE_CHOICE').length,
      total_essay: questions.filter(s => s.question_type === 'ESSAY').length,
    },
  });
});

// GET /api/questions/available/:exam_id - Get available questions for exam (subject-based access)
const getAvailableQuestionsForExam = asyncHandler(async (req, res) => {
  const teacher = req.teacher;
  const { exam_id } = req.params;

  const exam = await prisma.exam.findUnique({
    where: { exam_id: parseInt(exam_id) },
    include: { exam_questions: { select: { question_id: true } } },
  });
  if (!exam) throw new AppError('Ujian tidak ditemukan', 404);

  // Validate subject access to the exam
  validateSubjectAccess(teacher, exam.subject, 'ujian');

  const filters = {
    subject: exam.subject,
    grade_level: exam.grade_level,
  };
  if (exam.major) filters.major = exam.major;

  const questions = await prisma.question.findMany({
    where: filters,
    select: { question_id: true, question_type: true },
  });

  const usedIds = new Set(exam.exam_questions.map(eq => eq.question_id));
  const available = questions.filter(q => !usedIds.has(q.question_id));

  res.json({
    exam: {
      exam_id: exam.exam_id,
      exam_name: exam.exam_name,
      subject: exam.subject,
      grade_level: exam.grade_level,
      major: exam.major,
    },
    question_bank: {
      question_ids: available.map(q => q.question_id),
      available_count: available.length,
      mc_count: available.filter(q => q.question_type !== 'ESSAY').length,
      essay_count: available.filter(q => q.question_type === 'ESSAY').length,
      already_used: usedIds.size,
    },
  });
});

// POST /api/questions/assign-bank - Assign question bank to exam (subject-based access)
const assignQuestionBankToExam = asyncHandler(async (req, res) => {
  const teacher = req.teacher;
  const { exam_id, question_bank_id } = req.body;

  if (!exam_id || !question_bank_id) {
    throw new AppError('exam_id dan question_bank_id wajib diisi', 400);
  }

  const exam = await prisma.exam.findUnique({
    where: { exam_id: parseInt(exam_id) },
    include: { exam_questions: { orderBy: { sequence: 'desc' }, take: 1 } },
  });
  if (!exam) throw new AppError('Ujian tidak ditemukan', 404);

  // Validate subject access to the exam
  validateSubjectAccess(teacher, exam.subject, 'ujian');

  guardExamStatus(exam);

  const bank = await prisma.questionBank.findUnique({
    where: { question_bank_id: parseInt(question_bank_id) },
  });
  if (!bank) throw new AppError('Bank soal tidak ditemukan', 404);

  // Validate subject access to the question bank
  validateSubjectAccess(teacher, bank.subject, 'bank soal');

  if (bank.subject !== exam.subject) {
    throw new AppError('Bank soal harus memiliki mata pelajaran yang sama dengan ujian', 400);
  }
  if (bank.grade_level !== exam.grade_level) {
    throw new AppError('Bank soal harus memiliki tingkat yang sama dengan ujian', 400);
  }
  if (exam.major && bank.major !== exam.major) {
    throw new AppError('Bank soal harus memiliki jurusan yang sama dengan ujian', 400);
  }

  const questions = await prisma.question.findMany({
    where: { question_bank_id: parseInt(question_bank_id) },
    select: { question_id: true },
  });

  if (questions.length === 0) {
    throw new AppError('Tidak ada soal di bank tersebut', 404);
  }

  let currentSequence = exam.exam_questions.length > 0 ? exam.exam_questions[0].sequence : 0;

  const result = await prisma.examQuestion.createMany({
    data: questions.map(q => ({
      exam_id: parseInt(exam_id),
      question_id: q.question_id,
      score_weight: 10,
      sequence: ++currentSequence,
    })),
    skipDuplicates: true,
  });

  res.status(201).json({
    message: `${result.count} soal berhasil ditambahkan ke ujian`,
    question_bank_id: parseInt(question_bank_id),
    questions_added: result.count,
  });
});

module.exports = {
  createQuestionBank,
  updateQuestionBank,
  deleteQuestionBank,
  createQuestion,
  getQuestions,
  getQuestionById,
  updateQuestion,
  deleteQuestion,
  getQuestionBank,
  getQuestionsByBank,
  getAvailableQuestionsForExam,
  assignQuestionBankToExam,
};
