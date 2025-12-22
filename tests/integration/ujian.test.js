const request = require('supertest');
const express = require('express');
const ujianRoutes = require('../../src/routes/ujianRoutes');
const soalRoutes = require('../../src/routes/soalRoutes');
const { createGuru, createSiswa } = require('../setup/testHelpers');
const { prisma } = require('../setup/testDb');

const app = express();
app.use(express.json());
app.use('/api/ujian', ujianRoutes);
app.use('/api/soal', soalRoutes);

describe('Ujian Endpoints Integration Tests', () => {
  let guruToken, guruId, siswaToken, siswaId;

  beforeEach(async () => {
    const guru = await createGuru();
    const siswa = await createSiswa();
    
    guruToken = guru.token;
    guruId = guru.user.guru.guru_id;
    siswaToken = siswa.token;
    siswaId = siswa.user.siswa.siswa_id;
  });

  describe('POST /api/ujian - Create Ujian', () => {
    it('should create ujian successfully', async () => {
      const now = new Date();
      const response = await request(app)
        .post('/api/ujian')
        .set('Authorization', `Bearer ${guruToken}`)
        .send({
          nama_ujian: 'Ujian Tengah Semester Matematika',
          mata_pelajaran: 'Matematika',
          tingkat: '10',
          jurusan: 'IPA',
          tanggal_mulai: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
          tanggal_selesai: new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString(),
          durasi_menit: 120,
          is_acak_soal: true
        });

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('Ujian berhasil dibuat');
      expect(response.body.ujian_id).toBeDefined();
    });

    it('should reject ujian creation from siswa', async () => {
      const response = await request(app)
        .post('/api/ujian')
        .set('Authorization', `Bearer ${siswaToken}`)
        .send({
          nama_ujian: 'Test',
          mata_pelajaran: 'Matematika',
          tingkat: '10',
          tanggal_mulai: new Date().toISOString(),
          tanggal_selesai: new Date().toISOString(),
          durasi_menit: 120
        });

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/ujian - Get All Ujian', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/ujian')
        .set('Authorization', `Bearer ${guruToken}`)
        .send({
          nama_ujian: 'Ujian 1',
          mata_pelajaran: 'Matematika',
          tingkat: '10',
          jurusan: 'IPA',
          tanggal_mulai: new Date().toISOString(),
          tanggal_selesai: new Date().toISOString(),
          durasi_menit: 120
        });

      await request(app)
        .post('/api/ujian')
        .set('Authorization', `Bearer ${guruToken}`)
        .send({
          nama_ujian: 'Ujian 2',
          mata_pelajaran: 'Fisika',
          tingkat: '11',
          jurusan: 'IPS',
          tanggal_mulai: new Date().toISOString(),
          tanggal_selesai: new Date().toISOString(),
          durasi_menit: 90
        });
    });

    it('should get all ujians', async () => {
      const response = await request(app)
        .get('/api/ujian')
        .set('Authorization', `Bearer ${guruToken}`);

      expect(response.status).toBe(200);
      expect(response.body.ujians).toHaveLength(2);
    });
  });

  describe('GET /api/ujian/:id - Get Ujian by ID', () => {
    let ujianId;

    beforeEach(async () => {
      const createResponse = await request(app)
        .post('/api/ujian')
        .set('Authorization', `Bearer ${guruToken}`)
        .send({
          nama_ujian: 'Test Ujian',
          mata_pelajaran: 'Matematika',
          tingkat: '10',
          tanggal_mulai: new Date().toISOString(),
          tanggal_selesai: new Date().toISOString(),
          durasi_menit: 120
        });
      ujianId = createResponse.body.ujian_id;
    });

    it('should get ujian by id with related data', async () => {
      const response = await request(app)
        .get(`/api/ujian/${ujianId}`)
        .set('Authorization', `Bearer ${guruToken}`);

      expect(response.status).toBe(200);
      expect(response.body.ujian).toBeDefined();
      expect(response.body.ujian.ujian_id).toBe(ujianId);
    });

    it('should return 404 for non-existent ujian', async () => {
      const response = await request(app)
        .get('/api/ujian/99999')
        .set('Authorization', `Bearer ${guruToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('PUT /api/ujian/:id - Update Ujian', () => {
    let ujianId;

    beforeEach(async () => {
      const createResponse = await request(app)
        .post('/api/ujian')
        .set('Authorization', `Bearer ${guruToken}`)
        .send({
          nama_ujian: 'Original Name',
          mata_pelajaran: 'Matematika',
          tingkat: '10',
          tanggal_mulai: new Date().toISOString(),
          tanggal_selesai: new Date().toISOString(),
          durasi_menit: 120
        });
      ujianId = createResponse.body.ujian_id;
    });

    it('should update ujian successfully', async () => {
      const response = await request(app)
        .put(`/api/ujian/${ujianId}`)
        .set('Authorization', `Bearer ${guruToken}`)
        .send({
          nama_ujian: 'Updated Name',
          durasi_menit: 180
        });

      expect(response.status).toBe(200);
      expect(response.body.ujian.nama_ujian).toBe('Updated Name');
      expect(response.body.ujian.durasi_menit).toBe(180);
    });
  });

  describe('DELETE /api/ujian/:id - Delete Ujian', () => {
    let ujianId;

    beforeEach(async () => {
      const createResponse = await request(app)
        .post('/api/ujian')
        .set('Authorization', `Bearer ${guruToken}`)
        .send({
          nama_ujian: 'To be deleted',
          mata_pelajaran: 'Matematika',
          tingkat: '10',
          tanggal_mulai: new Date().toISOString(),
          tanggal_selesai: new Date().toISOString(),
          durasi_menit: 120
        });
      ujianId = createResponse.body.ujian_id;
    });

    it('should delete ujian successfully', async () => {
      const response = await request(app)
        .delete(`/api/ujian/${ujianId}`)
        .set('Authorization', `Bearer ${guruToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('berhasil dihapus');
    });
  });

  describe('POST /api/ujian/assign-soal - Assign Soal to Ujian', () => {
    let ujianId, soalId;

    beforeEach(async () => {
      const ujianResponse = await request(app)
        .post('/api/ujian')
        .set('Authorization', `Bearer ${guruToken}`)
        .send({
          nama_ujian: 'Test Ujian',
          mata_pelajaran: 'Matematika',
          tingkat: '10',
          tanggal_mulai: new Date().toISOString(),
          tanggal_selesai: new Date().toISOString(),
          durasi_menit: 120
        });
      ujianId = ujianResponse.body.ujian_id;

      const soalResponse = await request(app)
        .post('/api/soal')
        .set('Authorization', `Bearer ${guruToken}`)
        .send({
          tipe_soal: 'ESSAY',
          teks_soal: 'Test question',
          mata_pelajaran: 'Matematika',
          tingkat: '10'
        });
      soalId = soalResponse.body.soal_id;
    });

    it('should assign soal to ujian successfully', async () => {
      const response = await request(app)
        .post('/api/ujian/assign-soal')
        .set('Authorization', `Bearer ${guruToken}`)
        .send({
          ujian_id: ujianId,
          soal_id: soalId,
          bobot_nilai: 10,
          urutan: 1
        });

      expect(response.status).toBe(201);
      expect(response.body.message).toContain('berhasil ditambahkan');
      expect(response.body.soalUjian.ujian_id).toBe(ujianId);
      expect(response.body.soalUjian.soal_id).toBe(soalId);
      expect(response.body.soalUjian.bobot_nilai).toBe(10);
    });
  });

  describe('DELETE /api/ujian/remove-soal/:id - Remove Soal from Ujian', () => {
    let soalUjianId;

    beforeEach(async () => {
      const ujianResponse = await request(app)
        .post('/api/ujian')
        .set('Authorization', `Bearer ${guruToken}`)
        .send({
          nama_ujian: 'Test Ujian',
          mata_pelajaran: 'Matematika',
          tingkat: '10',
          tanggal_mulai: new Date().toISOString(),
          tanggal_selesai: new Date().toISOString(),
          durasi_menit: 120
        });

      const soalResponse = await request(app)
        .post('/api/soal')
        .set('Authorization', `Bearer ${guruToken}`)
        .send({
          tipe_soal: 'ESSAY',
          teks_soal: 'Test question',
          mata_pelajaran: 'Matematika',
          tingkat: '10'
        });

      const assignResponse = await request(app)
        .post('/api/ujian/assign-soal')
        .set('Authorization', `Bearer ${guruToken}`)
        .send({
          ujian_id: ujianResponse.body.ujian_id,
          soal_id: soalResponse.body.soal_id,
          bobot_nilai: 10,
          urutan: 1
        });
      soalUjianId = assignResponse.body.soalUjian.soal_ujian_id;
    });

    it('should remove soal from ujian successfully', async () => {
      const response = await request(app)
        .delete(`/api/ujian/remove-soal/${soalUjianId}`)
        .set('Authorization', `Bearer ${guruToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('berhasil dihapus');
    });
  });

  describe('POST /api/ujian/assign-siswa - Assign Siswa to Ujian', () => {
    let ujianId;

    beforeEach(async () => {
      const ujianResponse = await request(app)
        .post('/api/ujian')
        .set('Authorization', `Bearer ${guruToken}`)
        .send({
          nama_ujian: 'Test Ujian',
          mata_pelajaran: 'Matematika',
          tingkat: '10',
          jurusan: 'IPA',
          tanggal_mulai: new Date().toISOString(),
          tanggal_selesai: new Date().toISOString(),
          durasi_menit: 120
        });
      ujianId = ujianResponse.body.ujian_id;
    });

    it('should assign siswa to ujian by tingkat and jurusan', async () => {
      const response = await request(app)
        .post('/api/ujian/assign-siswa')
        .set('Authorization', `Bearer ${guruToken}`)
        .send({
          ujian_id: ujianId,
          tingkat: '10',
          jurusan: 'IPA'
        });

      expect(response.status).toBe(201);
      expect(response.body.message).toContain('siswa berhasil ditambahkan');
      expect(response.body.jumlah_siswa).toBeGreaterThanOrEqual(1);
    });
  });
});
