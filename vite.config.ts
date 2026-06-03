/* eslint-disable import/no-extraneous-dependencies */
import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  // В продакшне сайт живёт на /zk/
  base: command === "build" ? "/zk/" : "./",
  server: {
    host: true,          // слушать все интерфейсы (вкл. ZeroTier-адрес 10.x)
    allowedHosts: true,  // иначе Vite 7 режет чужой Host → "Blocked request. This host is not allowed"
    cors: true,
  },
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
