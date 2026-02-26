// src/services/autoExpireUjianService.js
const prisma = require('../config/db');
const activityLogService = require('./activityLogService');

/**
 * Check and update expired ujian status
 * Mengecek ujian yang sudah melewati end_date dan mengubah status menjadi ENDED
 * This should be called periodically (every minute or every few minutes)
 */
const checkAndExpireExams = async () => {
  try {

    const now = new Date();

    // Get all exams that haven't expired yet and have passed end_date
    const expiredExams = await prisma.exam.findMany({
      where: {
        end_date: {
          lt: now,
        },
        exam_status: {
          in: ['SCHEDULED', 'ONGOING'],
        },
      },
      include: {
        teacher: {
          include: {
            user: true,
          },
        },
      },
    });

    if (expiredExams.length === 0) {
      return {
        success: true,
        expiredCount: 0,
        message: 'No expired exams to update',
      };
    }


    let expiredCount = 0;
    const results = [];

    for (const exam of expiredExams) {
      try {
        // Update exam status to ENDED
        const updatedExam = await prisma.exam.update({
          where: { exam_id: exam.exam_id },
          data: {
            exam_status: 'ENDED',
          },
        });

        expiredCount++;

        // Log activity
        await activityLogService.createLog({
          user_id: exam.teacher_id ? exam.teacher.user_id : null,
          activity_type: 'UJIAN_AUTO_EXPIRED',
          description: `Ujian "${exam.exam_name}" (ID: ${exam.exam_id}) automatically expired - status changed to ENDED`,
          metadata: {
            exam_id: exam.exam_id,
            exam_name: exam.exam_name,
            previous_status: exam.exam_status,
            new_status: 'ENDED',
            end_date: exam.end_date,
            expired_at: now,
            auto_action: true,
          },
        });

        results.push({
          exam_id: exam.exam_id,
          exam_name: exam.exam_name,
          previous_status: exam.exam_status,
          new_status: 'ENDED',
          end_date: exam.end_date,
        });
      } catch (error) {
        results.push({
          exam_id: exam.exam_id,
          exam_name: exam.exam_name,
          error: 'Failed to expire exam',
        });
      }
    }


    return {
      success: true,
      expiredCount,
      totalChecked: expiredExams.length,
      results,
      message: `Successfully expired ${expiredCount} out of ${expiredExams.length} exam(s)`,
    };
  } catch (error) {
    return {
      success: false,
      error: 'Internal error during exam expiry check',
      message: 'Failed to check and expire exams',
    };
  }
};

const startAutoExpireScheduler = () => {
  
  // Run immediately on start
  checkAndExpireExams();
  
  // Then run every 60 seconds
  const intervalId = setInterval(checkAndExpireExams, 60000);
  
  return intervalId;
};

/**
 * Manual trigger to expire a specific ujian
 * @param {number} ujianId - ID of the ujian to expire
 */
const expireExamById = async (examId) => {
  try {
    const exam = await prisma.exam.findUnique({
      where: { exam_id: examId },
      include: {
        teacher: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!exam) {
      return {
        success: false,
        message: 'Exam not found',
      };
    }

    if (exam.exam_status === 'ENDED') {
      return {
        success: false,
        message: 'Exam is already expired (ENDED)',
      };
    }

    const now = new Date();

    // Update status to ENDED
    await prisma.exam.update({
      where: { exam_id: examId },
      data: {
        exam_status: 'ENDED',
        updated_at: now,
      },
    });

    // Log activity
    await activityLogService.createLog({
      user_id: exam.teacher_id ? exam.teacher.user_id : null,
      activity_type: 'UJIAN_MANUAL_EXPIRED',
      description: `Ujian "${exam.exam_name}" (ID: ${exam.exam_id}) manually expired - status changed to ENDED`,
      metadata: {
        exam_id: exam.exam_id,
        exam_name: exam.exam_name,
        previous_status: exam.exam_status,
        new_status: 'ENDED',
        end_date: exam.end_date,
        expired_at: now,
        auto_action: false,
      },
    });

    return {
      success: true,
      data: { exam_id: exam.exam_id, exam_name: exam.exam_name, exam_status: 'ENDED' },
      message: `Exam "${exam.exam_name}" successfully expired`,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      message: 'Failed to expire exam',
    };
  }
};

module.exports = {
  checkAndExpireExams,
  startAutoExpireScheduler,
  expireExamById,
};
