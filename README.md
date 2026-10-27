# nice-config-rollup

Shared Rollup configuration factory for the `nice-*` ecosystem. Split out of
`nice-configuration`.

## Usage

```js
// rollup.config.js
import { createConfiguration } from "nice-config-rollup"

export default createConfiguration()
```

With options:

```js
import { createConfiguration } from "nice-config-rollup"

export default createConfiguration({
  input: "src/index.ts",
  additionalExternals: ["lodash"],
  bundlePackages: ["nice-icons"],
})
```

## Exports

| Export | Purpose |
|--------|---------|
| `createConfiguration(options)` | Full dual-format (CJS + ESM) config with bundled declarations |
| `isNiceExternal(id)` | Pattern-based external detection for `nice-*` + React ecosystem |
| `createExternals({ additional, bundle })` | Custom external function reading the consumer's peerDependencies |

Peer dependencies (`rollup`, `typescript`, `tslib`) are optional and provided by
the consuming package.

## dist/ is pruned, never emptied

After each build, once every output is written, the files in `dist/` that the build did not
write are deleted (and directories left empty). This removes declarations left by an earlier
file layout (`Button.d.ts` → `Button/index.ts`, a rename), which `rollup-plugin-dts` would
otherwise bundle, while `dist/` keeps the previous build until the new one replaces it: a watcher
stopped mid-build, or a dependent built at the same time, never finds it empty. The declaration
bundle (`dist/index.d.ts`) is kept. A failed build writes nothing and prunes nothing.

`clean: false` turns the prune off.

```sh
npm test   # the prune, including a real build of a fixture with a stale declaration
```
