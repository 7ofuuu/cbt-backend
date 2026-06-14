/**
 * White Box Test: Subject Access Service
 * WB-7 - SB-70
 * Target: src/services/subjectAccessService.js
 * No mocks needed - pure functions operating on plain objects.
 */
const {
  isCoordinator,
  getTeacherSubject,
  hasSubjectAccess,
  validateSubjectAccess,
  buildSubjectFilter,
  getSubjectForCreate,
} = require('../../src/services/subjectAccessService');

const { AppError } = require('../../src/utils/asyncHandler');

// ─── Helpers ────────────────────────────────────────────────────────────────

const makeTeacher = (overrides = {}) => ({
  teacher_id: 1,
  full_name: 'Guru Satu',
  subject: 'Matematika',
  is_coordinator: false,
  user_id: 2,
  ...overrides,
});

// ─── isCoordinator ───────────────────────────────────────────────────────────

describe('isCoordinator', () => {
  test('WB-SA-01: returns true when is_coordinator = true', () => {
    expect(isCoordinator(makeTeacher({ is_coordinator: true }))).toBe(true);
  });

  test('WB-SA-02: returns false when is_coordinator = false', () => {
    expect(isCoordinator(makeTeacher({ is_coordinator: false }))).toBe(false);
  });

  test('WB-SA-03: returns false when teacher is null', () => {
    expect(isCoordinator(null)).toBe(false);
  });

  test('WB-SA-04: returns false when teacher is undefined', () => {
    expect(isCoordinator(undefined)).toBe(false);
  });
});

// ─── getTeacherSubject ───────────────────────────────────────────────────────

describe('getTeacherSubject', () => {
  test('WB-SA-05: returns subject string when available', () => {
    expect(getTeacherSubject(makeTeacher())).toBe('Matematika');
  });

  test('WB-SA-06: returns null when teacher has no subject', () => {
    expect(getTeacherSubject(makeTeacher({ subject: null }))).toBeNull();
  });

  test('WB-SA-07: returns null when teacher is null', () => {
    expect(getTeacherSubject(null)).toBeNull();
  });
});

// ─── hasSubjectAccess ────────────────────────────────────────────────────────

describe('hasSubjectAccess', () => {
  test('WB-SA-08: coordinator always has access regardless of subject', () => {
    const coord = makeTeacher({ is_coordinator: true, subject: 'Matematika' });
    expect(hasSubjectAccess(coord, 'Fisika')).toBe(true);
    expect(hasSubjectAccess(coord, null)).toBe(true);
    expect(hasSubjectAccess(coord, 'Biologi')).toBe(true);
  });

  test('WB-SA-09: regular teacher has access when subjects match', () => {
    const teacher = makeTeacher({ subject: 'Matematika' });
    expect(hasSubjectAccess(teacher, 'Matematika')).toBe(true);
  });

  test('WB-SA-10: regular teacher denied when subjects differ', () => {
    const teacher = makeTeacher({ subject: 'Matematika' });
    expect(hasSubjectAccess(teacher, 'Fisika')).toBe(false);
  });

  test('WB-SA-11: returns false when teacher has no subject', () => {
    const teacher = makeTeacher({ subject: null });
    expect(hasSubjectAccess(teacher, 'Matematika')).toBe(false);
  });

  test('WB-SA-12: returns false when resourceSubject is null', () => {
    const teacher = makeTeacher({ subject: 'Matematika' });
    expect(hasSubjectAccess(teacher, null)).toBe(false);
  });

  test('WB-SA-13: returns false when both teacher and resourceSubject are null', () => {
    expect(hasSubjectAccess(makeTeacher({ subject: null }), null)).toBe(false);
  });
});

// ─── validateSubjectAccess ───────────────────────────────────────────────────

describe('validateSubjectAccess', () => {
  test('WB-SA-14: does not throw for coordinator accessing any subject', () => {
    const coord = makeTeacher({ is_coordinator: true });
    expect(() => validateSubjectAccess(coord, 'Kimia')).not.toThrow();
  });

  test('WB-SA-15: does not throw when teacher subject matches', () => {
    const teacher = makeTeacher({ subject: 'Bahasa Indonesia' });
    expect(() => validateSubjectAccess(teacher, 'Bahasa Indonesia')).not.toThrow();
  });

  test('WB-SA-16: throws AppError 403 when access denied', () => {
    const teacher = makeTeacher({ subject: 'Matematika' });
    expect(() => validateSubjectAccess(teacher, 'Fisika', 'bank soal')).toThrow(AppError);
  });

  test('WB-SA-17: thrown error has statusCode 403', () => {
    const teacher = makeTeacher({ subject: 'Matematika' });
    let err;
    try {
      validateSubjectAccess(teacher, 'Fisika', 'soal');
    } catch (e) {
      err = e;
    }
    expect(err.statusCode).toBe(403);
    expect(err.message).toContain('Fisika');
  });
});

// ─── buildSubjectFilter ──────────────────────────────────────────────────────

describe('buildSubjectFilter', () => {
  test('WB-SA-18: coordinator returns empty object (no filter)', () => {
    const coord = makeTeacher({ is_coordinator: true });
    expect(buildSubjectFilter(coord)).toEqual({});
  });

  test('WB-SA-19: regular teacher returns filter with default field name', () => {
    const teacher = makeTeacher({ subject: 'Biologi' });
    expect(buildSubjectFilter(teacher)).toEqual({ subject: 'Biologi' });
  });

  test('WB-SA-20: custom fieldName is used in returned object', () => {
    const teacher = makeTeacher({ subject: 'Kimia' });
    expect(buildSubjectFilter(teacher, 'question_subject')).toEqual({ question_subject: 'Kimia' });
  });

  test('WB-SA-21: throws AppError 400 when regular teacher has no subject', () => {
    const teacher = makeTeacher({ subject: null });
    expect(() => buildSubjectFilter(teacher)).toThrow(AppError);
    let err;
    try {
      buildSubjectFilter(teacher);
    } catch (e) {
      err = e;
    }
    expect(err.statusCode).toBe(400);
  });
});

// ─── getSubjectForCreate ─────────────────────────────────────────────────────

describe('getSubjectForCreate', () => {
  test('WB-SA-22: coordinator with requestedSubject → returns requestedSubject', () => {
    const coord = makeTeacher({ is_coordinator: true, subject: 'Matematika' });
    expect(getSubjectForCreate(coord, 'Fisika')).toBe('Fisika');
  });

  test('WB-SA-23: coordinator without requestedSubject → returns own subject', () => {
    const coord = makeTeacher({ is_coordinator: true, subject: 'Matematika' });
    expect(getSubjectForCreate(coord, null)).toBe('Matematika');
  });

  test('WB-SA-24: coordinator without requestedSubject and no own subject → throws 400', () => {
    const coord = makeTeacher({ is_coordinator: true, subject: null });
    expect(() => getSubjectForCreate(coord, null)).toThrow(AppError);
    let err;
    try {
      getSubjectForCreate(coord, null);
    } catch (e) {
      err = e;
    }
    expect(err.statusCode).toBe(400);
  });

  test('WB-SA-25: regular teacher without requestedSubject → returns own subject', () => {
    const teacher = makeTeacher({ subject: 'Sejarah' });
    expect(getSubjectForCreate(teacher, null)).toBe('Sejarah');
  });

  test('WB-SA-26: regular teacher with requestedSubject matching own → returns it', () => {
    const teacher = makeTeacher({ subject: 'Sejarah' });
    expect(getSubjectForCreate(teacher, 'Sejarah')).toBe('Sejarah');
  });

  test('WB-SA-27: regular teacher with requestedSubject differing → throws 403', () => {
    const teacher = makeTeacher({ subject: 'Sejarah' });
    expect(() => getSubjectForCreate(teacher, 'Fisika')).toThrow(AppError);
    let err;
    try {
      getSubjectForCreate(teacher, 'Fisika');
    } catch (e) {
      err = e;
    }
    expect(err.statusCode).toBe(403);
  });

  test('WB-SA-28: regular teacher with no subject → throws 400', () => {
    const teacher = makeTeacher({ subject: null });
    expect(() => getSubjectForCreate(teacher, null)).toThrow(AppError);
    let err;
    try {
      getSubjectForCreate(teacher, null);
    } catch (e) {
      err = e;
    }
    expect(err.statusCode).toBe(400);
  });
});
