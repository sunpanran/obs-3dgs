# 依赖决策

原方案固定 Vite 5.4.21。实施时，`npm audit` 报告了影响原定 Vite/Vitest 代际的高危/严重开发服务器漏洞，因此项目改用 Vite 8.2.2、Vitest 4.1.11 和 Node.js 24。运行时库仍按方案精确固定：Spark 2.1.0、Three.js 0.180.0、TypeScript 5.9.3。

这项调整不会让用户运行插件时需要 Node.js；发布 ZIP 只包含已经构建好的浏览器资源。

代码检查工具使用 ESLint 10.9.1、`@eslint/js` 10.0.1 和 typescript-eslint 8.69.0。`npm ci` 提示原先固定的 ESLint 9 已结束支持后，项目将其替换。

原生依赖固定为 cpp-httplib 0.51.0 和 nlohmann/json 3.12.0。Windows 使用 OBS 32.2.2 / 2026-07-15 官方依赖包；macOS 使用 OBS 32.1.2 / 2025-08-23 官方依赖包，以保留 macOS 12 部署目标。平台版本和 SHA-256 记录在 `buildspec.json`，CTest 检查平台选择不会发生漂移。

本机通过 WinGet 安装的是 CMake 4.4。项目保持兼容 CMake 3.30–4.4，不依赖仅 4.x 才有的功能。
