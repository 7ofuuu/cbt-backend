const prisma = require('../config/db');

// Get Ujian yang Di-assign ke Siswa
const getMyUjians = async (req, res) => {
  const siswa_user_id = req.user.id;

  try {
    const siswa = await prisma.siswa.findUnique({ 
      where: { userId: siswa_user_id } 
    });
    
    if (!siswa) {
      return res.status(404).json({ error: 'Siswa tidak ditemukan' });
    }

    const pesertaUjians = await prisma.pesertaUjian.findMany({
      where: { siswa_id: siswa.siswa_id },
      include: {
        ujian: {
          select: {
            ujian_id: true,
            nama_ujian: true,
            mata_pelajaran: true,
            tingkat: true,
            jurusan: true,
            tanggal_mulai: true,
            tanggal_selesai: true,
            durasi_menit: true,
            is_acak_soal: true
          }
        },
        hasilUjian: {
          select: {
            nilai_akhir: true,
            tanggal_submit: true
          }
        }
      },
      orderBy: {
        ujian: {
          tanggal_mulai: 'desc'
        }
      }
    });

    res.json({ 
      ujians: pesertaUjians.map(pu => ({
        peserta_ujian_id: pu.peserta_ujian_id,
        status_ujian: pu.status_ujian,
        is_blocked: pu.is_blocked,
        unlock_code: pu.unlock_code,
        waktu_mulai: pu.waktu_mulai,
        waktu_selesai: pu.waktu_selesai,
        ujian: pu.ujian,
        hasil: pu.hasilUjian
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Start Ujian (Siswa mulai mengerjakan)
const startUjian = async (req, res) => {
  const { peserta_ujian_id, unlock_code } = req.body;
  const siswa_user_id = req.user.id;

  try {
    const siswa = await prisma.siswa.findUnique({ 
      where: { userId: siswa_user_id } 
    });
    
    if (!siswa) {
      return res.status(404).json({ error: 'Siswa tidak ditemukan' });
    }

    // Get peserta ujian
    const pesertaUjian = await prisma.pesertaUjian.findFirst({
      where: { 
        peserta_ujian_id: parseInt(peserta_ujian_id),
        siswa_id: siswa.siswa_id
      },
      include: {
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
        }
      }
    });

    if (!pesertaUjian) {
      return res.status(404).json({ error: 'Peserta ujian tidak ditemukan' });
    }

    // Check if blocked
    if (pesertaUjian.is_blocked) {
      // Verify unlock code if provided
      if (!unlock_code || unlock_code !== pesertaUjian.unlock_code) {
        return res.status(403).json({ 
          error: 'Ujian terblokir. Silakan minta kode unlock dari pengawas.',
          is_blocked: true
        });
      }
      
      // Valid unlock code - unblock
      await prisma.pesertaUjian.update({
        where: { peserta_ujian_id: parseInt(peserta_ujian_id) },
        data: { 
          is_blocked: false,
          unlock_code: null
        }
      });
    }

    // Check if already finished
    if (pesertaUjian.status_ujian === 'SELESAI' || pesertaUjian.status_ujian === 'DINILAI') {
      return res.status(400).json({ 
        error: 'Ujian sudah selesai dikerjakan',
        status: pesertaUjian.status_ujian
      });
    }

    // Check ujian time window
    const now = new Date();
    const tanggalMulai = new Date(pesertaUjian.ujian.tanggal_mulai);
    const tanggalSelesai = new Date(pesertaUjian.ujian.tanggal_selesai);

    if (now < tanggalMulai) {
      return res.status(400).json({ 
        error: 'Ujian belum dimulai',
        tanggal_mulai: tanggalMulai
      });
    }

    if (now > tanggalSelesai) {
      return res.status(400).json({ 
        error: 'Waktu ujian sudah berakhir',
        tanggal_selesai: tanggalSelesai
      });
    }

    // Update status to SEDANG_DIKERJAKAN if BELUM_MULAI
    let updatedPeserta = pesertaUjian;
    if (pesertaUjian.status_ujian === 'BELUM_MULAI') {
      updatedPeserta = await prisma.pesertaUjian.update({
        where: { peserta_ujian_id: parseInt(peserta_ujian_id) },
        data: { 
          status_ujian: 'SEDANG_DIKERJAKAN',
          waktu_mulai: now
        },
        include: {
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
          }
        }
      });
    }

    // Get existing jawaban
    const existingJawabans = await prisma.jawaban.findMany({
      where: { peserta_ujian_id: parseInt(peserta_ujian_id) }
    });

    // Prepare soal list (hide correct answers)
    const soalList = updatedPeserta.ujian.soalUjians.map(su => {
      const jawaban = existingJawabans.find(j => j.soal_id === su.soal_id);
      
      return {
        soal_ujian_id: su.soal_ujian_id,
        urutan: su.urutan,
        bobot_nilai: su.bobot_nilai,
        soal: {
          soal_id: su.soal.soal_id,
          tipe_soal: su.soal.tipe_soal,
          teks_soal: su.soal.teks_soal,
          soal_gambar: su.soal.soal_gambar,
          opsi_jawaban: su.soal.tipe_soal === 'PILIHAN_GANDA' 
            ? su.soal.opsiJawabans.map(opsi => ({
                opsi_id: opsi.opsi_id,
                label_opsi: opsi.label_opsi,
                teks_opsi: opsi.teks_opsi
                // Hide is_benar from siswa
              }))
            : []
        },
        jawaban_saya: jawaban ? {
          jawaban_id: jawaban.jawaban_id,
          opsi_jawaban_id: jawaban.opsi_jawaban_id,
          teks_jawaban: jawaban.teks_jawaban
        } : null
      };
    });

    res.json({
      message: 'Ujian berhasil dimulai',
      peserta_ujian: {
        peserta_ujian_id: updatedPeserta.peserta_ujian_id,
        status_ujian: updatedPeserta.status_ujian,
        waktu_mulai: updatedPeserta.waktu_mulai,
        durasi_menit: updatedPeserta.ujian.durasi_menit,
        ujian: {
          ujian_id: updatedPeserta.ujian.ujian_id,
          nama_ujian: updatedPeserta.ujian.nama_ujian,
          mata_pelajaran: updatedPeserta.ujian.mata_pelajaran,
          is_acak_soal: updatedPeserta.ujian.is_acak_soal
        },
        soal_list: soalList,
        total_soal: soalList.length
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Submit Jawaban (per soal)
const submitJawaban = async (req, res) => {
  const { peserta_ujian_id, soal_id, opsi_jawaban_id, teks_jawaban } = req.body;
  const siswa_user_id = req.user.id;

  try {
    const siswa = await prisma.siswa.findUnique({ 
      where: { userId: siswa_user_id } 
    });
    
    if (!siswa) {
      return res.status(404).json({ error: 'Siswa tidak ditemukan' });
    }

    // Verify ownership
    const pesertaUjian = await prisma.pesertaUjian.findFirst({
      where: { 
        peserta_ujian_id: parseInt(peserta_ujian_id),
        siswa_id: siswa.siswa_id
      }
    });

    if (!pesertaUjian) {
      return res.status(403).json({ error: 'Anda tidak memiliki akses ke ujian ini' });
    }

    if (pesertaUjian.status_ujian !== 'SEDANG_DIKERJAKAN') {
      return res.status(400).json({ 
        error: 'Ujian tidak dalam status sedang dikerjakan',
        status: pesertaUjian.status_ujian
      });
    }

    // Get soal to determine correctness (for PILIHAN_GANDA)
    const soal = await prisma.soal.findUnique({
      where: { soal_id: parseInt(soal_id) },
      include: { opsiJawabans: true }
    });

    if (!soal) {
      return res.status(404).json({ error: 'Soal tidak ditemukan' });
    }

    // Check if jawaban already exists
    const existingJawaban = await prisma.jawaban.findFirst({
      where: {
        peserta_ujian_id: parseInt(peserta_ujian_id),
        soal_id: parseInt(soal_id)
      }
    });

    let isCorrect = null;
    if (soal.tipe_soal === 'PILIHAN_GANDA' && opsi_jawaban_id) {
      const opsiBenar = soal.opsiJawabans.find(o => o.is_benar);
      isCorrect = opsiBenar?.opsi_id === parseInt(opsi_jawaban_id);
    }

    let jawaban;
    if (existingJawaban) {
      // Update existing
      jawaban = await prisma.jawaban.update({
        where: { jawaban_id: existingJawaban.jawaban_id },
        data: {
          opsi_jawaban_id: opsi_jawaban_id ? parseInt(opsi_jawaban_id) : null,
          teks_jawaban: teks_jawaban || null,
          is_correct: isCorrect
        }
      });
    } else {
      // Create new
      jawaban = await prisma.jawaban.create({
        data: {
          peserta_ujian_id: parseInt(peserta_ujian_id),
          soal_id: parseInt(soal_id),
          opsi_jawaban_id: opsi_jawaban_id ? parseInt(opsi_jawaban_id) : null,
          teks_jawaban: teks_jawaban || null,
          is_correct: isCorrect
        }
      });
    }

    res.json({ 
      message: 'Jawaban berhasil disimpan',
      jawaban: {
        jawaban_id: jawaban.jawaban_id,
        soal_id: jawaban.soal_id,
        opsi_jawaban_id: jawaban.opsi_jawaban_id,
        teks_jawaban: jawaban.teks_jawaban
        // Don't return is_correct to prevent cheating
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Finish Ujian (Submit final) - Without additional answers
const finishUjian = async (req, res) => {
  const { peserta_ujian_id } = req.body;
  const siswa_user_id = req.user.id;

  try {
    const siswa = await prisma.siswa.findUnique({ 
      where: { userId: siswa_user_id } 
    });
    
    if (!siswa) {
      return res.status(404).json({ error: 'Siswa tidak ditemukan' });
    }

    // Verify ownership
    const pesertaUjian = await prisma.pesertaUjian.findFirst({
      where: { 
        peserta_ujian_id: parseInt(peserta_ujian_id),
        siswa_id: siswa.siswa_id
      },
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
      return res.status(403).json({ error: 'Anda tidak memiliki akses ke ujian ini' });
    }

    if (pesertaUjian.status_ujian !== 'SEDANG_DIKERJAKAN') {
      return res.status(400).json({ 
        error: 'Ujian tidak dalam status sedang dikerjakan',
        status: pesertaUjian.status_ujian
      });
    }

    // Update status to SELESAI
    await prisma.pesertaUjian.update({
      where: { peserta_ujian_id: parseInt(peserta_ujian_id) },
      data: { 
        status_ujian: 'SELESAI',
        waktu_selesai: new Date()
      }
    });

    // Auto-calculate score
    let totalNilai = 0;
    let totalBobot = 0;

    for (const soalUjian of pesertaUjian.ujian.soalUjians) {
      totalBobot += soalUjian.bobot_nilai;
      
      const jawaban = pesertaUjian.jawabans.find(j => j.soal_id === soalUjian.soal_id);
      
      if (jawaban && jawaban.is_correct) {
        totalNilai += soalUjian.bobot_nilai;
      }
      // Essay questions (nilai_manual) will be graded later by guru
    }

    // Calculate final score (0-100)
    const nilaiAkhir = totalBobot > 0 ? (totalNilai / totalBobot) * 100 : 0;

    // Create hasil ujian
    const hasil = await prisma.hasilUjian.create({
      data: {
        peserta_ujian_id: parseInt(peserta_ujian_id),
        nilai_akhir: nilaiAkhir,
        tanggal_submit: new Date()
      }
    });

    // Update status to DINILAI if no essay questions
    const hasEssay = pesertaUjian.ujian.soalUjians.some(su => {
      const soal = pesertaUjian.jawabans.find(j => j.soal_id === su.soal_id)?.soal;
      return soal?.tipe_soal === 'ESSAY';
    });

    if (!hasEssay) {
      await prisma.pesertaUjian.update({
        where: { peserta_ujian_id: parseInt(peserta_ujian_id) },
        data: { status_ujian: 'DINILAI' }
      });
    }

    res.json({
      message: 'Ujian berhasil diselesaikan',
      hasil: {
        hasil_ujian_id: hasil.hasil_ujian_id,
        nilai_akhir: nilaiAkhir,
        status: hasEssay ? 'Menunggu penilaian essay oleh guru' : 'Selesai dinilai',
        total_soal: pesertaUjian.ujian.soalUjians.length,
        soal_terjawab: pesertaUjian.jawabans.length
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getMyUjians,
  startUjian,
  submitJawaban,
  finishUjian
};
