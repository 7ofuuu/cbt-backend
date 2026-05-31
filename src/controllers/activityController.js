/**
 * Activity Controller - Refactored
 * Uses asyncHandler. In-memory filtering for major/classroom moved to DB queries.
 */
const prisma = require('../config/db');
const crypto = require('crypto');
const { asyncHandler, AppError } = require('../utils/asyncHandler');
const { ensureAccessPassword } = require('../services/examService');

// Helper: generate random unlock code (6 characters, cryptographically secure)
const generateUnlockCodeStr = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(crypto.randomInt(chars.length));
  }
  return code;
};

// GET /api/admin/activities - Get all exams with participant counts
exports.getAllActivities = asyncHandler(async (req, res) => {
  const { major, classroom, jenis_ujian: examType } = req.query;

  const whereClause = {};
  if (major && major !== 'all') whereClause.major = major;
  if (classroom && classroom !== 'all') whereClause.grade_level = classroom;
  if (examType && examType !== 'all') {
    if (examType === 'Ujian Akhir Semester') {
      whereClause.exam_name = { contains: 'akhir' };
    } else if (examType === 'Ujian Tengah Semester') {
      whereClause.exam_name = { contains: 'tengah' };
    }
  }

  const exams = await prisma.exam.findMany({
    where: whereClause,
    include: {
      _count: { select: { exam_participants: true } },
      teacher: { select: { teacher_id: true, full_name: true } },
    },
    orderBy: { start_date: 'desc' },
  });

  const now = new Date();
  const formattedData = exams.map(exam => {
    const start = new Date(exam.start_date);
    const end = new Date(exam.end_date);

    let examTypeLabel = 'Ujian Tengah Semester';
    if (exam.exam_name.toLowerCase().includes('akhir')) examTypeLabel = 'Ujian Akhir Semester';

    let examStatus = 'Belum Mulai';
    if (now >= start && now <= end) examStatus = 'Sedang ONGOING';
    else if (now > end) examStatus = 'COMPLETED';

    return {
      exam_id: exam.exam_id,
      exam_name: exam.exam_name,
      subject: exam.subject,
      major: exam.major,
      grade_level: exam.grade_level,
      exam_type: examTypeLabel,
      participant_count: exam._count.exam_participants,
      status: examStatus,
      start_date: exam.start_date,
      end_date: exam.end_date,
      duration_minutes: exam.duration_minutes,
    };
  });

  res.json({ success: true, data: formattedData });
});

// GET /api/admin/activities/:examId/participants - FIXED: DB-level filtering
exports.getExamParticipants = asyncHandler(async (req, res) => {
  const { examId } = req.params;
  const { major, classroom, status } = req.query;

  const exam = await prisma.exam.findUnique({
    where: { exam_id: parseInt(examId) },
    include: { teacher: { include: { user: true } } },
  });

  if (!exam) throw new AppError('Ujian tidak ditemukan', 404);

  // Build WHERE clause at DB level (was in-memory before)
  const participantWhere = { exam_id: parseInt(examId) };

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

  // Filter by major/classroom at DB level using student relation
  const studentWhere = {};
  if (major && major !== 'all') studentWhere.major = major;
  if (classroom && classroom !== 'all') studentWhere.grade_level = classroom;

  if (Object.keys(studentWhere).length > 0) {
    participantWhere.student = studentWhere;
  }

  const participants = await prisma.examParticipant.findMany({
    where: participantWhere,
    include: {
      student: { select: { student_id: true, full_name: true, grade_level: true, major: true, classroom: true } },
      exam: true,
    },
    orderBy: { student: { full_name: 'asc' } },
  });

  const formattedParticipants = participants.map(p => {
    let statusLabel = 'Belum Mulai';
    if (p.is_blocked) statusLabel = 'Blocked';
    else if (p.exam_status === 'IN_PROGRESS') statusLabel = 'On Progress';
    else if (p.exam_status === 'COMPLETED') statusLabel = 'Submitted';
    else if (p.exam_status === 'GRADED') statusLabel = 'Submitted';

    return {
      exam_participant_id: p.exam_participant_id,
      full_name: p.student.full_name,
      grade_level: p.student.grade_level,
      major: p.student.major,
      classroom: p.student.classroom,
      subject: exam.subject,
      status: statusLabel,
      exam_status: p.exam_status,
      is_blocked: p.is_blocked,
      block_reason: p.block_reason,
      unlock_code: p.unlock_code,
      start_time: p.start_time,
      end_time: p.end_time,
    };
  });

  // Exam access password for encrypted pre-download — visible to admin only,
  // lazily generated once the exam is within the H-1 window (null before that).
  const accessPassword = await ensureAccessPassword(exam);

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
        duration_minutes: exam.duration_minutes,
        access_password: accessPassword,
      },
      participants: formattedParticipants,
    },
  });
});

// GET /api/admin/activities/participant/:examParticipantId
exports.getParticipantDetail = asyncHandler(async (req, res) => {
  const { examParticipantId } = req.params;

  const ep = await prisma.examParticipant.findUnique({
    where: { exam_participant_id: parseInt(examParticipantId) },
    include: {
      student: { select: { student_id: true, full_name: true, grade_level: true, classroom: true, major: true } },
      exam: true,
    },
  });

  if (!ep) throw new AppError('Peserta ujian tidak ditemukan', 404);

  let statusLabel = 'Belum Mulai';
  if (ep.is_blocked) statusLabel = 'Blocked';
  else if (ep.exam_status === 'IN_PROGRESS') statusLabel = 'On Progress';
  else if (ep.exam_status === 'COMPLETED') statusLabel = 'Submitted';
  else if (ep.exam_status === 'GRADED') statusLabel = 'Submitted';

  res.json({
    success: true,
    data: {
      exam_participant_id: ep.exam_participant_id,
      full_name: ep.student.full_name,
      grade_level: ep.student.grade_level,
      classroom: ep.student.classroom,
      major: ep.student.major,
      subject: ep.exam.subject,
      exam_name: ep.exam.exam_name,
      status: statusLabel,
      is_blocked: ep.is_blocked,
      block_reason: ep.block_reason,
      unlock_code: ep.unlock_code,
      start_time: ep.start_time,
      end_time: ep.end_time,
    },
  });
});

// POST /api/admin/activities/:examParticipantId/block
exports.blockParticipant = asyncHandler(async (req, res) => {
  const { examParticipantId } = req.params;
  const { block_reason } = req.body;

  if (!block_reason || block_reason.trim() === '') {
    throw new AppError('Keterangan pelanggaran harus diisi', 400);
  }

  const participant = await prisma.examParticipant.findUnique({
    where: { exam_participant_id: parseInt(examParticipantId) },
  });
  if (!participant) throw new AppError('Peserta ujian tidak ditemukan', 404);

  const updated = await prisma.examParticipant.update({
    where: { exam_participant_id: parseInt(examParticipantId) },
    data: { is_blocked: true, block_reason },
    include: { student: { select: { student_id: true, full_name: true } }, exam: true },
  });

  res.json({
    success: true,
    message: 'Peserta berhasil diblokir',
    data: {
      exam_participant_id: updated.exam_participant_id,
      full_name: updated.student.full_name,
      is_blocked: updated.is_blocked,
      block_reason: updated.block_reason,
    },
  });
});

// POST /api/admin/activities/:examParticipantId/generate-unlock
exports.generateUnlockCode = asyncHandler(async (req, res) => {
  const { examParticipantId } = req.params;

  const ep = await prisma.examParticipant.findUnique({
    where: { exam_participant_id: parseInt(examParticipantId) },
  });

  if (!ep) throw new AppError('Peserta ujian tidak ditemukan', 404);
  if (!ep.is_blocked) throw new AppError('Peserta tidak dalam status terblokir', 400);

  // Generate unique unlock code
  let unlockCode;
  let isUnique = false;
  let retries = 0;

  while (!isUnique && retries < 20) {
    unlockCode = generateUnlockCodeStr();
    const existing = await prisma.examParticipant.findFirst({
      where: { unlock_code: unlockCode },
    });
    if (!existing) isUnique = true;
    retries++;
  }

  if (!isUnique) throw new AppError('Gagal generate kode unik, silakan coba lagi', 500);

  const updated = await prisma.examParticipant.update({
    where: { exam_participant_id: parseInt(examParticipantId) },
    data: { unlock_code: unlockCode },
    include: { student: { select: { student_id: true, full_name: true } } },
  });

  res.json({
    success: true,
    message: 'Kode unlock berhasil di-generate',
    data: {
      exam_participant_id: updated.exam_participant_id,
      full_name: updated.student.full_name,
      unlock_code: updated.unlock_code,
    },
  });
});

// POST /api/admin/activities/:examParticipantId/unblock
exports.unblockParticipant = asyncHandler(async (req, res) => {
  const { examParticipantId } = req.params;
  const { unlock_code } = req.body;

  if (!unlock_code || unlock_code.trim() === '') {
    throw new AppError('Kode unlock harus diisi', 400);
  }

  const ep = await prisma.examParticipant.findUnique({
    where: { exam_participant_id: parseInt(examParticipantId) },
  });

  if (!ep) throw new AppError('Peserta ujian tidak ditemukan', 404);
  if (!ep.is_blocked) throw new AppError('Peserta tidak dalam status terblokir', 400);
  if (ep.unlock_code !== unlock_code.toUpperCase()) {
    throw new AppError('Kode unlock tidak valid', 400);
  }

  const updated = await prisma.examParticipant.update({
    where: { exam_participant_id: parseInt(examParticipantId) },
    data: { is_blocked: false, block_reason: null, unlock_code: null },
    include: { student: { select: { student_id: true, full_name: true } } },
  });

  res.json({
    success: true,
    message: 'Peserta berhasil di-unblock',
    data: {
      exam_participant_id: updated.exam_participant_id,
      full_name: updated.student.full_name,
      is_blocked: updated.is_blocked,
    },
  });
});
