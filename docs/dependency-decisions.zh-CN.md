# 依赖决策

原方案固定 Vite 5.4.21。实施时，`npm audit` 报告了影响原定 Vite/Vitest 代际的高危/严重开发服务器漏洞，因此项目改用 Vite 8.2.2、Vitest 4.1.11 和 Node.js 24。运行时库仍按方案精确固定：Spark 2.1.0、Three.js 0.180.0、TypeScript 5.9.3。

这项调整不会让用户运行插件时需要 Node.js；发布 ZIP 只包含已经构建好的浏览器资源。

代码检查工具使用 ESLint 10.9.1、`@eslint/js` 10.0.1 和 typescript-eslint 8.69.0。`npm ci` 提示原先固定的 ESLint 9 已结束支持后，项目将其替换。

原生依赖固定为 cpp-httplib 0.51.0 和 nlohmann/json 3.12.0。Windows 使用 OBS 32.2.2 / 2026-07-15 官方依赖包；macOS 使用 OBS 32.1.2 / 2025-08-23 官方依赖包，以保留 macOS 12 部署目标。平台版本和 SHA-256 记录在 `buildspec.json`，CTest 检查平台选择不会发生漂移。

本机通过 WinGet 安装的是 CMake 4.4。项目保持兼容 CMake 3.30–4.4，不依赖仅 4.x 才有的功能。

GitHub Windows 构建使用仍附带 Visual Studio 2022 的 `windows-2022`，与本地固定生成器一致。macOS 构建通过项目后置 CMake hook 启用 ObjC/ObjC++/Swift：OBS 32.1.2 在关闭前端时仍配置 `libobs-metal`，缺少 Swift 会导致生成阶段找不到链接器语言；不修改下载的 OBS 源码。

Spark 使用 npm 发布包自带的 MIT 许可证并保留完整声明。上游 Rust 工作区的 Cargo 元数据另有 `Proprietary` 字段，与仓库 MIT 声明存在尚未澄清的冲突，见 [上游 #402](https://github.com/sparkjsdev/spark/issues/402)。本项目没有将这些 Rust 源码纳入仓库或重新编译，也不捆绑 Rust 离线转换器；RAD 测试数据由独立编写的最小格式写入器生成。未来引入上游 Rust 源码前需单独核实。
