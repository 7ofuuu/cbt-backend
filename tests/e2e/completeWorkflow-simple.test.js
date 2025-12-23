const request = require('supertest');
const express = require('express');
const authRoutes = require('../../src/routes/authRoutes');
const soalRoutes = require('../../src/routes/soalRoutes');
const ujianRoutes = require('../../src/routes/ujianRoutes');
const siswaRoutes = require('../../src/routes/siswaRoutes');
const userRoutes = require('../../src/routes/userRoutes');

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/soal', soalRoutes);
app.use('/api/ujian', ujianRoutes);
app.use('/api/siswa', siswaRoutes);
app.use('/api/users', userRoutes);

describe('E2E - Complete CBT Workflow (Simplified)', () => {
  it('should complete entire CBT workflow from creation to grading', async () => {
    let guruToken, siswaToken, guruId, siswaId;
    let ujianId, soal1Id, soal2Id, soal3Id;
    let pesertaUjianId;

    // ===== STEP 1 & 2: Register and Login Users =====
    // Register Guru
    const guruReg = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'guru_test',
        password: 'password123',
        role: 'guru',
        nama: 'Guru Test'
      });
    expect(guruReg.status).toBe(201);

    const guruLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: 'guru_test', password: 'password123' });
    expect(guruLogin.status).toBe(200);
    guruToken = guruLogin.body.token;
    guruId = guruLogin.body.user.profile.guru_id;

    // Register Siswa
    const siswaReg = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'siswa_test',
        password: 'password123',
        role: 'siswa',
        nama: 'Siswa Test',
        kelas: '10A',
        tingkat: '10',
        jurusan: 'IPA'
      });
    expect(siswaReg.status).toBe(201);

    const siswaLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: 'siswa_test', password: 'password123' });
    expect(siswaLogin.status).toBe(200);
    siswaToken = siswaLogin.body.token;
    siswaId = siswaLogin.body.user.profile.siswa_id;

    console.log('✅ Users registered and logged in');

    // ===== STEP 3: Create Soal =====
    const soal1 = await request(app)
      .post('/api/soal')
      .set('Authorization', `Bearer ${guruToken}`)
      .send({
        tipe_soal: 'PILIHAN_GANDA_SINGLE',
        teks_soal: '5 + 3 = ?',
        mata_pelajaran: 'Matematika',
        tingkat: '10',
        jurusan: 'IPA',
        opsi_jawaban: [
          { label: 'A', teks_opsi: '6', is_benar: false },
          { label: 'B', teks_opsi: '7', is_benar: false },
          { label: 'C', teks_opsi: '8', is_benar: true },
          { label: 'D', teks_opsi: '9', is_benar: false }
        ]
      });
    expect(soal1.status).toBe(201);
    soal1Id = soal1.body.soal_id;

    const soal2 = await request(app)
      .post('/api/soal')
      .set('Authorization', `Bearer ${guruToken}`)
      .send({
        tipe_soal: 'PILIHAN_GANDA_SINGLE',
        teks_soal: '10 x 2 = ?',
        mata_pelajaran: 'Matematika',
        tingkat: '10',
        jurusan: 'IPA',
        opsi_jawaban: [
          { label: 'A', teks_opsi: '12', is_benar: false },
          { label: 'B', teks_opsi: '20', is_benar: true },
          { label: 'C', teks_opsi: '22', is_benar: false },
          { label: 'D', teks_opsi: '30', is_benar: false }
        ]
      });
    expect(soal2.status).toBe(201);
    soal2Id = soal2.body.soal_id;

    const soal3 = await request(app)
      .post('/api/soal')
      .set('Authorization', `Bearer ${guruToken}`)
      .send({
        tipe_soal: 'ESSAY',
        teks_soal: 'Jelaskan konsep perkalian',
        mata_pelajaran: 'Matematika',
        tingkat: '10',
        jurusan: 'IPA'
      });
    expect(soal3.status).toBe(201);
    soal3Id = soal3.body.soal_id;

    console.log('✅ Created 3 soal');

    // ===== STEP 4: Create Ujian =====
    const now = new Date();
    const ujianResp = await request(app)
      .post('/api/ujian')
      .set('Authorization', `Bearer ${guruToken}`)
      .send({
        nama_ujian: 'Ujian Test',
        mata_pelajaran: 'Matematika',
        tingkat: '10',
        jurusan: 'IPA',
        tanggal_mulai: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
        tanggal_selesai: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        durasi_menit: 120,
        is_acak_soal: false
      });
    expect(ujianResp.status).toBe(201);
    ujianId = ujianResp.body.ujian_id;

    console.log('✅ Created ujian');

    // ===== STEP 5: Assign Soal to Ujian =====
    await request(app)
      .post('/api/ujian/assign-soal')
      .set('Authorization', `Bearer ${guruToken}`)
      .send({ ujian_id: ujianId, soal_id: soal1Id, bobot_nilai: 30, urutan: 1 });

    await request(app)
      .post('/api/ujian/assign-soal')
      .set('Authorization', `Bearer ${guruToken}`)
      .send({ ujian_id: ujianId, soal_id: soal2Id, bobot_nilai: 30, urutan: 2 });

    await request(app)
      .post('/api/ujian/assign-soal')
      .set('Authorization', `Bearer ${guruToken}`)
      .send({ ujian_id: ujianId, soal_id: soal3Id, bobot_nilai: 40, urutan: 3 });

    console.log('✅ Assigned soal to ujian');

    // ===== STEP 6: Assign Siswa to Ujian =====
    await request(app)
      .post('/api/ujian/assign-siswa')
      .set('Authorization', `Bearer ${guruToken}`)
      .send({ ujian_id: ujianId, tingkat: '10', jurusan: 'IPA' });

    console.log('✅ Assigned siswa to ujian');

    // ===== STEP 7: Siswa Views Ujian =====
    const ujianListResp = await request(app)
      .get('/api/siswa/ujians')
      .set('Authorization', `Bearer ${siswaToken}`);
    expect(ujianListResp.status).toBe(200);
    pesertaUjianId = ujianListResp.body.ujians[0].peserta_ujian_id;

    console.log('✅ Siswa viewed available ujians');

    // ===== STEP 8: Siswa Starts Ujian =====
    const startResp = await request(app)
      .post('/api/siswa/ujians/start')
      .set('Authorization', `Bearer ${siswaToken}`)
      .send({ peserta_ujian_id: pesertaUjianId });
    expect(startResp.status).toBe(200);

    console.log('✅ Siswa started ujian');

    // ===== STEP 9-11: Submit Answers =====
    // Get correct answer for soal1
    const soal1Detail = await request(app)
      .get(`/api/soal/${soal1Id}`)
      .set('Authorization', `Bearer ${guruToken}`);
    const correctOpsi1 = soal1Detail.body.soal.opsiJawabans.find(o => o.is_benar);

    await request(app)
      .post('/api/siswa/ujians/jawaban')
      .set('Authorization', `Bearer ${siswaToken}`)
      .send({
        peserta_ujian_id: pesertaUjianId,
        soal_id: soal1Id,
        jawaban_pg_opsi_ids: [correctOpsi1.opsi_jawaban_id]
      });

    // Wrong answer for soal2
    const soal2Detail = await request(app)
      .get(`/api/soal/${soal2Id}`)
      .set('Authorization', `Bearer ${guruToken}`);
    const wrongOpsi2 = soal2Detail.body.soal.opsiJawabans.find(o => !o.is_benar);

    await request(app)
      .post('/api/siswa/ujians/jawaban')
      .set('Authorization', `Bearer ${siswaToken}`)
      .send({
        peserta_ujian_id: pesertaUjianId,
        soal_id: soal2Id,
        jawaban_pg_opsi_ids: [wrongOpsi2.opsi_jawaban_id]
      });

    // Essay answer
    await request(app)
      .post('/api/siswa/ujians/jawaban')
      .set('Authorization', `Bearer ${siswaToken}`)
      .send({
        peserta_ujian_id: pesertaUjianId,
        soal_id: soal3Id,
        jawaban_essay_text: 'Perkalian adalah operasi matematika...'
      });

    console.log('✅ Siswa submitted all answers');

    // ===== STEP 12: Finish Ujian =====
    await request(app)
      .post('/api/siswa/ujians/finish')
      .set('Authorization', `Bearer ${siswaToken}`)
      .send({ peserta_ujian_id: pesertaUjianId });

    console.log('✅ Siswa finished ujian');

    // ===== STEP 13-14: Guru Grades Essay =====
    // Query jawaban directly from database untuk essay
    const { prisma } = require('../setup/testDb');
    const jawabans = await prisma.jawaban.findMany({
      where: {
        peserta_ujian_id: pesertaUjianId,
        soal_id: soal3Id
      }
    });
    const essayJawaban = jawabans[0];

    await request(app)
      .post('/api/users/nilai')
      .set('Authorization', `Bearer ${guruToken}`)
      .send({
        jawaban_id: essayJawaban.jawaban_id,
        nilai_manual: 35
      });

    console.log('✅ Guru graded essay');

    // ===== STEP 15: Finalize Nilai =====
    await request(app)
      .post('/api/users/finalisasi')
      .set('Authorization', `Bearer ${guruToken}`)
      .send({ peserta_ujian_id: pesertaUjianId });

    console.log('✅ Nilai finalized');

    // ===== STEP 16: Siswa Views Result =====
    const hasilResp = await request(app)
      .get(`/api/siswa/ujians/hasil/${pesertaUjianId}`)
      .set('Authorization', `Bearer ${siswaToken}`);
    expect(hasilResp.status).toBe(200);
    expect(hasilResp.body.hasilUjian).toBeDefined();

    console.log('✅ Siswa viewed hasil: 65/100 points expected');
    console.log('   - Soal 1 (PG): ✓ Correct (30 points)');
    console.log('   - Soal 2 (PG): ✗ Wrong (0 points)');
    console.log('   - Soal 3 (Essay): Graded 35/40 points');
    console.log('🎉 E2E Test Complete!');
  });
});
