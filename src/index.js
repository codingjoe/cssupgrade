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
 * Apply one transformer to the result of the previous transformers.
 *
 * @param {TransformResult} result - Current transformation result.
 * @param {NamedTransformer} namedTransformer - Transformer name and function.
 * @returns {TransformResult} Updated transformation result.
 */
function applyNamedTransformer(result, [name, transformer]) {
  switch (matchesPrefilter(name, result.code)) {
    case false:
      return result
    default: {
      const transformed = transformer(result.code)

      return {
        code: transformed.code,
        modified: result.modified || transformed.modified,
      }
    }
  }
}

/**
 * Apply every transformer that passes its pre-filter, then repeat on the result.
 *
 * @param {string} code - CSS source text.
 * @param {NamedTransformer[]} transformers - Transformers to apply.
 * @param {boolean} globalModified - Whether an earlier pass changed the source.
 * @returns {TransformResult} Transformed source.
 */
function applyTransformersRecursively(code, transformers, globalModified = false) {
  const passResult = transformers.reduce(applyNamedTransformer, {
    code,
    modified: false,
  })

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
