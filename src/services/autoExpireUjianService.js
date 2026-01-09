// src/services/autoExpireUjianService.js
const prisma = require('../config/db');
const activityLogService = require('./activityLogService');

/**
 * Check and update expired ujian status
 * Mengecek ujian yang sudah melewati tanggal_selesai dan mengubah status menjadi BERAKHIR
 * This should be called periodically (every minute or every few minutes)
 */
const checkAndExpireUjians = async () => {
  try {
    console.log('🔍 Checking for expired ujians (past tanggal_selesai)...');

    const now = new Date();

    // Get all ujians yang belum BERAKHIR dan sudah melewati tanggal_selesai
    const expiredUjians = await prisma.ujians.findMany({
      where: {
        tanggal_selesai: {
          lt: now, // tanggal_selesai < sekarang
        },
        status_ujian: {
          in: ['TERJADWAL', 'BERLANGSUNG'], // hanya yang belum BERAKHIR
        },
      },
      include: {
        gurus: {
          include: {
            user: true,
          },
        },
      },
    });

    if (expiredUjians.length === 0) {
      console.log('✅ No expired ujians found');
      return {
        success: true,
        expiredCount: 0,
        message: 'No expired ujians to update',
      };
    }

    console.log(`⏰ Found ${expiredUjians.length} expired ujian(s)`);

    let expiredCount = 0;
    const results = [];

    for (const ujian of expiredUjians) {
      try {
        // Update status ujian menjadi BERAKHIR
        const updatedUjian = await prisma.ujians.update({
          where: { ujian_id: ujian.ujian_id },
          data: {
            status_ujian: 'BERAKHIR',
            updatedAt: new Date(),
          },
        });

        expiredCount++;

        // Log activity
        await activityLogService.createLog({
          user_id: ujian.guru_id ? ujian.gurus.userId : null,
          activity_type: 'UJIAN_AUTO_EXPIRED',
          description: `Ujian "${ujian.nama_ujian}" (ID: ${ujian.ujian_id}) automatically expired - status changed to BERAKHIR`,
          metadata: {
            ujian_id: ujian.ujian_id,
            nama_ujian: ujian.nama_ujian,
            previous_status: ujian.status_ujian,
            new_status: 'BERAKHIR',
            tanggal_selesai: ujian.tanggal_selesai,
            expired_at: now,
            auto_action: true,
          },
        });

        results.push({
          ujian_id: ujian.ujian_id,
          nama_ujian: ujian.nama_ujian,
          previous_status: ujian.status_ujian,
          new_status: 'BERAKHIR',
          tanggal_selesai: ujian.tanggal_selesai,
        });

        console.log(
          `✅ Ujian ID ${ujian.ujian_id} "${ujian.nama_ujian}" status changed to BERAKHIR`
        );
      } catch (error) {
        console.error(
          `❌ Error expiring ujian ID ${ujian.ujian_id}:`,
          error.message
        );
        results.push({
          ujian_id: ujian.ujian_id,
          nama_ujian: ujian.nama_ujian,
          error: error.message,
        });
      }
    }

    console.log(`✅ Successfully expired ${expiredCount} ujian(s)`);

    return {
      success: true,
      expiredCount,
      totalChecked: expiredUjians.length,
      results,
      message: `Successfully expired ${expiredCount} out of ${expiredUjians.length} ujian(s)`,
    };
  } catch (error) {
    console.error('❌ Error in checkAndExpireUjians:', error);
    return {
      success: false,
      error: error.message,
      message: 'Failed to check and expire ujians',
    };
  }
};

const startAutoExpireScheduler = () => {
  console.log('🚀 Starting auto-expire scheduler...');
  
  // Run immediately on start
  checkAndExpireUjians();
  
  // Then run every 60 seconds
  setInterval(checkAndExpireUjians, 60000);
  
  console.log('✅ Auto-expire scheduler started (running every 60 seconds)');
};

/**
 * Manual trigger to expire a specific ujian
 * @param {number} ujianId - ID of the ujian to expire
 */
const expireUjianById = async (ujianId) => {
  try {
    const ujian = await prisma.ujians.findUnique({
      where: { ujian_id: ujianId },
      include: {
        gurus: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!ujian) {
      return {
        success: false,
        message: 'Ujian not found',
      };
    }

    if (ujian.status_ujian === 'BERAKHIR') {
      return {
        success: false,
        message: 'Ujian is already expired (BERAKHIR)',
      };
    }

    const now = new Date();

    // Update status to BERAKHIR
    const updatedUjian = await prisma.ujians.update({
      where: { ujian_id: ujianId },
      data: {
        status_ujian: 'BERAKHIR',
        updatedAt: now,
      },
    });

    // Log activity
    await activityLogService.createLog({
      user_id: ujian.guru_id ? ujian.gurus.userId : null,
      activity_type: 'UJIAN_MANUAL_EXPIRED',
      description: `Ujian "${ujian.nama_ujian}" (ID: ${ujian.ujian_id}) manually expired - status changed to BERAKHIR`,
      metadata: {
        ujian_id: ujian.ujian_id,
        nama_ujian: ujian.nama_ujian,
        previous_status: ujian.status_ujian,
        new_status: 'BERAKHIR',
        tanggal_selesai: ujian.tanggal_selesai,
        expired_at: now,
        auto_action: false,
      },
    });

    return {
      success: true,
      data: updatedUjian,
      message: `Ujian "${ujian.nama_ujian}" successfully expired`,
    };
  } catch (error) {
    console.error('❌ Error in expireUjianById:', error);
    return {
      success: false,
      error: error.message,
      message: 'Failed to expire ujian',
    };
  }
};

module.exports = {
  checkAndExpireUjians,
  startAutoExpireScheduler,
  expireUjianById,
};
