const express = require('express');
const router = express.Router();
const { register, login, me, updateProfile } = require('../controllers/authController');
const { validateRegister, verifyToken } = require('../middlewares/validationMiddleware');

// Endpoint: POST /api/auth/register
router.post('/register', validateRegister, register);

// Endpoint: POST /api/auth/login
router.post('/login', login);

// Endpoint: GET /api/auth/me - get current authenticated user profile
router.get('/me', verifyToken, me);

// Endpoint: PATCH /api/profile - update profile for authenticated user
router.patch('/profile', verifyToken, updateProfile);

module.exports = router;