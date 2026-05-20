// Build entry that wires the OpenTUI/Solid JSX plugin into `Bun.build`.
//
// `bunfig.toml`'s `preload = ["@opentui/solid/preload"]` only runs at the Bun
// *runtime* (i.e. `bun run`), not when bundling. Without the plugin
// registered on the build, .tsx files reach Bun's default transformer, which
// emits `import "react/jsx-dev-runtime"` and the build fails with:
//     "No matching export … for import jsxDEV"
//
// `createSolidTransformPlugin` is the same plugin the runtime preload uses;
// passing it to `Bun.build` makes the production bundle work.

import { createSolidTransformPlugin } from '@opentui/solid/bun-plugin';

const result = await Bun.build({
  entrypoints: ['src/cli/index.ts'],
  outdir: 'dist',
  target: 'bun',
  minify: true,
  sourcemap: 'external',
  plugins: [createSolidTransformPlugin()],
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

console.log(`built ${result.outputs.length} file(s) to dist/`);
