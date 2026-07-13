import { defineConfig } from 'vite';

// GitHub Pages serves this repo at https://<user>.github.io/gamedev_rogal/,
// so asset URLs need that subpath as their base (only in production builds —
// local dev keeps serving from /).
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/gamedev_rogal/' : '/',
}));
