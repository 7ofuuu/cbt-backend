const prisma = require('../config/db');
const bcrypt = require('bcryptjs');

// Get All Users (Admin only)
const getAllUsers = async (req, res) => {
  const { role, status_aktif, username } = req.query;

  try {
    const filters = {};
    if (role) filters.role = role;
    if (status_aktif !== undefined) filters.status_aktif = status_aktif === 'true';
    if (username) filters.username = username;

    const users = await prisma.user.findMany({
      where: filters,
      include: {
        admin: true,
        guru: true,
        siswa: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ users });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Create User (Admin only) - sama seperti register
const createUser = async (req, res) => {
  const { username, password, role, nama, kelas, tingkat, jurusan } = req.body;

  // Validate required fields
  if (!username || !password || !role || !nama) {
    return res.status(400).json({
      error: 'Data tidak lengkap. Username, password, role, dan nama wajib diisi.'
    });
  }

  // Validate role-specific fields
  if (role === 'siswa' && (!kelas || !tingkat || !jurusan)) {
    return res.status(400).json({
      error: 'Data siswa tidak lengkap. Kelas, tingkat, dan jurusan wajib diisi untuk siswa.'
    });
  }

  // Validate tingkat value
  const validTingkats = ['X', 'XI', 'XII'];
  if (role === 'siswa' && !validTingkats.includes(tingkat)) {
    return res.status(400).json({
      error: `Tingkat tidak valid. Pilih salah satu: ${validTingkats.join(', ')}`
    });
  }

  // Validate jurusan value
  const validJurusans = ['IPA', 'IPS', 'Bahasa'];
  if (role === 'siswa' && !validJurusans.includes(jurusan)) {
    return res.status(400).json({
      error: `Jurusan tidak valid. Pilih salah satu: ${validJurusans.join(', ')}`
    });
  }

  // Validate kelas format for siswa (must be "X-IPA-1" or "XII-IPS-2" format)
  if (role === 'siswa') {
    // Format: tingkat-jurusan-nomor (contoh: XII-IPA-1, X-IPS-2)
    const kelasPattern = /^(X|XI|XII)-(IPA|IPS|Bahasa)-(\d+)$/;
    if (!kelasPattern.test(kelas)) {
      return res.status(400).json({
        error: 'Format kelas tidak valid. Gunakan format: tingkat-jurusan-nomor (contoh: XII-IPA-1, X-IPS-2)'
      });
    }

    // Validate consistency: kelas must match tingkat and jurusan
    const [, kelasTingkat, kelasJurusan] = kelas.match(kelasPattern);
    
    if (kelasTingkat !== tingkat) {
      return res.status(400).json({
        error: `Tingkat pada kelas (${kelasTingkat}) tidak sesuai dengan tingkat yang dipilih (${tingkat})`
      });
    }

    if (kelasJurusan !== jurusan) {
      return res.status(400).json({
        error: `Jurusan pada kelas (${kelasJurusan}) tidak sesuai dengan jurusan yang dipilih (${jurusan})`
      });
    }
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await prisma.$transaction(async tx => {
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
            kelas,
            tingkat,
            jurusan,
          },
        });
      } else if (role === 'guru') {
        await tx.guru.create({
          data: {
            userId: newUser.id,
            nama_lengkap: nama,
          },
        });
      } else if (role === 'admin') {
        await tx.admin.create({
          data: {
            userId: newUser.id,
            nama_lengkap: nama,
          },
        });
      }

      return newUser;
    });

    res.status(201).json({ message: 'User berhasil dibuat', userId: result.id });
  } catch (error) {
    console.error('Error creating user:', error);
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Username sudah digunakan' });
    }
    res.status(500).json({ error: error.message });
  }
};

// Update User Role (Admin only)
const updateUserRole = async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  try {
    // Validasi role
    if (!['admin', 'guru', 'siswa'].includes(role)) {
      return res.status(400).json({ error: 'Role tidak valid' });
    }

    const user = await prisma.user.findUnique({
      where: { id: parseInt(id) },
      include: { admins: true, gurus: true, siswas: true },
    });

    if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });

    // Jika role sama, skip
    if (user.role === role) {
      return res.status(400).json({ error: 'Role sudah sama' });
    }

    await prisma.$transaction(async tx => {
      // Hapus profil lama
      if (user.admin) await tx.admin.delete({ where: { userId: user.id } });
      if (user.guru) await tx.guru.delete({ where: { userId: user.id } });
      if (user.siswa) await tx.siswa.delete({ where: { userId: user.id } });

      // Update role
      await tx.user.update({
        where: { id: parseInt(id) },
        data: { role },
      });

      // Buat profil baru (dengan data default)
      if (role === 'admin') {
        await tx.admin.create({ data: { userId: user.id, nama_lengkap: 'Admin' } });
      } else if (role === 'guru') {
        await tx.guru.create({ data: { userId: user.id, nama_lengkap: 'Guru' } });
      } else if (role === 'siswa') {
        await tx.siswa.create({
          data: {
            userId: user.id,
            nama_lengkap: 'Siswa',
            kelas: '-',
            tingkat: '-',
            jurusan: '-',
          },
        });
      }
    });

    res.json({ message: 'Role user berhasil diubah' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Toggle User Status (Admin only)
const toggleUserStatus = async (req, res) => {
  const { id } = req.params;

  try {
    const user = await prisma.user.findUnique({ where: { id: parseInt(id) } });
    if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });

    const updated = await prisma.user.update({
      where: { id: parseInt(id) },
      data: { status_aktif: !user.status_aktif },
    });

    res.json({
      message: `User ${updated.status_aktif ? 'diaktifkan' : 'dinonaktifkan'}`,
      status_aktif: updated.status_aktif,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Delete User (Admin only)
const deleteUser = async (req, res) => {
  const { id } = req.params;

  try {
    const user = await prisma.user.findUnique({ where: { id: parseInt(id) } });
    if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });

    await prisma.user.delete({ where: { id: parseInt(id) } });

    res.json({ message: 'User berhasil dihapus' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Nilai Siswa (Guru) - untuk essay manual
const nilaiJawaban = async (req, res) => {
  const { jawaban_id, nilai_manual } = req.body;

  try {
    // Validate nilai range
    if (nilai_manual < 0 || nilai_manual > 100) {
      return res.status(400).json({ error: 'Nilai harus antara 0-100' });
    }

    const jawaban = await prisma.jawabans.findUnique({
      where: { jawaban_id },
      include: {
        soal: true,
        pesertaUjian: {
          include: {
            ujian: {
              include: { guru: true },
            },
          },
        },
      },
    });

    if (!jawaban) return res.status(404).json({ error: 'Jawaban tidak ditemukan' });

    // Check ownership guru
    if (jawaban.pesertaUjian.ujian.guru.userId !== req.user.id) {
      return res.status(403).json({ error: 'Anda tidak berhak menilai jawaban ini' });
    }

    const updatedJawaban = await prisma.jawabans.update({
      where: { jawaban_id },
      data: { nilai_manual },
    });

    res.json({ message: 'Jawaban berhasil dinilai', jawaban: updatedJawaban });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Finalisasi Nilai (Guru) - hitung total nilai
const finalisasiNilai = async (req, res) => {
  const { peserta_ujian_id } = req.body;

  try {
    const pesertaUjian = await prisma.peserta_ujians.findUnique({
      where: { peserta_ujian_id },
      include: {
        ujian: {
          include: {
            guru: true,
            soalUjians: true,
          },
        },
        jawabans: {
          include: { soal: true },
        },
      },
    });

    if (!pesertaUjian) return res.status(404).json({ error: 'Peserta ujian tidak ditemukan' });

    // Check ownership
    if (pesertaUjian.ujian.guru.userId !== req.user.id) {
      return res.status(403).json({ error: 'Anda tidak berhak menilai ujian ini' });
    }

    // Hitung total nilai
    let totalNilai = 0;
    let totalBobot = 0;

    for (const jawaban of pesertaUjian.jawabans) {
      const soalUjian = pesertaUjian.ujian.soalUjians.find(su => su.soal_id === jawaban.soal_id);
      if (!soalUjian) continue;

      const bobot = soalUjian.bobot_nilai;
      totalBobot += bobot;

      // Hitung nilai per soal
      if (jawaban.soal.tipe_soal === 'ESSAY') {
        // Untuk essay, gunakan nilai manual
        if (jawaban.nilai_manual !== null) {
          totalNilai += (jawaban.nilai_manual / 100) * bobot;
        }
      } else {
        // Untuk pilihan ganda, gunakan is_correct
        if (jawaban.is_correct) {
          totalNilai += bobot;
        }
      }
    }

    // Konversi ke skala 0-100
    const nilaiAkhir = totalBobot > 0 ? (totalNilai / totalBobot) * 100 : 0;

    // Simpan atau update hasil ujian
    const existingHasil = await prisma.hasilUjian.findUnique({
      where: { peserta_ujian_id },
    });

    if (existingHasil) {
      await prisma.hasilUjian.update({
        where: { peserta_ujian_id },
        data: { nilai_akhir: nilaiAkhir },
      });
    } else {
      await prisma.hasilUjian.create({
        data: {
          peserta_ujian_id,
          nilai_akhir: nilaiAkhir,
        },
      });
    }

    // Update status peserta ujian
    await prisma.peserta_ujians.update({
      where: { peserta_ujian_id },
      data: { status_ujian: 'DINILAI' },
    });

    res.json({
      message: 'Nilai berhasil difinalisasi',
      nilai_akhir: nilaiAkhir.toFixed(2),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Batch Create Users (Admin only)
const batchCreateUsers = async (req, res) => {
  const { users } = req.body;

  if (!Array.isArray(users) || users.length === 0) {
    return res.status(400).json({ error: 'Data users harus berupa array dan tidak boleh kosong' });
  }

  const results = {
    success: 0,
    failed: 0,
    total: users.length,
    errors: [],
  };

  try {
    for (const userData of users) {
      try {
        const { username, password, role, nama, kelas, tingkat, jurusan } = userData;

        // Validate required fields
        if (!username || !password || !role || !nama) {
          results.failed++;
          results.errors.push({ username, error: 'Data tidak lengkap' });
          continue;
        }

        // Validate role-specific fields
        if (role === 'siswa' && (!kelas || !tingkat || !jurusan)) {
          results.failed++;
          results.errors.push({ username, error: 'Data siswa tidak lengkap (kelas, tingkat, jurusan)' });
          continue;
        }

        // Validate tingkat value
        const validTingkats = ['X', 'XI', 'XII'];
        if (role === 'siswa' && !validTingkats.includes(tingkat)) {
          results.failed++;
          results.errors.push({ username, error: `Tingkat tidak valid: "${tingkat}". Pilih: ${validTingkats.join(', ')}` });
          continue;
        }

        // Validate jurusan value
        const validJurusans = ['IPA', 'IPS', 'Bahasa'];
        if (role === 'siswa' && !validJurusans.includes(jurusan)) {
          results.failed++;
          results.errors.push({ username, error: `Jurusan tidak valid: "${jurusan}". Pilih: ${validJurusans.join(', ')}` });
          continue;
        }

        // Validate kelas format for siswa (tingkat-jurusan-nomor)
        if (role === 'siswa') {
          const kelasPattern = /^(X|XI|XII)-(IPA|IPS|Bahasa)-(\d+)$/;
          if (!kelasPattern.test(kelas)) {
            results.failed++;
            results.errors.push({
              username,
              error: `Format kelas tidak valid: "${kelas}". Gunakan format: tingkat-jurusan-nomor (contoh: XII-IPA-1)`
            });
            continue;
          }

          // Validate consistency: kelas must match tingkat and jurusan
          const [, kelasTingkat, kelasJurusan] = kelas.match(kelasPattern);
          
          if (kelasTingkat !== tingkat) {
            results.failed++;
            results.errors.push({
              username,
              error: `Tingkat pada kelas (${kelasTingkat}) tidak sesuai dengan tingkat (${tingkat})`
            });
            continue;
          }

          if (kelasJurusan !== jurusan) {
            results.failed++;
            results.errors.push({
              username,
              error: `Jurusan pada kelas (${kelasJurusan}) tidak sesuai dengan jurusan (${jurusan})`
            });
            continue;
          }
        }

        // Check if username already exists
        const existingUser = await prisma.user.findUnique({
          where: { username },
        });

        if (existingUser) {
          results.failed++;
          results.errors.push({ username, error: 'Username sudah digunakan' });
          continue;
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user with transaction
        await prisma.$transaction(async tx => {
          const newUser = await tx.user.create({
            data: {
              username,
              password: hashedPassword,
              role,
            },
          });

          // Create role-specific profile
          if (role === 'siswa') {
            await tx.siswa.create({
              data: {
                userId: newUser.id,
                nama_lengkap: nama,
                kelas,
                tingkat,
                jurusan,
              },
            });
          } else if (role === 'guru') {
            await tx.guru.create({
              data: {
                userId: newUser.id,
                nama_lengkap: nama,
              },
            });
          } else if (role === 'admin') {
            await tx.admin.create({
              data: {
                userId: newUser.id,
                nama_lengkap: nama,
              },
            });
          }
        });

        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          username: userData.username,
          error: error.message,
        });
      }
    }

    res.status(200).json({
      message: 'Batch import selesai',
      ...results,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getAllUsers,
  createUser,
  batchCreateUsers,
  updateUserRole,
  toggleUserStatus,
  deleteUser,
  nilaiJawaban,
  finalisasiNilai
};
