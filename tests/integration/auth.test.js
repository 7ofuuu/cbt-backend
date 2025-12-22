const request = require('supertest');
const express = require('express');
const authRoutes = require('../../src/routes/authRoutes');
const { prisma } = require('../setup/testDb');

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

describe('Auth Endpoints Integration Tests', () => {
  describe('POST /api/auth/register', () => {
    it('should register new admin successfully', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'admin_test',
          password: 'password123',
          role: 'admin',
          nama: 'Admin Test User'
        });

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('User berhasil didaftarkan');
      expect(response.body.userId).toBeDefined();

      // Verify in database
      const user = await prisma.user.findUnique({
        where: { id: response.body.userId },
        include: { admin: true }
      });
      expect(user).toBeDefined();
      expect(user.username).toBe('admin_test');
      expect(user.role).toBe('admin');
      expect(user.admin.nama_lengkap).toBe('Admin Test User');
    });

    it('should register new guru successfully', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'guru_test',
          password: 'password123',
          role: 'guru',
          nama: 'Guru Test User'
        });

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('User berhasil didaftarkan');

      const user = await prisma.user.findUnique({
        where: { id: response.body.userId },
        include: { guru: true }
      });
      expect(user.guru).toBeDefined();
      expect(user.guru.nama_lengkap).toBe('Guru Test User');
    });

    it('should register new siswa successfully', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'siswa_test',
          password: 'password123',
          role: 'siswa',
          nama: 'Siswa Test User',
          kelas: '10A',
          tingkat: '10',
          jurusan: 'IPA'
        });

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('User berhasil didaftarkan');

      const user = await prisma.user.findUnique({
        where: { id: response.body.userId },
        include: { siswa: true }
      });
      expect(user.siswa).toBeDefined();
      expect(user.siswa.kelas).toBe('10A');
      expect(user.siswa.tingkat).toBe('10');
      expect(user.siswa.jurusan).toBe('IPA');
    });

    it('should reject registration with duplicate username', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({
          username: 'duplicate_user',
          password: 'password123',
          role: 'admin',
          nama: 'First User'
        });

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'duplicate_user',
          password: 'password456',
          role: 'guru',
          nama: 'Second User'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Username sudah digunakan');
    });

    it('should reject registration with missing required fields', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'incomplete_user',
          password: 'password123',
          role: 'admin'
          // Missing 'nama'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });

    it('should reject siswa registration without kelas, tingkat, jurusan', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'siswa_incomplete',
          password: 'password123',
          role: 'siswa',
          nama: 'Siswa Test'
          // Missing kelas, tingkat, jurusan
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });

    it('should reject registration with invalid role', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'invalid_role_user',
          password: 'password123',
          role: 'superadmin', // Invalid role
          nama: 'Test User'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('role');
    });

    it('should reject registration with short username', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'abc', // Only 3 characters
          password: 'password123',
          role: 'admin',
          nama: 'Test User'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('username');
    });

    it('should reject registration with short password', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'test_user',
          password: '12345', // Only 5 characters
          role: 'admin',
          nama: 'Test User'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('password');
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      // Create test users for login
      await request(app)
        .post('/api/auth/register')
        .send({
          username: 'admin_login',
          password: 'password123',
          role: 'admin',
          nama: 'Admin Login'
        });

      await request(app)
        .post('/api/auth/register')
        .send({
          username: 'guru_login',
          password: 'password123',
          role: 'guru',
          nama: 'Guru Login'
        });

      await request(app)
        .post('/api/auth/register')
        .send({
          username: 'siswa_login',
          password: 'password123',
          role: 'siswa',
          nama: 'Siswa Login',
          kelas: '10A',
          tingkat: '10',
          jurusan: 'IPA'
        });
    });

    it('should login admin successfully', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin_login',
          password: 'password123'
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Login berhasil');
      expect(response.body.token).toBeDefined();
      expect(response.body.user).toBeDefined();
      expect(response.body.user.role).toBe('admin');
      expect(response.body.user.profile).toBeDefined();
      expect(response.body.user.profile.nama_lengkap).toBe('Admin Login');
    });

    it('should login guru successfully', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'guru_login',
          password: 'password123'
        });

      expect(response.status).toBe(200);
      expect(response.body.user.role).toBe('guru');
      expect(response.body.user.profile.guru_id).toBeDefined();
    });

    it('should login siswa successfully', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'siswa_login',
          password: 'password123'
        });

      expect(response.status).toBe(200);
      expect(response.body.user.role).toBe('siswa');
      expect(response.body.user.profile.siswa_id).toBeDefined();
      expect(response.body.user.profile.kelas).toBe('10A');
    });

    it('should reject login with wrong password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin_login',
          password: 'wrong_password'
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Password salah');
    });

    it('should reject login with non-existent username', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'non_existent_user',
          password: 'password123'
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('User tidak ditemukan');
    });

    it('should reject login for inactive user', async () => {
      // Create inactive user
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'inactive_user',
          password: 'password123',
          role: 'admin',
          nama: 'Inactive User'
        });

      // Deactivate user
      await prisma.user.update({
        where: { id: registerResponse.body.userId },
        data: { status_aktif: false }
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'inactive_user',
          password: 'password123'
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('dinonaktifkan');
    });

    it('should reject login with missing username', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          password: 'password123'
        });

      expect(response.status).toBe(400);
    });

    it('should reject login with missing password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin_login'
        });

      expect(response.status).toBe(400);
    });

    it('should return valid JWT token', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin_login',
          password: 'password123'
        });

      expect(response.body.token).toMatch(/^[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*$/);
    });
  });
});
