const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

// Helper functions
function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function getRandomElements(arr, count) {
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(count, arr.length));
}

async function main() {
  console.log('🌱 Starting seeding process...\n');

  // Clear existing data
  console.log('🗑️  Clearing existing data...');
  await prisma.activityLog.deleteMany();
  await prisma.hasil_ujians.deleteMany();
  await prisma.jawabans.deleteMany();
  await prisma.soal_ujians.deleteMany();
  await prisma.peserta_ujians.deleteMany();
  await prisma.opsi_jawabans.deleteMany();
  await prisma.soals.deleteMany();
  await prisma.ujians.deleteMany();
  await prisma.siswa.deleteMany();
  await prisma.guru.deleteMany();
  await prisma.admin.deleteMany();
  await prisma.user.deleteMany();
  console.log('✅ Data cleared\n');

  const hashedPassword = await bcrypt.hash('password123', 10);

  // ==================== CREATE ADMINS ====================
  console.log('👤 Creating admins...');
  const admins = await Promise.all([
    prisma.user.create({
      data: {
        username: 'admin1',
        password: hashedPassword,
        role: 'admin',
        status_aktif: true,
        admin: { create: { nama_lengkap: 'Administrator Utama' } },
      },
      include: { admin: true },
    }),
    prisma.user.create({
      data: {
        username: 'admin2',
        password: hashedPassword,
        role: 'admin',
        status_aktif: true,
        admin: { create: { nama_lengkap: 'Administrator Sekunder' } },
      },
      include: { admin: true },
    }),
    prisma.user.create({
      data: {
        username: 'admin_nonaktif',
        password: hashedPassword,
        role: 'admin',
        status_aktif: false,
        admin: { create: { nama_lengkap: 'Administrator Nonaktif' } },
      },
      include: { admin: true },
    }),
  ]);
  console.log(`✅ Created ${admins.length} admins (2 aktif, 1 nonaktif)\n`);

  // ==================== CREATE GURUS ====================
  console.log('👨‍🏫 Creating gurus...');
  const guruData = [
    { username: 'guru_mtk', nama: 'Budi Santoso, S.Pd', aktif: true },
    { username: 'guru_fisika', nama: 'Ani Wijaya, M.Pd', aktif: true },
    { username: 'guru_kimia', nama: 'Dedi Suryanto, S.Si', aktif: true },
    { username: 'guru_biologi', nama: 'Rina Kusuma, S.Pd', aktif: true },
    { username: 'guru_bahasa', nama: 'Siti Nurhaliza, M.Pd', aktif: true },
    { username: 'guru_sejarah', nama: 'Ahmad Fauzi, S.Pd', aktif: true },
    { username: 'guru_ekonomi', nama: 'Dewi Lestari, M.Pd', aktif: true },
    { username: 'guru_nonaktif', nama: 'Guru Nonaktif, S.Pd', aktif: false },
  ];

  const gurus = [];
  for (const guru of guruData) {
    const user = await prisma.user.create({
      data: {
        username: guru.username,
        password: hashedPassword,
        role: 'guru',
        status_aktif: guru.aktif,
        guru: { create: { nama_lengkap: guru.nama } },
      },
      include: { guru: true },
    });
    gurus.push(user);
  }
  console.log(`✅ Created ${gurus.length} gurus (7 aktif, 1 nonaktif)\n`);

  // ==================== CREATE SISWAS ====================
  console.log('👨‍🎓 Creating siswas...');
  const siswaData = [];
  const jurusans = ['IPA', 'IPS', 'Bahasa'];
  const tingkats = ['X', 'XI', 'XII'];
  const namaDepan = ['Ahmad', 'Budi', 'Citra', 'Dian', 'Eko', 'Fitri', 'Gita', 'Hendra', 'Indah', 'Joko', 'Kartika', 'Lina', 'Maya', 'Nina', 'Omar'];
  const namaBelakang = ['Pratama', 'Wijaya', 'Kusuma', 'Santoso', 'Putra', 'Putri', 'Saputra', 'Dewi', 'Nugroho', 'Permata'];

  let siswaCount = 1;
  for (const tingkat of tingkats) {
    for (const jurusan of jurusans) {
      for (let i = 1; i <= 12; i++) {
        const depan = namaDepan[Math.floor(Math.random() * namaDepan.length)];
        const belakang = namaBelakang[Math.floor(Math.random() * namaBelakang.length)];
        const kelasNumber = Math.ceil(i / 6);

        siswaData.push({
          username: `siswa${siswaCount}`,
          nama: `${depan} ${belakang}`,
          kelas: `${tingkat}-${jurusan}-${kelasNumber}`,
          tingkat: tingkat,
          jurusan: jurusan,
          aktif: siswaCount <= 100, // First 100 active, rest inactive
        });
        siswaCount++;
      }
    }
  }

  const siswas = [];
  for (const siswa of siswaData) {
    const user = await prisma.user.create({
      data: {
        username: siswa.username,
        password: hashedPassword,
        role: 'siswa',
        status_aktif: siswa.aktif,
        siswa: {
          create: {
            nama_lengkap: siswa.nama,
            kelas: siswa.kelas,
            tingkat: siswa.tingkat,
            jurusan: siswa.jurusan,
          },
        },
      },
      include: { siswa: true },
    });
    siswas.push(user);
  }
  console.log(`✅ Created ${siswas.length} siswas (100 aktif, ${siswas.length - 100} nonaktif)\n`);

  // ==================== CREATE SOALS ====================
  console.log('📝 Creating soals (PG Single, PG Multiple, Essay)...');

  const soalTemplates = {
    Matematika: [
      { teks: 'Berapa hasil dari 2 + 2?', opsi: ['2', '3', '4', '5', '6'], benar: [2] },
      { teks: 'Tentukan turunan dari f(x) = 3x² + 2x - 1', opsi: ['6x + 2', '6x - 2', '3x + 2', '6x + 1', '3x - 1'], benar: [0] },
      { teks: 'Nilai dari sin 90° adalah...', opsi: ['0', '0.5', '1', '√2/2', '√3/2'], benar: [2] },
      { teks: 'Manakah yang merupakan bilangan prima?', opsi: ['2', '3', '4', '5', '6'], benar: [0, 1, 3] },
      { teks: 'Jika a = 5 dan b = 3, berapa nilai dari a² - b²?', opsi: ['8', '16', '25', '34', '64'], benar: [1] },
    ],
    Fisika: [
      { teks: 'Satuan SI untuk gaya adalah...', opsi: ['Joule', 'Newton', 'Watt', 'Pascal', 'Kelvin'], benar: [1] },
      { teks: 'Hukum Newton I menyatakan tentang...', opsi: ['Gaya dan percepatan', 'Inersia', 'Aksi-reaksi', 'Gravitasi', 'Momentum'], benar: [1] },
      { teks: 'Yang termasuk besaran vektor adalah...', opsi: ['Gaya', 'Kecepatan', 'Massa', 'Percepatan', 'Waktu'], benar: [0, 1, 3] },
    ],
    Kimia: [
      { teks: 'Simbol kimia untuk air adalah...', opsi: ['H₂O', 'CO₂', 'O₂', 'H₂', 'NaCl'], benar: [0] },
      { teks: 'Jumlah proton dalam atom disebut...', opsi: ['Nomor massa', 'Nomor atom', 'Isotop', 'Ion', 'Elektron'], benar: [1] },
      { teks: 'Yang termasuk gas mulia adalah...', opsi: ['Helium', 'Neon', 'Oksigen', 'Argon', 'Nitrogen'], benar: [0, 1, 3] },
    ],
    Biologi: [
      { teks: 'Organel yang berfungsi sebagai pusat sel adalah...', opsi: ['Mitokondria', 'Ribosom', 'Nukleus', 'Lisosom', 'Golgi'], benar: [2] },
      { teks: 'Proses fotosintesis terjadi di...', opsi: ['Mitokondria', 'Kloroplas', 'Nukleus', 'Ribosom', 'Vakuola'], benar: [1] },
      { teks: 'Yang termasuk organ pencernaan adalah...', opsi: ['Lambung', 'Usus', 'Jantung', 'Hati', 'Paru-paru'], benar: [0, 1, 3] },
    ],
    'Bahasa Indonesia': [
      { teks: 'Kata baku dari "apotek" adalah...', opsi: ['Apotik', 'Apotek', 'Apothek', 'Apotex', 'Apotec'], benar: [0] },
      { teks: 'Kalimat yang mengandung subjek, predikat, dan objek disebut...', opsi: ['Kalimat tunggal', 'Kalimat majemuk', 'Kalimat lengkap', 'Kalimat inti', 'Kalimat sempurna'], benar: [2] },
      { teks: 'Yang termasuk imbuhan adalah...', opsi: ['ber-', 'me-', 'di-', '-an', '-kan'], benar: [0, 1, 2, 3, 4] },
    ],
    Sejarah: [
      { teks: 'Proklamasi kemerdekaan Indonesia dibacakan pada tanggal...', opsi: ['17 Agustus 1945', '17 Agustus 1944', '18 Agustus 1945', '16 Agustus 1945', '19 Agustus 1945'], benar: [0] },
      { teks: 'Kerajaan Hindu pertama di Indonesia adalah...', opsi: ['Majapahit', 'Kutai', 'Sriwijaya', 'Mataram Kuno', 'Singasari'], benar: [1] },
    ],
    Ekonomi: [
      { teks: 'Ilmu ekonomi mempelajari tentang...', opsi: ['Uang', 'Kelangkaan', 'Perdagangan', 'Produksi', 'Distribusi'], benar: [1] },
      { teks: 'Kebutuhan primer manusia meliputi...', opsi: ['Sandang', 'Pangan', 'Papan', 'Mobil', 'Perhiasan'], benar: [0, 1, 2] },
    ],
  };

  const mataPelajaranData = {
    Matematika: { guru: gurus[0].guru.guru_id, tingkats: ['X', 'XI', 'XII'], jurusans: ['IPA', 'IPS'] },
    Fisika: { guru: gurus[1].guru.guru_id, tingkats: ['X', 'XI', 'XII'], jurusans: ['IPA'] },
    Kimia: { guru: gurus[2].guru.guru_id, tingkats: ['X', 'XI', 'XII'], jurusans: ['IPA'] },
    Biologi: { guru: gurus[3].guru.guru_id, tingkats: ['X', 'XI', 'XII'], jurusans: ['IPA'] },
    'Bahasa Indonesia': { guru: gurus[4].guru.guru_id, tingkats: ['X', 'XI', 'XII'], jurusans: ['IPA', 'IPS', 'Bahasa'] },
    Sejarah: { guru: gurus[5].guru.guru_id, tingkats: ['X', 'XI', 'XII'], jurusans: ['IPA', 'IPS', 'Bahasa'] },
    Ekonomi: { guru: gurus[6].guru.guru_id, tingkats: ['X', 'XI', 'XII'], jurusans: ['IPS'] },
  };

  const soals = [];
  let soalCount = 0;

  for (const [mataPelajaran, config] of Object.entries(mataPelajaranData)) {
    const templates = soalTemplates[mataPelajaran] || soalTemplates['Matematika'];

    for (const tingkat of config.tingkats) {
      for (const jurusan of config.jurusans) {
        // Create 10 PG Single soals
        for (let i = 0; i < 10; i++) {
          const template = templates[i % templates.length];
          const soal = await prisma.soals.create({
            data: {
              tipe_soal: 'PILIHAN_GANDA_SINGLE',
              teks_soal: `[${tingkat}-${jurusan}] ${template.teks}`,
              mata_pelajaran: mataPelajaran,
              tingkat: tingkat,
              jurusan: jurusan,
              soal_pembahasan: `Pembahasan untuk soal ${mataPelajaran} tingkat ${tingkat}`,
              guru_id: config.guru,
              updatedAt: new Date(),
              opsi_jawabans: {
                create: template.opsi.map((opsi, idx) => ({
                  label: String.fromCharCode(65 + idx),
                  teks_opsi: opsi,
                  is_benar: template.benar[0] === idx,
                })),
              },
            },
          });
          soals.push(soal);
          soalCount++;
        }

        // Create 5 PG Multiple soals
        for (let i = 0; i < 5; i++) {
          const template = templates.find(t => t.benar.length > 1) || templates[0];
          const correctAnswers = template.benar.length > 1 ? template.benar : [0, 1];

          const soal = await prisma.soals.create({
            data: {
              tipe_soal: 'PILIHAN_GANDA_MULTIPLE',
              teks_soal: `[${tingkat}-${jurusan}] [MULTIPLE] ${template.teks} (Pilih semua yang benar)`,
              mata_pelajaran: mataPelajaran,
              tingkat: tingkat,
              jurusan: jurusan,
              soal_pembahasan: `Pembahasan untuk soal PG Multiple ${mataPelajaran}`,
              guru_id: config.guru,
              updatedAt: new Date(),
              opsi_jawabans: {
                create: template.opsi.map((opsi, idx) => ({
                  label: String.fromCharCode(65 + idx),
                  teks_opsi: opsi,
                  is_benar: correctAnswers.includes(idx),
                })),
              },
            },
          });
          soals.push(soal);
          soalCount++;
        }

        // Create 5 Essay soals
        for (let i = 0; i < 5; i++) {
          const soal = await prisma.soals.create({
            data: {
              tipe_soal: 'ESSAY',
              teks_soal: `[${tingkat}-${jurusan}] Jelaskan secara detail tentang konsep ${mataPelajaran} terkait topik ${i + 1}. Berikan contoh dan analisis yang mendalam.`,
              mata_pelajaran: mataPelajaran,
              tingkat: tingkat,
              jurusan: jurusan,
              soal_pembahasan: `Pembahasan essay ${mataPelajaran}`,
              guru_id: config.guru,
              updatedAt: new Date(),
            },
          });
          soals.push(soal);
          soalCount++;
        }
      }
    }
  }
  console.log(`✅ Created ${soalCount} soals (PG Single, PG Multiple, Essay)\n`);

  // ==================== CREATE UJIANS (All Statuses) ====================
  console.log('📋 Creating ujians with various statuses...');

  const now = new Date();
  const ujianTemplates = [];

  // TERJADWAL (Future)
  for (let i = 0; i < 3; i++) {
    ujianTemplates.push({
      nama: `Ujian Tengah Semester Matematika ${i + 1}`,
      mapel: 'Matematika',
      tingkat: ['X', 'XI', 'XII'][i],
      jurusan: 'IPA',
      guru: gurus[0].guru.guru_id,
      status: 'TERJADWAL',
      tanggalMulai: new Date(now.getTime() + (i + 1) * 24 * 60 * 60 * 1000),
      durasi: 90,
      acak: i % 2 === 0,
    });
  }

  // BERLANGSUNG (Current)
  for (let i = 0; i < 3; i++) {
    const mulai = new Date(now.getTime() - 30 * 60 * 1000); // Started 30 min ago
    const selesai = new Date(now.getTime() + 60 * 60 * 1000); // Ends in 1 hour

    ujianTemplates.push({
      nama: `Ujian Berlangsung Fisika ${i + 1}`,
      mapel: 'Fisika',
      tingkat: ['X', 'XI', 'XII'][i],
      jurusan: 'IPA',
      guru: gurus[1].guru.guru_id,
      status: 'BERLANGSUNG',
      tanggalMulai: mulai,
      tanggalSelesai: selesai,
      durasi: 90,
      acak: true,
    });
  }

  // BERAKHIR (Past)
  for (let i = 0; i < 3; i++) {
    ujianTemplates.push({
      nama: `Ujian Akhir Semester Kimia ${i + 1}`,
      mapel: 'Kimia',
      tingkat: ['X', 'XI', 'XII'][i],
      jurusan: 'IPA',
      guru: gurus[2].guru.guru_id,
      status: 'BERAKHIR',
      tanggalMulai: new Date(now.getTime() - (i + 2) * 24 * 60 * 60 * 1000),
      durasi: 90,
      acak: false,
    });
  }

  // Additional ujians for other subjects
  ujianTemplates.push(
    { nama: 'Ujian Biologi Kelas X', mapel: 'Biologi', tingkat: 'X', jurusan: 'IPA', guru: gurus[3].guru.guru_id, status: 'BERAKHIR', tanggalMulai: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000), durasi: 90, acak: false },
    { nama: 'Ujian Bahasa Indonesia', mapel: 'Bahasa Indonesia', tingkat: 'XI', jurusan: 'IPA', guru: gurus[4].guru.guru_id, status: 'BERLANGSUNG', tanggalMulai: new Date(now.getTime() - 20 * 60 * 1000), durasi: 90, acak: true },
    { nama: 'Ujian Sejarah', mapel: 'Sejarah', tingkat: 'XII', jurusan: 'IPS', guru: gurus[5].guru.guru_id, status: 'TERJADWAL', tanggalMulai: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000), durasi: 90, acak: false },
    { nama: 'Ujian Ekonomi', mapel: 'Ekonomi', tingkat: 'XI', jurusan: 'IPS', guru: gurus[6].guru.guru_id, status: 'BERAKHIR', tanggalMulai: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000), durasi: 90, acak: true }
  );

  const ujians = [];
  for (const template of ujianTemplates) {
    const tanggalMulai = template.tanggalMulai;
    const tanggalSelesai = template.tanggalSelesai || new Date(tanggalMulai.getTime() + template.durasi * 60 * 1000);

    const ujian = await prisma.ujians.create({
      data: {
        nama_ujian: template.nama,
        mata_pelajaran: template.mapel,
        tingkat: template.tingkat,
        jurusan: template.jurusan,
        tanggal_mulai: tanggalMulai,
        tanggal_selesai: tanggalSelesai,
        durasi_menit: template.durasi,
        is_acak_soal: template.acak,
        status_ujian: template.status,
        guru_id: template.guru,
        updatedAt: new Date(),
      },
    });
    ujians.push(ujian);
  }
  console.log(`✅ Created ${ujians.length} ujians (TERJADWAL, BERLANGSUNG, BERAKHIR)\n`);

  // ==================== ASSIGN SOALS TO UJIANS ====================
  console.log('🔗 Assigning soals to ujians...');
  let soalUjianCount = 0;

  for (const ujian of ujians) {
    const matchingSoals = soals.filter(s => s.mata_pelajaran === ujian.mata_pelajaran && s.tingkat === ujian.tingkat && s.jurusan === ujian.jurusan);

    const pgSingleSoals = matchingSoals.filter(s => s.tipe_soal === 'PILIHAN_GANDA_SINGLE').slice(0, 8);
    const pgMultipleSoals = matchingSoals.filter(s => s.tipe_soal === 'PILIHAN_GANDA_MULTIPLE').slice(0, 2);
    const essaySoals = matchingSoals.filter(s => s.tipe_soal === 'ESSAY').slice(0, 3);
    const selectedSoals = [...pgSingleSoals, ...pgMultipleSoals, ...essaySoals];

    for (let i = 0; i < selectedSoals.length; i++) {
      await prisma.soal_ujians.create({
        data: {
          ujian_id: ujian.ujian_id,
          soal_id: selectedSoals[i].soal_id,
          bobot_nilai: selectedSoals[i].tipe_soal === 'ESSAY' ? 20 : selectedSoals[i].tipe_soal === 'PILIHAN_GANDA_MULTIPLE' ? 15 : 10,
          urutan: i + 1,
        },
      });
      soalUjianCount++;
    }
  }
  console.log(`✅ Created ${soalUjianCount} soal-ujian assignments\n`);

  // ==================== ASSIGN SISWAS TO UJIANS ====================
  console.log('👥 Assigning siswas to ujians...');
  let pesertaUjianCount = 0;

  for (const ujian of ujians) {
    const matchingSiswas = siswas.filter(s => s.siswa.tingkat === ujian.tingkat && s.siswa.jurusan === ujian.jurusan && s.status_aktif);

    for (const siswa of matchingSiswas) {
      await prisma.peserta_ujians.create({
        data: {
          ujian_id: ujian.ujian_id,
          siswa_id: siswa.siswa.siswa_id,
          status_ujian: 'BELUM_MULAI',
          is_blocked: false,
        },
      });
      pesertaUjianCount++;
    }
  }
  console.log(`✅ Created ${pesertaUjianCount} peserta-ujian assignments\n`);

  // ==================== CREATE COMPLETED UJIANS WITH ALL STATUSES ====================
  console.log('✍️ Creating sample completed ujians with various statuses...');

  let jawabanCount = 0;
  let hasilCount = 0;

  // Process BERAKHIR ujians
  const berakhirUjians = ujians.filter(u => u.status_ujian === 'BERAKHIR');

  for (const ujian of berakhirUjians) {
    const pesertaUjians = await prisma.peserta_ujians.findMany({
      where: { ujian_id: ujian.ujian_id },
      take: 8,
    });

    const soalUjians = await prisma.soal_ujians.findMany({
      where: { ujian_id: ujian.ujian_id },
      include: { soals: { include: { opsi_jawabans: true } } },
    });

    for (let idx = 0; idx < pesertaUjians.length; idx++) {
      const peserta = pesertaUjians[idx];

      // Various statuses: SELESAI, DINILAI, some SEDANG_DIKERJAKAN
      let status;
      let waktuMulai = null;
      let waktuSelesai = null;
      let isBlocked = false;
      let blockReason = null;
      let unlockCode = null;

      if (idx < 5) {
        // DINILAI - Completed and graded
        status = 'DINILAI';
        waktuMulai = new Date(ujian.tanggal_mulai.getTime() + Math.floor(Math.random() * 10) * 60 * 1000);
        waktuSelesai = new Date(waktuMulai.getTime() + (40 + Math.floor(Math.random() * 30)) * 60 * 1000);
      } else if (idx < 7) {
        // SELESAI - Completed but not graded yet (has essay)
        status = 'SELESAI';
        waktuMulai = new Date(ujian.tanggal_mulai.getTime() + Math.floor(Math.random() * 10) * 60 * 1000);
        waktuSelesai = new Date(waktuMulai.getTime() + (45 + Math.floor(Math.random() * 25)) * 60 * 1000);
      } else {
        // SEDANG_DIKERJAKAN - Started but abandoned (blocked student)
        status = 'SEDANG_DIKERJAKAN';
        waktuMulai = new Date(ujian.tanggal_mulai.getTime() + Math.floor(Math.random() * 15) * 60 * 1000);
        isBlocked = true;
        blockReason = 'Terdeteksi tab switching berulang kali';
        unlockCode = `UNLOCK${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      }

      await prisma.peserta_ujians.update({
        where: { peserta_ujian_id: peserta.peserta_ujian_id },
        data: {
          status_ujian: status,
          waktu_mulai: waktuMulai,
          waktu_selesai: waktuSelesai,
          is_blocked: isBlocked,
          block_reason: blockReason,
          unlock_code: unlockCode,
        },
      });

      // Create answers
      if (status === 'DINILAI' || status === 'SELESAI') {
        let totalNilai = 0;
        let totalBobot = 0;
        let hasUngradedEssay = false;

        for (const soalUjian of soalUjians) {
          totalBobot += soalUjian.bobot_nilai;

          if (soalUjian.soals.tipe_soal === 'PILIHAN_GANDA_SINGLE') {
            const isCorrect = Math.random() > 0.25;
            const correctOpsi = soalUjian.soals.opsi_jawabans.find(o => o.is_benar);
            const incorrectOpsi = soalUjian.soals.opsi_jawabans.find(o => !o.is_benar);
            const selectedOpsi = isCorrect ? correctOpsi : incorrectOpsi;

            await prisma.jawabans.create({
              data: {
                peserta_ujian_id: peserta.peserta_ujian_id,
                soal_id: soalUjian.soal_id,
                jawaban_pg_opsi_ids: JSON.stringify([selectedOpsi.opsi_id.toString()]),
                is_correct: isCorrect,
              },
            });

            if (isCorrect) totalNilai += soalUjian.bobot_nilai;
            jawabanCount++;
          } else if (soalUjian.soals.tipe_soal === 'PILIHAN_GANDA_MULTIPLE') {
            const correctOpsis = soalUjian.soals.opsi_jawabans.filter(o => o.is_benar);
            const isCorrect = Math.random() > 0.4;
            const selectedOpsis = isCorrect ? correctOpsis : getRandomElements(soalUjian.soals.opsi_jawabans, 2);

            await prisma.jawabans.create({
              data: {
                peserta_ujian_id: peserta.peserta_ujian_id,
                soal_id: soalUjian.soal_id,
                jawaban_pg_opsi_ids: JSON.stringify(selectedOpsis.map(o => o.opsi_id.toString())),
                is_correct: isCorrect,
              },
            });

            if (isCorrect) totalNilai += soalUjian.bobot_nilai;
            jawabanCount++;
          } else if (soalUjian.soals.tipe_soal === 'ESSAY') {
            const nilaiManual = status === 'DINILAI' ? 70 + Math.floor(Math.random() * 26) : null;
            const nilaiDidapat = nilaiManual ? (nilaiManual / 100) * soalUjian.bobot_nilai : 0;

            if (!nilaiManual) hasUngradedEssay = true;

            await prisma.jawabans.create({
              data: {
                peserta_ujian_id: peserta.peserta_ujian_id,
                soal_id: soalUjian.soal_id,
                jawaban_essay_text: 'Ini adalah contoh jawaban essay dari siswa. Jawaban ini berisi penjelasan detail mengenai topik yang ditanyakan dengan analisis yang mendalam dan contoh-contoh yang relevan.',
                nilai_manual: nilaiManual,
              },
            });

            if (nilaiManual) totalNilai += nilaiDidapat;
            jawabanCount++;
          }
        }

        // Create hasil_ujian only for DINILAI
        if (status === 'DINILAI') {
          const nilaiAkhir = (totalNilai / totalBobot) * 100;
          await prisma.hasil_ujians.create({
            data: {
              peserta_ujian_id: peserta.peserta_ujian_id,
              nilai_akhir: Math.round(nilaiAkhir * 100) / 100,
              tanggal_submit: waktuSelesai,
            },
          });
          hasilCount++;
        }
      } else if (status === 'SEDANG_DIKERJAKAN') {
        // Partial answers for blocked students
        const partialSoals = getRandomElements(soalUjians, Math.floor(soalUjians.length / 2));

        for (const soalUjian of partialSoals) {
          if (soalUjian.soals.tipe_soal === 'PILIHAN_GANDA_SINGLE') {
            const randomOpsi = getRandomElements(soalUjian.soals.opsi_jawabans, 1)[0];
            await prisma.jawabans.create({
              data: {
                peserta_ujian_id: peserta.peserta_ujian_id,
                soal_id: soalUjian.soal_id,
                jawaban_pg_opsi_ids: JSON.stringify([randomOpsi.opsi_id.toString()]),
                is_correct: randomOpsi.is_benar,
              },
            });
            jawabanCount++;
          }
        }
      }
    }
  }

  // Process BERLANGSUNG ujians - some started
  const berlangusungUjians = ujians.filter(u => u.status_ujian === 'BERLANGSUNG');

  for (const ujian of berlangusungUjians) {
    const pesertaUjians = await prisma.peserta_ujians.findMany({
      where: { ujian_id: ujian.ujian_id },
      take: 5,
    });

    for (let idx = 0; idx < pesertaUjians.length; idx++) {
      const peserta = pesertaUjians[idx];

      if (idx < 3) {
        // SEDANG_DIKERJAKAN - Currently working
        const waktuMulai = new Date(ujian.tanggal_mulai.getTime() + Math.floor(Math.random() * 20) * 60 * 1000);

        await prisma.peserta_ujians.update({
          where: { peserta_ujian_id: peserta.peserta_ujian_id },
          data: {
            status_ujian: 'SEDANG_DIKERJAKAN',
            waktu_mulai: waktuMulai,
          },
        });

        // Create partial answers
        const soalUjians = await prisma.soal_ujians.findMany({
          where: { ujian_id: ujian.ujian_id },
          include: { soals: { include: { opsi_jawabans: true } } },
          take: 3,
        });

        for (const soalUjian of soalUjians) {
          if (soalUjian.soals.tipe_soal === 'PILIHAN_GANDA_SINGLE') {
            const randomOpsi = getRandomElements(soalUjian.soals.opsi_jawabans, 1)[0];
            await prisma.jawabans.create({
              data: {
                peserta_ujian_id: peserta.peserta_ujian_id,
                soal_id: soalUjian.soal_id,
                jawaban_pg_opsi_ids: JSON.stringify([randomOpsi.opsi_id.toString()]),
                is_correct: randomOpsi.is_benar,
              },
            });
            jawabanCount++;
          }
        }
      }
      // else: Keep as BELUM_MULAI
    }
  }

  console.log(`✅ Created ${jawabanCount} jawabans`);
  console.log(`✅ Created ${hasilCount} hasil ujians\n`);

  // ==================== CREATE ACTIVITY LOGS ====================
  console.log('📊 Creating activity logs...');

  let logCount = 0;

  // LOGIN logs for various users
  const activeUsers = [...siswas.slice(0, 30), ...gurus.slice(0, 5), admins[0], admins[1]];
  for (const user of activeUsers) {
    const loginTime = randomDate(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), now);
    await prisma.activityLog.create({
      data: {
        user_id: user.id,
        activity_type: 'LOGIN',
        description: `User ${user.username} berhasil login`,
        ip_address: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        metadata: JSON.stringify({
          username: user.username,
          role: user.role,
          login_time: loginTime.toISOString(),
        }),
        created_at: loginTime,
      },
    });
    logCount++;
  }

  // LOGOUT logs
  for (let i = 0; i < 10; i++) {
    const user = activeUsers[i];
    const logoutTime = randomDate(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000), now);
    await prisma.activityLog.create({
      data: {
        user_id: user.id,
        activity_type: 'LOGOUT',
        description: `User ${user.username} logout dari sistem`,
        ip_address: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        metadata: JSON.stringify({
          username: user.username,
          role: user.role,
          logout_time: logoutTime.toISOString(),
        }),
        created_at: logoutTime,
      },
    });
    logCount++;
  }

  // START_UJIAN and FINISH_UJIAN logs for completed ujians
  for (const ujian of berakhirUjians) {
    const pesertaUjians = await prisma.peserta_ujians.findMany({
      where: {
        ujian_id: ujian.ujian_id,
        status_ujian: { in: ['SELESAI', 'DINILAI'] },
      },
      include: { siswas: { include: { user: true } } },
    });

    for (const peserta of pesertaUjians) {
      // START_UJIAN log
      await prisma.activityLog.create({
        data: {
          user_id: peserta.siswas.user.id,
          peserta_ujian_id: peserta.peserta_ujian_id,
          activity_type: 'START_UJIAN',
          description: `Siswa ${peserta.siswas.nama_lengkap} memulai ujian ${ujian.nama_ujian}`,
          ip_address: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
          user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          metadata: JSON.stringify({
            ujian_id: ujian.ujian_id,
            nama_ujian: ujian.nama_ujian,
            mata_pelajaran: ujian.mata_pelajaran,
          }),
          created_at: peserta.waktu_mulai,
        },
      });
      logCount++;

      // FINISH_UJIAN or AUTO_FINISH_UJIAN log
      const isAutoFinish = Math.random() > 0.7;
      await prisma.activityLog.create({
        data: {
          user_id: peserta.siswas.user.id,
          peserta_ujian_id: peserta.peserta_ujian_id,
          activity_type: isAutoFinish ? 'AUTO_FINISH_UJIAN' : 'FINISH_UJIAN',
          description: isAutoFinish ? `Ujian ${ujian.nama_ujian} diselesaikan otomatis karena waktu habis` : `Siswa ${peserta.siswas.nama_lengkap} menyelesaikan ujian ${ujian.nama_ujian}`,
          ip_address: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
          user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          metadata: JSON.stringify({
            ujian_id: ujian.ujian_id,
            nama_ujian: ujian.nama_ujian,
            is_auto_finish: isAutoFinish,
          }),
          created_at: peserta.waktu_selesai,
        },
      });
      logCount++;
    }
  }

  // BLOCK_STUDENT logs
  const blockedPeserta = await prisma.peserta_ujians.findMany({
    where: { is_blocked: true },
    include: { siswas: { include: { user: true } }, ujians: true },
  });

  for (const peserta of blockedPeserta) {
    await prisma.activityLog.create({
      data: {
        user_id: peserta.siswas.user.id,
        peserta_ujian_id: peserta.peserta_ujian_id,
        activity_type: 'BLOCK_STUDENT',
        description: `Siswa ${peserta.siswas.nama_lengkap} diblokir: ${peserta.block_reason}`,
        ip_address: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        metadata: JSON.stringify({
          ujian_id: peserta.ujian_id,
          nama_ujian: peserta.ujians.nama_ujian,
          block_reason: peserta.block_reason,
          unlock_code: peserta.unlock_code,
        }),
        created_at: peserta.waktu_mulai,
      },
    });
    logCount++;
  }

  // Additional activity types
  const additionalActivities = [
    { type: 'CREATE_UJIAN', description: 'Guru membuat ujian baru' },
    { type: 'UPDATE_UJIAN', description: 'Guru mengupdate ujian' },
    { type: 'DELETE_UJIAN', description: 'Guru menghapus ujian' },
    { type: 'CREATE_SOAL', description: 'Guru membuat soal baru' },
    { type: 'UPDATE_SOAL', description: 'Guru mengupdate soal' },
    { type: 'GRADE_ESSAY', description: 'Guru menilai jawaban essay' },
    { type: 'VIEW_HASIL', description: 'Siswa melihat hasil ujian' },
    { type: 'EXPORT_HASIL', description: 'Guru mengexport hasil ujian' },
  ];

  for (let i = 0; i < 20; i++) {
    const activity = additionalActivities[Math.floor(Math.random() * additionalActivities.length)];
    const user =
      activity.type.includes('GURU') || activity.type.includes('CREATE') || activity.type.includes('UPDATE') || activity.type.includes('DELETE') || activity.type.includes('GRADE') || activity.type.includes('EXPORT')
        ? gurus[Math.floor(Math.random() * 5)]
        : siswas[Math.floor(Math.random() * 20)];

    await prisma.activityLog.create({
      data: {
        user_id: user.id,
        activity_type: activity.type,
        description: `${user.username}: ${activity.description}`,
        ip_address: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        metadata: JSON.stringify({
          username: user.username,
          role: user.role,
          timestamp: randomDate(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), now).toISOString(),
        }),
        created_at: randomDate(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), now),
      },
    });
    logCount++;
  }

  console.log(`✅ Created ${logCount} activity logs\n`);

  // ==================== SUMMARY ====================
  console.log('📊 =============== SEEDING SUMMARY ===============');
  console.log(`✅ Admins: ${admins.length} (2 aktif, 1 nonaktif)`);
  console.log(`✅ Gurus: ${gurus.length} (7 aktif, 1 nonaktif)`);
  console.log(`✅ Siswas: ${siswas.length} (100 aktif, ${siswas.length - 100} nonaktif)`);
  console.log(`✅ Soals: ${soalCount} (PG Single, PG Multiple, Essay)`);
  console.log(`✅ Ujians: ${ujians.length} (TERJADWAL, BERLANGSUNG, BERAKHIR)`);
  console.log(`✅ Soal-Ujian Assignments: ${soalUjianCount}`);
  console.log(`✅ Peserta-Ujian Assignments: ${pesertaUjianCount}`);
  console.log(`   - BELUM_MULAI: Multiple`);
  console.log(`   - SEDANG_DIKERJAKAN: Multiple (including blocked)`);
  console.log(`   - SELESAI: Multiple (completed, awaiting grading)`);
  console.log(`   - DINILAI: Multiple (fully graded)`);
  console.log(`   - Blocked Students: ${blockedPeserta.length}`);
  console.log(`✅ Jawabans: ${jawabanCount}`);
  console.log(`✅ Hasil Ujians: ${hasilCount}`);
  console.log(`✅ Activity Logs: ${logCount}`);
  console.log(`   - LOGIN, LOGOUT, START_UJIAN, FINISH_UJIAN, AUTO_FINISH_UJIAN`);
  console.log(`   - BLOCK_STUDENT, CREATE_UJIAN, UPDATE_UJIAN, GRADE_ESSAY, etc.`);
  console.log('================================================================\n');

  console.log('🎉 Seeding completed successfully!\n');
  console.log('📝 Default password for all users: password123\n');
  console.log('👤 Sample Accounts:');
  console.log('   Admin: admin1 / password123');
  console.log('   Guru: guru_mtk / password123');
  console.log('   Siswa: siswa1 / password123');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
