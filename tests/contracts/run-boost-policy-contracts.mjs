const contractModules = [
  './fansub-boost-contract.test.mjs',
  './fansub-boost-downgrade-governance-contract.test.mjs',
  './fansub-boost-capability-governance-matrix-contract.test.mjs',
  './fansub-showcase-and-supporter-state-contract.test.mjs',
]

for (const relativeModulePath of contractModules) {
  await import(new URL(relativeModulePath, import.meta.url))
}

