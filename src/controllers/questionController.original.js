const prisma = require('../config/db');

// ==================== QUESTION BANK CRUD ====================

// Create Question Bank
const createQuestionBank = async (req, res) => {
  const { bank_name, description, subject, grade_level, major } = req.body;
  const teacherUserId = req.user.id;

  try {
    const teacher = await prisma.teacher.findUnique({ where: { user_id: teacherUserId } });
    if (!teacher) return res.status(404).json({ error: 'Guru tidak ditemukan' });

    if (!bank_name || !subject || !grade_level) {
      return res.status(400).json({ error: 'bank_name, subject, dan grade_level wajib diisi' });
    }

    // Check if bank_name already exists globally
    const existing = await prisma.questionBank.findUnique({ where: { bank_name } });
    if (existing) {
      return res.status(409).json({ error: `Bank soal dengan nama "${bank_name}" sudah ada` });
    }

    const bank = await prisma.questionBank.create({
      data: {
        bank_name,
        description: description || null,
        subject,
        grade_level,
        major: major || null,
        teacher_id: teacher.teacher_id,
      },
    });

    res.status(201).json({ message: 'Bank soal berhasil dibuat', question_bank: bank });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: `Bank soal dengan nama "${bank_name}" sudah ada` });
    }
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// Update Question Bank
const updateQuestionBank = async (req, res) => {
  const { id } = req.params;
  const { bank_name, description, subject, grade_level, major } = req.body;
  const teacherUserId = req.user.id;

  try {
    const teacher = await prisma.teacher.findUnique({ where: { user_id: teacherUserId } });
    if (!teacher) return res.status(404).json({ error: 'Guru tidak ditemukan' });

    // Check ownership
    const bank = await prisma.questionBank.findFirst({
      where: { question_bank_id: parseInt(id), teacher_id: teacher.teacher_id },
    });
    if (!bank) return res.status(404).json({ error: 'Bank soal tidak ditemukan atau bukan milik Anda' });

    // If bank_name is being changed, check uniqueness
    if (bank_name && bank_name !== bank.bank_name) {
      const existing = await prisma.questionBank.findUnique({ where: { bank_name } });
      if (existing) {
        return res.status(409).json({ error: `Bank soal dengan nama "${bank_name}" sudah ada` });
      }
    }

    const updated = await prisma.questionBank.update({
      where: { question_bank_id: parseInt(id) },
      data: {
        bank_name: bank_name || bank.bank_name,
        description: description !== undefined ? description : bank.description,
        subject: subject || bank.subject,
        grade_level: grade_level || bank.grade_level,
        major: major !== undefined ? major : bank.major,
      },
    });

    res.json({ message: 'Bank soal berhasil diperbarui', question_bank: updated });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: `Bank soal dengan nama "${bank_name}" sudah ada` });
    }
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// Delete Question Bank (and all its questions)
const deleteQuestionBank = async (req, res) => {
  const { id } = req.params;
  const teacherUserId = req.user.id;

  try {
    const teacher = await prisma.teacher.findUnique({ where: { user_id: teacherUserId } });
    if (!teacher) return res.status(404).json({ error: 'Guru tidak ditemukan' });

    const bank = await prisma.questionBank.findFirst({
      where: { question_bank_id: parseInt(id), teacher_id: teacher.teacher_id },
      include: { _count: { select: { questions: true } } },
    });
    if (!bank) return res.status(404).json({ error: 'Bank soal tidak ditemukan atau bukan milik Anda' });

    // Delete the bank (questions cascade or must be handled)
    await prisma.$transaction(async tx => {
      // Delete answer options for all questions in this bank
      await tx.answerOption.deleteMany({
        where: { question: { question_bank_id: parseInt(id) } },
      });
      // Delete exam questions referencing questions in this bank
      await tx.examQuestion.deleteMany({
        where: { question: { question_bank_id: parseInt(id) } },
      });
      // Delete answers referencing questions in this bank
      await tx.answer.deleteMany({
        where: { question: { question_bank_id: parseInt(id) } },
      });
      // Delete all questions in this bank
      await tx.question.deleteMany({
        where: { question_bank_id: parseInt(id) },
      });
      // Delete the bank itself
      await tx.questionBank.delete({
        where: { question_bank_id: parseInt(id) },
      });
    });

    res.json({
      message: `Bank soal "${bank.bank_name}" beserta ${bank._count.questions} soal berhasil dihapus`,
    });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// ==================== QUESTION CRUD ====================

// Create Question with Answer Options (requires question_bank_id)
const createQuestion = async (req, res) => {
  const { question_bank_id, question_type, question_text, subject, grade_level, major, question_image, question_explanation, answer_options } = req.body;
  const teacherUserId = req.user.id;

  try {
    // Find teacher_id from userId
    const teacher = await prisma.teacher.findUnique({ where: { user_id: teacherUserId } });
    if (!teacher) return res.status(404).json({ error: 'Guru tidak ditemukan' });

    if (!question_bank_id) {
      return res.status(400).json({ error: 'question_bank_id wajib diisi. Buat bank soal terlebih dahulu.' });
    }

    // Validate question_type
    const validTypes = ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'ESSAY'];
    if (!question_type || !validTypes.includes(question_type)) {
      return res.status(400).json({ error: `question_type harus salah satu dari: ${validTypes.join(', ')}` });
    }

    // Validate answer_options for non-ESSAY questions
    if (question_type !== 'ESSAY') {
      if (!answer_options || !Array.isArray(answer_options) || answer_options.length < 2) {
        return res.status(400).json({ error: 'Soal pilihan ganda memerlukan minimal 2 opsi jawaban' });
      }
      const correctCount = answer_options.filter(o => o.is_correct).length;
      if (correctCount === 0) {
        return res.status(400).json({ error: 'Minimal harus ada 1 jawaban yang benar' });
      }
      if (question_type === 'SINGLE_CHOICE' && correctCount > 1) {
        return res.status(400).json({ error: 'Soal pilihan tunggal hanya boleh memiliki 1 jawaban benar' });
      }
    }

    // Verify the bank exists and belongs to this teacher
    const bank = await prisma.questionBank.findFirst({
      where: { question_bank_id: parseInt(question_bank_id), teacher_id: teacher.teacher_id },
    });
    if (!bank) return res.status(404).json({ error: 'Bank soal tidak ditemukan atau bukan milik Anda' });

    const result = await prisma.$transaction(async tx => {
      // Create question in the specified bank
      const question = await tx.question.create({
        data: {
          question_type: question_type,
          question_text: question_text,
          subject: subject,
          grade_level: grade_level,
          major: major || null,
          question_image: question_image || null,
          question_explanation: question_explanation || null,
          teacher_id: teacher.teacher_id,
          question_bank_id: parseInt(question_bank_id),
        },
      });

      // If multiple choice, create answer options
      if (question_type !== 'ESSAY' && answer_options && answer_options.length > 0) {
        await tx.answerOption.createMany({
          data: answer_options.map(option => ({
            question_id: question.question_id,
            label: option.label,
            option_text: option.option_text,
            is_correct: option.is_correct || false,
          })),
        });
      }

      return question;
    });

    res.status(201).json({ message: 'Soal berhasil dibuat', question_id: result.question_id });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// Get All Questions (with filters)
const getQuestions = async (req, res) => {
  const { subject, grade_level, major, question_type } = req.query;
  const teacherUserId = req.user.id;

  try {
    const teacher = await prisma.teacher.findUnique({ where: { user_id: teacherUserId } });
    if (!teacher) return res.status(404).json({ error: 'Guru tidak ditemukan' });

    const filters = { teacher_id: teacher.teacher_id };
    if (subject) filters.subject = subject;
    if (grade_level) filters.grade_level = grade_level;
    if (major) filters.major = major;
    if (question_type) filters.question_type = question_type;

    const questions = await prisma.question.findMany({
      where: filters,
      include: {
        answer_options: true,
      },
      orderBy: { created_at: 'desc' },
    });

    res.json({ soals: questions });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// Get Single Question by ID
const getQuestionById = async (req, res) => {
  const { id } = req.params;

  try {
    const question = await prisma.question.findUnique({
      where: { question_id: parseInt(id) },
      include: { answer_options: true },
    });

    if (!question) return res.status(404).json({ error: 'Soal tidak ditemukan' });

    res.json({ soal: question });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// Update Question
const updateQuestion = async (req, res) => {
  const { id } = req.params;
  const { question_text, subject, grade_level, major, question_image, question_explanation, answer_options } = req.body;
  const teacherUserId = req.user.id;

  try {
    const teacher = await prisma.teacher.findUnique({ where: { user_id: teacherUserId } });
    if (!teacher) return res.status(404).json({ error: 'Guru tidak ditemukan' });

    // Check ownership
    const question = await prisma.question.findFirst({
      where: { question_id: parseInt(id), teacher_id: teacher.teacher_id },
    });
    if (!question) return res.status(403).json({ error: 'Soal tidak ditemukan atau bukan milik Anda' });

    const result = await prisma.$transaction(async tx => {
      // Update question
      const updatedQuestion = await tx.question.update({
        where: { question_id: parseInt(id) },
        data: {
          question_text: question_text || question.question_text,
          subject: subject || question.subject,
          grade_level: grade_level || question.grade_level,
          major: major !== undefined ? major : question.major,
          question_image: question_image !== undefined ? question_image : question.question_image,
          question_explanation: question_explanation !== undefined ? question_explanation : question.question_explanation,
        },
      });

      // Update answer options if provided
      if (answer_options && answer_options.length > 0) {
        // Delete old options
        await tx.answerOption.deleteMany({ where: { question_id: parseInt(id) } });

        // Create new options
        await tx.answerOption.createMany({
          data: answer_options.map(option => ({
            question_id: parseInt(id),
            label: option.label,
            option_text: option.option_text,
            is_correct: option.is_correct || false,
          })),
        });
      }

      return updatedQuestion;
    });

    res.json({ message: 'Soal berhasil diupdate', question: result });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// Delete Question
const deleteQuestion = async (req, res) => {
  const { id } = req.params;
  const teacherUserId = req.user.id;

  try {
    const teacher = await prisma.teacher.findUnique({ where: { user_id: teacherUserId } });
    if (!teacher) return res.status(404).json({ error: 'Guru tidak ditemukan' });

    // Check ownership
    const question = await prisma.question.findFirst({
      where: { question_id: parseInt(id), teacher_id: teacher.teacher_id },
    });
    if (!question) return res.status(403).json({ error: 'Soal tidak ditemukan atau bukan milik Anda' });

    await prisma.question.delete({ where: { question_id: parseInt(id) } });

    res.json({ message: 'Soal berhasil dihapus' });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// Get Question Bank (from question_banks table directly)
const getQuestionBank = async (req, res) => {
  const teacherUserId = req.user.id;

  try {
    const teacher = await prisma.teacher.findUnique({ where: { user_id: teacherUserId } });
    if (!teacher) return res.status(404).json({ error: 'Guru tidak ditemukan' });

    // Query question_banks table directly with count
    const questionBanks = await prisma.questionBank.findMany({
      where: { teacher_id: teacher.teacher_id },
      include: {
        _count: {
          select: { questions: true },
        },
        questions: {
          select: { question_type: true },
        },
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
        total_questions: bank._count.questions,
        jumlah_pg: mcCount,
        jumlah_essay: essayCount,
      };
    });

    const totalQuestions = result.reduce((sum, b) => sum + b.total_questions, 0);

    res.json({
      question_bank: result,
      total_grup: result.length,
      total_questions: totalQuestions,
    });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// Get Questions by Specific Bank (using question_bank_id)
const getQuestionsByBank = async (req, res) => {
  const { questionBankId } = req.params;
  const teacherUserId = req.user.id;

  try {
    const teacher = await prisma.teacher.findUnique({ where: { user_id: teacherUserId } });
    if (!teacher) return res.status(404).json({ error: 'Guru tidak ditemukan' });

    // Get bank info
    const bank = await prisma.questionBank.findFirst({
      where: {
        question_bank_id: parseInt(questionBankId),
        teacher_id: teacher.teacher_id,
      },
    });

    if (!bank) return res.status(404).json({ error: 'Bank soal tidak ditemukan' });

    // Get all questions from this specific bank
    const questions = await prisma.question.findMany({
      where: { question_bank_id: bank.question_bank_id },
      include: {
        answer_options: true,
      },
      orderBy: { created_at: 'desc' },
    });

    // Calculate statistics
    const stats = {
      total_questions: questions.length,
      total_pg_single: questions.filter(s => s.question_type === 'SINGLE_CHOICE').length,
      total_pg_multiple: questions.filter(s => s.question_type === 'MULTIPLE_CHOICE').length,
      total_essay: questions.filter(s => s.question_type === 'ESSAY').length,
    };

    res.json({
      bankInfo: {
        question_bank_id: bank.question_bank_id,
        bank_name: bank.bank_name,
        subject: bank.subject,
        grade_level: bank.grade_level,
        major: bank.major,
      },
      soals: questions,
      stats,
    });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// Get Available Questions for Exam (with auto-filter from exam)
const getAvailableQuestionsForExam = async (req, res) => {
  const { exam_id } = req.params;
  const teacherUserId = req.user.id;

  try {
    const teacher = await prisma.teacher.findUnique({ where: { user_id: teacherUserId } });
    if (!teacher) return res.status(404).json({ error: 'Guru tidak ditemukan' });

    // Get exam data
    const exam = await prisma.exam.findFirst({
      where: { exam_id: parseInt(exam_id), teacher_id: teacher.teacher_id },
      include: {
        exam_questions: { select: { question_id: true } },
      },
    });

    if (!exam) return res.status(404).json({ error: 'Ujian tidak ditemukan' });

    // Auto-filter based on exam
    const filters = {
      teacher_id: teacher.teacher_id,
      subject: exam.subject,
      grade_level: exam.grade_level,
    };

    if (exam.major) filters.major = exam.major;

    // Get all matching questions
    const questions = await prisma.question.findMany({
      where: filters,
      select: {
        question_id: true,
        question_type: true,
      },
    });

    // Get already-assigned question IDs
    const usedQuestionIds = exam.exam_questions.map(eq => eq.question_id);
    const availableQuestionIds = questions.filter(s => !usedQuestionIds.includes(s.question_id)).map(s => s.question_id);

    const mcCount = questions.filter(s => s.question_type !== 'ESSAY' && !usedQuestionIds.includes(s.question_id)).length;
    const essayCount = questions.filter(s => s.question_type === 'ESSAY' && !usedQuestionIds.includes(s.question_id)).length;

    res.json({
      exam: {
        exam_id: exam.exam_id,
        exam_name: exam.exam_name,
        subject: exam.subject,
        grade_level: exam.grade_level,
        major: exam.major,
      },
      question_bank: {
        question_ids: availableQuestionIds,
        available_count: availableQuestionIds.length,
        mc_count: mcCount,
        essay_count: essayCount,
        already_used: usedQuestionIds.length,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// Assign All Questions from Bank to Exam (using question_bank_id)
const assignQuestionBankToExam = async (req, res) => {
  const { exam_id, question_bank_id } = req.body;
  const teacherUserId = req.user.id;

  try {
    const teacher = await prisma.teacher.findUnique({ where: { user_id: teacherUserId } });
    if (!teacher) return res.status(404).json({ error: 'Guru tidak ditemukan' });

    // Check ownership exam
    const exam = await prisma.exam.findFirst({
      where: { exam_id: exam_id, teacher_id: teacher.teacher_id },
      include: {
        exam_questions: {
          orderBy: { sequence: 'desc' },
          take: 1,
        },
      },
    });
    if (!exam) return res.status(403).json({ error: 'Ujian tidak ditemukan atau bukan milik Anda' });

    // Get all questions from selected bank
    const questions = await prisma.question.findMany({
      where: { question_bank_id: parseInt(question_bank_id) },
      select: { question_id: true },
    });

    if (questions.length === 0) {
      return res.status(404).json({ error: 'Tidak ada soal di bank tersebut' });
    }

    // Get last sequence
    let currentSequence = exam.exam_questions.length > 0 ? exam.exam_questions[0].sequence : 0;

    // Prepare data for batch insert
    const examQuestionData = questions.map(question => ({
      exam_id: exam_id,
      question_id: question.question_id,
      score_weight: 10,
      sequence: ++currentSequence,
    }));

    // Batch insert
    const result = await prisma.examQuestion.createMany({
      data: examQuestionData,
      skipDuplicates: true,
    });

    res.status(201).json({
      message: `${result.count} soal berhasil ditambahkan ke ujian`,
      question_bank_id: parseInt(question_bank_id),
      questions_added: result.count,
    });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

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
  assignQuestionBankToExam
};
