const express = require('express');
const router = express.Router();
const { register, login } = require('../controllers/authController');
const { validateRegister } = require('../middlewares/validationMiddleware');

// Endpoint: POST /api/auth/register
router.post('/register', validateRegister, register);

// Endpoint: POST /api/auth/login
router.post('/login', login);

module.exports = router;