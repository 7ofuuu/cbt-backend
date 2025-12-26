// src/controllers/activityLogController.js
const activityLogService = require('../services/activityLogService');

/**
 * Get activity logs with filters
 * GET /api/activity-logs?user_id=1&activity_type=LOGIN&start_date=2025-01-01&limit=50
 */
const getActivityLogs = async (req, res) => {
  try {
    const { user_id, activity_type, start_date, end_date, limit } = req.query;
    
    const filters = {};
    if (user_id) filters.user_id = parseInt(user_id);
    if (activity_type) filters.activity_type = activity_type;
    if (start_date) filters.start_date = new Date(start_date);
    if (end_date) filters.end_date = new Date(end_date);
    if (limit) filters.limit = parseInt(limit);

    const logs = await activityLogService.getAllLogs(filters);
    
    res.json({
      success: true,
      count: logs.length,
      logs
    });
  } catch (error) {
    console.error('Error getting activity logs:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal mengambil activity logs',
      error: error.message
    });
  }
};

/**
 * Get activity logs by user ID
 * GET /api/activity-logs/user/:userId
 */
const getLogsByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit } = req.query;
    
    const logs = await activityLogService.getLogsByUser(
      parseInt(userId), 
      limit ? parseInt(limit) : 50
    );
    
    res.json({
      success: true,
      user_id: parseInt(userId),
      count: logs.length,
      logs
    });
  } catch (error) {
    console.error('Error getting logs by user:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal mengambil activity logs user',
      error: error.message
    });
  }
};

/**
 * Get activity logs by peserta ujian ID
 * GET /api/activity-logs/peserta-ujian/:pesertaUjianId
 */
const getLogsByPesertaUjian = async (req, res) => {
  try {
    const { pesertaUjianId } = req.params;
    const { limit } = req.query;
    
    const logs = await activityLogService.getLogsByPesertaUjian(
      parseInt(pesertaUjianId), 
      limit ? parseInt(limit) : 50
    );
    
    res.json({
      success: true,
      peserta_ujian_id: parseInt(pesertaUjianId),
      count: logs.length,
      logs
    });
  } catch (error) {
    console.error('Error getting logs by peserta ujian:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal mengambil activity logs peserta ujian',
      error: error.message
    });
  }
};

/**
 * Get activity logs by type
 * GET /api/activity-logs/type/:activityType
 */
const getLogsByType = async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Error getting logs by type:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal mengambil activity logs by type',
      error: error.message
    });
  }
};

module.exports = {
  getActivityLogs,
  getLogsByUser,
  getLogsByPesertaUjian,
  getLogsByType
};
