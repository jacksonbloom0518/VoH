module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/server'],
  testMatch: ['**/__tests__/**/*.test.js'],
  transform: {},
  collectCoverageFrom: [
    'server/**/*.js',
    '!server/**/*.test.js',
    '!server/**/__tests__/**'
  ]
};
