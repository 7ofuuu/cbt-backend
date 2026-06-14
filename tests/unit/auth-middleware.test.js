/**
 * White Box Test: Auth Middleware
 * WB-2 - SB-56
 * Target: src/middlewares/validationMiddleware.js
 */
jest.mock('../../src/config/db');

const prisma = require('../../src/config/db');
const { verifyToken, checkRole, validateRegister, validateLogin } = require('../../src/middlewares/validationMiddleware');
const { makeToken } = require('../helpers/jwtHelper');

// ─── Request/Response/Next helpers ──────────────────────────────────────────

const makeRes = () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res;
};

// ─── verifyToken ─────────────────────────────────────────────────────────────

describe('verifyToken', () => {
  const next = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('WB-VM-01: no Authorization header → 401 Token tidak ditemukan', async () => {
    const req = { headers: {} };
    const res = makeRes();
    await verifyToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('Token') }));
    expect(next).not.toHaveBeenCalled();
  });

  test('WB-VM-02: Authorization header without Bearer prefix → 401', async () => {
    const req = { headers: { authorization: 'Token abc123' } };
    const res = makeRes();
    await verifyToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('WB-VM-03: expired token → 401 Token tidak valid', async () => {
    const { expiredToken } = require('../helpers/jwtHelper');
    const req = { headers: { authorization: `Bearer ${expiredToken()}` } };
    const res = makeRes();
    await verifyToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('kadaluarsa') }));
  });

  test('WB-VM-04: malformed token → 401', async () => {
    const req = { headers: { authorization: 'Bearer not.a.validtoken' } };
    const res = makeRes();
    await verifyToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('WB-VM-05: valid token but user not found in DB → 401 Sesi tidak valid', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const token = makeToken({ id: 999, role: 'admin', is_super_admin: false });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = makeRes();
    await verifyToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('Sesi tidak valid') }));
  });

  test('WB-VM-06: valid token but user is_active = false → 401', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'admin', is_active: false, is_super_admin: false });
    const token = makeToken({ id: 1, role: 'admin', is_super_admin: false });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = makeRes();
    await verifyToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('WB-VM-07: valid token but role changed in DB → 401 Role akun berubah', async () => {
    // Token says admin, but DB says teacher
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'teacher', is_active: true, is_super_admin: false });
    const token = makeToken({ id: 1, role: 'admin', is_super_admin: false });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = makeRes();
    await verifyToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('Role') }));
  });

  test('WB-VM-08: happy path → req.user populated, next() called', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'admin', is_active: true, is_super_admin: false });
    const token = makeToken({ id: 1, role: 'admin', is_super_admin: false });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = makeRes();
    await verifyToken(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toMatchObject({ id: 1, role: 'admin', is_super_admin: false });
  });
});

// ─── checkRole ───────────────────────────────────────────────────────────────

describe('checkRole', () => {
  const next = jest.fn();

  beforeEach(() => jest.clearAllMocks());

  test('WB-CR-01: req.user is null → 403 Role tidak ditemukan', () => {
    const res = makeRes();
    checkRole('admin')({ user: null }, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('WB-CR-02: req.user.role not in allowed (single arg) → 403', () => {
    const res = makeRes();
    checkRole('admin')({ user: { role: 'student' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('WB-CR-03: req.user.role not in allowed (multiple args) → 403', () => {
    const res = makeRes();
    checkRole('admin', 'teacher')({ user: { role: 'student' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('WB-CR-04: role matches single string arg → next() called', () => {
    const res = makeRes();
    checkRole('admin')({ user: { role: 'admin' } }, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('WB-CR-05: role matches one of multiple args → next() called', () => {
    const res = makeRes();
    checkRole('admin', 'teacher')({ user: { role: 'teacher' } }, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('WB-CR-06: role matches item in nested array (flat behavior) → next() called', () => {
    const res = makeRes();
    checkRole(['admin', 'teacher'])({ user: { role: 'admin' } }, res, next);
    expect(next).toHaveBeenCalled();
  });
});

// ─── validateRegister ────────────────────────────────────────────────────────

describe('validateRegister', () => {
  const next = jest.fn();

  beforeEach(() => jest.clearAllMocks());

  const validAdmin = {
    username: 'admin1',
    password: 'Password1',
    role: 'admin',
    full_name: 'Admin Satu',
  };

  const validStudent = {
    username: 'siswa01',
    password: 'Password1',
    role: 'student',
    full_name: 'Siswa Satu',
    classroom: 'X-IPA-1',
    grade_level: '10',
    major: 'IPA',
  };

  const validTeacher = {
    username: 'guru01',
    password: 'Password1',
    role: 'teacher',
    full_name: 'Guru Satu',
    subject: 'Matematika',
  };

  test('WB-VR-01: missing username → 400', () => {
    const res = makeRes();
    const { username: _, ...body } = validAdmin;
    validateRegister({ body }, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  test('WB-VR-02: username < 4 chars → 400', () => {
    const res = makeRes();
    validateRegister({ body: { ...validAdmin, username: 'ab' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('WB-VR-03: password without uppercase → 400 with pattern message', () => {
    const res = makeRes();
    validateRegister({ body: { ...validAdmin, password: 'password1' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('huruf besar') }));
  });

  test('WB-VR-04: student missing classroom → 400', () => {
    const res = makeRes();
    const { classroom: _, ...body } = validStudent;
    validateRegister({ body }, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('WB-VR-05: teacher missing subject → 400 with mata pelajaran message', () => {
    const res = makeRes();
    const { subject: _, ...body } = validTeacher;
    validateRegister({ body }, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('pelajaran') }));
  });

  test('WB-VR-06: valid admin registration → next() called', () => {
    const res = makeRes();
    validateRegister({ body: validAdmin }, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('WB-VR-07: valid student registration → next() called', () => {
    const res = makeRes();
    validateRegister({ body: validStudent }, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('WB-VR-08: valid teacher with is_coordinator → next() called', () => {
    const res = makeRes();
    validateRegister({ body: { ...validTeacher, is_coordinator: true } }, res, next);
    expect(next).toHaveBeenCalled();
  });
});

// ─── validateLogin ───────────────────────────────────────────────────────────

describe('validateLogin', () => {
  const next = jest.fn();

  beforeEach(() => jest.clearAllMocks());

  test('WB-VL-01: missing username → 400', () => {
    const res = makeRes();
    validateLogin({ body: { password: 'pass' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('WB-VL-02: missing password → 400', () => {
    const res = makeRes();
    validateLogin({ body: { username: 'user1' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('WB-VL-03: valid credentials format → next() called', () => {
    const res = makeRes();
    validateLogin({ body: { username: 'user1', password: 'pass123' } }, res, next);
    expect(next).toHaveBeenCalled();
  });
});
