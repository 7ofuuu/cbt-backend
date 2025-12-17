const request = require('supertest');
const express = require('express');
const siswaRoutes = require('../../src/routes/siswaRoutes');
const ujianRoutes = require('../../src/routes/ujianRoutes');
const soalRoutes = require('../../src/routes/soalRoutes');
const { createGuru, createSiswa, createSoal, createUjian, assignSoalToUjian, assignSiswaToUjian } = require('../setup/testHelpers');
const { prisma } = require('../setup/testDb');

const app = express();
app.use(express.json());
app.use('/api/siswa', siswaRoutes);
app.use('/api/ujian', ujianRoutes);
app.use('/api/soal', soalRoutes);

describe('Siswa Endpoints Integration Tests', () => {
  let guruToken, guruId, siswaToken, siswaId;

  beforeEach(async () => {
    const guru = await createGuru();
    const siswa = await createSiswa();
    
    guruToken = guru.token;
    guruId = guru.user.guru.guru_id;
    siswaToken = siswa.token;
    siswaId = siswa.user.siswa.siswa_id;
  });

  describe('GET /api/siswa/ujians - Get My Ujians', () => {
    beforeEach(async () => {
      // Create ujian and assign siswa
      const ujian = await createUjian(guruId, {
        nama_ujian: 'Ujian Matematika',
        tingkat: '10',
        jurusan: 'IPA'
      });
      await assignSiswaToUjian(ujian.ujian_id, siswaId);
    });

    it('should get list of ujians for siswa', async () => {
      const response = await request(app)
        .get('/api/siswa/ujians')
        .set('Authorization', `Bearer ${siswaToken}`);

      expect(response.status).toBe(200);
      expect(response.body.ujians).toBeDefined();
      expect(response.body.ujians.length).toBeGreaterThan(0);
      expect(response.body.ujians[0].ujian).toBeDefined();
      expect(response.body.ujians[0].status_ujian).toBe('BELUM_MULAI');
    });

    it('should reject request from guru', async () => {
      const response = await request(app)
        .get('/api/siswa/ujians')
        .set('Authorization', `Bearer ${guruToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/siswa/ujians/start - Start Ujian', () => {
    let pesertaUjianId;

    beforeEach(async () => {
      const ujian = await createUjian(guruId, {
        tanggal_mulai: new Date(Date.now() - 60 * 60 * 1000), // 1 jam lalu
        tanggal_selesai: new Date(Date.now() + 60 * 60 * 1000) // 1 jam kedepan
      });
      const peserta = await assignSiswaToUjian(ujian.ujian_id, siswaId);
      pesertaUjianId = peserta.peserta_ujian_id;
    });

    it('should start ujian successfully', async () => {
      const response = await request(app)
        .post('/api/siswa/ujians/start')
        .set('Authorization', `Bearer ${siswaToken}`)
        .send({
          peserta_ujian_id: pesertaUjianId
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('Ujian dimulai');
      expect(response.body.pesertaUjian.status_ujian).toBe('SEDANG_DIKERJAKAN');
      expect(response.body.pesertaUjian.waktu_mulai).toBeDefined();
    });

    it('should reject starting already started ujian', async () => {
      // Start first time
      await request(app)
        .post('/api/siswa/ujians/start')
        .set('Authorization', `Bearer ${siswaToken}`)
        .send({
          peserta_ujian_id: pesertaUjianId
        });

      // Try to start again
      const response = await request(app)
        .post('/api/siswa/ujians/start')
        .set('Authorization', `Bearer ${siswaToken}`)
        .send({
          peserta_ujian_id: pesertaUjianId
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('sudah dimulai');
    });
  });

  describe('POST /api/siswa/ujians/jawaban - Submit Jawaban', () => {
    let pesertaUjianId, soalPG, soalEssay;

    beforeEach(async () => {
      const ujian = await createUjian(guruId);
      
      soalPG = await createSoal(guruId, {
        tipe_soal: 'PILIHAN_GANDA_SINGLE',
        opsi_jawaban: [
          { label: 'A', teks_opsi: 'Wrong', is_benar: false },
          { label: 'B', teks_opsi: 'Correct', is_benar: true },
          { label: 'C', teks_opsi: 'Wrong', is_benar: false }
        ]
      });
      
      soalEssay = await createSoal(guruId, {
        tipe_soal: 'ESSAY'
      });

      await assignSoalToUjian(ujian.ujian_id, soalPG.soal_id, 10, 1);
      await assignSoalToUjian(ujian.ujian_id, soalEssay.soal_id, 10, 2);

      const peserta = await assignSiswaToUjian(ujian.ujian_id, siswaId);
      pesertaUjianId = peserta.peserta_ujian_id;

      // Start ujian
      await prisma.pesertaUjian.update({
        where: { peserta_ujian_id: pesertaUjianId },
        data: {
          status_ujian: 'SEDANG_DIKERJAKAN',
          waktu_mulai: new Date()
        }
      });
    });

    it('should submit jawaban pilihan ganda successfully', async () => {
      const correctOpsiId = soalPG.opsiJawabans.find(o => o.is_benar).opsi_id;
      
      const response = await request(app)
        .post('/api/siswa/ujians/jawaban')
        .set('Authorization', `Bearer ${siswaToken}`)
        .send({
          peserta_ujian_id: pesertaUjianId,
          soal_id: soalPG.soal_id,
          jawaban_pg_opsi_ids: JSON.stringify([correctOpsiId])
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('berhasil disimpan');
      expect(response.body.jawaban.is_correct).toBe(true);
    });

    it('should submit jawaban essay successfully', async () => {
      const response = await request(app)
        .post('/api/siswa/ujians/jawaban')
        .set('Authorization', `Bearer ${siswaToken}`)
        .send({
          peserta_ujian_id: pesertaUjianId,
          soal_id: soalEssay.soal_id,
          jawaban_essay_text: 'This is my essay answer'
        });

      expect(response.status).toBe(200);
      expect(response.body.jawaban.jawaban_essay_text).toBe('This is my essay answer');
      expect(response.body.jawaban.is_correct).toBeNull(); // Essay need manual grading
    });

    it('should auto-grade correct pilihan ganda answer', async () => {
      const correctOpsiId = soalPG.opsiJawabans.find(o => o.is_benar).opsi_id;
      
      const response = await request(app)
        .post('/api/siswa/ujians/jawaban')
        .set('Authorization', `Bearer ${siswaToken}`)
        .send({
          peserta_ujian_id: pesertaUjianId,
          soal_id: soalPG.soal_id,
          jawaban_pg_opsi_ids: JSON.stringify([correctOpsiId])
        });

      expect(response.body.jawaban.is_correct).toBe(true);
    });

    it('should auto-grade wrong pilihan ganda answer', async () => {
      const wrongOpsiId = soalPG.opsiJawabans.find(o => !o.is_benar).opsi_id;
      
      const response = await request(app)
        .post('/api/siswa/ujians/jawaban')
        .set('Authorization', `Bearer ${siswaToken}`)
        .send({
          peserta_ujian_id: pesertaUjianId,
          soal_id: soalPG.soal_id,
          jawaban_pg_opsi_ids: JSON.stringify([wrongOpsiId])
        });

      expect(response.body.jawaban.is_correct).toBe(false);
    });
  });

  describe('POST /api/siswa/ujians/finish - Finish Ujian', () => {
    let pesertaUjianId;

    beforeEach(async () => {
      const ujian = await createUjian(guruId);
      const peserta = await assignSiswaToUjian(ujian.ujian_id, siswaId);
      pesertaUjianId = peserta.peserta_ujian_id;

      await prisma.pesertaUjian.update({
        where: { peserta_ujian_id: pesertaUjianId },
        data: {
          status_ujian: 'SEDANG_DIKERJAKAN',
          waktu_mulai: new Date()
        }
      });
    });

    it('should finish ujian successfully', async () => {
      const response = await request(app)
        .post('/api/siswa/ujians/finish')
        .set('Authorization', `Bearer ${siswaToken}`)
        .send({
          peserta_ujian_id: pesertaUjianId
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('selesai');
    });

    it('should reject finishing ujian that is not started', async () => {
      // Reset to belum mulai
      await prisma.pesertaUjian.update({
        where: { peserta_ujian_id: pesertaUjianId },
        data: {
          status_ujian: 'BELUM_MULAI',
          waktu_mulai: null
        }
      });

      const response = await request(app)
        .post('/api/siswa/ujians/finish')
        .set('Authorization', `Bearer ${siswaToken}`)
        .send({
          peserta_ujian_id: pesertaUjianId
        });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/siswa/ujians/hasil/:peserta_ujian_id - Get Hasil Ujian', () => {
    let pesertaUjianId;

    beforeEach(async () => {
      const ujian = await createUjian(guruId);
      const peserta = await assignSiswaToUjian(ujian.ujian_id, siswaId);
      pesertaUjianId = peserta.peserta_ujian_id;

      // Create hasil ujian
      await prisma.hasilUjian.create({
        data: {
          peserta_ujian_id: pesertaUjianId,
          nilai_akhir: 85.5
        }
      });

      await prisma.pesertaUjian.update({
        where: { peserta_ujian_id: pesertaUjianId },
        data: { status_ujian: 'DINILAI' }
      });
    });

    it('should get hasil ujian successfully', async () => {
      const response = await request(app)
        .get(`/api/siswa/ujians/hasil/${pesertaUjianId}`)
        .set('Authorization', `Bearer ${siswaToken}`);

      expect(response.status).toBe(200);
      expect(response.body.hasilUjian).toBeDefined();
      expect(response.body.hasilUjian.nilai_akhir).toBe(85.5);
    });

    it('should return 404 if hasil not found', async () => {
      // Delete hasil
      await prisma.hasilUjian.delete({
        where: { peserta_ujian_id: pesertaUjianId }
      });

      const response = await request(app)
        .get(`/api/siswa/ujians/hasil/${pesertaUjianId}`)
        .set('Authorization', `Bearer ${siswaToken}`);

      expect(response.status).toBe(404);
    });
  });
});
