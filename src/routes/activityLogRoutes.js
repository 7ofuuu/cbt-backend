// src/routes/activityLogRoutes.js
const express = require('express');
const router = express.Router();
const { verifyToken, checkRole } = require('../middlewares/validationMiddleware');
const {
  getActivityLogs,
  getLogsByUser,
  getLogsByPesertaUjian,
  getLogsByType
} = require('../controllers/activityLogController');

// Admin/Guru can view all logs
router.get('/', verifyToken, checkRole(['admin', 'guru']), getActivityLogs);
router.get('/user/:userId', verifyToken, checkRole(['admin', 'guru']), getLogsByUser);
router.get('/peserta-ujian/:pesertaUjianId', verifyToken, checkRole(['admin', 'guru']), getLogsByPesertaUjian);
router.get('/type/:activityType', verifyToken, checkRole(['admin', 'guru']), getLogsByType);

module.exports = router;
