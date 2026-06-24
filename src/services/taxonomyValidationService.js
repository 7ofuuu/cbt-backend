const prisma = require('../config/db');
const { AppError } = require('../utils/asyncHandler');

// Format kelas generik: <tingkat>-<jurusan>-<nomor>, mis. X-IPA-1, XI-TKJ-2.
const CLASSROOM_RE = /^([^-]+)-([^-]+)-(\d+)$/;

const loadActiveTaxonomy = async (tx = prisma) => {
  const [subjects, gradeLevels, majors] = await Promise.all([
    tx.subject.findMany({ where: { is_active: true }, select: { name: true } }),
    tx.gradeLevel.findMany({ where: { is_active: true }, select: { value: true } }),
    tx.major.findMany({ where: { is_active: true }, select: { value: true } }),
  ]);
  return {
    subjects: new Set(subjects.map((s) => s.name)),
    gradeLevels: new Set(gradeLevels.map((g) => g.value)),
    majors: new Set(majors.map((m) => m.value)),
  };
};

const parseClassroom = (classroom) => {
  const m = String(classroom || '').trim().match(CLASSROOM_RE);
  if (!m) {
    throw new AppError('Format kelas tidak valid. Gunakan <tingkat>-<jurusan>-<nomor>, contoh X-IPA-1', 400);
  }
  return { grade: m[1], major: m[2], number: m[3] };
};

const assertStudentClassroom = ({ classroom, grade_level, major }, active) => {
  const parsed = parseClassroom(classroom);

  if (!active.gradeLevels.has(parsed.grade)) {
    throw new AppError(`Tingkat '${parsed.grade}' tidak terdaftar atau tidak aktif di taksonomi`, 400);
  }
  if (!active.majors.has(parsed.major)) {
    throw new AppError(`Jurusan '${parsed.major}' tidak terdaftar atau tidak aktif di taksonomi`, 400);
  }
  if (grade_level && grade_level !== parsed.grade) {
    throw new AppError(`Tingkat '${grade_level}' tidak cocok dengan kelas ${classroom}`, 400);
  }
  if (major && major !== parsed.major) {
    throw new AppError(`Jurusan '${major}' tidak cocok dengan kelas ${classroom}`, 400);
  }
  return { grade_level: parsed.grade, major: parsed.major };
};

const assertExamTaxonomy = ({ subject, grade_level, major }, active) => {
  if (subject != null && !active.subjects.has(subject)) {
    throw new AppError(`Mata pelajaran '${subject}' tidak terdaftar atau tidak aktif di taksonomi`, 400);
  }
  if (grade_level != null && !active.gradeLevels.has(grade_level)) {
    throw new AppError(`Tingkat '${grade_level}' tidak terdaftar atau tidak aktif di taksonomi`, 400);
  }
  if (major != null && major !== '' && !active.majors.has(major)) {
    throw new AppError(`Jurusan '${major}' tidak terdaftar atau tidak aktif di taksonomi`, 400);
  }
};

module.exports = { loadActiveTaxonomy, parseClassroom, assertStudentClassroom, assertExamTaxonomy };
