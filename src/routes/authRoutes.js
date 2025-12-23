const express = require('express');
const router = express.Router();
const { register, login, logout } = require('../controllers/authController');
const { validateRegister, validateLogin } = require('../middlewares/validationMiddleware');
const { verifyToken, checkRole } = require('../middlewares/authMiddleware');

// Endpoint: POST /api/auth/register (Admin only)
router.post('/register', verifyToken, checkRole('admin'), validateRegister, register);

// Endpoint: POST /api/auth/login
router.post('/login', validateLogin, login);

module.exports = router;