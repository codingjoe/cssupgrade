import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { parseCss } from "../src/parser.js"

describe("parseCss", () => {
  test("record comments", () => {
    const { comments } = parseCss(".a { /* one */ color: red; /* two */ }")

    assert.deepEqual(
      comments.map(({ start, end }) =>
        ".a { /* one */ color: red; /* two */ }".slice(start, end),
      ),
      ["/* one */", "/* two */"],
    )
  })

  test("parse flat rules", () => {
    const { ast } = parseCss(".a { color: red } .a .b { color: blue }")

    assert.deepEqual(
      Array.from(ast.children, (child) => child.type),
      ["Rule", "Rule"],
    )
  })

  test("parse nested rules as raw declarations", () => {
    const { ast } = parseCss(".a { .b { color: red } }")

    assert.equal(ast.children.first.block.children.first.type, "Raw")
  })

  test("parse a custom property with a block value as a declaration", () => {
    const { ast } = parseCss(".a { --theme: { color: red; }; }")

    assert.equal(ast.children.first.block.children.first.type, "Declaration")
  })

  test("parse a stray semicolon as raw", () => {
    const { ast } = parseCss(".a { ; }")

    assert.equal(ast.children.first.block.children.first.type, "Raw")
  })
})
