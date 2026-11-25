// Compiles keepsake and the page it serves into one binary. Bun's command line
// can't use plugins, and the page's styles need one.
import process from 'node:process';
import tailwind from 'bun-plugin-tailwind';

const { success, logs } = await Bun.build({
  entrypoints: ['src/app/cli.ts'],
  compile: { outfile: 'dist/keepsake' },
  target: 'bun',
  minify: true,
  plugins: [tailwind],
  define: { 'process.env.NODE_ENV': '"production"' },
  throw: false,
});
for (const log of logs) {
  process.stderr.write(`${log}\n`);
}
process.exit(success ? 0 : 1);
