[2026-09-14 23:10] patch: CJS output uses interop: 'auto' so default imports of __esModule externals (styled-components) unwrap .default under require()
[2026-09-25 19:18] minor: dts step inlines bundlePackages' declarations (includeExternal) so bundled packages need no consumer install
[2026-10-08 22:00] minor: dist/ is pruned after each build instead of emptied when the config loads, so a stopped watcher or a parallel dependent never finds an empty dist/; files the build did not write (stale declarations from an earlier layout) are still removed; clean: false turns the prune off
