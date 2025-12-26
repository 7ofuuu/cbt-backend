// src/services/activityLogService.js
const prisma = require('../config/db');

/**
 * Create activity log entry
 * @param {Object} data - Log data
 * @param {number} data.user_id - User ID
 * @param {number} data.peserta_ujian_id - Peserta Ujian ID (optional)
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
        peserta_ujian_id, 
        activity_type, 
        description, 
        ip_address, 
        user_agent, 
        metadata,
        created_at
      ) VALUES (
        ${data.user_id || null},
        ${data.peserta_ujian_id || null},
        ${data.activity_type},
        ${data.description},
        ${data.ip_address || null},
        ${data.user_agent || null},
        ${data.metadata ? JSON.stringify(data.metadata) : null},
        NOW()
      )
    `;
    
    console.log(`📝 Activity logged: ${data.activity_type} - ${data.description}`);
    return log;
  } catch (error) {
    console.error('❌ Error creating activity log:', error);
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
    console.error('Error getting logs by user:', error);
    return [];
  }
};

/**
 * Get logs by peserta ujian ID
 */
const getLogsByPesertaUjian = async (pesertaUjianId, limit = 50) => {
  try {
    const logs = await prisma.$queryRaw`
      SELECT * FROM activity_logs 
      WHERE peserta_ujian_id = ${pesertaUjianId} 
      ORDER BY created_at DESC 
      LIMIT ${limit}
    `;
    return logs;
  } catch (error) {
    console.error('Error getting logs by peserta ujian:', error);
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
    console.error('Error getting logs by type:', error);
    return [];
  }
};

/**
 * Get all logs with filters
 */
const getAllLogs = async (filters = {}) => {
  try {
    let query = 'SELECT * FROM activity_logs WHERE 1=1';
    const params = [];

    if (filters.user_id) {
      query += ` AND user_id = ?`;
      params.push(filters.user_id);
    }

    if (filters.activity_type) {
      query += ` AND activity_type = ?`;
      params.push(filters.activity_type);
    }

    if (filters.start_date) {
      query += ` AND created_at >= ?`;
      params.push(filters.start_date);
    }

    if (filters.end_date) {
      query += ` AND created_at <= ?`;
      params.push(filters.end_date);
    }

    query += ` ORDER BY created_at DESC LIMIT ${filters.limit || 100}`;

    const logs = await prisma.$queryRawUnsafe(query, ...params);
    return logs;
  } catch (error) {
    console.error('Error getting all logs:', error);
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
  getLogsByPesertaUjian,
  getLogsByType,
  getAllLogs,
  getIpAddress,
  getUserAgent
};
