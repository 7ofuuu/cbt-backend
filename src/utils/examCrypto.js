/**
 * Exam payload encryption — the "sealed envelope" for pre-downloaded exams.
 *
 * The student app may download an exam package up to H-1, but it must not be
 * readable until the proctor announces the per-exam password at start time.
 * We encrypt the question payload (which already excludes answer keys) with a
 * key derived from that password, so the package on the device is opaque until
 * unlocked locally.
 *
 * Format must stay in lockstep with the Flutter decryptor
 * (`ExamCryptoService`): PBKDF2-HMAC-SHA256 → AES-256-GCM.
 */
const crypto = require('crypto');

// Unambiguous alphabet (no O/0, I/1, etc.) so a proctor can read it aloud.
const PWD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PWD_LENGTH = 10;

const PBKDF2_ITERATIONS = 210000;
const KEY_BYTES = 32; // AES-256
const DIGEST = 'sha256';

/** Generate a random, human-announceable exam password. */
const generatePassword = () => {
  const bytes = crypto.randomBytes(PWD_LENGTH);
  let out = '';
  for (let i = 0; i < PWD_LENGTH; i++) {
    out += PWD_ALPHABET[bytes[i] % PWD_ALPHABET.length];
  }
  return out;
};

const deriveKey = (password, salt) =>
  crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_BYTES, DIGEST);

/**
 * Encrypt a JSON-serializable payload into a transport/storage envelope.
 * Salt and IV are random per call and travel inside the envelope, so the same
 * password decrypts any envelope it produced.
 */
const encryptPayload = (payload, password) => {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = deriveKey(password, salt);

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    v: 1,
    kdf: 'pbkdf2-sha256',
    iterations: PBKDF2_ITERATIONS,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    auth_tag: authTag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
};

module.exports = { generatePassword, encryptPayload, PWD_LENGTH };
