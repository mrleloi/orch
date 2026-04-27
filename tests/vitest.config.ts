import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts', 'scripts/**/*.spec.ts'],
    environment: 'node',
    passWithNoTests: true,
  },
});
