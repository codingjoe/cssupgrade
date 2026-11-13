#!/usr/bin/env node

import { diffLines } from "diff"
import fs from "fs/promises"
import process from "node:process"
import { parseArgs } from "node:util"
import pkg from "../package.json" with { type: "json" }
import { transform } from "../src/index.js"
import { WorkerPool } from "../src/pool.js"

/**
 * CLI tool for cssupgrade.
 */

/**
 * Process a file using a worker thread.
 * @param {string} filePath - Path to the file to process.
 * @param {Object} options - Processing options.
 * @param {boolean} options.check - Whether to only check for changes.
 * @param {boolean} options.write - Whether to write changes to file.
 * @param {boolean} options.verbose - The verbosity level for logging.
 * @param {import("../src/pool.js").TransformWorker} worker - Worker that transforms the file.
 * @returns {Promise<{modified: boolean, error: boolean}>} Result of processing.
 */
async function processFile(filePath, options, worker) {
  // Validate that the provided path exists and is a file.
  try {
    const stats = await fs.stat(filePath)
    if (!stats.isFile()) {
      console.error(`Error: '${filePath}' is not a file`)
      process.exit(1)
    }
  } catch (error) {
    console.error(`Error: Cannot access '${filePath}': ${error.message}`)
    process.exit(1)
  }

  try {
    // The worker only ships the original source when a diff can be printed.
    const showsDiff = options.check || !options.write
    const workerResult = await worker.transform({
      filePath,
      includeOriginal: showsDiff,
    })

    if (!workerResult.success) {
      if (options.verbose) console.error(workerResult.error)
      console.error(
        `\x1b[31m✗\x1b[0m Error: ${filePath}: ${workerResult.error.message}`,
      )
      return { modified: false, error: true }
    }

    const result = workerResult.result

    if (result.modified) {
      if (showsDiff) {
        displayDiff(filePath, result.original, result.code)
      }

      if (options.write) {
        await fs.writeFile(filePath, result.code, "utf8")
        if (!options.check) {
          console.info(`\x1b[32m✓\x1b[0m ${filePath}`)
        }
      }

      return { modified: true, error: false }
    }

    // Show unmodified files unless in check-only mode
    if (!options.check) {
      console.debug(`  ${filePath}`)
    }
    return { modified: false, error: false }
  } catch (error) {
    console.error(`\x1b[31m✗\x1b[0m Error: ${filePath}: ${error.message}`)
    return { modified: false, error: true }
  }
}

/**
 * Display a diff between original and modified code.
 * @param {string} filePath - Path to the file being displayed.
 * @param {string} original - Original code.
 * @param {string} modified - Modified code.
 */
function displayDiff(filePath, original, modified) {
  const changes = diffLines(original, modified).filter(
    ({ added, removed }) => added || removed,
  )

  console.group(`\x1b[31m✗\x1b[0m ${filePath}`)
  for (const { added, value } of changes) {
    const prefix = added ? `  \x1b[32m+ ` : `  \x1b[31m- `
    for (const line of value.split("\n")) {
      if (line.trim() !== "") {
        console.info(`${prefix}${line}\x1b[0m`)
      }
    }
  }
  console.groupEnd()
}

/**
 * Process stdin using the configured transformation options.
 * @param {Object} options - Processing options.
 * @param {boolean} options.check - Whether to only check for changes.
 * @param {boolean} options.write - Whether to write changes to file.
 * @param {boolean} options.verbose - The verbosity level for logging.
 * @returns {Promise<void>} Complete when stdin processing finishes.
 */
async function processStdin(options) {
  if (options.write) {
    console.error("Error: '--write' cannot be used with stdin")
    process.exit(1)
  }

  try {
    const code = await readStdin()
    const result = transform(code)

    if (options.check) {
      if (result.modified) {
        process.exit(1)
      }
      return
    }

    process.stdout.write(result.code)
  } catch (error) {
    if (options.verbose) console.error(error)
    console.error(`\x1b[31m✗\x1b[0m Error: stdin: ${error.message}`)
    process.exit(128)
  }
}

/**
 * Read source code from stdin.
 * @returns {Promise<string>} Source code from stdin.
 */
async function readStdin() {
  process.stdin.setEncoding("utf8")

  return (await Array.fromAsync(process.stdin)).join("")
}

/**
 * Describe a number of files.
 * @param {number} count - Number of files.
 * @returns {string} Count followed by a singular or plural noun.
 */
function formatFileCount(count) {
  return `${count} file${count === 1 ? "" : "s"}`
}

/**
 * Orchestrates the CLI application.
 */
class CLIRunner {
  constructor(workerPath) {
    this.workerPool = new WorkerPool(processFile, workerPath)
  }

  /**
   * Process files and report results.
   * @param {string[]} patterns - File paths to process (no globbing).
   * @param {Object} options - Processing options.
   */
  async run(patterns, options) {
    switch (this.#getInputMode(patterns)) {
      case "stdin":
        await processStdin(options)
        return
      case "mixed":
        console.error("Error: '-' cannot be combined with file paths")
        return process.exit(1)
      default:
        break
    }

    console.time("Processing")
    // Hand CLI-provided names directly to the worker pool; file validation occurs in processFile.
    const results = await this.workerPool.processFiles(patterns, options)
    console.timeEnd("Processing")

    this.#reportSummary(results, options)
  }

  /**
   * Classify the input mode selected by CLI arguments.
   * @param {string[]} patterns - File paths to process.
   * @returns {"files" | "stdin" | "mixed"} Selected input mode.
   */
  #getInputMode(patterns) {
    switch (patterns.includes("-")) {
      case false:
        return "files"
      default:
        return patterns.length === 1 ? "stdin" : "mixed"
    }
  }

  /**
   * Report the outcome of a file-processing run.
   *
   * @param {Array<{modified: boolean, error: boolean}>} results - Result per file.
   * @param {Object} options - Processing options.
   */
  #reportSummary(results, options) {
    const modifiedCount = results.filter(({ modified }) => modified).length
    const errorCount = results.filter(({ error }) => error).length

    console.info("")

    switch (modifiedCount) {
      case 0:
        if (errorCount === 0) {
          console.info("All files are up to date")
        }
        break
      default:
        this.#reportUpgrades(modifiedCount, options)
        break
    }

    if (errorCount > 0) {
      console.info(`${formatFileCount(errorCount)} failed to process`)
      // Errors take precedence over the --check flag.
      process.exit(128)
    }

    if (options.check && modifiedCount > 0) {
      process.exit(1)
    }
  }

  /**
   * Report how many files were upgraded.
   *
   * @param {number} modifiedCount - Number of files with changes.
   * @param {Object} options - Processing options.
   */
  #reportUpgrades(modifiedCount, options) {
    switch (true) {
      case options.check:
        console.info(
          `${formatFileCount(modifiedCount)} need${modifiedCount === 1 ? "s" : ""} upgrading`,
        )
        if (options.write) {
          console.info("Changes have been written")
        }
        break
      case options.write:
        console.info(`✓ ${formatFileCount(modifiedCount)} upgraded`)
        break
      default:
        console.info(`${formatFileCount(modifiedCount)} would be upgraded`)
        break
    }
  }
}

const helpText = `Usage: cssupgrade [options] <files...>

Auto-upgrade your CSS syntax

Arguments:
  files           Files or directories to process, or '-' to read from stdin

Options:
  --check         Report which files need upgrading and exit with code 1 if any do
  --write         Write changes to files
  --verbose, -v   Show more detailed output
  --version, -V   Output the version number
  --help, -h      Display help`

/**
 * Parse command-line arguments.
 *
 * @param {string[]} arguments_ - Arguments after the executable.
 * @returns {{values: Object, positionals: string[]}} Parsed options and files.
 */
function parseCliArguments(arguments_) {
  return parseArgs({
    args: arguments_,
    allowPositionals: true,
    options: {
      check: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
      verbose: { type: "boolean", short: "v", default: false },
      version: { type: "boolean", short: "V", default: false },
      write: { type: "boolean", default: false },
    },
  })
}

/**
 * Run the command-line interface.
 *
 * @param {string[]} arguments_ - Arguments after the executable.
 * @returns {Promise<void>} Resolves when the run finishes.
 */
async function main(arguments_) {
  try {
    const { values: options, positionals: files } = parseCliArguments(arguments_)

    switch (true) {
      case options.help:
        console.info(helpText)
        break
      case options.version:
        console.info(pkg.version)
        break
      case files.length === 0:
        console.error("error: missing required argument 'files'")
        process.exitCode = 1
        break
      default:
        await cliRunner.run(files, options)
        break
    }
  } catch (error) {
    console.error(`error: ${error.message}`)
    process.exitCode = 1
  }
}

const cliRunner = new CLIRunner(new URL("../src/worker.js", import.meta.url))

await main(process.argv.slice(2))
