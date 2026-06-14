/**
 * Black Box Test: Auth Endpoints
 * BB-1 - SB-62 & SB-63
 * Endpoints: POST /api/auth/login, /register, /logout, GET /api/auth/me, PATCH /api/auth/change-password
 */
jest.mock('../../src/config/db');
jest.mock('../../src/services/activityLogService', () => ({
  createLog: jest.fn().mockResolvedValue(undefined),
  logFromRequest: jest.fn().mockResolvedValue(undefined),
  getIpAddress: jest.fn().mockReturnValue('127.0.0.1'),
  getUserAgent: jest.fn().mockReturnValue('supertest'),
}));
jest.mock('../../src/services/userService', () => ({
  createUserWithProfile: jest.fn(),
  SALT_ROUNDS: 12,
  buildPagination: jest.fn().mockReturnValue({ skip: 0, take: 10, page: 1, limit: 10 }),
  paginatedResponse: jest.fn(),
  formatUserData: jest.fn(),
  validateClassroom: jest.fn(),
  validateClassroomConsistency: jest.fn(),
}));

const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../../src/app');
const prisma = require('../../src/config/db');
const { createUserWithProfile } = require('../../src/services/userService');
const { adminToken, teacherToken, studentToken, expiredToken } = require('../helpers/jwtHelper');

// ─── Default mocks ────────────────────────────────────────────────────────────

const mockAdminUser = {
  id: 1, username: 'admin1', password: 'hashedpw',
  role: 'admin', is_active: true, is_super_admin: false,
  student: null, teacher: null,
  admin: { admin_id: 1, full_name: 'Admin Satu' },
};

beforeEach(() => {
  jest.clearAllMocks();
  // verifyToken requires user lookup
  prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'admin', is_active: true, is_super_admin: false });
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  test('BB-A1: missing username → 400 validation error', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'pass123' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('BB-A2: missing password → 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin1' });
    expect(res.status).toBe(400);
  });

  test('BB-A3: user not found → 401 (generic message, no user not found disclosure)', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null); // first call is login's user lookup
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(false);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nobody', password: 'WrongPass1' });
    expect(res.status).toBe(401);
    expect(res.body.error).not.toContain('tidak ditemukan');
  });

  test('BB-A4: wrong password → 401', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(mockAdminUser);
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(false);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin1', password: 'WrongPass1' });
    expect(res.status).toBe(401);
  });

  test('BB-A5: inactive account → 403', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({ ...mockAdminUser, is_active: false });
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin1', password: 'CorrectPass1' });
    expect(res.status).toBe(403);
  });

  test('BB-A6: valid credentials → 200 with token and user object', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(mockAdminUser);
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin1', password: 'CorrectPass1' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toMatchObject({ role: 'admin' });
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});

// ─── POST /api/auth/register ──────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  test('BB-B1: no auth token → 401', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'newuser', password: 'Pass1234', role: 'admin', full_name: 'New' });
    expect(res.status).toBe(401);
  });

  test('BB-B2: student token (wrong role) → 403', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 3, role: 'student', is_active: true, is_super_admin: false });
    const res = await request(app)
      .post('/api/auth/register')
      .set('Authorization', `Bearer ${studentToken()}`)
      .send({ username: 'newuser', password: 'Pass1234', role: 'admin', full_name: 'New' });
    expect(res.status).toBe(403);
  });

  test('BB-B3: admin token, missing required fields → 400 validation', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ username: 'ab', role: 'admin' }); // too short username, missing password+full_name
    expect(res.status).toBe(400);
  });

  test('BB-B4: admin token, valid body → 201 with message and userId', async () => {
    createUserWithProfile.mockResolvedValue({ id: 50 });
    const res = await request(app)
      .post('/api/auth/register')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ username: 'newteacher', password: 'Pass1234', role: 'teacher', full_name: 'Guru Baru', subject: 'Kimia' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ userId: 50 });
  });
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────

describe('POST /api/auth/logout', () => {
  test('BB-C1: no auth token → 401', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(401);
  });

  test('BB-C2: valid token → 200 Logout berhasil', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce({ id: 1, role: 'admin', is_active: true, is_super_admin: false }) // verifyToken
      .mockResolvedValueOnce({ username: 'admin1' }); // logout's own lookup
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Logout berhasil');
  });
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────

describe('GET /api/auth/me', () => {
  test('BB-D1: no auth token → 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('BB-D2: expired token → 401', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${expiredToken()}`);
    expect(res.status).toBe(401);
  });

  test('BB-D3: valid token → 200 with profile', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce({ id: 1, role: 'admin', is_active: true, is_super_admin: false }) // verifyToken
      .mockResolvedValueOnce({ // me handler
        id: 1, username: 'admin1', role: 'admin', is_super_admin: false,
        student: null, teacher: null, admin: { admin_id: 1, full_name: 'Admin Satu' },
      });
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: 1, role: 'admin' });
  });

  test('BB-D4: token valid but user deleted from DB → 404', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce({ id: 999, role: 'admin', is_active: true, is_super_admin: false }) // verifyToken
      .mockResolvedValueOnce(null); // me handler - user gone
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(404);
  });
});

// ─── PATCH /api/auth/change-password ─────────────────────────────────────────

describe('PATCH /api/auth/change-password', () => {
  test('BB-E1: no auth → 401', async () => {
    const res = await request(app)
      .patch('/api/auth/change-password')
      .send({ current_password: 'Old1', new_password: 'New1234' });
    expect(res.status).toBe(401);
  });

  test('BB-E2: missing fields → 400', async () => {
    const res = await request(app)
      .patch('/api/auth/change-password')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ current_password: 'OldPass1' });
    expect(res.status).toBe(400);
  });

  test('BB-E3: weak new password → 400', async () => {
    const res = await request(app)
      .patch('/api/auth/change-password')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ current_password: 'OldPass1', new_password: 'weak' });
    expect(res.status).toBe(400);
  });

  test('BB-E4: valid change → 200', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce({ id: 1, role: 'admin', is_active: true, is_super_admin: false }) // verifyToken
      .mockResolvedValueOnce({ id: 1, username: 'admin1', role: 'admin', password: 'hashed' });
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('newhashedpw');
    prisma.user.update.mockResolvedValue({});
    const res = await request(app)
      .patch('/api/auth/change-password')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ current_password: 'OldPass1', new_password: 'NewPass2' });
    expect(res.status).toBe(200);
  });
});
