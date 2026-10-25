// Empaqueta el servidor y los comandos de administración (con el paquete compartido) en dist/.
// Todo queda en el mismo nivel para que las migraciones se encuentren en ../migrations.
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

await build({
  entryPoints: {
    main: 'src/main.ts',
    migrar: 'src/cli/migrar.ts',
    'crear-admin': 'src/cli/crear-admin-plataforma.ts',
    'cargar-rama': 'src/cli/cargar-rama.ts',
    tareas: 'src/cli/tareas.ts',
  },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  packages: 'external',
  // El paquete compartido es código fuente TypeScript del monorepo: se incluye en el bundle.
  plugins: [
    {
      name: 'incluir-shared',
      setup(b) {
        b.onResolve({ filter: /^@scouttracker\/shared$/ }, async () => ({ path: fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)) }));
      },
    },
  ],
  sourcemap: true,
});
