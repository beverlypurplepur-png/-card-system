import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@affine/card-system/registry': fileURLToPath(
        new URL('./src/card-registry.ts', import.meta.url)
      ),
      '@affine/card-system': fileURLToPath(
        new URL('./src/index.ts', import.meta.url)
      ),
    },
  },
  test: {
    include: ['tests/**/*.spec.ts'],
    testTimeout: 20000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
