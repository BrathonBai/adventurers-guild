module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  modulePathIgnorePatterns: ['<rootDir>/dist/', '<rootDir>/runtime/dist/'],
  // Tests belong to neither app tsconfig: the UI config is `noEmit` + ESNext,
  // the runtime config is CommonJS but scoped to runtime/src.
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
  },
};
