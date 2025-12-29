const prisma = require('../config/db');
const activityLogService = require('../services/activityLogService');

// Get Ujian yang Di-assign ke Siswa
const getMyUjians = async (req, res) => {
  const siswa_user_id = req.user.id;

  try {
    const siswa = await prisma.siswa.findUnique({
      where: { userId: siswa_user_id },
    });

    if (!siswa) {
      return res.status(404).json({ error: 'Siswa tidak ditemukan' });
    }

    const pesertaUjians = await prisma.peserta_ujians.findMany({
      where: {
        siswa_id: siswa.siswa_id,
        ujians: {
          status_ujian: {
            in: ['TERJADWAL', 'BERLANGSUNG'],
          },
        },
      },
      include: {
        ujians: {
          select: {
            ujian_id: true,
            nama_ujian: true,
            mata_pelajaran: true,
            tingkat: true,
            jurusan: true,
            tanggal_mulai: true,
            tanggal_selesai: true,
            durasi_menit: true,
            status_ujian: true,
            is_acak_soal: true,
          },
        },
        hasil_ujians: {
          select: {
            nilai_akhir: true,
            tanggal_submit: true,
          },
        },
      },
      orderBy: {
        ujians: {
          tanggal_mulai: 'desc',
        },
      },
    });

    res.json({
      ujians: pesertaUjians.map(pu => ({
        peserta_ujian_id: pu.peserta_ujian_id,
        status_ujian: pu.status_ujian,
        is_blocked: pu.is_blocked,
        unlock_code: pu.unlock_code,
        waktu_mulai: pu.waktu_mulai,
        waktu_selesai: pu.waktu_selesai,
        ujian: pu.ujians,
        hasil: pu.hasil_ujians,
      })),
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
      where: { userId: siswa_user_id },
    });

    if (!siswa) {
      return res.status(404).json({ error: 'Siswa tidak ditemukan' });
    }

    // Get peserta ujian
    const pesertaUjian = await prisma.peserta_ujians.findFirst({
      where: {
        peserta_ujian_id: parseInt(peserta_ujian_id),
        siswa_id: siswa.siswa_id,
      },
      include: {
        ujians: {
          include: {
            soal_ujians: {
              include: {
                soals: {
                  include: {
                    opsi_jawabans: true,
                  },
                },
              },
              orderBy: { urutan: 'asc' },
            },
          },
        },
      },
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
          is_blocked: true,
        });
      }

      // Valid unlock code - unblock
      await prisma.peserta_ujians.update({
        where: { peserta_ujian_id: parseInt(peserta_ujian_id) },
        data: {
          is_blocked: false,
          unlock_code: null,
        },
      });
    }

    // Check if already finished
    if (pesertaUjian.status_ujian === 'SELESAI' || pesertaUjian.status_ujian === 'DINILAI') {
      return res.status(400).json({
        error: 'Ujian sudah selesai dikerjakan',
        status: pesertaUjian.status_ujian,
      });
    }

    // Check ujian time window
    const now = new Date();
    const tanggalMulai = new Date(pesertaUjian.ujians.tanggal_mulai);
    const tanggalSelesai = new Date(pesertaUjian.ujians.tanggal_selesai);

    if (now < tanggalMulai) {
      return res.status(400).json({
        error: 'Ujian belum dimulai',
        tanggal_mulai: tanggalMulai,
      });
    }

    if (now > tanggalSelesai) {
      return res.status(400).json({
        error: 'Waktu ujian sudah berakhir',
        tanggal_selesai: tanggalSelesai,
      });
    }

    // Update status to SEDANG_DIKERJAKAN if BELUM_MULAI
    let updatedPeserta = pesertaUjian;
    if (pesertaUjian.status_ujian === 'BELUM_MULAI') {
      updatedPeserta = await prisma.peserta_ujians.update({
        where: { peserta_ujian_id: parseInt(peserta_ujian_id) },
        data: {
          status_ujian: 'SEDANG_DIKERJAKAN',
          waktu_mulai: now,
        },
        include: {
          ujians: {
            include: {
              soal_ujians: {
                include: {
                  soals: {
                    include: {
                      opsi_jawabans: true,
                    },
                  },
                },
                orderBy: { urutan: 'asc' },
              },
            },
          },
        },
      });
    }

    // Get existing jawaban
    const existingJawabans = await prisma.jawabans.findMany({
      where: { peserta_ujian_id: parseInt(peserta_ujian_id) },
    });

    // Debug logging
    console.log('=== START UJIAN DEBUG ===');
    console.log('Ujian ID:', updatedPeserta.ujians.ujian_id);
    console.log('Total soal_ujians:', updatedPeserta.ujians.soal_ujians?.length || 0);
    if (updatedPeserta.ujians.soal_ujians && updatedPeserta.ujians.soal_ujians.length > 0) {
      console.log('First soal:', updatedPeserta.ujians.soal_ujians[0]);
    }
    console.log('========================');

    // Prepare soal list (hide correct answers)
    const soalList = updatedPeserta.ujians.soal_ujians.map(su => {
      const jawaban = existingJawabans.find(j => j.soal_id === su.soal_id);

      // Check if soal has multiple choice options
      const isPilihanGanda = su.soals.tipe_soal === 'PILIHAN_GANDA' || su.soals.tipe_soal === 'PILIHAN_GANDA_SINGLE' || su.soals.tipe_soal === 'PILIHAN_GANDA_MULTIPLE';

      return {
        soal_ujian_id: su.soal_ujian_id,
        urutan: su.urutan,
        bobot_nilai: su.bobot_nilai,
        soal: {
          soal_id: su.soals.soal_id,
          tipe_soal: su.soals.tipe_soal,
          teks_soal: su.soals.teks_soal,
          soal_gambar: su.soals.soal_gambar,
          opsi_jawaban:
            isPilihanGanda && su.soals.opsi_jawabans
              ? su.soals.opsi_jawabans.map(opsi => ({
                  opsi_id: opsi.opsi_id,
                  label_opsi: opsi.label_opsi,
                  teks_opsi: opsi.teks_opsi,
                  // Hide is_benar from siswa
                }))
              : [],
        },
        jawaban_saya: jawaban
          ? {
              jawaban_id: jawaban.jawaban_id,
              opsi_jawaban_id: jawaban.jawaban_pg_opsi_ids ? parseInt(jawaban.jawaban_pg_opsi_ids.split(',')[0]) : null,
              opsi_jawaban_ids: jawaban.jawaban_pg_opsi_ids ? jawaban.jawaban_pg_opsi_ids.split(',').map(id => parseInt(id)) : null,
              teks_jawaban: jawaban.jawaban_essay_text,
            }
          : null,
      };
    });

    // Log activity
    await activityLogService.createLog({
      user_id: siswa.userId,
      peserta_ujian_id: updatedPeserta.peserta_ujian_id,
      activity_type: 'START_UJIAN',
      description: `Memulai ujian: ${updatedPeserta.ujians.nama_ujian}`,
      ip_address: activityLogService.getIpAddress(req),
      user_agent: activityLogService.getUserAgent(req),
      metadata: {
        ujian_id: updatedPeserta.ujian_id,
        total_soal: soalList.length,
        waktu_mulai: updatedPeserta.waktu_mulai,
      },
    });

    res.json({
      message: 'Ujian berhasil dimulai',
      peserta_ujian: {
        peserta_ujian_id: updatedPeserta.peserta_ujian_id,
        status_ujian: updatedPeserta.status_ujian,
        waktu_mulai: updatedPeserta.waktu_mulai,
        durasi_menit: updatedPeserta.ujians.durasi_menit,
        ujian: {
          ujian_id: updatedPeserta.ujians.ujian_id,
          nama_ujian: updatedPeserta.ujians.nama_ujian,
          mata_pelajaran: updatedPeserta.ujians.mata_pelajaran,
          is_acak_soal: updatedPeserta.ujians.is_acak_soal,
        },
        soal_list: soalList,
        total_soal: soalList.length,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Submit Jawaban (per soal)
const submitJawaban = async (req, res) => {
  const { peserta_ujian_id, soal_id, opsi_jawaban_id, opsi_jawaban_ids, teks_jawaban } = req.body;
  const siswa_user_id = req.user.id;

  try {
    const siswa = await prisma.siswa.findUnique({
      where: { userId: siswa_user_id },
    });

    if (!siswa) {
      return res.status(404).json({ error: 'Siswa tidak ditemukan' });
    }

    // Verify ownership
    const pesertaUjian = await prisma.pesertaUjian.findFirst({
      where: {
        peserta_ujian_id: parseInt(peserta_ujian_id),
        siswa_id: siswa.siswa_id,
      },
    });

    if (!pesertaUjian) {
      return res.status(403).json({ error: 'Anda tidak memiliki akses ke ujian ini' });
    }

    if (pesertaUjian.status_ujian !== 'SEDANG_DIKERJAKAN') {
      return res.status(400).json({
        error: 'Ujian tidak dalam status sedang dikerjakan',
        status: pesertaUjian.status_ujian,
      });
    }

    // Get soal to determine correctness
    const soal = await prisma.soals.findUnique({
      where: { soal_id: parseInt(soal_id) },
      include: { opsi_jawabans: true },
    });

    if (!soal) {
      return res.status(404).json({ error: 'Soal tidak ditemukan' });
    }

    // Check if jawaban already exists
    const existingJawaban = await prisma.jawabans.findFirst({
      where: {
        peserta_ujian_id: parseInt(peserta_ujian_id),
        soal_id: parseInt(soal_id),
      },
    });

    let isCorrect = null;
    let jawabanPgOpsiIds = null;
    let jawabanEssayText = null;

    // Handle different question types
    if (soal.tipe_soal === 'PILIHAN_GANDA_SINGLE' || soal.tipe_soal === 'PILIHAN_GANDA') {
      // Single choice - store as string with single ID
      if (opsi_jawaban_id) {
        jawabanPgOpsiIds = opsi_jawaban_id.toString();
        const opsiBenar = soal.opsi_jawabans.find(o => o.is_benar);
        isCorrect = opsiBenar?.opsi_id === parseInt(opsi_jawaban_id);
      }
    } else if (soal.tipe_soal === 'PILIHAN_GANDA_MULTIPLE') {
      // Multiple choice - store as comma-separated string
      if (opsi_jawaban_ids && Array.isArray(opsi_jawaban_ids) && opsi_jawaban_ids.length > 0) {
        jawabanPgOpsiIds = opsi_jawaban_ids.join(',');
        console.log('📝 Multiple choice saved:', jawabanPgOpsiIds);
      }
    } else if (soal.tipe_soal === 'ESSAY') {
      // Essay - store in jawaban_essay_text
      jawabanEssayText = teks_jawaban || null;
    }

    // Check if all fields are empty (user wants to delete answer)
    const isEmptyAnswer = !jawabanPgOpsiIds && !jawabanEssayText;

    let jawaban;
    if (existingJawaban) {
      if (isEmptyAnswer) {
        // Delete existing answer if user clears/unselects everything
        await prisma.jawabans.delete({
          where: { jawaban_id: existingJawaban.jawaban_id },
        });
        console.log(`🗑️ Jawaban dihapus untuk soal ${soal_id}`);

        return res.json({
          message: 'Jawaban berhasil dihapus',
          deleted: true,
          soal_id: parseInt(soal_id),
        });
      } else {
        // Update existing answer
        jawaban = await prisma.jawabans.update({
          where: { jawaban_id: existingJawaban.jawaban_id },
          data: {
            jawaban_pg_opsi_ids: jawabanPgOpsiIds,
            jawaban_essay_text: jawabanEssayText,
          },
        });
        console.log(`✏️ Jawaban diupdate untuk soal ${soal_id}`);
      }
    } else {
      if (isEmptyAnswer) {
        // Don't create empty answer
        return res.json({
          message: 'Tidak ada jawaban untuk disimpan',
          empty: true,
          soal_id: parseInt(soal_id),
        });
      }

      // Create new answer
      jawaban = await prisma.jawabans.create({
        data: {
          peserta_ujian_id: parseInt(peserta_ujian_id),
          soal_id: parseInt(soal_id),
          jawaban_pg_opsi_ids: jawabanPgOpsiIds,
          jawaban_essay_text: jawabanEssayText,
        },
      });
      console.log(`✅ Jawaban baru dibuat untuk soal ${soal_id}`);
    }

    res.json({
      message: 'Jawaban berhasil disimpan',
      jawaban: {
        jawaban_id: jawaban.jawaban_id,
        soal_id: jawaban.soal_id,
        jawaban_pg_opsi_ids: jawaban.jawaban_pg_opsi_ids,
        jawaban_essay_text: jawaban.jawaban_essay_text,
      },
    });
  } catch (error) {
    console.error('Error submit jawaban:', error);
    res.status(500).json({ error: error.message });
  }
};

// Finish Ujian (Submit final) - Without additional answers
const finishUjian = async (req, res) => {
  const { peserta_ujian_id } = req.body;
  const siswa_user_id = req.user.id;

  try {
    const siswa = await prisma.siswa.findUnique({
      where: { userId: siswa_user_id },
    });

    if (!siswa) {
      return res.status(404).json({ error: 'Siswa tidak ditemukan' });
    }

    // Verify ownership
    const pesertaUjian = await prisma.peserta_ujians.findFirst({
      where: {
        peserta_ujian_id: parseInt(peserta_ujian_id),
        siswa_id: siswa.siswa_id,
      },
      include: {
        ujians: {
          include: {
            soal_ujians: true,
          },
        },
        jawabans: {
          include: {
            soals: {
              include: {
                opsi_jawabans: true,
              },
            },
          },
        },
      },
    });

    if (!pesertaUjian) {
      return res.status(403).json({ error: 'Anda tidak memiliki akses ke ujian ini' });
    }

    if (pesertaUjian.status_ujian !== 'SEDANG_DIKERJAKAN') {
      return res.status(400).json({
        error: 'Ujian tidak dalam status sedang dikerjakan',
        status: pesertaUjian.status_ujian,
      });
    }

    // Update status to SELESAI
    await prisma.peserta_ujians.update({
      where: { peserta_ujian_id: parseInt(peserta_ujian_id) },
      data: {
        status_ujian: 'SELESAI',
        waktu_selesai: new Date(),
      },
    });

    // Auto-calculate score
    let totalNilai = 0;
    let totalBobot = 0;
    let hasEssay = false;

    for (const soalUjian of pesertaUjian.ujians.soal_ujians) {
      totalBobot += soalUjian.bobot_nilai;

      const jawaban = pesertaUjian.jawabans.find(j => j.soal_id === soalUjian.soal_id);

      if (jawaban && jawaban.soals) {
        const soal = jawaban.soals;

        // Check essay questions
        if (soal.tipe_soal === 'ESSAY') {
          hasEssay = true;
          // Essay will be graded manually by guru, skip for now
          continue;
        }

        // Check pilihan ganda (single or multiple)
        if (soal.tipe_soal === 'PILIHAN_GANDA_SINGLE' || soal.tipe_soal === 'PILIHAN_GANDA') {
          // Get the correct answer
          const opsiBenar = soal.opsi_jawabans.find(o => o.is_benar);

          if (opsiBenar && jawaban.jawaban_pg_opsi_ids) {
            const jawabanOpsiId = parseInt(jawaban.jawaban_pg_opsi_ids);
            if (jawabanOpsiId === opsiBenar.opsi_id) {
              totalNilai += soalUjian.bobot_nilai;
              console.log(`✅ Soal ${soal.soal_id}: BENAR (${opsiBenar.opsi_id})`);
            } else {
              console.log(`❌ Soal ${soal.soal_id}: SALAH (jawaban: ${jawabanOpsiId}, benar: ${opsiBenar.opsi_id})`);
            }
          }
        } else if (soal.tipe_soal === 'PILIHAN_GANDA_MULTIPLE') {
          // Get all correct answers
          const opsiBenarIds = soal.opsi_jawabans
            .filter(o => o.is_benar)
            .map(o => o.opsi_id)
            .sort();

          if (jawaban.jawaban_pg_opsi_ids) {
            const jawabanIds = jawaban.jawaban_pg_opsi_ids
              .split(',')
              .map(id => parseInt(id.trim()))
              .sort();

            // Check if arrays are equal
            const isCorrect = JSON.stringify(opsiBenarIds) === JSON.stringify(jawabanIds);
            if (isCorrect) {
              totalNilai += soalUjian.bobot_nilai;
              console.log(`✅ Soal ${soal.soal_id}: BENAR (multiple choice)`);
            } else {
              console.log(`❌ Soal ${soal.soal_id}: SALAH (jawaban: ${jawabanIds}, benar: ${opsiBenarIds})`);
            }
          }
        }
      }
    }

    // Calculate final score (0-100)
    const nilaiAkhir = totalBobot > 0 ? (totalNilai / totalBobot) * 100 : 0;

    console.log(`📊 Nilai Akhir: ${nilaiAkhir.toFixed(2)} (${totalNilai}/${totalBobot})`);

    // Create hasil ujian
    const hasil = await prisma.hasil_ujians.create({
      data: {
        peserta_ujian_id: parseInt(peserta_ujian_id),
        nilai_akhir: nilaiAkhir,
        tanggal_submit: new Date(),
      },
    });

    if (!hasEssay) {
      await prisma.peserta_ujians.update({
        where: { peserta_ujian_id: parseInt(peserta_ujian_id) },
        data: { status_ujian: 'DINILAI' },
      });
    }

    // Log activity
    await activityLogService.createLog({
      user_id: siswa.userId,
      peserta_ujian_id: parseInt(peserta_ujian_id),
      activity_type: 'FINISH_UJIAN',
      description: `Menyelesaikan ujian: ${pesertaUjian.ujians.nama_ujian}`,
      ip_address: activityLogService.getIpAddress(req),
      user_agent: activityLogService.getUserAgent(req),
      metadata: {
        ujian_id: pesertaUjian.ujian_id,
        nilai_akhir: nilaiAkhir,
        total_soal: pesertaUjian.ujians.soal_ujians.length,
        soal_terjawab: pesertaUjian.jawabans.length,
        has_essay: hasEssay,
        waktu_selesai: new Date(),
      },
    });

    res.json({
      message: 'Ujian berhasil diselesaikan',
      hasil: {
        hasil_ujian_id: hasil.hasil_ujian_id,
        nilai_akhir: nilaiAkhir,
        status: hasEssay ? 'Menunggu penilaian essay oleh guru' : 'Selesai dinilai',
        total_soal: pesertaUjian.ujians.soal_ujians.length,
        soal_terjawab: pesertaUjian.jawabans.length,
      },
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
