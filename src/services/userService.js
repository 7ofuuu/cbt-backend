/**
 * User service - Consolidates duplicated user management logic.
 * Extracts classroom validation, user creation with role profile, and pagination helpers.
 */
const prisma = require('../config/db');
const bcrypt = require('bcryptjs');
const { AppError } = require('../utils/asyncHandler');

const SALT_ROUNDS = 12;

/**
 * Valid classroom format: X-IPA-1, XI-IPS-2, XII-Bahasa-3, etc.
 */
const CLASSROOM_REGEX = /^(X|XI|XII)-(IPA|IPS|Bahasa)-(\d+)$/;

/**
 * Map classroom prefix to grade_level
 */
const GRADE_LEVEL_MAP = { X: '10', XI: '11', XII: '12' };

/**
 * Map grade_level to valid classroom prefixes
 */
const GRADE_TO_PREFIX = { '10': 'X', '11': 'XI', '12': 'XII' };

/**
 * Validate classroom format and extract components.
 * @param {string} classroom
 * @returns {{ prefix: string, major: string, number: string }}
 * @throws {AppError} if format is invalid
 */
const validateClassroom = (classroom) => {
  const match = classroom.match(CLASSROOM_REGEX);
  if (!match) {
    throw new AppError(
      'Format kelas tidak valid. Gunakan format: X-IPA-1, XI-IPS-2, XII-Bahasa-3',
      400
    );
  }
  return { prefix: match[1], major: match[2], number: match[3] };
};

/**
 * Validate that classroom, grade_level, and major are consistent.
 * @param {string} classroom
 * @param {string} gradeLevel
 * @param {string} major
 * @throws {AppError} if inconsistent
 */
const validateClassroomConsistency = (classroom, gradeLevel, major) => {
  const { prefix, major: classMajor } = validateClassroom(classroom);

  // Validate grade_level matches classroom prefix
  if (gradeLevel) {
    const expectedPrefix = GRADE_TO_PREFIX[gradeLevel];
    if (expectedPrefix && expectedPrefix !== prefix) {
      throw new AppError(
        `Tingkat ${gradeLevel} tidak sesuai dengan kelas ${classroom}. Seharusnya dimulai dengan ${expectedPrefix}`,
        400
      );
    }
  }

  // Validate major matches classroom major
  if (major && major !== classMajor) {
    throw new AppError(
      `Jurusan ${major} tidak sesuai dengan kelas ${classroom}. Seharusnya ${classMajor}`,
      400
    );
  }

  return {
    grade_level: gradeLevel || GRADE_LEVEL_MAP[prefix],
    major: major || classMajor,
  };
};

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
 * @param {import('@prisma/client').PrismaClient} [tx] - Optional transaction client
 * @returns {Promise<object>} Created user
 */
const createUserWithProfile = async (params, tx = prisma) => {
  const { username, password, role, full_name, classroom, grade_level, major, nisn, nip } = params;

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
      // Validate and auto-derive classroom fields
      let finalGradeLevel = grade_level;
      let finalMajor = major;

      if (classroom) {
        const derived = validateClassroomConsistency(classroom, grade_level, major);
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
      await client.teacher.create({
        data: {
          user_id: newUser.id,
          full_name,
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

  // If already in a transaction, use it directly; otherwise wrap in transaction
  if (tx !== prisma) {
    return performCreate(tx);
  }
  return prisma.$transaction(performCreate);
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
    return {
      ...base,
      full_name: user.teacher.full_name,
      nip: user.teacher.nip,
      teacher_id: user.teacher.teacher_id,
    };
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
  CLASSROOM_REGEX,
  GRADE_LEVEL_MAP,
  GRADE_TO_PREFIX,
  SALT_ROUNDS,
  validateClassroom,
  validateClassroomConsistency,
  createUserWithProfile,
  buildPagination,
  paginatedResponse,
  formatUserData,
};
