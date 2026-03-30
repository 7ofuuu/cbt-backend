/**
 * Subject Access Service
 * Handles subject-based access control for teachers.
 * Coordinators bypass all subject checks.
 */
const { AppError } = require('../utils/asyncHandler');

/**
 * Check if teacher is a coordinator.
 * @param {object} teacher - Teacher object from req.teacher
 * @returns {boolean}
 */
const isCoordinator = (teacher) => {
  return teacher?.is_coordinator === true;
};

/**
 * Get teacher's subject.
 * @param {object} teacher - Teacher object from req.teacher
 * @returns {string|null}
 */
const getTeacherSubject = (teacher) => {
  return teacher?.subject || null;
};

/**
 * Check if teacher has access to a resource based on subject.
 * Coordinators always have access.
 * @param {object} teacher - Teacher object from req.teacher
 * @param {string} resourceSubject - Subject of the resource
 * @returns {boolean}
 */
const hasSubjectAccess = (teacher, resourceSubject) => {
  if (isCoordinator(teacher)) return true;
  if (!teacher?.subject || !resourceSubject) return false;
  return teacher.subject === resourceSubject;
};

/**
 * Validate subject access and throw error if denied.
 * @param {object} teacher - Teacher object from req.teacher
 * @param {string} resourceSubject - Subject of the resource
 * @param {string} [resourceType='resource'] - Type of resource for error message
 * @throws {AppError} if access denied
 */
const validateSubjectAccess = (teacher, resourceSubject, resourceType = 'resource') => {
  if (!hasSubjectAccess(teacher, resourceSubject)) {
    throw new AppError(
      `Anda tidak memiliki akses ke ${resourceType} dengan mata pelajaran "${resourceSubject}"`,
      403
    );
  }
};

/**
 * Build subject filter for database queries.
 * Returns empty object for coordinators (no filter).
 * @param {object} teacher - Teacher object from req.teacher
 * @param {string} [fieldName='subject'] - Field name to filter
 * @returns {object} Prisma where clause
 */
const buildSubjectFilter = (teacher, fieldName = 'subject') => {
  if (isCoordinator(teacher)) return {};
  if (!teacher?.subject) {
    throw new AppError('Profil guru belum memiliki mata pelajaran', 400);
  }
  return { [fieldName]: teacher.subject };
};

/**
 * Get subject for resource creation.
 * Coordinators can specify any subject, regular teachers use their own.
 * @param {object} teacher - Teacher object from req.teacher
 * @param {string|null} requestedSubject - Subject from request body
 * @returns {string}
 * @throws {AppError} if no subject available
 */
const getSubjectForCreate = (teacher, requestedSubject) => {
  if (isCoordinator(teacher)) {
    // Coordinator can specify any subject, or use their own as default
    if (!requestedSubject && !teacher?.subject) {
      throw new AppError('Mata pelajaran wajib diisi untuk koordinator tanpa mapel default', 400);
    }
    return requestedSubject || teacher.subject;
  }
  if (!teacher?.subject) {
    throw new AppError('Profil guru belum memiliki mata pelajaran', 400);
  }
  // Regular teacher must use their own subject
  if (requestedSubject && requestedSubject !== teacher.subject) {
    throw new AppError(
      `Anda hanya dapat membuat resource untuk mata pelajaran "${teacher.subject}"`,
      403
    );
  }
  return teacher.subject;
};

module.exports = {
  isCoordinator,
  getTeacherSubject,
  hasSubjectAccess,
  validateSubjectAccess,
  buildSubjectFilter,
  getSubjectForCreate,
};
