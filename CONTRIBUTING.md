<!-- SPDX-License-Identifier: GPL-2.0-or-later -->

# Contributing to obs-3dgs

[简体中文](CONTRIBUTING.zh-CN.md)

Thank you for helping make 3D Gaussian scenes practical in OBS. Keep changes focused and preserve the boundary between the native OBS integration (`plugin/`) and the Spark renderer (`src/`).

## Before opening a change

- Discuss large UI, protocol, dependency, format-support, or architecture changes in an issue first.
- Do not commit private scenes, credentials, generated build directories, or assets with unclear licenses.
- Store redistributable fixtures in `public/samples/` with adjacent attribution and license information. Use Git LFS for SOG fixtures.
- Treat every imported file as untrusted. Validate counts, sizes, offsets, numeric values, and allocation bounds before parsing.

## Development checks

Use Node.js 24+, npm 11+, and the native prerequisites documented in the README.

```text
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

For native changes, also configure the matching CMake preset, build it, and run CTest. Windows contributors should use `windows-ci-x64` before submitting so compiler warnings are treated as errors.

Rendering changes must include the scene and license, camera pose, focal length, output resolution, render scale, quality preset, GPU, average FPS, P95 frame time, and a screenshot. Never upload a private scene merely to reproduce a bug.

## Pull requests

Use Conventional Commits such as `feat: add SOG loading diagnostics` or `fix: preserve custom focal length`. A pull request should explain its scope, list the commands executed, link related issues, and include visual or performance evidence when rendering changes.

By contributing, you agree that your contribution is licensed under GPL-2.0-or-later.
