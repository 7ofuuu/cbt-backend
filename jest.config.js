module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/tests/unit/**/*.test.js',
    '**/tests/blackbox/**/*.test.js',
  ],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/config/db.js',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'json-summary'],
  testTimeout: 10000,
  setupFiles: ['./tests/setup.js'],
  forceExit: true,
};
