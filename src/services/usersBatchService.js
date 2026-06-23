const { createUserWithProfile } = require('./userService');
const { AppError } = require('../utils/asyncHandler');

// Normalisasi nilai boolean-like dari teks. Cocok dengan perilaku di userController:
// kosong -> undefined, nilai tak dikenal -> error per-baris.
const parseBooleanLike = (value, fieldName = 'boolean') => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'ya'].includes(normalized)) return true;
    if (['false', '0', 'no', 'tidak'].includes(normalized)) return false;
  }
  throw new AppError(`${fieldName} harus bernilai boolean`, 400);
};

// Buat banyak user; gagal per-baris tidak menghentikan batch.
const createUsersBatch = async (users) => {
  if (!Array.isArray(users) || users.length === 0) {
    throw new AppError('Data user wajib diisi', 400);
  }
  if (users.length > 500) {
    throw new AppError('Maksimal 500 user per batch', 400);
  }

  const results = { success: [], failed: [], errors: [] };

  for (const userData of users) {
    try {
      if (!userData.username || !userData.password || !userData.role || !userData.full_name) {
        results.failed.push(userData.username || 'unknown');
        results.errors.push({ username: userData.username || 'unknown', error: 'username, password, role, dan full_name wajib diisi' });
        continue;
      }
      const normalized = { ...userData, is_coordinator: parseBooleanLike(userData.is_coordinator, 'is_coordinator') };
      if (normalized.role === 'teacher' && !normalized.subject) {
        throw new AppError('subject (mata pelajaran) wajib diisi untuk guru', 400);
      }
      const user = await createUserWithProfile(normalized);
      results.success.push({ username: user.username, id: user.id });
    } catch (error) {
      results.failed.push(userData.username || 'unknown');
      results.errors.push({ username: userData.username || 'unknown', error: error.message || 'Gagal membuat user' });
    }
  }

  return {
    total: users.length,
    success: results.success.length,
    failed: results.failed.length,
    successDetails: results.success,
    failedDetails: results.failed,
    errors: results.errors,
  };
};

module.exports = { createUsersBatch, parseBooleanLike };
