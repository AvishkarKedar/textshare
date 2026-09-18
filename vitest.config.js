import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    css: false,
    include: ['tests/**/*.test.js', 'tests/**/*.test.ts'],
  },
})
