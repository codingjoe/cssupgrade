/**
 * @typedef {[number, number, number]} Specificity
 */

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
  "is",
  "matches",
  "not",
])

/**
 * Pseudo-classes whose specificity is a pseudo-class plus their argument.
 */
const hostPseudoClasses = new Set(["host", "host-context"])

/**
 * Pseudo-classes that select the nth element and accept an optional selector list.
 */
const nthPseudoClasses = new Set(["nth-child", "nth-last-child"])

/**
 * Functional pseudo-classes whose argument is not a selector list.
 */
const plainFunctionalPseudoClasses = new Set(["dir", "lang", "state"])

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
export function isEqualSpecificity(left, right) {
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
  const index = left.findIndex((value, position) => value !== right[position])

  return index === -1 || left[index] > right[index] ? left : right
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
    case hostPseudoClasses.has(name): {
      const argumentSpecificity = calculateSelectorArgumentSpecificity(node)

      switch (argumentSpecificity) {
        case null:
          return null
        default:
          return addSpecificity([0, 1, 0], argumentSpecificity)
      }
    }
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
 * Calculate the specificity of a sequence of selector nodes.
 *
 * @param {Iterable<import("css-tree").CssNode>} nodes - Parsed selector nodes.
 * @returns {Specificity | null} Specificity, or null when a node is unknown.
 */
export function calculateNodesSpecificity(nodes) {
  return [...nodes].reduce(
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
 * Calculate the specificity of a selector.
 *
 * @param {import("css-tree").CssNode} selector - Parsed selector.
 * @returns {Specificity | null} Specificity, or null when a node is unknown.
 */
export function calculateSpecificity(selector) {
  return calculateNodesSpecificity(selector.children)
}
