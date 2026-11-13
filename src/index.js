import * as newlyAvailable from "./newlyAvailable.js"
import { matchesPrefilter } from "./prefilters.js"
import * as widelyAvailable from "./widelyAvailable.js"

/**
 * @typedef {Object} TransformResult
 * @property {string} code - Transformed CSS source.
 * @property {boolean} modified - Whether the source changed.
 */

/**
 * @typedef {function(string): TransformResult} Transformer
 */

/**
 * @typedef {[string, Transformer]} NamedTransformer
 */

/**
 * Apply every transformer that passes its pre-filter, then repeat on the result.
 *
 * @param {string} code - CSS source text.
 * @param {NamedTransformer[]} transformers - Transformers to apply.
 * @param {boolean} globalModified - Whether an earlier pass changed the source.
 * @returns {TransformResult} Transformed source.
 */
function applyTransformersRecursively(code, transformers, globalModified = false) {
  const passResult = transformers.reduce(
    (result, [name, transformer]) =>
      matchesPrefilter(name, result.code) ? transformer(result.code) : result,
    { code, modified: false },
  )

  return passResult.modified
    ? applyTransformersRecursively(passResult.code, transformers, true)
    : { code: passResult.code, modified: globalModified }
}

/**
 * Transform CSS using the transformers of the selected baseline.
 *
 * @param {string} code - CSS source text.
 * @param {string} [baseline] - Baseline level ('widely-available' or 'newly-available').
 * @returns {TransformResult} Transformed source.
 */
export function transform(code, baseline = "widely-available") {
  const transformers =
    baseline === "newly-available"
      ? { ...widelyAvailable, ...newlyAvailable }
      : widelyAvailable

  return applyTransformersRecursively(code, Object.entries(transformers))
}
