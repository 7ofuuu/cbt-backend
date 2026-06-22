/**
 * Upload filesystem helpers.
 *
 * Stored values are path-only public URLs like `/uploads/logos/x.png`. These
 * helpers translate such a value back to an absolute disk path - guarding
 * against path traversal - and best-effort delete the file so replaced or
 * abandoned uploads don't pile up on disk.
 */
const path = require('path');
const fs = require('fs');
const { UPLOADS_ROOT } = require('../middlewares/uploadMiddleware');

// Map a public "/uploads/..." path to an absolute disk path. Returns null when
// the value isn't a local upload path or would resolve outside UPLOADS_ROOT.
const resolveUploadPath = (publicUrl) => {
  if (!publicUrl || typeof publicUrl !== 'string') return null;
  if (!publicUrl.startsWith('/uploads/')) return null;
  const rel = publicUrl.replace(/^\/uploads\//, '');
  const abs = path.resolve(UPLOADS_ROOT, rel);
  // Reject anything that escapes the uploads root (e.g. "../../etc/passwd").
  if (abs !== UPLOADS_ROOT && !abs.startsWith(UPLOADS_ROOT + path.sep)) return null;
  return abs;
};

// Delete a previously uploaded file. Best-effort: never throws, returns whether
// a file was actually removed.
const deletePublicUpload = (publicUrl) => {
  const abs = resolveUploadPath(publicUrl);
  if (!abs) return false;
  try {
    if (fs.existsSync(abs)) {
      fs.unlinkSync(abs);
      return true;
    }
  } catch {
    // Cleanup is best-effort - a missing/locked file shouldn't fail the request.
  }
  return false;
};

module.exports = { resolveUploadPath, deletePublicUpload };
