/**
 * @typedef {import("../computedStyles.js").ComputedStyleFixture} ComputedStyleFixture
 */

/**
 * Stylesheets and matching markup for the cssNesting computed style tests.
 *
 * @type {ComputedStyleFixture[]}
 */
export const cssNestingFixtures = [
  {
    name: "nest descendant and compound selectors",
    html: `
      <article class="card primary"><h2 class="title">A</h2></article>
      <article class="card"><h2 class="title">B</h2></article>`,
    css: `
      .card {
        color: red;
        padding: 1rem;
      }
      .card .title {
        color: blue;
        font-weight: bold;
      }
      .card.primary {
        border: 1px solid green;
      }
      .card.primary .title {
        text-decoration: underline;
      }`,
  },
  {
    name: "nest combinators",
    html: `
      <div class="card"><span class="title">A</span><span class="subtitle">B</span></div>
      <div class="card"><span class="title">C</span><span class="subtitle">D</span></div>
      <div class="card"><span class="title">E</span><span class="subtitle">F</span></div>`,
    css: `
      .card { color: red }
      .card > .title { color: blue }
      .card + .card { margin-top: 1rem }
      .card ~ .card { opacity: 0.5 }
      .card > .title + .subtitle { color: green }`,
  },
  {
    name: "nest selectors of equal specificity",
    html: `
      <div class="a"><span class="child">A</span></div>
      <div class="b"><span class="child">B</span></div>
      <ul class="list"><li>1</li><li class="skip">2</li><li>3</li></ul>`,
    css: `
      .a, .b { color: red }
      .a .child, .b .child { color: blue }
      .a .child:hover, .b .child:hover { color: green }
      .list li { color: purple }
      .list li:nth-child(2n + 1) { color: orange }
      .list li:not(.skip) { text-decoration: underline }
      .list li:where(.skip) { opacity: 0.5 }`,
  },
  {
    name: "nest pseudo-classes on functional selectors",
    html: `
      <div class="alpha"><span class="content">A</span></div>
      <div class="beta"><span class="content">B</span></div>`,
    css: `
      :is(.alpha, .beta) .content { color: red }
      :is(.alpha, .beta) .content:hover { color: blue }
      :not(.alpha) .content { font-style: italic }`,
  },
  {
    name: "nest pseudo-elements",
    html: `<p class="item">text <strong>bold</strong></p>`,
    css: `
      .item { color: red }
      .item::before { content: "before"; color: blue }
      .item::after { content: "after"; color: green }
      .item strong { color: purple }`,
  },
  {
    name: "nest rules inside at-rules",
    html: `
      <div class="card"><h2 class="title">A <span>B</span></h2></div>
      <div class="grid"><div>C</div></div>
      <div class="layered">D <span>E</span></div>`,
    css: `
      @media (min-width: 1px) {
        .card .title { color: blue }
        .card .title span { color: pink }
      }
      @supports (display: grid) {
        .grid { display: grid }
        .grid > * { display: block }
      }
      @layer base {
        .layered { color: teal }
        .layered span { color: maroon }
      }`,
  },
  {
    name: "nest interactive states",
    html: `<button class="button"><span class="label">A</span></button>`,
    hover: [".button"],
    css: `
      .button { color: red }
      .button:hover { color: green }
      .button .label { color: blue }
      .button:hover .label { color: purple }`,
  },
]
