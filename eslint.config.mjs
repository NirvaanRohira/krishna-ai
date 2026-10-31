import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Offline tooling (ingestion scripts) and tests: pragmatic typing is fine here.
    files: ['scripts/**', '__tests__/**', 'vitest.setup.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
    },
  },
  {
    // Global ambient declarations must use `var` (that is how TS augments globalThis).
    files: ['**/*.d.ts'],
    rules: { 'no-var': 'off' },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'coverage/**', 'scripts/data/**',
    // vendored Hairline kernel (MIT) and its generated bundles
    'lib/hairline/kernel.js', 'public/hairline/**', 'playwright-report/**', 'test-results/**']),
])
