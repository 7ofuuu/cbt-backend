const prisma = require('../config/db');

// Create Soal dengan Opsi Jawaban
const createSoal = async (req, res) => {
  const { tipe_soal, teks_soal, mata_pelajaran, tingkat, jurusan, soal_gambar, soal_pembahasan, opsi_jawaban } = req.body;
  const guru_id = req.user.id; // Dari token JWT

  try {
    // Cari guru_id dari userId
    const guru = await prisma.guru.findUnique({ where: { userId: guru_id } });
    if (!guru) return res.status(404).json({ error: 'Guru tidak ditemukan' });

    const result = await prisma.$transaction(async tx => {
      // Buat soal
      const soal = await tx.soals.create({
        data: {
          tipe_soal,
          teks_soal,
          mata_pelajaran,
          tingkat,
          jurusan: jurusan || null,
          soal_gambar: soal_gambar || null,
          soal_pembahasan: soal_pembahasan || null,
          guru_id: guru.guru_id,
        },
      });

      // Jika pilihan ganda, buat opsi jawaban
      if (tipe_soal !== 'ESSAY' && opsi_jawaban && opsi_jawaban.length > 0) {
        await tx.opsi_jawabans.createMany({
          data: opsi_jawaban.map(opsi => ({
            soal_id: soal.soal_id,
            label: opsi.label,
            teks_opsi: opsi.teks_opsi,
            is_benar: opsi.is_benar || false,
          })),
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

    const soals = await prisma.soals.findMany({
      where: filters,
      include: {
        opsi_jawabans: true,
      },
      orderBy: { createdAt: 'desc' },
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
    const soal = await prisma.soals.findUnique({
      where: { soal_id: parseInt(id) },
      include: { opsi_jawabans: true },
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
      where: { soal_id: parseInt(id), guru_id: guru.guru_id },
    });
    if (!soal) return res.status(403).json({ error: 'Soal tidak ditemukan atau bukan milik Anda' });

    const result = await prisma.$transaction(async tx => {
      // Update soal
      const updatedSoal = await tx.soals.update({
        where: { soal_id: parseInt(id) },
        data: {
          teks_soal: teks_soal || soal.teks_soal,
          mata_pelajaran: mata_pelajaran || soal.mata_pelajaran,
          tingkat: tingkat || soal.tingkat,
          jurusan: jurusan !== undefined ? jurusan : soal.jurusan,
          soal_gambar: soal_gambar !== undefined ? soal_gambar : soal.soal_gambar,
          soal_pembahasan: soal_pembahasan !== undefined ? soal_pembahasan : soal.soal_pembahasan,
        },
      });

      // Update opsi jawaban jika ada
      if (opsi_jawaban && opsi_jawaban.length > 0) {
        // Hapus opsi lama
        await tx.opsi_jawabans.deleteMany({ where: { soal_id: parseInt(id) } });

        // Buat opsi baru
        await tx.opsi_jawabans.createMany({
          data: opsi_jawaban.map(opsi => ({
            soal_id: parseInt(id),
            label: opsi.label,
            teks_opsi: opsi.teks_opsi,
            is_benar: opsi.is_benar || false,
          })),
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
    const soal = await prisma.soals.findFirst({
      where: { soal_id: parseInt(id), guru_id: guru.guru_id },
    });
    if (!soal) return res.status(403).json({ error: 'Soal tidak ditemukan atau bukan milik Anda' });

    await prisma.soals.delete({ where: { soal_id: parseInt(id) } });

    res.json({ message: 'Soal berhasil dihapus' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get Bank Soal (Grouped by Mata Pelajaran, Tingkat, Jurusan)
const getBankSoal = async (req, res) => {
  const guru_id = req.user.id;

  try {
    const guru = await prisma.guru.findUnique({ where: { userId: guru_id } });
    if (!guru) return res.status(404).json({ error: 'Guru tidak ditemukan' });

    // Get all soals grouped
    const soals = await prisma.soals.findMany({
      where: { guru_id: guru.guru_id },
      select: {
        soal_id: true,
        mata_pelajaran: true,
        tingkat: true,
        jurusan: true,
        tipe_soal: true,
      },
    });

    // Group by mata_pelajaran + tingkat + jurusan
    const bankSoalMap = new Map();

    soals.forEach(soal => {
      const key = `${soal.mata_pelajaran}|${soal.tingkat}|${soal.jurusan || 'umum'}`;

      if (!bankSoalMap.has(key)) {
        bankSoalMap.set(key, {
          mata_pelajaran: soal.mata_pelajaran,
          tingkat: soal.tingkat,
          jurusan: soal.jurusan || null,
          soal_ids: [],
          jumlah_soal: 0,
          jumlah_pg: 0,
          jumlah_essay: 0,
        });
      }

      const grup = bankSoalMap.get(key);
      grup.soal_ids.push(soal.soal_id);
      grup.jumlah_soal++;

      if (soal.tipe_soal === 'ESSAY') {
        grup.jumlah_essay++;
      } else {
        grup.jumlah_pg++;
      }
    });

    const bankSoal = Array.from(bankSoalMap.values());

    res.json({
      bankSoal,
      total_grup: bankSoal.length,
      total_soal: soals.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get Soal by Specific Bank (mata_pelajaran, tingkat, jurusan)
const getSoalByBank = async (req, res) => {
  const { mataPelajaran, tingkat, jurusan } = req.params;
  const guru_id = req.user.id;

  try {
    const guru = await prisma.guru.findUnique({ where: { userId: guru_id } });
    if (!guru) return res.status(404).json({ error: 'Guru tidak ditemukan' });

    // Build filter for specific bank
    const filters = {
      guru_id: guru.guru_id,
      mata_pelajaran: mataPelajaran,
      tingkat: tingkat,
    };

    // Handle jurusan: 'umum' means null in database
    if (jurusan && jurusan.toLowerCase() !== 'umum') {
      filters.jurusan = jurusan;
    } else {
      filters.jurusan = null;
    }

    // Get all soals from this specific bank
    const soals = await prisma.soals.findMany({
      where: filters,
      include: {
        opsi_jawabans: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Calculate statistics
    const stats = {
      total_soal: soals.length,
      total_pg_single: soals.filter(s => s.tipe_soal === 'PILIHAN_GANDA_SINGLE').length,
      total_pg_multiple: soals.filter(s => s.tipe_soal === 'PILIHAN_GANDA_MULTIPLE').length,
      total_essay: soals.filter(s => s.tipe_soal === 'ESSAY').length,
    };

    res.json({
      bankInfo: {
        mata_pelajaran: mataPelajaran,
        tingkat: tingkat,
        jurusan: jurusan === 'umum' ? null : jurusan,
      },
      soals,
      stats,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get Soal Tersedia untuk Ujian (dengan auto-filter dari ujian)
const getSoalTersediaUntukUjian = async (req, res) => {
  const { ujian_id } = req.params;
  const guru_id = req.user.id;

  try {
    const guru = await prisma.guru.findUnique({ where: { userId: guru_id } });
    if (!guru) return res.status(404).json({ error: 'Guru tidak ditemukan' });

    // Get ujian data
    const ujian = await prisma.ujians.findFirst({
      where: { ujian_id: parseInt(ujian_id), guru_id: guru.guru_id },
      include: {
        soal_ujians: { select: { soal_id: true } },
      },
    });

    if (!ujian) return res.status(404).json({ error: 'Ujian tidak ditemukan' });

    // Auto-filter berdasarkan ujian
    const filters = {
      guru_id: guru.guru_id,
      mata_pelajaran: ujian.mata_pelajaran,
      tingkat: ujian.tingkat,
    };

    if (ujian.jurusan) filters.jurusan = ujian.jurusan;

    // Get all matching soals
    const soals = await prisma.soals.findMany({
      where: filters,
      select: {
        soal_id: true,
        tipe_soal: true,
      },
    });

    // Get soal yang sudah di-assign
    const soalIdsYangSudahDipakai = ujian.soal_ujians.map(su => su.soal_id);
    const soalIdsTersedia = soals.filter(s => !soalIdsYangSudahDipakai.includes(s.soal_id)).map(s => s.soal_id);

    const jumlahPG = soals.filter(s => s.tipe_soal !== 'ESSAY' && !soalIdsYangSudahDipakai.includes(s.soal_id)).length;
    const jumlahEssay = soals.filter(s => s.tipe_soal === 'ESSAY' && !soalIdsYangSudahDipakai.includes(s.soal_id)).length;

    res.json({
      ujian: {
        ujian_id: ujian.ujian_id,
        nama_ujian: ujian.nama_ujian,
        mata_pelajaran: ujian.mata_pelajaran,
        tingkat: ujian.tingkat,
        jurusan: ujian.jurusan,
      },
      bank_soal: {
        soal_ids: soalIdsTersedia,
        jumlah_tersedia: soalIdsTersedia.length,
        jumlah_pg: jumlahPG,
        jumlah_essay: jumlahEssay,
        sudah_dipakai: soalIdsYangSudahDipakai.length,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Assign All Soal dari Bank ke Ujian
const assignBankSoalToUjian = async (req, res) => {
  const { ujian_id, mata_pelajaran, tingkat, jurusan } = req.body;
  const guru_id = req.user.id;

  try {
    const guru = await prisma.guru.findUnique({ where: { userId: guru_id } });
    if (!guru) return res.status(404).json({ error: 'Guru tidak ditemukan' });

    // Check ownership ujian
    const ujian = await prisma.ujians.findFirst({
      where: { ujian_id, guru_id: guru.guru_id },
      include: {
        soal_ujians: {
          orderBy: { urutan: 'desc' },
          take: 1,
        },
      },
    });
    if (!ujian) return res.status(403).json({ error: 'Ujian tidak ditemukan atau bukan milik Anda' });

    // Get all soals dari bank yang dipilih
    const filters = {
      guru_id: guru.guru_id,
      mata_pelajaran,
      tingkat,
    };
    if (jurusan) filters.jurusan = jurusan;

    const soals = await prisma.soals.findMany({
      where: filters,
      select: { soal_id: true },
    });

    if (soals.length === 0) {
      return res.status(404).json({ error: 'Tidak ada soal di bank tersebut' });
    }

    // Get last urutan
    let currentUrutan = ujian.soal_ujians.length > 0 ? ujian.soal_ujians[0].urutan : 0;

    // Prepare data untuk batch insert
    const soalUjianData = soals.map(soal => ({
      ujian_id,
      soal_id: soal.soal_id,
      bobot_nilai: 10, // Default, bisa diubah nanti
      urutan: ++currentUrutan,
    }));

    // Batch insert
    const result = await prisma.soal_ujians.createMany({
      data: soalUjianData,
      skipDuplicates: true,
    });

    res.status(201).json({
      message: `${result.count} soal berhasil ditambahkan ke ujian`,
      bank_soal: {
        mata_pelajaran,
        tingkat,
        jurusan: jurusan || 'umum',
      },
      jumlah_soal_ditambahkan: result.count,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = { 
  createSoal, 
  getSoals, 
  getSoalById, 
  updateSoal, 
  deleteSoal,
  getBankSoal,
  getSoalByBank,
  getSoalTersediaUntukUjian,
  assignBankSoalToUjian
};
