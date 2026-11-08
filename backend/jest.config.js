module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: 'test/.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { diagnostics: false }] },
  testEnvironment: 'node',
  testTimeout: 30000,
};
