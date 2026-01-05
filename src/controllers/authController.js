const prisma = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const activityLogService = require('../services/activityLogService');

const register = async (req, res) => {
  const { username, password, role, nama, kelas, tingkat, jurusan } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          username,
          password: hashedPassword,
          role,
        },
      });

      if (role === 'siswa') {
        await tx.siswa.create({
          data: {
            userId: newUser.id,
            nama_lengkap: nama,
            kelas, tingkat, jurusan
          }
        });
      } else if (role === 'guru') {
        await tx.guru.create({
          data: {
            userId: newUser.id,
            nama_lengkap: nama
          }
        });
      } else if (role === 'admin') {
        await tx.admin.create({
          data: {
            userId: newUser.id,
            nama_lengkap: nama
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
    res.status(500).json({ error: error.message });
  }
};

const login = async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await prisma.user.findUnique({
      where: { username },
      include: {
        siswa: true,
        guru: true,
        admin: true
      }
    });

    if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(401).json({ error: 'Password salah' });

    if (!user.status_aktif) return res.status(403).json({ error: 'Akun dinonaktifkan' });

    let profileData = null;
    if (user.role === 'siswa') profileData = user.siswa;
    else if (user.role === 'guru') profileData = user.guru;
    else if (user.role === 'admin') profileData = user.admin;

    const token = jwt.sign(
      { id: user.id, role: user.role }, 
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
        profile: profileData // Data nama, kelas, dll terkirim disini
      }
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get current authenticated user profile
const me = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { siswa: true, guru: true, admin: true },
    });

    if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });

    let profileData = null;
    if (user.role === 'siswa') profileData = user.siswa;
    else if (user.role === 'guru') profileData = user.guru;
    else if (user.role === 'admin') profileData = user.admin;

    res.json({
      message: 'Profile fetched',
      token: '',
      user: {
        id: user.id,
        role: user.role,
        profile: profileData,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update profile for authenticated user
const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { nama_lengkap, kelas, tingkat, jurusan } = req.body;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });

    let updatedProfile = null;

    if (user.role === 'siswa') {
      const siswa = await prisma.siswa.findUnique({ where: { userId } });
      if (!siswa) return res.status(404).json({ error: 'Profil siswa tidak ditemukan' });

      updatedProfile = await prisma.siswa.update({
        where: { userId },
        data: {
          ...(nama_lengkap !== undefined && { nama_lengkap }),
          ...(kelas !== undefined && { kelas }),
          ...(tingkat !== undefined && { tingkat }),
          ...(jurusan !== undefined && { jurusan }),
        },
      });
    } else if (user.role === 'guru') {
      const guru = await prisma.guru.findUnique({ where: { userId } });
      if (!guru) return res.status(404).json({ error: 'Profil guru tidak ditemukan' });

      updatedProfile = await prisma.guru.update({
        where: { userId },
        data: {
          ...(nama_lengkap !== undefined && { nama_lengkap }),
        },
      });
    } else if (user.role === 'admin') {
      const admin = await prisma.admin.findUnique({ where: { userId } });
      if (!admin) return res.status(404).json({ error: 'Profil admin tidak ditemukan' });

      updatedProfile = await prisma.admin.update({
        where: { userId },
        data: {
          ...(nama_lengkap !== undefined && { nama_lengkap }),
        },
      });
    }

    // Return updated user object similar to login response
    const freshUser = await prisma.user.findUnique({
      where: { id: userId },
      include: { siswa: true, guru: true, admin: true },
    });

    let profileData = null;
    if (freshUser.role === 'siswa') profileData = freshUser.siswa;
    else if (freshUser.role === 'guru') profileData = freshUser.guru;
    else if (freshUser.role === 'admin') profileData = freshUser.admin;

    res.json({
      message: 'Profile updated',
      token: '',
      user: {
        id: freshUser.id,
        role: freshUser.role,
        profile: profileData,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = { register, login, me, updateProfile };