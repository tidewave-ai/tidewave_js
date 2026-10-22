import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/vite-plugin.ts", "src/tanstack.ts", "src/cli/index.ts"],
  dts: true,
});
