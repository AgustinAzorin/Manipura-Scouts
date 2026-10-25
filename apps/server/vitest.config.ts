import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Todas las pruebas comparten una base de datos de prueba.
    fileParallelism: false,
    env: { NODE_ENV: 'test' },
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
