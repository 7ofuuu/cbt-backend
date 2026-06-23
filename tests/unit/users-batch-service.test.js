/**
 * White Box Test: usersBatchService
 * Target: src/services/usersBatchService.js
 */
jest.mock('../../src/services/userService', () => {
  const actual = jest.requireActual('../../src/services/userService');
  return { ...actual, createUserWithProfile: jest.fn() };
});

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
