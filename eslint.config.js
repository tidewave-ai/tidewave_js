import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import functional from 'eslint-plugin-functional';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs,ts}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.json',
      },
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      functional: functional,
    },
    rules: {
      // TypeScript rules
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-var-requires': 'error',

      // Functional programming rules
      'prefer-const': 'error',
      'functional/no-let': 'error',
      'functional/immutable-data': 'error',
      'functional/prefer-immutable-types': 'error',
      'functional/prefer-readonly-type': 'warn',
      'functional/no-classes': 'off', // Allow classes for CLI structure
      'functional/no-this-expression': 'off', // Allow this in classes
      'functional/functional-parameters': [
        'error',
        {
          allowRestParameter: true,
          allowArgumentsKeyword: false,
        },
      ],

      // General code style
      'prefer-const': 'error',
      'no-var': 'error',
      'no-console': 'off', // Allow console for CLI tool
      quotes: ['error', 'single', { avoidEscape: true }],
      semi: ['error', 'always'],
      'comma-dangle': ['error', 'always-multiline'],
      'object-curly-spacing': ['error', 'always'],
      'array-bracket-spacing': ['error', 'never'],

      // Enforce immutability patterns
      'prefer-destructuring': [
        'error',
        {
          array: true,
          object: true,
        },
      ],
      'no-param-reassign': 'error',
      'no-return-assign': 'error',

      // Function style preferences
      'prefer-arrow-callback': 'error',
      'arrow-body-style': ['error', 'as-needed'],
      'func-style': ['error', 'expression', { allowArrowFunctions: true }],
    },
  },
  {
    files: ['**/*.test.{js,ts}', '**/*.spec.{js,ts}'],
    rules: {
      // Relax some rules for test files
      'functional/no-mutation': 'off',
      'functional/no-let': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
  },
];
