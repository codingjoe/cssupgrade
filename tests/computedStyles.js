import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"
import { chromium, firefox, webkit } from "playwright"
import { Builder, By } from "selenium-webdriver"
import { transform } from "../src/index.js"

/**
 * @typedef {Object} ComputedStyleFixture
 * @property {string} name - Scenario in imperative mood.
 * @property {string} html - Markup rendered with the original and transformed CSS.
 * @property {string} css - CSS source that the transformation rewrites.
 * @property {string[]} [hover] - Selectors to hover before reading the computed styles.
 */

/**
 * @typedef {Object} ComputedElement
 * @property {string} tagName - Lowercase tag name.
 * @property {string} id - Element id, or an empty string.
 * @property {string[]} classes - Class names.
 * @property {Record<string, string>} styles - Computed value per pseudo-element and property.
 */

/**
 * @typedef {Object} BrowserSession
 * @property {function({html: string, hover?: string[]}, string): Promise<Record<string, string>>} readStyles - Render a stylesheet and read the computed styles.
 * @property {function(): Promise<void>} close - Stop the browser.
 */

/**
 * Playwright engines that must show the same styles before and after a transformation.
 */
const playwrightEngines = { chromium, firefox, webkit }

/**
 * Baselines whose transformations must preserve the computed styles.
 */
const baselines = ["widely-available", "newly-available"]

/**
 * Read every computed property of every element and its pseudo-elements.
 *
 * Runs in the browser, so it must not reference the module scope.
 *
 * @returns {ComputedElement[]} Computed styles in document order.
 */
function collectComputedStyles() {
  const pseudoElements = [null, "::before", "::after", "::marker"]

  return [...document.querySelectorAll("*")].map((element) => ({
    tagName: element.tagName.toLowerCase(),
    id: element.id,
    classes: [...element.classList],
    styles: Object.fromEntries(
      pseudoElements.flatMap((pseudoElement) => {
        const computed = getComputedStyle(element, pseudoElement)

        return [...computed].map((property) => [
          `${pseudoElement ?? "self"} ${property}`,
          computed.getPropertyValue(property),
        ])
      }),
    ),
  }))
}

/**
 * Format an element for a difference message.
 *
 * @param {ComputedElement} element - Computed element.
 * @param {number} index - Position in document order.
 * @returns {string} Element name with id and classes.
 */
function formatElement({ tagName, id, classes }, index) {
  return `${index} ${tagName}${id === "" ? "" : `#${id}`}${classes
    .map((name) => `.${name}`)
    .join("")}`
}

/**
 * Flatten the computed styles of all elements into one record.
 *
 * @param {ComputedElement[]} elements - Computed styles in document order.
 * @returns {Record<string, string>} Computed value per element, pseudo-element, and property.
 */
function flattenStyles(elements) {
  return Object.fromEntries(
    elements.flatMap((element, index) =>
      Object.entries(element.styles).map(([key, value]) => [
        `${formatElement(element, index)} ${key}`,
        value,
      ]),
    ),
  )
}

/**
 * List the computed styles that differ between two snapshots.
 *
 * @param {Record<string, string>} before - Styles of the original source.
 * @param {Record<string, string>} after - Styles of the transformed source.
 * @returns {string[]} One entry per changed property.
 */
function calculateDifferences(before, after) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => before[key] !== after[key])
    .sort()
    .map((key) => `${key}: ${before[key]} -> ${after[key]}`)
}

/**
 * Replace the document with markup.
 *
 * Runs in the browser, so it must not reference the module scope.
 *
 * @param {string} markup - Document markup.
 * @returns {void}
 */
function writeDocument(markup) {
  document.open()
  document.write(markup)
  document.close()
}

/**
 * Drives a Playwright browser.
 */
class PlaywrightSession {
  #browser

  /**
   * @param {import("playwright").Browser} browser - Launched browser.
   */
  constructor(browser) {
    this.#browser = browser
  }

  /**
   * Launch a Playwright browser engine.
   *
   * @param {import("playwright").BrowserType} engine - Browser engine.
   * @returns {Promise<PlaywrightSession>} Launched session.
   */
  static async launch(engine) {
    return new PlaywrightSession(await engine.launch())
  }

  /**
   * Render markup with a stylesheet and read the computed styles.
   *
   * @param {{html: string, hover?: string[]}} fixture - Markup and selectors to hover.
   * @param {string} css - Stylesheet to apply.
   * @returns {Promise<Record<string, string>>} Computed styles of all elements.
   */
  async readStyles(fixture, css) {
    const page = await this.#browser.newPage()

    try {
      await page.setContent(`<!doctype html><style>${css}</style>${fixture.html}`)

      for (const selector of fixture.hover ?? []) {
        await page.hover(selector)
      }

      return flattenStyles(await page.evaluate(collectComputedStyles))
    } finally {
      await page.close()
    }
  }

  /**
   * Stop the browser.
   *
   * @returns {Promise<void>} Resolves when the browser stopped.
   */
  async close() {
    await this.#browser.close()
  }
}

/**
 * Drives Safari through SafariDriver.
 */
class SafariSession {
  #driver

  /**
   * @param {import("selenium-webdriver").WebDriver} driver - SafariDriver session.
   */
  constructor(driver) {
    this.#driver = driver
  }

  /**
   * Launch Safari.
   *
   * @returns {Promise<SafariSession>} Launched session.
   */
  static async launch() {
    return new SafariSession(await new Builder().forBrowser("safari").build())
  }

  /**
   * Render markup with a stylesheet and read the computed styles.
   *
   * @param {{html: string, hover?: string[]}} fixture - Markup and selectors to hover.
   * @param {string} css - Stylesheet to apply.
   * @returns {Promise<Record<string, string>>} Computed styles of all elements.
   */
  async readStyles(fixture, css) {
    await this.#driver.get("about:blank")
    await this.#driver.executeScript(
      writeDocument,
      `<!doctype html><style>${css}</style>${fixture.html}`,
    )

    for (const selector of fixture.hover ?? []) {
      const element = await this.#driver.findElement(By.css(selector))

      await this.#driver.actions().move({ origin: element }).perform()
    }

    return flattenStyles(await this.#driver.executeScript(collectComputedStyles))
  }

  /**
   * Stop Safari.
   *
   * @returns {Promise<void>} Resolves when Safari stopped.
   */
  async close() {
    await this.#driver.quit()
  }
}

/**
 * Verify that a fixture keeps its computed styles after the transformation.
 *
 * @param {BrowserSession} session - Browser session.
 * @param {ComputedStyleFixture} fixture - Fixture to transform.
 * @returns {Promise<void>} Resolves when the styles match.
 */
async function verifyComputedStyles(session, fixture) {
  const transformed = baselines
    .map((baseline) => ({ baseline, ...transform(fixture.css, baseline) }))
    .filter(({ modified }) => modified)

  assert(transformed.length > 0, "must transform the fixture")

  const before = await session.readStyles(fixture, fixture.css)

  for (const { baseline, code } of transformed) {
    const after = await session.readStyles(fixture, code)

    assert.deepEqual(
      calculateDifferences(before, after),
      [],
      `differs with the ${baseline} baseline`,
    )
  }
}

/**
 * Register computed style tests for one browser.
 *
 * @param {string} name - Browser name.
 * @param {function(): Promise<BrowserSession>} launch - Starts the browser.
 * @param {ComputedStyleFixture[]} fixtures - Fixtures to test.
 * @returns {void}
 */
function describeBrowser(name, launch, fixtures) {
  describe(name, () => {
    let session

    before(async () => {
      session = await launch()
    })

    after(async () => {
      await session.close()
    })

    for (const fixture of fixtures) {
      test(fixture.name, async () => {
        await verifyComputedStyles(session, fixture)
      })
    }

    test("detect a changed declaration", async () => {
      const fixture = { html: `<div class="box">x</div>` }
      const before = await session.readStyles(fixture, ".box { color: red }")
      const after = await session.readStyles(fixture, ".box { color: blue }")

      assert.notDeepEqual(calculateDifferences(before, after), [])
    })
  })
}

/**
 * Compare the computed styles of every fixture before and after the transformation.
 *
 * Call inside the `describe` block of a transformer. The tests run in Chromium,
 * Firefox, WebKit, and Safari for every baseline that changes the fixture source.
 * Safari runs only when `SAFARI=1` is set.
 *
 * @param {ComputedStyleFixture[]} fixtures - Stylesheets and markup to test.
 * @returns {void}
 */
export function testComputedStyles(fixtures) {
  describe("computed styles", () => {
    for (const [engineName, engine] of Object.entries(playwrightEngines)) {
      describeBrowser(engineName, () => PlaywrightSession.launch(engine), fixtures)
    }

    if (process.env.SAFARI === "1") {
      describeBrowser("safari", () => SafariSession.launch(), fixtures)
    }
  })
}
