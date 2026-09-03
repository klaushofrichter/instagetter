// .mts, not .ts: package.json sets "type": "commonjs", so a .ts config is
// loaded as CommonJS and its ESM syntax only works via Vite's transform shim.
// That shim goes away when configLoader: 'native' becomes the default. The
// extension is what makes this file ESM on its own terms.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./test/setup.ts'],
    // Scoped to test/ on purpose. Vitest's default glob is
    // **/*.{test,spec}.ts, which swallows the playwright specs in e2e/ --
    // they import @playwright/test, register no vitest tests, and fail the
    // file as "0 test". The two suites are run by different runners.
    include: ['test/**/*.test.ts'],
  },
});
