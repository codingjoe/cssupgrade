/**
 * Source text conditions that decide whether a transformer can match.
 *
 * Every transformer parses the whole source, which dominates the runtime of
 * this package. A transformer can only match when its pattern occurs in the
 * source text, so testing the text first skips the parse for transformations
 * that cannot apply.
 */

/**
 * Conditions a transformer needs in the source text. A transformer runs when all
 * of its conditions match. Each condition must be necessary: when the source
 * text fails a condition, the transformer cannot change the tree.
 *
 * @type {Map<string, RegExp[]>}
 */
export const prefilters = new Map([
  // Nesting needs two rules, so the source holds at least two blocks.
  ["cssNesting", [/\{[\s\S]*\{/]],
  // Selector lists need a comma before a block.
  ["isGrouping", [/,[\s\S]*\{/]],
])

/**
 * @param {string} name - Transformer name
 * @param {string} code - Source text of the current transformation pass
 * @returns {boolean} True when the transformer needs to run
 */
export function matchesPrefilter(name, code) {
  return prefilters.get(name).every((condition) => condition.test(code))
}
