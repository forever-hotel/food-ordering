/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'jsdom',
  testMatch: [
    '<rootDir>/tests/components/**/*.test.tsx',
    '<rootDir>/tests/components/**/*.test.ts',
  ],
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        tsconfig: {
          jsx: 'react-jsx',
          module: 'commonjs',
          moduleResolution: 'node',
          esModuleInterop: true,
          allowJs: true,
          target: 'ES2022',
        },
        diagnostics: false,
      },
    ],
  },
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': '<rootDir>/tests/components/__mocks__/styleMock.js',
    '^@ant-design/icons$': '<rootDir>/tests/components/__mocks__/iconsMock.js',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  modulePathIgnorePatterns: ['<rootDir>/.next/'],
  setupFilesAfterEnv: ['<rootDir>/tests/components/setup.ts'],
  testTimeout: 25000,
  collectCoverageFrom: [
    'src/components/**/*.{ts,tsx}',
    'src/features/**/*.{ts,tsx}',
    'src/lib/auth/**/*.{ts,tsx}',
    'src/lib/cart/**/*.{ts,tsx}',
    'src/lib/navigation/**/*.{ts,tsx}',
    'src/providers/**/*.{ts,tsx}',
    'src/app/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/features/**/index.ts',
    '!src/app/favicon.ico',
    '!src/config/theme.ts',
  ],
  coverageDirectory: '<rootDir>/coverage-components',
  coverageReporters: ['text', 'lcov', 'json-summary', 'clover'],
  coverageThreshold: {
    global: {
      lines: 80,
      branches: 80,
      statements: 80,
      functions: 80,
    },
  },
};
