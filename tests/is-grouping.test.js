import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { transform } from "../src/index.js"
import { testComputedStyles } from "./computedStyles.js"
import { isGroupingFixtures } from "./fixtures/isGrouping.js"

/**
 * Assert that a transformation produces the expected source text.
 *
 * @param {string} input - CSS source text.
 * @param {string} expected - Expected transformed source.
 * @returns {void}
 */
function assertTransform(input, expected) {
  const result = transform(input)

  assert.equal(result.modified, true)
  assert.equal(result.code, expected)
}

describe("isGrouping", () => {
  test("group selectors with a shared descendant prefix", () => {
    assertTransform(
      ".card .title, .card .body { color: red; }",
      ".card :is(.title, .body) { color: red; }",
    )
  })

  test("group selectors with a shared child combinator prefix", () => {
    assertTransform(
      ".card > .title, .card > .body { color: red; }",
      ".card > :is(.title, .body) { color: red; }",
    )
  })

  test("group selectors with a shared compound prefix", () => {
    assertTransform(
      ".card.primary .title, .card.primary .body { color: red; }",
      ".card.primary :is(.title, .body) { color: red; }",
    )
  })

  test("group selectors with a shared ancestor chain", () => {
    assertTransform(
      ".component .card .title, .component .card .body { color: red; }",
      ".component .card :is(.title, .body) { color: red; }",
    )
  })

  test("group more than two selectors", () => {
    assertTransform(
      ".card .title, .card .body, .card .footer { color: red; }",
      ".card :is(.title, .body, .footer) { color: red; }",
    )
  })

  test("group suffixes with equal specificity and different node kinds", () => {
    assertTransform(
      ".card .title, .card [data-x] { color: red; }",
      ".card :is(.title, [data-x]) { color: red; }",
    )
  })

  test("group selectors with equal id specificity", () => {
    assertTransform(
      ".card #title, .card #body { color: red; }",
      ".card :is(#title, #body) { color: red; }",
    )
  })

  test("group selector lists inside an at-rule block", () => {
    assertTransform(
      "@media (min-width: 600px) { .component .card .title, .component .card .body { color: red; } }",
      "@media (min-width: 600px) { .component .card :is(.title, .body) { color: red; } }",
    )
  })

  test("group every selector list in the source", () => {
    assertTransform(
      `.card .title, .card .body { color: red; }
.tag .label, .tag .value { color: blue; }`,
      `.card :is(.title, .body) { color: red; }
.tag :is(.label, .value) { color: blue; }`,
    )
  })

  test("group selectors across multiple lines", () => {
    assertTransform(
      `.card .title,
.card .body { color: red; }`,
      ".card :is(.title, .body) { color: red; }",
    )
  })

  test("group selectors with excess whitespace", () => {
    assertTransform(
      ".component .card   .title, .component .card .body { color: red; }",
      ".component .card :is(.title, .body) { color: red; }",
    )
  })

  test("leave selectors without a shared prefix unchanged", () => {
    const input = ".a .b, .c .d { color: red; }"

    assert.equal(transform(input).modified, false)
  })

  test("leave a single-selector rule unchanged", () => {
    const input = `.card .title { color: red; }
.a .b, .c .d { color: blue; }`

    assert.equal(transform(input).modified, false)
  })

  test("leave suffixes with different specificity unchanged", () => {
    const input = ".card .title, .card #body { color: red; }"

    assert.equal(transform(input).modified, false)
  })

  test("leave suffixes with pseudo-elements unchanged", () => {
    const input =
      ".component .card .title::before, .component .card .body::before { color: red; }"

    assert.equal(transform(input).modified, false)
  })

  test("leave suffixes with nested pseudo-elements unchanged", () => {
    const input =
      ".component .card:is(.title::before), .component .card:is(.body::before) { color: red; }"

    assert.equal(transform(input).modified, false)
  })

  test("leave suffixes with unknown pseudo-classes unchanged", () => {
    const input =
      ".component .card:foo(.title), .component .card:foo(.body) { color: red; }"

    assert.equal(transform(input).modified, false)
  })

  test("leave a selector list that would grow unchanged", () => {
    const input = ".a .b, .a .c { color: red; }"

    assert.equal(transform(input).modified, false)
  })

  test("leave a selector that is a prefix of another unchanged", () => {
    const input = ".card .title, .card .title .icon { color: red; }"

    assert.equal(transform(input).modified, false)
  })

  test("leave duplicate selectors unchanged", () => {
    const input = ".card .title, .card .title { color: red; }"

    assert.equal(transform(input).modified, false)
  })

  test("leave suffixes that start with a descendant combinator unchanged", () => {
    const input = ".card .title, .card > .body { color: red; }"

    assert.equal(transform(input).modified, false)
  })

  test("leave suffixes that start with a non-descendant combinator unchanged", () => {
    const input = ".card>.title, .card+.body { color: red; }"

    assert.equal(transform(input).modified, false)
  })

  test("leave a selector list with a comment unchanged", () => {
    const input = ".card .title, /* keep */ .card .body { color: red; }"

    assert.equal(transform(input).modified, false)
  })

  test("leave keyframes unchanged", () => {
    const input =
      "@keyframes fade { .component .card .title, .component .card .body { opacity: 0 } }"

    assert.equal(transform(input).modified, false)
  })

  test("leave an unknown at-rule unchanged", () => {
    const input =
      "@foo { .component .card .title, .component .card .body { color: red } }"

    assert.equal(transform(input).modified, false)
  })

  test("leave an at-rule without a block unchanged", () => {
    assertTransform(
      `@media screen, print;
.card .title, .card .body { color: red }`,
      `@media screen, print;
.card :is(.title, .body) { color: red }`,
    )
  })

  test("leave raw at-rule content unchanged", () => {
    assert.equal(transform("@media x, y { color: red }").modified, false)
  })

  test("leave a rule with a raw prelude unchanged", () => {
    assertTransform(
      `; { color: red }
.card .title, .card .body { color: blue }`,
      `; { color: red }
.card :is(.title, .body) { color: blue }`,
    )
  })

  testComputedStyles(isGroupingFixtures)
})
