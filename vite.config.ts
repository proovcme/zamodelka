/* eslint-disable import/no-extraneous-dependencies */
import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  // В продакшне сайт живёт на /zk/
  base: command === "build" ? "/zk/" : "./",
  esbuild: {
    supported: {
      "top-level-await": true,
    },
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
  },
}));
