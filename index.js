const dotenv = require('dotenv');
dotenv.config();

const app = require('./src/app');
const autoFinishService = require('./src/services/autoFinishService');
const autoExpireExamService = require('./src/services/autoExpireExamService');
const prisma = require('./src/config/db');

const PORT = process.env.PORT || 3000;
let autoFinishInterval;
let autoExpireInterval;

const server = app.listen(PORT, () => {
  console.log(`[CBT Server] Running on port ${PORT}`);
  autoFinishInterval = autoFinishService.startAutoFinishScheduler();
  autoExpireInterval = autoExpireExamService.startAutoExpireScheduler();
});

const gracefulShutdown = async (signal) => {
  if (autoFinishInterval) clearInterval(autoFinishInterval);
  if (autoExpireInterval) clearInterval(autoExpireInterval);
  await prisma.$disconnect();
  server.close(() => {
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
