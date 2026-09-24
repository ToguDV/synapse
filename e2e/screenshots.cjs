// Captures the screenshots referenced by README.md from the E2E renderer with
// the mocked api. Requires the E2E server on port 5174:
//   docker compose run -d --rm --name synapse-e2e dev npx vite --config tests/vite.e2e.config.ts
//   node e2e/screenshots.cjs
const { chromium } = require('./playwright.cjs')
const fs = require('node:fs')
const path = require('node:path')

const URL = 'http://localhost:5174/'
const MOCK = path.join(__dirname, 'mock-api.js')
const OUT = path.join(__dirname, '..', 'docs', 'media')

const content = (text) => JSON.stringify({ text })
const todo = (text, status) => JSON.stringify({ text, status })

const seed = (theme) => ({
  pages: [
    { id: 'p1', title: 'Product notes', parentId: null, icon: '🌿', position: 0, createdAt: 1, updatedAt: 4 },
    { id: 'p2', title: 'Roadmap', parentId: 'p1', icon: '🗺️', position: 0, createdAt: 2, updatedAt: 3 },
    { id: 'p3', title: 'Meeting notes', parentId: null, icon: '☕', position: 1, createdAt: 3, updatedAt: 2 },
    { id: 'p4', title: 'Reading list', parentId: null, icon: '📚', position: 2, createdAt: 4, updatedAt: 1 }
  ],
  blocks: [
    { id: 'b1', pageId: 'p1', type: 'heading', content: content('Why Synapse?'), position: 0, indent: 0 },
    {
      id: 'b2',
      pageId: 'p1',
      type: 'paragraph',
      content: content(
        'A local-first, Notion-style block editor. Everything lives in a single SQLite file on your machine — no accounts, no servers.'
      ),
      position: 1,
      indent: 0
    },
    {
      id: 'b3',
      pageId: 'p1',
      type: 'bullet',
      content: content('Blocks are plain data: split, merge, indent and undo are pure functions'),
      position: 2,
      indent: 0
    },
    {
      id: 'b4',
      pageId: 'p1',
      type: 'bullet',
      content: content('Indent with Tab, reorder by dragging the handle'),
      position: 3,
      indent: 1
    },
    { id: 'b5', pageId: 'p1', type: 'todo', content: todo('Editor core and keyboard navigation', 'done'), position: 4, indent: 0 },
    { id: 'b6', pageId: 'p1', type: 'todo', content: todo('Design system (Mocha Synapse)', 'in-progress'), position: 5, indent: 0 },
    { id: 'b7', pageId: 'p1', type: 'todo', content: todo('Write the README', 'todo'), position: 6, indent: 0 },
    { id: 'b8', pageId: 'p1', type: 'quote', content: content('The best note is the one you actually take.'), position: 7, indent: 0 },
    {
      id: 'b9',
      pageId: 'p1',
      type: 'code',
      content: content('const blocks = await window.api.blocks.list(pageId)'),
      position: 8,
      indent: 0
    },
    {
      id: 'b10',
      pageId: 'p1',
      type: 'paragraph',
      content: content('Press / to insert a block, or type Markdown like “# ” or “- ”.'),
      position: 9,
      indent: 0
    }
  ],
  settings: { theme }
})

const capture = async (browser, { name, theme, viewport, hasTouch = false, openSidebar = false }) => {
  const context = await browser.newContext({ viewport, hasTouch, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await page.addInitScript({
    content: `localStorage.clear(); localStorage.setItem('__synapse_e2e_mock__', ${JSON.stringify(JSON.stringify(seed(theme)))})`
  })
  await page.addInitScript({ path: MOCK })
  await page.goto(URL)
  await page.waitForSelector('[data-block-id]')
  if (openSidebar) {
    await page.click('[data-sidebar-toggle]')
    await page.waitForSelector('[data-sidebar-backdrop]')
  }
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(300)
  const file = path.join(OUT, `${name}.png`)
  await page.screenshot({ path: file })
  await context.close()
  console.log(`wrote ${file}`)
}

const main = async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch()
  try {
    await capture(browser, { name: 'editor-dark', theme: 'dark', viewport: { width: 1440, height: 900 } })
    await capture(browser, { name: 'editor-light', theme: 'light', viewport: { width: 1440, height: 900 } })
    await capture(browser, {
      name: 'mobile',
      theme: 'dark',
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      openSidebar: true
    })
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
