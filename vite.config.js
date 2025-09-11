import { defineConfig } from 'vite';
import { tidewave } from './src/vite-plugin';

export default defineConfig({
  plugins: [tidewave()],
});
