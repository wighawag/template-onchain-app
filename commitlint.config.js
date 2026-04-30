export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'chore',
        'docs',
        'refactor',
        'test',
        'build',
        'ci',
        'perf',
        'style',
        'revert',
      ],
    ],
    'header-max-length': [2, 'always', 100],
  },
};
