// E2E regression for virtualized page rows, keyboard traversal and drag auto-scroll.
// Run with the renderer server on port 5174:
//   docker compose run -d --rm --name synapse-e2e dev npx vite --config tests/vite.e2e.config.ts
//   node e2e/sidebar-virtualization.e2e.cjs
const { chromium } = require('./playwright.cjs')
const path = require('node:path')

const URL = `http://localhost:${process.env.SYNAPSE_E2E_PORT || 5174}/`
const MOCK = path.join(__dirname, 'mock-api.js')
const PAGE_COUNT = 1_000

const makePages = (count) =>
  Array.from({ length: count }, (_, index) => ({
    id: `large-${String(index).padStart(4, '0')}`,
    title: `Stress page ${String(index).padStart(4, '0')}`,
    parentId: null,
    icon: null,
    position: index,
    createdAt: index + 1,
    updatedAt: index + 1
  }))

async function seed(page, countOrPages) {
  const pages = typeof countOrPages === 'number' ? makePages(countOrPages) : countOrPages
  await page.evaluate((pages) => {
    localStorage.setItem('__synapse_e2e_mock__', JSON.stringify({ pages, blocks: [] }))
  }, pages)
  await page.reload()
  await page.waitForSelector('div[contenteditable]')
  await page.waitForFunction(
    (expected) => Number(document.querySelector('[data-page-list]')?.dataset.pageCount) === expected,
    pages.length
  )
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  page.setDefaultTimeout(15_000)
  const errors = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript({ path: MOCK })
  await page.goto(URL)
  await page.waitForSelector('div[contenteditable]')

  const checks = []
  const check = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail })

  try {
    await seed(page, PAGE_COUNT)
    const initial = await page.evaluate(() => ({
      total: Number(document.querySelector('[data-page-list]')?.dataset.pageCount),
      rendered: Number(document.querySelector('[data-page-list]')?.dataset.pageRendered),
      domRows: document.querySelectorAll('[data-page-depth]').length
    }))
    check(
      'mounts only the viewport window for a thousand visible pages',
      initial.total === PAGE_COUNT &&
        initial.rendered === initial.domRows &&
        initial.rendered < 60,
      initial
    )

    const nav = page.locator('[data-page-nav]')
    await nav.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    const lastPage = '[data-page-id="large-0999"]'
    await page.waitForSelector(lastPage)
    const lastPageVisible = await page.locator(lastPage).evaluate((row) => {
      const navRect = row.closest('[data-page-nav]').getBoundingClientRect()
      const rowRect = row.getBoundingClientRect()
      return rowRect.top >= navRect.top && rowRect.bottom <= navRect.bottom
    })
    check('scrolls to the last virtual row', lastPageVisible, lastPageVisible)

    await page.click(`${lastPage} [data-page-title]`)
    await page.waitForFunction(
      () => document.querySelector('[data-page-id="large-0999"]')?.dataset.active === 'true'
    )
    check('selects an off-screen page after it is virtualized into view', true)

    await nav.evaluate((element) => {
      element.scrollTop = 0
    })
    await page.waitForSelector('[data-page-id="large-0000"]')
    await page.click('[data-search-trigger]')
    await page.fill('[data-search-input]', 'Stress page 0999')
    await page.waitForSelector('[data-search-result][data-kind="page"]')
    await page.locator('[data-search-result][data-kind="page"]').first().click()
    await page.waitForFunction(
      () => document.querySelector('[data-page-id="large-0999"]')?.dataset.active === 'true'
    )
    const samePageAfterSearch = await page.locator('[data-page-id="large-0999"]').evaluate((row) => {
      const navRect = row.closest('[data-page-nav]').getBoundingClientRect()
      const rowRect = row.getBoundingClientRect()
      return rowRect.top >= navRect.top && rowRect.bottom <= navRect.bottom
    })
    check('re-selecting the active off-screen page reveals its virtual row', samePageAfterSearch)

    await page.click('[data-search-trigger]')
    await page.fill('[data-search-input]', 'Stress page 0000')
    await page.waitForSelector('[data-search-result][data-kind="page"]')
    await page.locator('[data-search-result][data-kind="page"]').first().click()
    await page.waitForFunction(
      () => document.querySelector('[data-page-id="large-0000"]')?.dataset.active === 'true'
    )
    const firstAfterSearch = await page.locator('[data-page-id="large-0000"]').evaluate((row) => {
      const navRect = row.closest('[data-page-nav]').getBoundingClientRect()
      const rowRect = row.getBoundingClientRect()
      return rowRect.top >= navRect.top && rowRect.bottom <= navRect.bottom
    })
    check('search navigation reveals the selected virtual row', firstAfterSearch, firstAfterSearch)

    const firstMenu = '[data-page-id="large-0000"] [data-page-action="open-menu"]'
    await page.locator(firstMenu).focus()
    await nav.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await page.waitForSelector(lastPage)
    check('keeps the focused row mounted while scrolling away', await page.locator(firstMenu).count() === 1)
    await page.keyboard.press('Tab')
    await page.waitForFunction(
      () =>
        document.activeElement?.closest('[data-page-id]')?.getAttribute('data-page-id') ===
        'large-0001'
    )
    check('Tab reaches the next page across an unmounted range', true)
    await page.keyboard.press('Shift+Tab')
    await page.waitForFunction(
      () =>
        document.activeElement?.closest('[data-page-id]')?.getAttribute('data-page-id') ===
        'large-0000' &&
        document.activeElement?.getAttribute('data-page-action') === 'open-menu'
    )
    check('Shift+Tab returns across the virtualized range', true)

    await page.locator('[data-page-id="large-0001"] [data-page-title]').dblclick()
    await page.waitForSelector('[data-page-id="large-0001"] [data-page-rename]')
    await nav.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await page.waitForSelector(lastPage)
    await page.keyboard.press('Shift+Tab')
    await page.waitForFunction(
      () =>
        document.activeElement?.closest('[data-page-id]')?.getAttribute('data-page-id') ===
        'large-0000' &&
        document.activeElement?.getAttribute('data-page-action') === 'open-menu'
    )
    check('Shift+Tab from inline rename crosses the virtualized range', true)

    const expandingPages = [
      ...makePages(120),
      ...Array.from({ length: 10 }, (_, index) => ({
        id: `child-${index}`,
        title: `Child ${index}`,
        parentId: 'large-0119',
        icon: null,
        position: index,
        createdAt: 121 + index,
        updatedAt: 121 + index
      }))
    ]
    await seed(page, expandingPages)
    await nav.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await page.waitForSelector('[data-page-id="large-0119"] [data-page-toggle]')
    await page.click('[data-page-id="large-0119"] [data-page-toggle]')
    await page.waitForFunction(
      () => Number(document.querySelector('[data-page-list]')?.dataset.pageCount) === 120
    )
    await nav.evaluate((element) => {
      element.scrollTop = 0
    })

    const expandSource = await page
      .locator('[data-page-id="large-0000"] [data-page-title]')
      .boundingBox()
    const expandNavBox = await nav.boundingBox()
    const expandPointer = {
      x: expandNavBox.x + expandNavBox.width / 2,
      y: expandNavBox.y + expandNavBox.height - 15
    }
    const previousMaxScroll = await nav.evaluate(
      (element) => element.scrollHeight - element.clientHeight
    )
    await page.mouse.move(
      expandSource.x + expandSource.width / 2,
      expandSource.y + expandSource.height / 2
    )
    await page.mouse.down()
    await page.mouse.move(expandPointer.x, expandPointer.y, { steps: 6 })
    await page.waitForFunction(
      (baseMax) => {
        const element = document.querySelector('[data-page-nav]')
        return (
          Number(document.querySelector('[data-page-list]')?.dataset.pageCount) === 130 &&
          element.scrollTop > baseMax
        )
      },
      previousMaxScroll,
      { timeout: 10_000 }
    )
    check('resumes edge auto-scroll after expanding a collapsed parent', true)
    await page.keyboard.press('Escape')
    await page.mouse.up()

    await seed(page, 120)
    const source = await page.locator('[data-page-id="large-0000"] [data-page-title]').boundingBox()
    const navBox = await nav.boundingBox()
    const pointer = {
      x: navBox.x + navBox.width / 2,
      y: navBox.y + navBox.height - 3
    }
    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2)
    await page.mouse.down()
    await page.mouse.move(pointer.x, pointer.y, { steps: 6 })
    await page.waitForFunction(
      () => {
        const element = document.querySelector('[data-page-nav]')
        return element.scrollTop > 50
      },
      null,
      { timeout: 8_000 }
    )
    await page.waitForFunction(
      () => {
        const element = document.querySelector('[data-page-nav]')
        return element.scrollTop >= element.scrollHeight - element.clientHeight - 1
      },
      null,
      { timeout: 8_000 }
    )
    await page.waitForSelector('[data-page-id="large-0119"][data-page-drop="after"]')
    await page.mouse.up()
    await page.waitForFunction(
      () => window.__mockState().pages.find((candidate) => candidate.id === 'large-0000')?.position === 119
    )
    check('auto-scrolls a drag to the end and reorders the last page', true)

    const touchContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true
    })
    const touchPage = await touchContext.newPage()
    touchPage.setDefaultTimeout(15_000)
    await touchPage.addInitScript({ path: MOCK })
    await touchPage.goto(URL)
    await touchPage.waitForSelector('div[contenteditable]')
    await seed(touchPage, 120)
    await touchPage.tap('[data-sidebar-toggle]')
    await touchPage.waitForTimeout(250)

    const touchSource = await touchPage
      .locator('[data-page-id="large-0000"] [data-page-title]')
      .boundingBox()
    const touchNav = touchPage.locator('[data-page-nav]')
    const touchNavBox = await touchNav.boundingBox()
    const touchPointer = {
      x: touchNavBox.x + touchNavBox.width / 2,
      y: touchNavBox.y + touchNavBox.height - 3
    }
    const dispatchTouchPointer = (target, type, x, y) =>
      touchPage.evaluate(
        ({ target, type, x, y }) => {
          const element = target === 'window' ? window : document.querySelector(target)
          element.dispatchEvent(
            new PointerEvent(type, {
              bubbles: true,
              cancelable: true,
              pointerId: 17,
              pointerType: 'touch',
              isPrimary: true,
              clientX: x,
              clientY: y,
              button: 0,
              buttons: type === 'pointerup' ? 0 : 1
            })
          )
        },
        { target, type, x, y }
      )
    await dispatchTouchPointer(
      '[data-page-id="large-0000"] [data-page-title]',
      'pointerdown',
      touchSource.x + touchSource.width / 2,
      touchSource.y + touchSource.height / 2
    )
    await touchPage.waitForTimeout(500)
    await dispatchTouchPointer('window', 'pointermove', touchPointer.x, touchPointer.y)
    await touchPage.waitForFunction(
      () => document.querySelector('[data-page-nav]').scrollTop > 50,
      null,
      { timeout: 8_000 }
    )
    await touchPage.waitForFunction(
      () => {
        const element = document.querySelector('[data-page-nav]')
        return element.scrollTop >= element.scrollHeight - element.clientHeight - 1
      },
      null,
      { timeout: 8_000 }
    )
    await touchPage.waitForSelector('[data-page-id="large-0119"][data-page-drop="after"]')
    await dispatchTouchPointer('window', 'pointerup', touchPointer.x, touchPointer.y)
    await touchPage.waitForFunction(
      () => window.__mockState().pages.find((candidate) => candidate.id === 'large-0000')?.position === 119
    )
    check('touch long-press drag auto-scrolls and reorders the last page', true)
    await touchContext.close()
  } finally {
    await browser.close()
  }

  const failures = checks.filter((item) => !item.ok)
  console.log(JSON.stringify({ checks, failures, errors }, null, 2))
  if (failures.length > 0 || errors.length > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
