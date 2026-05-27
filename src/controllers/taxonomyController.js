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
 *     taxonomy row is "deleted" — that's why we never hard-delete here.
 *   - PUT supports an opt-in `cascade_rename` flag that updates the matching
 *     string snapshot on Subject across Exam/QuestionBank/Question/Teacher,
 *     on GradeLevel/Major across Exam/QuestionBank/Question/Student. Without
 *     the flag the rename only affects future dropdowns.
 */
const prisma = require('../config/db');
const { asyncHandler, AppError } = require('../utils/asyncHandler');

// ---------------------------------------------------------------------------
// Combined GET — single call for the dashboard's TaxonomyContext.
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

  const subject = await prisma.subject.create({
    data: {
      name: name.trim(),
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

  // Cascade rename: also rewrite the string snapshot wherever the OLD name
  // appears, so historical exams/banks/questions/teachers keep linking by
  // label rather than dangling at a renamed value.
  let cascade = null;
  if (cascade_rename && name && name.trim() !== existing.name) {
    const oldName = existing.name;
    const newName = name.trim();
    const [examUp, bankUp, qUp, teacherUp] = await prisma.$transaction([
      prisma.exam.updateMany({ where: { subject: oldName }, data: { subject: newName } }),
      prisma.questionBank.updateMany({ where: { subject: oldName }, data: { subject: newName } }),
      prisma.question.updateMany({ where: { subject: oldName }, data: { subject: newName } }),
      prisma.teacher.updateMany({ where: { subject: oldName }, data: { subject: newName } }),
    ]);
    cascade = {
      exams: examUp.count,
      question_banks: bankUp.count,
      questions: qUp.count,
      teachers: teacherUp.count,
    };
  }

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

  const gl = await prisma.gradeLevel.create({
    data: {
      value: value.trim(),
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

  let cascade = null;
  if (cascade_rename && value && value.trim() !== existing.value) {
    const oldValue = existing.value;
    const newValue = value.trim();
    const [examUp, bankUp, qUp, studentUp] = await prisma.$transaction([
      prisma.exam.updateMany({ where: { grade_level: oldValue }, data: { grade_level: newValue } }),
      prisma.questionBank.updateMany({ where: { grade_level: oldValue }, data: { grade_level: newValue } }),
      prisma.question.updateMany({ where: { grade_level: oldValue }, data: { grade_level: newValue } }),
      prisma.student.updateMany({ where: { grade_level: oldValue }, data: { grade_level: newValue } }),
    ]);
    cascade = {
      exams: examUp.count,
      question_banks: bankUp.count,
      questions: qUp.count,
      students: studentUp.count,
    };
  }

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

  const major = await prisma.major.create({
    data: {
      value: value.trim(),
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

  let cascade = null;
  if (cascade_rename && value && value.trim() !== existing.value) {
    const oldValue = existing.value;
    const newValue = value.trim();
    const [examUp, bankUp, qUp, studentUp] = await prisma.$transaction([
      prisma.exam.updateMany({ where: { major: oldValue }, data: { major: newValue } }),
      prisma.questionBank.updateMany({ where: { major: oldValue }, data: { major: newValue } }),
      prisma.question.updateMany({ where: { major: oldValue }, data: { major: newValue } }),
      prisma.student.updateMany({ where: { major: oldValue }, data: { major: newValue } }),
    ]);
    cascade = {
      exams: examUp.count,
      question_banks: bankUp.count,
      questions: qUp.count,
      students: studentUp.count,
    };
  }

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
