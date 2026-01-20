import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['server/**/*.test.ts'],
    root: path.join(__dirname, '..'),
    setupFiles: [path.join(__dirname, 'test-setup.ts')],
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', '**/*.test.ts', 'test-setup.ts', '__tests__/utils/testHelpers.ts'],
    },
  },
});
