const prisma = require('../config/db');
const activityLogService = require('../services/activityLogService');

// Create Ujian
const createExam = async (req, res) => {
  const {
    exam_name,
    subject,
    grade_level,
    major,
    start_date,
    end_date,
    duration_minutes,
    is_shuffle_questions,
    auto_assign_siswa = true, // Default: auto-assign students
  } = req.body;
  const teacherUserId = req.user.id;

  try {
    const teacher = await prisma.teacher.findUnique({ where: { user_id: teacherUserId } });
    if (!teacher) return res.status(404).json({ error: 'Guru tidak ditemukan' });

    // Input validation
    if (!exam_name || !subject || !grade_level || !start_date || !end_date || !duration_minutes) {
      return res.status(400).json({ error: 'Semua field wajib diisi: exam_name, subject, grade_level, start_date, end_date, duration_minutes' });
    }

    const parsedStart = new Date(start_date);
    const parsedEnd = new Date(end_date);
    if (isNaN(parsedStart.getTime()) || isNaN(parsedEnd.getTime())) {
      return res.status(400).json({ error: 'Format tanggal tidak valid' });
    }
    if (parsedStart >= parsedEnd) {
      return res.status(400).json({ error: 'start_date harus sebelum end_date' });
    }
    if (!Number.isInteger(duration_minutes) || duration_minutes <= 0) {
      return res.status(400).json({ error: 'duration_minutes harus bilangan bulat positif' });
    }

    const exam = await prisma.exam.create({
      data: {
        exam_name: exam_name,
        subject: subject,
        grade_level: grade_level,
        major: major || null,
        start_date: parsedStart,
        end_date: parsedEnd,
        duration_minutes: duration_minutes,
        is_shuffle_questions: is_shuffle_questions || false,
        teacher_id: teacher.teacher_id,
      },
    });

    let studentsAssigned = 0;
    let autoAssignError = null;

    // Auto-assign students if enabled
    if (auto_assign_siswa) {
      try {
        const filters = { grade_level: grade_level };
        if (major) filters.major = major;

        const studentList = await prisma.student.findMany({ where: filters });

        if (studentList.length > 0) {
          const participantData = studentList.map(student => ({
            exam_id: exam.exam_id,
            student_id: student.student_id,
            exam_status: 'NOT_STARTED',
            is_blocked: false,
          }));

          const result = await prisma.examParticipant.createMany({
            data: participantData,
            skipDuplicates: true,
          });

          studentsAssigned = result.count;
        } else {
        }
      } catch (assignError) {
        autoAssignError = 'Gagal melakukan auto-assign siswa';
        // Don't throw - exam is already created
      }
    }

    const response = {
      message: 'Ujian berhasil dibuat',
      exam_id: exam.exam_id,
      auto_assign_enabled: auto_assign_siswa,
      jumlah_siswa_assigned: studentsAssigned,
    };

    // Include warning if auto-assign was attempted but failed
    if (auto_assign_siswa && studentsAssigned === 0 && !autoAssignError) {
      response.warning = 'Tidak ada siswa yang cocok dengan kriteria grade_level dan major';
    }
    if (autoAssignError) {
      response.warning = autoAssignError;
    }

    res.status(201).json(response);
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// Get All Exams (Teacher)
const getExams = async (req, res) => {
  const teacherUserId = req.user.id;

  try {
    const teacher = await prisma.teacher.findUnique({ where: { user_id: teacherUserId } });
    if (!teacher) return res.status(404).json({ error: 'Guru tidak ditemukan' });

    // Show all exams for all teachers
    const exams = await prisma.exam.findMany({
      include: {
        exam_questions: {
          include: { question: true },
        },
        exam_participants: {
          include: { student: true },
        },
      },
      orderBy: { created_at: 'asc' },
    });

    res.json({ ujians: exams });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// Get Exam by ID
const getExamById = async (req, res) => {
  const { id } = req.params;

  try {
    const exam = await prisma.exam.findUnique({
      where: { exam_id: parseInt(id) },
      include: {
        exam_questions: {
          include: {
            question: {
              include: { answer_options: true },
            },
          },
          orderBy: { sequence: 'asc' },
        },
        exam_participants: {
          include: {
            student: true,
            exam_result: true,
          },
        },
      },
    });

    if (!exam) return res.status(404).json({ error: 'Ujian tidak ditemukan' });

    res.json({ ujian: exam });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// Update Exam
const updateExam = async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;
  const teacherUserId = req.user.id;

  try {
    const teacher = await prisma.teacher.findUnique({ where: { user_id: teacherUserId } });
    if (!teacher) return res.status(404).json({ error: 'Guru tidak ditemukan' });

    // Check exam exists
    const exam = await prisma.exam.findUnique({
      where: { exam_id: parseInt(id) },
    });
    if (!exam) return res.status(404).json({ error: 'Ujian tidak ditemukan' });

    // Prevent modification of ONGOING/ENDED exams
    if (exam.exam_status === 'ONGOING' || exam.exam_status === 'ENDED') {
      return res.status(400).json({ error: 'Tidak dapat mengubah ujian yang sedang berlangsung atau telah berakhir' });
    }

    // Update fields from request body
    const dataToUpdate = {};
    if (updateData.exam_name !== undefined) dataToUpdate.exam_name = updateData.exam_name;
    if (updateData.subject !== undefined) dataToUpdate.subject = updateData.subject;
    if (updateData.grade_level !== undefined) dataToUpdate.grade_level = updateData.grade_level;
    if (updateData.major !== undefined) dataToUpdate.major = updateData.major;
    if (updateData.start_date !== undefined) {
      const parsedStart = new Date(updateData.start_date);
      if (isNaN(parsedStart.getTime())) return res.status(400).json({ error: 'Format start_date tidak valid' });
      dataToUpdate.start_date = parsedStart;
    }
    if (updateData.end_date !== undefined) {
      const parsedEnd = new Date(updateData.end_date);
      if (isNaN(parsedEnd.getTime())) return res.status(400).json({ error: 'Format end_date tidak valid' });
      dataToUpdate.end_date = parsedEnd;
    }
    if (updateData.duration_minutes !== undefined) {
      if (!Number.isInteger(updateData.duration_minutes) || updateData.duration_minutes <= 0) {
        return res.status(400).json({ error: 'duration_minutes harus bilangan bulat positif' });
      }
      dataToUpdate.duration_minutes = updateData.duration_minutes;
    }
    if (updateData.is_shuffle_questions !== undefined) dataToUpdate.is_shuffle_questions = updateData.is_shuffle_questions;

    // Validate start < end if both are being updated or one is changing
    const effectiveStart = dataToUpdate.start_date || exam.start_date;
    const effectiveEnd = dataToUpdate.end_date || exam.end_date;
    if (effectiveStart >= effectiveEnd) {
      return res.status(400).json({ error: 'start_date harus sebelum end_date' });
    }

    const updatedExam = await prisma.exam.update({
      where: { exam_id: parseInt(id) },
      data: dataToUpdate,
    });

    // Audit log
    await activityLogService.createLog({
      user_id: teacherUserId,
      activity_type: 'UPDATE_EXAM',
      description: `Teacher updated exam "${exam.exam_name}" (ID: ${id})`,
      metadata: { exam_id: parseInt(id), changes: dataToUpdate },
    });

    res.json({ message: 'Ujian berhasil diupdate', exam: updatedExam });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// Delete Exam
const deleteExam = async (req, res) => {
  const { id } = req.params;
  const teacherUserId = req.user.id;

  try {
    const teacher = await prisma.teacher.findUnique({ where: { user_id: teacherUserId } });
    if (!teacher) return res.status(404).json({ error: 'Guru tidak ditemukan' });

    // Check exam exists
    const exam = await prisma.exam.findUnique({
      where: { exam_id: parseInt(id) },
    });
    if (!exam) return res.status(404).json({ error: 'Ujian tidak ditemukan' });

    // Prevent deletion of ONGOING exams
    if (exam.exam_status === 'ONGOING') {
      return res.status(400).json({ error: 'Tidak dapat menghapus ujian yang sedang berlangsung' });
    }

    await prisma.exam.delete({ where: { exam_id: parseInt(id) } });

    // Audit log
    await activityLogService.createLog({
      user_id: teacherUserId,
      activity_type: 'DELETE_EXAM',
      description: `Teacher deleted exam "${exam.exam_name}" (ID: ${id})`,
      metadata: { exam_id: parseInt(id), exam_name: exam.exam_name },
    });

    res.json({ message: 'Ujian berhasil dihapus' });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// Assign Question to Exam
const assignQuestionToExam = async (req, res) => {
  const { exam_id, question_id, score_weight, sequence } = req.body;
  const teacherUserId = req.user.id;

  try {
    const teacher = await prisma.teacher.findUnique({ where: { user_id: teacherUserId } });
    if (!teacher) return res.status(404).json({ error: 'Guru tidak ditemukan' });

    // Check exam exists
    const exam = await prisma.exam.findUnique({
      where: { exam_id: exam_id },
    });
    if (!exam) return res.status(404).json({ error: 'Ujian tidak ditemukan' });

    const examQuestion = await prisma.examQuestion.create({
      data: {
        exam_id: exam_id,
        question_id: question_id,
        score_weight: score_weight,
        sequence: sequence,
      },
    });

    // Audit log
    await activityLogService.createLog({
      user_id: teacherUserId,
      activity_type: 'ASSIGN_QUESTION_TO_EXAM',
      description: `Teacher assigned question ${question_id} to exam ${exam_id}`,
      metadata: { exam_id, question_id, score_weight, sequence },
    });

    res.status(201).json({ message: 'Soal berhasil ditambahkan ke ujian', exam_question: examQuestion });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// Assign Question Bank to Exam (Batch Assign using question_bank_id)
const assignBankToExam = async (req, res) => {
  const { exam_id, question_bank_id, score_weight_default, is_acak } = req.body;
  const teacherUserId = req.user.id;

  try {
    const teacher = await prisma.teacher.findUnique({ where: { user_id: teacherUserId } });
    if (!teacher) return res.status(404).json({ error: 'Guru tidak ditemukan' });

    // Check exam exists
    const exam = await prisma.exam.findUnique({
      where: { exam_id: exam_id },
    });
    if (!exam) return res.status(404).json({ error: 'Ujian tidak ditemukan' });

    // Get all questions from the bank using question_bank_id
    const questionList = await prisma.question.findMany({
      where: { question_bank_id: parseInt(question_bank_id) },
      orderBy: { created_at: 'asc' },
    });

    if (questionList.length === 0) {
      return res.status(404).json({ error: 'Tidak ada soal yang sesuai kriteria bank' });
    }

    // Get max sequence already in exam
    const maxSequenceResult = await prisma.examQuestion.aggregate({
      where: { exam_id: exam_id },
      _max: { sequence: true },
    });
    let currentSequence = (maxSequenceResult._max.sequence || 0) + 1;

    // Shuffle if is_acak is true (Fisher-Yates algorithm)
    let questionsToAssign = [...questionList];
    if (is_acak) {
      for (let i = questionsToAssign.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [questionsToAssign[i], questionsToAssign[j]] = [questionsToAssign[j], questionsToAssign[i]];
      }
    }

    // Create exam question entries
    const examQuestionData = questionsToAssign.map(question => ({
      exam_id: exam_id,
      question_id: question.question_id,
      score_weight: score_weight_default || 10,
      sequence: currentSequence++,
    }));

    await prisma.examQuestion.createMany({
      data: examQuestionData,
      skipDuplicates: true,
    });

    // Audit log
    await activityLogService.createLog({
      user_id: teacherUserId,
      activity_type: 'ASSIGN_BANK_TO_EXAM',
      description: `Teacher assigned ${questionList.length} questions from bank ${question_bank_id} to exam ${exam_id}`,
      metadata: { exam_id, question_bank_id: parseInt(question_bank_id), count: questionList.length },
    });

    res.status(201).json({
      message: `${questionList.length} soal dari bank berhasil ditambahkan ke ujian`,
      total_questions: questionList.length,
      is_acak: is_acak || false,
    });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// Remove Multiple Questions from Exam (Batch)
const removeMultipleQuestions = async (req, res) => {
  const { exam_id, exam_question_ids } = req.body;
  const teacherUserId = req.user.id;

  try {
    const teacher = await prisma.teacher.findUnique({ where: { user_id: teacherUserId } });
    if (!teacher) return res.status(404).json({ error: 'Guru tidak ditemukan' });

    // Check exam exists
    const exam = await prisma.exam.findUnique({
      where: { exam_id: exam_id },
    });
    if (!exam) return res.status(404).json({ error: 'Ujian tidak ditemukan' });

    // Validate all exam_question_ids belong to this exam
    const examQuestions = await prisma.examQuestion.findMany({
      where: {
        exam_question_id: { in: exam_question_ids },
        exam_id: exam_id,
      },
    });

    if (examQuestions.length !== exam_question_ids.length) {
      return res.status(400).json({ error: 'Ada soal_ujian_id yang tidak valid atau tidak ada di ujian ini' });
    }

    // Delete multiple exam questions
    await prisma.examQuestion.deleteMany({
      where: {
        exam_question_id: { in: exam_question_ids },
      },
    });

    // Audit log
    await activityLogService.createLog({
      user_id: teacherUserId,
      activity_type: 'REMOVE_QUESTIONS_FROM_EXAM',
      description: `Teacher removed ${exam_question_ids.length} questions from exam ${exam_id}`,
      metadata: { exam_id, exam_question_ids, count: exam_question_ids.length },
    });

    res.json({
      message: `${exam_question_ids.length} soal berhasil dihapus dari ujian`,
      jumlah_dihapus: exam_question_ids.length,
    });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// Remove Bank from Exam (using question_bank_id)
const removeBankFromExam = async (req, res) => {
  const { exam_id, question_bank_id } = req.body;
  const teacherUserId = req.user.id;

  try {
    const teacher = await prisma.teacher.findUnique({ where: { user_id: teacherUserId } });
    if (!teacher) return res.status(404).json({ error: 'Guru tidak ditemukan' });

    // Check exam exists
    const exam = await prisma.exam.findUnique({
      where: { exam_id: exam_id },
    });
    if (!exam) return res.status(404).json({ error: 'Ujian tidak ditemukan' });

    // Find all exam questions matching the bank criteria via question_bank_id
    const examQuestions = await prisma.examQuestion.findMany({
      where: {
        exam_id: exam_id,
        question: {
          question_bank_id: parseInt(question_bank_id),
        },
      },
    });

    if (examQuestions.length === 0) {
      return res.status(404).json({ error: 'Tidak ada soal dari bank ini di ujian' });
    }

    // Delete all matching exam questions
    await prisma.examQuestion.deleteMany({
      where: {
        exam_question_id: { in: examQuestions.map(eq => eq.exam_question_id) },
      },
    });

    // Audit log
    await activityLogService.createLog({
      user_id: teacherUserId,
      activity_type: 'REMOVE_BANK_FROM_EXAM',
      description: `Teacher removed ${examQuestions.length} questions from bank ${question_bank_id} from exam ${exam_id}`,
      metadata: { exam_id, question_bank_id: parseInt(question_bank_id), count: examQuestions.length },
    });

    res.json({
      message: `${examQuestions.length} soal dari bank berhasil dihapus dari ujian`,
      jumlah_dihapus: examQuestions.length,
    });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// Clear All Questions from Exam
const clearAllQuestions = async (req, res) => {
  const { examId } = req.params;
  const teacherUserId = req.user.id;

  try {
    const teacher = await prisma.teacher.findUnique({ where: { user_id: teacherUserId } });
    if (!teacher) return res.status(404).json({ error: 'Guru tidak ditemukan' });

    // Check exam exists
    const exam = await prisma.exam.findUnique({
      where: { exam_id: parseInt(examId) },
    });
    if (!exam) return res.status(404).json({ error: 'Ujian tidak ditemukan' });

    // Count questions before delete
    const count = await prisma.examQuestion.count({
      where: { exam_id: parseInt(examId) },
    });

    // Delete all exam questions for this exam
    await prisma.examQuestion.deleteMany({
      where: { exam_id: parseInt(examId) },
    });

    // Audit log
    await activityLogService.createLog({
      user_id: teacherUserId,
      activity_type: 'CLEAR_ALL_QUESTIONS',
      description: `Teacher cleared all ${count} questions from exam ${examId}`,
      metadata: { exam_id: parseInt(examId), count },
    });

    res.json({
      message: `Semua soal berhasil dihapus dari ujian`,
      jumlah_dihapus: count,
    });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// Get Exam Questions Grouped by Bank
const getQuestionsByBank = async (req, res) => {
  const { examId } = req.params;
  const teacherUserId = req.user.id;

  try {
    const teacher = await prisma.teacher.findUnique({ where: { user_id: teacherUserId } });
    if (!teacher) return res.status(404).json({ error: 'Guru tidak ditemukan' });

    // Check exam exists
    const exam = await prisma.exam.findUnique({
      where: { exam_id: parseInt(examId) },
    });
    if (!exam) return res.status(404).json({ error: 'Ujian tidak ditemukan' });

    // Get all exam questions with question details including question bank
    const examQuestions = await prisma.examQuestion.findMany({
      where: { exam_id: parseInt(examId) },
      include: {
        question: {
          include: {
            answer_options: true,
            question_bank: true,
          },
        },
      },
      orderBy: { sequence: 'asc' },
    });

    // Group by question_bank_id
    const grouped = {};
    examQuestions.forEach(eq => {
      const bankKey = eq.question.question_bank_id || `no-bank-${eq.question.subject}-${eq.question.grade_level}-${eq.question.major || 'umum'}`;
      if (!grouped[bankKey]) {
        grouped[bankKey] = {
          question_bank_id: eq.question.question_bank_id || null,
          bank: eq.question.question_bank ? eq.question.question_bank.bank_name : `${eq.question.subject}-${eq.question.grade_level}-${eq.question.major || 'umum'}`,
          subject: eq.question.subject,
          grade_level: eq.question.grade_level,
          major: eq.question.major || 'umum',
          total_questions: 0,
          total_bobot: 0,
          question: [],
        };
      }
      grouped[bankKey].total_questions++;
      grouped[bankKey].total_bobot += eq.score_weight;
      grouped[bankKey].question.push({
        exam_question_id: eq.exam_question_id,
        question_id: eq.question_id,
        sequence: eq.sequence,
        score_weight: eq.score_weight,
        question_type: eq.question.question_type,
        question_text: eq.question.question_text,
        answer_options: eq.question.answer_options,
      });
    });

    const result = Object.values(grouped);

    res.json({
      exam_id: parseInt(examId),
      total_bank: result.length,
      total_questions: examQuestions.length,
      banks: result,
    });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// Update Bobot Multiple Soal
const updateWeightMultiple = async (req, res) => {
  const { exam_id, updates } = req.body;

  try {
    // Validate updates is array and not empty
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ error: 'Updates harus berupa array dan tidak boleh kosong' });
    }

    // Validate exam exists
    const exam = await prisma.exam.findUnique({
      where: { exam_id: exam_id },
    });
    if (!exam) return res.status(404).json({ error: 'Ujian tidak ditemukan' });

    // Validate all exam_question_ids belong to this exam
    const examQuestionIds = updates.map(u => u.exam_question_id);
    const examQuestions = await prisma.examQuestion.findMany({
      where: {
        exam_question_id: { in: examQuestionIds },
        exam_id: exam_id,
      },
    });

    if (examQuestions.length !== updates.length) {
      return res.status(400).json({ error: 'Ada soal_ujian_id yang tidak valid atau tidak ada di ujian ini' });
    }

    // Update each score_weight
    const updatePromises = updates.map(u =>
      prisma.examQuestion.update({
        where: { exam_question_id: u.exam_question_id },
        data: { score_weight: u.score_weight },
      })
    );

    await Promise.all(updatePromises);

    res.json({
      message: `Bobot ${updates.length} soal berhasil diupdate`,
      jumlah_updated: updates.length,
    });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// Remove Question from Exam
const removeQuestionFromExam = async (req, res) => {
  const { id } = req.params; // exam_question_id
  const teacherUserId = req.user.id;

  try {
    const teacher = await prisma.teacher.findUnique({ where: { user_id: teacherUserId } });
    if (!teacher) return res.status(404).json({ error: 'Guru tidak ditemukan' });

    // Check exam question exists
    const examQuestion = await prisma.examQuestion.findUnique({
      where: { exam_question_id: parseInt(id) },
      include: { exam: true },
    });

    if (!examQuestion) {
      return res.status(404).json({ error: 'Soal ujian tidak ditemukan' });
    }

    await prisma.examQuestion.delete({ where: { exam_question_id: parseInt(id) } });

    // Audit log
    await activityLogService.createLog({
      user_id: teacherUserId,
      activity_type: 'REMOVE_QUESTION_FROM_EXAM',
      description: `Teacher removed question from exam ${examQuestion.exam.exam_id}`,
      metadata: { exam_question_id: parseInt(id), exam_id: examQuestion.exam.exam_id },
    });

    res.json({ message: 'Soal berhasil dihapus dari ujian' });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// Assign Students to Exam (by grade_level & major)
const assignStudentToExam = async (req, res) => {
  const { exam_id, grade_level, major } = req.body;
  const teacherUserId = req.user.id;

  try {
    const teacher = await prisma.teacher.findUnique({ where: { user_id: teacherUserId } });
    if (!teacher) return res.status(404).json({ error: 'Guru tidak ditemukan' });

    // Check exam exists
    const exam = await prisma.exam.findUnique({
      where: { exam_id: exam_id },
    });
    if (!exam) return res.status(404).json({ error: 'Ujian tidak ditemukan' });

    // Find students by grade_level & major
    const filters = { grade_level: grade_level };
    if (major) filters.major = major;

    const studentList = await prisma.student.findMany({ where: filters });

    if (studentList.length === 0) {
      return res.status(404).json({ error: 'Tidak ada siswa yang sesuai kriteria' });
    }

    // Create exam participants for each student
    const participantData = studentList.map(student => ({
      exam_id: exam_id,
      student_id: student.student_id,
      exam_status: 'NOT_STARTED',
      is_blocked: false,
    }));

    await prisma.examParticipant.createMany({
      data: participantData,
      skipDuplicates: true,
    });

    // Audit log
    await activityLogService.createLog({
      user_id: teacherUserId,
      activity_type: 'ASSIGN_STUDENTS_TO_EXAM',
      description: `Teacher assigned ${studentList.length} students to exam ${exam_id}`,
      metadata: { exam_id, grade_level, major, count: studentList.length },
    });

    res.status(201).json({
      message: `${studentList.length} siswa berhasil ditambahkan ke ujian`,
      jumlah_siswa: studentList.length,
    });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

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
  getQuestionsByBank,
  updateWeightMultiple,
  removeQuestionFromExam,
  assignStudentToExam
};
