/**
 * @typedef {import("../computedStyles.js").ComputedStyleFixture} ComputedStyleFixture
 */

/**
 * Stylesheets and matching markup for the isGrouping computed style tests.
 *
 * @type {ComputedStyleFixture[]}
 */
export const isGroupingFixtures = [
  {
    name: "group selectors with a shared prefix",
    html: `
      <article class="card"><h2 class="title">A</h2><p class="body">B</p></article>
      <article class="card primary"><h2 class="title">C</h2><p class="body">D</p></article>
      <article class="tag"><span class="label">E</span><span class="value">F</span></article>`,
    css: `
      .card .title, .card .body { color: red }
      .primary .body { color: blue }
      .card.primary .title { color: orange }
      .card > .title, .card > .body { font-weight: bold }
      .tag .label, .tag .value { color: green }`,
  },
  {
    name: "group selectors with pseudo-classes",
    html: `<button class="button"><span class="label">A</span><span class="icon">B</span></button>`,
    hover: [".button"],
    css: `
      .button .label, .button .icon { color: blue }
      .button:hover .label, .button:hover .icon { color: green }`,
  },
]
