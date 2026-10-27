/**
 * dist/ is pruned after each build, not emptied when the config loads.
 *
 * - The prune plugin (taken from a real configuration): files the build did not write go, once
 *   every output is written; the declaration bundle's file stays; a failed build prunes nothing.
 * - A real build of a fixture package whose dist/types holds a declaration from an earlier file
 *   layout (`Button.d.ts`, now `Button/index.ts`): the stale file is removed before the
 *   declaration bundle runs, so dist/index.d.ts is built from the current source.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { rollup } from 'rollup'
import { createConfiguration } from '../src/index.js'

const TSCONFIG = JSON.stringify({
  compilerOptions: {
    target: 'ES2020',
    module: 'ESNext',
    moduleResolution: 'bundler',
    strict: true,
    declaration: true,
    rootDir: 'src',
    outDir: 'dist',
    declarationDir: 'dist/types',
  },
  include: ['src'],
})

/** A temp package directory (the configuration reads package.json and writes dist/ relative to cwd). */
function fixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nice-config-rollup-'))
  const base = { 'package.json': '{ "name": "fixture" }', 'tsconfig.json': TSCONFIG }
  for (const [file, content] of Object.entries({ ...base, ...files })) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
    fs.writeFileSync(path.join(dir, file), content)
  }
  process.chdir(dir)
  return dir
}

const exists = (dir, file) => fs.existsSync(path.join(dir, file))

/** The prune plugin of a configuration built in the current directory. */
const prunePlugin = (options) =>
  createConfiguration(options)[0].plugins.find((plugin) => plugin.name === 'nice-prune-stale-output')

const PREVIOUS_BUILD = {
  'dist/index.js': 'old',
  'dist/index.esm.js': 'old',
  'dist/index.d.ts': 'old',
  'dist/types/index.d.ts': 'old',
  'dist/types/Button.d.ts': 'stale',
}

test('loading the configuration leaves the previous dist/ in place', () => {
  const dir = fixture(PREVIOUS_BUILD)
  createConfiguration()
  for (const file of Object.keys(PREVIOUS_BUILD)) assert.ok(exists(dir, file), file)
})

test('after the last output is written, files the build did not write are removed', () => {
  const dir = fixture(PREVIOUS_BUILD)
  const prune = prunePlugin()
  prune.buildStart()
  prune.writeBundle({ file: 'dist/index.js' }, { 'index.js': {}, 'types/index.d.ts': {} })
  assert.ok(exists(dir, 'dist/types/Button.d.ts'), 'nothing is pruned before every output is written')
  prune.writeBundle({ file: 'dist/index.esm.js' }, { 'index.esm.js': {}, 'types/index.d.ts': {} })
  assert.ok(!exists(dir, 'dist/types/Button.d.ts'), 'the stale declaration is removed')
  for (const file of ['dist/index.js', 'dist/index.esm.js', 'dist/types/index.d.ts', 'dist/index.d.ts']) {
    assert.ok(exists(dir, file), file)
  }
})

test('directories left empty by the prune are removed', () => {
  const dir = fixture({ ...PREVIOUS_BUILD, 'dist/types/Old/index.d.ts': 'stale' })
  const prune = prunePlugin()
  prune.buildStart()
  prune.writeBundle({ file: 'dist/index.js' }, { 'index.js': {} })
  prune.writeBundle({ file: 'dist/index.esm.js' }, { 'index.esm.js': {} })
  assert.ok(!exists(dir, 'dist/types/Old'))
})

test('a failed build (no output written) prunes nothing; clean: false adds no prune', () => {
  const dir = fixture(PREVIOUS_BUILD)
  const prune = prunePlugin()
  prune.buildStart()
  // rollup calls no writeBundle when the build fails
  for (const file of Object.keys(PREVIOUS_BUILD)) assert.ok(exists(dir, file), file)
  assert.equal(prunePlugin({ clean: false }), undefined)
})

test('a consumer plugin list (the react-icon escape hatch) still gets the prune', () => {
  fixture({})
  assert.ok(prunePlugin({ plugins: [] }))
})

test('a real build replaces an old-layout declaration instead of bundling it', async () => {
  const dir = fixture({
    ...PREVIOUS_BUILD,
    'dist/types/Button.d.ts': 'export declare const staleButton: number;\n',
    'src/index.ts': "export { Button } from './Button'\n",
    'src/Button/index.ts': 'export const Button = (label: string): string => label\n',
  })
  // What `rollup -c` does: each configuration in turn, every output written before the next
  for (const config of createConfiguration()) {
    const bundle = await rollup({ ...config, onwarn: () => {} })
    for (const output of config.output) await bundle.write(output)
    await bundle.close()
  }
  assert.ok(!exists(dir, 'dist/types/Button.d.ts'), 'the old-layout declaration is pruned')
  assert.ok(exists(dir, 'dist/types/Button/index.d.ts'))
  const declarations = fs.readFileSync(path.join(dir, 'dist/index.d.ts'), 'utf8')
  assert.match(declarations, /Button: \(label: string\) => string/)
  assert.doesNotMatch(declarations, /staleButton/)
})
