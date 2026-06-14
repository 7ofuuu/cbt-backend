/**
 * White Box Test: Auth Controller
 * WB-1 - SB-54 & SB-55
 * Target: src/controllers/authController.js
 */
jest.mock('../../src/config/db');
jest.mock('bcryptjs');
jest.mock('../../src/services/activityLogService', () => ({
  createLog: jest.fn().mockResolvedValue(undefined),
  logFromRequest: jest.fn().mockResolvedValue(undefined),
  getIpAddress: jest.fn().mockReturnValue('127.0.0.1'),
  getUserAgent: jest.fn().mockReturnValue('jest-test'),
}));
jest.mock('../../src/services/userService', () => ({
  createUserWithProfile: jest.fn(),
  SALT_ROUNDS: 12,
}));

const prisma = require('../../src/config/db');
const bcrypt = require('bcryptjs');
const { createUserWithProfile } = require('../../src/services/userService');
const activityLogService = require('../../src/services/activityLogService');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeReqRes = (body = {}, user = null) => {
  const req = { body, user, headers: {}, ip: '127.0.0.1' };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  const next = jest.fn();
  return { req, res, next };
};

// asyncHandler doesn't return the inner promise, so we flush microtasks after calling.
const flush = () => new Promise(resolve => setImmediate(resolve));

// Load controller functions after mocks are set up
const { login, register, me, changePassword, logout } = require('../../src/controllers/authController');

// ─── login ───────────────────────────────────────────────────────────────────

describe('login', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: bcrypt.compare returns false (will override per test)
    bcrypt.compare.mockResolvedValue(false);
  });

  const mockAdminUser = {
    id: 1,
    username: 'admin1',
    password: 'hashedpw',
    role: 'admin',
    is_active: true,
    is_super_admin: false,
    student: null,
    teacher: null,
    admin: { admin_id: 1, full_name: 'Admin Satu' },
  };

  test('WB-01: user not found → dummy bcrypt compare → AppError 401', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    bcrypt.compare.mockResolvedValue(false);
    const { req, res, next } = makeReqRes({ username: 'noone', password: 'pass' });
    login(req, res, next); await flush();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    // Dummy compare should still have been called for timing attack mitigation
    expect(bcrypt.compare).toHaveBeenCalled();
  });

  test('WB-02: user found but wrong password → AppError 401', async () => {
    prisma.user.findUnique.mockResolvedValue(mockAdminUser);
    bcrypt.compare.mockResolvedValue(false);
    const { req, res, next } = makeReqRes({ username: 'admin1', password: 'wrong' });
    login(req, res, next); await flush();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  test('WB-03: user is_active = false → AppError 403', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...mockAdminUser, is_active: false });
    bcrypt.compare.mockResolvedValue(true);
    const { req, res, next } = makeReqRes({ username: 'admin1', password: 'correct' });
    login(req, res, next); await flush();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  test('WB-04: valid admin login → 200 with token and admin profile', async () => {
    prisma.user.findUnique.mockResolvedValue(mockAdminUser);
    bcrypt.compare.mockResolvedValue(true);
    const { req, res, next } = makeReqRes({ username: 'admin1', password: 'correct' });
    login(req, res, next); await flush();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        token: expect.any(String),
        user: expect.objectContaining({ role: 'admin' }),
      })
    );
  });

  test('WB-05: valid student login → profile contains student data', async () => {
    const studentUser = {
      ...mockAdminUser,
      id: 3,
      username: 'siswa1',
      role: 'student',
      admin: null,
      teacher: null,
      student: { student_id: 1, full_name: 'Siswa Satu', classroom: 'X-IPA-1' },
    };
    prisma.user.findUnique.mockResolvedValue(studentUser);
    bcrypt.compare.mockResolvedValue(true);
    const { req, res, next } = makeReqRes({ username: 'siswa1', password: 'correct' });
    login(req, res, next); await flush();
    const response = res.json.mock.calls[0][0];
    expect(response.user.profile).toMatchObject({ student_id: 1 });
  });

  test('WB-06: teacher with is_coordinator=true → profile includes is_coordinator field', async () => {
    const teacherUser = {
      ...mockAdminUser,
      id: 2,
      username: 'guru1',
      role: 'teacher',
      admin: null,
      student: null,
      teacher: { teacher_id: 1, full_name: 'Guru Koordinator', is_coordinator: true, subject: 'IPA', nip: null },
    };
    prisma.user.findUnique.mockResolvedValue(teacherUser);
    bcrypt.compare.mockResolvedValue(true);
    const { req, res, next } = makeReqRes({ username: 'guru1', password: 'correct' });
    login(req, res, next); await flush();
    const response = res.json.mock.calls[0][0];
    expect(response.user.profile.is_coordinator).toBe(true);
  });

  test('WB-07: teacher with is_coordinator=false → is_coordinator not in profile', async () => {
    const teacherUser = {
      ...mockAdminUser,
      id: 2,
      username: 'guru2',
      role: 'teacher',
      admin: null,
      student: null,
      teacher: { teacher_id: 2, full_name: 'Guru Biasa', is_coordinator: false, subject: 'IPS', nip: null },
    };
    prisma.user.findUnique.mockResolvedValue(teacherUser);
    bcrypt.compare.mockResolvedValue(true);
    const { req, res, next } = makeReqRes({ username: 'guru2', password: 'correct' });
    login(req, res, next); await flush();
    const response = res.json.mock.calls[0][0];
    expect(response.user.profile.is_coordinator).toBeUndefined();
  });
});

// ─── register ────────────────────────────────────────────────────────────────

describe('register', () => {
  beforeEach(() => jest.clearAllMocks());

  test('WB-08: createUserWithProfile succeeds → 201 with message and userId', async () => {
    createUserWithProfile.mockResolvedValue({ id: 99 });
    const { req, res, next } = makeReqRes({ username: 'newuser', password: 'Pass1234', role: 'admin', full_name: 'New User' });
    register(req, res, next); await flush();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ userId: 99 }));
  });

  test('WB-09: createUserWithProfile throws AppError (duplicate username) → error propagated to next', async () => {
    const { AppError } = require('../../src/utils/asyncHandler');
    createUserWithProfile.mockRejectedValue(new AppError('Username sudah digunakan', 409));
    const { req, res, next } = makeReqRes({ username: 'dup', password: 'Pass1234', role: 'admin', full_name: 'Dup User' });
    register(req, res, next); await flush();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 409 }));
  });
});

// ─── me ──────────────────────────────────────────────────────────────────────

describe('me', () => {
  beforeEach(() => jest.clearAllMocks());

  test('WB-10: user not found → AppError 404', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const { req, res, next } = makeReqRes({}, { id: 999, role: 'admin' });
    me(req, res, next); await flush();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('WB-11: user found → 200 with profile data', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 1, username: 'admin1', role: 'admin', is_super_admin: false,
      student: null, teacher: null, admin: { admin_id: 1, full_name: 'Admin' },
    });
    const { req, res, next } = makeReqRes({}, { id: 1, role: 'admin' });
    me(req, res, next); await flush();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      user: expect.objectContaining({ id: 1, role: 'admin' }),
    }));
  });
});

// ─── changePassword ───────────────────────────────────────────────────────────

describe('changePassword', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    bcrypt.compare.mockResolvedValue(true);
    bcrypt.hash.mockResolvedValue('newhashed');
    prisma.user.findUnique.mockResolvedValue({ id: 1, username: 'admin1', role: 'admin', password: 'oldhashed' });
    prisma.user.update.mockResolvedValue({});
  });

  test('WB-12: missing current_password → AppError 400', async () => {
    const { req, res, next } = makeReqRes({ new_password: 'NewPass1' }, { id: 1, role: 'admin' });
    changePassword(req, res, next); await flush();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-13: new_password length < 8 → AppError 400', async () => {
    const { req, res, next } = makeReqRes({ current_password: 'OldPass1', new_password: 'Sh1' }, { id: 1, role: 'admin' });
    changePassword(req, res, next); await flush();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-14: new_password fails pattern (no digit) → AppError 400', async () => {
    const { req, res, next } = makeReqRes({ current_password: 'OldPass1', new_password: 'NoDigitPass' }, { id: 1, role: 'admin' });
    changePassword(req, res, next); await flush();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-14b: new_password same as current → AppError 400', async () => {
    const { req, res, next } = makeReqRes({ current_password: 'SamePass1', new_password: 'SamePass1' }, { id: 1, role: 'admin' });
    changePassword(req, res, next); await flush();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-15: wrong current password → AppError 400', async () => {
    // 400, not 401: the session is valid, only the supplied password is wrong.
    // A 401 would trip the dashboard global session-expired handler and log the user out.
    bcrypt.compare.mockResolvedValue(false);
    const { req, res, next } = makeReqRes({ current_password: 'WrongOld1', new_password: 'NewPass1' }, { id: 1, role: 'admin' });
    changePassword(req, res, next); await flush();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-16: valid change → 200 success message', async () => {
    const { req, res, next } = makeReqRes({ current_password: 'OldPass1', new_password: 'NewPass2' }, { id: 1, role: 'admin' });
    changePassword(req, res, next); await flush();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('berhasil') }));
  });
});

// ─── logout ──────────────────────────────────────────────────────────────────

describe('logout', () => {
  beforeEach(() => jest.clearAllMocks());

  test('WB-17: valid logout → 200 Logout berhasil', async () => {
    prisma.user.findUnique.mockResolvedValue({ username: 'admin1' });
    const { req, res, next } = makeReqRes({}, { id: 1, role: 'admin' });
    logout(req, res, next); await flush();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Logout berhasil' }));
    expect(activityLogService.logFromRequest).toHaveBeenCalled();
  });

  test('WB-17b: user not found in DB → still returns success (fallback username)', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const { req, res, next } = makeReqRes({}, { id: 99, role: 'admin' });
    logout(req, res, next); await flush();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Logout berhasil' }));
  });
});
