/**
 * Jest config targets the pure-logic core only (no native/RN runtime required).
 * UI (.tsx) and native-bridge code are validated on-device, not in this suite.
 */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  transform: {
    '^.+\\.(ts|tsx|js)$': 'babel-jest',
  },
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    'src/core/**/*.ts',
    'src/liveness/**/*.ts',
    'src/sync/**/*.ts',
    'src/storage/**/*.ts',
  ],
  coverageThreshold: {
    global: { branches: 75, functions: 85, lines: 85, statements: 85 },
  },
  moduleNameMapper: {
    '^@core/(.*)$': '<rootDir>/src/core/$1',
    '^@liveness/(.*)$': '<rootDir>/src/liveness/$1',
    '^@storage/(.*)$': '<rootDir>/src/storage/$1',
    '^@sync/(.*)$': '<rootDir>/src/sync/$1',
    '^@native/(.*)$': '<rootDir>/src/native/$1',
  },
};
