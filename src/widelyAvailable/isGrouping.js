import { isEqualSelectorNode, parseCss, styleRuleAtRules } from "../parser.js"
import { calculateNodesSpecificity, isEqualSpecificity } from "../specificity.js"

/** @typedef {import("../index.js").TransformResult} TransformResult */

/** @typedef {import("../parser.js").SourceRange} SourceRange */

/**
 * @typedef {Object} PreludeEdit
 * @property {number} start - Offset of the first selector character.
 * @property {number} end - Offset after the last selector character.
 * @property {string} text - Grouped selector list.
 */

/**
 * Count the leading nodes that every selector shares.
 *
 * @param {Array<import("css-tree").CssNode[]>} selectors - Nodes per selector.
 * @returns {number} Number of shared leading nodes.
 */
function countSharedNodes(selectors) {
  const [first, ...others] = selectors
  const mismatchIndex = first.findIndex((node, index) =>
    others.some(
      (nodes) => index >= nodes.length || !isEqualSelectorNode(node, nodes[index]),
    ),
  )

  switch (mismatchIndex) {
    case -1:
      return first.length
    default:
      return mismatchIndex
  }
}

/**
 * Check whether a node contains a pseudo-element at any depth.
 *
 * @param {import("css-tree").CssNode} node - Selector node.
 * @returns {boolean} True when the node contains a pseudo-element.
 */
function containsPseudoElement(node) {
  switch (node.type) {
    case "PseudoElementSelector":
      return true
    default:
      return node.children == null
        ? false
        : [...node.children].some(containsPseudoElement)
  }
}

/**
 * Check whether a selector part starts with a combinator.
 *
 * @param {import("css-tree").CssNode[]} nodes - Selector nodes.
 * @returns {boolean} True when the first node is a combinator.
 */
function startsWithCombinator(nodes) {
  return nodes[0].type === "Combinator"
}

/**
 * Check whether a selector part contains a pseudo-element.
 *
 * @param {import("css-tree").CssNode[]} nodes - Selector nodes.
 * @returns {boolean} True when a node contains a pseudo-element.
 */
function hasPseudoElement(nodes) {
  return nodes.some(containsPseudoElement)
}

/**
 * Render the shared selector prefix.
 *
 * @param {string} code - CSS source text.
 * @param {import("css-tree").CssNode} selector - First selector of the list.
 * @param {import("css-tree").CssNode} suffixStart - First node after the prefix.
 * @returns {string} Prefix text.
 */
function renderPrefix(code, selector, suffixStart) {
  return code
    .slice(selector.loc.start.offset, suffixStart.loc.start.offset)
    .replace(/\s+$/, " ")
}

/**
 * Render a selector list wrapped in `:is()`.
 *
 * @param {string} code - CSS source text.
 * @param {import("css-tree").CssNode} prelude - Parsed selector list.
 * @returns {string | null} Grouped selector list, or null when it cannot be grouped.
 */
function renderGroupedPrelude(code, prelude) {
  const selectors = [...prelude.children]

  switch (true) {
    case selectors.length < 2:
      return null
    default:
      break
  }

  const selectorNodes = selectors.map((selector) => [...selector.children])
  const sharedNodeCount = countSharedNodes(selectorNodes)

  switch (true) {
    case sharedNodeCount === 0:
      return null
    case selectorNodes.some((nodes) => nodes.length === sharedNodeCount):
      return null
    default:
      break
  }

  const suffixes = selectorNodes.map((nodes) => nodes.slice(sharedNodeCount))

  switch (true) {
    case suffixes.some((nodes) => nodes[0].loc === null):
      return null
    case suffixes.some(startsWithCombinator):
      return null
    case suffixes.some(hasPseudoElement):
      return null
    default:
      break
  }

  const suffixSpecificities = suffixes.map(calculateNodesSpecificity)

  switch (true) {
    case suffixSpecificities.some((specificity) => specificity === null):
      return null
    case !suffixSpecificities.every((specificity) =>
      isEqualSpecificity(specificity, suffixSpecificities[0]),
    ):
      return null
    default:
      break
  }

  const prefix = renderPrefix(code, selectors[0], suffixes[0][0])
  const suffixTexts = suffixes.map((nodes, index) =>
    code.slice(nodes[0].loc.start.offset, selectors[index].loc.end.offset),
  )
  const grouped = `${prefix}:is(${suffixTexts.join(", ")})`
  const original = code.slice(prelude.loc.start.offset, prelude.loc.end.offset)

  switch (true) {
    case grouped.length > original.length:
      return null
    default:
      return grouped
  }
}

/**
 * Grouping of selector lists that share a leading selector sequence.
 */
class SelectorListGrouper {
  #ast
  #code
  #comments

  /**
   * @param {string} code - CSS source text.
   * @param {import("css-tree").CssNode} ast - Parsed CSS syntax tree.
   * @param {SourceRange[]} comments - Comment ranges.
   */
  constructor(code, ast, comments) {
    this.#code = code
    this.#ast = ast
    this.#comments = comments
  }

  /**
   * Group every groupable selector list.
   *
   * @returns {string} Transformed CSS source.
   */
  group() {
    return this.#collectEdits(this.#ast)
      .toSorted((left, right) => right.start - left.start)
      .reduce(
        (code, edit) => code.slice(0, edit.start) + edit.text + code.slice(edit.end),
        this.#code,
      )
  }

  /**
   * Collect selector list replacements below a node.
   *
   * @param {import("css-tree").CssNode} node - Syntax tree node.
   * @returns {PreludeEdit[]} Replacements in source order.
   */
  #collectEdits(node) {
    switch (node.type) {
      case "StyleSheet":
        return [...node.children].flatMap((child) => this.#collectEdits(child))
      case "Atrule":
        return this.#collectAtRuleEdits(node)
      case "Rule":
        return this.#collectRuleEdits(node)
      default:
        return []
    }
  }

  /**
   * Collect replacements inside a block that holds style rules.
   *
   * @param {import("css-tree").CssNode} atrule - At-rule node.
   * @returns {PreludeEdit[]} Replacements in source order.
   */
  #collectAtRuleEdits(atrule) {
    switch (true) {
      case !styleRuleAtRules.has(atrule.name.toLowerCase()):
        return []
      case atrule.block === null:
        return []
      default:
        return [...atrule.block.children].flatMap((child) => this.#collectEdits(child))
    }
  }

  /**
   * Collect the replacement of one style rule.
   *
   * @param {import("css-tree").CssNode} rule - Style rule.
   * @returns {PreludeEdit[]} Replacement, or none.
   */
  #collectRuleEdits(rule) {
    const edit = this.#createEdit(rule)

    switch (edit) {
      case null:
        return []
      default:
        return [edit]
    }
  }

  /**
   * Create the replacement of a rule prelude.
   *
   * @param {import("css-tree").CssNode} rule - Style rule.
   * @returns {PreludeEdit | null} Replacement, or null when the rule stays unchanged.
   */
  #createEdit(rule) {
    switch (rule.prelude.type) {
      case "SelectorList":
        return this.#createPreludeEdit(rule.prelude)
      default:
        return null
    }
  }

  /**
   * Create the replacement of a selector list.
   *
   * @param {import("css-tree").CssNode} prelude - Parsed selector list.
   * @returns {PreludeEdit | null} Replacement, or null when the list stays unchanged.
   */
  #createPreludeEdit(prelude) {
    switch (this.#hasComment(prelude)) {
      case true:
        return null
      default: {
        const text = renderGroupedPrelude(this.#code, prelude)

        switch (text) {
          case null:
            return null
          default:
            return {
              start: prelude.loc.start.offset,
              end: prelude.loc.end.offset,
              text,
            }
        }
      }
    }
  }

  /**
   * Check whether a comment lies inside a selector list.
   *
   * The rendered selector list would drop the comment, so the rule stays unchanged.
   *
   * @param {import("css-tree").CssNode} prelude - Parsed selector list.
   * @returns {boolean} True when a comment lies inside the selector list.
   */
  #hasComment(prelude) {
    return this.#comments.some(
      (comment) =>
        comment.start >= prelude.loc.start.offset &&
        comment.end <= prelude.loc.end.offset,
    )
  }
}

/**
 * Group selector lists that share a leading selector sequence with `:is()`.
 *
 * @param {string} code - CSS source text.
 * @returns {TransformResult} CSS with grouped selector lists.
 */
export function isGrouping(code) {
  const { ast, comments } = parseCss(code)
  const nextCode = new SelectorListGrouper(code, ast, comments).group()

  return { code: nextCode, modified: nextCode !== code }
}

isGrouping.baselineDate = new Date(Date.UTC(2021, 0, 21))
