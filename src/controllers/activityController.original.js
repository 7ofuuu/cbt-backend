// src/controllers/activityController.js
const prisma = require('../config/db');
const crypto = require('crypto');

// Helper function to generate random unlock code (6 characters, cryptographically secure)
const generateUnlockCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(crypto.randomInt(chars.length));
  }
  return code;
};

// GET /api/admin/activities - Get all active exams with participants
exports.getAllActivities = async (req, res) => {
  try {
    const { major, classroom, jenis_ujian: examType } = req.query;

    // Build where clause
    let whereClause = {};

    if (major && major !== 'all') {
      whereClause.major = major;
    }

    if (classroom && classroom !== 'all') {
      whereClause.grade_level = classroom;
    }

    // Filter by exam type
    if (examType && examType !== 'all') {
      if (examType === 'Ujian Akhir Semester') {
        whereClause.exam_name = {
          contains: 'akhir',
        };
      } else if (examType === 'Ujian Tengah Semester') {
        whereClause.exam_name = {
          contains: 'tengah',
        };
      }
    }

    // Get all exams with their participants
    // Note: We don't filter by status here since the frontend filters by exam time-based status
    const exams = await prisma.exam.findMany({
      where: whereClause,
      include: {
        exam_participants: {
          include: {
            student: {
              include: {
                user: true
              }
            }
          }
        },
        teacher: {
          include: {
            user: true
          }
        }
      },
      orderBy: {
        start_date: 'desc'
      }
    });

    // Format response
    const formattedData = exams.map(exam => {
      const now = new Date();
      const start = new Date(exam.start_date);
      const end = new Date(exam.end_date);

      let examType = 'Ujian Tengah Semester';
      if (exam.exam_name.toLowerCase().includes('akhir')) {
        examType = 'Ujian Akhir Semester';
      }

      // Determine exam status based on current time
      let examStatus = 'Belum Mulai';
      if (now >= start && now <= end) {
        examStatus = 'Sedang ONGOING';
      } else if (now > end) {
        examStatus = 'COMPLETED';
      }

      return {
        exam_id: exam.exam_id,
        exam_name: exam.exam_name,
        subject: exam.subject,
        major: exam.major,
        grade_level: exam.grade_level,
        exam_type: examType,
        participant_count: exam.exam_participants.length,
        status: examStatus,
        start_date: exam.start_date,
        end_date: exam.end_date,
        duration_minutes: exam.duration_minutes
      };
    });

    res.json({
      success: true,
      data: formattedData
    });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// GET /api/admin/activities/:examId/participants - Get exam participants detail
exports.getExamParticipants = async (req, res) => {
  try {
    const { examId } = req.params;
    const { major, classroom, status } = req.query;

    // Build where clause for participants
    let participantWhere = {
      exam_id: parseInt(examId)
    };

    if (status && status !== 'all') {
      if (status === 'BLOCKED') {
        participantWhere.is_blocked = true;
      } else if (status === 'ON_PROGRESS') {
        participantWhere.exam_status = 'IN_PROGRESS';
        participantWhere.is_blocked = false;
      } else if (status === 'SUBMITTED') {
        participantWhere.exam_status = 'COMPLETED';
        participantWhere.is_blocked = false;
      }
    }

    // Get exam data
    const exam = await prisma.exam.findUnique({
      where: { exam_id: parseInt(examId) },
      include: {
        teacher: {
          include: { user: true }
        }
      }
    });

    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Ujian tidak ditemukan'
      });
    }

    // Get participants
    const examParticipants = await prisma.examParticipant.findMany({
      where: participantWhere,
      include: {
        student: {
          include: {
            user: true
          }
        },
        exam: true
      },
      orderBy: {
        student: {
          full_name: 'asc'
        }
      }
    });

    // Filter by major and classroom if needed
    let filteredParticipants = examParticipants;
    if (major && major !== 'all') {
      filteredParticipants = filteredParticipants.filter(p => p.student.major === major);
    }
    if (classroom && classroom !== 'all') {
      filteredParticipants = filteredParticipants.filter(p => p.student.grade_level === classroom);
    }

    // Format response
    const formattedParticipants = filteredParticipants.map(participant => {
      let statusLabel = 'Belum Mulai';
      if (participant.is_blocked) {
        statusLabel = 'Blocked';
      } else if (participant.exam_status === 'IN_PROGRESS') {
        statusLabel = 'On Progress';
      } else if (participant.exam_status === 'COMPLETED') {
        statusLabel = 'Submitted';
      }

      return {
        exam_participant_id: participant.exam_participant_id,
        full_name: participant.student.full_name,
        grade_level: participant.student.grade_level,
        major: participant.student.major,
        classroom: participant.student.classroom,
        subject: exam.subject,
        status: statusLabel,
        exam_status: participant.exam_status,
        is_blocked: participant.is_blocked,
        block_reason: participant.block_reason,
        unlock_code: participant.unlock_code,
        start_time: participant.start_time,
        end_time: participant.end_time
      };
    });

    res.json({
      success: true,
      data: {
        exam: {
          exam_id: exam.exam_id,
          exam_name: exam.exam_name,
          subject: exam.subject,
          grade_level: exam.grade_level,
          major: exam.major,
          start_date: exam.start_date,
          end_date: exam.end_date,
          duration_minutes: exam.duration_minutes
        },
        participants: formattedParticipants
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// GET /api/admin/activities/participant/:examParticipantId - Get participant detail
exports.getParticipantDetail = async (req, res) => {
  try {
    const { examParticipantId } = req.params;

    const examParticipant = await prisma.examParticipant.findUnique({
      where: { exam_participant_id: parseInt(examParticipantId) },
      include: {
        student: {
          include: {
            user: true
          }
        },
        exam: true
      }
    });

    if (!examParticipant) {
      return res.status(404).json({
        success: false,
        message: 'Peserta ujian tidak ditemukan'
      });
    }

    let statusLabel = 'Belum Mulai';
    if (examParticipant.is_blocked) {
      statusLabel = 'Blocked';
    } else if (examParticipant.exam_status === 'IN_PROGRESS') {
      statusLabel = 'On Progress';
    } else if (examParticipant.exam_status === 'COMPLETED') {
      statusLabel = 'Submitted';
    }

    res.json({
      success: true,
      data: {
        exam_participant_id: examParticipant.exam_participant_id,
        full_name: examParticipant.student.full_name,
        grade_level: examParticipant.student.grade_level,
        classroom: `${examParticipant.student.major} ${examParticipant.student.classroom}`,
        major: examParticipant.student.major,
        subject: examParticipant.exam.subject,
        exam_name: examParticipant.exam.exam_name,
        status: statusLabel,
        is_blocked: examParticipant.is_blocked,
        block_reason: examParticipant.block_reason,
        unlock_code: examParticipant.unlock_code,
        start_time: examParticipant.start_time,
        end_time: examParticipant.end_time
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// POST /api/admin/activities/:examParticipantId/block - Block a participant
exports.blockParticipant = async (req, res) => {
  try {
    const { examParticipantId } = req.params;
    const { block_reason } = req.body;

    if (!block_reason || block_reason.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Keterangan pelanggaran harus diisi'
      });
    }

    // Check if participant exists
    const participant = await prisma.examParticipant.findUnique({
      where: { exam_participant_id: parseInt(examParticipantId) },
    });
    if (!participant) {
      return res.status(404).json({
        success: false,
        message: 'Peserta ujian tidak ditemukan'
      });
    }

    const updatedParticipant = await prisma.examParticipant.update({
      where: { exam_participant_id: parseInt(examParticipantId) },
      data: {
        is_blocked: true,
        block_reason: block_reason
      },
      include: {
        student: {
          include: {
            user: true
          }
        },
        exam: true
      }
    });

    res.json({
      success: true,
      message: 'Peserta berhasil diblokir',
      data: {
        exam_participant_id: updatedParticipant.exam_participant_id,
        full_name: updatedParticipant.student.full_name,
        is_blocked: updatedParticipant.is_blocked,
        block_reason: updatedParticipant.block_reason
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// POST /api/admin/activities/:examParticipantId/generate-unlock - Generate unlock code
exports.generateUnlockCode = async (req, res) => {
  try {
    const { examParticipantId } = req.params;

    // Check if participant is blocked
    const examParticipant = await prisma.examParticipant.findUnique({
      where: { exam_participant_id: parseInt(examParticipantId) }
    });

    if (!examParticipant) {
      return res.status(404).json({
        success: false,
        message: 'Peserta ujian tidak ditemukan'
      });
    }

    if (!examParticipant.is_blocked) {
      return res.status(400).json({
        success: false,
        message: 'Peserta tidak dalam status terblokir'
      });
    }

    // Generate unique unlock code (with max retry guard)
    let unlockCode;
    let isUnique = false;
    let retries = 0;
    const maxRetries = 20;

    while (!isUnique && retries < maxRetries) {
      unlockCode = generateUnlockCode();
      const existing = await prisma.examParticipant.findFirst({
        where: { unlock_code: unlockCode }
      });
      if (!existing) {
        isUnique = true;
      }
      retries++;
    }

    if (!isUnique) {
      return res.status(500).json({
        success: false,
        message: 'Gagal generate kode unik, silakan coba lagi'
      });
    }

    // Update participant with unlock code
    const updatedParticipant = await prisma.examParticipant.update({
      where: { exam_participant_id: parseInt(examParticipantId) },
      data: {
        unlock_code: unlockCode
      },
      include: {
        student: {
          include: {
            user: true
          }
        }
      }
    });

    res.json({
      success: true,
      message: 'Kode unlock berhasil di-generate',
      data: {
        exam_participant_id: updatedParticipant.exam_participant_id,
        full_name: updatedParticipant.student.full_name,
        unlock_code: updatedParticipant.unlock_code
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// POST /api/admin/activities/:examParticipantId/unblock - Unblock a participant
exports.unblockParticipant = async (req, res) => {
  try {
    const { examParticipantId } = req.params;
    const { unlock_code } = req.body;

    if (!unlock_code || unlock_code.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Kode unlock harus diisi'
      });
    }

    const examParticipant = await prisma.examParticipant.findUnique({
      where: { exam_participant_id: parseInt(examParticipantId) }
    });

    if (!examParticipant) {
      return res.status(404).json({
        success: false,
        message: 'Peserta ujian tidak ditemukan'
      });
    }

    if (!examParticipant.is_blocked) {
      return res.status(400).json({
        success: false,
        message: 'Peserta tidak dalam status terblokir'
      });
    }

    if (examParticipant.unlock_code !== unlock_code.toUpperCase()) {
      return res.status(400).json({
        success: false,
        message: 'Kode unlock tidak valid'
      });
    }

    // Unblock participant
    const updatedParticipant = await prisma.examParticipant.update({
      where: { exam_participant_id: parseInt(examParticipantId) },
      data: {
        is_blocked: false,
        block_reason: null,
        unlock_code: null
      },
      include: {
        student: {
          include: {
            user: true
          }
        }
      }
    });

    res.json({
      success: true,
      message: 'Peserta berhasil di-unblock',
      data: {
        exam_participant_id: updatedParticipant.exam_participant_id,
        full_name: updatedParticipant.student.full_name,
        is_blocked: updatedParticipant.is_blocked
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};
