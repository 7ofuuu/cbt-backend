/**
 * Analytics Controller
 * Provides question statistics endpoints for teacher dashboard audit.
 * Subject-based access control applied.
 */
const { asyncHandler, AppError } = require('../utils/asyncHandler');
const {
  getQuestionStatistics,
  getDashboardSummary,
  getTeacherPerformanceOverview,
  getAdminAuditOverview,
} = require('../services/analyticsService');
const { buildPagination } = require('../services/userService');

/**
 * GET /api/analytics/question-stats
 * Get question-level statistics with flexible filtering
 * 
 * Query params:
 * - exam_id: Filter by specific exam
 * - question_bank_id: Filter by question bank
 * - subject: Filter by subject (coordinator only for other subjects)
 * - question_type: SINGLE_CHOICE, MULTIPLE_CHOICE, ESSAY
 * - sort_by: correct_rate, incorrect_rate, total_attempts, avg_manual_score
 * - order: asc, desc (default: desc)
 * - page, limit: Pagination
 */
const getQuestionStats = asyncHandler(async (req, res) => {
  const teacher = req.teacher;
  const { exam_id, question_bank_id, subject, question_type, sort_by, order } = req.query;

  // Validate question_type if provided
  if (question_type && !['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'ESSAY'].includes(question_type)) {
    throw new AppError('question_type harus SINGLE_CHOICE, MULTIPLE_CHOICE, atau ESSAY', 400);
  }

  // Validate sort_by if provided
  const validSortFields = ['correct_rate', 'incorrect_rate', 'total_attempts', 'avg_manual_score'];
  if (sort_by && !validSortFields.includes(sort_by)) {
    throw new AppError(`sort_by harus salah satu dari: ${validSortFields.join(', ')}`, 400);
  }

  // Validate order if provided
  if (order && !['asc', 'desc'].includes(order)) {
    throw new AppError('order harus asc atau desc', 400);
  }

  const filters = { exam_id, question_bank_id, subject, question_type, sort_by, order };
  const pagination = buildPagination(req.query, 20);

  const result = await getQuestionStatistics(filters, teacher, pagination);

  res.json(result);
});

/**
 * GET /api/analytics/dashboard-summary
 * Get summary statistics for teacher dashboard
 */
const getDashboardStats = asyncHandler(async (req, res) => {
  const teacher = req.teacher;
  
  const summary = await getDashboardSummary(teacher);

  res.json(summary);
});

/**
 * GET /api/analytics/teacher-performance
 * Interactive analytics payload for teacher dashboard.
 */
const getTeacherPerformanceOverviewHandler = asyncHandler(async (req, res) => {
  const teacher = req.teacher;
  const { days, subject, exam_id } = req.query;

  const overview = await getTeacherPerformanceOverview(teacher, { days, subject, exam_id });

  res.json(overview);
});

/**
 * GET /api/analytics/coordinator-audit
 * Coordinator-only audit overview (cross-subject).
 */
const getCoordinatorAuditOverviewHandler = asyncHandler(async (req, res) => {
  const teacher = req.teacher;

  if (!teacher?.is_coordinator) {
    throw new AppError('Fitur audit hanya untuk guru koordinator', 403);
  }

  const { days, limit } = req.query;
  const overview = await getAdminAuditOverview({ days, limit });
  res.json(overview);
});

module.exports = {
  getQuestionStats,
  getDashboardStats,
  getTeacherPerformanceOverviewHandler,
  getCoordinatorAuditOverviewHandler,
};
