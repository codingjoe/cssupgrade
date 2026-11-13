import { parseCss } from "../parser.js"

/**
 * @typedef {Object} TransformResult
 * @property {string} code - Transformed CSS source.
 * @property {boolean} modified - Whether the transformer changed the source.
 */

/**
 * @typedef {Object} SourceRange
 * @property {number} start - Offset of the first character.
 * @property {number} end - Offset after the last character.
 */

/**
 * @typedef {[number, number, number]} Specificity
 */

/**
 * At-rules whose blocks contain style rules that can be nested.
 */
const nestedBlockAtRules = new Set([
  "-moz-document",
  "container",
  "document",
  "layer",
  "media",
  "scope",
  "starting-style",
  "supports",
])

/**
 * Pseudo-classes whose argument is a selector list and whose specificity is the
 * specificity of the most specific selector in that list.
 */
const selectorListPseudoClasses = new Set([
  "-moz-any",
  "-ms-any",
  "-webkit-any",
  "any",
  "has",
  "host",
  "host-context",
  "is",
  "matches",
  "not",
])

/**
 * Pseudo-classes that select the nth element and accept an optional selector list.
 */
const nthPseudoClasses = new Set(["nth-child", "nth-last-child"])

/**
 * Functional pseudo-classes whose argument is not a selector list.
 */
const plainFunctionalPseudoClasses = new Set(["dir", "lang", "state"])

/**
 * Text that can follow a parent selector when a child selector extends it.
 */
const selectorContinuationPattern = /^[\s>+~.#:[]/

/**
 * Relative combinator at the start of a nested selector.
 */
const relativeCombinatorPattern = /^[>+~]/

/**
 * Leading whitespace of the first selector in a nested selector.
 */
const leadingWhitespacePattern = /^\s/

/**
 * Add two specificity values.
 *
 * @param {Specificity} left - First value.
 * @param {Specificity} right - Second value.
 * @returns {Specificity} Sum of both values.
 */
function addSpecificity(left, right) {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]]
}

/**
 * Compare two specificity values.
 *
 * @param {Specificity} left - First value.
 * @param {Specificity} right - Second value.
 * @returns {boolean} True when both values are equal.
 */
function isEqualSpecificity(left, right) {
  return left.every((value, index) => value === right[index])
}

/**
 * Pick the larger of two specificity values.
 *
 * @param {Specificity} left - First value.
 * @param {Specificity} right - Second value.
 * @returns {Specificity} The larger value.
 */
function maximumSpecificity(left, right) {
  switch (true) {
    case left[0] !== right[0]:
      return left[0] > right[0] ? left : right
    case left[1] !== right[1]:
      return left[1] > right[1] ? left : right
    default:
      return left[2] >= right[2] ? left : right
  }
}

/**
 * Pick the largest specificity value, or null when one value is unknown.
 *
 * @param {Array<Specificity | null>} values - Specificity values.
 * @returns {Specificity | null} Largest value, or null when unknown.
 */
function combineMaximumSpecificity(values) {
  switch (true) {
    case values.some((value) => value === null):
      return null
    default:
      return values.reduce(maximumSpecificity)
  }
}

/**
 * Calculate the specificity of a selector list.
 *
 * @param {import("css-tree").CssNode} selectorList - Parsed selector list.
 * @returns {Specificity | null} Specificity of the most specific selector.
 */
function calculateSelectorListSpecificity(selectorList) {
  return combineMaximumSpecificity(
    Array.from(selectorList.children, calculateSpecificity),
  )
}

/**
 * Calculate the specificity of the selector argument of a pseudo-class.
 *
 * `:is()` and `:not()` take a selector list, while `:host()` takes one selector.
 *
 * @param {import("css-tree").CssNode} node - Parsed pseudo-class.
 * @returns {Specificity | null} Specificity of the argument.
 */
function calculateSelectorArgumentSpecificity(node) {
  const arguments_ = [...node.children].filter(
    (child) => child.type === "SelectorList" || child.type === "Selector",
  )

  switch (arguments_.length) {
    case 0:
      return null
    default:
      return combineMaximumSpecificity(
        arguments_.map((child) =>
          child.type === "SelectorList"
            ? calculateSelectorListSpecificity(child)
            : calculateSpecificity(child),
        ),
      )
  }
}

/**
 * Calculate the specificity of the optional selector list of an nth pseudo-class.
 *
 * @param {import("css-tree").CssNode} node - Parsed pseudo-class.
 * @returns {Specificity | null} Specificity of the selector list argument.
 */
function calculateNthSelectorSpecificity(node) {
  const nth = [...node.children].find((child) => child.type === "Nth")

  switch (nth?.selector) {
    case undefined:
    case null:
      return [0, 0, 0]
    default:
      return calculateSelectorListSpecificity(nth.selector)
  }
}

/**
 * Calculate the specificity of a functional pseudo-class.
 *
 * @param {import("css-tree").CssNode} node - Parsed pseudo-class.
 * @returns {Specificity | null} Specificity of the pseudo-class.
 */
function calculatePseudoClassSpecificity(node) {
  const name = node.name.toLowerCase()

  switch (true) {
    case name === "where":
      return [0, 0, 0]
    case node.children === null:
      return [0, 1, 0]
    case selectorListPseudoClasses.has(name):
      return calculateSelectorArgumentSpecificity(node)
    case nthPseudoClasses.has(name): {
      const argumentSpecificity = calculateNthSelectorSpecificity(node)

      switch (argumentSpecificity) {
        case null:
          return null
        default:
          return addSpecificity([0, 1, 0], argumentSpecificity)
      }
    }
    case plainFunctionalPseudoClasses.has(name):
      return [0, 1, 0]
    default:
      return null
  }
}

/**
 * Calculate the specificity contribution of one selector node.
 *
 * @param {import("css-tree").CssNode} node - Parsed selector node.
 * @returns {Specificity | null} Specificity of the node, or null when unknown.
 */
function calculateNodeSpecificity(node) {
  switch (node.type) {
    case "Combinator":
      return [0, 0, 0]
    case "TypeSelector":
      return node.name === "*" ? [0, 0, 0] : [0, 0, 1]
    case "IdSelector":
      return [1, 0, 0]
    case "ClassSelector":
    case "AttributeSelector":
      return [0, 1, 0]
    case "PseudoElementSelector":
      return [0, 0, 1]
    case "PseudoClassSelector":
      return calculatePseudoClassSpecificity(node)
    default:
      return null
  }
}

/**
 * Calculate the specificity of a selector.
 *
 * @param {import("css-tree").CssNode} selector - Parsed selector.
 * @returns {Specificity | null} Specificity, or null when a node is unknown.
 */
function calculateSpecificity(selector) {
  return [...selector.children].reduce(
    (specificity, node) => {
      switch (specificity) {
        case null:
          return null
        default: {
          const nodeSpecificity = calculateNodeSpecificity(node)

          switch (nodeSpecificity) {
            case null:
              return null
            default:
              return addSpecificity(specificity, nodeSpecificity)
          }
        }
      }
    },
    [0, 0, 0],
  )
}

/**
 * Check whether a rule only holds declarations.
 *
 * @param {import("css-tree").CssNode} rule - Syntax tree node.
 * @returns {boolean} True when the node is a style rule with declarations only.
 */
function isPlainRule(rule) {
  return (
    rule.type === "Rule" &&
    rule.prelude.type === "SelectorList" &&
    [...rule.block.children].every((child) => child.type === "Declaration")
  )
}

/**
 * Read the source text of every selector in a rule.
 *
 * @param {string} code - CSS source text.
 * @param {import("css-tree").CssNode} rule - Style rule.
 * @returns {string[]} Selector texts.
 */
function extractSelectorTexts(code, rule) {
  return Array.from(rule.prelude.children, (selector) =>
    code.slice(selector.loc.start.offset, selector.loc.end.offset).trim(),
  )
}

/**
 * Check whether a rule selects a pseudo-element.
 *
 * @param {import("css-tree").CssNode} rule - Style rule.
 * @returns {boolean} True when a selector contains a pseudo-element.
 */
function hasPseudoElement(rule) {
  return [...rule.prelude.children].some((selector) =>
    [...selector.children].some((node) => node.type === "PseudoElementSelector"),
  )
}

/**
 * Check whether a rule holds a comment outside its declaration block.
 *
 * The block renderer keeps comments inside the block. A comment in the
 * selector or between the selector and the block would be lost when the rule
 * is rendered again.
 *
 * @param {SourceRange[]} comments - Comment ranges.
 * @param {import("css-tree").CssNode} rule - Style rule.
 * @returns {boolean} True when a comment lies outside the declaration block.
 */
function hasCommentOutsideBlock(comments, rule) {
  return comments.some(
    (comment) =>
      comment.start >= rule.loc.start.offset &&
      comment.end <= rule.loc.end.offset &&
      (comment.start < rule.block.loc.start.offset ||
        comment.end > rule.block.loc.end.offset),
  )
}

/**
 * Match a parent selector against the start of a child selector.
 *
 * @param {string} parentSelector - Parent selector text.
 * @param {string} childSelector - Child selector text.
 * @returns {string | null} Remaining child selector text, or null without a match.
 */
function matchSelectorPrefix(parentSelector, childSelector) {
  switch (true) {
    case !childSelector.startsWith(parentSelector):
      return null
    default: {
      const remainder = childSelector.slice(parentSelector.length)

      switch (true) {
        case remainder.trim() === "":
          return null
        case !selectorContinuationPattern.test(remainder):
          return null
        default:
          return remainder
      }
    }
  }
}

/**
 * Render the remainder of a child selector as a nested selector.
 *
 * @param {string} remainder - Child selector text after the parent selector.
 * @returns {string} Nested selector.
 */
function renderNestedSelector(remainder) {
  const text = remainder.trim()

  switch (true) {
    case relativeCombinatorPattern.test(text):
      return `& ${text}`
    case leadingWhitespacePattern.test(remainder):
      return text
    default:
      return `&${text}`
  }
}

/**
 * Build the nested selector list that replaces a child selector list.
 *
 * @param {string} code - CSS source text.
 * @param {import("css-tree").CssNode} parent - Parent style rule.
 * @param {import("css-tree").CssNode} child - Child style rule.
 * @param {SourceRange[]} comments - Comment ranges.
 * @returns {string | null} Nested selector list, or null when the rules cannot nest.
 */
function findNestedPrelude(code, parent, child, comments) {
  switch (true) {
    case hasCommentOutsideBlock(comments, parent):
      return null
    case hasCommentOutsideBlock(comments, child):
      return null
    case hasPseudoElement(parent):
      return null
    default:
      break
  }

  const parentSelectors = extractSelectorTexts(code, parent)
  const childSelectors = extractSelectorTexts(code, child)

  switch (true) {
    case new Set(parentSelectors).size !== parentSelectors.length:
      return null
    case new Set(childSelectors).size !== childSelectors.length:
      return null
    default:
      break
  }

  const parentSpecificities = Array.from(parent.prelude.children, calculateSpecificity)

  switch (true) {
    case parentSpecificities.some((specificity) => specificity === null):
      return null
    case !parentSpecificities.every((specificity) =>
      isEqualSpecificity(specificity, parentSpecificities[0]),
    ):
      return null
    default:
      break
  }

  const matches = childSelectors.map((selector) => ({
    selector,
    parents: parentSelectors
      .map((parentSelector) => ({
        parentSelector,
        remainder: matchSelectorPrefix(parentSelector, selector),
      }))
      .filter(({ remainder }) => remainder !== null),
  }))

  switch (true) {
    case matches.some(({ parents }) => parents.length !== 1):
      return null
    default:
      break
  }

  const suffixes = parentSelectors.map((parentSelector) => ({
    parentSelector,
    remainders: matches
      .filter(({ parents }) => parents[0].parentSelector === parentSelector)
      .map(({ parents }) => parents[0].remainder),
  }))
  const remainders = suffixes[0].remainders

  switch (true) {
    case suffixes.some(
      ({ remainders: candidate }) =>
        candidate.length !== remainders.length ||
        candidate.some(
          (remainder, index) => remainder.trim() !== remainders[index].trim(),
        ),
    ):
      return null
    default:
      return remainders.map(renderNestedSelector).join(", ")
  }
}

/**
 * Rewrites flat stylesheets to use CSS nesting.
 *
 * Only adjacent rules are nested, so the cascade order stays the same. Rules
 * without a nested child keep their original text.
 */
class NestingModernizer {
  #ast
  #code
  #comments
  #indentUnit
  #lineEnding

  /**
   * @param {string} code - CSS source text.
   * @param {import("css-tree").CssNode} ast - Parsed CSS syntax tree.
   * @param {SourceRange[]} comments - Comment ranges.
   */
  constructor(code, ast, comments) {
    this.#code = code
    this.#ast = ast
    this.#comments = comments
    this.#indentUnit = detectIndentUnit(code)
    this.#lineEnding = code.includes("\r\n") ? "\r\n" : "\n"
  }

  /**
   * Nest adjacent rules that extend the selector of an earlier rule.
   *
   * @returns {string} Transformed CSS source.
   */
  nest() {
    return this.#renderChildren(this.#ast.children, 0, this.#code.length)
  }

  /**
   * Render the children of a stylesheet or at-rule block.
   *
   * @param {Iterable<import("css-tree").CssNode>} children - Child nodes.
   * @param {number} contentStart - Offset of the first character inside the block.
   * @param {number} contentEnd - Offset of the closing brace, or the source end.
   * @returns {string} Rendered block content.
   */
  #renderChildren(children, contentStart, contentEnd) {
    const rendered = this.#groupChildren([...children]).reduce(
      (state, item) => {
        const range = this.#itemRange(item)

        return {
          text:
            state.text +
            this.#code.slice(state.cursor, range.start) +
            this.#renderItem(item),
          cursor: range.end,
        }
      },
      { text: "", cursor: contentStart },
    )

    return rendered.text + this.#code.slice(rendered.cursor, contentEnd)
  }

  /**
   * Group adjacent rules that can be nested.
   *
   * @param {import("css-tree").CssNode[]} children - Child nodes.
   * @returns {Array<{kind: string, node?: import("css-tree").CssNode, group?: Object}>} Items to render.
   */
  #groupChildren(children) {
    return children.reduce((state, child) => this.#groupChild(state, child), {
      items: [],
      stack: [],
      lastRuleEnd: null,
    }).items
  }

  /**
   * Add one child node to the grouping state.
   *
   * @param {Object} state - Grouping state.
   * @param {import("css-tree").CssNode} child - Child node.
   * @returns {Object} Updated grouping state.
   */
  #groupChild(state, child) {
    const match = this.#findMatch(state, child)

    switch (true) {
      case match !== null: {
        const group = {
          node: child,
          prelude: match.prelude,
          children: [],
          leadingComments: this.#commentsBetween(
            state.lastRuleEnd,
            child.loc.start.offset,
          ),
        }

        match.group.children.push(group)

        return {
          items: state.items,
          stack: [...state.stack.slice(0, match.stackLength), group],
          lastRuleEnd: child.loc.end.offset,
        }
      }
      default:
        break
    }

    switch (isPlainRule(child)) {
      case true: {
        const group = {
          node: child,
          prelude: extractSelectorTexts(this.#code, child).join(", "),
          children: [],
          leadingComments: [],
        }

        return {
          items: [...state.items, { kind: "group", group }],
          stack: [group],
          lastRuleEnd: child.loc.end.offset,
        }
      }
      default:
        return {
          items: [...state.items, { kind: "node", node: child }],
          stack: [],
          lastRuleEnd: null,
        }
    }
  }

  /**
   * Find the deepest group that can absorb a child rule.
   *
   * @param {Object} state - Grouping state.
   * @param {import("css-tree").CssNode} child - Child node.
   * @returns {{group: Object, prelude: string, stackLength: number} | null} Matching group.
   */
  #findMatch(state, child) {
    switch (true) {
      case state.lastRuleEnd === null:
        return null
      case !isPlainRule(child):
        return null
      default:
        break
    }

    const index = state.stack.findLastIndex(
      (group) =>
        findNestedPrelude(this.#code, group.node, child, this.#comments) !== null,
    )

    switch (index) {
      case -1:
        return null
      default:
        return {
          group: state.stack[index],
          prelude: findNestedPrelude(
            this.#code,
            state.stack[index].node,
            child,
            this.#comments,
          ),
          stackLength: index + 1,
        }
    }
  }

  /**
   * Read the source range a grouped item replaces.
   *
   * @param {Object} item - Group or untouched node.
   * @returns {{start: number, end: number}} Source range of the item.
   */
  #itemRange(item) {
    switch (item.kind) {
      case "group":
        return {
          start: item.group.node.loc.start.offset,
          end: findGroupEnd(item.group),
        }
      default:
        return {
          start: item.node.loc.start.offset,
          end: item.node.loc.end.offset,
        }
    }
  }

  /**
   * Render one grouped item.
   *
   * @param {Object} item - Group or untouched node.
   * @returns {string} Rendered item.
   */
  #renderItem(item) {
    switch (item.kind) {
      case "group":
        return this.#renderGroupItem(item.group)
      default:
        return this.#renderNode(item.node)
    }
  }

  /**
   * Render a group, or its original text when it did not absorb a child.
   *
   * @param {Object} group - Group to render.
   * @returns {string} Rendered group.
   */
  #renderGroupItem(group) {
    switch (group.children.length) {
      case 0:
        return this.#code.slice(group.node.loc.start.offset, group.node.loc.end.offset)
      default:
        return this.#renderGroup(group)
    }
  }

  /**
   * Render a rule with its nested children.
   *
   * @param {Object} group - Group to render.
   * @returns {string} Rendered rule.
   */
  #renderGroup(group) {
    const baseIndent = this.#lineIndent(group.node.loc.start.offset)
    const rendered = this.#renderRule(group, baseIndent)

    return rendered.slice(baseIndent.length)
  }

  /**
   * Render a rule and its descendants at the given indentation.
   *
   * @param {Object} group - Group to render.
   * @param {string} indent - Indentation of the rule.
   * @returns {string} Rendered rule.
   */
  #renderRule(group, indent) {
    const childIndent = indent + this.#indentUnit

    return [
      `${indent}${group.prelude} {`,
      ...this.#renderBlockEntries(group.node.block, childIndent),
      ...group.children.flatMap((child) => [
        ...child.leadingComments.map(
          (comment) => `${childIndent}${this.#commentText(comment)}`,
        ),
        this.#renderRule(child, childIndent),
      ]),
      `${indent}}`,
    ].join(this.#lineEnding)
  }

  /**
   * Render the declarations and comments of a block.
   *
   * @param {import("css-tree").CssNode} block - Declaration block.
   * @param {string} indent - Indentation of the entries.
   * @returns {string[]} Rendered entries.
   */
  #renderBlockEntries(block, indent) {
    const declarations = [...block.children]
    const standaloneComments = this.#comments.filter(
      (comment) =>
        comment.start >= block.loc.start.offset &&
        comment.end <= block.loc.end.offset &&
        !declarations.some(
          (declaration) =>
            comment.start >= declaration.loc.start.offset &&
            comment.end <= declaration.loc.end.offset,
        ),
    )
    const entries = [
      ...declarations.map((declaration) => ({
        start: declaration.loc.start.offset,
        text: this.#declarationText(declaration),
      })),
      ...standaloneComments.map((comment) => ({
        start: comment.start,
        text: this.#commentText(comment),
      })),
    ]

    return entries
      .toSorted((left, right) => left.start - right.start)
      .map((entry) => `${indent}${entry.text}`)
  }

  /**
   * Render a declaration with a terminating semicolon.
   *
   * @param {import("css-tree").CssNode} declaration - Declaration node.
   * @returns {string} Declaration text.
   */
  #declarationText(declaration) {
    return `${this.#code
      .slice(declaration.loc.start.offset, declaration.loc.end.offset)
      .trim()};`
  }

  /**
   * Render a comment.
   *
   * @param {SourceRange} comment - Comment range.
   * @returns {string} Comment text.
   */
  #commentText(comment) {
    return this.#code.slice(comment.start, comment.end).trim()
  }

  /**
   * Collect comments inside a range.
   *
   * @param {number} start - First offset to inspect.
   * @param {number} end - Offset after the last character to inspect.
   * @returns {SourceRange[]} Comments inside the range.
   */
  #commentsBetween(start, end) {
    return this.#comments.filter(
      (comment) => comment.start >= start && comment.end <= end,
    )
  }

  /**
   * Render an untouched node, descending into nestable at-rule blocks.
   *
   * @param {import("css-tree").CssNode} node - Syntax tree node.
   * @returns {string} Rendered node.
   */
  #renderNode(node) {
    switch (node.type) {
      case "Atrule":
        return this.#renderAtRule(node)
      default:
        return this.#code.slice(node.loc.start.offset, node.loc.end.offset)
    }
  }

  /**
   * Render an at-rule and nest the rules of a block that holds style rules.
   *
   * @param {import("css-tree").CssNode} atrule - At-rule node.
   * @returns {string} Rendered at-rule.
   */
  #renderAtRule(atrule) {
    switch (true) {
      case atrule.block === null:
        return this.#code.slice(atrule.loc.start.offset, atrule.loc.end.offset)
      case !nestedBlockAtRules.has(atrule.name.toLowerCase()):
        return this.#code.slice(atrule.loc.start.offset, atrule.loc.end.offset)
      default: {
        const blockStart = atrule.block.loc.start.offset
        const closeBrace = this.#findClosingBrace(atrule.block)

        return (
          this.#code.slice(atrule.loc.start.offset, blockStart + 1) +
          this.#renderChildren(atrule.block.children, blockStart + 1, closeBrace) +
          this.#code.slice(closeBrace, atrule.loc.end.offset)
        )
      }
    }
  }

  /**
   * Find the closing brace of a block.
   *
   * An unterminated block ends after its last child, so a final brace belongs
   * to that child instead of the block.
   *
   * @param {import("css-tree").CssNode} block - Block node.
   * @returns {number} Offset of the closing brace, or the block end.
   */
  #findClosingBrace(block) {
    const blockEnd = block.loc.end.offset
    const lastChild = [...block.children].at(-1)

    switch (true) {
      case this.#code[blockEnd - 1] !== "}":
        return blockEnd
      case lastChild === undefined:
        return blockEnd - 1
      case blockEnd - 1 >= lastChild.loc.end.offset:
        return blockEnd - 1
      default:
        return blockEnd
    }
  }

  /**
   * Read the indentation of the line that holds an offset.
   *
   * @param {number} offset - Offset inside the line.
   * @returns {string} Leading whitespace of the line, or an empty string.
   */
  #lineIndent(offset) {
    const lineStart = this.#code.lastIndexOf("\n", offset - 1) + 1
    const prefix = this.#code.slice(lineStart, offset)

    return /^[ \t]*$/.test(prefix) ? prefix : ""
  }
}

/**
 * Detect the indentation unit used by the source text.
 *
 * @param {string} code - CSS source text.
 * @returns {string} One level of indentation.
 */
function detectIndentUnit(code) {
  const match = /^([ \t]+)\S/m.exec(code)

  switch (match) {
    case null:
      return "  "
    default:
      return match[1]
  }
}

/**
 * Find the source end of the last rule in a group.
 *
 * @param {Object} group - Group to inspect.
 * @returns {number} Offset after the last nested rule.
 */
function findGroupEnd(group) {
  switch (group.children.length) {
    case 0:
      return group.node.loc.end.offset
    default:
      return findGroupEnd(group.children[group.children.length - 1])
  }
}

/**
 * Nest adjacent rules that extend the selector of an earlier rule.
 *
 * @param {string} code - CSS source text.
 * @returns {TransformResult} Nested CSS.
 */
export function cssNesting(code) {
  const { ast, comments } = parseCss(code)
  const nextCode = new NestingModernizer(code, ast, comments).nest()

  return { code: nextCode, modified: nextCode !== code }
}

cssNesting.baselineDate = new Date(Date.UTC(2023, 11, 11))
