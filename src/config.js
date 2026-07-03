/**
 * Rollup configuration factory for nice-* packages
 */

import * as fs from 'fs'
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
 * Creates a standard rollup configuration for nice-* packages
 *
 * @param {Object} options
 * @param {string} [options.input='src/index.ts'] - Entry point
 * @param {string} [options.tsconfig='./tsconfig.json'] - Path to tsconfig
 * @param {Object} [options.output] - Custom output config (merged with defaults)
 * @param {Array} [options.plugins] - Override default plugins (escape hatch)
 * @param {string[]} [options.additionalExternals] - Extra packages to externalize
 * @param {string[]} [options.bundlePackages] - nice-* packages to bundle instead of externalize
 * @param {boolean} [options.dts=true] - Generate declaration bundle
 * @param {string} [options.dtsInput='dist/types/index.d.ts'] - Custom input for dts
 * @param {boolean} [options.clean=true] - Wipe dist/ before each build to prevent stale orphan declarations
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

  // Clean dist/ before each build. rollup-plugin-dts will otherwise re-bundle
  // d.ts files left over from a prior file layout (single-file ↔ folder, rename).
  if (clean) {
    fs.rmSync('dist', { recursive: true, force: true })
  }

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
      output: [
        {
          file: 'dist/index.js',
          format: 'cjs',
          sourcemap: true,
          exports: 'named',
          ...output,
        },
        {
          file: 'dist/index.esm.js',
          format: 'esm',
          sourcemap: true,
          exports: 'named',
          ...output,
        },
      ],
      plugins: plugins ?? defaultPlugins,
      external,
    },
  ]

  if (includeDts) {
    configs.push({
      input: dtsInput,
      output: [{ file: 'dist/index.d.ts', format: 'esm' }],
      plugins: [dts()],
      onwarn,
    })
  }

  return configs
}
