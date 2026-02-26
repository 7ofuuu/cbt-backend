const prisma = require('../config/db');

const activityLogService = require('../services/activityLogService');

// Get Exam Result by Participant ID
const getResultByParticipant = async (req, res) => {
  const { exam_participant_id } = req.params;

  try {
    const result = await prisma.examResult.findUnique({
      where: { exam_participant_id: parseInt(exam_participant_id) },
      include: {
        exam_participant: {
          include: {
            student: {
              select: {
                student_id: true,
                full_name: true,
                classroom: true,
                grade_level: true,
                major: true,
              },
            },
            exam: {
              select: {
                exam_id: true,
                exam_name: true,
                subject: true,
                start_date: true,
                end_date: true,
              },
            },
            answers: {
              include: {
                question: {
                  select: {
                    question_id: true,
                    question_text: true,
                    question_type: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!result) {
      return res.status(404).json({ error: 'Hasil ujian tidak ditemukan' });
    }

    res.json({ result });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// Get All Exam Results by Exam ID (for Teacher)
const getResultByExam = async (req, res) => {
  const { exam_id } = req.params;

  try {
    // Verify exam exists (no ownership check - any teacher can view)
    const exam = await prisma.exam.findUnique({
      where: { exam_id: parseInt(exam_id) },
    });
    if (!exam) return res.status(404).json({ error: 'Ujian tidak ditemukan' });

    // Get all results for this exam
    const resultList = await prisma.examResult.findMany({
      where: {
        exam_participant: {
          exam_id: parseInt(exam_id),
        },
      },
      include: {
        exam_participant: {
          include: {
            student: {
              select: {
                student_id: true,
                full_name: true,
                classroom: true,
                grade_level: true,
                major: true,
              },
            },
          },
        },
      },
      orderBy: {
        final_score: 'desc',
      },
    });

    res.json({
      exam: {
        exam_id: exam.exam_id,
        exam_name: exam.exam_name,
        subject: exam.subject,
      },
      total_participants: resultList.length,
      results: resultList,
    });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// Get Exam Results for Student (their own results)
const getMyResults = async (req, res) => {
  const studentUserId = req.user.id;

  try {
    const student = await prisma.student.findUnique({ where: { user_id: studentUserId } });
    if (!student) return res.status(404).json({ error: 'Siswa tidak ditemukan' });

    const resultList = await prisma.examResult.findMany({
      where: {
        exam_participant: {
          student_id: student.student_id,
        },
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
      orderBy: {
        submit_date: 'desc',
      },
    });

    res.json({ results: resultList });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// Create or Update Exam Result (Auto-grading for multiple choice)
const calculateAndSaveResult = async (req, res) => {
  const { exam_participant_id } = req.body;

  try {
    // Get exam participant with all answers and question details
    const examParticipant = await prisma.examParticipant.findUnique({
      where: { exam_participant_id: parseInt(exam_participant_id) },
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
      return res.status(404).json({ error: 'Peserta ujian tidak ditemukan' });
    }

    // Calculate total score
    let totalScore = 0;
    let totalWeight = 0;

    for (const examQuestion of examParticipant.exam.exam_questions) {
      totalWeight += examQuestion.score_weight;

      const answer = examParticipant.answers.find(j => j.question_id === examQuestion.question_id);

      if (answer && answer.is_correct) {
        totalScore += examQuestion.score_weight;
      } else if (answer && answer.manual_score !== null) {
        // For essay questions graded manually
        const percentageOfWeight = (answer.manual_score / 100) * examQuestion.score_weight;
        totalScore += percentageOfWeight;
      }
    }

    // Calculate final score (0-100)
    const finalScore = totalWeight > 0 ? (totalScore / totalWeight) * 100 : 0;

    // Create or update exam result
    const result = await prisma.examResult.upsert({
      where: { exam_participant_id: parseInt(exam_participant_id) },
      update: {
        final_score: finalScore,
        submit_date: new Date(),
      },
      create: {
        exam_participant_id: parseInt(exam_participant_id),
        final_score: finalScore,
      },
    });

    // Update exam participant status
    await prisma.examParticipant.update({
      where: { exam_participant_id: parseInt(exam_participant_id) },
      data: { exam_status: 'GRADED' },
    });

    res.json({
      message: 'Hasil ujian berhasil dihitung',
      result: {
        exam_result_id: result.exam_result_id,
        final_score: result.final_score,
        total_score: totalScore,
        total_weight: totalWeight,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// Update Manual Score (for essay questions)
const updateManualScore = async (req, res) => {
  const { answer_id, manual_score } = req.body;
  const teacherUserId = req.user.id;

  try {
    // Get answer (no ownership check - any teacher can grade)
    const answer = await prisma.answer.findUnique({
      where: { answer_id: parseInt(answer_id) },
      include: {
        exam_participant: {
          include: {
            exam: true,
          },
        },
      },
    });

    if (!answer) {
      return res.status(404).json({ error: 'Jawaban tidak ditemukan' });
    }

    // Validate manual_score range
    const score = parseFloat(manual_score);
    if (isNaN(score) || score < 0 || score > 100) {
      return res.status(400).json({ error: 'Nilai manual harus antara 0 dan 100' });
    }

    // Update manual score
    const updatedAnswer = await prisma.answer.update({
      where: { answer_id: parseInt(answer_id) },
      data: { manual_score: score },
    });

    // Audit log
    await activityLogService.createLog({
      user_id: teacherUserId,
      activity_type: 'UPDATE_MANUAL_SCORE',
      description: `Teacher updated manual score for answer ${answer_id} to ${manual_score}`,
      metadata: {
        answer_id: parseInt(answer_id),
        manual_score: parseFloat(manual_score),
        exam_id: answer.exam_participant.exam.exam_id,
      },
    });

    res.json({
      message: 'Nilai manual berhasil diupdate',
      answer: updatedAnswer,
    });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// Get Detailed Result with All Answers (for review)
const getDetailedResult = async (req, res) => {
  const { exam_participant_id } = req.params;

  try {
    const result = await prisma.examResult.findUnique({
      where: { exam_participant_id: parseInt(exam_participant_id) },
      include: {
        exam_participant: {
          include: {
            student: true,
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
        },
      },
    });

    if (!result) {
      return res.status(404).json({ error: 'Hasil ujian tidak ditemukan' });
    }

    // Map answers to questions for easier review
    const detailedReview = result.exam_participant.exam.exam_questions.map(examQuestion => {
      const answer = result.exam_participant.answers.find(j => j.question_id === examQuestion.question_id);

      return {
        sequence: examQuestion.sequence,
        question: examQuestion.question,
        score_weight: examQuestion.score_weight,
        answer: answer || null,
        is_correct: answer?.is_correct,
        score_obtained: answer?.is_correct ? examQuestion.score_weight : answer?.manual_score || 0,
      };
    });

    res.json({
      exam_result: {
        exam_result_id: result.exam_result_id,
        final_score: result.final_score,
        submit_date: result.submit_date,
      },
      student: result.exam_participant.student,
      exam: {
        exam_id: result.exam_participant.exam.exam_id,
        exam_name: result.exam_participant.exam.exam_name,
        subject: result.exam_participant.exam.subject,
      },
      review: detailedReview,
    });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// Get All Completed Exams (for Teacher)
const getCompletedExams = async (req, res) => {
  const teacherUserId = req.user.id;

  try {
    const teacher = await prisma.teacher.findUnique({ where: { user_id: teacherUserId } });
    if (!teacher) return res.status(404).json({ error: 'Guru tidak ditemukan' });

    // Get exams that are completed (ENDED status)
    const completedExams = await prisma.exam.findMany({
      where: {
        teacher_id: teacher.teacher_id,
        exam_status: 'ENDED',
      },
      include: {
        _count: {
          select: {
            exam_participants: true,
            exam_questions: true,
          },
        },
        exam_participants: {
          where: {
            exam_status: {
              in: ['COMPLETED', 'GRADED'],
            },
          },
          include: {
            exam_result: {
              select: {
                final_score: true,
                submit_date: true,
              },
            },
            student: {
              select: {
                student_id: true,
                full_name: true,
                classroom: true,
              },
            },
          },
        },
      },
      orderBy: {
        end_date: 'desc',
      },
    });

    // Format response with statistics
    const formattedExams = completedExams.map(exam => {
      const totalParticipants = exam._count.exam_participants;
      const completedParticipants = exam.exam_participants.length;
      const scoreList = exam.exam_participants
        .filter(p => p.exam_result)
        .map(p => p.exam_result.final_score);

      const statistics = {
        total_participants: totalParticipants,
        total_completed: completedParticipants,
        total_questions: exam._count.exam_questions,
        highest_score: scoreList.length > 0 ? Math.max(...scoreList) : 0,
        lowest_score: scoreList.length > 0 ? Math.min(...scoreList) : 0,
        average_score: scoreList.length > 0 
          ? (scoreList.reduce((a, b) => a + b, 0) / scoreList.length).toFixed(2)
          : 0,
      };

      return {
        exam_id: exam.exam_id,
        exam_name: exam.exam_name,
        subject: exam.subject,
        grade_level: exam.grade_level,
        major: exam.major,
        start_date: exam.start_date,
        end_date: exam.end_date,
        duration_minutes: exam.duration_minutes,
        exam_status: exam.exam_status,
        statistics,
        participant_results: exam.exam_participants.map(p => ({
          exam_participant_id: p.exam_participant_id,
          student: {
            student_id: p.student.student_id,
            full_name: p.student.full_name,
            classroom: p.student.classroom,
          },
          exam_status: p.exam_status,
          start_time: p.start_time,
          end_time: p.end_time,
          final_score: p.exam_result?.final_score || null,
          submit_date: p.exam_result?.submit_date || null,
        })),
      };
    });

    res.json({
      total_completed_exams: formattedExams.length,
      exams: formattedExams,
    });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

module.exports = {
  getResultByParticipant,
  getResultByExam,
  getMyResults,
  calculateAndSaveResult,
  updateManualScore,
  getDetailedResult,
  getCompletedExams
};
