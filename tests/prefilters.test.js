import assert from "node:assert/strict"
import { describe, test } from "node:test"
import * as newlyAvailable from "../src/newlyAvailable.js"
import { matchesPrefilter, prefilters } from "../src/prefilters.js"
import * as widelyAvailable from "../src/widelyAvailable.js"

describe("prefilters", () => {
  test("accept CSS that can contain nesting", () => {
    assert.equal(matchesPrefilter("cssNesting", ".a { .b { color: red } }"), true)
  })

  test("reject CSS with a single block", () => {
    assert.equal(matchesPrefilter("cssNesting", ".a { color: red }"), false)
  })

  test("declare a pre-filter for every transformer", () => {
    const names = [...Object.keys(widelyAvailable), ...Object.keys(newlyAvailable)]

    assert.deepEqual(
      names.filter((name) => !prefilters.has(name)),
      [],
    )
  })
})
