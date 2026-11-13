import * as csstree from "css-tree"

/**
 * @typedef {Object} SourceRange
 * @property {number} start - Offset of the first character.
 * @property {number} end - Offset after the last character.
 */

/**
 * @typedef {Object} ParsedCss
 * @property {import("css-tree").CssNode} ast - Parsed CSS syntax tree.
 * @property {SourceRange[]} comments - Comment ranges in source order.
 */

/**
 * Record the range of every comment in the source text.
 *
 * @param {SourceRange[]} comments - Collected comment ranges.
 * @param {string} _value - Comment text without delimiters.
 * @param {{start: {offset: number}, end: {offset: number}}} loc - Comment location.
 * @returns {void}
 */
function recordComment(comments, _value, loc) {
  comments.push({ start: loc.start.offset, end: loc.end.offset })
}

/**
 * Parse CSS and collect its comments, which the syntax tree does not include.
 *
 * @param {string} css - CSS source text.
 * @returns {ParsedCss} Syntax tree and comment ranges.
 */
export function parseCss(css) {
  const comments = []

  return {
    ast: csstree.parse(css, {
      positions: true,
      onComment: recordComment.bind(null, comments),
    }),
    comments,
  }
}
