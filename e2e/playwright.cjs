// Resolve the Playwright library so the E2E runners work outside the original
// dev machine, in this order:
//   1. SYNAPSE_PLAYWRIGHT (explicit module id or path)
//   2. the project dependency (`npm i -D playwright`)
//   3. any Playwright inside the npm npx cache (`npx playwright ...`)
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const candidates = []
if (process.env.SYNAPSE_PLAYWRIGHT) candidates.push(process.env.SYNAPSE_PLAYWRIGHT)
candidates.push('playwright')
const npxCache = path.join(os.homedir(), '.npm', '_npx')
if (fs.existsSync(npxCache)) {
  for (const entry of fs.readdirSync(npxCache).sort()) {
    candidates.push(path.join(npxCache, entry, 'node_modules', 'playwright'))
  }
}

let playwright = null
for (const candidate of candidates) {
  try {
    playwright = require(candidate)
    break
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error
  }
}

if (!playwright) {
  throw new Error(
    'Playwright not found: install it (`npm i -D playwright`), set SYNAPSE_PLAYWRIGHT or warm the npx cache (`npx playwright --version`).'
  )
}

module.exports = playwright
