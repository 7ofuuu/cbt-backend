const express = require('express');
const router = express.Router();
const { verifyToken, checkRole } = require('../middlewares/validationMiddleware');
const { getSchoolProfile, updateSchoolProfile } = require('../controllers/schoolProfileController');

// Public — no auth needed (used by login page, headers, Flutter app)
router.get('/', getSchoolProfile);

// Admin only — update school profile
router.put('/', verifyToken, checkRole('admin'), updateSchoolProfile);

module.exports = router;
