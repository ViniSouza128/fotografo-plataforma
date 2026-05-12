// vitest.config.js
// Configuração do test runner. Mantida mínima e pragmática (P41).
//
// Targeting:
//   - testes em tests/**/*.test.js
//   - alias @/* -> src/*  (igual ao jsconfig.json do Next)
//   - environment 'node' por padrão (libs lib/*.js são pure node)
//     testes que precisam de DOM declaram com /** @vitest-environment jsdom */

import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.{js,mjs}'],
    exclude: ['node_modules/**', '.next/**', 'storage/**', 'public/uploads/**'],
    environment: 'node',
    globals: true,
    reporters: ['default'],
    pool: 'forks',
    silent: false,
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
