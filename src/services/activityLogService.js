// src/services/activityLogService.js
const prisma = require('../config/db');

/**
 * Create activity log entry
 * @param {Object} data - Log data
 * @param {number} data.user_id - User ID
 * @param {number} data.exam_participant_id - Peserta Ujian ID (optional)
 * @param {string} data.activity_type - Activity type (LOGIN, START_UJIAN, etc.)
 * @param {string} data.description - Activity description
 * @param {string} data.ip_address - IP address (optional)
 * @param {string} data.user_agent - User agent (optional)
 * @param {object} data.metadata - Additional metadata (optional)
 */
const createLog = async (data) => {
  try {
    const log = await prisma.$executeRaw`
      INSERT INTO activity_logs (
        user_id, 
        exam_participant_id, 
        activity_type, 
        description, 
        ip_address, 
        user_agent, 
        metadata,
        created_at
      ) VALUES (
        ${data.user_id || null},
        ${data.exam_participant_id || null},
        ${data.activity_type},
        ${data.description},
        ${data.ip_address || null},
        ${data.user_agent || null},
        ${data.metadata ? JSON.stringify(data.metadata) : null},
        NOW()
      )
    `;
    
    return log;
  } catch (error) {
    console.error('[ActivityLog] Failed to create log:', error.message);
    // Don't throw error to prevent breaking main flow
  }
};

/**
 * Get logs by user ID
 */
const getLogsByUser = async (userId, limit = 50) => {
  try {
    const logs = await prisma.$queryRaw`
      SELECT * FROM activity_logs 
      WHERE user_id = ${userId} 
      ORDER BY created_at DESC 
      LIMIT ${limit}
    `;
    return logs;
  } catch (error) {
    console.error('[ActivityLog] Failed to get logs by user:', error.message);
    return [];
  }
};

/**
 * Get logs by exam participant ID
 */
const getLogsByExamParticipant = async (examParticipantId, limit = 50) => {
  try {
    const logs = await prisma.$queryRaw`
      SELECT * FROM activity_logs 
      WHERE exam_participant_id = ${examParticipantId} 
      ORDER BY created_at DESC 
      LIMIT ${limit}
    `;
    return logs;
  } catch (error) {
    console.error('[ActivityLog] Failed to get logs by exam participant:', error.message);
    return [];
  }
};

/**
 * Get logs by activity type
 */
const getLogsByType = async (activityType, limit = 100) => {
  try {
    const logs = await prisma.$queryRaw`
      SELECT * FROM activity_logs 
      WHERE activity_type = ${activityType} 
      ORDER BY created_at DESC 
      LIMIT ${limit}
    `;
    return logs;
  } catch (error) {
    console.error('[ActivityLog] Failed to get logs by type:', error.message);
    return [];
  }
};

/**
 * Get all logs with filters
 */
const getAllLogs = async (filters = {}) => {
  try {
    const where = {};

    if (filters.user_id) {
      where.user_id = filters.user_id;
    }

    if (filters.activity_type) {
      where.activity_type = filters.activity_type;
    }

    if (filters.start_date || filters.end_date) {
      where.created_at = {};
      if (filters.start_date) {
        where.created_at.gte = filters.start_date;
      }
      if (filters.end_date) {
        where.created_at.lte = filters.end_date;
      }
    }

    const logs = await prisma.activityLog.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: filters.limit || 100,
    });
    return logs;
  } catch (error) {
    console.error('[ActivityLog] Failed to get all logs:', error.message);
    return [];
  }
};

/**
 * Helper to extract IP from request
 */
const getIpAddress = (req) => {
  return req.headers['x-forwarded-for'] || 
         req.headers['x-real-ip'] || 
         req.connection?.remoteAddress || 
         req.socket?.remoteAddress ||
         null;
};

/**
 * Helper to extract user agent from request
 */
const getUserAgent = (req) => {
  return req.headers['user-agent'] || null;
};

module.exports = {
  createLog,
  getLogsByUser,
  getLogsByExamParticipant,
  getLogsByType,
  getAllLogs,
  getIpAddress,
  getUserAgent
};
