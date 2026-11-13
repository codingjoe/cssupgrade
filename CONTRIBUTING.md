# Contributing

To run tests locally, follow these steps:

```console
npm ci
npx playwright install
npm test
```

The browser tests render every fixture with the original and transformed CSS and
compare the computed styles of all elements in Chromium, Firefox, WebKit, and
Safari. Register fixtures in the test file of the transformer they cover.

Real Safari runs only on macOS with Remote Automation enabled:

```console
sudo safaridriver --enable
npm run test:safari
```

We use pre-commit hooks to lint and format code before committing.

To install the pre-commit hooks, run:

```console
uvx pre-commit install
```

Or instead run the linters once with:

```console
uvx pre-commit run --all-files
```

## Naming conventions

When writing code, please follow the [naming guidelines](https://raw.githubusercontent.com/codingjoe/naming-things/refs/heads/main/README.md).

## Baseline release dates

The baseline date can be found on
https://github.com/web-platform-dx/web-features named `baseline_low_date`.

## Pre-filters

Every transformer needs a pre-filter in `src/prefilters.js` and a sample in
`tests/prefilters.test.js`. A pre-filter is a pattern that the source text must
contain. The pattern must be necessary: when the source text does not match,
the transformer cannot change the tree.
