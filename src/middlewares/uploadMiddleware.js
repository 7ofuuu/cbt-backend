/**
 * Upload middleware — multer disk storage.
 *
 * Files land under `uploads/<bucket>/` with a timestamp-prefixed filename so
 * collisions are impossible without coordinating across requests. The route
 * picks which bucket (`logos`, `questions`, …) to write into.
 *
 * Only images are accepted, and the size is capped at 5MB to keep the
 * uploads folder small enough for a local dev / on-prem deploy.
 */
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { AppError } = require('../utils/asyncHandler');

const UPLOADS_ROOT = path.resolve(__dirname, '../../uploads');

// Allowed image mime types — kept narrow for safety.
const ALLOWED_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

const ALLOWED_EXT = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

ensureDir(UPLOADS_ROOT);

const makeStorage = (bucket) => multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(UPLOADS_ROOT, bucket);
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = ALLOWED_EXT[file.mimetype] || path.extname(file.originalname).toLowerCase();
    const rand = Math.random().toString(36).slice(2, 10);
    cb(null, `${Date.now()}-${rand}${ext}`);
  },
});

const fileFilter = (_req, file, cb) => {
  if (!ALLOWED_MIMES.has(file.mimetype)) {
    return cb(new AppError('Format file tidak didukung (hanya PNG, JPG, WEBP, GIF)', 400));
  }
  cb(null, true);
};

const makeUploader = (bucket) => multer({
  storage: makeStorage(bucket),
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

module.exports = {
  UPLOADS_ROOT,
  uploadLogo: makeUploader('logos').single('file'),
  uploadQuestionImage: makeUploader('questions').single('file'),
};
