const request = require('supertest');
const express = require('express');
const ujianRoutes = require('../../src/routes/ujianRoutes');
const { createGuru, createSiswa } = require('../setup/testHelpers');
const { prisma } = require('../setup/testDb');

const app = express();
app.use(express.json());
app.use('/api/ujian', ujianRoutes);

describe('Auto-Assign Flow Integration Tests', () => {
  let guruToken, guruId;
  let siswa1, siswa2, siswa3;

  beforeEach(async () => {
    // Create guru
    const guru = await createGuru();
    guruToken = guru.token;
    guruId = guru.user.guru.guru_id;

    // Create siswa dengan berbagai tingkat & jurusan
    siswa1 = await createSiswa({ 
      nama_lengkap: 'Ahmad Test',
      tingkat: '10', 
      jurusan: 'IPA',
      kelas: 'A'
    });
    
    siswa2 = await createSiswa({ 
      nama_lengkap: 'Budi Test',
      tingkat: '10', 
      jurusan: 'IPA',
      kelas: 'B'
    });
    
    siswa3 = await createSiswa({ 
      nama_lengkap: 'Citra Test',
      tingkat: '10', 
      jurusan: 'IPS',
      kelas: 'A'
    });
  });

  describe('Flow 1: Auto-Assign Enabled (Default)', () => {
    it('should auto-assign siswa when creating ujian with matching tingkat & jurusan', async () => {
      const now = new Date();
      const response = await request(app)
        .post('/api/ujian')
        .set('Authorization', `Bearer ${guruToken}`)
        .send({
          nama_ujian: 'UTS Matematika',
          mata_pelajaran: 'Matematika',
          tingkat: '10',
          jurusan: 'IPA',
          tanggal_mulai: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
          tanggal_selesai: new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString(),
          durasi_menit: 120,
          is_acak_soal: true,
          auto_assign_siswa: true
        });

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('Ujian berhasil dibuat');
      expect(response.body.ujian_id).toBeDefined();
      expect(response.body.auto_assign_enabled).toBe(true);
      expect(response.body.jumlah_siswa_assigned).toBe(2); // siswa1 & siswa2 (IPA)

      // Verify pesertaUjian records created
      const pesertaUjians = await prisma.pesertaUjian.findMany({
        where: { ujian_id: response.body.ujian_id }
      });
      expect(pesertaUjians).toHaveLength(2);
    });

    it('should auto-assign all siswa with matching tingkat when jurusan is null', async () => {
      const now = new Date();
      const response = await request(app)
        .post('/api/ujian')
        .set('Authorization', `Bearer ${guruToken}`)
        .send({
          nama_ujian: 'Ujian Umum',
          mata_pelajaran: 'Bahasa Indonesia',
          tingkat: '10',
          jurusan: null, // No jurusan filter
          tanggal_mulai: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
          tanggal_selesai: new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString(),
          durasi_menit: 120,
          auto_assign_siswa: true
        });

      expect(response.status).toBe(201);
      expect(response.body.jumlah_siswa_assigned).toBe(3); // All siswa tingkat 10
    });

    it('should return warning when no siswa match the criteria', async () => {
      const now = new Date();
      const response = await request(app)
        .post('/api/ujian')
        .set('Authorization', `Bearer ${guruToken}`)
        .send({
          nama_ujian: 'Ujian Tidak Ada Siswa',
          mata_pelajaran: 'Matematika',
          tingkat: '12', // No siswa with tingkat 12
          jurusan: 'IPA',
          tanggal_mulai: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
          tanggal_selesai: new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString(),
          durasi_menit: 120,
          auto_assign_siswa: true
        });

      expect(response.status).toBe(201);
      expect(response.body.ujian_id).toBeDefined();
      expect(response.body.jumlah_siswa_assigned).toBe(0);
      expect(response.body.warning).toBeDefined();
    });

    it('should work with default auto_assign_siswa (omitted = true)', async () => {
      const now = new Date();
      const response = await request(app)
        .post('/api/ujian')
        .set('Authorization', `Bearer ${guruToken}`)
        .send({
          nama_ujian: 'Ujian Default Auto Assign',
          mata_pelajaran: 'Matematika',
          tingkat: '10',
          jurusan: 'IPA',
          tanggal_mulai: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
          tanggal_selesai: new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString(),
          durasi_menit: 120
          // auto_assign_siswa omitted - should default to true
        });

      expect(response.status).toBe(201);
      expect(response.body.auto_assign_enabled).toBe(true);
      expect(response.body.jumlah_siswa_assigned).toBe(2);
    });
  });

  describe('Flow 1: Auto-Assign Disabled', () => {
    it('should NOT auto-assign siswa when auto_assign_siswa is false', async () => {
      const now = new Date();
      const response = await request(app)
        .post('/api/ujian')
        .set('Authorization', `Bearer ${guruToken}`)
        .send({
          nama_ujian: 'Ujian Manual Assign',
          mata_pelajaran: 'Matematika',
          tingkat: '10',
          jurusan: 'IPA',
          tanggal_mulai: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
          tanggal_selesai: new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString(),
          durasi_menit: 120,
          auto_assign_siswa: false
        });

      expect(response.status).toBe(201);
      expect(response.body.auto_assign_enabled).toBe(false);
      expect(response.body.jumlah_siswa_assigned).toBe(0);

      // Verify NO pesertaUjian records created
      const pesertaUjians = await prisma.pesertaUjian.findMany({
        where: { ujian_id: response.body.ujian_id }
      });
      expect(pesertaUjians).toHaveLength(0);
    });
  });

  describe('Flow 1: Duplicate Prevention', () => {
    it('should skip duplicates if siswa already assigned', async () => {
      const now = new Date();
      
      // First create ujian with auto-assign
      const firstResponse = await request(app)
        .post('/api/ujian')
        .set('Authorization', `Bearer ${guruToken}`)
        .send({
          nama_ujian: 'First Ujian',
          mata_pelajaran: 'Matematika',
          tingkat: '10',
          jurusan: 'IPA',
          tanggal_mulai: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
          tanggal_selesai: new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString(),
          durasi_menit: 120,
          auto_assign_siswa: true
        });

      expect(firstResponse.body.jumlah_siswa_assigned).toBe(2);

      // Manually try to assign again (should skip duplicates)
      const assignResponse = await request(app)
        .post('/api/ujian/assign-siswa')
        .set('Authorization', `Bearer ${guruToken}`)
        .send({
          ujian_id: firstResponse.body.ujian_id,
          tingkat: '10',
          jurusan: 'IPA'
        });

      // Should succeed but not create duplicates
      expect(assignResponse.status).toBe(201);
      
      // Verify still only 2 records (no duplicates)
      const pesertaUjians = await prisma.pesertaUjian.findMany({
        where: { ujian_id: firstResponse.body.ujian_id }
      });
      expect(pesertaUjians).toHaveLength(2);
    });
  });
});
