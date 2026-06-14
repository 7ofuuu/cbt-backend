/**
 * White Box Test: Core Utilities
 * WB-8
 * Target: src/utils/asyncHandler.js (asyncHandler, AppError, errorHandler)
 *         src/utils/examCrypto.js (generatePassword, encryptPayload)
 */
const crypto = require('crypto');
const {
  asyncHandler,
  AppError,
  errorHandler,
} = require('../../src/utils/asyncHandler');
const {
  generatePassword,
  encryptPayload,
  PWD_LENGTH,
} = require('../../src/utils/examCrypto');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeRes = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
});

const flush = () => new Promise((resolve) => setImmediate(resolve));

// ─── asyncHandler ───────────────────────────────────────────────────────────

describe('asyncHandler', () => {
  test('WB-AH-01: resolved handler → next NOT called with error', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const next = jest.fn();
    asyncHandler(fn)({}, {}, next);
    await flush();
    expect(fn).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test('WB-AH-02: rejected handler → error forwarded to next', async () => {
    const err = new Error('boom');
    const fn = jest.fn().mockRejectedValue(err);
    const next = jest.fn();
    asyncHandler(fn)({}, {}, next);
    await flush();
    expect(next).toHaveBeenCalledWith(err);
  });

  test('WB-AH-03: handler receives (req, res, next)', async () => {
    const fn = jest.fn().mockResolvedValue();
    const req = { a: 1 };
    const res = { b: 2 };
    const next = jest.fn();
    asyncHandler(fn)(req, res, next);
    await flush();
    expect(fn).toHaveBeenCalledWith(req, res, next);
  });
});

// ─── AppError ─────────────────────────────────────────────────────────────────

describe('AppError', () => {
  test('WB-AE-01: defaults statusCode to 500 and isOperational true', () => {
    const err = new AppError('oops');
    expect(err.statusCode).toBe(500);
    expect(err.isOperational).toBe(true);
    expect(err.message).toBe('oops');
    expect(err.details).toBeNull();
    expect(err).toBeInstanceOf(Error);
  });

  test('WB-AE-02: custom statusCode and details are stored', () => {
    const err = new AppError('not found', 404, { id: 1 });
    expect(err.statusCode).toBe(404);
    expect(err.details).toEqual({ id: 1 });
  });

  test('WB-AE-03: captures a stack trace', () => {
    const err = new AppError('x', 400);
    expect(typeof err.stack).toBe('string');
  });
});

// ─── errorHandler ───────────────────────────────────────────────────────────

describe('errorHandler', () => {
  test('WB-EH-01: Prisma P2002 (unique) → 409 duplikat', () => {
    const res = makeRes();
    errorHandler({ code: 'P2002' }, {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.stringContaining('duplikat') })
    );
  });

  test('WB-EH-02: Prisma P2025 (not found) → 404', () => {
    const res = makeRes();
    errorHandler({ code: 'P2025' }, {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('WB-EH-03: operational AppError → its statusCode + message', () => {
    const res = makeRes();
    errorHandler(new AppError('akses ditolak', 403), {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: 'akses ditolak' })
    );
  });

  test('WB-EH-04: operational AppError with details → details included', () => {
    const res = makeRes();
    errorHandler(new AppError('invalid', 400, { field: 'x' }), {}, res, jest.fn());
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ details: { field: 'x' } })
    );
  });

  test('WB-EH-05: unknown error → 500 internal + logs error', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = makeRes();
    errorHandler(new Error('unexpected'), {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.stringContaining('internal') })
    );
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ─── examCrypto: generatePassword ─────────────────────────────────────────────

describe('generatePassword', () => {
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  test('WB-PW-01: returns string of PWD_LENGTH characters', () => {
    expect(generatePassword()).toHaveLength(PWD_LENGTH);
  });

  test('WB-PW-02: uses only the unambiguous alphabet (no O/0/I/1)', () => {
    for (let i = 0; i < 50; i++) {
      const pwd = generatePassword();
      for (const ch of pwd) {
        expect(ALPHABET).toContain(ch);
      }
    }
  });

  test('WB-PW-03: consecutive calls are (practically) unique', () => {
    const a = generatePassword();
    const b = generatePassword();
    expect(a).not.toBe(b);
  });
});

// ─── examCrypto: encryptPayload ───────────────────────────────────────────────

describe('encryptPayload', () => {
  const decryptEnvelope = (envelope, password) => {
    const salt = Buffer.from(envelope.salt, 'base64');
    const iv = Buffer.from(envelope.iv, 'base64');
    const authTag = Buffer.from(envelope.auth_tag, 'base64');
    const key = crypto.pbkdf2Sync(password, salt, envelope.iterations, 32, 'sha256');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString('utf8'));
  };

  test('WB-EP-01: envelope has versioned metadata fields', () => {
    const env = encryptPayload({ a: 1 }, 'PASSWORD12');
    expect(env).toMatchObject({ v: 1, kdf: 'pbkdf2-sha256', iterations: 210000 });
    expect(typeof env.salt).toBe('string');
    expect(typeof env.iv).toBe('string');
    expect(typeof env.auth_tag).toBe('string');
    expect(typeof env.ciphertext).toBe('string');
  });

  test('WB-EP-02: round-trips - decrypting with same password recovers payload', () => {
    const payload = { questions: [{ id: 1, text: 'Soal' }], meta: 'x' };
    const env = encryptPayload(payload, 'SECRET1234');
    expect(decryptEnvelope(env, 'SECRET1234')).toEqual(payload);
  });

  test('WB-EP-03: wrong password fails authentication (GCM tag mismatch)', () => {
    const env = encryptPayload({ a: 1 }, 'RIGHTPASS1');
    expect(() => decryptEnvelope(env, 'WRONGPASS1')).toThrow();
  });

  test('WB-EP-04: random salt/iv per call → different ciphertext for same input', () => {
    const a = encryptPayload({ a: 1 }, 'SAMEPASS12');
    const b = encryptPayload({ a: 1 }, 'SAMEPASS12');
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });
});
