// Script untuk membuat tabel activity_logs
const prisma = require('./src/config/db');

const createTable = async () => {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        log_id INT NOT NULL AUTO_INCREMENT,
        user_id INT NULL,
        peserta_ujian_id INT NULL,
        activity_type VARCHAR(100) NOT NULL,
        description TEXT NOT NULL,
        ip_address VARCHAR(50) NULL,
        user_agent TEXT NULL,
        metadata JSON NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (log_id),
        INDEX idx_user_id (user_id),
        INDEX idx_peserta_ujian_id (peserta_ujian_id),
        INDEX idx_activity_type (activity_type),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    console.log('✅ Table activity_logs created successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating table:', error);
    process.exit(1);
  }
};

createTable();
