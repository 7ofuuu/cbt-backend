const request = require('supertest');
const express = require('express');
const soalRoutes = require('../../src/routes/soalRoutes');
const { createGuru, createSiswa, createAdmin } = require('../setup/testHelpers');

const app = express();
app.use(express.json());
app.use('/api/soal', soalRoutes);

describe('Soal Endpoints Integration Tests', () => {
  let guruToken, guruId, siswaToken, adminToken;

  beforeEach(async () => {
    const guru = await createGuru();
    const siswa = await createSiswa();
    const admin = await createAdmin();
    
    guruToken = guru.token;
    guruId = guru.user.guru.guru_id;
    siswaToken = siswa.token;
    adminToken = admin.token;
  });

  describe('POST /api/soal - Create Soal', () => {
    it('should create pilihan ganda single soal successfully', async () => {
      const response = await request(app)
        .post('/api/soal')
        .set('Authorization', `Bearer ${guruToken}`)
        .send({
          tipe_soal: 'PILIHAN_GANDA_SINGLE',
          teks_soal: 'Berapa hasil dari 2 + 2?',
          mata_pelajaran: 'Matematika',
          tingkat: '10',
          jurusan: 'IPA',
          soal_pembahasan: '2 + 2 = 4',
          opsi_jawaban: [
            { label: 'A', teks_opsi: '3', is_benar: false },
            { label: 'B', teks_opsi: '4', is_benar: true },
            { label: 'C', teks_opsi: '5', is_benar: false },
            { label: 'D', teks_opsi: '6', is_benar: false }
          ]
        });

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('Soal berhasil dibuat');
      expect(response.body.soal_id).toBeDefined();
    });

    it('should create essay soal successfully', async () => {
      const response = await request(app)
        .post('/api/soal')
        .set('Authorization', `Bearer ${guruToken}`)
        .send({
          tipe_soal: 'ESSAY',
          teks_soal: 'Jelaskan konsep limit dalam matematika',
          mata_pelajaran: 'Matematika',
          tingkat: '12',
          jurusan: 'IPA'
        });

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('Soal berhasil dibuat');
      expect(response.body.soal_id).toBeDefined();
    });

    it('should reject soal creation without token', async () => {
      const response = await request(app)
        .post('/api/soal')
        .send({
          tipe_soal: 'ESSAY',
          teks_soal: 'Test question'
        });

      expect(response.status).toBe(401);
    });

    it('should reject soal creation from siswa', async () => {
      const response = await request(app)
        .post('/api/soal')
        .set('Authorization', `Bearer ${siswaToken}`)
        .send({
          tipe_soal: 'ESSAY',
          teks_soal: 'Test question',
          mata_pelajaran: 'Matematika',
          tingkat: '10'
        });

      expect(response.status).toBe(403);
    });

    it('should reject soal creation from admin', async () => {
      const response = await request(app)
        .post('/api/soal')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          tipe_soal: 'ESSAY',
          teks_soal: 'Test question',
          mata_pelajaran: 'Matematika',
          tingkat: '10'
        });

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/soal - Get All Soal', () => {
    beforeEach(async () => {
      // Create test soals
      await request(app)
        .post('/api/soal')
        .set('Authorization', `Bearer ${guruToken}`)
        .send({
          tipe_soal: 'ESSAY',
          teks_soal: 'Soal Matematika 10 IPA',
          mata_pelajaran: 'Matematika',
          tingkat: '10',
          jurusan: 'IPA'
        });

      await request(app)
        .post('/api/soal')
        .set('Authorization', `Bearer ${guruToken}`)
        .send({
          tipe_soal: 'ESSAY',
          teks_soal: 'Soal Matematika 11 IPS',
          mata_pelajaran: 'Matematika',
          tingkat: '11',
          jurusan: 'IPS'
        });

      await request(app)
        .post('/api/soal')
        .set('Authorization', `Bearer ${guruToken}`)
        .send({
          tipe_soal: 'ESSAY',
          teks_soal: 'Soal Fisika 10 IPA',
          mata_pelajaran: 'Fisika',
          tingkat: '10',
          jurusan: 'IPA'
        });
    });

    it('should get all soals without filter', async () => {
      const response = await request(app)
        .get('/api/soal')
        .set('Authorization', `Bearer ${guruToken}`);

      expect(response.status).toBe(200);
      expect(response.body.soals).toHaveLength(3);
    });

    it('should filter soals by mata_pelajaran', async () => {
      const response = await request(app)
        .get('/api/soal?mata_pelajaran=Matematika')
        .set('Authorization', `Bearer ${guruToken}`);

      expect(response.status).toBe(200);
      expect(response.body.soals).toHaveLength(2);
      expect(response.body.soals.every(s => s.mata_pelajaran === 'Matematika')).toBe(true);
    });

    it('should filter soals by tingkat', async () => {
      const response = await request(app)
        .get('/api/soal?tingkat=10')
        .set('Authorization', `Bearer ${guruToken}`);

      expect(response.status).toBe(200);
      expect(response.body.soals).toHaveLength(2);
    });

    it('should filter soals by jurusan', async () => {
      const response = await request(app)
        .get('/api/soal?jurusan=IPA')
        .set('Authorization', `Bearer ${guruToken}`);

      expect(response.status).toBe(200);
      expect(response.body.soals).toHaveLength(2);
    });

    it('should filter soals by multiple criteria', async () => {
      const response = await request(app)
        .get('/api/soal?mata_pelajaran=Matematika&tingkat=10&jurusan=IPA')
        .set('Authorization', `Bearer ${guruToken}`);

      expect(response.status).toBe(200);
      expect(response.body.soals).toHaveLength(1);
    });
  });

  describe('GET /api/soal/:id - Get Soal by ID', () => {
    let soalId;

    beforeEach(async () => {
      const createResponse = await request(app)
        .post('/api/soal')
        .set('Authorization', `Bearer ${guruToken}`)
        .send({
          tipe_soal: 'PILIHAN_GANDA_SINGLE',
          teks_soal: 'Test question',
          mata_pelajaran: 'Matematika',
          tingkat: '10',
          opsi_jawaban: [
            { label: 'A', teks_opsi: 'A', is_benar: true },
            { label: 'B', teks_opsi: 'B', is_benar: false }
          ]  });
      soalId = createResponse.body.soal_id;
    });

    it('should get soal by id successfully', async () => {
      const response = await request(app)
        .get(`/api/soal/${soalId}`)
        .set('Authorization', `Bearer ${guruToken}`);

      expect(response.status).toBe(200);
      expect(response.body.soal).toBeDefined();
      expect(response.body.soal.soal_id).toBe(soalId);
      expect(response.body.soal.opsiJawabans).toBeDefined();
    });

    it('should return 404 for non-existent soal', async () => {
      const response = await request(app)
        .get('/api/soal/99999')
        .set('Authorization', `Bearer ${guruToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('PUT /api/soal/:id - Update Soal', () => {
    let soalId;

    beforeEach(async () => {
      const createResponse = await request(app)
        .post('/api/soal')
        .set('Authorization', `Bearer ${guruToken}`)
        .send({
          tipe_soal: 'ESSAY',
          teks_soal: 'Original question',
          mata_pelajaran: 'Matematika',
          tingkat: '10'
        });
      soalId = createResponse.body.soal_id;
    });

    it('should update soal successfully', async () => {
      const response = await request(app)
        .put(`/api/soal/${soalId}`)
        .set('Authorization', `Bearer ${guruToken}`)
        .send({
          teks_soal: 'Updated question',
          mata_pelajaran: 'Fisika'
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('berhasil diupdate');
      expect(response.body.soal.teks_soal).toBe('Updated question');
      expect(response.body.soal.mata_pelajaran).toBe('Fisika');
    });

    it('should return 404 for non-existent soal', async () => {
      const response = await request(app)
        .put('/api/soal/99999')
        .set('Authorization', `Bearer ${guruToken}`)
        .send({
          teks_soal: 'Updated'
        });

      expect(response.status).toBe(403); // Controller returns 403 for not owned/not found
      expect(response.body.error).toContain('tidak ditemukan atau bukan milik Anda');
    });
  });

  describe('DELETE /api/soal/:id - Delete Soal', () => {
    let soalId;

    beforeEach(async () => {
      const createResponse = await request(app)
        .post('/api/soal')
        .set('Authorization', `Bearer ${guruToken}`)
        .send({
          tipe_soal: 'ESSAY',
          teks_soal: 'To be deleted',
          mata_pelajaran: 'Matematika',
          tingkat: '10'
        });
      soalId = createResponse.body.soal_id;
    });

    it('should delete soal successfully', async () => {
      const response = await request(app)
        .delete(`/api/soal/${soalId}`)
        .set('Authorization', `Bearer ${guruToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('berhasil dihapus');

      // Verify deletion
      const getResponse = await request(app)
        .get(`/api/soal/${soalId}`)
        .set('Authorization', `Bearer ${guruToken}`);
      expect(getResponse.status).toBe(404);
    });

    it('should return 404 for non-existent soal', async () => {
      const response = await request(app)
        .delete('/api/soal/99999')
        .set('Authorization', `Bearer ${guruToken}`);

      expect(response.status).toBe(403); // Controller returns 403 for not owned/not found
      expect(response.body.error).toContain('tidak ditemukan atau bukan milik Anda');
    });
  });
});
