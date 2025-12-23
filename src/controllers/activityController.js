// src/controllers/activityController.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Helper function to generate random unlock code
const generateUnlockCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

// GET /api/admin/activities - Get all active exams with participants
exports.getAllActivities = async (req, res) => {
  try {
    const { jurusan, kelas, status, jenis_ujian } = req.query;

    // Build where clause
    let whereClause = {};
    
    if (jurusan && jurusan !== 'all') {
      whereClause.jurusan = jurusan;
    }
    
    if (kelas && kelas !== 'all') {
      whereClause.tingkat = kelas;
    }

    // Get all exams with their participants
    const ujians = await prisma.ujian.findMany({
      where: whereClause,
      include: {
        pesertaUjians: {
          include: {
            siswa: {
              include: {
                user: true
              }
            }
          },
          where: status && status !== 'all' ? {
            ...(status === 'BLOCKED' && { is_blocked: true }),
            ...(status === 'ON_PROGRESS' && { status_ujian: 'SEDANG_DIKERJAKAN', is_blocked: false }),
            ...(status === 'SUBMITTED' && { status_ujian: 'SELESAI', is_blocked: false }),
          } : undefined
        },
        guru: {
          include: {
            user: true
          }
        }
      },
      orderBy: {
        tanggal_mulai: 'desc'
      }
    });

    // Format response
    const formattedData = ujians.map(ujian => {
      const now = new Date();
      const mulai = new Date(ujian.tanggal_mulai);
      const selesai = new Date(ujian.tanggal_selesai);
      
      let jenisUjian = 'Ujian Tengah Semester';
      if (ujian.nama_ujian.toLowerCase().includes('akhir')) {
        jenisUjian = 'Ujian Akhir Semester';
      }

      return {
        ujian_id: ujian.ujian_id,
        nama_ujian: ujian.nama_ujian,
        mata_pelajaran: ujian.mata_pelajaran,
        jurusan: ujian.jurusan,
        tingkat: ujian.tingkat,
        jenis_ujian: jenisUjian,
        peserta_count: ujian.pesertaUjians.length,
        status: now < mulai ? 'Aktif' : now > selesai ? 'Aktif' : 'Aktif',
        tanggal_mulai: ujian.tanggal_mulai,
        tanggal_selesai: ujian.tanggal_selesai,
        durasi_menit: ujian.durasi_menit
      };
    });

    res.json({
      success: true,
      data: formattedData
    });
  } catch (error) {
    console.error('Error getting activities:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal mengambil data aktivitas',
      error: error.message
    });
  }
};

// GET /api/admin/activities/:ujianId/participants - Get exam participants detail
exports.getExamParticipants = async (req, res) => {
  try {
    const { ujianId } = req.params;
    const { jurusan, kelas, status } = req.query;

    // Build where clause for participants
    let participantWhere = {
      ujian_id: parseInt(ujianId)
    };

    if (status && status !== 'all') {
      if (status === 'BLOCKED') {
        participantWhere.is_blocked = true;
      } else if (status === 'ON_PROGRESS') {
        participantWhere.status_ujian = 'SEDANG_DIKERJAKAN';
        participantWhere.is_blocked = false;
      } else if (status === 'SUBMITTED') {
        participantWhere.status_ujian = 'SELESAI';
        participantWhere.is_blocked = false;
      }
    }

    // Get ujian data
    const ujian = await prisma.ujian.findUnique({
      where: { ujian_id: parseInt(ujianId) },
      include: {
        guru: {
          include: { user: true }
        }
      }
    });

    if (!ujian) {
      return res.status(404).json({
        success: false,
        message: 'Ujian tidak ditemukan'
      });
    }

    // Get participants
    const pesertaUjians = await prisma.pesertaUjian.findMany({
      where: participantWhere,
      include: {
        siswa: {
          include: {
            user: true
          }
        },
        ujian: true
      },
      orderBy: {
        siswa: {
          nama_lengkap: 'asc'
        }
      }
    });

    // Filter by jurusan and kelas if needed
    let filteredPeserta = pesertaUjians;
    if (jurusan && jurusan !== 'all') {
      filteredPeserta = filteredPeserta.filter(p => p.siswa.jurusan === jurusan);
    }
    if (kelas && kelas !== 'all') {
      filteredPeserta = filteredPeserta.filter(p => p.siswa.tingkat === kelas);
    }

    // Format response
    const formattedPeserta = filteredPeserta.map(peserta => {
      let statusLabel = 'Belum Mulai';
      if (peserta.is_blocked) {
        statusLabel = 'Blocked';
      } else if (peserta.status_ujian === 'SEDANG_DIKERJAKAN') {
        statusLabel = 'On Progress';
      } else if (peserta.status_ujian === 'SELESAI') {
        statusLabel = 'Submitted';
      }

      return {
        peserta_ujian_id: peserta.peserta_ujian_id,
        nama: peserta.siswa.nama_lengkap,
        tingkat: peserta.siswa.tingkat,
        kelas: `${peserta.siswa.jurusan} ${peserta.siswa.kelas}`,
        mata_pelajaran: ujian.mata_pelajaran,
        status: statusLabel,
        is_blocked: peserta.is_blocked,
        block_reason: peserta.block_reason,
        unlock_code: peserta.unlock_code,
        waktu_mulai: peserta.waktu_mulai,
        waktu_selesai: peserta.waktu_selesai
      };
    });

    res.json({
      success: true,
      data: {
        ujian: {
          ujian_id: ujian.ujian_id,
          nama_ujian: ujian.nama_ujian,
          mata_pelajaran: ujian.mata_pelajaran,
          tingkat: ujian.tingkat,
          jurusan: ujian.jurusan,
          tanggal_mulai: ujian.tanggal_mulai,
          tanggal_selesai: ujian.tanggal_selesai,
          durasi_menit: ujian.durasi_menit
        },
        peserta: formattedPeserta
      }
    });
  } catch (error) {
    console.error('Error getting exam participants:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal mengambil data peserta ujian',
      error: error.message
    });
  }
};

// GET /api/admin/activities/participant/:pesertaUjianId - Get participant detail
exports.getParticipantDetail = async (req, res) => {
  try {
    const { pesertaUjianId } = req.params;

    const pesertaUjian = await prisma.pesertaUjian.findUnique({
      where: { peserta_ujian_id: parseInt(pesertaUjianId) },
      include: {
        siswa: {
          include: {
            user: true
          }
        },
        ujian: true
      }
    });

    if (!pesertaUjian) {
      return res.status(404).json({
        success: false,
        message: 'Peserta ujian tidak ditemukan'
      });
    }

    let statusLabel = 'Belum Mulai';
    if (pesertaUjian.is_blocked) {
      statusLabel = 'Blocked';
    } else if (pesertaUjian.status_ujian === 'SEDANG_DIKERJAKAN') {
      statusLabel = 'On Progress';
    } else if (pesertaUjian.status_ujian === 'SELESAI') {
      statusLabel = 'Submitted';
    }

    res.json({
      success: true,
      data: {
        peserta_ujian_id: pesertaUjian.peserta_ujian_id,
        nama: pesertaUjian.siswa.nama_lengkap,
        tingkat: pesertaUjian.siswa.tingkat,
        kelas: `${pesertaUjian.siswa.jurusan} ${pesertaUjian.siswa.kelas}`,
        jurusan: pesertaUjian.siswa.jurusan,
        mata_pelajaran: pesertaUjian.ujian.mata_pelajaran,
        nama_ujian: pesertaUjian.ujian.nama_ujian,
        status: statusLabel,
        is_blocked: pesertaUjian.is_blocked,
        block_reason: pesertaUjian.block_reason,
        unlock_code: pesertaUjian.unlock_code,
        waktu_mulai: pesertaUjian.waktu_mulai,
        waktu_selesai: pesertaUjian.waktu_selesai
      }
    });
  } catch (error) {
    console.error('Error getting participant detail:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal mengambil detail peserta',
      error: error.message
    });
  }
};

// POST /api/admin/activities/:pesertaUjianId/block - Block a participant
exports.blockParticipant = async (req, res) => {
  try {
    const { pesertaUjianId } = req.params;
    const { block_reason } = req.body;

    if (!block_reason || block_reason.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Keterangan pelanggaran harus diisi'
      });
    }

    const updatedPeserta = await prisma.pesertaUjian.update({
      where: { peserta_ujian_id: parseInt(pesertaUjianId) },
      data: {
        is_blocked: true,
        block_reason: block_reason
      },
      include: {
        siswa: {
          include: {
            user: true
          }
        },
        ujian: true
      }
    });

    res.json({
      success: true,
      message: 'Peserta berhasil diblokir',
      data: {
        peserta_ujian_id: updatedPeserta.peserta_ujian_id,
        nama: updatedPeserta.siswa.nama_lengkap,
        is_blocked: updatedPeserta.is_blocked,
        block_reason: updatedPeserta.block_reason
      }
    });
  } catch (error) {
    console.error('Error blocking participant:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal memblokir peserta',
      error: error.message
    });
  }
};

// POST /api/admin/activities/:pesertaUjianId/generate-unlock - Generate unlock code
exports.generateUnlockCode = async (req, res) => {
  try {
    const { pesertaUjianId } = req.params;

    // Check if participant is blocked
    const pesertaUjian = await prisma.pesertaUjian.findUnique({
      where: { peserta_ujian_id: parseInt(pesertaUjianId) }
    });

    if (!pesertaUjian) {
      return res.status(404).json({
        success: false,
        message: 'Peserta ujian tidak ditemukan'
      });
    }

    if (!pesertaUjian.is_blocked) {
      return res.status(400).json({
        success: false,
        message: 'Peserta tidak dalam status terblokir'
      });
    }

    // Generate unique unlock code
    let unlockCode;
    let isUnique = false;
    
    while (!isUnique) {
      unlockCode = generateUnlockCode();
      const existing = await prisma.pesertaUjian.findUnique({
        where: { unlock_code: unlockCode }
      });
      if (!existing) {
        isUnique = true;
      }
    }

    // Update peserta with unlock code
    const updatedPeserta = await prisma.pesertaUjian.update({
      where: { peserta_ujian_id: parseInt(pesertaUjianId) },
      data: {
        unlock_code: unlockCode
      },
      include: {
        siswa: {
          include: {
            user: true
          }
        }
      }
    });

    res.json({
      success: true,
      message: 'Kode unlock berhasil di-generate',
      data: {
        peserta_ujian_id: updatedPeserta.peserta_ujian_id,
        nama: updatedPeserta.siswa.nama_lengkap,
        unlock_code: updatedPeserta.unlock_code
      }
    });
  } catch (error) {
    console.error('Error generating unlock code:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal generate kode unlock',
      error: error.message
    });
  }
};

// POST /api/admin/activities/:pesertaUjianId/unblock - Unblock a participant
exports.unblockParticipant = async (req, res) => {
  try {
    const { pesertaUjianId } = req.params;
    const { unlock_code } = req.body;

    if (!unlock_code || unlock_code.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Kode unlock harus diisi'
      });
    }

    const pesertaUjian = await prisma.pesertaUjian.findUnique({
      where: { peserta_ujian_id: parseInt(pesertaUjianId) }
    });

    if (!pesertaUjian) {
      return res.status(404).json({
        success: false,
        message: 'Peserta ujian tidak ditemukan'
      });
    }

    if (!pesertaUjian.is_blocked) {
      return res.status(400).json({
        success: false,
        message: 'Peserta tidak dalam status terblokir'
      });
    }

    if (pesertaUjian.unlock_code !== unlock_code.toUpperCase()) {
      return res.status(400).json({
        success: false,
        message: 'Kode unlock tidak valid'
      });
    }

    // Unblock participant
    const updatedPeserta = await prisma.pesertaUjian.update({
      where: { peserta_ujian_id: parseInt(pesertaUjianId) },
      data: {
        is_blocked: false,
        block_reason: null,
        unlock_code: null
      },
      include: {
        siswa: {
          include: {
            user: true
          }
        }
      }
    });

    res.json({
      success: true,
      message: 'Peserta berhasil di-unblock',
      data: {
        peserta_ujian_id: updatedPeserta.peserta_ujian_id,
        nama: updatedPeserta.siswa.nama_lengkap,
        is_blocked: updatedPeserta.is_blocked
      }
    });
  } catch (error) {
    console.error('Error unblocking participant:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal unblock peserta',
      error: error.message
    });
  }
};
