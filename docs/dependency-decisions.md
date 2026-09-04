# Dependency decisions

The original design pinned Vite 5.4.21. During implementation, `npm audit` reported high/critical development-server vulnerabilities affecting the planned Vite/Vitest generation. The project therefore uses Vite 8.2.2 and Vitest 4.1.11 with Node.js 24. Runtime libraries remain pinned exactly as designed: Spark 2.1.0, Three.js 0.180.0, and TypeScript 5.9.3.

This change does not add a runtime Node.js requirement. Release ZIP files contain only the built browser bundle.

The lint toolchain uses ESLint 10.9.1, `@eslint/js` 10.0.1, and typescript-eslint 8.69.0. ESLint 9 was replaced after `npm ci` reported that its pinned release line had reached end of support.

Native dependencies pin cpp-httplib 0.51.0 and nlohmann/json 3.12.0. Windows uses OBS 32.2.2 with the 2026-07-15 official dependency set; macOS uses OBS 32.1.2 with the 2025-08-23 set to preserve the macOS 12 deployment target. Platform versions and SHA-256 values are recorded in `buildspec.json`, with CTest coverage for platform selection.

The local Windows machine currently has CMake 4.4 installed by WinGet. The project intentionally supports CMake 3.30 through 4.4 rather than relying on a 4.x-only feature.

Windows CI uses `windows-2022`, which includes the pinned Visual Studio 2022 generator. The macOS SDK bootstrap uses an after-project CMake hook to enable ObjC/ObjC++/Swift: OBS 32.1.2 still configures `libobs-metal` with the frontend disabled, otherwise leaving its linker language undetermined. Downloaded OBS sources are not patched.

Spark is consumed as the published npm artifact with its included MIT license and complete notice. Upstream Rust Cargo metadata separately declares `Proprietary`, conflicting with the repository MIT declaration; clarification remains open in [upstream #402](https://github.com/sparkjsdev/spark/issues/402). This project does not incorporate/recompile those Rust sources or bundle the offline Rust converter. RAD test data comes from an independently written minimal format writer. Any future upstream Rust source integration requires separate verification.
