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
    is_acak_soal,
    auto_assign_siswa = true // Default: otomatis assign siswa
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

    let siswaAssigned = 0;
    let autoAssignError = null;

    // Auto-assign siswa jika diaktifkan
    if (auto_assign_siswa) {
      try {
        const filters = { tingkat };
        if (jurusan) filters.jurusan = jurusan;

        console.log(`[AUTO-ASSIGN] Searching siswa with filters:`, filters);
        const siswaList = await prisma.siswa.findMany({ where: filters });
        console.log(`[AUTO-ASSIGN] Found ${siswaList.length} matching siswa`);

        if (siswaList.length > 0) {
          const pesertaData = siswaList.map(siswa => ({
            ujian_id: ujian.ujian_id,
            siswa_id: siswa.siswa_id,
            status_ujian: 'BELUM_MULAI',
            is_blocked: false
          }));

          const result = await prisma.pesertaUjian.createMany({
            data: pesertaData,
            skipDuplicates: true
          });

          siswaAssigned = result.count;
          console.log(`[AUTO-ASSIGN] Successfully assigned ${siswaAssigned} siswa to ujian ${ujian.ujian_id}`);
        } else {
          console.log(`[AUTO-ASSIGN] No siswa found matching criteria`);
        }
      } catch (assignError) {
        console.error('[AUTO-ASSIGN] Error during auto-assign:', assignError);
        autoAssignError = assignError.message;
        // Don't throw - ujian is already created
      }
    }

    const response = { 
      message: 'Ujian berhasil dibuat', 
      ujian_id: ujian.ujian_id,
      auto_assign_enabled: auto_assign_siswa,
      jumlah_siswa_assigned: siswaAssigned
    };

    // Include warning if auto-assign was attempted but failed
    if (auto_assign_siswa && siswaAssigned === 0 && !autoAssignError) {
      response.warning = 'Tidak ada siswa yang cocok dengan kriteria tingkat dan jurusan';
    }
    if (autoAssignError) {
      response.auto_assign_error = autoAssignError;
      response.warning = 'Auto-assign gagal. Silahkan assign siswa secara manual.';
    }

    res.status(201).json(response);
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

// Assign Bank Soal ke Ujian (Batch Assign)
const assignBankToUjian = async (req, res) => {
  const { ujian_id, mata_pelajaran, tingkat, jurusan, bobot_nilai_default, is_acak } = req.body;
  const guru_id = req.user.id;

  try {
    const guru = await prisma.guru.findUnique({ where: { userId: guru_id } });
    if (!guru) return res.status(404).json({ error: 'Guru tidak ditemukan' });

    // Check ownership ujian
    const ujian = await prisma.ujian.findFirst({
      where: { ujian_id, guru_id: guru.guru_id }
    });
    if (!ujian) return res.status(403).json({ error: 'Ujian tidak ditemukan atau bukan milik Anda' });

    // Get all soal from the bank
    const filters = {
      mata_pelajaran,
      tingkat
    };
    if (jurusan) filters.jurusan = jurusan;

    const soalList = await prisma.soal.findMany({
      where: filters,
      orderBy: { createdAt: 'asc' }
    });

    if (soalList.length === 0) {
      return res.status(404).json({ error: 'Tidak ada soal yang sesuai kriteria bank' });
    }

    // Get max urutan already in ujian
    const maxUrutanResult = await prisma.soalUjian.aggregate({
      where: { ujian_id },
      _max: { urutan: true }
    });
    let currentUrutan = (maxUrutanResult._max.urutan || 0) + 1;

    // Shuffle if is_acak is true
    let soalsToAssign = [...soalList];
    if (is_acak) {
      soalsToAssign = soalsToAssign.sort(() => Math.random() - 0.5);
    }

    // Create soalUjian entries
    const soalUjianData = soalsToAssign.map(soal => ({
      ujian_id,
      soal_id: soal.soal_id,
      bobot_nilai: bobot_nilai_default || 10,
      urutan: currentUrutan++
    }));

    await prisma.soalUjian.createMany({
      data: soalUjianData,
      skipDuplicates: true
    });

    res.status(201).json({ 
      message: `${soalList.length} soal dari bank berhasil ditambahkan ke ujian`,
      jumlah_soal: soalList.length,
      is_acak: is_acak || false
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Remove Multiple Soal dari Ujian (Batch)
const removeMultipleSoal = async (req, res) => {
  const { ujian_id, soal_ujian_ids } = req.body;
  const guru_id = req.user.id;

  try {
    const guru = await prisma.guru.findUnique({ where: { userId: guru_id } });
    if (!guru) return res.status(404).json({ error: 'Guru tidak ditemukan' });

    // Check ownership ujian
    const ujian = await prisma.ujian.findFirst({
      where: { ujian_id, guru_id: guru.guru_id }
    });
    if (!ujian) return res.status(403).json({ error: 'Ujian tidak ditemukan atau bukan milik Anda' });

    // Validate all soal_ujian_ids belong to this ujian
    const soalUjians = await prisma.soalUjian.findMany({
      where: {
        soal_ujian_id: { in: soal_ujian_ids },
        ujian_id
      }
    });

    if (soalUjians.length !== soal_ujian_ids.length) {
      return res.status(400).json({ error: 'Ada soal_ujian_id yang tidak valid atau tidak ada di ujian ini' });
    }

    // Delete multiple soal_ujian
    await prisma.soalUjian.deleteMany({
      where: {
        soal_ujian_id: { in: soal_ujian_ids }
      }
    });

    res.json({ 
      message: `${soal_ujian_ids.length} soal berhasil dihapus dari ujian`,
      jumlah_dihapus: soal_ujian_ids.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Remove Bank dari Ujian
const removeBankFromUjian = async (req, res) => {
  const { ujian_id, mata_pelajaran, tingkat, jurusan } = req.body;
  const guru_id = req.user.id;

  try {
    const guru = await prisma.guru.findUnique({ where: { userId: guru_id } });
    if (!guru) return res.status(404).json({ error: 'Guru tidak ditemukan' });

    // Check ownership ujian
    const ujian = await prisma.ujian.findFirst({
      where: { ujian_id, guru_id: guru.guru_id }
    });
    if (!ujian) return res.status(403).json({ error: 'Ujian tidak ditemukan atau bukan milik Anda' });

    // Validate required fields
    if (!jurusan) {
      return res.status(400).json({ error: 'Jurusan wajib diisi' });
    }

    // Find all soal_ujian matching the bank criteria
    const soalUjians = await prisma.soalUjian.findMany({
      where: {
        ujian_id,
        soal: {
          mata_pelajaran,
          tingkat,
          jurusan
        }
      }
    });

    if (soalUjians.length === 0) {
      return res.status(404).json({ error: 'Tidak ada soal dari bank ini di ujian' });
    }

    // Delete all matching soal_ujian
    await prisma.soalUjian.deleteMany({
      where: {
        soal_ujian_id: { in: soalUjians.map(su => su.soal_ujian_id) }
      }
    });

    res.json({ 
      message: `${soalUjians.length} soal dari bank ${mata_pelajaran}-${tingkat}-${jurusan} berhasil dihapus dari ujian`,
      jumlah_dihapus: soalUjians.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Clear All Soal dari Ujian
const clearAllSoal = async (req, res) => {
  const { ujianId } = req.params;
  const guru_id = req.user.id;

  try {
    const guru = await prisma.guru.findUnique({ where: { userId: guru_id } });
    if (!guru) return res.status(404).json({ error: 'Guru tidak ditemukan' });

    // Check ownership ujian
    const ujian = await prisma.ujian.findFirst({
      where: { ujian_id: parseInt(ujianId), guru_id: guru.guru_id }
    });
    if (!ujian) return res.status(403).json({ error: 'Ujian tidak ditemukan atau bukan milik Anda' });

    // Count soal before delete
    const count = await prisma.soalUjian.count({
      where: { ujian_id: parseInt(ujianId) }
    });

    // Delete all soal_ujian for this ujian
    await prisma.soalUjian.deleteMany({
      where: { ujian_id: parseInt(ujianId) }
    });

    res.json({ 
      message: `Semua soal berhasil dihapus dari ujian`,
      jumlah_dihapus: count
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get Soal Ujian Grouped by Bank
const getSoalByBank = async (req, res) => {
  const { ujianId } = req.params;
  const guru_id = req.user.id;

  try {
    const guru = await prisma.guru.findUnique({ where: { userId: guru_id } });
    if (!guru) return res.status(404).json({ error: 'Guru tidak ditemukan' });

    // Check ownership ujian
    const ujian = await prisma.ujian.findFirst({
      where: { ujian_id: parseInt(ujianId), guru_id: guru.guru_id }
    });
    if (!ujian) return res.status(403).json({ error: 'Ujian tidak ditemukan atau bukan milik Anda' });

    // Get all soal_ujian with soal details
    const soalUjians = await prisma.soalUjian.findMany({
      where: { ujian_id: parseInt(ujianId) },
      include: {
        soal: {
          include: {
            opsiJawabans: true
          }
        }
      },
      orderBy: { urutan: 'asc' }
    });

    // Group by bank (mata_pelajaran-tingkat-jurusan)
    const grouped = {};
    soalUjians.forEach(su => {
      const bankKey = `${su.soal.mata_pelajaran}-${su.soal.tingkat}-${su.soal.jurusan || 'umum'}`;
      if (!grouped[bankKey]) {
        grouped[bankKey] = {
          bank: bankKey,
          mata_pelajaran: su.soal.mata_pelajaran,
          tingkat: su.soal.tingkat,
          jurusan: su.soal.jurusan || 'umum',
          jumlah_soal: 0,
          total_bobot: 0,
          soals: []
        };
      }
      grouped[bankKey].jumlah_soal++;
      grouped[bankKey].total_bobot += su.bobot_nilai;
      grouped[bankKey].soals.push({
        soal_ujian_id: su.soal_ujian_id,
        soal_id: su.soal_id,
        urutan: su.urutan,
        bobot_nilai: su.bobot_nilai,
        tipe_soal: su.soal.tipe_soal,
        teks_soal: su.soal.teks_soal,
        opsi_jawaban: su.soal.opsiJawabans
      });
    });

    const result = Object.values(grouped);

    res.json({ 
      ujian_id: parseInt(ujianId),
      total_bank: result.length,
      total_soal: soalUjians.length,
      banks: result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update Bobot Multiple Soal
const updateBobotMultiple = async (req, res) => {
  const { ujian_id, updates } = req.body;

  try {
    // Validate updates is array and not empty
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ error: 'Updates harus berupa array dan tidak boleh kosong' });
    }

    // Validate ujian exists
    const ujian = await prisma.ujian.findUnique({
      where: { ujian_id }
    });
    if (!ujian) return res.status(404).json({ error: 'Ujian tidak ditemukan' });

    // Validate all soal_ujian_ids belong to this ujian
    const soalUjianIds = updates.map(u => u.soal_ujian_id);
    const soalUjians = await prisma.soalUjian.findMany({
      where: {
        soal_ujian_id: { in: soalUjianIds },
        ujian_id
      }
    });

    if (soalUjians.length !== updates.length) {
      return res.status(400).json({ error: 'Ada soal_ujian_id yang tidak valid atau tidak ada di ujian ini' });
    }

    // Update each bobot_nilai
    const updatePromises = updates.map(u => 
      prisma.soalUjian.update({
        where: { soal_ujian_id: u.soal_ujian_id },
        data: { bobot_nilai: u.bobot_nilai }
      })
    );

    await Promise.all(updatePromises);

    res.json({ 
      message: `Bobot ${updates.length} soal berhasil diupdate`,
      jumlah_updated: updates.length
    });
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
      siswa_id: siswa.siswa_id,
      status_ujian: 'BELUM_MULAI',
      is_blocked: false
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
  assignBankToUjian,
  removeMultipleSoal,
  removeBankFromUjian,
  clearAllSoal,
  getSoalByBank,
  updateBobotMultiple,
  removeSoalFromUjian,
  assignSiswaToUjian
};
