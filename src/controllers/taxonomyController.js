/**
 * Taxonomy Controller
 * Manages master data: subjects, grade levels, majors.
 *
 * Design notes:
 *   - Public GET (read) so the dashboard + Flutter app can populate dropdowns
 *     without auth.
 *   - Admin-only POST/PUT/DELETE.
 *   - Deletion is *soft* (is_active = false). Existing exam/student rows hold
 *     these as plain string snapshots and must keep working even after the
 *     taxonomy row is "deleted" - that's why we never hard-delete here.
 *   - PUT supports an opt-in `cascade_rename` flag that updates the matching
 *     string snapshot on Subject across Exam/QuestionBank/Question/Teacher,
 *     on GradeLevel/Major across Exam/QuestionBank/Question/Student. Without
 *     the flag the rename only affects future dropdowns.
 */
const prisma = require('../config/db');
const { asyncHandler, AppError } = require('../utils/asyncHandler');
const { cascadeRename } = require('../services/taxonomyCascadeService');

// Targets for the cascade rename - kept here next to the controller because
// they describe *which historical snapshots this taxonomy lives in*, which
// is controller-level knowledge, not generic service knowledge.
const SUBJECT_TARGETS = [
  { model: 'exam', key: 'exams' },
  { model: 'questionBank', key: 'question_banks' },
  { model: 'question', key: 'questions' },
  { model: 'teacher', key: 'teachers' },
];
const GRADE_LEVEL_TARGETS = [
  { model: 'exam', key: 'exams' },
  { model: 'questionBank', key: 'question_banks' },
  { model: 'question', key: 'questions' },
  { model: 'student', key: 'students' },
];
const MAJOR_TARGETS = GRADE_LEVEL_TARGETS;

// ---------------------------------------------------------------------------
// Combined GET - single call for the dashboard's TaxonomyContext.
// ---------------------------------------------------------------------------
const getTaxonomy = asyncHandler(async (req, res) => {
  // ?include_inactive=true → admin master-data page wants everything
  const includeInactive = req.query.include_inactive === 'true';
  const where = includeInactive ? {} : { is_active: true };

  const [subjects, gradeLevels, majors] = await Promise.all([
    prisma.subject.findMany({ where, orderBy: [{ sort_order: 'asc' }, { name: 'asc' }] }),
    prisma.gradeLevel.findMany({ where, orderBy: [{ sort_order: 'asc' }, { value: 'asc' }] }),
    prisma.major.findMany({ where, orderBy: [{ sort_order: 'asc' }, { value: 'asc' }] }),
  ]);

  res.json({ subjects, grade_levels: gradeLevels, majors });
});

// ---------------------------------------------------------------------------
// SUBJECT
// ---------------------------------------------------------------------------
const createSubject = asyncHandler(async (req, res) => {
  const { name, color, sort_order } = req.body;
  if (!name || !name.trim()) throw new AppError('Nama mata pelajaran wajib diisi', 400);
  const trimmedName = name.trim();

  // A soft-deleted row still holds the unique name, so a plain create would
  // fail. If a matching row exists, revive it when inactive; otherwise it's a
  // genuine duplicate.
  const existing = await prisma.subject.findUnique({ where: { name: trimmedName } });
  if (existing) {
    if (existing.is_active) throw new AppError('Mata pelajaran sudah ada', 409);
    const revived = await prisma.subject.update({
      where: { subject_id: existing.subject_id },
      data: {
        is_active: true,
        color: color?.trim() || null,
        sort_order: Number.isInteger(sort_order) ? sort_order : 0,
      },
    });
    return res.status(200).json({ subject: revived, revived: true });
  }

  const subject = await prisma.subject.create({
    data: {
      name: trimmedName,
      color: color?.trim() || null,
      sort_order: Number.isInteger(sort_order) ? sort_order : 0,
    },
  }).catch((e) => {
    if (e.code === 'P2002') throw new AppError('Mata pelajaran sudah ada', 409);
    throw e;
  });

  res.status(201).json({ subject });
});

const updateSubject = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { name, color, sort_order, is_active, cascade_rename } = req.body;

  const existing = await prisma.subject.findUnique({ where: { subject_id: id } });
  if (!existing) throw new AppError('Mata pelajaran tidak ditemukan', 404);

  const data = {};
  if (name !== undefined) data.name = name.trim();
  if (color !== undefined) data.color = color?.trim() || null;
  if (sort_order !== undefined) data.sort_order = Number(sort_order) || 0;
  if (is_active !== undefined) data.is_active = !!is_active;

  const updated = await prisma.subject.update({
    where: { subject_id: id },
    data,
  }).catch((e) => {
    if (e.code === 'P2002') throw new AppError('Mata pelajaran sudah ada', 409);
    throw e;
  });

  // Cascade rename: rewrite the string snapshot on historical rows so they
  // still point at the renamed taxonomy value instead of dangling at the old
  // one. Skipped unless the caller opts in.
  const cascade = cascade_rename
    ? await cascadeRename({
        field: 'subject',
        oldValue: existing.name,
        newValue: name?.trim(),
        targets: SUBJECT_TARGETS,
      })
    : null;

  res.json({ subject: updated, cascade });
});

const deactivateSubject = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const subject = await prisma.subject.findUnique({ where: { subject_id: id } });
  if (!subject) throw new AppError('Mata pelajaran tidak ditemukan', 404);

  const updated = await prisma.subject.update({
    where: { subject_id: id },
    data: { is_active: false },
  });
  res.json({ subject: updated });
});

// ---------------------------------------------------------------------------
// GRADE LEVEL
// ---------------------------------------------------------------------------
const createGradeLevel = asyncHandler(async (req, res) => {
  const { value, label, sort_order } = req.body;
  if (!value || !value.trim()) throw new AppError('Kode tingkat wajib diisi', 400);
  if (!label || !label.trim()) throw new AppError('Label tingkat wajib diisi', 400);
  const trimmedValue = value.trim();

  // Revive a soft-deleted row that still holds this unique value.
  const existing = await prisma.gradeLevel.findUnique({ where: { value: trimmedValue } });
  if (existing) {
    if (existing.is_active) throw new AppError('Tingkat sudah ada', 409);
    const revived = await prisma.gradeLevel.update({
      where: { grade_level_id: existing.grade_level_id },
      data: {
        is_active: true,
        label: label.trim(),
        sort_order: Number.isInteger(sort_order) ? sort_order : 0,
      },
    });
    return res.status(200).json({ grade_level: revived, revived: true });
  }

  const gl = await prisma.gradeLevel.create({
    data: {
      value: trimmedValue,
      label: label.trim(),
      sort_order: Number.isInteger(sort_order) ? sort_order : 0,
    },
  }).catch((e) => {
    if (e.code === 'P2002') throw new AppError('Tingkat sudah ada', 409);
    throw e;
  });
  res.status(201).json({ grade_level: gl });
});

const updateGradeLevel = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { value, label, sort_order, is_active, cascade_rename } = req.body;

  const existing = await prisma.gradeLevel.findUnique({ where: { grade_level_id: id } });
  if (!existing) throw new AppError('Tingkat tidak ditemukan', 404);

  const data = {};
  if (value !== undefined) data.value = value.trim();
  if (label !== undefined) data.label = label.trim();
  if (sort_order !== undefined) data.sort_order = Number(sort_order) || 0;
  if (is_active !== undefined) data.is_active = !!is_active;

  const updated = await prisma.gradeLevel.update({
    where: { grade_level_id: id },
    data,
  }).catch((e) => {
    if (e.code === 'P2002') throw new AppError('Tingkat sudah ada', 409);
    throw e;
  });

  const cascade = cascade_rename
    ? await cascadeRename({
        field: 'grade_level',
        oldValue: existing.value,
        newValue: value?.trim(),
        targets: GRADE_LEVEL_TARGETS,
      })
    : null;

  res.json({ grade_level: updated, cascade });
});

const deactivateGradeLevel = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const gl = await prisma.gradeLevel.findUnique({ where: { grade_level_id: id } });
  if (!gl) throw new AppError('Tingkat tidak ditemukan', 404);

  const updated = await prisma.gradeLevel.update({
    where: { grade_level_id: id },
    data: { is_active: false },
  });
  res.json({ grade_level: updated });
});

// ---------------------------------------------------------------------------
// MAJOR
// ---------------------------------------------------------------------------
const createMajor = asyncHandler(async (req, res) => {
  const { value, label, sort_order } = req.body;
  if (!value || !value.trim()) throw new AppError('Kode jurusan wajib diisi', 400);
  if (!label || !label.trim()) throw new AppError('Label jurusan wajib diisi', 400);
  const trimmedValue = value.trim();

  // Revive a soft-deleted row that still holds this unique value.
  const existing = await prisma.major.findUnique({ where: { value: trimmedValue } });
  if (existing) {
    if (existing.is_active) throw new AppError('Jurusan sudah ada', 409);
    const revived = await prisma.major.update({
      where: { major_id: existing.major_id },
      data: {
        is_active: true,
        label: label.trim(),
        sort_order: Number.isInteger(sort_order) ? sort_order : 0,
      },
    });
    return res.status(200).json({ major: revived, revived: true });
  }

  const major = await prisma.major.create({
    data: {
      value: trimmedValue,
      label: label.trim(),
      sort_order: Number.isInteger(sort_order) ? sort_order : 0,
    },
  }).catch((e) => {
    if (e.code === 'P2002') throw new AppError('Jurusan sudah ada', 409);
    throw e;
  });
  res.status(201).json({ major });
});

const updateMajor = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { value, label, sort_order, is_active, cascade_rename } = req.body;

  const existing = await prisma.major.findUnique({ where: { major_id: id } });
  if (!existing) throw new AppError('Jurusan tidak ditemukan', 404);

  const data = {};
  if (value !== undefined) data.value = value.trim();
  if (label !== undefined) data.label = label.trim();
  if (sort_order !== undefined) data.sort_order = Number(sort_order) || 0;
  if (is_active !== undefined) data.is_active = !!is_active;

  const updated = await prisma.major.update({
    where: { major_id: id },
    data,
  }).catch((e) => {
    if (e.code === 'P2002') throw new AppError('Jurusan sudah ada', 409);
    throw e;
  });

  const cascade = cascade_rename
    ? await cascadeRename({
        field: 'major',
        oldValue: existing.value,
        newValue: value?.trim(),
        targets: MAJOR_TARGETS,
      })
    : null;

  res.json({ major: updated, cascade });
});

const deactivateMajor = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const major = await prisma.major.findUnique({ where: { major_id: id } });
  if (!major) throw new AppError('Jurusan tidak ditemukan', 404);

  const updated = await prisma.major.update({
    where: { major_id: id },
    data: { is_active: false },
  });
  res.json({ major: updated });
});

module.exports = {
  getTaxonomy,
  createSubject, updateSubject, deactivateSubject,
  createGradeLevel, updateGradeLevel, deactivateGradeLevel,
  createMajor, updateMajor, deactivateMajor,
};
