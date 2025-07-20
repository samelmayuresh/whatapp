module.exports = {
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module'
  },
  extends: [
    'eslint:recommended'
  ],
  rules: {
    // General rules
    'no-console': 'off', // Allow console.log for this application
    'no-unused-vars': 'warn',
    'prefer-const': 'error',
    'no-var': 'error',
    
    // Code style (relaxed for TypeScript)
    'indent': 'off', // TypeScript handles this better
    'quotes': ['error', 'single'],
    'semi': ['error', 'always'],
    'comma-dangle': 'off',
    'object-curly-spacing': ['error', 'always'],
    'array-bracket-spacing': ['error', 'never'],
    
    // Best practices
    'eqeqeq': ['error', 'always'],
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-return-assign': 'error',
    'no-self-compare': 'error',
    'no-throw-literal': 'error',
    'radix': 'error'
  },
  env: {
    node: true,
    es2020: true,
    jest: true
  },
  ignorePatterns: [
    'dist/',
    'node_modules/',
    'coverage/',
    '*.js' // Ignore JS files in root (like this config file)
  ]
};