import antfu from '@antfu/eslint-config'

export default antfu({
  formatters: true,
  unocss: true,
  vue: true,
}, {
  files: ['tests/**/*.mjs'],
  rules: { 'test/no-import-node-test': 'off' },
})
