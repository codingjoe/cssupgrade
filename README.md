<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./images/logo-dark.svg?v=2">
    <source media="(prefers-color-scheme: light)" srcset="./images/logo-light.svg?v=2">
    <img alt="CSSupgrade: Auto-upgrade your CSS syntax" src="./images/logo-light.svg?v=2">
  </picture>
</p>

# CSSupgrade [![npm version](https://img.shields.io/npm/v/cssupgrade.svg?style=flat-square)](https://www.npmjs.com/package/cssupgrade) [![coverage status](https://img.shields.io/codecov/c/github/codingjoe/cssupgrade/main.svg?style=flat-square)](https://codecov.io/gh/codingjoe/cssupgrade) [![license](https://img.shields.io/npm/l/cssupgrade.svg?style=flat-square)](https://github.com/codingjoe/cssupgrade/blob/main/LICENSE)

Keeping your CSS up to date with full browser compatibility.

## Sponsors

[![Sponsors](https://django.the-box.sh/sponsors/codingjoe/cssupgrade.svg)](https://github.com/sponsors/codingjoe)

## Usage

CSSupgrade is safe and meant to be used automatically on your codebase.
We recommend integrating it into your development workflow using [pre-commit], [husky], or as an agent skill.

### CLI

To try it out on a repository without writing changes, run:

```bash
npx -y cssupgrade $(git ls-files '*.css')
```

To transform code from standard input, pass `-` as the input path:

```bash
echo '.a { .b { color: red } }' | npx cssupgrade -
```

For help with available options:

```bash
npx cssupgrade --help
```

### pre-commit

```bash
uvx pre-commit install
```

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/codingjoe/cssupgrade
    rev: 2026.1.0 # Use the latest release
    hooks:
      - id: cssupgrade
```

```bash
pre-commit run cssupgrade --all-files
```

### Husky

Assuming Husky is already initialized and `.husky/pre-commit` already contains `set -e`, append:

```bash
echo "git diff --cached --name-only --diff-filter=ACMR -z -- '*.css' | xargs -0 sh -c 'test \"\$#\" -eq 0 && exit 0; npx -y cssupgrade --write -- \"\$@\"' sh" >> .husky/pre-commit
echo "git diff --cached --name-only --diff-filter=ACMR -z -- '*.css' | xargs -0 sh -c 'test \"\$#\" -eq 0 && exit 0; git add -- \"\$@\"' sh" >> .husky/pre-commit
```

### Agent Skill

CSSupgrade is available as a skill in [Claude Code]. The plugin is distributed via the [codingjoe/claude-plugins](https://github.com/codingjoe/claude-plugins) marketplace. To use it:

1. Run `/plugin marketplace add codingjoe/claude-plugins`
2. Run `/plugin install cssupgrade@codingjoe`

The skill will analyze your selected styles and suggest transformations based on the Baseline browser support policy.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://web-platform-dx.github.io/assets/img/baseline-wordmark-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://web-platform-dx.github.io/assets/img/baseline-wordmark.svg">
  <img alt="Baseline: widely available" src="https://web-platform-dx.github.io/assets/img/baseline-wordmark.svg" height="32" align="right">
</picture>

## Browser Support & Baseline

All transformations are based on [Web Platform Baseline][baseline] features. Baseline tracks which web platform features are safe to use across browsers.

By default, CSSupgrade uses **widely available** features, meaning they work in all major browsers (Chrome, Edge, Safari, Firefox) for at least 30 months. This ensures full compatibility while keeping your styles modern.

You can opt into **newly available** features (available in all browsers for 0-30 months) with:

```bash
npx cssupgrade --baseline newly-available <files>
```

For more information about Baseline browser support, visit [web.dev/baseline][baseline].

## Supported File Types & Languages

- `.css` - CSS stylesheets

## Transformations

> [!NOTE]
> A transformation applies only to CSS that the parser accepts. Unknown at-rules
> and invalid declarations stay unchanged.

Rules that cannot nest keep their original text.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://web-platform-dx.github.io/assets/img/baseline-widely-word-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://web-platform-dx.github.io/assets/img/baseline-widely-word.svg">
  <img alt="Baseline: widely available" src="https://web-platform-dx.github.io/assets/img/baseline-widely-word.svg" height="32" align="right">
</picture>

### Widely available

#### Flat rules → [CSS nesting][mdn-nesting]

```diff
 .card {
   padding: 1rem;
-}
-.card .title { font-weight: bold; }
-.card:hover { color: red; }
+  .title { font-weight: bold; }
+  &:hover { color: red; }
+}
```

Only adjacent rules are nested, so the cascade order stays the same.
Every child selector must repeat a parent selector, and all parent selectors must have the same specificity.
Rules inside `@media`, `@supports`, `@container`, `@layer`, `@scope`, and `@starting-style` blocks are nested as well.

```css
/* Not transformed - `@keyframes` children are keyframe selectors */
@keyframes fade {
  from { opacity: 0 }
}
```

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://web-platform-dx.github.io/assets/img/baseline-newly-word-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://web-platform-dx.github.io/assets/img/baseline-newly-word.svg">
  <img alt="Baseline: Newly available" src="https://web-platform-dx.github.io/assets/img/baseline-newly-word.svg" height="32" align="right">
</picture>

### Newly available

No transformations are available yet.

## Versioning

CSSupgrade uses the [calver] `YYYY.MINOR.PATCH` versioning scheme.

The year indicates the baseline version. New transformations are added in minor releases, while patches are reserved for bug fixes.

## Related Projects

Thanks to [esupgrade] for inspiring CSSupgrade.

### Distinction

[esupgrade] upgrades JavaScript and TypeScript syntax.
CSSupgrade applies the same Baseline policy to CSS.

[baseline]: https://web.dev/baseline/
[calver]: https://calver.org/
[claude code]: https://code.claude.com
[esupgrade]: https://github.com/codingjoe/esupgrade
[husky]: https://typicode.github.io/husky/
[mdn-nesting]: https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_nesting
[pre-commit]: https://pre-commit.com/
