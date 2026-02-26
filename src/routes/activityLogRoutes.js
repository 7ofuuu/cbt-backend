// src/routes/activityLogRoutes.js
const express = require('express');
const router = express.Router();
const { verifyToken, checkRole } = require('../middlewares/validationMiddleware');
const {
  getActivityLogs,
  getLogsByUser,
  getLogsByExamParticipant,
  getLogsByType,
  getActiveUsers
} = require('../controllers/activityLogController');

// Admin/Guru can view all logs
router.get('/', verifyToken, checkRole(['admin', 'teacher']), getActivityLogs);
router.get('/active-users', verifyToken, checkRole(['admin', 'teacher']), getActiveUsers);
router.get('/user/:userId', verifyToken, checkRole(['admin', 'teacher']), getLogsByUser);
router.get('/exam-participant/:examParticipantId', verifyToken, checkRole(['admin', 'teacher']), getLogsByExamParticipant);
router.get('/type/:activityType', verifyToken, checkRole(['admin', 'teacher']), getLogsByType);

module.exports = router;
