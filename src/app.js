const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./routes/authRoutes');
const questionRoutes = require('./routes/questionRoutes');
const examRoutes = require('./routes/examRoutes');
const studentRoutes = require('./routes/studentRoutes');
const userRoutes = require('./routes/userRoutes');
const activityRoutes = require('./routes/activityRoutes');
const examResultRoutes = require('./routes/examResultRoutes');
const activityLogRoutes = require('./routes/activityLogRoutes');
const schoolProfileRoutes = require('./routes/schoolProfileRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const { errorHandler } = require('./utils/asyncHandler');

const app = express();

// ngrok forwards requests through its edge, so client IPs arrive via
// X-Forwarded-For. Trust one proxy hop so express-rate-limit keys correctly.
app.set('trust proxy', 1);

app.use(helmet());

const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
  : ['http://localhost:3000', 'http://localhost:3001'];

// Opt-in: allow any ngrok subdomain (dashboard gets a random URL on free tier).
// Keep this OFF in production; enable only for the local + ngrok dev setup.
const allowNgrokOrigins = process.env.ALLOW_NGROK_ORIGINS === 'true';
const ngrokOriginRegex = /^https:\/\/[a-z0-9-]+\.ngrok(-free)?\.app$/i;

// Opt-in: allow any *.vercel.app origin so the dashboard hosted on Vercel
// (production + preview deploys get rotating subdomains) can call this API
// through the ngrok backend URL. For production hardening, pin the exact
// Vercel domain in CORS_ORIGINS instead and keep this OFF.
const allowVercelOrigins = process.env.ALLOW_VERCEL_ORIGINS === 'true';
const vercelOriginRegex = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i;

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (allowNgrokOrigins && ngrokOriginRegex.test(origin)) return callback(null, true);
    if (allowVercelOrigins && vercelOriginRegex.test(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
}));

// Rate limiters disabled in test environment to avoid interference
if (process.env.NODE_ENV !== 'test') {
  app.use('/api/auth/login', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Terlalu banyak percobaan login, coba lagi dalam 15 menit' },
  }));

  app.use('/api/auth/change-password', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Terlalu banyak percobaan ganti password, coba lagi dalam 15 menit' },
  }));

  app.use('/api/auth/register', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Terlalu banyak permintaan registrasi, coba lagi nanti' },
  }));

  app.use('/api/', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Terlalu banyak request, coba lagi nanti' },
  }));
}

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin/activities', activityRoutes);
app.use('/api/exam-results', examResultRoutes);
app.use('/api/activity-logs', activityLogRoutes);
app.use('/api/school-profile', schoolProfileRoutes);
app.use('/api/analytics', analyticsRoutes);

app.get('/', (req, res) => {
  res.send('CBT Server Running');
});

app.use(errorHandler);

module.exports = app;
