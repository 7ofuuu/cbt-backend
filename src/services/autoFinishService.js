// src/services/autoFinishService.js
const prisma = require('../config/db');
const activityLogService = require('./activityLogService');

/**
 * Check and auto-finish expired ujian sessions
 * This should be called periodically (every minute)
 */
const checkAndFinishExpiredSessions = async () => {
  try {
    console.log('🔍 Checking for expired ujian sessions...');

    // Get all peserta ujian yang sedang dikerjakan
    const activeSessions = await prisma.peserta_ujians.findMany({
      where: {
        status_ujian: 'SEDANG_DIKERJAKAN',
        waktu_mulai: { not: null },
      },
      include: {
        ujians: true,
        siswas: {
          include: {
            user: true,
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

    let finishedCount = 0;

    for (const pesertaUjian of activeSessions) {
      const now = new Date();
      const waktuMulai = new Date(pesertaUjian.waktu_mulai);
      const durasiMs = pesertaUjian.ujians.durasi_menit * 60 * 1000;
      const deadlineByDuration = new Date(waktuMulai.getTime() + durasiMs);

      // Check deadline (either ujian.tanggal_selesai or waktu_mulai + durasi)
      const deadline = pesertaUjian.ujians.tanggal_selesai ? new Date(pesertaUjian.ujians.tanggal_selesai) : deadlineByDuration;

      // If current time exceeds deadline, auto-finish
      if (now > deadline) {
        console.log(`⏰ Auto-finishing expired session for peserta_ujian_id: ${pesertaUjian.peserta_ujian_id}`);

        try {
          // Calculate score
          const { nilaiAkhir, hasEssay } = await calculateScore(pesertaUjian);

          // Update status to SELESAI
          await prisma.peserta_ujians.update({
            where: { peserta_ujian_id: pesertaUjian.peserta_ujian_id },
            data: {
              status_ujian: 'SELESAI',
              waktu_selesai: now,
            },
          });

          // Create hasil ujian
          await prisma.hasil_ujians.create({
            data: {
              peserta_ujian_id: pesertaUjian.peserta_ujian_id,
              nilai_akhir: nilaiAkhir,
              tanggal_submit: now,
            },
          });

          // Update status to DINILAI if no essay
          if (!hasEssay) {
            await prisma.peserta_ujians.update({
              where: { peserta_ujian_id: pesertaUjian.peserta_ujian_id },
              data: { status_ujian: 'DINILAI' },
            });
          }

          // Log activity
          await activityLogService.createLog({
            user_id: pesertaUjian.siswas.userId,
            peserta_ujian_id: pesertaUjian.peserta_ujian_id,
            activity_type: 'AUTO_FINISH_UJIAN',
            description: `Ujian otomatis diselesaikan karena waktu habis - ${pesertaUjian.ujians.nama_ujian}`,
            metadata: {
              ujian_id: pesertaUjian.ujian_id,
              nilai_akhir: nilaiAkhir,
              waktu_mulai: pesertaUjian.waktu_mulai,
              waktu_selesai: now,
              deadline: deadline,
            },
          });

          finishedCount++;
          console.log(`✅ Auto-finished: ${pesertaUjian.siswas.nama_lengkap} - Nilai: ${nilaiAkhir.toFixed(2)}`);
        } catch (error) {
          console.error(`❌ Error auto-finishing peserta_ujian_id ${pesertaUjian.peserta_ujian_id}:`, error);
        }
      }
    }

    if (finishedCount > 0) {
      console.log(`✅ Auto-finished ${finishedCount} expired session(s)`);
    } else {
      console.log(`✓ No expired sessions found`);
    }

    return finishedCount;
  } catch (error) {
    console.error('❌ Error in checkAndFinishExpiredSessions:', error);
    return 0;
  }
};

/**
 * Calculate score for peserta ujian
 */
const calculateScore = async pesertaUjian => {
  let totalNilai = 0;
  let totalBobot = 0;
  let hasEssay = false;

  // Get soal_ujians for this ujian
  const soalUjians = await prisma.soal_ujians.findMany({
    where: { ujian_id: pesertaUjian.ujian_id },
    include: {
      soals: {
        include: {
          opsi_jawabans: true,
        },
      },
    },
  });

  for (const soalUjian of soalUjians) {
    totalBobot += soalUjian.bobot_nilai;

    const jawaban = pesertaUjian.jawabans.find(j => j.soal_id === soalUjian.soal_id);

    if (jawaban && jawaban.soals) {
      const soal = jawaban.soals;

      // Check essay questions
      if (soal.tipe_soal === 'ESSAY') {
        hasEssay = true;
        // If essay has nilai_manual, use it
        if (jawaban.nilai_manual !== null) {
          const nilaiDidapat = (jawaban.nilai_manual / 100) * soalUjian.bobot_nilai;
          totalNilai += nilaiDidapat;
        }
        continue;
      }

      // Check pilihan ganda (single or multiple)
      if (soal.tipe_soal === 'PILIHAN_GANDA_SINGLE') {
        const opsiBenar = soal.opsi_jawabans.find(o => o.is_benar);

        if (opsiBenar && jawaban.jawaban_pg_opsi_ids) {
          try {
            const jawabanIds = JSON.parse(jawaban.jawaban_pg_opsi_ids);
            const jawabanOpsiId = parseInt(jawabanIds[0]);
            if (jawabanOpsiId === opsiBenar.opsi_id) {
              totalNilai += soalUjian.bobot_nilai;
            }
          } catch (e) {
            console.error('Error parsing jawaban_pg_opsi_ids:', e);
          }
        }
      } else if (soal.tipe_soal === 'PILIHAN_GANDA_MULTIPLE') {
        const opsiBenarIds = soal.opsi_jawabans
          .filter(o => o.is_benar)
          .map(o => o.opsi_id)
          .sort();

        if (jawaban.jawaban_pg_opsi_ids) {
          try {
            const jawabanIds = JSON.parse(jawaban.jawaban_pg_opsi_ids)
              .map(id => parseInt(id))
              .sort();

            const isCorrect = JSON.stringify(opsiBenarIds) === JSON.stringify(jawabanIds);
            if (isCorrect) {
              totalNilai += soalUjian.bobot_nilai;
            }
          } catch (e) {
            console.error('Error parsing jawaban_pg_opsi_ids:', e);
          }
        }
      }
    }
  }

  const nilaiAkhir = totalBobot > 0 ? (totalNilai / totalBobot) * 100 : 0;

  return { nilaiAkhir, hasEssay, totalNilai, totalBobot };
};

/**
 * Start auto-finish scheduler
 * Runs every minute
 */
const startAutoFinishScheduler = () => {
  console.log('🚀 Starting auto-finish scheduler...');
  
  // Run immediately on start
  checkAndFinishExpiredSessions();
  
  // Then run every 60 seconds
  setInterval(checkAndFinishExpiredSessions, 60000);
  
  console.log('✅ Auto-finish scheduler started (running every 60 seconds)');
};

module.exports = {
  checkAndFinishExpiredSessions,
  calculateScore,
  startAutoFinishScheduler
};
