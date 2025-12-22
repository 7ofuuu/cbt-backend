const prisma = require('../config/db');

// Create Ujian
const createUjian = async (req, res) => {
  const { 
    nama_ujian, 
    mata_pelajaran, 
    tingkat, 
    jurusan, 
    tanggal_mulai, 
    tanggal_selesai, 
    durasi_menit, 
    is_acak_soal 
  } = req.body;
  const guru_id = req.user.id;

  try {
    const guru = await prisma.guru.findUnique({ where: { userId: guru_id } });
    if (!guru) return res.status(404).json({ error: 'Guru tidak ditemukan' });

    const ujian = await prisma.ujian.create({
      data: {
        nama_ujian,
        mata_pelajaran,
        tingkat,
        jurusan: jurusan || null,
        tanggal_mulai: new Date(tanggal_mulai),
        tanggal_selesai: new Date(tanggal_selesai),
        durasi_menit,
        is_acak_soal: is_acak_soal || false,
        guru_id: guru.guru_id
      }
    });

    res.status(201).json({ message: 'Ujian berhasil dibuat', ujian_id: ujian.ujian_id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get All Ujian (Guru)
const getUjians = async (req, res) => {
  const guru_id = req.user.id;

  try {
    const guru = await prisma.guru.findUnique({ where: { userId: guru_id } });
    if (!guru) return res.status(404).json({ error: 'Guru tidak ditemukan' });

    const ujians = await prisma.ujian.findMany({
      where: { guru_id: guru.guru_id },
      include: {
        soalUjians: {
          include: { soal: true }
        },
        pesertaUjians: {
          include: { siswa: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ ujians });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get Ujian by ID
const getUjianById = async (req, res) => {
  const { id } = req.params;

  try {
    const ujian = await prisma.ujian.findUnique({
      where: { ujian_id: parseInt(id) },
      include: {
        soalUjians: {
          include: { 
            soal: {
              include: { opsiJawabans: true }
            }
          },
          orderBy: { urutan: 'asc' }
        },
        pesertaUjians: {
          include: { 
            siswa: true,
            hasilUjian: true
          }
        }
      }
    });

    if (!ujian) return res.status(404).json({ error: 'Ujian tidak ditemukan' });

    res.json({ ujian });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update Ujian
const updateUjian = async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;
  const guru_id = req.user.id;

  try {
    const guru = await prisma.guru.findUnique({ where: { userId: guru_id } });
    if (!guru) return res.status(404).json({ error: 'Guru tidak ditemukan' });

    // Check ownership
    const ujian = await prisma.ujian.findFirst({
      where: { ujian_id: parseInt(id), guru_id: guru.guru_id }
    });
    if (!ujian) return res.status(403).json({ error: 'Ujian tidak ditemukan atau bukan milik Anda' });

    // Update fields yang ada di request body
    const dataToUpdate = {};
    if (updateData.nama_ujian) dataToUpdate.nama_ujian = updateData.nama_ujian;
    if (updateData.mata_pelajaran) dataToUpdate.mata_pelajaran = updateData.mata_pelajaran;
    if (updateData.tingkat) dataToUpdate.tingkat = updateData.tingkat;
    if (updateData.jurusan !== undefined) dataToUpdate.jurusan = updateData.jurusan;
    if (updateData.tanggal_mulai) dataToUpdate.tanggal_mulai = new Date(updateData.tanggal_mulai);
    if (updateData.tanggal_selesai) dataToUpdate.tanggal_selesai = new Date(updateData.tanggal_selesai);
    if (updateData.durasi_menit) dataToUpdate.durasi_menit = updateData.durasi_menit;
    if (updateData.is_acak_soal !== undefined) dataToUpdate.is_acak_soal = updateData.is_acak_soal;

    const updatedUjian = await prisma.ujian.update({
      where: { ujian_id: parseInt(id) },
      data: dataToUpdate
    });

    res.json({ message: 'Ujian berhasil diupdate', ujian: updatedUjian });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Delete Ujian
const deleteUjian = async (req, res) => {
  const { id } = req.params;
  const guru_id = req.user.id;

  try {
    const guru = await prisma.guru.findUnique({ where: { userId: guru_id } });
    if (!guru) return res.status(404).json({ error: 'Guru tidak ditemukan' });

    // Check ownership
    const ujian = await prisma.ujian.findFirst({
      where: { ujian_id: parseInt(id), guru_id: guru.guru_id }
    });
    if (!ujian) return res.status(403).json({ error: 'Ujian tidak ditemukan atau bukan milik Anda' });

    await prisma.ujian.delete({ where: { ujian_id: parseInt(id) } });

    res.json({ message: 'Ujian berhasil dihapus' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Assign Soal ke Ujian
const assignSoalToUjian = async (req, res) => {
  const { ujian_id, soal_id, bobot_nilai, urutan } = req.body;
  const guru_id = req.user.id;

  try {
    const guru = await prisma.guru.findUnique({ where: { userId: guru_id } });
    if (!guru) return res.status(404).json({ error: 'Guru tidak ditemukan' });

    // Check ownership ujian
    const ujian = await prisma.ujian.findFirst({
      where: { ujian_id, guru_id: guru.guru_id }
    });
    if (!ujian) return res.status(403).json({ error: 'Ujian tidak ditemukan atau bukan milik Anda' });

    const soalUjian = await prisma.soalUjian.create({
      data: {
        ujian_id,
        soal_id,
        bobot_nilai,
        urutan
      }
    });

    res.status(201).json({ message: 'Soal berhasil ditambahkan ke ujian', soalUjian });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Remove Soal dari Ujian
const removeSoalFromUjian = async (req, res) => {
  const { id } = req.params; // soal_ujian_id
  const guru_id = req.user.id;

  try {
    const guru = await prisma.guru.findUnique({ where: { userId: guru_id } });
    if (!guru) return res.status(404).json({ error: 'Guru tidak ditemukan' });

    // Check ownership
    const soalUjian = await prisma.soalUjian.findUnique({
      where: { soal_ujian_id: parseInt(id) },
      include: { ujian: true }
    });

    if (!soalUjian || soalUjian.ujian.guru_id !== guru.guru_id) {
      return res.status(403).json({ error: 'Soal tidak ditemukan atau bukan milik Anda' });
    }

    await prisma.soalUjian.delete({ where: { soal_ujian_id: parseInt(id) } });

    res.json({ message: 'Soal berhasil dihapus dari ujian' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Assign Siswa ke Ujian (berdasarkan tingkat & jurusan)
const assignSiswaToUjian = async (req, res) => {
  const { ujian_id, tingkat, jurusan } = req.body;
  const guru_id = req.user.id;

  try {
    const guru = await prisma.guru.findUnique({ where: { userId: guru_id } });
    if (!guru) return res.status(404).json({ error: 'Guru tidak ditemukan' });

    // Check ownership ujian
    const ujian = await prisma.ujian.findFirst({
      where: { ujian_id, guru_id: guru.guru_id }
    });
    if (!ujian) return res.status(403).json({ error: 'Ujian tidak ditemukan atau bukan milik Anda' });

    // Cari siswa berdasarkan tingkat & jurusan
    const filters = { tingkat };
    if (jurusan) filters.jurusan = jurusan;

    const siswaList = await prisma.siswa.findMany({ where: filters });

    if (siswaList.length === 0) {
      return res.status(404).json({ error: 'Tidak ada siswa yang sesuai kriteria' });
    }

    // Create peserta ujian untuk setiap siswa
    const pesertaData = siswaList.map(siswa => ({
      ujian_id,
      siswa_id: siswa.siswa_id
    }));

    await prisma.pesertaUjian.createMany({
      data: pesertaData,
      skipDuplicates: true // Hindari duplikat
    });

    res.status(201).json({ 
      message: `${siswaList.length} siswa berhasil ditambahkan ke ujian`,
      jumlah_siswa: siswaList.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = { 
  createUjian, 
  getUjians, 
  getUjianById, 
  updateUjian, 
  deleteUjian,
  assignSoalToUjian,
  removeSoalFromUjian,
  assignSiswaToUjian
};
