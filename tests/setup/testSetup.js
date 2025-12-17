const { setupTestDatabase, cleanDatabase, disconnectDatabase } = require('./testDb');

// Setup sebelum semua test
beforeAll(async () => {
  await setupTestDatabase();
});

// Clean database sebelum setiap test
beforeEach(async () => {
  await cleanDatabase();
});

// Disconnect setelah semua test selesai
afterAll(async () => {
  await cleanDatabase();
  await disconnectDatabase();
});
