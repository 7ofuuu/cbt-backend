/**
 * Middleware to resolve teacher/student profiles from authenticated user.
 * Eliminates repeated teacher/student lookup boilerplate in controllers.
 *
 * Usage in routes:
 *   router.get('/path', verifyToken, resolveTeacher, handler);
 *   router.get('/path', verifyToken, resolveStudent, handler);
 *
 * After middleware runs:
 *   req.teacher = { teacher_id, full_name, ... }
 *   req.student = { student_id, full_name, ... }
 */
const prisma = require('../config/db');
const { AppError } = require('../utils/asyncHandler');

/**
 * Resolves teacher profile from req.user.id.
 * Sets req.teacher with teacher record.
 */
const resolveTeacher = async (req, _res, next) => {
  try {
    const teacher = await prisma.teacher.findUnique({
      where: { user_id: req.user.id },
    });

    if (!teacher) {
      throw new AppError('Guru tidak ditemukan', 404);
    }

    req.teacher = teacher;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Resolves student profile from req.user.id.
 * Sets req.student with student record.
 */
const resolveStudent = async (req, _res, next) => {
  try {
    const student = await prisma.student.findUnique({
      where: { user_id: req.user.id },
    });

    if (!student) {
      throw new AppError('Siswa tidak ditemukan', 404);
    }

    req.student = student;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { resolveTeacher, resolveStudent };
