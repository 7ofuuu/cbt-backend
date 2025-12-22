const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: '.env.test' });

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

/**
 * Clean database - hapus semua data untuk fresh test
 */
async function cleanDatabase() {
  const tables = [
    'hasil_ujians',
    'jawabans',
    'peserta_ujians',
    'soal_ujians',
    'opsi_jawabans',
    'soals',
    'ujians',
    'siswas',
    'gurus',
    'admins',
    'users'
  ];

  for (const table of tables) {
    await prisma.$executeRawUnsafe(`DELETE FROM ${table}`);
  }

  // Reset auto increment
  for (const table of tables) {
    await prisma.$executeRawUnsafe(`ALTER TABLE ${table} AUTO_INCREMENT = 1`);
  }
}

/**
 * Setup test database - buat schema jika belum ada
 */
async function setupTestDatabase() {
  try {
    // Check if database exists
    await prisma.$connect();
    console.log('✅ Test database connected');
  } catch (error) {
    console.error('❌ Failed to connect to test database:', error.message);
    throw error;
  }
}

/**
 * Disconnect database
 */
async function disconnectDatabase() {
  await prisma.$disconnect();
}

module.exports = {
  prisma,
  cleanDatabase,
  setupTestDatabase,
  disconnectDatabase
};
