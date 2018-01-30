module.exports = {
  'extends': 'airbnb',
  'plugins': [
    'jsx-a11y',
    'import'
  ],
  'env': {
    'browser': true,
    'es6': true,
    'node': true,
    'mocha': true,
  },
  "parserOptions": {
    "ecmaFeatures": {
      "jsx": true
    }
  },
  'parser': 'babel-eslint',
  'rules': {
    'semi': ['error', 'never'],
    'react/jsx-filename-extension': 'off',
    'react/jsx-max-props-per-line': 'off',
    'no-restricted-syntax': ["error", {
      'selector': 'ExportDefaultDeclaration',
      'message': 'Always use named exports'
    }],
    'no-lonely-if': 'off',
    'no-floating-decimal': 'off',
    'no-underscore-dangle': 'off',
    'import/extensions': ['error', { 'es': 'never' }],
    'import/no-extraneous-dependencies': 'off',
    'comma-dangle': ['error', 'always-multiline'],
    'no-confusing-arrow': ['error', {'allowParens': true}],
    'import/prefer-default-export': 'off',
    'jsx-a11y/no-static-element-interactions': 'off',
    'arrow-parens': ['error', 'as-needed'],
    'no-console': ['error', { 'allow': ['warn', 'error', 'info'] }],
    'no-continue': 'off',
    'space-in-parens': 'off',
    'object-curly-spacing': 'off',
    'react/jsx-curly-spacing': 'off',
    'react/jsx-first-prop-new-line': 'off',
    'react/jsx-closing-bracket-location': 'off',
    'react/jsx-indent-props': 'off',
    'space-unary-ops': 'off',
    'object-property-newline': 'off',
    'space-infix-ops': 'off',
    'curly': 'off',
    'quotes': 'off',
    'comma-spacing': 'off',
    'array-callback-return': 'off',
    'no-nested-ternary': 'off',
    'no-confusing-arrow': 'off',
    'no-unused-vars':
      [ 'error',
        {
          'vars': 'all',
          'varsIgnorePattern': '^_[a-zA-Z].*',
          'args': 'all',
          'argsIgnorePattern': '^_[a-zA-Z].*'
        }
      ],
    'no-else-return': 'off',
    'react/forbid-prop-types': 'off',
    'react/prefer-stateless-function': 'off',
    'react/jsx-boolean-value': 'off',
    'no-mixed-operators': 'off',
    'consistent-return': 'off',
    'no-plusplus': 'off'
  },
  'settings': {
    'import/resolver': {
      'node': {
        'extensions': ['.js', '.jsx', '.es'],
        'paths': [__dirname],
      },
    },
    'import/core-modules': [
      'bluebird',
      'electron',
      'path-extra',
      'fs-extra',
      'lodash',
      'semver'
    ],
  },
}
