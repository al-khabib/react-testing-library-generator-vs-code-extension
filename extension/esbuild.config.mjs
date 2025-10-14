import { context, build } from 'esbuild';

const watch = process.argv.includes('--watch');

const options = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  external: ['vscode'],
  format: 'cjs',
  sourcemap: true,
  outfile: 'dist/extension.js',
  logLevel: 'info'
};

async function runBuild() {
  if (watch) {
    const ctx = await context(options);
    await ctx.watch();
    console.log('Watching for changes...');
  } else {
    await build(options);
  }
}

runBuild().catch((error) => {
  console.error(error);
  process.exit(1);
});
