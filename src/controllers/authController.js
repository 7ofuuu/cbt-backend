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

module.exports = { register, login };