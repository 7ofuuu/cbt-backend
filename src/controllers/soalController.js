const prisma = require('../config/db');

// Create Soal dengan Opsi Jawaban
const createSoal = async (req, res) => {
  const { tipe_soal, teks_soal, mata_pelajaran, tingkat, jurusan, soal_gambar, soal_pembahasan, opsi_jawaban } = req.body;
  const guru_id = req.user.id; // Dari token JWT

  try {
    // Cari guru_id dari userId
    const guru = await prisma.guru.findUnique({ where: { userId: guru_id } });
    if (!guru) return res.status(404).json({ error: 'Guru tidak ditemukan' });

    const result = await prisma.$transaction(async (tx) => {
      // Buat soal
      const soal = await tx.soal.create({
        data: {
          tipe_soal,
          teks_soal,
          mata_pelajaran,
          tingkat,
          jurusan: jurusan || null,
          soal_gambar: soal_gambar || null,
          soal_pembahasan: soal_pembahasan || null,
          guru_id: guru.guru_id
        }
      });

      // Jika pilihan ganda, buat opsi jawaban
      if (tipe_soal !== 'ESSAY' && opsi_jawaban && opsi_jawaban.length > 0) {
        await tx.opsiJawaban.createMany({
          data: opsi_jawaban.map(opsi => ({
            soal_id: soal.soal_id,
            label: opsi.label,
            teks_opsi: opsi.teks_opsi,
            is_benar: opsi.is_benar || false
          }))
        });
      }

      return soal;
    });

    res.status(201).json({ message: 'Soal berhasil dibuat', soal_id: result.soal_id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get All Soal (dengan filter)
const getSoals = async (req, res) => {
  const { mata_pelajaran, tingkat, jurusan, tipe_soal } = req.query;
  const guru_id = req.user.id;

  try {
    const guru = await prisma.guru.findUnique({ where: { userId: guru_id } });
    if (!guru) return res.status(404).json({ error: 'Guru tidak ditemukan' });

    const filters = { guru_id: guru.guru_id };
    if (mata_pelajaran) filters.mata_pelajaran = mata_pelajaran;
    if (tingkat) filters.tingkat = tingkat;
    if (jurusan) filters.jurusan = jurusan;
    if (tipe_soal) filters.tipe_soal = tipe_soal;

    const soals = await prisma.soal.findMany({
      where: filters,
      include: {
        opsiJawabans: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ soals });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get Single Soal by ID
const getSoalById = async (req, res) => {
  const { id } = req.params;

  try {
    const soal = await prisma.soal.findUnique({
      where: { soal_id: parseInt(id) },
      include: { opsiJawabans: true }
    });

    if (!soal) return res.status(404).json({ error: 'Soal tidak ditemukan' });

    res.json({ soal });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update Soal
const updateSoal = async (req, res) => {
  const { id } = req.params;
  const { teks_soal, mata_pelajaran, tingkat, jurusan, soal_gambar, soal_pembahasan, opsi_jawaban } = req.body;
  const guru_id = req.user.id;

  try {
    const guru = await prisma.guru.findUnique({ where: { userId: guru_id } });
    if (!guru) return res.status(404).json({ error: 'Guru tidak ditemukan' });

    // Check ownership
    const soal = await prisma.soal.findFirst({
      where: { soal_id: parseInt(id), guru_id: guru.guru_id }
    });
    if (!soal) return res.status(403).json({ error: 'Soal tidak ditemukan atau bukan milik Anda' });

    const result = await prisma.$transaction(async (tx) => {
      // Update soal
      const updatedSoal = await tx.soal.update({
        where: { soal_id: parseInt(id) },
        data: {
          teks_soal: teks_soal || soal.teks_soal,
          mata_pelajaran: mata_pelajaran || soal.mata_pelajaran,
          tingkat: tingkat || soal.tingkat,
          jurusan: jurusan !== undefined ? jurusan : soal.jurusan,
          soal_gambar: soal_gambar !== undefined ? soal_gambar : soal.soal_gambar,
          soal_pembahasan: soal_pembahasan !== undefined ? soal_pembahasan : soal.soal_pembahasan
        }
      });

      // Update opsi jawaban jika ada
      if (opsi_jawaban && opsi_jawaban.length > 0) {
        // Hapus opsi lama
        await tx.opsiJawaban.deleteMany({ where: { soal_id: parseInt(id) } });
        
        // Buat opsi baru
        await tx.opsiJawaban.createMany({
          data: opsi_jawaban.map(opsi => ({
            soal_id: parseInt(id),
            label: opsi.label,
            teks_opsi: opsi.teks_opsi,
            is_benar: opsi.is_benar || false
          }))
        });
      }

      return updatedSoal;
    });

    res.json({ message: 'Soal berhasil diupdate', soal: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Delete Soal
const deleteSoal = async (req, res) => {
  const { id } = req.params;
  const guru_id = req.user.id;

  try {
    const guru = await prisma.guru.findUnique({ where: { userId: guru_id } });
    if (!guru) return res.status(404).json({ error: 'Guru tidak ditemukan' });

    // Check ownership
    const soal = await prisma.soal.findFirst({
      where: { soal_id: parseInt(id), guru_id: guru.guru_id }
    });
    if (!soal) return res.status(403).json({ error: 'Soal tidak ditemukan atau bukan milik Anda' });

    await prisma.soal.delete({ where: { soal_id: parseInt(id) } });

    res.json({ message: 'Soal berhasil dihapus' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = { createSoal, getSoals, getSoalById, updateSoal, deleteSoal };
