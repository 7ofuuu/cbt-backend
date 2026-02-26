const prisma = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const activityLogService = require('../services/activityLogService');

const SALT_ROUNDS = 12;

const register = async (req, res) => {
  const { username, password, role, full_name, classroom, grade_level, major, nisn, nip } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const result = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          username,
          password: hashedPassword,
          role,
        },
      });

      if (role === 'student') {
        await tx.student.create({
          data: {
            user_id: newUser.id,
            full_name,
            classroom, grade_level, major,
            ...(nisn !== undefined && { nisn }),
          }
        });
      } else if (role === 'teacher') {
        await tx.teacher.create({
          data: {
            user_id: newUser.id,
            full_name,
            ...(nip !== undefined && { nip }),
          }
        });
      } else if (role === 'admin') {
        await tx.admin.create({
          data: {
            user_id: newUser.id,
            full_name
          }
        });
      }

      return newUser;
    });

    res.status(201).json({ message: 'User berhasil didaftarkan', userId: result.id });

  } catch (error) {
    if (error.code === 'P2002') {
        return res.status(400).json({ error: 'Username sudah digunakan' });
    }
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

const login = async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await prisma.user.findUnique({
      where: { username },
      include: {
        student: true,
        teacher: true,
        admin: true
      }
    });

    if (!user) {
      // Timing attack mitigation: perform dummy compare even when user not found
      await bcrypt.compare(password, '$2a$12$000000000000000000000u000000000000000000000000000000');
      return res.status(401).json({ error: 'Username atau password salah' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(401).json({ error: 'Username atau password salah' });

    if (!user.is_active) return res.status(403).json({ error: 'Akun dinonaktifkan' });

    let profileData = null;
    if (user.role === 'student') profileData = user.student;
    else if (user.role === 'teacher') profileData = user.teacher;
    else if (user.role === 'admin') profileData = user.admin;

    const token = jwt.sign(
      { id: user.id, role: user.role, is_super_admin: user.is_super_admin || false }, 
      process.env.JWT_SECRET, 
      { expiresIn: '1d' }
    );

    // Log activity
    await activityLogService.createLog({
      user_id: user.id,
      activity_type: 'LOGIN',
      description: `User ${username} (${user.role}) berhasil login`,
      ip_address: activityLogService.getIpAddress(req),
      user_agent: activityLogService.getUserAgent(req),
      metadata: {
        username,
        role: user.role
      }
    });

    res.json({
      message: 'Login berhasil',
      token,
      user: {
        id: user.id,
        role: user.role,
        is_super_admin: user.is_super_admin || false,
        profile: profileData // Data nama, classroom, dll terkirim disini
      }
    });

  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// Get current authenticated user profile
const me = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { student: true, teacher: true, admin: true },
    });

    if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });

    let profileData = null;
    if (user.role === 'student') profileData = user.student;
    else if (user.role === 'teacher') profileData = user.teacher;
    else if (user.role === 'admin') profileData = user.admin;

    res.json({
      message: 'Profile fetched',
      user: {
        id: user.id,
        role: user.role,
        is_super_admin: user.is_super_admin || false,
        profile: profileData,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// Update profile for authenticated user
const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { full_name, classroom, grade_level, major, nisn, nip } = req.body;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });

    let updatedProfile = null;

    if (user.role === 'student') {
      const student = await prisma.student.findUnique({ where: { user_id: userId } });
      if (!student) return res.status(404).json({ error: 'Profil siswa tidak ditemukan' });

      updatedProfile = await prisma.student.update({
        where: { user_id: userId },
        data: {
          ...(full_name !== undefined && { full_name: full_name }),
          ...(classroom !== undefined && { classroom: classroom }),
          ...(grade_level !== undefined && { grade_level: grade_level }),
          ...(major !== undefined && { major: major }),
          ...(nisn !== undefined && { nisn: nisn }),
        },
      });
    } else if (user.role === 'teacher') {
      const teacher = await prisma.teacher.findUnique({ where: { user_id: userId } });
      if (!teacher) return res.status(404).json({ error: 'Profil guru tidak ditemukan' });

      updatedProfile = await prisma.teacher.update({
        where: { user_id: userId },
        data: {
          ...(full_name !== undefined && { full_name: full_name }),
          ...(nip !== undefined && { nip: nip }),
        },
      });
    } else if (user.role === 'admin') {
      const admin = await prisma.admin.findUnique({ where: { user_id: userId } });
      if (!admin) return res.status(404).json({ error: 'Profil admin tidak ditemukan' });

      updatedProfile = await prisma.admin.update({
        where: { user_id: userId },
        data: {
          ...(full_name !== undefined && { full_name: full_name }),
        },
      });
    }

    // Return updated user object similar to login response
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
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

module.exports = { register, login, me, updateProfile };