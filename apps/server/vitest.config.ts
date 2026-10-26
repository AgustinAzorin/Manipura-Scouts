import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Todas las pruebas comparten una base de datos de prueba.
    fileParallelism: false,
    env: { NODE_ENV: 'test' },
    testTimeout: 20_000,
    hookTimeout: 30_000,
    // RNF-032: con --coverage mide las reglas críticas del servidor (aislamiento entre grupos y
    // permisos por alcance, conflictos sin conexión) y falla si alguna queda por debajo del 70%.
    coverage: {
      provider: 'v8',
      include: ['src/servicios/acceso.ts', 'src/servicios/actividades.ts'],
      reporter: ['text', 'html'],
      thresholds: { perFile: true, statements: 70, branches: 70, functions: 70, lines: 70 },
    },
  },
});
