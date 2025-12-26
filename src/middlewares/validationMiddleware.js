const Joi = require('joi');
const jwt = require('jsonwebtoken');

// ============================================
// AUTHENTICATION & AUTHORIZATION MIDDLEWARE
// ============================================

// Middleware untuk verify JWT token
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token tidak ditemukan atau format salah' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_key_cbt_2024');
    req.user = decoded; // { id: userId, role: 'admin'|'guru'|'siswa' }
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token tidak valid atau sudah kadaluarsa' });
  }
};

// Middleware untuk check role
const checkRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(403).json({ error: 'Akses ditolak: Role tidak ditemukan' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: `Akses ditolak: Hanya ${allowedRoles.join(', ')} yang diizinkan` 
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
  password: Joi.string().min(6).required(),
  role: Joi.string().valid('admin', 'guru', 'siswa').required(),
  nama: Joi.string().required(),
  
  // Wajib jika role = siswa
  kelas: Joi.when('role', { is: 'siswa', then: Joi.string().required() }),
  tingkat: Joi.when('role', { is: 'siswa', then: Joi.string().required() }),
  jurusan: Joi.when('role', { is: 'siswa', then: Joi.string().required() }),
});

const validateRegister = (req, res, next) => {
  const { error } = registerSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });
  next();
};

module.exports = { 
  verifyToken, 
  checkRole, 
  validateRegister 
};