/**
 * White Box Test: School Profile Controller + Upload Controller
 * WB-24
 * Target: src/controllers/schoolProfileController.js (getSchoolProfile, updateSchoolProfile)
 *         src/controllers/uploadController.js (uploadFile)
 */
jest.mock('../../src/config/db');
jest.mock('../../src/services/activityLogService', () => ({
  logFromRequest: jest.fn().mockResolvedValue(undefined),
}));

const path = require('path');
const prisma = require('../../src/config/db');
const profileCtrl = require('../../src/controllers/schoolProfileController');
const uploadCtrl = require('../../src/controllers/uploadController');
const { UPLOADS_ROOT } = require('../../src/middlewares/uploadMiddleware');

const makeReqRes = (overrides = {}) => {
  const req = { body: {}, params: {}, query: {}, user: { id: 1 }, headers: {}, ...overrides };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  const next = jest.fn();
  return { req, res, next };
};
const flush = () => new Promise((r) => setImmediate(r));
const run = async (handler, overrides) => {
  const ctx = makeReqRes(overrides);
  handler(ctx.req, ctx.res, ctx.next);
  await flush();
  return ctx;
};

beforeEach(() => jest.clearAllMocks());

// ─── getSchoolProfile ─────────────────────────────────────────────────────────

describe('getSchoolProfile', () => {
  test('WB-SP-01: existing profile → returned directly', async () => {
    prisma.schoolProfile.findUnique.mockResolvedValue({ id: 1, school_name: 'SMA 1' });
    const { res } = await run(profileCtrl.getSchoolProfile);
    expect(res.json).toHaveBeenCalledWith({ data: { id: 1, school_name: 'SMA 1' } });
    expect(prisma.schoolProfile.upsert).not.toHaveBeenCalled();
  });

  test('WB-SP-02: missing profile → lazily created via upsert', async () => {
    prisma.schoolProfile.findUnique.mockResolvedValue(null);
    prisma.schoolProfile.upsert.mockResolvedValue({ id: 1, school_name: 'Nama Sekolah' });
    const { res } = await run(profileCtrl.getSchoolProfile);
    expect(prisma.schoolProfile.upsert).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ data: { id: 1, school_name: 'Nama Sekolah' } });
  });
});

// ─── updateSchoolProfile ──────────────────────────────────────────────────────

describe('updateSchoolProfile', () => {
  test('WB-SP-03: missing school_name → 400', async () => {
    const { next } = await run(profileCtrl.updateSchoolProfile, { body: { school_name: '   ' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-SP-04: valid → upserts and trims/sanitizes fields', async () => {
    prisma.schoolProfile.upsert.mockResolvedValue({ id: 1, school_name: 'SMA 2' });
    const { res } = await run(profileCtrl.updateSchoolProfile, { body: { school_name: '  SMA 2  ', npsn: '  123  ', address: '' } });
    const upsertArg = prisma.schoolProfile.upsert.mock.calls[0][0];
    expect(upsertArg.update.school_name).toBe('SMA 2');
    expect(upsertArg.update.npsn).toBe('123');
    expect(upsertArg.update.address).toBeNull(); // empty string → null
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('diperbarui') }));
  });
});

// ─── uploadFile ───────────────────────────────────────────────────────────────

describe('uploadFile', () => {
  test('WB-UP-01: no file → 400', async () => {
    const { next } = await run(uploadCtrl.uploadFile, { file: undefined });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-UP-02: file present → 201 with path-only public URL', async () => {
    const file = {
      path: path.join(UPLOADS_ROOT, 'images', 'logo.png'),
      filename: 'logo.png',
      size: 2048,
      mimetype: 'image/png',
    };
    const { res } = await run(uploadCtrl.uploadFile, { file });
    expect(res.status).toHaveBeenCalledWith(201);
    const payload = res.json.mock.calls[0][0];
    expect(payload.url).toBe('/uploads/images/logo.png');
    expect(payload.filename).toBe('logo.png');
    expect(payload.size).toBe(2048);
  });
});
