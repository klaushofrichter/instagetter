// .mts, not .ts: package.json sets "type": "commonjs", so a .ts config is
// loaded as CommonJS and its ESM syntax only works via Vite's transform shim.
// That shim goes away when configLoader: 'native' becomes the default. The
// extension is what makes this file ESM on its own terms.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./test/setup.ts'],
  },
});
