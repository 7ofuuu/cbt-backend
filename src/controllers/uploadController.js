/**
 * Upload Controller - turns a stored file into a public URL.
 *
 * The route mounts the matching multer middleware before this controller
 * runs, so by the time we get here `req.file` always exists. We just need
 * to translate the disk path into a URL the frontend can <img src=> against.
 */
const path = require('path');
const { asyncHandler, AppError } = require('../utils/asyncHandler');
const { UPLOADS_ROOT } = require('../middlewares/uploadMiddleware');
const { deletePublicUpload } = require('../utils/uploadFs');

// Build a URL that the dashboard / Flutter app can fetch directly. We return
// a path-only URL (no host) so it stays correct whether the API is on
// localhost, ngrok, or production.
const publicUrlFor = (file) => {
  const rel = path.relative(UPLOADS_ROOT, file.path).split(path.sep).join('/');
  return `/uploads/${rel}`;
};

const uploadFile = asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError('File tidak ditemukan', 400);
  res.status(201).json({
    url: publicUrlFor(req.file),
    filename: req.file.filename,
    size: req.file.size,
    mimetype: req.file.mimetype,
  });
});

// DELETE /api/upload  body: { url }
// Removes an uploaded file from disk. Used by the dashboard to clean up a
// freshly-uploaded image that the user replaced or discarded before saving,
// so abandoned uploads don't accumulate. Path is guarded to the uploads root.
const deleteUpload = asyncHandler(async (req, res) => {
  const url = req.body?.url || req.query?.url;
  if (!url) throw new AppError('URL file tidak diberikan', 400);
  const removed = deletePublicUpload(url);
  res.json({ message: removed ? 'File dihapus' : 'File tidak ditemukan', removed });
});

module.exports = { uploadFile, deleteUpload };
