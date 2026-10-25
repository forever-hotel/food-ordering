import type { Config } from 'jest';
import { pathsToModuleNameMapper } from 'ts-jest';
import ts from 'typescript';

// Path aliases from tsconfig.json
const { config: tsconfig } = ts.readConfigFile(
  './tsconfig.json',
  ts.sys.readFile,
);

const paths = tsconfig?.compilerOptions?.paths ?? {};

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],

  extensionsToTreatAsEsm: ['.ts'],

  rootDir: '.',

  testRegex: '.*\\.spec\\.ts$',

  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
  },

  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    ...pathsToModuleNameMapper(paths, {
      prefix: '<rootDir>/',
    }),
  },

  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    'libs/**/*.ts',
    'apps/**/*.ts',
  ],

  coverageDirectory: './coverage',

  testEnvironment: 'node',
};

export default config;