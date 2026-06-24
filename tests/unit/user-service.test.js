/**
 * White Box Test: User Service
 * WB-10
 * Target: src/services/userService.js
 *   validateClassroom, validateClassroomConsistency, createUserWithProfile,
 *   buildPagination, paginatedResponse, formatUserData
 */
jest.mock('../../src/config/db');
jest.mock('bcryptjs');
jest.mock('../../src/services/taxonomyValidationService', () => ({
  loadActiveTaxonomy: jest.fn().mockResolvedValue({
    subjects: new Set(['IPA', 'Matematika']),
    gradeLevels: new Set(['X', 'XI', 'XII']),
    majors: new Set(['IPA', 'IPS', 'TKJ', 'Bahasa']),
  }),
  assertStudentClassroom: jest.fn(({ classroom }) => {
    const [grade, major] = classroom.split('-');
    return { grade_level: grade, major };
  }),
}));

const prisma = require('../../src/config/db');
const bcrypt = require('bcryptjs');
const {
  createUserWithProfile,
  buildPagination,
  paginatedResponse,
  formatUserData,
} = require('../../src/services/userService');
const { AppError } = require('../../src/utils/asyncHandler');

// ─── createUserWithProfile ────────────────────────────────────────────────────

describe('createUserWithProfile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    bcrypt.hash.mockResolvedValue('hashed-pw');
    prisma.$transaction.mockImplementation((fn) => fn(prisma));
    prisma.user.create.mockResolvedValue({ id: 100 });
    prisma.student.create.mockResolvedValue({});
    prisma.teacher.create.mockResolvedValue({});
    prisma.admin.create.mockResolvedValue({});
  });

  test('WB-US-09: hashes password with SALT_ROUNDS before storing', async () => {
    await createUserWithProfile({ username: 'a', password: 'plain', role: 'admin', full_name: 'A' });
    expect(bcrypt.hash).toHaveBeenCalledWith('plain', 12);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ password: 'hashed-pw' }) })
    );
  });

  test('WB-US-10: admin role → admin profile created', async () => {
    await createUserWithProfile({ username: 'a', password: 'p', role: 'admin', full_name: 'Admin' });
    expect(prisma.admin.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ user_id: 100, full_name: 'Admin' }) })
    );
  });

  test('WB-US-11: teacher role without subject → AppError 400', async () => {
    await expect(
      createUserWithProfile({ username: 't', password: 'p', role: 'teacher', full_name: 'T' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('WB-US-12: teacher role with subject → teacher profile created (is_coordinator defaults false)', async () => {
    await createUserWithProfile({ username: 't', password: 'p', role: 'teacher', full_name: 'T', subject: 'IPA' });
    expect(prisma.teacher.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ subject: 'IPA', is_coordinator: false }) })
    );
  });

  test('WB-US-13: student dengan classroom → grade_level & major dari taksonomi (roman)', async () => {
    await createUserWithProfile({ username: 's', password: 'p', role: 'student', full_name: 'S', classroom: 'XI-IPA-1' });
    expect(prisma.student.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ classroom: 'XI-IPA-1', grade_level: 'XI', major: 'IPA' }) })
    );
  });

  test('WB-US-14: student dengan jurusan taksonomi baru (TKJ) → tersimpan', async () => {
    const { assertStudentClassroom } = require('../../src/services/taxonomyValidationService');
    assertStudentClassroom.mockReturnValueOnce({ grade_level: 'X', major: 'TKJ' });
    await createUserWithProfile({ username: 's', password: 'p', role: 'student', full_name: 'S', classroom: 'X-TKJ-1' });
    expect(prisma.student.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ major: 'TKJ' }) })
    );
  });

  test('WB-US-15: provided tx is used directly (no nested $transaction)', async () => {
    const tx = {
      user: { create: jest.fn().mockResolvedValue({ id: 7 }) },
      admin: { create: jest.fn().mockResolvedValue({}) },
    };
    const result = await createUserWithProfile({ username: 'a', password: 'p', role: 'admin', full_name: 'A' }, tx);
    expect(tx.user.create).toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 7 });
  });

  test('WB-US-16: duplikat username (P2002) -> AppError 409 ramah', async () => {
    const dupErr = Object.assign(new Error('Unique constraint failed'), { code: 'P2002', meta: { target: ['users_username_key'] } });
    prisma.user.create.mockRejectedValue(dupErr);
    await expect(
      createUserWithProfile({ username: 'admin1', password: 'p', role: 'admin', full_name: 'A' })
    ).rejects.toMatchObject({ statusCode: 409, message: "Username 'admin1' sudah digunakan" });
  });

  test('WB-US-17: duplikat NIP (P2002) -> AppError 409 ramah', async () => {
    const dupErr = Object.assign(new Error('Unique constraint failed'), { code: 'P2002', meta: { target: ['teachers_nip_key'] } });
    prisma.teacher.create.mockRejectedValue(dupErr);
    await expect(
      createUserWithProfile({ username: 't', password: 'p', role: 'teacher', full_name: 'T', subject: 'IPA', nip: '123' })
    ).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/NIP.*sudah digunakan/i) });
  });
});

// ─── buildPagination ──────────────────────────────────────────────────────────

describe('buildPagination', () => {
  test('WB-US-16: defaults to page 1, default limit', () => {
    expect(buildPagination({})).toEqual({ skip: 0, take: 10, page: 1, limit: 10 });
  });

  test('WB-US-17: computes skip from page and limit', () => {
    expect(buildPagination({ page: '3', limit: '20' })).toEqual({ skip: 40, take: 20, page: 3, limit: 20 });
  });

  test('WB-US-18: page < 1 is clamped to 1', () => {
    expect(buildPagination({ page: '0' }).page).toBe(1);
    expect(buildPagination({ page: '-5' }).page).toBe(1);
  });

  test('WB-US-19: limit above 100 is clamped down to 100', () => {
    expect(buildPagination({ limit: '500' }).limit).toBe(100);
  });

  test('WB-US-19b: negative limit is clamped up to 1', () => {
    expect(buildPagination({ limit: '-5' }).limit).toBe(1);
  });

  test('WB-US-20: custom defaultLimit honoured when limit absent', () => {
    expect(buildPagination({}, 25).limit).toBe(25);
  });
});

// ─── paginatedResponse ────────────────────────────────────────────────────────

describe('paginatedResponse', () => {
  test('WB-US-21: wraps data and computes totalPages (ceil)', () => {
    expect(paginatedResponse([1, 2], 21, 1, 10)).toEqual({
      data: [1, 2],
      pagination: { total: 21, page: 1, limit: 10, totalPages: 3 },
    });
  });

  test('WB-US-22: zero total → totalPages 0', () => {
    expect(paginatedResponse([], 0, 1, 10).pagination.totalPages).toBe(0);
  });
});

// ─── formatUserData ───────────────────────────────────────────────────────────

describe('formatUserData', () => {
  const base = { id: 1, username: 'u', is_active: true, is_super_admin: false, created_at: 'c', updated_at: 'u2' };

  test('WB-US-23: student → flattens student profile fields', () => {
    const out = formatUserData({ ...base, role: 'student', student: { full_name: 'S', nisn: '123', classroom: 'X-IPA-1', grade_level: '10', major: 'IPA', student_id: 9 } });
    expect(out).toMatchObject({ role: 'student', full_name: 'S', classroom: 'X-IPA-1', student_id: 9 });
  });

  test('WB-US-24: teacher with is_coordinator=true → field present', () => {
    const out = formatUserData({ ...base, role: 'teacher', teacher: { full_name: 'T', nip: null, subject: 'IPA', teacher_id: 3, is_coordinator: true } });
    expect(out.is_coordinator).toBe(true);
  });

  test('WB-US-25: teacher with is_coordinator=false → field omitted', () => {
    const out = formatUserData({ ...base, role: 'teacher', teacher: { full_name: 'T', nip: null, subject: 'IPA', teacher_id: 3, is_coordinator: false } });
    expect(out.is_coordinator).toBeUndefined();
  });

  test('WB-US-26: admin → flattens admin profile fields', () => {
    const out = formatUserData({ ...base, role: 'admin', admin: { full_name: 'A', admin_id: 2 } });
    expect(out).toMatchObject({ role: 'admin', full_name: 'A', admin_id: 2 });
  });

  test('WB-US-27: role profile missing → full_name fallback N/A', () => {
    const out = formatUserData({ ...base, role: 'student', student: null });
    expect(out.full_name).toBe('N/A');
  });
});
