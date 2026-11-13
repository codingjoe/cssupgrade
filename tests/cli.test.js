import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs/promises"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import path from "node:path"
import { after, before, describe, test } from "node:test"

const cliPath = fileURLToPath(new URL("../bin/cssupgrade.js", import.meta.url))
const deepAtRuleCss = `${"@media all {".repeat(10_000)}.a { } .a .b { color: red }${"}".repeat(10_000)}`
let directory

/**
 * Run the CLI in a child process.
 *
 * @param {string[]} arguments_ - CLI arguments.
 * @param {string} [input] - Standard input.
 * @returns {import("node:child_process").SpawnSyncReturns<string>} Process result.
 */
function runCli(arguments_, input) {
  return spawnSync(process.execPath, [cliPath, ...arguments_], {
    input,
    encoding: "utf8",
  })
}

/**
 * Write a file in the temporary directory.
 *
 * @param {string} name - File name.
 * @param {string} content - File content.
 * @returns {Promise<string>} Absolute file path.
 */
async function writeFile(name, content) {
  const filePath = path.join(directory, name)

  await fs.writeFile(filePath, content, "utf8")
  return filePath
}

describe("cssupgrade CLI", () => {
  before(async () => {
    directory = await fs.mkdtemp(path.join(tmpdir(), "cssupgrade-"))
  })

  after(async () => {
    await fs.rm(directory, { recursive: true, force: true })
  })

  test("report files that are up to date", async () => {
    const result = runCli([await writeFile("current.css", ".a { color: red }")])

    assert.equal(result.status, 0)
    assert.match(result.stdout, /All files are up to date/)
  })

  test("print a diff without writing by default", async () => {
    const filePath = await writeFile(
      "nested.css",
      ".a { color: red } .a .b { color: blue }",
    )
    const result = runCli([filePath])

    assert.equal(result.status, 0)
    assert.match(result.stdout, /1 file would be upgraded/)
    assert.equal(
      await fs.readFile(filePath, "utf8"),
      ".a { color: red } .a .b { color: blue }",
    )
  })

  test("fail in check mode when a file needs upgrading", async () => {
    const result = runCli([
      "--check",
      await writeFile("check.css", ".a { color: red } .a .b { color: blue }"),
    ])

    assert.equal(result.status, 1)
    assert.match(result.stdout, /1 file needs upgrading/)
  })

  test("write changes", async () => {
    const filePath = await writeFile(
      "write.css",
      ".a { color: red } .a .b { color: blue }",
    )
    const result = runCli(["--write", filePath])

    assert.equal(result.status, 0)
    assert.match(result.stdout, /1 file upgraded/)
    assert.equal(
      await fs.readFile(filePath, "utf8"),
      ".a {\n  color: red;\n  .b {\n    color: blue;\n  }\n}",
    )
  })

  test("write changes in check mode and still fail", async () => {
    const result = runCli([
      "--check",
      "--write",
      await writeFile("check-write.css", ".a { color: red } .a .b { color: blue }"),
    ])

    assert.equal(result.status, 1)
    assert.match(result.stdout, /Changes have been written/)
  })

  test("transform stdin", () => {
    const result = runCli(["-"], ".a { color: red } .a .b { color: blue }")

    assert.equal(result.status, 0)
    assert.equal(result.stdout, ".a {\n  color: red;\n  .b {\n    color: blue;\n  }\n}")
  })

  test("fail in check mode for stdin changes", () => {
    const result = runCli(["--check", "-"], ".a { color: red } .a .b { color: blue }")

    assert.equal(result.status, 1)
    assert.equal(result.stdout, "")
  })

  test("reject --write with stdin", () => {
    const result = runCli(["--write", "-"], ".a { color: red }")

    assert.equal(result.status, 1)
    assert.match(result.stderr, /cannot be used with stdin/)
  })

  test("reject stdin combined with file paths", () => {
    const result = runCli(["-", "file.css"], "")

    assert.equal(result.status, 1)
    assert.match(result.stderr, /cannot be combined with file paths/)
  })

  test("report a missing file", () => {
    const result = runCli([path.join(directory, "missing.css")])

    assert.equal(result.status, 1)
    assert.match(result.stderr, /Cannot access/)
  })

  test("reject a directory", () => {
    const result = runCli([directory])

    assert.equal(result.status, 1)
    assert.match(result.stderr, /is not a file/)
  })

  test("report a transformation error", async () => {
    const result = runCli([await writeFile("invalid.css", deepAtRuleCss)])

    assert.equal(result.status, 128)
    assert.match(result.stderr, /Error:/)
    assert.match(result.stdout, /1 file failed to process/)
  })

  test("print an error stack in verbose mode", async () => {
    const result = runCli(["--verbose", await writeFile("verbose.css", deepAtRuleCss)])

    assert.equal(result.status, 128)
    assert.match(result.stderr, /RangeError/)
  })

  test("count multiple files that need upgrading in check mode", async () => {
    const result = runCli([
      "--check",
      await writeFile("check-one.css", ".a { color: red } .a .b { color: blue }"),
      await writeFile("check-two.css", ".c { color: red } .c .d { color: blue }"),
    ])

    assert.equal(result.status, 1)
    assert.match(result.stdout, /2 files need upgrading/)
  })

  test("count multiple modified files", async () => {
    const result = runCli([
      await writeFile("one.css", ".a { color: red } .a .b { color: blue }"),
      await writeFile("two.css", ".c { color: red } .c .d { color: blue }"),
    ])

    assert.equal(result.status, 0)
    assert.match(result.stdout, /2 files would be upgraded/)
  })
})

describe("cssupgrade CLI stdin errors", () => {
  test("report a transformation error from stdin", () => {
    const result = runCli(["-"], deepAtRuleCss)

    assert.equal(result.status, 128)
    assert.match(result.stderr, /Error: stdin:/)
  })

  test("print an error stack from stdin in verbose mode", () => {
    const result = runCli(["--verbose", "-"], deepAtRuleCss)

    assert.equal(result.status, 128)
    assert.match(result.stderr, /RangeError/)
  })

  test("reject more than one stdin argument", () => {
    const result = runCli(["-", "-"], "")

    assert.equal(result.status, 1)
    assert.match(result.stderr, /cannot be combined with file paths/)
  })
})

describe("cssupgrade CLI write errors", () => {
  test("report a file that cannot be written", async () => {
    const writeDirectory = await fs.mkdtemp(path.join(tmpdir(), "cssupgrade-write-"))
    const filePath = path.join(writeDirectory, "read-only.css")

    await fs.writeFile(filePath, ".a { color: red } .a .b { color: blue }", "utf8")
    await fs.chmod(filePath, 0o444)

    try {
      const result = runCli(["--write", filePath])

      assert.equal(result.status, 128)
      assert.match(result.stderr, /Error:/)
      assert.match(result.stdout, /1 file failed to process/)
    } finally {
      await fs.chmod(filePath, 0o644)
      await fs.rm(writeDirectory, { recursive: true, force: true })
    }
  })
})
