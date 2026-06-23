/**
 * Auth Controller - Refactored
 * Uses asyncHandler, AppError, and userService for user creation.
 */
const prisma = require('../config/db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { asyncHandler, AppError } = require('../utils/asyncHandler');
const { createUserWithProfile, SALT_ROUNDS } = require('../services/userService');
const activityLogService = require('../services/activityLogService');

// POST /api/auth/register
const register = asyncHandler(async (req, res) => {
  const { username, password, role, full_name, classroom, grade_level, major, nisn, nip } = req.body;

  const user = await createUserWithProfile({
    username, password, role, full_name, classroom, grade_level, major, nisn, nip,
  });

  res.status(201).json({ message: 'User berhasil didaftarkan', userId: user.id });
});

/**
 * Format teacher profile data for response.
 * Only includes is_coordinator if true.
 * @param {object} teacher - Teacher record
 * @returns {object}
 */
const formatTeacherProfile = (teacher) => {
  if (!teacher) return null;
  const profile = {
    teacher_id: teacher.teacher_id,
    full_name: teacher.full_name,
    nip: teacher.nip,
    subject: teacher.subject,
  };
  if (teacher.is_coordinator) {
    profile.is_coordinator = true;
  }
  return profile;
};

/**
 * Get profile data based on user role.
 * @param {object} user - User with included profiles
 * @returns {object|null}
 */
const getProfileData = (user) => {
  if (user.role === 'student') return user.student;
  if (user.role === 'teacher') return formatTeacherProfile(user.teacher);
  if (user.role === 'admin') return user.admin;
  return null;
};

// POST /api/auth/login
const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  const user = await prisma.user.findUnique({
    where: { username },
    include: { student: true, teacher: true, admin: true },
  });

  if (!user) {
    // Timing attack mitigation - valid 60-char bcrypt hash
    await bcrypt.compare(password, '$2a$12$LJ3m4ys3Lf0Xg0V7R0j5dOJvGMmS76N0ATMMJ8EfEDMaq7SSH3/6i');
    throw new AppError('Username atau password salah', 401);
  }

  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) throw new AppError('Username atau password salah', 401);

  if (!user.is_active) throw new AppError('Akun dinonaktifkan', 403);

  const profileData = getProfileData(user);

  const payload = { id: user.id, role: user.role, is_super_admin: user.is_super_admin || false };

  // Single active session (students only): rotate session and block any exam in
  // progress, since a second login during an exam means another device took over.
  if (user.role === 'student') {
    const sessionId = crypto.randomUUID();
    payload.sid = sessionId;
    await prisma.user.update({
      where: { id: user.id },
      data: { active_session_id: sessionId },
    });
    if (user.student) {
      await prisma.examParticipant.updateMany({
        where: { student_id: user.student.student_id, exam_status: 'IN_PROGRESS', is_blocked: false },
        data: { is_blocked: true, block_reason: 'Login di perangkat lain saat ujian' },
      });
    }
  }

  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1d', algorithm: 'HS256' });

  await activityLogService.logFromRequest(req, 'LOGIN',
    `User ${username} (${user.role}) berhasil login`,
    { user_id: user.id, metadata: { username, role: user.role } });

  res.json({
    message: 'Login berhasil',
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      is_super_admin: user.is_super_admin || false,
      profile: profileData,
    },
  });
});

// GET /api/auth/me
const me = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { student: true, teacher: true, admin: true },
  });

  if (!user) throw new AppError('User tidak ditemukan', 404);

  const profileData = getProfileData(user);

  res.json({
    message: 'Profile fetched',
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      is_super_admin: user.is_super_admin || false,
      profile: profileData,
    },
  });
});

// PATCH /api/auth/profile
const updateProfile = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { username, full_name, classroom, grade_level, major, nisn, nip } = req.body;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('User tidak ditemukan', 404);

  if (username && username !== user.username) {
    const existingUsername = await prisma.user.findUnique({ where: { username } });
    if (existingUsername) {
      throw new AppError('Username sudah digunakan', 409);
    }
    await prisma.user.update({
      where: { id: userId },
      data: { username },
    });
  }

  if (user.role === 'student') {
    const student = await prisma.student.findUnique({ where: { user_id: userId } });
    if (!student) throw new AppError('Profil siswa tidak ditemukan', 404);

    // B2: Students cannot modify grade_level, major, or classroom (admin-only fields)
    await prisma.student.update({
      where: { user_id: userId },
      data: {
        ...(full_name !== undefined && { full_name }),
        ...(nisn !== undefined && { nisn }),
      },
    });
  } else if (user.role === 'teacher') {
    const teacher = await prisma.teacher.findUnique({ where: { user_id: userId } });
    if (!teacher) throw new AppError('Profil guru tidak ditemukan', 404);

    await prisma.teacher.update({
      where: { user_id: userId },
      data: {
        ...(full_name !== undefined && { full_name }),
        ...(nip !== undefined && { nip }),
      },
    });
  } else if (user.role === 'admin') {
    const admin = await prisma.admin.findUnique({ where: { user_id: userId } });
    if (!admin) throw new AppError('Profil admin tidak ditemukan', 404);

    await prisma.admin.update({
      where: { user_id: userId },
      data: {
        ...(full_name !== undefined && { full_name }),
      },
    });
  }

  const freshUser = await prisma.user.findUnique({
    where: { id: userId },
    include: { student: true, teacher: true, admin: true },
  });

  const profileData = getProfileData(freshUser);

  res.json({
    message: 'Profile updated',
    user: {
      id: freshUser.id,
      username: freshUser.username,
      role: freshUser.role,
      is_super_admin: freshUser.is_super_admin || false,
      profile: profileData,
    },
  });
});

// PATCH /api/auth/change-password
const changePassword = asyncHandler(async (req, res) => {
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    throw new AppError('Password saat ini dan password baru wajib diisi', 400);
  }

  // Match registration password policy: min 8 chars, uppercase, lowercase, digit
  if (new_password.length < 8) {
    throw new AppError('Password baru minimal 8 karakter', 400);
  }

  if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(new_password)) {
    throw new AppError('Password baru harus mengandung huruf besar, huruf kecil, dan angka', 400);
  }

  if (current_password === new_password) {
    throw new AppError('Password baru tidak boleh sama dengan password saat ini', 400);
  }

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) throw new AppError('User tidak ditemukan', 404);

  // 400 (not 401): the session is valid, only the supplied current password is
  // wrong. A 401 here would trip the dashboard's global "session expired" handler
  // and log the user out instead of showing the error.
  const validPassword = await bcrypt.compare(current_password, user.password);
  if (!validPassword) throw new AppError('Password saat ini salah', 400);

  const hashedPassword = await bcrypt.hash(new_password, SALT_ROUNDS);
  await prisma.user.update({
    where: { id: req.user.id },
    data: { password: hashedPassword },
  });

  await activityLogService.logFromRequest(req, 'CHANGE_PASSWORD',
    `User ${user.username} (${user.role}) berhasil mengubah password`,
    { metadata: { username: user.username, role: user.role } });

  res.json({ message: 'Password berhasil diubah' });
});

// POST /api/auth/logout
const logout = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { username: true } });
  const username = user?.username || `ID:${req.user.id}`;

  // Single active session (students only): clear the session id to invalidate this token.
  if (req.user.role === 'student') {
    await prisma.user.update({
      where: { id: req.user.id },
      data: { active_session_id: null },
    });
  }

  await activityLogService.logFromRequest(req, 'LOGOUT',
    `User ${username} (${req.user.role}) berhasil logout`,
    { metadata: { username, role: req.user.role } });

  res.json({ message: 'Logout berhasil' });
});

module.exports = { register, login, me, updateProfile, changePassword, logout };
