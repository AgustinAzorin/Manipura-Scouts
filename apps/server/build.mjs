// Empaqueta el servidor (con el paquete compartido) en dist/main.js.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.js',
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
        b.onResolve({ filter: /^@scouttracker\/shared$/ }, async () => ({ path: new URL('../../packages/shared/src/index.ts', import.meta.url).pathname }));
      },
    },
  ],
  sourcemap: true,
});
