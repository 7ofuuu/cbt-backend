/**
 * School Profile Controller
 * Singleton school profile - always row id = 1.
 * GET  /api/school-profile       → public (no auth) - used by headers, login, Flutter
 * PUT  /api/school-profile       → admin only
 */
const prisma = require('../config/db');
const { asyncHandler, AppError } = require('../utils/asyncHandler');
const activityLogService = require('../services/activityLogService');
const { deletePublicUpload } = require('../utils/uploadFs');

// Ensure the singleton row exists (upsert with id = 1)
const ensureProfile = async () => {
  return prisma.schoolProfile.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, school_name: 'Nama Sekolah' },
  });
};

// GET /api/school-profile
const getSchoolProfile = asyncHandler(async (_req, res) => {
  let profile = await prisma.schoolProfile.findUnique({ where: { id: 1 } });
  if (!profile) profile = await ensureProfile();
  res.json({ data: profile });
});

// PUT /api/school-profile  (admin only)
const updateSchoolProfile = asyncHandler(async (req, res) => {
  const {
    school_name,
    npsn,
    address,
    city,
    province,
    postal_code,
    phone,
    email,
    website,
    logo_url,
    principal_name,
    school_level,
    accreditation,
  } = req.body;

  if (!school_name || !school_name.trim()) {
    throw new AppError('Nama sekolah wajib diisi', 400);
  }

  if (!logo_url || !logo_url.trim()) {
    throw new AppError('Logo sekolah wajib diunggah', 400);
  }

  // Sanitize: trim all string fields
  const sanitize = (v) => (typeof v === 'string' ? v.trim() || null : v ?? null);

  // Snapshot the current logo so we can delete it from disk if it gets replaced.
  const existing = await prisma.schoolProfile.findUnique({ where: { id: 1 } });

  const profile = await prisma.schoolProfile.upsert({
    where: { id: 1 },
    update: {
      school_name: school_name.trim(),
      npsn: sanitize(npsn),
      address: sanitize(address),
      city: sanitize(city),
      province: sanitize(province),
      postal_code: sanitize(postal_code),
      phone: sanitize(phone),
      email: sanitize(email),
      website: sanitize(website),
      logo_url: sanitize(logo_url),
      principal_name: sanitize(principal_name),
      school_level: sanitize(school_level),
      accreditation: sanitize(accreditation),
    },
    create: {
      id: 1,
      school_name: school_name.trim(),
      npsn: sanitize(npsn),
      address: sanitize(address),
      city: sanitize(city),
      province: sanitize(province),
      postal_code: sanitize(postal_code),
      phone: sanitize(phone),
      email: sanitize(email),
      website: sanitize(website),
      logo_url: sanitize(logo_url),
      principal_name: sanitize(principal_name),
      school_level: sanitize(school_level),
      accreditation: sanitize(accreditation),
    },
  });

  // If the logo changed, remove the previous file from disk so old logos don't
  // orphan. Best-effort and only touches local "/uploads/..." paths.
  if (existing?.logo_url && existing.logo_url !== profile.logo_url) {
    deletePublicUpload(existing.logo_url);
  }

  // Activity log
  await activityLogService.logFromRequest(req, 'UPDATE_SCHOOL_PROFILE',
    `Admin memperbarui profil sekolah: ${school_name.trim()}`,
    { metadata: { school_name: school_name.trim(), updated_fields: Object.keys(req.body) } });

  res.json({ message: 'Profil sekolah berhasil diperbarui', data: profile });
});

module.exports = { getSchoolProfile, updateSchoolProfile };
