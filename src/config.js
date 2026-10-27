/**
 * Rollup configuration factory for nice-* packages
 */

import * as fs from 'fs'
import * as path from 'path'
import { createExternals } from './externals.js'
import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import typescript from '@rollup/plugin-typescript'
import dts from 'rollup-plugin-dts'

// Warnings that are pure artifacts of the unlinked/externalized-peer build and
// have no bearing on the emitted output. Peer deps (react, styled-components,
// nice-react-*) are externalized and may be unlinked while building, so the TS
// plugin can't resolve their types — which also makes JSX/implicit-any checks
// cascade. The JS still emits correctly; these are noise, so they're filtered
// out. Anything NOT in these sets still surfaces through the default handler.
const IGNORED_TS_PLUGIN_CODES = new Set([
  'TS2307', // Cannot find module '...' (externalized peer's types unresolved)
  'TS2875', // JSX runtime 'react/jsx-runtime' module path not found
  'TS7006', // Parameter implicitly has 'any' type (cascade from missing react types)
  'TS7031', // Binding element implicitly has 'any' type (same cascade)
  'TS7026', // JSX element implicitly 'any' — no JSX.IntrinsicElements (same cascade)
  'TS7016', // Could not find a declaration file for module
])
const IGNORED_ROLLUP_CODES = new Set([
  'UNRESOLVED_IMPORT',       // "Unresolved dependencies" — externalized peers
  'UNUSED_EXTERNAL_IMPORT',  // "Unused external imports" — e.g. default React import
])

/**
 * Suppress only the known-harmless unlinked-build warnings; pass everything
 * else to rollup's default handler so real issues remain visible.
 */
function onwarn(warning, defaultHandler) {
  if (warning.plugin === 'typescript' && IGNORED_TS_PLUGIN_CODES.has(warning.pluginCode)) return
  if (IGNORED_ROLLUP_CODES.has(warning.code)) return
  defaultHandler(warning)
}

/**
 * Deletes every file under `root` that is not in `keep`, then the directories left empty.
 */
function pruneDirectory(root, keep) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) {
      pruneDirectory(full, keep)
      if (fs.readdirSync(full).length === 0) fs.rmdirSync(full)
    } else if (!keep.has(full)) {
      fs.rmSync(full, { force: true })
    }
  }
}

/**
 * Removes the files in `dir` that a build did not write, once all of its outputs are written.
 *
 * dist/ is never emptied, so a watcher stopped mid-build, or a dependent built in parallel, still
 * finds the previous build. Stale files from an earlier file layout (single-file ↔ folder, a
 * rename) still go: rollup-plugin-dts would otherwise bundle a stale `Button.d.ts` ahead of the
 * new `Button/index.d.ts`. The prune runs in the last output's `writeBundle`, which rollup awaits
 * before the next config (the declaration bundle) starts. A failed build writes nothing and
 * prunes nothing.
 *
 * @param {Object} options
 * @param {string} options.dir - The output directory
 * @param {number} options.outputs - How many outputs the config writes
 * @param {string[]} options.keep - Files another config writes into `dir` (the declaration bundle)
 */
function pruneStaleOutput({ dir, outputs, keep }) {
  let written = new Set()
  let writes = 0
  return {
    name: 'nice-prune-stale-output',
    buildStart() {
      written = new Set()
      writes = 0
    },
    writeBundle(outputOptions, bundle) {
      const outputDir = path.resolve(outputOptions.dir ?? path.dirname(outputOptions.file))
      for (const fileName of Object.keys(bundle)) written.add(path.resolve(outputDir, fileName))
      writes += 1
      if (writes < outputs || !fs.existsSync(dir)) return
      pruneDirectory(path.resolve(dir), new Set([...written, ...keep.map((file) => path.resolve(file))]))
    },
  }
}

/**
 * Creates a standard rollup configuration for nice-* packages
 *
 * @param {Object} options
 * @param {string} [options.input='src/index.ts'] - Entry point
 * @param {string} [options.tsconfig='./tsconfig.json'] - Path to tsconfig
 * @param {Object} [options.output] - Custom output config (merged with defaults)
 * @param {Array} [options.plugins] - Override default plugins (escape hatch)
 * @param {string[]} [options.additionalExternals] - Extra packages to externalize
 * @param {string[]} [options.bundlePackages] - nice-* packages to bundle instead of externalize (JS and declarations)
 * @param {boolean} [options.dts=true] - Generate declaration bundle
 * @param {string} [options.dtsInput='dist/types/index.d.ts'] - Custom input for dts
 * @param {boolean} [options.clean=true] - After each build, delete the files in dist/ it did not write (stale orphan declarations); dist/ is never emptied
 * @returns {Object[]} Rollup configuration array
 */
export function createConfiguration(options = {}) {
  const {
    input = 'src/index.ts',
    tsconfig = './tsconfig.json',
    output = {},
    plugins = null,
    additionalExternals = [],
    bundlePackages = [],
    dts: includeDts = true,
    dtsInput = 'dist/types/index.d.ts',
    clean = true,
  } = options

  const defaultPlugins = [
    resolve({ browser: true }),
    commonjs(),
    typescript({
      tsconfig,
      sourceMap: true,
      inlineSources: true
    })
  ]

  // Always use createExternals — it reads peerDependencies from the consumer's
  // package.json, replacing the role formerly played by rollup-plugin-peer-deps-external.
  const external = createExternals({ additional: additionalExternals, bundle: bundlePackages })

  const outputs = [
    {
      file: 'dist/index.js',
      format: 'cjs',
      sourcemap: true,
      exports: 'named',
      // Unwrap `.default` from externals that set __esModule (e.g.
      // styled-components' CJS build). Rollup's default ("default") treats the
      // whole require() result as the default export, so `styled.div` is
      // undefined when a CJS consumer (jest) loads the bundle.
      interop: 'auto',
      ...output,
    },
    {
      file: 'dist/index.esm.js',
      format: 'esm',
      sourcemap: true,
      exports: 'named',
      ...output,
    },
  ]
  const dtsOutput = 'dist/index.d.ts'
  const prune = clean ? [pruneStaleOutput({ dir: 'dist', outputs: outputs.length, keep: includeDts ? [dtsOutput] : [] })] : []

  const configs = [
    {
      input,
      cache: false,
      onwarn,
      watch: {
        buildDelay: 200,
        clearScreen: false,
        chokidar: {
          awaitWriteFinish: {
            stabilityThreshold: 150,
            pollInterval: 50
          },
          usePolling: true,
          interval: 100
        }
      },
      output: outputs,
      plugins: [...(plugins ?? defaultPlugins), ...prune],
      external,
    },
  ]

  if (includeDts) {
    configs.push({
      input: dtsInput,
      output: [{ file: dtsOutput, format: 'esm' }],
      // Inline the declarations of bundled packages too. The JS build bundles
      // them (see `external` above), so a consumer does not install them and an
      // `import ... from '<bundled pkg>'` left in index.d.ts would not resolve.
      // rollup-plugin-dts otherwise externalizes every node_modules import.
      plugins: [dts({ includeExternal: bundlePackages })],
      onwarn,
    })
  }

  return configs
}
