const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seeding process...\n');

  // Clear existing data (in order due to foreign key constraints)
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

  // Hash password
  const hashedPassword = await bcrypt.hash('password123', 10);

  // ==================== CREATE ADMINS ====================
  console.log('👤 Creating admins...');
  const admin1 = await prisma.user.create({
    data: {
      username: 'admin1',
      password: hashedPassword,
      role: 'admin',
      admin: {
        create: {
          nama_lengkap: 'Administrator Utama'
        }
      }
    },
    include: { admin: true }
  });

  const admin2 = await prisma.user.create({
    data: {
      username: 'admin2',
      password: hashedPassword,
      role: 'admin',
      admin: {
        create: {
          nama_lengkap: 'Administrator Sekunder'
        }
      }
    },
    include: { admin: true }
  });
  console.log(`✅ Created ${2} admins\n`);

  // ==================== CREATE GURUS ====================
  console.log('👨‍🏫 Creating gurus...');
  const guruData = [
    { username: 'guru_mtk', nama: 'Budi Santoso, S.Pd' },
    { username: 'guru_fisika', nama: 'Ani Wijaya, M.Pd' },
    { username: 'guru_kimia', nama: 'Dedi Suryanto, S.Si' },
    { username: 'guru_biologi', nama: 'Rina Kusuma, S.Pd' },
    { username: 'guru_bahasa', nama: 'Siti Nurhaliza, M.Pd' }
  ];

  const gurus = [];
  for (const guru of guruData) {
    const user = await prisma.user.create({
      data: {
        username: guru.username,
        password: hashedPassword,
        role: 'guru',
        guru: {
          create: {
            nama_lengkap: guru.nama
          }
        }
      },
      include: { guru: true }
    });
    gurus.push(user);
  }
  console.log(`✅ Created ${gurus.length} gurus\n`);

  // ==================== CREATE SISWAS ====================
  console.log('👨‍🎓 Creating siswas...');
  const siswaData = [];
  const jurusans = ['IPA', 'IPS', 'Bahasa'];
  const tingkats = ['X', 'XI', 'XII'];
  const namaDepan = ['Ahmad', 'Budi', 'Citra', 'Dian', 'Eko', 'Fitri', 'Gita', 'Hendra', 'Indah', 'Joko'];
  const namaBelakang = ['Pratama', 'Wijaya', 'Kusuma', 'Santoso', 'Putra', 'Putri', 'Saputra', 'Dewi', 'Nugroho', 'Permata'];

  let siswaCount = 1;
  for (const tingkat of tingkats) {
    for (const jurusan of jurusans) {
      for (let i = 1; i <= 10; i++) { // 10 siswa per kelas
        const depan = namaDepan[Math.floor(Math.random() * namaDepan.length)];
        const belakang = namaBelakang[Math.floor(Math.random() * namaBelakang.length)];
        const kelasNumber = Math.ceil(i / 5); // 2 kelas per jurusan
        
        siswaData.push({
          username: `siswa${siswaCount}`,
          nama: `${depan} ${belakang}`,
          kelas: `${tingkat}-${kelasNumber}`,
          tingkat: tingkat,
          jurusan: jurusan
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
        siswa: {
          create: {
            nama_lengkap: siswa.nama,
            kelas: siswa.kelas,
            tingkat: siswa.tingkat,
            jurusan: siswa.jurusan
          }
        }
      },
      include: { siswa: true }
    });
    siswas.push(user);
  }
  console.log(`✅ Created ${siswas.length} siswas\n`);

  // ==================== CREATE SOALS ====================
  console.log('📝 Creating soals...');
  const mataPelajaranData = {
    'Matematika': { guru: gurus[0].guru.guru_id, tingkats: ['X', 'XI', 'XII'], jurusans: ['IPA', 'IPS'] },
    'Fisika': { guru: gurus[1].guru.guru_id, tingkats: ['X', 'XI', 'XII'], jurusans: ['IPA'] },
    'Kimia': { guru: gurus[2].guru.guru_id, tingkats: ['X', 'XI', 'XII'], jurusans: ['IPA'] },
    'Biologi': { guru: gurus[3].guru.guru_id, tingkats: ['X', 'XI', 'XII'], jurusans: ['IPA'] },
    'Bahasa Indonesia': { guru: gurus[4].guru.guru_id, tingkats: ['X', 'XI', 'XII'], jurusans: ['IPA', 'IPS', 'Bahasa'] }
  };

  const soalTemplates = {
    'Matematika': [
      { teks: 'Berapa hasil dari 2 + 2?', opsi: ['2', '3', '4', '5', '6'], benar: 2 },
      { teks: 'Tentukan turunan dari f(x) = 3x² + 2x - 1', opsi: ['6x + 2', '6x - 2', '3x + 2', '6x + 1', '3x - 1'], benar: 0 },
      { teks: 'Nilai dari sin 90° adalah...', opsi: ['0', '0.5', '1', '√2/2', '√3/2'], benar: 2 },
      { teks: 'Tentukan integral dari ∫2x dx', opsi: ['x² + C', '2x² + C', 'x + C', 'x²/2 + C', '2x + C'], benar: 0 },
      { teks: 'Jika a = 5 dan b = 3, berapa nilai dari a² - b²?', opsi: ['8', '16', '25', '34', '64'], benar: 1 }
    ],
    'Fisika': [
      { teks: 'Satuan SI untuk gaya adalah...', opsi: ['Joule', 'Newton', 'Watt', 'Pascal', 'Kelvin'], benar: 1 },
      { teks: 'Kecepatan cahaya di ruang hampa adalah...', opsi: ['3 × 10⁶ m/s', '3 × 10⁷ m/s', '3 × 10⁸ m/s', '3 × 10⁹ m/s', '3 × 10¹⁰ m/s'], benar: 2 },
      { teks: 'Hukum Newton I menyatakan tentang...', opsi: ['Gaya dan percepatan', 'Inersia', 'Aksi-reaksi', 'Gravitasi', 'Momentum'], benar: 1 },
      { teks: 'Energi kinetik berbanding lurus dengan...', opsi: ['Massa saja', 'Kecepatan saja', 'Massa dan kecepatan', 'Massa dan kuadrat kecepatan', 'Kuadrat massa'], benar: 3 },
      { teks: 'Percepatan gravitasi bumi adalah...', opsi: ['8.9 m/s²', '9.8 m/s²', '10.8 m/s²', '11.8 m/s²', '12.8 m/s²'], benar: 1 }
    ],
    'Kimia': [
      { teks: 'Simbol kimia untuk air adalah...', opsi: ['H₂O', 'CO₂', 'O₂', 'H₂', 'NaCl'], benar: 0 },
      { teks: 'Jumlah proton dalam atom disebut...', opsi: ['Nomor massa', 'Nomor atom', 'Isotop', 'Ion', 'Elektron'], benar: 1 },
      { teks: 'pH air murni adalah...', opsi: ['0', '1', '7', '10', '14'], benar: 2 },
      { teks: 'Unsur dengan nomor atom 6 adalah...', opsi: ['Oksigen', 'Nitrogen', 'Karbon', 'Hidrogen', 'Helium'], benar: 2 },
      { teks: 'Ikatan antara logam dan non-logam disebut...', opsi: ['Ikatan kovalen', 'Ikatan ionik', 'Ikatan hidrogen', 'Ikatan logam', 'Ikatan koordinasi'], benar: 1 }
    ],
    'Biologi': [
      { teks: 'Organel yang berfungsi sebagai pusat sel adalah...', opsi: ['Mitokondria', 'Ribosom', 'Nukleus', 'Lisosom', 'Golgi'], benar: 2 },
      { teks: 'Proses fotosintesis terjadi di...', opsi: ['Mitokondria', 'Kloroplas', 'Nukleus', 'Ribosom', 'Vakuola'], benar: 1 },
      { teks: 'DNA merupakan singkatan dari...', opsi: ['Deoxyribonucleic Acid', 'Diribonucleic Acid', 'Deoxyribose Acid', 'Dinucleic Acid', 'Deoxy Acid'], benar: 0 },
      { teks: 'Sistem peredaran darah manusia termasuk sistem...', opsi: ['Terbuka', 'Tertutup', 'Campuran', 'Tunggal', 'Ganda tertutup'], benar: 4 },
      { teks: 'Respirasi sel terjadi di...', opsi: ['Kloroplas', 'Nukleus', 'Mitokondria', 'Ribosom', 'Lisosom'], benar: 2 }
    ],
    'Bahasa Indonesia': [
      { teks: 'Kata baku dari "apotek" adalah...', opsi: ['Apotik', 'Apotek', 'Apothek', 'Apotex', 'Apotec'], benar: 0 },
      { teks: 'Kalimat yang mengandung subjek, predikat, dan objek disebut...', opsi: ['Kalimat tunggal', 'Kalimat majemuk', 'Kalimat lengkap', 'Kalimat inti', 'Kalimat sempurna'], benar: 2 },
      { teks: 'Majas yang membandingkan dua hal dengan kata "seperti" atau "bagai" adalah...', opsi: ['Metafora', 'Simile', 'Personifikasi', 'Hiperbola', 'Ironi'], benar: 1 },
      { teks: 'Unsur intrinsik cerpen meliputi, kecuali...', opsi: ['Tema', 'Tokoh', 'Alur', 'Biografi penulis', 'Latar'], benar: 3 },
      { teks: 'Imbuhan "ber-" termasuk jenis imbuhan...', opsi: ['Awalan', 'Akhiran', 'Sisipan', 'Gabungan', 'Partikel'], benar: 0 }
    ]
  };

  const soals = [];
  let soalCount = 0;

  for (const [mataPelajaran, config] of Object.entries(mataPelajaranData)) {
    const templates = soalTemplates[mataPelajaran] || [];
    
    for (const tingkat of config.tingkats) {
      for (const jurusan of config.jurusans) {
        // Create 15 Pilihan Ganda soal per combination
        for (let i = 0; i < 15; i++) {
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
                  label: String.fromCharCode(65 + idx), // A, B, C, D, E
                  teks_opsi: opsi,
                  is_benar: idx === template.benar
                }))
              }
            }
          });
          soals.push(soal);
          soalCount++;
        }

        // Create 5 Essay soal per combination
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
              updatedAt: new Date()
            }
          });
          soals.push(soal);
          soalCount++;
        }
      }
    }
  }
  console.log(`✅ Created ${soalCount} soals\n`);

  // ==================== CREATE UJIANS ====================
  console.log('📋 Creating ujians...');
  const ujianData = [
    { nama: 'Ujian Tengah Semester Matematika', mapel: 'Matematika', tingkat: 'X', jurusan: 'IPA', guru: gurus[0].guru.guru_id },
    { nama: 'Ujian Akhir Semester Matematika', mapel: 'Matematika', tingkat: 'XI', jurusan: 'IPA', guru: gurus[0].guru.guru_id },
    { nama: 'Ujian Tengah Semester Fisika', mapel: 'Fisika', tingkat: 'X', jurusan: 'IPA', guru: gurus[1].guru.guru_id },
    { nama: 'Ujian Akhir Semester Fisika', mapel: 'Fisika', tingkat: 'XI', jurusan: 'IPA', guru: gurus[1].guru.guru_id },
    { nama: 'Ujian Tengah Semester Kimia', mapel: 'Kimia', tingkat: 'XII', jurusan: 'IPA', guru: gurus[2].guru.guru_id },
    { nama: 'Ujian Akhir Semester Biologi', mapel: 'Biologi', tingkat: 'X', jurusan: 'IPA', guru: gurus[3].guru.guru_id },
    { nama: 'Ujian Bahasa Indonesia', mapel: 'Bahasa Indonesia', tingkat: 'XI', jurusan: 'IPA', guru: gurus[4].guru.guru_id },
    { nama: 'Ujian Bahasa Indonesia', mapel: 'Bahasa Indonesia', tingkat: 'XII', jurusan: 'Bahasa', guru: gurus[4].guru.guru_id }
  ];

  const ujians = [];
  const now = new Date();
  
  for (let i = 0; i < ujianData.length; i++) {
    const data = ujianData[i];
    const tanggalMulai = new Date(now);
    tanggalMulai.setDate(now.getDate() + i - 3); // Some past, some future
    tanggalMulai.setHours(8, 0, 0, 0);
    
    const tanggalSelesai = new Date(tanggalMulai);
    tanggalSelesai.setHours(10, 0, 0, 0);

    const ujian = await prisma.ujians.create({
      data: {
        nama_ujian: data.nama,
        mata_pelajaran: data.mapel,
        tingkat: data.tingkat,
        jurusan: data.jurusan,
        tanggal_mulai: tanggalMulai,
        tanggal_selesai: tanggalSelesai,
        durasi_menit: 90,
        is_acak_soal: i % 2 === 0, // Alternate random/sequential
        guru_id: data.guru,
        updatedAt: new Date()
      }
    });
    ujians.push(ujian);
  }
  console.log(`✅ Created ${ujians.length} ujians\n`);

  // ==================== ASSIGN SOALS TO UJIANS ====================
  console.log('🔗 Assigning soals to ujians...');
  let soalUjianCount = 0;
  
  for (const ujian of ujians) {
    // Find matching soals
    const matchingSoals = soals.filter(s => 
      s.mata_pelajaran === ujian.mata_pelajaran &&
      s.tingkat === ujian.tingkat &&
      s.jurusan === ujian.jurusan
    );

    // Assign 10 PG and 3 Essay soals to each ujian
    const pgSoals = matchingSoals.filter(s => s.tipe_soal === 'PILIHAN_GANDA_SINGLE').slice(0, 10);
    const essaySoals = matchingSoals.filter(s => s.tipe_soal === 'ESSAY').slice(0, 3);
    const selectedSoals = [...pgSoals, ...essaySoals];

    for (let i = 0; i < selectedSoals.length; i++) {
      await prisma.soal_ujians.create({
        data: {
          ujian_id: ujian.ujian_id,
          soal_id: selectedSoals[i].soal_id,
          bobot_nilai: selectedSoals[i].tipe_soal === 'ESSAY' ? 20 : 10,
          urutan: i + 1
        }
      });
      soalUjianCount++;
    }
  }
  console.log(`✅ Created ${soalUjianCount} soal-ujian assignments\n`);

  // ==================== ASSIGN SISWAS TO UJIANS ====================
  console.log('👥 Assigning siswas to ujians...');
  let pesertaUjianCount = 0;

  for (const ujian of ujians) {
    // Find matching students
    const matchingSiswas = siswas.filter(s => 
      s.siswa.tingkat === ujian.tingkat &&
      s.siswa.jurusan === ujian.jurusan
    );

    for (const siswa of matchingSiswas) {
      await prisma.peserta_ujians.create({
        data: {
          ujian_id: ujian.ujian_id,
          siswa_id: siswa.siswa.siswa_id,
          status_ujian: 'BELUM_MULAI'
        }
      });
      pesertaUjianCount++;
    }
  }
  console.log(`✅ Created ${pesertaUjianCount} peserta-ujian assignments\n`);

  // ==================== CREATE SAMPLE COMPLETED UJIAN ====================
  console.log('✍️ Creating sample completed ujian with answers...');
  
  // Get first ujian and its participants
  const firstUjian = ujians[0];
  const pesertaUjians = await prisma.peserta_ujians.findMany({
    where: { ujian_id: firstUjian.ujian_id },
    take: 5 // Complete ujian for 5 students
  });

  const soalUjians = await prisma.soal_ujians.findMany({
    where: { ujian_id: firstUjian.ujian_id },
    include: {
      soals: {
        include: {
          opsi_jawabans: true
        }
      }
    }
  });

  let jawabanCount = 0;
  let hasilCount = 0;

  for (const peserta of pesertaUjians) {
    // Update status to completed
    const waktuMulai = new Date(firstUjian.tanggal_mulai);
    waktuMulai.setMinutes(waktuMulai.getMinutes() + Math.floor(Math.random() * 15));
    
    const waktuSelesai = new Date(waktuMulai);
    waktuSelesai.setMinutes(waktuSelesai.getMinutes() + 60 + Math.floor(Math.random() * 20));

    await prisma.peserta_ujians.update({
      where: { peserta_ujian_id: peserta.peserta_ujian_id },
      data: {
        status_ujian: 'DINILAI',
        waktu_mulai: waktuMulai,
        waktu_selesai: waktuSelesai
      }
    });

    let totalNilai = 0;
    let totalBobot = 0;

    // Create answers for each soal
    for (const soalUjian of soalUjians) {
      totalBobot += soalUjian.bobot_nilai;

      if (soalUjian.soals.tipe_soal === 'PILIHAN_GANDA_SINGLE') {
        // Random correct/incorrect answer (80% correct rate)
        const isCorrect = Math.random() > 0.2;
        const correctOpsi = soalUjian.soals.opsi_jawabans.find(o => o.is_benar);
        const incorrectOpsi = soalUjian.soals.opsi_jawabans.find(o => !o.is_benar);
        const selectedOpsi = isCorrect ? correctOpsi : incorrectOpsi;

        await prisma.jawabans.create({
          data: {
            peserta_ujian_id: peserta.peserta_ujian_id,
            soal_id: soalUjian.soal_id,
            jawaban_pg_opsi_ids: JSON.stringify([selectedOpsi.opsi_id.toString()]),
            is_correct: isCorrect
          }
        });

        if (isCorrect) {
          totalNilai += soalUjian.bobot_nilai;
        }
        jawabanCount++;
      } else if (soalUjian.soals.tipe_soal === 'ESSAY') {
        // Random essay score (70-95)
        const nilaiManual = 70 + Math.floor(Math.random() * 26);
        const nilaiDidapat = (nilaiManual / 100) * soalUjian.bobot_nilai;

        await prisma.jawabans.create({
          data: {
            peserta_ujian_id: peserta.peserta_ujian_id,
            soal_id: soalUjian.soal_id,
            jawaban_essay_text: 'Ini adalah contoh jawaban essay dari siswa. Jawaban ini berisi penjelasan detail mengenai topik yang ditanyakan dengan analisis yang mendalam.',
            nilai_manual: nilaiManual
          }
        });

        totalNilai += nilaiDidapat;
        jawabanCount++;
      }
    }

    // Create hasil_ujian
    const nilaiAkhir = (totalNilai / totalBobot) * 100;
    await prisma.hasil_ujians.create({
      data: {
        peserta_ujian_id: peserta.peserta_ujian_id,
        nilai_akhir: Math.round(nilaiAkhir * 100) / 100,
        tanggal_submit: waktuSelesai
      }
    });
    hasilCount++;
  }
  console.log(`✅ Created ${jawabanCount} jawabans`);
  console.log(`✅ Created ${hasilCount} hasil ujians\n`);

  // ==================== CREATE ACTIVITY LOGS ====================
  console.log('📊 Creating activity logs...');
  
  const activityTypes = [
    { type: 'LOGIN', description: 'User berhasil login ke sistem' },
    { type: 'START_UJIAN', description: 'Siswa memulai mengerjakan ujian' },
    { type: 'FINISH_UJIAN', description: 'Siswa menyelesaikan ujian' },
    { type: 'AUTO_FINISH_UJIAN', description: 'Ujian diselesaikan otomatis karena waktu habis' }
  ];

  let logCount = 0;
  
  // Create login logs for all users
  for (const user of [...siswas.slice(0, 20), ...gurus.slice(0, 3), admin1]) {
    await prisma.activityLog.create({
      data: {
        user_id: user.id,
        activity_type: 'LOGIN',
        description: `User ${user.username} berhasil login`,
        ip_address: `192.168.1.${Math.floor(Math.random() * 254) + 1}`,
        user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        metadata: JSON.stringify({
          username: user.username,
          role: user.role,
          login_time: new Date().toISOString()
        })
      }
    });
    logCount++;
  }

  // Create ujian activity logs for completed peserta_ujians
  for (const peserta of pesertaUjians) {
    const siswa = siswas.find(s => s.siswa.siswa_id === peserta.siswa_id);
    
    // START_UJIAN log
    await prisma.activityLog.create({
      data: {
        user_id: siswa.id,
        peserta_ujian_id: peserta.peserta_ujian_id,
        activity_type: 'START_UJIAN',
        description: `Siswa ${siswa.siswa.nama_lengkap} memulai ujian ${firstUjian.nama_ujian}`,
        ip_address: `192.168.1.${Math.floor(Math.random() * 254) + 1}`,
        user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        metadata: JSON.stringify({
          ujian_id: firstUjian.ujian_id,
          nama_ujian: firstUjian.nama_ujian,
          total_soal: soalUjians.length
        }),
        created_at: await prisma.peserta_ujians.findUnique({
          where: { peserta_ujian_id: peserta.peserta_ujian_id },
          select: { waktu_mulai: true }
        }).then(p => p.waktu_mulai)
      }
    });
    logCount++;

    // FINISH_UJIAN log
    await prisma.activityLog.create({
      data: {
        user_id: siswa.id,
        peserta_ujian_id: peserta.peserta_ujian_id,
        activity_type: 'FINISH_UJIAN',
        description: `Siswa ${siswa.siswa.nama_lengkap} menyelesaikan ujian ${firstUjian.nama_ujian}`,
        ip_address: `192.168.1.${Math.floor(Math.random() * 254) + 1}`,
        user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        metadata: JSON.stringify({
          ujian_id: firstUjian.ujian_id,
          nama_ujian: firstUjian.nama_ujian,
          total_soal: soalUjians.length,
          soal_terjawab: soalUjians.length
        }),
        created_at: await prisma.peserta_ujians.findUnique({
          where: { peserta_ujian_id: peserta.peserta_ujian_id },
          select: { waktu_selesai: true }
        }).then(p => p.waktu_selesai)
      }
    });
    logCount++;
  }

  console.log(`✅ Created ${logCount} activity logs\n`);

  // ==================== SUMMARY ====================
  console.log('📊 =============== SEEDING SUMMARY ===============');
  console.log(`✅ Admins: 2`);
  console.log(`✅ Gurus: ${gurus.length}`);
  console.log(`✅ Siswas: ${siswas.length}`);
  console.log(`✅ Soals: ${soalCount}`);
  console.log(`✅ Ujians: ${ujians.length}`);
  console.log(`✅ Soal-Ujian Assignments: ${soalUjianCount}`);
  console.log(`✅ Peserta-Ujian Assignments: ${pesertaUjianCount}`);
  console.log(`✅ Jawabans: ${jawabanCount}`);
  console.log(`✅ Hasil Ujians: ${hasilCount}`);
  console.log(`✅ Activity Logs: ${logCount}`);
  console.log('================================================\n');

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
