/**
 * User service - Consolidates duplicated user management logic.
 * Extracts classroom validation, user creation with role profile, and pagination helpers.
 */
const prisma = require('../config/db');
const bcrypt = require('bcryptjs');
const { AppError } = require('../utils/asyncHandler');
const { loadActiveTaxonomy, assertStudentClassroom } = require('./taxonomyValidationService');

const SALT_ROUNDS = 12;

/**
 * Create a user with role-specific profile in a transaction.
 * @param {object} params
 * @param {string} params.username
 * @param {string} params.password - plain text, will be hashed
 * @param {string} params.role - 'admin' | 'teacher' | 'student'
 * @param {string} params.full_name
 * @param {string} [params.classroom] - Required for students
 * @param {string} [params.grade_level] - Required for students
 * @param {string} [params.major] - Required for students
 * @param {string} [params.nisn] - Optional for students
 * @param {string} [params.nip] - Optional for teachers
 * @param {string} [params.subject] - Required for teachers
 * @param {boolean} [params.is_coordinator] - Optional for teachers (default false)
 * @param {import('@prisma/client').PrismaClient} [tx] - Optional transaction client
 * @returns {Promise<object>} Created user
 */
// Ubah error unique-constraint Prisma (P2002) jadi pesan ramah per field.
const toFriendlyUniqueError = (error, { username, nip, nisn }) => {
  if (error?.code !== 'P2002') return error;
  const target = Array.isArray(error.meta?.target) ? error.meta.target.join(',') : String(error.meta?.target || '');
  if (target.includes('nip')) return new AppError(`NIP '${nip}' sudah digunakan`, 409);
  if (target.includes('nisn')) return new AppError(`NISN '${nisn}' sudah digunakan`, 409);
  if (target.includes('username')) return new AppError(`Username '${username}' sudah digunakan`, 409);
  return new AppError('Data sudah digunakan (duplikat)', 409);
};

const createUserWithProfile = async (params, tx = prisma, active = null) => {
  const {
    username, password, role, full_name,
    classroom, grade_level, major, nisn,
    nip, subject, is_coordinator
  } = params;

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

  const performCreate = async (client) => {
    const newUser = await client.user.create({
      data: {
        username,
        password: hashedPassword,
        role,
      },
    });

    if (role === 'student') {
      // Validate classroom against active taxonomy and derive grade_level/major.
      let finalGradeLevel = grade_level;
      let finalMajor = major;

      if (classroom) {
        const act = active || await loadActiveTaxonomy(client);
        const derived = assertStudentClassroom({ classroom, grade_level, major }, act);
        finalGradeLevel = derived.grade_level;
        finalMajor = derived.major;
      }

      await client.student.create({
        data: {
          user_id: newUser.id,
          full_name,
          classroom: classroom || '',
          grade_level: finalGradeLevel || '',
          major: finalMajor || '',
          ...(nisn !== undefined && { nisn }),
        },
      });
    } else if (role === 'teacher') {
      if (!subject) {
        throw new AppError('Mata pelajaran (subject) wajib diisi untuk guru', 400);
      }
      await client.teacher.create({
        data: {
          user_id: newUser.id,
          full_name,
          subject,
          is_coordinator: is_coordinator ?? false,
          ...(nip !== undefined && { nip }),
        },
      });
    } else if (role === 'admin') {
      await client.admin.create({
        data: {
          user_id: newUser.id,
          full_name,
        },
      });
    }

    return newUser;
  };

  try {
    // If already in a transaction, use it directly; otherwise wrap in transaction
    if (tx !== prisma) {
      return await performCreate(tx);
    }
    return await prisma.$transaction(performCreate);
  } catch (error) {
    throw toFriendlyUniqueError(error, { username, nip, nisn });
  }
};

/**
 * Build pagination parameters from query.
 * @param {object} query - req.query
 * @param {number} [defaultLimit=10]
 * @returns {{ skip: number, take: number, page: number, limit: number }}
 */
const buildPagination = (query, defaultLimit = 10) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || defaultLimit));
  return {
    skip: (page - 1) * limit,
    take: limit,
    page,
    limit,
  };
};

/**
 * Build paginated response envelope.
 * @param {Array} data
 * @param {number} total
 * @param {number} page
 * @param {number} limit
 * @returns {object}
 */
const paginatedResponse = (data, total, page, limit) => ({
  data,
  pagination: {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  },
});

/**
 * Format user data consistently for API responses.
 * For teachers: includes subject and is_coordinator (only if true).
 * @param {object} user - User with included role profiles
 * @returns {object}
 */
const formatUserData = (user) => {
  const base = {
    id: user.id,
    username: user.username,
    role: user.role,
    is_active: user.is_active,
    is_super_admin: user.is_super_admin,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };

  if (user.role === 'student' && user.student) {
    return {
      ...base,
      full_name: user.student.full_name,
      nisn: user.student.nisn,
      classroom: user.student.classroom,
      grade_level: user.student.grade_level,
      major: user.student.major,
      student_id: user.student.student_id,
    };
  }

  if (user.role === 'teacher' && user.teacher) {
    const teacherData = {
      ...base,
      full_name: user.teacher.full_name,
      nip: user.teacher.nip,
      subject: user.teacher.subject,
      teacher_id: user.teacher.teacher_id,
    };
    // Only include is_coordinator if true
    if (user.teacher.is_coordinator) {
      teacherData.is_coordinator = true;
    }
    return teacherData;
  }

  if (user.role === 'admin' && user.admin) {
    return {
      ...base,
      full_name: user.admin.full_name,
      admin_id: user.admin.admin_id,
    };
  }

  return { ...base, full_name: 'N/A' };
};

module.exports = {
  SALT_ROUNDS,
  createUserWithProfile,
  buildPagination,
  paginatedResponse,
  formatUserData,
};
