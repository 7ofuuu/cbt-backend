/**
 * White Box Test: Taxonomy Controller
 * WB-21
 * Target: src/controllers/taxonomyController.js
 *   subjects / grade levels / majors master data (CRUD + soft delete + cascade)
 */
jest.mock('../../src/config/db');
jest.mock('../../src/services/taxonomyCascadeService', () => ({
  cascadeRename: jest.fn().mockResolvedValue({ exams: 1 }),
}));

const prisma = require('../../src/config/db');
const { cascadeRename } = require('../../src/services/taxonomyCascadeService');
const ctrl = require('../../src/controllers/taxonomyController');

const makeReqRes = (overrides = {}) => {
  const req = { body: {}, params: {}, query: {}, ...overrides };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  const next = jest.fn();
  return { req, res, next };
};
const flush = () => new Promise((r) => setImmediate(r));
const run = async (handler, overrides) => {
  const ctx = makeReqRes(overrides);
  handler(ctx.req, ctx.res, ctx.next);
  await flush();
  return ctx;
};

beforeEach(() => jest.clearAllMocks());

// ─── getTaxonomy ──────────────────────────────────────────────────────────────

describe('getTaxonomy', () => {
  test('WB-TX-01: default → only active rows (is_active filter)', async () => {
    prisma.subject.findMany.mockResolvedValue([]);
    prisma.gradeLevel.findMany.mockResolvedValue([]);
    prisma.major.findMany.mockResolvedValue([]);
    await run(ctrl.getTaxonomy, { query: {} });
    expect(prisma.subject.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { is_active: true } }));
  });

  test('WB-TX-02: include_inactive=true → no is_active filter', async () => {
    prisma.subject.findMany.mockResolvedValue([{ subject_id: 1 }]);
    prisma.gradeLevel.findMany.mockResolvedValue([]);
    prisma.major.findMany.mockResolvedValue([]);
    const { res } = await run(ctrl.getTaxonomy, { query: { include_inactive: 'true' } });
    expect(prisma.subject.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ subjects: [{ subject_id: 1 }] }));
  });
});

// ─── SUBJECT ──────────────────────────────────────────────────────────────────

describe('createSubject', () => {
  test('WB-TX-03: missing name → 400', async () => {
    const { next } = await run(ctrl.createSubject, { body: { name: '  ' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-TX-04: duplicate (P2002) → 409', async () => {
    prisma.subject.create.mockRejectedValue({ code: 'P2002' });
    const { next } = await run(ctrl.createSubject, { body: { name: 'IPA' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 409 }));
  });

  test('WB-TX-05: valid → 201', async () => {
    prisma.subject.create.mockResolvedValue({ subject_id: 1, name: 'IPA' });
    const { res } = await run(ctrl.createSubject, { body: { name: 'IPA' } });
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe('updateSubject', () => {
  test('WB-TX-06: not found → 404', async () => {
    prisma.subject.findUnique.mockResolvedValue(null);
    const { next } = await run(ctrl.updateSubject, { params: { id: '1' }, body: { name: 'X' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('WB-TX-07: valid without cascade → cascade is null', async () => {
    prisma.subject.findUnique.mockResolvedValue({ subject_id: 1, name: 'IPA' });
    prisma.subject.update.mockResolvedValue({ subject_id: 1, name: 'IPA Baru' });
    const { res } = await run(ctrl.updateSubject, { params: { id: '1' }, body: { name: 'IPA Baru' } });
    expect(cascadeRename).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].cascade).toBeNull();
  });

  test('WB-TX-08: cascade_rename=true → cascadeRename service invoked', async () => {
    prisma.subject.findUnique.mockResolvedValue({ subject_id: 1, name: 'IPA' });
    prisma.subject.update.mockResolvedValue({ subject_id: 1, name: 'IPA Baru' });
    const { res } = await run(ctrl.updateSubject, { params: { id: '1' }, body: { name: 'IPA Baru', cascade_rename: true } });
    expect(cascadeRename).toHaveBeenCalledWith(expect.objectContaining({ field: 'subject', oldValue: 'IPA', newValue: 'IPA Baru' }));
    expect(res.json.mock.calls[0][0].cascade).toEqual({ exams: 1 });
  });
});

describe('deactivateSubject', () => {
  test('WB-TX-09: not found → 404', async () => {
    prisma.subject.findUnique.mockResolvedValue(null);
    const { next } = await run(ctrl.deactivateSubject, { params: { id: '1' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('WB-TX-10: valid → soft delete (is_active false)', async () => {
    prisma.subject.findUnique.mockResolvedValue({ subject_id: 1 });
    prisma.subject.update.mockResolvedValue({ subject_id: 1, is_active: false });
    const { res } = await run(ctrl.deactivateSubject, { params: { id: '1' } });
    expect(prisma.subject.update).toHaveBeenCalledWith(expect.objectContaining({ data: { is_active: false } }));
    expect(res.json.mock.calls[0][0].subject.is_active).toBe(false);
  });
});

// ─── GRADE LEVEL ──────────────────────────────────────────────────────────────

describe('createGradeLevel', () => {
  test('WB-TX-11: missing value → 400', async () => {
    const { next } = await run(ctrl.createGradeLevel, { body: { label: 'Kelas 10' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-TX-12: missing label → 400', async () => {
    const { next } = await run(ctrl.createGradeLevel, { body: { value: '10' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-TX-13: valid → 201', async () => {
    prisma.gradeLevel.create.mockResolvedValue({ grade_level_id: 1 });
    const { res } = await run(ctrl.createGradeLevel, { body: { value: '10', label: 'Kelas 10' } });
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe('updateGradeLevel', () => {
  test('WB-TX-14: not found → 404', async () => {
    prisma.gradeLevel.findUnique.mockResolvedValue(null);
    const { next } = await run(ctrl.updateGradeLevel, { params: { id: '1' }, body: {} });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('WB-TX-15: cascade_rename=true → cascade on grade_level field', async () => {
    prisma.gradeLevel.findUnique.mockResolvedValue({ grade_level_id: 1, value: '10' });
    prisma.gradeLevel.update.mockResolvedValue({ grade_level_id: 1, value: 'X' });
    await run(ctrl.updateGradeLevel, { params: { id: '1' }, body: { value: 'X', cascade_rename: true } });
    expect(cascadeRename).toHaveBeenCalledWith(expect.objectContaining({ field: 'grade_level', oldValue: '10', newValue: 'X' }));
  });
});

describe('deactivateGradeLevel', () => {
  test('WB-TX-16: valid → soft delete', async () => {
    prisma.gradeLevel.findUnique.mockResolvedValue({ grade_level_id: 1 });
    prisma.gradeLevel.update.mockResolvedValue({ grade_level_id: 1, is_active: false });
    const { res } = await run(ctrl.deactivateGradeLevel, { params: { id: '1' } });
    expect(res.json.mock.calls[0][0].grade_level.is_active).toBe(false);
  });
});

// ─── MAJOR ────────────────────────────────────────────────────────────────────

describe('createMajor', () => {
  test('WB-TX-17: missing value/label → 400', async () => {
    const { next } = await run(ctrl.createMajor, { body: { value: 'IPA' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-TX-18: valid → 201', async () => {
    prisma.major.create.mockResolvedValue({ major_id: 1 });
    const { res } = await run(ctrl.createMajor, { body: { value: 'IPA', label: 'Ilmu Alam' } });
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe('updateMajor', () => {
  test('WB-TX-19: not found → 404', async () => {
    prisma.major.findUnique.mockResolvedValue(null);
    const { next } = await run(ctrl.updateMajor, { params: { id: '1' }, body: {} });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('WB-TX-20: valid → 200', async () => {
    prisma.major.findUnique.mockResolvedValue({ major_id: 1, value: 'IPA' });
    prisma.major.update.mockResolvedValue({ major_id: 1, value: 'IPA' });
    const { res } = await run(ctrl.updateMajor, { params: { id: '1' }, body: { label: 'baru' } });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ major: expect.any(Object) }));
  });
});

describe('deactivateMajor', () => {
  test('WB-TX-21: not found → 404', async () => {
    prisma.major.findUnique.mockResolvedValue(null);
    const { next } = await run(ctrl.deactivateMajor, { params: { id: '1' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('WB-TX-22: valid → soft delete', async () => {
    prisma.major.findUnique.mockResolvedValue({ major_id: 1 });
    prisma.major.update.mockResolvedValue({ major_id: 1, is_active: false });
    const { res } = await run(ctrl.deactivateMajor, { params: { id: '1' } });
    expect(res.json.mock.calls[0][0].major.is_active).toBe(false);
  });
});
