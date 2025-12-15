const prisma = require('../config/db');

// Get Ujian untuk Siswa (hanya ujian yang sudah di-assign)
const getMyUjians = async (req, res) => {
  const siswa_id = req.user.id;

  try {
    const siswa = await prisma.siswa.findUnique({ where: { userId: siswa_id } });
    if (!siswa) return res.status(404).json({ error: 'Siswa tidak ditemukan' });

    const pesertaUjians = await prisma.pesertaUjian.findMany({
      where: { siswa_id: siswa.siswa_id },
      include: {
        ujian: true,
        hasilUjian: true
      },
      orderBy: { ujian: { tanggal_mulai: 'asc' } }
    });

    res.json({ ujians: pesertaUjians });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Mulai Ujian (Siswa klik "Mulai Ujian")
const startUjian = async (req, res) => {
  const { peserta_ujian_id } = req.body;
  const siswa_id = req.user.id;

  try {
    const siswa = await prisma.siswa.findUnique({ where: { userId: siswa_id } });
    if (!siswa) return res.status(404).json({ error: 'Siswa tidak ditemukan' });

    const pesertaUjian = await prisma.pesertaUjian.findFirst({
      where: { 
        peserta_ujian_id,
        siswa_id: siswa.siswa_id 
      },
      include: { ujian: true }
    });

    if (!pesertaUjian) return res.status(404).json({ error: 'Ujian tidak ditemukan' });

    // Cek apakah ujian sudah dimulai
    if (pesertaUjian.status_ujian !== 'BELUM_MULAI') {
      return res.status(400).json({ error: 'Ujian sudah dimulai atau selesai' });
    }

    // Cek jadwal ujian
    const now = new Date();
    if (now < pesertaUjian.ujian.tanggal_mulai) {
      return res.status(400).json({ error: 'Ujian belum dimulai' });
    }
    if (now > pesertaUjian.ujian.tanggal_selesai) {
      return res.status(400).json({ error: 'Ujian sudah berakhir' });
    }

    // Update status
    const updated = await prisma.pesertaUjian.update({
      where: { peserta_ujian_id },
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
                  include: { opsiJawabans: true }
                }
              },
              orderBy: { urutan: 'asc' }
            }
          }
        }
      }
    });

    res.json({ 
      message: 'Ujian dimulai', 
      pesertaUjian: updated,
      waktu_selesai: new Date(now.getTime() + pesertaUjian.ujian.durasi_menit * 60000)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Submit Jawaban Siswa
const submitJawaban = async (req, res) => {
  const { peserta_ujian_id, soal_id, jawaban_essay_text, jawaban_pg_opsi_ids } = req.body;
  const siswa_id = req.user.id;

  try {
    const siswa = await prisma.siswa.findUnique({ where: { userId: siswa_id } });
    if (!siswa) return res.status(404).json({ error: 'Siswa tidak ditemukan' });

    // Cek peserta ujian
    const pesertaUjian = await prisma.pesertaUjian.findFirst({
      where: { 
        peserta_ujian_id,
        siswa_id: siswa.siswa_id,
        status_ujian: 'SEDANG_DIKERJAKAN'
      }
    });

    if (!pesertaUjian) {
      return res.status(400).json({ error: 'Ujian tidak sedang dikerjakan' });
    }

    // Get soal info untuk validasi jawaban
    const soal = await prisma.soal.findUnique({
      where: { soal_id },
      include: { opsiJawabans: true }
    });

    if (!soal) return res.status(404).json({ error: 'Soal tidak ditemukan' });

    let is_correct = null;
    let nilai_manual = null;

    // Auto-check untuk pilihan ganda
    if (soal.tipe_soal === 'PILIHAN_GANDA_SINGLE' && jawaban_pg_opsi_ids) {
      const opsiIds = JSON.parse(jawaban_pg_opsi_ids);
      const correctOpsi = soal.opsiJawabans.find(o => o.is_benar);
      is_correct = correctOpsi && opsiIds.includes(correctOpsi.opsi_id.toString());
    } else if (soal.tipe_soal === 'PILIHAN_GANDA_MULTIPLE' && jawaban_pg_opsi_ids) {
      const opsiIds = JSON.parse(jawaban_pg_opsi_ids);
      const correctOpsiIds = soal.opsiJawabans.filter(o => o.is_benar).map(o => o.opsi_id.toString());
      is_correct = JSON.stringify(opsiIds.sort()) === JSON.stringify(correctOpsiIds.sort());
    }

    // Check jika jawaban sudah ada (update), jika belum buat baru
    const existingJawaban = await prisma.jawaban.findFirst({
      where: { peserta_ujian_id, soal_id }
    });

    let jawaban;
    if (existingJawaban) {
      jawaban = await prisma.jawaban.update({
        where: { jawaban_id: existingJawaban.jawaban_id },
        data: {
          jawaban_essay_text: jawaban_essay_text || null,
          jawaban_pg_opsi_ids: jawaban_pg_opsi_ids || null,
          is_correct
        }
      });
    } else {
      jawaban = await prisma.jawaban.create({
        data: {
          peserta_ujian_id,
          soal_id,
          jawaban_essay_text: jawaban_essay_text || null,
          jawaban_pg_opsi_ids: jawaban_pg_opsi_ids || null,
          is_correct
        }
      });
    }

    res.json({ message: 'Jawaban berhasil disimpan', jawaban });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Finish Ujian (Submit All)
const finishUjian = async (req, res) => {
  const { peserta_ujian_id } = req.body;
  const siswa_id = req.user.id;

  try {
    const siswa = await prisma.siswa.findUnique({ where: { userId: siswa_id } });
    if (!siswa) return res.status(404).json({ error: 'Siswa tidak ditemukan' });

    const pesertaUjian = await prisma.pesertaUjian.findFirst({
      where: { 
        peserta_ujian_id,
        siswa_id: siswa.siswa_id,
        status_ujian: 'SEDANG_DIKERJAKAN'
      }
    });

    if (!pesertaUjian) {
      return res.status(400).json({ error: 'Ujian tidak sedang dikerjakan' });
    }

    // Update status
    await prisma.pesertaUjian.update({
      where: { peserta_ujian_id },
      data: {
        status_ujian: 'SELESAI',
        waktu_selesai: new Date()
      }
    });

    res.json({ message: 'Ujian selesai. Menunggu penilaian dari guru.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get Hasil Ujian Siswa
const getHasilUjian = async (req, res) => {
  const { peserta_ujian_id } = req.params;
  const siswa_id = req.user.id;

  try {
    const siswa = await prisma.siswa.findUnique({ where: { userId: siswa_id } });
    if (!siswa) return res.status(404).json({ error: 'Siswa tidak ditemukan' });

    const hasilUjian = await prisma.hasilUjian.findFirst({
      where: { 
        peserta_ujian_id: parseInt(peserta_ujian_id),
        pesertaUjian: { siswa_id: siswa.siswa_id }
      },
      include: {
        pesertaUjian: {
          include: {
            ujian: true,
            jawabans: {
              include: {
                soal: {
                  include: { opsiJawabans: true }
                }
              }
            }
          }
        }
      }
    });

    if (!hasilUjian) {
      return res.status(404).json({ error: 'Hasil ujian belum tersedia' });
    }

    res.json({ hasilUjian });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = { 
  getMyUjians, 
  startUjian, 
  submitJawaban, 
  finishUjian,
  getHasilUjian 
};
