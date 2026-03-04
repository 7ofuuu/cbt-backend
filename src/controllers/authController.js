/**
 * Auth Controller - Refactored
 * Uses asyncHandler, AppError, and userService for user creation.
 */
const prisma = require('../config/db');
const bcrypt = require('bcryptjs');
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

  let profileData = null;
  if (user.role === 'student') profileData = user.student;
  else if (user.role === 'teacher') profileData = user.teacher;
  else if (user.role === 'admin') profileData = user.admin;

  const token = jwt.sign(
    { id: user.id, role: user.role, is_super_admin: user.is_super_admin || false },
    process.env.JWT_SECRET,
    { expiresIn: '1d', algorithm: 'HS256' }
  );

  await activityLogService.createLog({
    user_id: user.id,
    activity_type: 'LOGIN',
    description: `User ${username} (${user.role}) berhasil login`,
    ip_address: activityLogService.getIpAddress(req),
    user_agent: activityLogService.getUserAgent(req),
    metadata: { username, role: user.role },
  });

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

  let profileData = null;
  if (user.role === 'student') profileData = user.student;
  else if (user.role === 'teacher') profileData = user.teacher;
  else if (user.role === 'admin') profileData = user.admin;

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
  const { full_name, classroom, grade_level, major, nisn, nip } = req.body;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('User tidak ditemukan', 404);

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

  let profileData = null;
  if (freshUser.role === 'student') profileData = freshUser.student;
  else if (freshUser.role === 'teacher') profileData = freshUser.teacher;
  else if (freshUser.role === 'admin') profileData = freshUser.admin;

  res.json({
    message: 'Profile updated',
    user: {
      id: freshUser.id,
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

  const validPassword = await bcrypt.compare(current_password, user.password);
  if (!validPassword) throw new AppError('Password saat ini salah', 401);

  const hashedPassword = await bcrypt.hash(new_password, SALT_ROUNDS);
  await prisma.user.update({
    where: { id: req.user.id },
    data: { password: hashedPassword },
  });

  await activityLogService.createLog({
    user_id: req.user.id,
    activity_type: 'CHANGE_PASSWORD',
    description: `User ${user.username} (${user.role}) berhasil mengubah password`,
    ip_address: activityLogService.getIpAddress(req),
    user_agent: activityLogService.getUserAgent(req),
    metadata: { username: user.username, role: user.role },
  });

  res.json({ message: 'Password berhasil diubah' });
});

// POST /api/auth/logout
const logout = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { username: true } });
  const username = user?.username || `ID:${req.user.id}`;

  await activityLogService.createLog({
    user_id: req.user.id,
    activity_type: 'LOGOUT',
    description: `User ${username} (${req.user.role}) berhasil logout`,
    ip_address: activityLogService.getIpAddress(req),
    user_agent: activityLogService.getUserAgent(req),
    metadata: { username, role: req.user.role },
  });

  res.json({ message: 'Logout berhasil' });
});

module.exports = { register, login, me, updateProfile, changePassword, logout };
