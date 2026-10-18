import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

// base "./" so the built site works from any GitHub Pages sub-path
export default defineConfig({
  base: "./",
  plugins: [preact()],
  test: { include: ["tests/**/*.test.ts"] },
} as never);
