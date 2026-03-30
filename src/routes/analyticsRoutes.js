const express = require('express');
const router = express.Router();
const { verifyToken, checkRole } = require('../middlewares/validationMiddleware');
const { resolveTeacher } = require('../middlewares/resolveRole');
const {
	getQuestionStats,
	getDashboardStats,
	getTeacherPerformanceOverviewHandler,
	getCoordinatorAuditOverviewHandler,
} = require('../controllers/analyticsController');

// All routes require teacher authentication
router.use(verifyToken, checkRole('teacher'), resolveTeacher);

// GET /api/analytics/question-stats - Get question statistics with filters
router.get('/question-stats', getQuestionStats);

// GET /api/analytics/dashboard-summary - Get dashboard overview statistics
router.get('/dashboard-summary', getDashboardStats);

// GET /api/analytics/teacher-performance - Get interactive teacher performance analytics
router.get('/teacher-performance', getTeacherPerformanceOverviewHandler);

// GET /api/analytics/coordinator-audit - Get coordinator-only cross-subject audit overview
router.get('/coordinator-audit', getCoordinatorAuditOverviewHandler);

module.exports = router;
