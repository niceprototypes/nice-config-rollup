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
