import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { transform } from "../src/index.js"
import { testComputedStyles } from "./computedStyles.js"
import { cssNestingFixtures } from "./fixtures/cssNesting.js"

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

describe("cssNesting", () => {
  test("nest a descendant rule", () => {
    assertTransform(
      `.card {
  padding: 1rem;
}
.card .title {
  font-weight: bold;
}`,
      `.card {
  padding: 1rem;
  .title {
    font-weight: bold;
  }
}`,
    )
  })

  test("nest compound selectors", () => {
    assertTransform(
      `.a {
  color: red;
}
.a:hover {
  color: blue;
}
.a.primary {
  color: green;
}`,
      `.a {
  color: red;
  &:hover {
    color: blue;
  }
  &.primary {
    color: green;
  }
}`,
    )
  })

  test("nest relative combinators", () => {
    assertTransform(
      `.a {
  color: red;
}
.a > .b {
  color: blue;
}
.a + .c {
  color: green;
}
.a ~ .d {
  color: black;
}`,
      `.a {
  color: red;
  & > .b {
    color: blue;
  }
  & + .c {
    color: green;
  }
  & ~ .d {
    color: black;
  }
}`,
    )
  })

  test("nest every selector combination", () => {
    assertTransform(
      `.a, .b {
  color: red;
}
.a .c, .b .c {
  color: blue;
}`,
      `.a, .b {
  color: red;
  .c {
    color: blue;
  }
}`,
    )
  })

  test("nest a chain of rules", () => {
    assertTransform(
      `.a {
  color: red;
}
.a .b {
  color: blue;
}
.a .b .c {
  color: green;
}`,
      `.a {
  color: red;
  .b {
    color: blue;
    .c {
      color: green;
    }
  }
}`,
    )
  })

  test("nest siblings under the ancestor", () => {
    assertTransform(
      `.a {
  color: red;
}
.a .b {
  color: blue;
}
.a .c {
  color: green;
}`,
      `.a {
  color: red;
  .b {
    color: blue;
  }
  .c {
    color: green;
  }
}`,
    )
  })

  test("nest under a parent without declarations", () => {
    assertTransform(
      `.a {
}
.a .b {
  color: red;
}`,
      `.a {
  .b {
    color: red;
  }
}`,
    )
  })

  test("leave partial selector coverage unchanged", () => {
    const input = `.a, .b { color: red; }
.a .c { color: blue; }`

    assert.equal(transform(input).modified, false)
  })

  test("leave parents with different specificity unchanged", () => {
    const input = `.a, #b { color: red; }
.a .c, #b .c { color: blue; }`

    assert.equal(transform(input).modified, false)
  })

  test("leave a :where() parent with a lower specificity unchanged", () => {
    const input = `.a, :where(#x) { color: red; }
.a .c, :where(#x) .c { color: blue; }`

    assert.equal(transform(input).modified, false)
  })

  test("nest parents with equal functional pseudo-class specificity", () => {
    assertTransform(
      `.a:not(#b), .c:not(#d) { color: red; }
.a:not(#b) .e, .c:not(#d) .e { color: blue; }`,
      `.a:not(#b), .c:not(#d) {
  color: red;
  .e {
    color: blue;
  }
}`,
    )
  })

  test("nest parents with equal nth-child specificity", () => {
    assertTransform(
      `.a:nth-child(2n of #b), .c:nth-child(2n of #d) { color: red; }
.a:nth-child(2n of #b) .e, .c:nth-child(2n of #d) .e { color: blue; }`,
      `.a:nth-child(2n of #b), .c:nth-child(2n of #d) {
  color: red;
  .e {
    color: blue;
  }
}`,
    )
  })

  test("nest parents with functional pseudo-classes that are not selectors", () => {
    assertTransform(
      `.a:lang(en), .b:dir(ltr) { color: red; }
.a:lang(en) .c, .b:dir(ltr) .c { color: blue; }`,
      `.a:lang(en), .b:dir(ltr) {
  color: red;
  .c {
    color: blue;
  }
}`,
    )
  })

  test("nest under a universal selector", () => {
    assertTransform(
      `* {
  box-sizing: border-box;
}
* .a {
  color: red;
}`,
      `* {
  box-sizing: border-box;
  .a {
    color: red;
  }
}`,
    )
  })

  test("nest under an attribute selector", () => {
    assertTransform(
      `[data-x] {
  color: red;
}
[data-x] .a {
  color: blue;
}`,
      `[data-x] {
  color: red;
  .a {
    color: blue;
  }
}`,
    )
  })

  test("nest rules in an at-rule block", () => {
    assertTransform(
      `@media (min-width: 600px) {
  .a {
    color: red;
  }
  .a .b {
    color: blue;
  }
}`,
      `@media (min-width: 600px) {
  .a {
    color: red;
    .b {
      color: blue;
    }
  }
}`,
    )
  })

  test("nest rules in nested at-rule blocks", () => {
    assertTransform(
      `@supports (display: grid) {
  @media (min-width: 600px) {
    .a {
      color: red;
    }
    .a .b {
      color: blue;
    }
  }
}`,
      `@supports (display: grid) {
  @media (min-width: 600px) {
    .a {
      color: red;
      .b {
        color: blue;
      }
    }
  }
}`,
    )
  })

  test("nest rules in a layer block", () => {
    assertTransform(
      `@layer components {
  .a {
    color: red;
  }
  .a .b {
    color: blue;
  }
}`,
      `@layer components {
  .a {
    color: red;
    .b {
      color: blue;
    }
  }
}`,
    )
  })

  test("preserve comments inside rules", () => {
    assertTransform(
      `.a {
  /* before */
  color: red;
}
/* between */
.a .b {
  /* inside */
  color: blue;
}`,
      `.a {
  /* before */
  color: red;
  /* between */
  .b {
    /* inside */
    color: blue;
  }
}`,
    )
  })

  test("preserve a comment inside a declaration value", () => {
    assertTransform(
      `.a {
  color: /* note */ red;
}
.a .b {
  color: blue;
}`,
      `.a {
  color: /* note */ red;
  .b {
    color: blue;
  }
}`,
    )
  })

  test("add missing semicolons", () => {
    assertTransform(
      `.a { color: red }
.a .b { color: blue }`,
      `.a {
  color: red;
  .b {
    color: blue;
  }
}`,
    )
  })

  test("preserve custom properties with block values", () => {
    assertTransform(
      `.a {
  --theme: { color: red; };
}
.a .b {
  color: blue;
}`,
      `.a {
  --theme: { color: red; };
  .b {
    color: blue;
  }
}`,
    )
  })

  test("preserve multiline declarations", () => {
    assertTransform(
      `.a {
  background:
    linear-gradient(red, blue);
}
.a .b {
  color: blue;
}`,
      `.a {
  background:
    linear-gradient(red, blue);
  .b {
    color: blue;
  }
}`,
    )
  })

  test("preserve the indentation of the source text", () => {
    assertTransform(
      `  .a {
    color: red;
  }
  .a .b {
    color: blue;
  }`,
      `  .a {
    color: red;
    .b {
      color: blue;
    }
  }`,
    )
  })

  test("use two spaces when the source has no indentation", () => {
    assertTransform(
      ".a{color:red}.a .c{color:blue}",
      `.a {
  color:red;
  .c {
    color:blue;
  }
}`,
    )
  })

  test("leave non-adjacent rules unchanged", () => {
    const input = `.a { color: red; }
.x { color: green; }
.a .b { color: blue; }`

    assert.equal(transform(input).modified, false)
  })

  test("leave existing nesting unchanged", () => {
    const input = `.a {
  color: red;
  .b { color: blue; }
}`

    assert.equal(transform(input).modified, false)
  })

  test("leave a parent with a comment in its prelude unchanged", () => {
    const input = `.a /* keep */ { color: red; }
.a .b { color: blue; }`

    assert.equal(transform(input).modified, false)
  })

  test("leave an unknown functional pseudo-class unchanged", () => {
    const input = `.a:foo(.b) { color: red; }
.a:foo(.b) .c { color: blue; }`

    assert.equal(transform(input).modified, false)
  })

  test("leave a pseudo-element parent unchanged", () => {
    const input = `.a::before { color: red; }
.a::before .b { color: blue; }`

    assert.equal(transform(input).modified, false)
  })

  test("leave a nesting selector parent unchanged", () => {
    const input = `& .a { color: red; }
& .a .b { color: blue; }`

    assert.equal(transform(input).modified, false)
  })

  test("leave a rule with a raw declaration unchanged", () => {
    const input = `.a { ; }
.a .b { color: blue; }`

    assert.equal(transform(input).modified, false)
  })

  test("leave keyframes unchanged", () => {
    const input = `@keyframes fade {
  from { opacity: 0 }
  to { opacity: 1 }
}`

    assert.equal(transform(input).modified, false)
  })

  test("leave page and font-face rules unchanged", () => {
    const input = `@page { margin: 1cm; @top-left { content: "x" } }
@font-face { font-family: "x"; src: url("x.woff2"); }`

    assert.equal(transform(input).modified, false)
  })

  testComputedStyles(cssNestingFixtures)
})

describe("cssNesting edge cases", () => {
  test("leave a rule with an empty selector list argument unchanged", () => {
    const input = `.a:is() { color: red; }
.a:is() .b { color: blue; }`

    assert.equal(transform(input).modified, false)
  })

  test("leave a rule with an unknown selector in a selector list unchanged", () => {
    const input = `.a:is(.b, :foo(.c)) { color: red; }
.a:is(.b, :foo(.c)) .d { color: blue; }`

    assert.equal(transform(input).modified, false)
  })

  test("nest parents with an nth-child argument without a selector", () => {
    assertTransform(
      `.a:nth-child(2n), .b:nth-child(2n) { color: red; }
.a:nth-child(2n) .c, .b:nth-child(2n) .c { color: blue; }`,
      `.a:nth-child(2n), .b:nth-child(2n) {
  color: red;
  .c {
    color: blue;
  }
}`,
    )
  })

  test("leave a rule with an unknown nth-child selector unchanged", () => {
    const input = `.a:nth-child(2n of :foo(.b)) { color: red; }
.a:nth-child(2n of :foo(.b)) .c { color: blue; }`

    assert.equal(transform(input).modified, false)
  })

  test("nest parents whose selector list argument contains a pseudo-element", () => {
    assertTransform(
      `.a:is(::before), .b:is(::after) { color: red; }
.a:is(::before) .c, .b:is(::after) .c { color: blue; }`,
      `.a:is(::before), .b:is(::after) {
  color: red;
  .c {
    color: blue;
  }
}`,
    )
  })

  test("pick the larger specificity of an id in a selector list", () => {
    assertTransform(
      `.a:is(.b, #c, .d), .e:is(.f, #g, .h) { color: red; }
.a:is(.b, #c, .d) .i, .e:is(.f, #g, .h) .i { color: blue; }`,
      `.a:is(.b, #c, .d), .e:is(.f, #g, .h) {
  color: red;
  .i {
    color: blue;
  }
}`,
    )
  })

  test("pick the larger specificity of a class in a selector list", () => {
    assertTransform(
      `.a:is(.b.c, .d), .e:is(.f.g, .h) { color: red; }
.a:is(.b.c, .d) .i, .e:is(.f.g, .h) .i { color: blue; }`,
      `.a:is(.b.c, .d), .e:is(.f.g, .h) {
  color: red;
  .i {
    color: blue;
  }
}`,
    )
  })

  test("pick the larger specificity of a later class in a selector list", () => {
    assertTransform(
      `.a:is(.b, .c.d), .e:is(.f, .g.h) { color: red; }
.a:is(.b, .c.d) .i, .e:is(.f, .g.h) .i { color: blue; }`,
      `.a:is(.b, .c.d), .e:is(.f, .g.h) {
  color: red;
  .i {
    color: blue;
  }
}`,
    )
  })

  test("pick the specificity of a type selector in a selector list", () => {
    assertTransform(
      `.a:is(.b.c, .d.e), .f:is(.g.h, .i.j) { color: red; }
.a:is(.b.c, .d.e) .k, .f:is(.g.h, .i.j) .k { color: blue; }`,
      `.a:is(.b.c, .d.e), .f:is(.g.h, .i.j) {
  color: red;
  .k {
    color: blue;
  }
}`,
    )
  })

  test("pick the larger specificity of a pseudo-element in a selector list", () => {
    assertTransform(
      `.a:is(.b.c, .d.e::before), .f:is(.g.h, .i.j::after) { color: red; }
.a:is(.b.c, .d.e::before) .k, .f:is(.g.h, .i.j::after) .k { color: blue; }`,
      `.a:is(.b.c, .d.e::before), .f:is(.g.h, .i.j::after) {
  color: red;
  .k {
    color: blue;
  }
}`,
    )
  })

  test("leave rules separated by stray text unchanged", () => {
    const input = `.a { color: red; } ; .a .b { color: blue; }`

    assert.equal(transform(input).modified, false)
  })

  test("leave duplicate parent selectors unchanged", () => {
    const input = `.a, .a { color: red; }
.a .b { color: blue; }`

    assert.equal(transform(input).modified, false)
  })

  test("leave duplicate child selectors unchanged", () => {
    const input = `.a { color: red; }
.a .b, .a .b { color: blue; }`

    assert.equal(transform(input).modified, false)
  })

  test("leave a repeated parent selector unchanged", () => {
    const input = `.a { color: red; }
.a { color: blue; }`

    assert.equal(transform(input).modified, false)
  })

  test("leave a selector that only shares a prefix unchanged", () => {
    const input = `.a { color: red; }
.ab { color: blue; }`

    assert.equal(transform(input).modified, false)
  })

  test("leave a child with a comment in its prelude unchanged", () => {
    const input = `.a { color: red; }
.a .b /* keep */ { color: blue; }`

    assert.equal(transform(input).modified, false)
  })

  test("leave a rule with nested rules following a plain rule unchanged", () => {
    const input = `.a { color: red; }
.x { .y { color: blue; } }`

    assert.equal(transform(input).modified, false)
  })

  test("preserve at-rules without a block", () => {
    assertTransform(
      `@import "x";
.a {
  color: red;
}
.a .b {
  color: blue;
}`,
      `@import "x";
.a {
  color: red;
  .b {
    color: blue;
  }
}`,
    )
  })
})

describe("cssNesting line indentation", () => {
  test("nest a rule that shares its line with another rule", () => {
    assertTransform(
      ".x { color: red; } .a { color: blue; } .a .b { color: green; }",
      `.x { color: red; } .a {
  color: blue;
  .b {
    color: green;
  }
}`,
    )
  })

  test("nest parents with an empty nth-child argument", () => {
    assertTransform(
      `.a:nth-child(), .b:nth-child() { color: red; }
.a:nth-child() .c, .b:nth-child() .c { color: blue; }`,
      `.a:nth-child(), .b:nth-child() {
  color: red;
  .c {
    color: blue;
  }
}`,
    )
  })
})

describe("cssNesting unterminated at-rules", () => {
  test("nest rules in an unterminated at-rule block", () => {
    const result = transform(
      `@media all {
.a { color: red }
.a .b { color: blue }`,
    )

    assert.equal(result.modified, true)
    assert.equal(
      result.code,
      `@media all {
.a {
  color: red;
  .b {
    color: blue;
  }
}`,
    )
  })
})

describe("cssNesting block braces", () => {
  test("preserve an empty at-rule block", () => {
    assertTransform(
      "@media all { } .a { } .a .b { color: red }",
      `@media all { } .a {
  .b {
    color: red;
  }
}`,
    )
  })

  test("preserve the trailing whitespace of an unterminated at-rule", () => {
    assertTransform(
      `@media all {
.a { color: red }
.a .b { color: blue }
`,
      `@media all {
.a {
  color: red;
  .b {
    color: blue;
  }
}
`,
    )
  })
})

describe("cssNesting host selectors", () => {
  test("nest under :host without arguments", () => {
    assertTransform(
      `:host {
  color: red;
}
:host .a {
  color: blue;
}`,
      `:host {
  color: red;
  .a {
    color: blue;
  }
}`,
    )
  })

  test("nest under :host-context without arguments", () => {
    assertTransform(
      `:host-context {
  color: red;
}
:host-context .a {
  color: blue;
}`,
      `:host-context {
  color: red;
  .a {
    color: blue;
  }
}`,
    )
  })

  test("nest under :host with arguments", () => {
    assertTransform(
      `:host(.a), :host(.b) { color: red; }
:host(.a) .c, :host(.b) .c { color: blue; }`,
      `:host(.a), :host(.b) {
  color: red;
  .c {
    color: blue;
  }
}`,
    )
  })

  test("leave :host with a different specificity unchanged", () => {
    const input = `:host(.a), .b { color: red; }
:host(.a) .c, .b .c { color: blue; }`

    assert.equal(transform(input).modified, false)
  })

  test("leave :host-context with a different specificity unchanged", () => {
    const input = `:host-context(.a), .b { color: red; }
:host-context(.a) .c, .b .c { color: blue; }`

    assert.equal(transform(input).modified, false)
  })

  test("leave :host with an unknown selector argument unchanged", () => {
    const input = `:host(:foo(.a)) { color: red; }
:host(:foo(.a)) .c { color: blue; }`

    assert.equal(transform(input).modified, false)
  })
})

describe("cssNesting escaped selectors", () => {
  test("leave a hex escape that consumes whitespace unchanged", () => {
    const input = String.raw`.\31 { color: red; }
.\31 23 { color: blue; }`

    assert.equal(transform(input).modified, false)
  })

  test("leave a class name that continues a hex escape unchanged", () => {
    const input = String.raw`.m-1\31 { color: red; }
.m-1\31 0 { color: blue; }`

    assert.equal(transform(input).modified, false)
  })

  test("nest a compound selector with an escaped space", () => {
    assertTransform(
      String.raw`.a\  { color: red; }
.a\ .b { color: blue; }`,
      String.raw`.a\  {
  color: red;
  &.b {
    color: blue;
  }
}`,
    )
  })

  test("nest a parent list with escaped spaces", () => {
    assertTransform(
      String.raw`.a\ , .b { color: red; }
.a\  .c, .b .c { color: blue; }`,
      String.raw`.a\ , .b {
  color: red;
  .c {
    color: blue;
  }
}`,
    )
  })

  test("nest a parent with a non-breaking space in its selector", () => {
    assertTransform(
      ".a\u00A0 { color: red; }\n.a\u00A0 .b { color: blue; }",
      ".a\u00A0 {\n  color: red;\n  .b {\n    color: blue;\n  }\n}",
    )
  })

  test("leave a child joined by a non-breaking space unchanged", () => {
    const input = ".a { color: red; }\n.a\u00A0.b { color: blue; }"

    assert.equal(transform(input).modified, false)
  })
})

describe("cssNesting escaped declarations", () => {
  test("preserve a declaration with a trailing escaped space", () => {
    assertTransform(
      String.raw`.a { --x: \ }
.a .b { color: blue; }`,
      String.raw`.a {
  --x: \ ;
  .b {
    color: blue;
  }
}`,
    )
  })

  test("preserve declarations after a trailing escaped space", () => {
    assertTransform(
      String.raw`.a { --x: \ ; color: red; }
.a .b { color: blue; }`,
      String.raw`.a {
  --x: \ ;
  color: red;
  .b {
    color: blue;
  }
}`,
    )
  })

  test("trim whitespace after an escaped backslash", () => {
    assertTransform(
      String.raw`.a { --x: \\ }
.a .b { color: blue; }`,
      String.raw`.a {
  --x: \\;
  .b {
    color: blue;
  }
}`,
    )
  })
})

describe("cssNesting selector boundaries", () => {
  test("leave a child with a trailing combinator unchanged", () => {
    const input = `.a { color: red; }
.a > { color: blue; }`

    assert.equal(transform(input).modified, false)
  })

  test("leave a shorter child selector unchanged", () => {
    const input = `.a .b { color: red; }
.a { color: blue; }`

    assert.equal(transform(input).modified, false)
  })
})

describe("cssNesting line endings", () => {
  test("preserve CRLF line endings", () => {
    assertTransform(
      ".a {\r\n  color: red;\r\n}\r\n.a .b {\r\n  color: blue;\r\n}\r\n",
      ".a {\r\n  color: red;\r\n  .b {\r\n    color: blue;\r\n  }\r\n}\r\n",
    )
  })

  test("preserve tab indentation", () => {
    assertTransform(
      ".a {\n\tcolor: red;\n}\n.a .b {\n\tcolor: blue;\n}",
      ".a {\n\tcolor: red;\n\t.b {\n\t\tcolor: blue;\n\t}\n}",
    )
  })
})
