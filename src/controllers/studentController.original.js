const prisma = require('../config/db');
const activityLogService = require('../services/activityLogService');

// Get Exams assigned to Student
const getMyExams = async (req, res) => {
  const studentUserId = req.user.id;

  try {
    const student = await prisma.student.findUnique({
      where: { user_id: studentUserId },
    });

    if (!student) {
      return res.status(404).json({ error: 'Siswa tidak ditemukan' });
    }

    const examParticipants = await prisma.examParticipant.findMany({
      where: {
        student_id: student.student_id,
        exam: {
          exam_status: {
            in: ['SCHEDULED', 'ONGOING'],
          },
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
            duration_minutes: true,
            exam_status: true,
            is_shuffle_questions: true,
          },
        },
        exam_result: {
          select: {
            final_score: true,
            submit_date: true,
          },
        },
      },
      orderBy: {
        exam: {
          start_date: 'desc',
        },
      },
    });

    res.json({
      exams: examParticipants.map(pu => ({
        exam_participant_id: pu.exam_participant_id,
        exam_status: pu.exam_status,
        is_blocked: pu.is_blocked,
        unlock_code: pu.unlock_code,
        start_time: pu.start_time,
        end_time: pu.end_time,
        exam: pu.exam,
        result: pu.exam_result,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// Start Exam (Student begins working)
const startExam = async (req, res) => {
  const { exam_participant_id, unlock_code } = req.body;
  const studentUserId = req.user.id;

  try {
    const student = await prisma.student.findUnique({
      where: { user_id: studentUserId },
    });

    if (!student) {
      return res.status(404).json({ error: 'Siswa tidak ditemukan' });
    }

    // Get exam participant
    const examParticipant = await prisma.examParticipant.findFirst({
      where: {
        exam_participant_id: parseInt(exam_participant_id),
        student_id: student.student_id,
      },
      include: {
        exam: {
          include: {
            exam_questions: {
              include: {
                question: {
                  include: {
                    answer_options: true,
                  },
                },
              },
              orderBy: { sequence: 'asc' },
            },
          },
        },
      },
    });

    if (!examParticipant) {
      return res.status(404).json({ error: 'Peserta ujian tidak ditemukan' });
    }

    // Check if blocked
    if (examParticipant.is_blocked) {
      // Verify unlock code if provided
      if (!unlock_code || unlock_code !== examParticipant.unlock_code) {
        return res.status(403).json({
          error: 'Ujian terblokir. Silakan minta kode unlock dari pengawas.',
          is_blocked: true,
        });
      }

      // Valid unlock code - unblock
      await prisma.examParticipant.update({
        where: { exam_participant_id: parseInt(exam_participant_id) },
        data: {
          is_blocked: false,
          unlock_code: null,
        },
      });
    }

    // Check if already finished
    if (examParticipant.exam_status === 'COMPLETED' || examParticipant.exam_status === 'GRADED') {
      return res.status(400).json({
        error: 'Ujian sudah selesai dikerjakan',
        status: examParticipant.exam_status,
      });
    }

    // Check exam time window
    const now = new Date();
    const startDate = new Date(examParticipant.exam.start_date);
    const endDate = new Date(examParticipant.exam.end_date);

    if (now < startDate) {
      return res.status(400).json({
        error: 'Ujian belum dimulai',
        start_date: startDate,
      });
    }

    if (now > endDate) {
      return res.status(400).json({
        error: 'Waktu ujian sudah ENDED',
        end_date: endDate,
      });
    }

    // Update status to IN_PROGRESS if NOT_STARTED (atomic to prevent race condition)
    let updatedParticipant = examParticipant;
    if (examParticipant.exam_status === 'NOT_STARTED') {
      const updateResult = await prisma.examParticipant.updateMany({
        where: {
          exam_participant_id: parseInt(exam_participant_id),
          exam_status: 'NOT_STARTED',
        },
        data: {
          exam_status: 'IN_PROGRESS',
          start_time: now,
        },
      });

      if (updateResult.count === 0) {
        return res.status(409).json({ error: 'Ujian sudah dimulai dari perangkat lain' });
      }

      updatedParticipant = await prisma.examParticipant.findUnique({
        where: { exam_participant_id: parseInt(exam_participant_id) },
        include: {
          exam: {
            include: {
              exam_questions: {
                include: {
                  question: {
                    include: {
                      answer_options: true,
                    },
                  },
                },
                orderBy: { sequence: 'asc' },
              },
            },
          },
        },
      });
    }

    // Get existing answers
    const existingAnswers = await prisma.answer.findMany({
      where: { exam_participant_id: parseInt(exam_participant_id) },
    });

    // Prepare question list (hide correct answers)
    const questionList = updatedParticipant.exam.exam_questions.map(su => {
      const answer = existingAnswers.find(j => j.question_id === su.question_id);

      // Check if question has multiple choice options
      const isPilihanGanda = su.question.question_type === 'SINGLE_CHOICE' || su.question.question_type === 'MULTIPLE_CHOICE';

      return {
        exam_question_id: su.exam_question_id,
        sequence: su.sequence,
        score_weight: su.score_weight,
        question: {
          question_id: su.question.question_id,
          question_type: su.question.question_type,
          question_text: su.question.question_text,
          question_image: su.question.question_image,
          answer_options:
            isPilihanGanda && su.question.answer_options
              ? su.question.answer_options.map(option => ({
                  option_id: option.option_id,
                  option_label: option.label,
                  option_text: option.option_text,
                  // Hide is_correct from student
                }))
              : [],
        },
        my_answer: answer
          ? {
              answer_id: answer.answer_id,
              answer_option_id: answer.mc_option_ids ? parseInt(answer.mc_option_ids.split(',')[0]) : null,
              answer_option_ids: answer.mc_option_ids ? answer.mc_option_ids.split(',').map(id => parseInt(id)) : null,
              answer_text: answer.essay_answer_text,
            }
          : null,
      };
    });

    // Log activity
    await activityLogService.createLog({
      user_id: student.user_id,
      exam_participant_id: updatedParticipant.exam_participant_id,
      activity_type: 'START_UJIAN',
      description: `Memulai ujian: ${updatedParticipant.exam.exam_name}`,
      ip_address: activityLogService.getIpAddress(req),
      user_agent: activityLogService.getUserAgent(req),
      metadata: {
        exam_id: updatedParticipant.exam_id,
        total_questions: questionList.length,
        start_time: updatedParticipant.start_time,
      },
    });

    res.json({
      message: 'Ujian berhasil dimulai',
      exam_participant: {
        exam_participant_id: updatedParticipant.exam_participant_id,
        exam_status: updatedParticipant.exam_status,
        start_time: updatedParticipant.start_time,
        duration_minutes: updatedParticipant.exam.duration_minutes,
        exam: {
          exam_id: updatedParticipant.exam.exam_id,
          exam_name: updatedParticipant.exam.exam_name,
          subject: updatedParticipant.exam.subject,
          end_date: updatedParticipant.exam.end_date,
          is_shuffle_questions: updatedParticipant.exam.is_shuffle_questions,
        },
        question_list: questionList,
        total_questions: questionList.length,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// Submit Answer (per question)
const submitAnswer = async (req, res) => {
  const { exam_participant_id, question_id, answer_option_id, answer_option_ids, answer_text } = req.body;
  const studentUserId = req.user.id;

  try {
    const student = await prisma.student.findUnique({
      where: { user_id: studentUserId },
    });

    if (!student) {
      return res.status(404).json({ error: 'Siswa tidak ditemukan' });
    }

    // Verify ownership
    const examParticipant = await prisma.examParticipant.findFirst({
      where: {
        exam_participant_id: parseInt(exam_participant_id),
        student_id: student.student_id,
      },
    });

    if (!examParticipant) {
      return res.status(403).json({ error: 'Anda tidak memiliki akses ke ujian ini' });
    }

    if (examParticipant.exam_status !== 'IN_PROGRESS') {
      return res.status(400).json({
        error: 'Ujian tidak dalam status sedang dikerjakan',
        status: examParticipant.exam_status,
      });
    }

    // Get question to determine correctness
    const question = await prisma.question.findUnique({
      where: { question_id: parseInt(question_id) },
      include: { answer_options: true },
    });

    if (!question) {
      return res.status(404).json({ error: 'Soal tidak ditemukan' });
    }

    // Verify question belongs to this exam
    const examParticipantWithExam = await prisma.examParticipant.findUnique({
      where: { exam_participant_id: parseInt(exam_participant_id) },
      select: { exam_id: true },
    });
    const examQuestion = await prisma.examQuestion.findFirst({
      where: {
        exam_id: examParticipantWithExam.exam_id,
        question_id: parseInt(question_id),
      },
    });
    if (!examQuestion) {
      return res.status(400).json({ error: 'Soal ini tidak termasuk dalam ujian Anda' });
    }

    // Check if answer already exists
    const existingAnswer = await prisma.answer.findFirst({
      where: {
        exam_participant_id: parseInt(exam_participant_id),
        question_id: parseInt(question_id),
      },
    });

    let isCorrect = null;
    let mcAnswerOptionIds = null;
    let essayAnswerText = null;

    // Handle different question types
    if (question.question_type === 'SINGLE_CHOICE') {
      // Single choice - store as string with single ID
      if (answer_option_id) {
        mcAnswerOptionIds = answer_option_id.toString();
        const correctOption = question.answer_options.find(o => o.is_correct);
        isCorrect = correctOption?.option_id === parseInt(answer_option_id);
      }
    } else if (question.question_type === 'MULTIPLE_CHOICE') {
      // Multiple choice - store as comma-separated string
      if (answer_option_ids && Array.isArray(answer_option_ids) && answer_option_ids.length > 0) {
        mcAnswerOptionIds = answer_option_ids.join(',');
      }
    } else if (question.question_type === 'ESSAY') {
      // Essay - store in essay_answer_text
      essayAnswerText = answer_text || null;
    }

    // Check if all fields are empty (user wants to delete answer)
    const isEmptyAnswer = !mcAnswerOptionIds && !essayAnswerText;

    let answer;
    if (existingAnswer) {
      if (isEmptyAnswer) {
        // Delete existing answer if user clears/unselects everything
        await prisma.answer.delete({
          where: { answer_id: existingAnswer.answer_id },
        });

        return res.json({
          message: 'Jawaban berhasil dihapus',
          deleted: true,
          question_id: parseInt(question_id),
        });
      } else {
        // Update existing answer
        answer = await prisma.answer.update({
          where: { answer_id: existingAnswer.answer_id },
          data: {
            mc_option_ids: mcAnswerOptionIds,
            essay_answer_text: essayAnswerText,
            is_correct: isCorrect,
          },
        });
      }
    } else {
      if (isEmptyAnswer) {
        // Don't create empty answer
        return res.json({
          message: 'Tidak ada jawaban untuk disimpan',
          empty: true,
          question_id: parseInt(question_id),
        });
      }

      // Create new answer
      answer = await prisma.answer.create({
        data: {
          exam_participant_id: parseInt(exam_participant_id),
          question_id: parseInt(question_id),
          mc_option_ids: mcAnswerOptionIds,
          essay_answer_text: essayAnswerText,
          is_correct: isCorrect,
        },
      });
    }

    res.json({
      message: 'Jawaban berhasil disimpan',
      answer: {
        answer_id: answer.answer_id,
        question_id: answer.question_id,
        mc_option_ids: answer.mc_option_ids,
        essay_answer_text: answer.essay_answer_text,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// Finish Ujian (Submit final) - Without additional answers
const finishExam = async (req, res) => {
  const { exam_participant_id } = req.body;
  const student_user_id = req.user.id;

  try {
    const student = await prisma.student.findUnique({
      where: { user_id: student_user_id },
    });

    if (!student) {
      return res.status(404).json({ error: 'Siswa tidak ditemukan' });
    }

    // Verify ownership
    const examParticipant = await prisma.examParticipant.findFirst({
      where: {
        exam_participant_id: parseInt(exam_participant_id),
        student_id: student.student_id,
      },
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

    if (!examParticipant) {
      return res.status(403).json({ error: 'Anda tidak memiliki akses ke ujian ini' });
    }

    if (examParticipant.exam_status !== 'IN_PROGRESS') {
      return res.status(400).json({
        error: 'Ujian tidak dalam status sedang dikerjakan',
        status: examParticipant.exam_status,
      });
    }

    // Update status to SELESAI (atomic to prevent race condition)
    const updateResult = await prisma.examParticipant.updateMany({
      where: {
        exam_participant_id: parseInt(exam_participant_id),
        exam_status: 'IN_PROGRESS',
      },
      data: {
        exam_status: 'COMPLETED',
        end_time: new Date(),
      },
    });

    if (updateResult.count === 0) {
      return res.status(409).json({ error: 'Ujian sudah diselesaikan' });
    }

    // Auto-calculate score
    let totalScore = 0;
    let totalWeight = 0;
    let hasEssay = false;

    for (const examQuestion of examParticipant.exam.exam_questions) {
      totalWeight += examQuestion.score_weight;

      const answer = examParticipant.answers.find(j => j.question_id === examQuestion.question_id);

      if (answer && answer.question) {
        const question = answer.question;

        // Check essay questions
        if (question.question_type === 'ESSAY') {
          hasEssay = true;
          // Essay will be graded manually by guru, skip for now
          continue;
        }

        // Check pilihan ganda (single or multiple)
        if (question.question_type === 'SINGLE_CHOICE') {
          // Get the correct answer
          const correctOption = question.answer_options.find(o => o.is_correct);

          if (correctOption && answer.mc_option_ids) {
            const answerOptionId = parseInt(answer.mc_option_ids);
            if (answerOptionId === correctOption.option_id) {
              totalScore += examQuestion.score_weight;
            }
          }
        } else if (question.question_type === 'MULTIPLE_CHOICE') {
          // Get all correct answers
          const correctOptionIds = question.answer_options
            .filter(o => o.is_correct)
            .map(o => o.option_id)
            .sort();

          if (answer.mc_option_ids) {
            const answerIds = answer.mc_option_ids
              .split(',')
              .map(id => parseInt(id.trim()))
              .sort();

            // Check if arrays are equal
            const isCorrect = JSON.stringify(correctOptionIds) === JSON.stringify(answerIds);
            if (isCorrect) {
              totalScore += examQuestion.score_weight;
            }
          }
        }
      }
    }

    // Calculate final score (0-100)
    const finalScore = totalWeight > 0 ? (totalScore / totalWeight) * 100 : 0;

    // Create or update exam result (upsert to prevent race condition)
    const result = await prisma.examResult.upsert({
      where: { exam_participant_id: parseInt(exam_participant_id) },
      update: {
        final_score: finalScore,
        submit_date: new Date(),
      },
      create: {
        exam_participant_id: parseInt(exam_participant_id),
        final_score: finalScore,
        submit_date: new Date(),
      },
    });

    if (!hasEssay) {
      await prisma.examParticipant.update({
        where: { exam_participant_id: parseInt(exam_participant_id) },
        data: { exam_status: 'GRADED' },
      });
    }

    // Log activity
    await activityLogService.createLog({
      user_id: student.user_id,
      exam_participant_id: parseInt(exam_participant_id),
      activity_type: 'FINISH_UJIAN',
      description: `Menyelesaikan ujian: ${examParticipant.exam.exam_name}`,
      ip_address: activityLogService.getIpAddress(req),
      user_agent: activityLogService.getUserAgent(req),
      metadata: {
        exam_id: examParticipant.exam_id,
        final_score: finalScore,
        total_questions: examParticipant.exam.exam_questions.length,
        questions_answered: examParticipant.answers.length,
        has_essay: hasEssay,
        end_time: new Date(),
      },
    });

    res.json({
      message: 'Ujian berhasil diselesaikan',
      result: {
        exam_result_id: result.exam_result_id,
        final_score: finalScore,
        status: hasEssay ? 'Menunggu penilaian essay oleh guru' : 'Selesai dinilai',
        total_questions: examParticipant.exam.exam_questions.length,
        questions_answered: examParticipant.answers.length,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// Report Violation (Student self-reports app lifecycle violation)
const reportViolation = async (req, res) => {
  const { exam_participant_id, violation_type } = req.body;
  const studentUserId = req.user.id;

  try {
    if (!exam_participant_id) {
      return res.status(400).json({ error: 'exam_participant_id harus diisi' });
    }

    const student = await prisma.student.findUnique({
      where: { user_id: studentUserId },
    });

    if (!student) {
      return res.status(404).json({ error: 'Siswa tidak ditemukan' });
    }

    // Verify participant belongs to this student
    const examParticipant = await prisma.examParticipant.findFirst({
      where: {
        exam_participant_id: parseInt(exam_participant_id),
        student_id: student.student_id,
      },
      include: { exam: true },
    });

    if (!examParticipant) {
      return res.status(404).json({ error: 'Peserta ujian tidak ditemukan' });
    }

    // Only block if currently in progress
    if (examParticipant.exam_status !== 'IN_PROGRESS') {
      return res.status(400).json({ error: 'Ujian tidak sedang berlangsung' });
    }

    const reason = violation_type === 'APP_BACKGROUNDED'
      ? 'Terdeteksi keluar dari aplikasi saat ujian berlangsung'
      : violation_type === 'OVERLAY_DETECTED'
        ? 'Terdeteksi menggunakan overlay/split screen saat ujian'
        : 'Terdeteksi pelanggaran saat ujian berlangsung';

    await prisma.examParticipant.update({
      where: { exam_participant_id: parseInt(exam_participant_id) },
      data: {
        is_blocked: true,
        block_reason: reason,
      },
    });

    // Log the violation
    await activityLogService.createLog({
      user_id: studentUserId,
      activity_type: 'EXAM_VIOLATION_DETECTED',
      description: `Violation: ${reason} | Exam: ${examParticipant.exam.exam_name}`,
      metadata: {
        exam_participant_id: parseInt(exam_participant_id),
        violation_type,
        reason,
      },
    });

    res.json({
      success: true,
      message: 'Pelanggaran tercatat. Ujian diblokir.',
      is_blocked: true,
    });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

module.exports = {
  getMyExams,
  startExam,
  submitAnswer,
  finishExam,
  reportViolation,
};
