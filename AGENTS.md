# CSSupgrade

The package includes transformers for upgrading CSS syntax.

## Categories

- [Widely Available](./src/widelyAvailable/): Transformers for features available in all major browsers for at least 30 months.
- [Newly Available](./src/newlyAvailable/): Transformers for features available in all major browsers for 0-30 months.

For a full list of transformations, see [README.md](./README.md).

## Package Structure

- [bin/](./bin/): Command-line interface script.
- [src/](./src/): Source code and transformers.
- [tests/](./tests/): Test suite.

For contributing guidelines, see [CONTRIBUTING.md](./CONTRIBUTING.md).

## Instructions

Use EOF syntax to run node scripts directly from the command line. For example:

```bash
node --input-type=module <<'EOF'
import { transform } from './src/index.js';

const sample = '.a { color: red } .a .b { color: blue }';
const res = transform(sample);
console.log('modified:', res.modified);
console.log('code:\n' + res.code);
EOF
```

## Writing Transformers

The pipeline parses CSS with `parseCss` from `src/parser.js`, which returns the
css-tree syntax tree and the ranges of all comments.

Every transformer declares a pre-filter in `src/prefilters.js`, so files that
cannot contain the pattern skip the parse. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Writing Docs

### README.md

We add one new section per transformation:

1. Headline + MDN link
2. One diff-based example.
3. Notable exception, which are not transformed.

We MUST NOT add any comments about "what it does".
The functionality documentation is fully covered by the diff-based example.
