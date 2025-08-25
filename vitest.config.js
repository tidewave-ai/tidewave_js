import { defineConfig } from 'vite';
export default defineConfig({
  test: {
    exclude: ['.bun', 'node_modules', 'dist'],
  },
});
