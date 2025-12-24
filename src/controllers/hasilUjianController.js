const prisma = require('../config/db');

// Get Hasil Ujian by Peserta Ujian ID
const getHasilByPeserta = async (req, res) => {
  const { peserta_ujian_id } = req.params;

  try {
    const hasil = await prisma.hasilUjian.findUnique({
      where: { peserta_ujian_id: parseInt(peserta_ujian_id) },
      include: {
        pesertaUjian: {
          include: {
            siswa: {
              select: {
                siswa_id: true,
                nama_lengkap: true,
                kelas: true,
                tingkat: true,
                jurusan: true
              }
            },
            ujian: {
              select: {
                ujian_id: true,
                nama_ujian: true,
                mata_pelajaran: true,
                tanggal_mulai: true,
                tanggal_selesai: true
              }
            },
            jawabans: {
              include: {
                soal: {
                  select: {
                    soal_id: true,
                    teks_soal: true,
                    tipe_soal: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!hasil) {
      return res.status(404).json({ error: 'Hasil ujian tidak ditemukan' });
    }

    res.json({ hasil });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get All Hasil Ujian by Ujian ID (for Guru)
const getHasilByUjian = async (req, res) => {
  const { ujian_id } = req.params;
  const guru_id = req.user.id;

  try {
    // Verify ownership
    const guru = await prisma.guru.findUnique({ where: { userId: guru_id } });
    if (!guru) return res.status(404).json({ error: 'Guru tidak ditemukan' });

    const ujian = await prisma.ujian.findFirst({
      where: { ujian_id: parseInt(ujian_id), guru_id: guru.guru_id }
    });
    if (!ujian) return res.status(403).json({ error: 'Ujian tidak ditemukan atau bukan milik Anda' });

    // Get all results for this ujian
    const hasilList = await prisma.hasilUjian.findMany({
      where: {
        pesertaUjian: {
          ujian_id: parseInt(ujian_id)
        }
      },
      include: {
        pesertaUjian: {
          include: {
            siswa: {
              select: {
                siswa_id: true,
                nama_lengkap: true,
                kelas: true,
                tingkat: true,
                jurusan: true
              }
            }
          }
        }
      },
      orderBy: {
        nilai_akhir: 'desc'
      }
    });

    res.json({ 
      ujian: {
        ujian_id: ujian.ujian_id,
        nama_ujian: ujian.nama_ujian,
        mata_pelajaran: ujian.mata_pelajaran
      },
      total_peserta: hasilList.length,
      hasil: hasilList 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get Hasil Ujian for Student (their own results)
const getMyHasil = async (req, res) => {
  const siswa_user_id = req.user.id;

  try {
    const siswa = await prisma.siswa.findUnique({ where: { userId: siswa_user_id } });
    if (!siswa) return res.status(404).json({ error: 'Siswa tidak ditemukan' });

    const hasilList = await prisma.hasilUjian.findMany({
      where: {
        pesertaUjian: {
          siswa_id: siswa.siswa_id
        }
      },
      include: {
        pesertaUjian: {
          include: {
            ujian: {
              select: {
                ujian_id: true,
                nama_ujian: true,
                mata_pelajaran: true,
                tingkat: true,
                jurusan: true,
                tanggal_mulai: true,
                tanggal_selesai: true
              }
            }
          }
        }
      },
      orderBy: {
        tanggal_submit: 'desc'
      }
    });

    res.json({ hasil: hasilList });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Create or Update Hasil Ujian (Auto-grading for multiple choice)
const calculateAndSaveHasil = async (req, res) => {
  const { peserta_ujian_id } = req.body;

  try {
    // Get peserta ujian with all answers and soal details
    const pesertaUjian = await prisma.pesertaUjian.findUnique({
      where: { peserta_ujian_id: parseInt(peserta_ujian_id) },
      include: {
        ujian: {
          include: {
            soalUjians: true
          }
        },
        jawabans: {
          include: {
            soal: {
              include: {
                opsiJawabans: true
              }
            }
          }
        }
      }
    });

    if (!pesertaUjian) {
      return res.status(404).json({ error: 'Peserta ujian tidak ditemukan' });
    }

    // Calculate total score
    let totalNilai = 0;
    let totalBobot = 0;

    for (const soalUjian of pesertaUjian.ujian.soalUjians) {
      totalBobot += soalUjian.bobot_nilai;
      
      const jawaban = pesertaUjian.jawabans.find(j => j.soal_id === soalUjian.soal_id);
      
      if (jawaban && jawaban.is_correct) {
        totalNilai += soalUjian.bobot_nilai;
      } else if (jawaban && jawaban.nilai_manual !== null) {
        // For essay questions graded manually
        totalNilai += jawaban.nilai_manual;
      }
    }

    // Calculate final score (0-100)
    const nilaiAkhir = totalBobot > 0 ? (totalNilai / totalBobot) * 100 : 0;

    // Create or update hasil ujian
    const hasil = await prisma.hasilUjian.upsert({
      where: { peserta_ujian_id: parseInt(peserta_ujian_id) },
      update: {
        nilai_akhir: nilaiAkhir,
        tanggal_submit: new Date()
      },
      create: {
        peserta_ujian_id: parseInt(peserta_ujian_id),
        nilai_akhir: nilaiAkhir
      }
    });

    // Update peserta ujian status
    await prisma.pesertaUjian.update({
      where: { peserta_ujian_id: parseInt(peserta_ujian_id) },
      data: { status_ujian: 'DINILAI' }
    });

    res.json({ 
      message: 'Hasil ujian berhasil dihitung',
      hasil: {
        hasil_ujian_id: hasil.hasil_ujian_id,
        nilai_akhir: hasil.nilai_akhir,
        total_nilai: totalNilai,
        total_bobot: totalBobot
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update Nilai Manual (for essay questions)
const updateNilaiManual = async (req, res) => {
  const { jawaban_id, nilai_manual } = req.body;
  const guru_id = req.user.id;

  try {
    const guru = await prisma.guru.findUnique({ where: { userId: guru_id } });
    if (!guru) return res.status(404).json({ error: 'Guru tidak ditemukan' });

    // Get jawaban with ujian ownership check
    const jawaban = await prisma.jawaban.findUnique({
      where: { jawaban_id: parseInt(jawaban_id) },
      include: {
        pesertaUjian: {
          include: {
            ujian: true
          }
        }
      }
    });

    if (!jawaban) {
      return res.status(404).json({ error: 'Jawaban tidak ditemukan' });
    }

    if (jawaban.pesertaUjian.ujian.guru_id !== guru.guru_id) {
      return res.status(403).json({ error: 'Anda tidak memiliki akses ke jawaban ini' });
    }

    // Update nilai manual
    const updatedJawaban = await prisma.jawaban.update({
      where: { jawaban_id: parseInt(jawaban_id) },
      data: { nilai_manual: parseFloat(nilai_manual) }
    });

    // Recalculate hasil ujian
    await calculateAndSaveHasil(
      { body: { peserta_ujian_id: jawaban.peserta_ujian_id } }, 
      { json: () => {} }
    );

    res.json({ 
      message: 'Nilai manual berhasil diupdate',
      jawaban: updatedJawaban 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get Detailed Result with All Answers (for review)
const getDetailedResult = async (req, res) => {
  const { peserta_ujian_id } = req.params;

  try {
    const hasil = await prisma.hasilUjian.findUnique({
      where: { peserta_ujian_id: parseInt(peserta_ujian_id) },
      include: {
        pesertaUjian: {
          include: {
            siswa: true,
            ujian: {
              include: {
                soalUjians: {
                  include: {
                    soal: {
                      include: {
                        opsiJawabans: true
                      }
                    }
                  },
                  orderBy: { urutan: 'asc' }
                }
              }
            },
            jawabans: {
              include: {
                soal: {
                  include: {
                    opsiJawabans: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!hasil) {
      return res.status(404).json({ error: 'Hasil ujian tidak ditemukan' });
    }

    // Map jawabans to soal for easier review
    const detailedReview = hasil.pesertaUjian.ujian.soalUjians.map(soalUjian => {
      const jawaban = hasil.pesertaUjian.jawabans.find(j => j.soal_id === soalUjian.soal_id);
      
      return {
        urutan: soalUjian.urutan,
        soal: soalUjian.soal,
        bobot_nilai: soalUjian.bobot_nilai,
        jawaban: jawaban || null,
        is_correct: jawaban?.is_correct,
        nilai_didapat: jawaban?.is_correct ? soalUjian.bobot_nilai : (jawaban?.nilai_manual || 0)
      };
    });

    res.json({
      hasil_ujian: {
        hasil_ujian_id: hasil.hasil_ujian_id,
        nilai_akhir: hasil.nilai_akhir,
        tanggal_submit: hasil.tanggal_submit
      },
      siswa: hasil.pesertaUjian.siswa,
      ujian: {
        ujian_id: hasil.pesertaUjian.ujian.ujian_id,
        nama_ujian: hasil.pesertaUjian.ujian.nama_ujian,
        mata_pelajaran: hasil.pesertaUjian.ujian.mata_pelajaran
      },
      review: detailedReview
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getHasilByPeserta,
  getHasilByUjian,
  getMyHasil,
  calculateAndSaveHasil,
  updateNilaiManual,
  getDetailedResult
};
