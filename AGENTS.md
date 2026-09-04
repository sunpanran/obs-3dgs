# Repository Guidelines

## Project Structure & Module Organization

This repository is currently scaffold-free. Keep the initial layout deliberate: put browser/runtime code in `src/`, static files in `public/`, automated tests in `tests/`, and architecture or benchmark notes in `docs/`. If a native OBS module is introduced, isolate it under `plugin/`; do not mix C++ platform code into the web renderer. Store redistributable Gaussian-splat fixtures in `public/samples/` with an adjacent attribution or license file. Do not commit large, private, or ambiguously licensed scenes.

## Build, Test, and Development Commands

No build system is committed yet. The first scaffold change must provide stable `package.json` scripts with these meanings:

- `npm ci` — install the exact locked dependency set.
- `npm run dev` — start the local development viewer.
- `npm run build` — type-check and create a production build.
- `npm test` — run automated unit and integration tests.
- `npm run lint` — check formatting and static-analysis rules.

Keep commands cross-platform where practical and document any native OBS prerequisites in `docs/`.

## Coding Style & Naming Conventions

Use strict TypeScript for web code, two-space indentation, UTF-8, and LF line endings. Use `PascalCase` for classes and types, `camelCase` for functions and variables, `UPPER_SNAKE_CASE` for constants, and kebab-case for asset filenames. Keep rendering paths allocation-light and move file parsing or decompression outside frame callbacks. Follow committed formatter and linter configurations; avoid unrelated formatting churn.

## Testing Guidelines

Name unit tests `*.test.ts` and place browser-flow tests under `tests/e2e/`. Every bug fix requires a regression test. Rendering changes must include a reproducible scene, camera pose, resolution, and before/after screenshot or benchmark. Test malformed and truncated 3DGS inputs; a bad asset must report an error rather than crash the host.

## Commit & Pull Request Guidelines

There is no existing Git history, so use Conventional Commits such as `feat: add SOG loader` and `fix: restore camera reset`. Keep commits focused. Pull requests must explain scope, list executed commands, link related issues, and include visual or performance evidence for rendering changes. Record licenses for every new dependency and sample asset.

## Security & Licensing

Treat imported files as untrusted: validate sizes, counts, offsets, and numeric values before allocation. Never commit credentials. Code being visible on GitHub does not make it reusable; verify license compatibility and preserve required notices before copying or adapting it.
