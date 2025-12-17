const request = require('supertest');
const express = require('express');
const userRoutes = require('../../src/routes/userRoutes');
const authRoutes = require('../../src/routes/authRoutes');
const { createAdmin, createGuru, createSiswa, createUjian, createSoal, assignSiswaToUjian, assignSoalToUjian } = require('../setup/testHelpers');
const { prisma } = require('../setup/testDb');

const app = express();
app.use(express.json());
app.use('/api/users', userRoutes);
app.use('/api/auth', authRoutes);

describe('Users Endpoints Integration Tests', () => {
  let adminToken, guruToken, siswaToken, guruId;

  beforeEach(async () => {
    const admin = await createAdmin();
    const guru = await createGuru();
    const siswa = await createSiswa();
    
    adminToken = admin.token;
    guruToken = guru.token;
    siswaToken = siswa.token;
    guruId = guru.user.guru.guru_id;
  });

  describe('GET /api/users - Get All Users (Admin Only)', () => {
    beforeEach(async () => {
      await createGuru({ username: 'guru2' });
      await createSiswa({ username: 'siswa2' });
    });

    it('should get all users for admin', async () => {
      const response = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.users).toBeDefined();
      expect(response.body.users.length).toBeGreaterThan(0);
    });

    it('should filter users by role', async () => {
      const response = await request(app)
        .get('/api/users?role=guru')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.users.every(u => u.role === 'guru')).toBe(true);
    });

    it('should filter users by status', async () => {
      const response = await request(app)
        .get('/api/users?status_aktif=true')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.users.every(u => u.status_aktif === true)).toBe(true);
    });

    it('should reject access from guru', async () => {
      const response = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${guruToken}`);

      expect(response.status).toBe(403);
    });

    it('should reject access from siswa', async () => {
      const response = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${siswaToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/users - Create User (Admin Only)', () => {
    it('should create new user successfully', async () => {
      const response = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          username: 'new_admin',
          password: 'password123',
          role: 'admin',
          nama: 'New Admin'
        });

      expect(response.status).toBe(201);
      expect(response.body.message).toContain('berhasil dibuat');
      expect(response.body.userId).toBeDefined();
    });

    it('should reject creation from non-admin', async () => {
      const response = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${guruToken}`)
        .send({
          username: 'new_user',
          password: 'password123',
          role: 'guru',
          nama: 'New User'
        });

      expect(response.status).toBe(403);
    });
  });

  describe('PUT /api/users/:id/role - Update User Role (Admin Only)', () => {
    let userId;

    beforeEach(async () => {
      const user = await createGuru({ username: 'test_guru' });
      userId = user.user.id;
    });

    it('should update user role successfully', async () => {
      const response = await request(app)
        .put(`/api/users/${userId}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          role: 'admin'
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('berhasil diubah');
    });

    it('should reject role update from non-admin', async () => {
      const response = await request(app)
        .put(`/api/users/${userId}/role`)
        .set('Authorization', `Bearer ${guruToken}`)
        .send({
          role: 'admin'
        });

      expect(response.status).toBe(403);
    });
  });

  describe('PATCH /api/users/:id/status - Toggle User Status (Admin Only)', () => {
    let userId;

    beforeEach(async () => {
      const user = await createGuru({ username: 'test_guru' });
      userId = user.user.id;
    });

    it('should toggle user status successfully', async () => {
      const response = await request(app)
        .patch(`/api/users/${userId}/status`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toMatch(/diaktifkan|dinonaktifkan/);

      // Verify status changed
      const user = await prisma.user.findUnique({ where: { id: userId } });
      expect(user.status_aktif).toBe(false);
    });

    it('should reject status toggle from non-admin', async () => {
      const response = await request(app)
        .patch(`/api/users/${userId}/status`)
        .set('Authorization', `Bearer ${guruToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe('DELETE /api/users/:id - Delete User (Admin Only)', () => {
    let userId;

    beforeEach(async () => {
      const user = await createGuru({ username: 'to_delete' });
      userId = user.user.id;
    });

    it('should delete user successfully', async () => {
      const response = await request(app)
        .delete(`/api/users/${userId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('berhasil dihapus');

      // Verify deletion
      const user = await prisma.user.findUnique({ where: { id: userId } });
      expect(user).toBeNull();
    });

    it('should reject deletion from non-admin', async () => {
      const response = await request(app)
        .delete(`/api/users/${userId}`)
        .set('Authorization', `Bearer ${guruToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/users/nilai - Nilai Essay Manual (Guru Only)', () => {
    let jawabanId, pesertaUjianId;

    beforeEach(async () => {
      const siswa = await createSiswa({ username: 'test_siswa' });
      const ujian = await createUjian(guruId);
      const soal = await createSoal(guruId, { tipe_soal: 'ESSAY' });
      
      await assignSoalToUjian(ujian.ujian_id, soal.soal_id, 100, 1);
      const peserta = await assignSiswaToUjian(ujian.ujian_id, siswa.user.siswa.siswa_id);
      pesertaUjianId = peserta.peserta_ujian_id;

      // Create essay jawaban
      const jawaban = await prisma.jawaban.create({
        data: {
          peserta_ujian_id: pesertaUjianId,
          soal_id: soal.soal_id,
          jawaban_essay_text: 'Essay answer'
        }
      });
      jawabanId = jawaban.jawaban_id;
    });

    it('should grade essay answer successfully', async () => {
      const response = await request(app)
        .post('/api/users/nilai')
        .set('Authorization', `Bearer ${guruToken}`)
        .send({
          jawaban_id: jawabanId,
          nilai_manual: 85
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('berhasil dinilai');
      expect(response.body.jawaban.nilai_manual).toBe(85);
    });

    it('should reject grading from siswa', async () => {
      const response = await request(app)
        .post('/api/users/nilai')
        .set('Authorization', `Bearer ${siswaToken}`)
        .send({
          jawaban_id: jawabanId,
          nilai_manual: 85
        });

      expect(response.status).toBe(403);
    });

    it('should reject invalid nilai (> 100)', async () => {
      const response = await request(app)
        .post('/api/users/nilai')
        .set('Authorization', `Bearer ${guruToken}`)
        .send({
          jawaban_id: jawabanId,
          nilai_manual: 150
        });

      expect(response.status).toBe(400);
    });

    it('should reject invalid nilai (< 0)', async () => {
      const response = await request(app)
        .post('/api/users/nilai')
        .set('Authorization', `Bearer ${guruToken}`)
        .send({
          jawaban_id: jawabanId,
          nilai_manual: -10
        });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/users/finalisasi - Finalize Nilai (Guru Only)', () => {
    let pesertaUjianId;

    beforeEach(async () => {
      const siswa = await createSiswa({ username: 'test_siswa' });
      const ujian = await createUjian(guruId);
      
      // Create soal with bobot
      const soal1 = await createSoal(guruId, {
        tipe_soal: 'PILIHAN_GANDA_SINGLE',
        opsi_jawaban: [
          { label: 'A', teks_opsi: 'Correct', is_benar: true },
          { label: 'B', teks_opsi: 'Wrong', is_benar: false }
        ]
      });
      const soal2 = await createSoal(guruId, { tipe_soal: 'ESSAY' });
      
      await assignSoalToUjian(ujian.ujian_id, soal1.soal_id, 50, 1);
      await assignSoalToUjian(ujian.ujian_id, soal2.soal_id, 50, 2);
      
      const peserta = await assignSiswaToUjian(ujian.ujian_id, siswa.user.siswa.siswa_id);
      pesertaUjianId = peserta.peserta_ujian_id;

      // Create jawaban
      const correctOpsi = soal1.opsiJawabans.find(o => o.is_benar);
      await prisma.jawaban.create({
        data: {
          peserta_ujian_id: pesertaUjianId,
          soal_id: soal1.soal_id,
          jawaban_pg_opsi_ids: JSON.stringify([correctOpsi.opsi_id]),
          is_correct: true
        }
      });

      await prisma.jawaban.create({
        data: {
          peserta_ujian_id: pesertaUjianId,
          soal_id: soal2.soal_id,
          jawaban_essay_text: 'Essay',
          nilai_manual: 40 // 40 out of 50
        }
      });

      await prisma.pesertaUjian.update({
        where: { peserta_ujian_id: pesertaUjianId },
        data: { status_ujian: 'SELESAI' }
      });
    });

    it('should finalize nilai successfully', async () => {
      const response = await request(app)
        .post('/api/users/finalisasi')
        .set('Authorization', `Bearer ${guruToken}`)
        .send({
          peserta_ujian_id: pesertaUjianId
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('berhasil difinalisasi');
      expect(response.body.nilai_akhir).toBeDefined();
      expect(parseFloat(response.body.nilai_akhir)).toBeGreaterThan(0);
    });

    it('should create hasilUjian record', async () => {
      await request(app)
        .post('/api/users/finalisasi')
        .set('Authorization', `Bearer ${guruToken}`)
        .send({
          peserta_ujian_id: pesertaUjianId
        });

      const hasil = await prisma.hasilUjian.findUnique({
        where: { peserta_ujian_id: pesertaUjianId }
      });

      expect(hasil).toBeDefined();
      expect(hasil.nilai_akhir).toBeGreaterThan(0);
    });

    it('should update pesertaUjian status to DINILAI', async () => {
      await request(app)
        .post('/api/users/finalisasi')
        .set('Authorization', `Bearer ${guruToken}`)
        .send({
          peserta_ujian_id: pesertaUjianId
        });

      const peserta = await prisma.pesertaUjian.findUnique({
        where: { peserta_ujian_id: pesertaUjianId }
      });

      expect(peserta.status_ujian).toBe('DINILAI');
    });

    it('should reject finalization from siswa', async () => {
      const response = await request(app)
        .post('/api/users/finalisasi')
        .set('Authorization', `Bearer ${siswaToken}`)
        .send({
          peserta_ujian_id: pesertaUjianId
        });

      expect(response.status).toBe(403);
    });
  });
});
