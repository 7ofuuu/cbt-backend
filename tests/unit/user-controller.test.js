/**
 * White Box Test: User Controller
 * WB-16
 * Target: src/controllers/userController.js
 */
jest.mock('../../src/config/db');
jest.mock('bcryptjs');
jest.mock('../../src/services/scoreService', () => ({
  calculateAndSaveResult: jest.fn(),
}));
jest.mock('../../src/services/activityLogService', () => ({
  logFromRequest: jest.fn().mockResolvedValue(undefined),
}));

const prisma = require('../../src/config/db');
const bcrypt = require('bcryptjs');
const { calculateAndSaveResult } = require('../../src/services/scoreService');
const ctrl = require('../../src/controllers/userController');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeReqRes = (overrides = {}) => {
  const req = { body: {}, params: {}, query: {}, user: { id: 1 }, headers: {}, ...overrides };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  const next = jest.fn();
  return { req, res, next };
};

const flush = () => new Promise((resolve) => setImmediate(resolve));

const run = async (handler, overrides) => {
  const ctx = makeReqRes(overrides);
  handler(ctx.req, ctx.res, ctx.next);
  await flush();
  return ctx;
};

beforeEach(() => {
  jest.clearAllMocks();
  bcrypt.hash.mockResolvedValue('hashed');
  prisma.$transaction.mockImplementation((fn) => (typeof fn === 'function' ? fn(prisma) : Promise.all(fn)));
});

// ─── listing ──────────────────────────────────────────────────────────────────

describe('listUsers / getAllTeachers', () => {
  test('WB-UC-01: returns paginated, formatted users with role filter applied', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 2, username: 'guru', role: 'teacher', is_active: true, is_super_admin: false, teacher: { teacher_id: 1, full_name: 'Guru', subject: 'IPA', nip: null, is_coordinator: false } },
    ]);
    prisma.user.count.mockResolvedValue(1);
    const { res } = await run(ctrl.getAllTeachers, { query: {} });
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { role: 'teacher' } }));
    const payload = res.json.mock.calls[0][0];
    expect(payload.pagination.total).toBe(1);
    expect(payload.data[0].full_name).toBe('Guru');
  });

  test('WB-UC-02: search + status filters build OR clause and is_active', async () => {
    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.count.mockResolvedValue(0);
    await run(ctrl.getAllUsers, { query: { search: 'budi', status: 'inactive' } });
    const arg = prisma.user.findMany.mock.calls[0][0];
    expect(arg.where.OR).toBeDefined();
    expect(arg.where.is_active).toBe(false);
  });
});

describe('countUsersByRole', () => {
  test('WB-UC-03: returns counts per role and total', async () => {
    prisma.user.count
      .mockResolvedValueOnce(2) // admin
      .mockResolvedValueOnce(8) // teacher
      .mockResolvedValueOnce(100) // student
      .mockResolvedValueOnce(110); // total
    const { res } = await run(ctrl.countUsersByRole);
    expect(res.json).toHaveBeenCalledWith({ admin: 2, teacher: 8, student: 100, total: 110 });
  });
});

// ─── getUserDetail ────────────────────────────────────────────────────────────

describe('getUserDetail', () => {
  test('WB-UC-04: not found → AppError 404', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const { next } = await run(ctrl.getUserDetail, { params: { id: '99' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('WB-UC-05: found → returns formatted user', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, username: 'a', role: 'admin', is_active: true, is_super_admin: false, admin: { admin_id: 1, full_name: 'Adm' } });
    const { res } = await run(ctrl.getUserDetail, { params: { id: '1' } });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ user: expect.objectContaining({ admin_id: 1 }) }));
  });
});

// ─── createUser ───────────────────────────────────────────────────────────────

describe('createUser', () => {
  test('WB-UC-06: missing required fields → 400', async () => {
    const { next } = await run(ctrl.createUser, { body: { username: 'a' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-UC-07: invalid role → 400', async () => {
    const { next } = await run(ctrl.createUser, { body: { username: 'a', password: 'p', role: 'root', full_name: 'A' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-UC-08: student without classroom → 400', async () => {
    const { next } = await run(ctrl.createUser, { body: { username: 'a', password: 'p', role: 'student', full_name: 'A' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-UC-09: teacher without subject → 400', async () => {
    const { next } = await run(ctrl.createUser, { body: { username: 'a', password: 'p', role: 'teacher', full_name: 'A' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-UC-10: invalid is_coordinator → 400', async () => {
    const { next } = await run(ctrl.createUser, { body: { username: 'a', password: 'p', role: 'admin', full_name: 'A', is_coordinator: 'maybe' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-UC-11: valid admin → 201 with userId', async () => {
    prisma.user.create.mockResolvedValue({ id: 50 });
    prisma.admin.create.mockResolvedValue({});
    const { res } = await run(ctrl.createUser, { body: { username: 'a', password: 'p', role: 'admin', full_name: 'A' } });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ userId: 50 }));
  });
});

// ─── updateUser ───────────────────────────────────────────────────────────────

describe('updateUser', () => {
  test('WB-UC-12: not found → 404', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const { next } = await run(ctrl.updateUser, { params: { id: '1' }, body: {} });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('WB-UC-13: username taken by another user → 409', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce({ id: 1, username: 'old', role: 'admin', admin: { admin_id: 1 } }) // target
      .mockResolvedValueOnce({ id: 2, username: 'taken' }); // existing
    const { next } = await run(ctrl.updateUser, { params: { id: '1' }, body: { username: 'taken' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 409 }));
  });

  test('WB-UC-14: valid admin update → 200 with updated user', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce({ id: 1, username: 'old', role: 'admin', admin: { admin_id: 1, full_name: 'Old' }, teacher: null, student: null })
      .mockResolvedValueOnce({ id: 1, username: 'old', role: 'admin', is_active: true, is_super_admin: false, admin: { admin_id: 1, full_name: 'New' } });
    prisma.admin.update.mockResolvedValue({});
    const { res } = await run(ctrl.updateUser, { params: { id: '1' }, body: { full_name: 'New' } });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('diperbarui') }));
  });
});

// ─── updateUserRole ───────────────────────────────────────────────────────────

describe('updateUserRole', () => {
  test('WB-UC-15: missing new_role → 400', async () => {
    const { next } = await run(ctrl.updateUserRole, { params: { id: '1' }, body: {} });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-UC-16: teacher role without teacher_subject → 400', async () => {
    const { next } = await run(ctrl.updateUserRole, { params: { id: '1' }, body: { new_role: 'teacher' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-UC-17: super admin → 403', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'admin', is_super_admin: true, admin: {} });
    const { next } = await run(ctrl.updateUserRole, { params: { id: '1' }, body: { new_role: 'student' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  test('WB-UC-18: same role → 400', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'student', is_super_admin: false, student: {} });
    const { next } = await run(ctrl.updateUserRole, { params: { id: '1' }, body: { new_role: 'student' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-UC-19: valid admin→student → 200, deletes old + creates new profile', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'admin', is_super_admin: false, admin: { admin_id: 1, full_name: 'A' }, teacher: null, student: null });
    prisma.admin.delete.mockResolvedValue({});
    prisma.user.update.mockResolvedValue({});
    prisma.student.create.mockResolvedValue({});
    const { res } = await run(ctrl.updateUserRole, { params: { id: '1' }, body: { new_role: 'student' } });
    expect(prisma.admin.delete).toHaveBeenCalled();
    expect(prisma.student.create).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('student') }));
  });
});

// ─── toggleUserStatus ─────────────────────────────────────────────────────────

describe('toggleUserStatus', () => {
  test('WB-UC-20: super admin → 403', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 2, is_super_admin: true, is_active: true });
    const { next } = await run(ctrl.toggleUserStatus, { params: { id: '2' }, user: { id: 1 } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  test('WB-UC-21: own account → 400', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, is_super_admin: false, is_active: true });
    const { next } = await run(ctrl.toggleUserStatus, { params: { id: '1' }, user: { id: 1 } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-UC-22: valid toggle → flips is_active', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 2, is_super_admin: false, is_active: true });
    prisma.user.update.mockResolvedValue({ is_active: false });
    const { res } = await run(ctrl.toggleUserStatus, { params: { id: '2' }, user: { id: 1 } });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ is_active: false }));
  });
});

// ─── deleteUser ───────────────────────────────────────────────────────────────

describe('deleteUser', () => {
  test('WB-UC-23: not found → 404', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const { next } = await run(ctrl.deleteUser, { params: { id: '9' }, user: { id: 1 } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('WB-UC-24: super admin → 403', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 2, is_super_admin: true });
    const { next } = await run(ctrl.deleteUser, { params: { id: '2' }, user: { id: 1 } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  test('WB-UC-25: own account → 400', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, is_super_admin: false });
    const { next } = await run(ctrl.deleteUser, { params: { id: '1' }, user: { id: 1 } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-UC-26: valid delete → 200', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 2, is_super_admin: false });
    prisma.user.delete.mockResolvedValue({});
    const { res } = await run(ctrl.deleteUser, { params: { id: '2' }, user: { id: 1 } });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('dihapus') }));
  });
});

// Catatan: scoreAnswer & finalizeScore dihapus (endpoint /users/score & /users/finalize
// dihapus). Grading manual lewat /exam-results/manual-score & /exam-results/calculate.

// Catatan: batchCreateUsers dipindah ke services/usersBatchService.
// Lihat tests/unit/users-batch-service.test.js (UB-04..UB-06).

// ─── batchDeleteUsers ─────────────────────────────────────────────────────────

describe('batchDeleteUsers', () => {
  test('WB-UC-39: neither user_ids nor grade_level → 400', async () => {
    const { next } = await run(ctrl.batchDeleteUsers, { body: {} });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-UC-40: no users match → 404', async () => {
    const { next } = await run(ctrl.batchDeleteUsers, { body: { user_ids: ['abc'] } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('WB-UC-41: all targets protected → 403', async () => {
    prisma.user.findMany.mockResolvedValue([{ id: 2, username: 'super' }]);
    const { next } = await run(ctrl.batchDeleteUsers, { body: { user_ids: [2] }, user: { id: 1 } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  test('WB-UC-42: by grade_level filter → deletes matching, returns count', async () => {
    prisma.student.findMany.mockResolvedValue([{ user_id: 10 }, { user_id: 11 }]);
    prisma.user.findMany.mockResolvedValue([]); // none protected
    prisma.user.deleteMany.mockResolvedValue({ count: 2 });
    const { res } = await run(ctrl.batchDeleteUsers, { body: { grade_level: '12' }, user: { id: 1 } });
    expect(prisma.user.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [10, 11] } } });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ deleted_count: 2 }));
  });
});
