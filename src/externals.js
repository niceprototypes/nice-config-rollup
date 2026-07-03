/**
 * External dependency detection for nice-* ecosystem
 *
 * Pattern-based matching that handles:
 * - All nice-* packages and subpaths (including CSS imports)
 * - React ecosystem
 * - styled-components
 * - The consuming package's declared peerDependencies (read from ./package.json)
 */

import * as fs from 'fs'

const REACT_PACKAGES = ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime']
const STYLE_PACKAGES = ['styled-components']

/**
 * Reads peerDependencies from the consuming package's package.json
 * @param {string} [packageJsonPath='./package.json'] - Path relative to rollup's cwd
 * @returns {string[]} Array of peer-dependency package names (empty on read/parse error)
 */
function readPeerDependencies(packageJsonPath = './package.json') {
  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
    return Object.keys(pkg.peerDependencies || {})
  } catch {
    return []
  }
}

/**
 * Checks if an id matches a package (exact match or subpath)
 * @param {string} id - The module identifier
 * @param {string} pkg - The package name to match
 * @returns {boolean}
 */
function matchesPackage(id, pkg) {
  return id === pkg || id.startsWith(pkg + '/')
}

/**
 * Determines if a module should be treated as external
 * @param {string} id - The module identifier
 * @param {string[]} [bundlePackages] - nice-* packages to bundle instead of externalize
 * @returns {boolean}
 */
export function isNiceExternal(id, bundlePackages = []) {
  // Check if this package should be bundled instead of externalized
  for (const pkg of bundlePackages) {
    if (matchesPackage(id, pkg)) return false
  }

  // All nice-* packages and any subpath (handles nice-styles/tokens.css, etc.)
  if (id.startsWith('nice-')) return true

  // React ecosystem
  if (REACT_PACKAGES.includes(id)) return true

  // styled-components
  if (STYLE_PACKAGES.includes(id)) return true

  return false
}

/**
 * Creates an external function with additional packages and bundle overrides
 * @param {Object} options - Configuration options
 * @param {string[]} [options.additional] - Additional packages to externalize
 * @param {string[]} [options.bundle] - nice-* packages to bundle instead of externalize
 * @returns {function(string): boolean}
 */
export function createExternals(options = {}) {
  // Support legacy array format for backwards compatibility
  const { additional = [], bundle = [] } = Array.isArray(options)
    ? { additional: options, bundle: [] }
    : options

  // Read peerDependencies once at factory-call time — same lifetime as the rollup build
  const peerDeps = readPeerDependencies()

  return (id) => {
    // Check bundle overrides first
    for (const pkg of bundle) {
      if (matchesPackage(id, pkg)) return false
    }
    if (isNiceExternal(id)) return true
    if (additional.includes(id)) return true
    for (const pkg of peerDeps) {
      if (matchesPackage(id, pkg)) return true
    }
    return false
  }
}
