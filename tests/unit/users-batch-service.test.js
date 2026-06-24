/**
 * White Box Test: usersBatchService
 * Target: src/services/usersBatchService.js
 */
jest.mock('../../src/services/userService', () => {
  const actual = jest.requireActual('../../src/services/userService');
  return { ...actual, createUserWithProfile: jest.fn() };
});
jest.mock('../../src/services/taxonomyValidationService', () => ({
  loadActiveTaxonomy: jest.fn().mockResolvedValue({ subjects: new Set(), gradeLevels: new Set(), majors: new Set() }),
}));

const { createUserWithProfile } = require('../../src/services/userService');
const { createUsersBatch } = require('../../src/services/usersBatchService');

beforeEach(() => jest.clearAllMocks());

test('UB-01: semua sukses', async () => {
  createUserWithProfile.mockImplementation(async (u) => ({ id: 1, username: u.username }));
  const out = await createUsersBatch([
    { full_name: 'A', username: 'a', password: 'secret1', role: 'admin' },
  ]);
  expect(out.success).toBe(1);
  expect(out.failed).toBe(0);
});

test('UB-02: field wajib kurang -> gagal', async () => {
  const out = await createUsersBatch([{ username: 'a' }]);
  expect(out.failed).toBe(1);
  expect(out.errors[0].error).toMatch(/wajib/i);
});

test('UB-03: duplikat (createUserWithProfile throw) -> dilaporkan', async () => {
  createUserWithProfile.mockRejectedValue(new Error('Username sudah digunakan'));
  const out = await createUsersBatch([
    { full_name: 'A', username: 'dup', password: 'secret1', role: 'admin' },
  ]);
  expect(out.failed).toBe(1);
  expect(out.errors[0].error).toMatch(/sudah digunakan/i);
});

test('UB-04: bukan array -> AppError 400', async () => {
  await expect(createUsersBatch('x')).rejects.toMatchObject({ statusCode: 400 });
});

test('UB-05: lebih dari 500 user -> AppError 400', async () => {
  const users = Array.from({ length: 501 }, (_, i) => ({ username: `u${i}` }));
  await expect(createUsersBatch(users)).rejects.toMatchObject({ statusCode: 400 });
});

test('UB-06: campuran valid/invalid -> hitung success & failed', async () => {
  createUserWithProfile.mockImplementation(async (u) => ({ id: 10, username: u.username }));
  const out = await createUsersBatch([
    { full_name: 'G', username: 'good', password: 'secret1', role: 'admin' },
    { username: 'bad' }, // field wajib kurang
  ]);
  expect(out.success).toBe(1);
  expect(out.failed).toBe(1);
});
