/**
 * User Controller - Refactored
 * Uses asyncHandler and userService helpers.
 * Eliminates: 3 classroom validation copies, 3 user creation copies,
 * 4 duplicated pagination blocks, and misplaced scoring functions.
 * Scoring moved to use scoreService.
 */
const prisma = require('../config/db');
const bcrypt = require('bcryptjs');
const { asyncHandler, AppError } = require('../utils/asyncHandler');
const {
  validateClassroomConsistency,
  createUserWithProfile,
  buildPagination,
  paginatedResponse,
  formatUserData,
  SALT_ROUNDS,
} = require('../services/userService');
const { calculateAndSaveResult } = require('../services/scoreService');
const activityLogService = require('../services/activityLogService');

// ==================== USER LISTING (consolidated pagination) ====================

/**
 * Generic user listing with pagination and search.
 * Replaces 4 near-identical functions.
 */
const listUsers = (roleFilter = null) =>
  asyncHandler(async (req, res) => {
    const { search } = req.query;
    const { skip, take, page, limit } = buildPagination(req.query);

    const where = {};
    if (roleFilter) where.role = roleFilter;
    if (search) {
      where.OR = [
        { username: { contains: search } },
        { admin: { full_name: { contains: search } } },
        { teacher: { full_name: { contains: search } } },
        { student: { full_name: { contains: search } } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: { admin: true, teacher: true, student: true },
        orderBy: { created_at: 'desc' },
        skip,
        take,
      }),
      prisma.user.count({ where }),
    ]);

    const formatted = users.map(formatUserData);
    res.json(paginatedResponse(formatted, total, page, limit));
  });

const getAllUsers = listUsers();
const getAllAdmins = listUsers('admin');
const getAllTeachers = listUsers('teacher');
const getAllStudents = listUsers('student');

// GET /api/users/count - Count users by role
const countUsersByRole = asyncHandler(async (req, res) => {
  const [adminCount, teacherCount, studentCount, totalCount] = await Promise.all([
    prisma.user.count({ where: { role: 'admin' } }),
    prisma.user.count({ where: { role: 'teacher' } }),
    prisma.user.count({ where: { role: 'student' } }),
    prisma.user.count(),
  ]);

  res.json({
    admin: adminCount,
    teacher: teacherCount,
    student: studentCount,
    total: totalCount,
  });
});

// GET /api/users/:id - Get user detail
const getUserDetail = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: parseInt(req.params.id) },
    include: { admin: true, teacher: true, student: true },
  });

  if (!user) throw new AppError('User tidak ditemukan', 404);

  res.json({ user: formatUserData(user) });
});

// PUT /api/users/:id - Update user
const updateUser = asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.id);
  const { username, password, full_name, classroom, grade_level, major, nisn, nip } = req.body;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { admin: true, teacher: true, student: true },
  });

  if (!user) throw new AppError('User tidak ditemukan', 404);

  // Validate username uniqueness if changing
  if (username && username !== user.username) {
    const existingUser = await prisma.user.findUnique({ where: { username } });
    if (existingUser) {
      throw new AppError('Username sudah digunakan', 409);
    }
  }

  await prisma.$transaction(async (tx) => {
    // Update base user
    const userData = {};
    if (username) userData.username = username;
    if (password) userData.password = await bcrypt.hash(password, SALT_ROUNDS);
    if (Object.keys(userData).length > 0) {
      await tx.user.update({ where: { id: userId }, data: userData });
    }

    // Update role-specific profile
    if (user.role === 'student' && user.student) {
      const studentData = {};
      if (full_name !== undefined) studentData.full_name = full_name;
      if (nisn !== undefined) studentData.nisn = nisn;

      if (classroom !== undefined) {
        const derived = validateClassroomConsistency(
          classroom,
          grade_level || user.student.grade_level,
          major || user.student.major
        );
        studentData.classroom = classroom;
        studentData.grade_level = derived.grade_level;
        studentData.major = derived.major;
      } else {
        if (grade_level !== undefined) studentData.grade_level = grade_level;
        if (major !== undefined) studentData.major = major;
      }

      if (Object.keys(studentData).length > 0) {
        await tx.student.update({
          where: { student_id: user.student.student_id },
          data: studentData,
        });
      }
    } else if (user.role === 'teacher' && user.teacher) {
      const teacherData = {};
      if (full_name !== undefined) teacherData.full_name = full_name;
      if (nip !== undefined) teacherData.nip = nip;
      if (Object.keys(teacherData).length > 0) {
        await tx.teacher.update({
          where: { teacher_id: user.teacher.teacher_id },
          data: teacherData,
        });
      }
    } else if (user.role === 'admin' && user.admin) {
      if (full_name !== undefined) {
        await tx.admin.update({
          where: { admin_id: user.admin.admin_id },
          data: { full_name },
        });
      }
    }
  });

  // Refetch updated user
  const updated = await prisma.user.findUnique({
    where: { id: userId },
    include: { admin: true, teacher: true, student: true },
  });

  res.json({ message: 'User berhasil diperbarui', user: formatUserData(updated) });
});

// POST /api/users - Create user (uses userService)
const createUser = asyncHandler(async (req, res) => {
  const { username, password, role, full_name, classroom, grade_level, major, nisn, nip } = req.body;

  if (!username || !password || !role || !full_name) {
    throw new AppError('username, password, role, dan full_name wajib diisi', 400);
  }

  const validRoles = ['admin', 'teacher', 'student'];
  if (!validRoles.includes(role)) {
    throw new AppError(`role harus salah satu dari: ${validRoles.join(', ')}`, 400);
  }

  if (role === 'student' && !classroom) {
    throw new AppError('classroom wajib diisi untuk siswa', 400);
  }

  const user = await createUserWithProfile({
    username, password, role, full_name, classroom, grade_level, major, nisn, nip,
  });

  res.status(201).json({ message: 'User berhasil dibuat', userId: user.id });
});

// PUT /api/users/:id/role - Update user role
const updateUserRole = asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.id);
  const { new_role } = req.body;

  if (!new_role) throw new AppError('new_role wajib diisi', 400);

  const validRoles = ['admin', 'teacher', 'student'];
  if (!validRoles.includes(new_role)) {
    throw new AppError(`new_role harus salah satu dari: ${validRoles.join(', ')}`, 400);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { admin: true, teacher: true, student: true },
  });

  if (!user) throw new AppError('User tidak ditemukan', 404);
  if (user.is_super_admin) throw new AppError('Tidak dapat mengubah role super admin', 403);
  if (user.role === new_role) throw new AppError('User sudah memiliki role tersebut', 400);

  await prisma.$transaction(async (tx) => {
    // Delete old profile
    if (user.role === 'admin' && user.admin) {
      await tx.admin.delete({ where: { admin_id: user.admin.admin_id } });
    } else if (user.role === 'teacher' && user.teacher) {
      await tx.teacher.delete({ where: { teacher_id: user.teacher.teacher_id } });
    } else if (user.role === 'student' && user.student) {
      await tx.student.delete({ where: { student_id: user.student.student_id } });
    }

    // Update role
    await tx.user.update({ where: { id: userId }, data: { role: new_role } });

    // Create new profile with defaults
    const fullName = user.admin?.full_name || user.teacher?.full_name || user.student?.full_name || 'User';
    if (new_role === 'admin') {
      await tx.admin.create({ data: { user_id: userId, full_name: fullName } });
    } else if (new_role === 'teacher') {
      await tx.teacher.create({ data: { user_id: userId, full_name: fullName } });
    } else if (new_role === 'student') {
      await tx.student.create({
        data: { user_id: userId, full_name: fullName, classroom: '', grade_level: '', major: '' },
      });
    }
  });

  res.json({ message: `Role berhasil diubah ke ${new_role}` });
});

// PUT /api/users/:id/status - Toggle user active status
const toggleUserStatus = asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.id);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('User tidak ditemukan', 404);
  if (user.is_super_admin) throw new AppError('Tidak dapat menonaktifkan super admin', 403);
  if (userId === req.user.id) throw new AppError('Tidak dapat mengubah status akun sendiri', 400);

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { is_active: !user.is_active },
  });

  res.json({
    message: `Status user berhasil diubah ke ${updated.is_active ? 'aktif' : 'nonaktif'}`,
    is_active: updated.is_active,
  });
});

// DELETE /api/users/:id - Delete user
const deleteUser = asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.id);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('User tidak ditemukan', 404);
  if (user.is_super_admin) throw new AppError('Tidak dapat menghapus super admin', 403);
  if (userId === req.user.id) throw new AppError('Tidak dapat menghapus akun sendiri', 400);

  await prisma.user.delete({ where: { id: userId } });
  res.json({ message: 'User berhasil dihapus' });
});

// POST /api/users/score - Manual essay scoring (teacher)
const scoreAnswer = asyncHandler(async (req, res) => {
  const { answer_id, manual_score } = req.body;

  if (!answer_id) throw new AppError('answer_id wajib diisi', 400);

  const score = parseFloat(manual_score);
  if (isNaN(score) || score < 0 || score > 100) {
    throw new AppError('Nilai manual harus antara 0 dan 100', 400);
  }

  // Verify teacher owns the exam this answer belongs to
  const answer = await prisma.answer.findUnique({
    where: { answer_id: parseInt(answer_id) },
    include: {
      exam_participant: {
        include: {
          exam: { select: { teacher_id: true } },
        },
      },
    },
  });
  if (!answer) throw new AppError('Jawaban tidak ditemukan', 404);

  // Check ownership via teacher profile
  const teacher = await prisma.teacher.findUnique({ where: { user_id: req.user.id } });
  if (!teacher || answer.exam_participant.exam.teacher_id !== teacher.teacher_id) {
    throw new AppError('Anda tidak memiliki akses ke jawaban ini', 403);
  }

  const updated = await prisma.answer.update({
    where: { answer_id: parseInt(answer_id) },
    data: { manual_score: score },
  });

  // Recalculate result after manual score update
  const recalculated = await calculateAndSaveResult(answer.exam_participant_id);

  // Audit log
  await activityLogService.createLog({
    user_id: req.user.id,
    activity_type: 'UPDATE_MANUAL_SCORE',
    description: `Teacher updated manual score for answer ${answer_id} to ${manual_score}`,
    metadata: { answer_id: parseInt(answer_id), manual_score: score },
  });

  res.json({ message: 'Nilai manual berhasil diupdate', answer: updated, recalculated: { final_score: recalculated.finalScore, status: recalculated.status } });
});

// POST /api/users/finalize - Finalize score (uses scoreService)
const finalizeScore = asyncHandler(async (req, res) => {
  const { exam_participant_id } = req.body;

  if (!exam_participant_id) throw new AppError('exam_participant_id wajib diisi', 400);

  // Verify teacher owns the exam
  const participant = await prisma.examParticipant.findUnique({
    where: { exam_participant_id: parseInt(exam_participant_id) },
    include: { exam: { select: { teacher_id: true } } },
  });
  if (!participant) throw new AppError('Peserta ujian tidak ditemukan', 404);

  const teacher = await prisma.teacher.findUnique({ where: { user_id: req.user.id } });
  if (!teacher || participant.exam.teacher_id !== teacher.teacher_id) {
    throw new AppError('Anda tidak memiliki akses ke peserta ujian ini', 403);
  }

  const result = await calculateAndSaveResult(parseInt(exam_participant_id));

  res.json({
    message: 'Nilai berhasil difinalisasi',
    result: {
      exam_participant_id: parseInt(exam_participant_id),
      final_score: result.finalScore,
      total_score: result.totalScore,
      total_weight: result.totalWeight,
      has_essay: result.hasEssay,
      status: result.status,
    },
  });
});

// POST /api/users/batch - Batch create users (uses userService)
const batchCreateUsers = asyncHandler(async (req, res) => {
  const { users } = req.body;

  if (!Array.isArray(users) || users.length === 0) {
    throw new AppError('Array users wajib diisi', 400);
  }

  if (users.length > 500) {
    throw new AppError('Maksimal 500 user per batch', 400);
  }

  const results = { success: [], failed: [], errors: [] };

  for (const userData of users) {
    try {
      if (!userData.username || !userData.password || !userData.role || !userData.full_name) {
        results.failed.push(userData.username || 'unknown');
        results.errors.push({
          username: userData.username || 'unknown',
          error: 'username, password, role, dan full_name wajib diisi',
        });
        continue;
      }

      const user = await createUserWithProfile(userData);
      results.success.push({ username: user.username, id: user.id });
    } catch (error) {
      results.failed.push(userData.username || 'unknown');
      results.errors.push({
        username: userData.username || 'unknown',
        error: error.message || 'Gagal membuat user',
      });
    }
  }

  res.status(201).json({
    message: `${results.success.length} user berhasil dibuat, ${results.failed.length} gagal`,
    total: users.length,
    success: results.success.length,
    failed: results.failed.length,
    successDetails: results.success,
    failedDetails: results.failed,
    errors: results.errors,
  });
});

// POST /api/users/batch-delete - Delete multiple users at once (e.g. graduated students)
const batchDeleteUsers = asyncHandler(async (req, res) => {
  const { user_ids, grade_level, major, classroom } = req.body;

  // Mode 1: Delete by explicit user IDs
  // Mode 2: Delete by filter (grade_level, major, classroom) — for graduating classes
  let targetIds = [];

  if (user_ids && Array.isArray(user_ids) && user_ids.length > 0) {
    targetIds = user_ids.map(id => parseInt(id)).filter(id => !isNaN(id));
  } else if (grade_level) {
    // Find all students matching filter
    const where = { grade_level };
    if (major) where.major = major;
    if (classroom) where.classroom = classroom;

    const students = await prisma.student.findMany({
      where,
      select: { user_id: true },
    });
    targetIds = students.map(s => s.user_id);
  } else {
    throw new AppError('Harus menyertakan user_ids atau grade_level untuk batch delete', 400);
  }

  if (targetIds.length === 0) {
    throw new AppError('Tidak ada user yang cocok dengan filter', 404);
  }

  // Safety checks: exclude self and super admins
  const protectedUsers = await prisma.user.findMany({
    where: {
      id: { in: targetIds },
      OR: [
        { is_super_admin: true },
        { id: req.user.id },
      ],
    },
    select: { id: true, username: true },
  });

  const protectedIds = new Set(protectedUsers.map(u => u.id));
  const deletableIds = targetIds.filter(id => !protectedIds.has(id));

  if (deletableIds.length === 0) {
    throw new AppError('Semua user yang dipilih adalah super admin atau akun sendiri, tidak dapat dihapus', 403);
  }

  // Delete in transaction (cascade handles relations)
  const deleted = await prisma.user.deleteMany({
    where: { id: { in: deletableIds } },
  });

  // Activity log
  await activityLogService.createLog({
    user_id: req.user.id,
    activity_type: 'BATCH_DELETE_USERS',
    description: `Admin batch-deleted ${deleted.count} users${grade_level ? ` (grade: ${grade_level})` : ''}`,
    ip_address: activityLogService.getIpAddress(req),
    user_agent: activityLogService.getUserAgent(req),
    metadata: {
      deleted_count: deleted.count,
      deleted_ids: deletableIds,
      skipped: protectedUsers.map(u => u.username),
      filter: { grade_level, major, classroom },
    },
  });

  res.json({
    message: `${deleted.count} user berhasil dihapus`,
    deleted_count: deleted.count,
    skipped_count: protectedIds.size,
    skipped_users: protectedUsers.map(u => u.username),
  });
});

module.exports = {
  getAllUsers,
  getAllAdmins,
  getAllTeachers,
  getAllStudents,
  countUsersByRole,
  getUserDetail,
  updateUser,
  createUser,
  updateUserRole,
  toggleUserStatus,
  deleteUser,
  batchDeleteUsers,
  scoreAnswer,
  finalizeScore,
  batchCreateUsers,
};
