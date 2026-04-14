const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./src/routes/authRoutes');
const questionRoutes = require('./src/routes/questionRoutes');
const examRoutes = require('./src/routes/examRoutes');
const studentRoutes = require('./src/routes/studentRoutes');
const userRoutes = require('./src/routes/userRoutes');
const activityRoutes = require('./src/routes/activityRoutes');
const examResultRoutes = require('./src/routes/examResultRoutes');
const activityLogRoutes = require('./src/routes/activityLogRoutes');
const schoolProfileRoutes = require('./src/routes/schoolProfileRoutes');
const analyticsRoutes = require('./src/routes/analyticsRoutes');
const autoFinishService = require('./src/services/autoFinishService');
const autoExpireExamService = require('./src/services/autoExpireExamService');
const { errorHandler } = require('./src/utils/asyncHandler');
const prisma = require('./src/config/db');

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
  : ['http://localhost:3000', 'http://localhost:3001'];
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
}));

// Rate limiting - login endpoint (strict)
app.use('/api/auth/login', rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // max 15 login attempts per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak percobaan login, coba lagi dalam 15 menit' },
}));

// Rate limiting - change password (strict)
app.use('/api/auth/change-password', rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // max 5 password change attempts per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak percobaan ganti password, coba lagi dalam 15 menit' },
}));

// Rate limiting - registration (moderate)
app.use('/api/auth/register', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // max 30 registrations per 15 min (batch creation needs room)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak permintaan registrasi, coba lagi nanti' },
}));

// Rate limiting - general API (relaxed for dashboard)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // 500 requests per 15 min per IP (dashboard loads many endpoints at once)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak request, coba lagi nanti' },
});
app.use('/api/', limiter);

// Body parser with size limit
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes
app.use('/api/auth', authRoutes); // Auth: login, register
app.use('/api/questions', questionRoutes); // Question CRUD (Teacher)
app.use('/api/exams', examRoutes); // Exam CRUD (Teacher)
app.use('/api/students', studentRoutes); // Student: exams, answers, results
app.use('/api/users', userRoutes); // User Management (Admin) & Grading (Teacher)
app.use('/api/admin/activities', activityRoutes); // Activity Management (Admin)
app.use('/api/exam-results', examResultRoutes); // Exam Results (Teacher & Student)
app.use('/api/activity-logs', activityLogRoutes); // Activity Logs (Admin & Teacher)
app.use('/api/school-profile', schoolProfileRoutes); // School Profile (Public GET, Admin PUT)
app.use('/api/analytics', analyticsRoutes); // Analytics: Question Stats (Teacher)

// Test Route
app.get('/', (req, res) => {
  res.send('CBT Server Running');
});

// Global error handler (must be after all routes)
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
let autoFinishInterval;
let autoExpireInterval;

const server = app.listen(PORT, () => {
  console.log(`[CBT Server] Running on port ${PORT}`);

  // Start auto-finish scheduler
  autoFinishInterval = autoFinishService.startAutoFinishScheduler();
  // Start auto-expire exam scheduler
  autoExpireInterval = autoExpireExamService.startAutoExpireScheduler();
});

// Graceful shutdown
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