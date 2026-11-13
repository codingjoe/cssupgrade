import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"
import { chromium, firefox, webkit } from "playwright"
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
 * Browser engines that must show the same styles before and after a transformation.
 */
const engines = { chromium, firefox, webkit }

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
 * Render markup with a stylesheet and read the computed styles.
 *
 * @param {import("playwright").Browser} browser - Browser engine.
 * @param {{html: string, hover?: string[]}} fixture - Markup and selectors to hover.
 * @param {string} css - Stylesheet to apply.
 * @returns {Promise<Record<string, string>>} Computed styles of all elements.
 */
async function readStyles(browser, fixture, css) {
  const page = await browser.newPage()

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
 * Compare the computed styles of every fixture before and after the transformation.
 *
 * Call inside the `describe` block of a transformer. The tests run in Chromium,
 * Firefox, and WebKit for every baseline that changes the fixture source.
 *
 * @param {ComputedStyleFixture[]} fixtures - Stylesheets and markup to test.
 * @returns {void}
 */
export function testComputedStyles(fixtures) {
  describe("computed styles", () => {
    for (const [engineName, engine] of Object.entries(engines)) {
      describe(engineName, () => {
        let browser

        before(async () => {
          browser = await engine.launch()
        })

        after(async () => {
          await browser.close()
        })

        for (const fixture of fixtures) {
          test(fixture.name, async () => {
            const transformed = baselines
              .map((baseline) => ({ baseline, ...transform(fixture.css, baseline) }))
              .filter(({ modified }) => modified)

            assert(transformed.length > 0, "must transform the fixture")

            const before = await readStyles(browser, fixture, fixture.css)

            for (const { baseline, code } of transformed) {
              const after = await readStyles(browser, fixture, code)

              assert.deepEqual(
                calculateDifferences(before, after),
                [],
                `differs with the ${baseline} baseline`,
              )
            }
          })
        }

        test("detect a changed declaration", async () => {
          const fixture = { html: `<div class="box">x</div>` }
          const before = await readStyles(browser, fixture, ".box { color: red }")
          const after = await readStyles(browser, fixture, ".box { color: blue }")

          assert.notDeepEqual(calculateDifferences(before, after), [])
        })
      })
    }
  })
}
