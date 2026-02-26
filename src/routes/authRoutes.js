const express = require('express');
const router = express.Router();
const { register, login, me, updateProfile, changePassword, logout } = require('../controllers/authController');
const { validateRegister, validateLogin, verifyToken, checkRole } = require('../middlewares/validationMiddleware');

// Endpoint: POST /api/auth/register (Admin only)
router.post('/register', verifyToken, checkRole('admin'), validateRegister, register);

// Endpoint: POST /api/auth/login
router.post('/login', validateLogin, login);

// Endpoint: POST /api/auth/logout
router.post('/logout', verifyToken, logout);

// Endpoint: GET /api/auth/me - get current authenticated user profile
router.get('/me', verifyToken, me);

// Endpoint: PATCH /api/profile - update profile for authenticated user
router.patch('/profile', verifyToken, updateProfile);

// Endpoint: PATCH /api/auth/change-password - change password for authenticated user
router.patch('/change-password', verifyToken, changePassword);

module.exports = router;