import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // RNF-032: con --coverage mide las reglas críticas (edad y TADA, cuotas, permisos por rol y
    // alcance, conflictos sin conexión y totalización de materiales) y falla si alguna queda por
    // debajo del 70%.
    coverage: {
      provider: 'v8',
      include: ['src/fechas.ts', 'src/ficha.ts', 'src/permisos.ts', 'src/actividades.ts', 'src/fichaActividad.ts'],
      reporter: ['text', 'html'],
      thresholds: { perFile: true, statements: 70, branches: 70, functions: 70, lines: 70 },
    },
  },
});
