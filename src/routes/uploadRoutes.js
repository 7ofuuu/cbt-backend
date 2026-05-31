const express = require('express');
const { verifyToken, checkRole } = require('../middlewares/validationMiddleware');
const { uploadLogo, uploadQuestionImage } = require('../middlewares/uploadMiddleware');
const { uploadFile } = require('../controllers/uploadController');

const router = express.Router();

// Logos are admin-only (school profile is admin-edited).
router.post('/logo', verifyToken, checkRole('admin'), uploadLogo, uploadFile);

// Question images can be added by teachers when they author questions, plus
// admins for any cleanup work.
router.post('/question-image', verifyToken, checkRole('admin', 'teacher'), uploadQuestionImage, uploadFile);

module.exports = router;
