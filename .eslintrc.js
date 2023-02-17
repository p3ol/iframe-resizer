const OFF = 0;
const WARNING = 1;

module.exports = {
  extends: '@poool/eslint-config',
  ignorePatterns: ['js/*'],
  rules: {
    'valid-typeof': [WARNING, { requireStringLiterals: false }],
    'import/no-webpack-loader-syntax': OFF,
    'no-undef': OFF,
    'no-var': OFF,
    'no-shadow-restricted-names': OFF,
    'import/order': [WARNING, {
      groups: [
        'builtin',
        'external',
        'internal',
        ['parent', 'sibling', 'index', 'unknown'],
      ],
      'newlines-between': 'always',
    }],
  },
};
