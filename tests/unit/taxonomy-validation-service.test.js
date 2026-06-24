/**
 * White Box Test: taxonomyValidationService
 * Target: src/services/taxonomyValidationService.js
 */
jest.mock('../../src/config/db');
const prisma = require('../../src/config/db');
const {
  loadActiveTaxonomy,
  parseClassroom,
  assertStudentClassroom,
  assertExamTaxonomy,
} = require('../../src/services/taxonomyValidationService');

beforeEach(() => {
  jest.clearAllMocks();
  prisma.subject.findMany.mockResolvedValue([{ name: 'Matematika' }, { name: 'Fisika' }]);
  prisma.gradeLevel.findMany.mockResolvedValue([{ value: 'X' }, { value: 'XI' }, { value: 'XII' }]);
  prisma.major.findMany.mockResolvedValue([{ value: 'IPA' }, { value: 'IPS' }, { value: 'TKJ' }]);
});

const activeFixture = {
  subjects: new Set(['Matematika', 'Fisika']),
  gradeLevels: new Set(['X', 'XI', 'XII']),
  majors: new Set(['IPA', 'IPS', 'TKJ']),
};

describe('loadActiveTaxonomy', () => {
  test('TV-01: kembalikan Set dari baris aktif', async () => {
    const out = await loadActiveTaxonomy();
    expect(out.subjects.has('Matematika')).toBe(true);
    expect(out.gradeLevels.has('XII')).toBe(true);
    expect(out.majors.has('TKJ')).toBe(true);
    expect(prisma.subject.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { is_active: true } }));
  });
});

describe('parseClassroom', () => {
  test('TV-02: format valid -> komponen', () => {
    expect(parseClassroom('X-IPA-1')).toEqual({ grade: 'X', major: 'IPA', number: '1' });
  });
  test('TV-03: format invalid -> 400', () => {
    expect(() => parseClassroom('ngawur')).toThrow(/Format kelas/);
  });
});

describe('assertStudentClassroom', () => {
  test('TV-04: jurusan taksonomi baru (TKJ) lolos & kembalikan final', () => {
    const out = assertStudentClassroom({ classroom: 'X-TKJ-1' }, activeFixture);
    expect(out).toEqual({ grade_level: 'X', major: 'TKJ' });
  });
  test('TV-05: jurusan tak terdaftar -> 400', () => {
    expect(() => assertStudentClassroom({ classroom: 'X-XXX-1' }, activeFixture)).toThrow(/Jurusan/);
  });
  test('TV-06: tingkat tak terdaftar -> 400', () => {
    expect(() => assertStudentClassroom({ classroom: 'ZZ-IPA-1' }, activeFixture)).toThrow(/Tingkat/);
  });
  test('TV-07: grade_level eksplisit beda dari classroom -> 400', () => {
    expect(() => assertStudentClassroom({ classroom: 'X-IPA-1', grade_level: 'XI' }, activeFixture)).toThrow(/tidak cocok/);
  });
  test('TV-08: major eksplisit beda dari classroom -> 400', () => {
    expect(() => assertStudentClassroom({ classroom: 'X-IPA-1', major: 'IPS' }, activeFixture)).toThrow(/tidak cocok/);
  });
});

describe('assertExamTaxonomy', () => {
  test('TV-09: subject+grade+major aktif lolos', () => {
    expect(() => assertExamTaxonomy({ subject: 'Matematika', grade_level: 'X', major: 'IPA' }, activeFixture)).not.toThrow();
  });
  test('TV-10: subject tak terdaftar -> 400', () => {
    expect(() => assertExamTaxonomy({ subject: 'Astronomi', grade_level: 'X' }, activeFixture)).toThrow(/Mata pelajaran/);
  });
  test('TV-11: major null dilewati (opsional)', () => {
    expect(() => assertExamTaxonomy({ subject: 'Matematika', grade_level: 'X', major: null }, activeFixture)).not.toThrow();
  });
  test('TV-12: grade tak terdaftar -> 400', () => {
    expect(() => assertExamTaxonomy({ subject: 'Matematika', grade_level: 'ZZ' }, activeFixture)).toThrow(/Tingkat/);
  });
});
