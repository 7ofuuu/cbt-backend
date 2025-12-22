const Joi = require('joi');

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

const loginSchema = Joi.object({
  username: Joi.string().required(),
  password: Joi.string().required()
});

const validateRegister = (req, res, next) => {
  const { error } = registerSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });
  next();
};

const validateLogin = (req, res, next) => {
  const { error } = loginSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });
  next();
};

module.exports = { validateRegister, validateLogin };