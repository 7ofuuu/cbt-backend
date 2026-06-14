const Joi = require('joi');
const jwt = require('jsonwebtoken');
const prisma = require('../config/db');

// ============================================
// AUTHENTICATION & AUTHORIZATION MIDDLEWARE
// ============================================

// Middleware untuk verify JWT token
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token tidak ditemukan atau format salah' });
  }

  const token = authHeader.split(' ')[1];

  try {
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET environment variable is not set');
    }

    // Explicitly specify algorithm to prevent algorithm confusion attacks
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        role: true,
        is_active: true,
        is_super_admin: true,
      },
    });

    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Sesi tidak valid, silakan login ulang' });
    }

    if (user.role !== decoded.role) {
      return res.status(401).json({ error: 'Role akun berubah, silakan login ulang' });
    }

    req.user = {
      id: user.id,
      role: user.role,
      is_super_admin: user.is_super_admin || false,
    };

    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token tidak valid atau sudah kadaluarsa' });
  }
};

// Middleware untuk check role
// Supports: checkRole('admin'), checkRole('admin', 'teacher'), checkRole(['admin', 'teacher'])
const checkRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(403).json({ error: 'Akses ditolak: Role tidak ditemukan' });
    }

    // Flatten to handle both checkRole('admin', 'teacher') and checkRole(['admin', 'teacher'])
    const roles = allowedRoles.flat();

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: `Akses ditolak: Hanya ${roles.join(', ')} yang diizinkan` 
      });
    }

    next();
  };
};

// ============================================
// INPUT VALIDATION MIDDLEWARE
// ============================================

const registerSchema = Joi.object({
  username: Joi.string().min(4).required(),
  password: Joi.string().min(8)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .required()
    .messages({
      'string.min': 'Password minimal 8 karakter',
      'string.pattern.base': 'Password harus mengandung huruf besar, huruf kecil, dan angka',
    }),
  role: Joi.string().valid('admin', 'teacher', 'student').required(),
  full_name: Joi.string().required(),
  
  // Required if role = siswa
  classroom: Joi.when('role', { is: 'student', then: Joi.string().required() }),
  grade_level: Joi.when('role', { is: 'student', then: Joi.string().required() }),
  major: Joi.when('role', { is: 'student', then: Joi.string().required() }),

  // Optional unique identifiers
  nisn: Joi.when('role', { is: 'student', then: Joi.string().allow('', null).optional() }),
  nip: Joi.when('role', { is: 'teacher', then: Joi.string().allow('', null).optional() }),

  // Teacher-specific fields
  subject: Joi.when('role', { is: 'teacher', then: Joi.string().required().messages({
    'any.required': 'Mata pelajaran (subject) wajib diisi untuk guru',
    'string.empty': 'Mata pelajaran (subject) tidak boleh kosong',
  }) }),
  is_coordinator: Joi.when('role', { is: 'teacher', then: Joi.boolean().optional() }),
});

const validateRegister = (req, res, next) => {
  const { error } = registerSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });
  next();
};

const loginSchema = Joi.object({
  username: Joi.string().required(),
  password: Joi.string().required(),
});

const validateLogin = (req, res, next) => {
  const { error } = loginSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });
  next();
};

// Generic Joi schema validator factory - use for new routes so the
// controller body stays focused on business logic. Defaults to req.body
// but works on any request property (query, params).
//   router.post('/x', validate(schemaA), handler)
//   router.get('/y', validate(schemaB, 'query'), handler)
const validate = (schema, source = 'body') => (req, res, next) => {
  const { error, value } = schema.validate(req[source], { abortEarly: false, stripUnknown: true });
  if (error) {
    return res.status(400).json({ error: error.details.map(d => d.message).join('; ') });
  }
  req[source] = value;
  next();
};

// Composed middleware shortcuts for the most common access patterns.
// Example: `router.post('/x', adminOnly, handler)`. Use the array form so
// Express expands it inline like any other middleware list.
const adminOnly = [verifyToken, checkRole('admin')];
const teacherOnly = [verifyToken, checkRole('teacher')];
const studentOnly = [verifyToken, checkRole('student')];
const adminOrTeacher = [verifyToken, checkRole('admin', 'teacher')];

module.exports = {
  verifyToken,
  checkRole,
  validateRegister,
  validateLogin,
  validate,
  adminOnly,
  teacherOnly,
  studentOnly,
  adminOrTeacher,
};