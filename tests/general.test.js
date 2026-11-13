import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { transform } from "../src/index.js"

describe("transform", () => {
  test("leave flat CSS without repeated selectors unchanged", () => {
    const result = transform(".a {\n  color: red;\n}\n\n.b {\n  color: blue;\n}\n")

    assert.equal(result.modified, false)
    assert.equal(result.code, ".a {\n  color: red;\n}\n\n.b {\n  color: blue;\n}\n")
  })

  test("nest rules with the newly available baseline", () => {
    const result = transform(
      ".a { color: red } .a .b { color: blue }",
      "newly-available",
    )

    assert.equal(result.modified, true)
    assert.equal(result.code, ".a {\n  color: red;\n  .b {\n    color: blue;\n  }\n}")
  })

  test("produce a stable result on a second pass", () => {
    const first = transform(".a { color: red } .a .b { color: blue }")
    const second = transform(first.code)

    assert.equal(second.modified, false)
    assert.equal(second.code, first.code)
  })

  test("leave existing nesting unchanged", () => {
    const result = transform(".a { color: red; .b { color: blue } }")

    assert.equal(result.modified, false)
  })

  test("leave keyframes unchanged", () => {
    const result = transform("@keyframes fade { from { opacity: 0 } }")

    assert.equal(result.modified, false)
  })
})
