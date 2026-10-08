import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Komponententests (*.test.tsx) schalten jsdom selbst ein: `// @vitest-environment jsdom`.
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx']
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  }
});
