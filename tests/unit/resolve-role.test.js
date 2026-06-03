/**
 * White Box Test: Role Resolution Middleware
 * WB-9
 * Target: src/middlewares/resolveRole.js (resolveTeacher, resolveStudent)
 */
jest.mock('../../src/config/db');

const prisma = require('../../src/config/db');
const { resolveTeacher, resolveStudent } = require('../../src/middlewares/resolveRole');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeReq = (userId = 1) => ({ user: { id: userId } });

// ─── resolveTeacher ───────────────────────────────────────────────────────────

describe('resolveTeacher', () => {
  beforeEach(() => jest.clearAllMocks());

  test('WB-RT-01: teacher found → req.teacher set, next() called without error', async () => {
    const teacher = { teacher_id: 5, full_name: 'Guru', subject: 'IPA', is_coordinator: false, user_id: 1, nip: null };
    prisma.teacher.findUnique.mockResolvedValue(teacher);
    const req = makeReq(1);
    const next = jest.fn();
    await resolveTeacher(req, {}, next);
    expect(req.teacher).toEqual(teacher);
    expect(next).toHaveBeenCalledWith();
  });

  test('WB-RT-02: looks up teacher by req.user.id', async () => {
    prisma.teacher.findUnique.mockResolvedValue({ teacher_id: 1 });
    await resolveTeacher(makeReq(42), {}, jest.fn());
    expect(prisma.teacher.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user_id: 42 } })
    );
  });

  test('WB-RT-03: teacher not found → next(AppError 401)', async () => {
    prisma.teacher.findUnique.mockResolvedValue(null);
    const next = jest.fn();
    await resolveTeacher(makeReq(1), {}, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  test('WB-RT-04: DB error → forwarded to next', async () => {
    const dbErr = new Error('db down');
    prisma.teacher.findUnique.mockRejectedValue(dbErr);
    const next = jest.fn();
    await resolveTeacher(makeReq(1), {}, next);
    expect(next).toHaveBeenCalledWith(dbErr);
  });
});

// ─── resolveStudent ───────────────────────────────────────────────────────────

describe('resolveStudent', () => {
  beforeEach(() => jest.clearAllMocks());

  test('WB-RS-01: student found → req.student set, next() called without error', async () => {
    const student = { student_id: 9, full_name: 'Siswa', user_id: 1 };
    prisma.student.findUnique.mockResolvedValue(student);
    const req = makeReq(1);
    const next = jest.fn();
    await resolveStudent(req, {}, next);
    expect(req.student).toEqual(student);
    expect(next).toHaveBeenCalledWith();
  });

  test('WB-RS-02: student not found → next(AppError 401)', async () => {
    prisma.student.findUnique.mockResolvedValue(null);
    const next = jest.fn();
    await resolveStudent(makeReq(1), {}, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  test('WB-RS-03: DB error → forwarded to next', async () => {
    const dbErr = new Error('db down');
    prisma.student.findUnique.mockRejectedValue(dbErr);
    const next = jest.fn();
    await resolveStudent(makeReq(1), {}, next);
    expect(next).toHaveBeenCalledWith(dbErr);
  });
});
