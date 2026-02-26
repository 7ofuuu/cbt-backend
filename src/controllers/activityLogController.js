// src/controllers/activityLogController.js
const prisma = require('../config/db');
const activityLogService = require('../services/activityLogService');
const { asyncHandler, AppError } = require('../utils/asyncHandler');

/**
 * Get activity logs with filters
 * GET /api/activity-logs?user_id=1&activity_type=LOGIN&start_date=2025-01-01&limit=50
 */
const getActivityLogs = asyncHandler(async (req, res) => {
  const { user_id, activity_type, start_date, end_date, limit } = req.query;
  
  const filters = {};
  if (user_id) {
    const parsed = parseInt(user_id);
    if (isNaN(parsed)) throw new AppError('user_id harus berupa angka', 400);
    filters.user_id = parsed;
  }
  if (activity_type) filters.activity_type = activity_type;
  if (start_date) {
    const d = new Date(start_date);
    if (isNaN(d.getTime())) throw new AppError('start_date format tidak valid', 400);
    filters.start_date = d;
  }
  if (end_date) {
    const d = new Date(end_date);
    if (isNaN(d.getTime())) throw new AppError('end_date format tidak valid', 400);
    filters.end_date = d;
  }
  if (limit) {
    const parsed = parseInt(limit);
    if (isNaN(parsed) || parsed < 1) throw new AppError('limit harus berupa angka positif', 400);
    filters.limit = parsed;
  }

  const logs = await activityLogService.getAllLogs(filters);
  
  res.json({
    success: true,
    count: logs.length,
    logs
  });
});

/**
 * Get activity logs by user ID
 * GET /api/activity-logs/user/:userId
 */
const getLogsByUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { limit } = req.query;
  
  const parsedUserId = parseInt(userId);
  if (isNaN(parsedUserId)) throw new AppError('userId harus berupa angka', 400);
  const parsedLimit = limit ? parseInt(limit) : 50;
  if (limit && (isNaN(parsedLimit) || parsedLimit < 1)) throw new AppError('limit harus berupa angka positif', 400);
  
  const logs = await activityLogService.getLogsByUser(
    parsedUserId, 
    parsedLimit
  );
  
  res.json({
    success: true,
    user_id: parsedUserId,
    count: logs.length,
    logs
  });
});

/**
 * Get activity logs by peserta ujian ID
 * GET /api/activity-logs/peserta-ujian/:examParticipantId
 */
const getLogsByExamParticipant = asyncHandler(async (req, res) => {
  const { examParticipantId } = req.params;
  const { limit } = req.query;
  
  const parsedId = parseInt(examParticipantId);
  if (isNaN(parsedId)) throw new AppError('examParticipantId harus berupa angka', 400);
  const parsedLimit = limit ? parseInt(limit) : 50;
  if (limit && (isNaN(parsedLimit) || parsedLimit < 1)) throw new AppError('limit harus berupa angka positif', 400);
  
  const logs = await activityLogService.getLogsByExamParticipant(
    parsedId, 
    parsedLimit
  );
  
  res.json({
    success: true,
    exam_participant_id: parsedId,
    count: logs.length,
    logs
  });
});

/**
 * Get activity logs by type
 * GET /api/activity-logs/type/:activityType
 */
const getLogsByType = asyncHandler(async (req, res) => {
  const { activityType } = req.params;
  const { limit } = req.query;
  
  const logs = await activityLogService.getLogsByType(
    activityType, 
    limit ? parseInt(limit) : 100
  );
  
  res.json({
    success: true,
    activity_type: activityType,
    count: logs.length,
    logs
  });
});

/**
 * Get active/logged-in users based on recent LOGIN logs
 * GET /api/activity-logs/active-users?hours=24
 */
const getActiveUsers = asyncHandler(async (req, res) => {
  const hours = parseInt(req.query.hours) || 24;
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  // Get the most recent LOGIN log per user within the time window
  const recentLogins = await prisma.$queryRaw`
    SELECT 
      al.user_id,
      al.created_at AS last_login,
      al.ip_address,
      al.user_agent,
      u.username,
      u.role,
      u.is_active,
      COALESCE(a.full_name, t.full_name, s.full_name) AS full_name
    FROM activity_logs al
    INNER JOIN (
      SELECT user_id, MAX(created_at) AS max_login
      FROM activity_logs
      WHERE activity_type = 'LOGIN' AND created_at >= ${since}
      GROUP BY user_id
    ) latest ON al.user_id = latest.user_id AND al.created_at = latest.max_login
    LEFT JOIN users u ON al.user_id = u.id
    LEFT JOIN admins a ON u.id = a.user_id
    LEFT JOIN teachers t ON u.id = t.user_id
    LEFT JOIN students s ON u.id = s.user_id
    WHERE al.activity_type = 'LOGIN'
    ORDER BY al.created_at DESC
  `;

  // Format BigInt and Date fields for JSON serialization
  const formatted = recentLogins.map(row => ({
    user_id: Number(row.user_id),
    username: row.username,
    full_name: row.full_name,
    role: row.role,
    is_active: row.is_active === 1 || row.is_active === true,
    last_login: row.last_login,
    ip_address: row.ip_address,
    user_agent: row.user_agent,
  }));

  res.json({
    success: true,
    hours_window: hours,
    since: since.toISOString(),
    total_active: formatted.length,
    users: formatted,
  });
});

module.exports = {
  getActivityLogs,
  getLogsByUser,
  getLogsByExamParticipant,
  getLogsByType,
  getActiveUsers
};
