import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { matchesPrefilter, prefilters } from "../src/prefilters.js"
import * as widelyAvailable from "../src/widelyAvailable.js"

describe("prefilters", () => {
  test("accept CSS that can contain nesting", () => {
    assert.equal(matchesPrefilter("cssNesting", ".a { .b { color: red } }"), true)
  })

  test("reject CSS with a single block", () => {
    assert.equal(matchesPrefilter("cssNesting", ".a { color: red }"), false)
  })

  test("accept CSS with a selector list", () => {
    assert.equal(
      matchesPrefilter("isGrouping", ".card .title, .card .body { color: red }"),
      true,
    )
  })

  test("reject CSS without a comma", () => {
    assert.equal(matchesPrefilter("isGrouping", ".card .title { color: red }"), false)
  })

  test("reject CSS with commas only after a block", () => {
    assert.equal(matchesPrefilter("isGrouping", ".card { color: rgb(0, 0, 0) }"), false)
  })

  test("declare a pre-filter for every transformer", () => {
    const names = Object.keys(widelyAvailable)

    assert.deepEqual(
      names.filter((name) => !prefilters.has(name)),
      [],
    )
  })
})
