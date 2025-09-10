import { defineConfig } from 'vite';
import { tidewave } from './src/vite-plugin-tidewave';

export default defineConfig({
  plugins: [tidewave()],
});
