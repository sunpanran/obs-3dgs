# obs-3dgs

[English](README.md)

`obs-3dgs` 是一个开源 OBS 输入来源插件，用于把本地 3D Gaussian Splatting 场景作为直播背景。插件采用“小型原生 OBS/Qt 包装层 + [Spark](https://github.com/sparkjsdev/spark) WebGL2 渲染器”的结构，不重复开发高斯格式解析、排序和 LOD 引擎。

> 当前状态：正在开发 `0.1.0-beta.1`。Windows 版本已经可以在本地编译；macOS Universal 仍需 CI 构建及 Apple Silicon 真机验证。现阶段不要直接用于不可重来的正式直播。

## 已实现能力

- 在 OBS“来源”中添加 `3DGS 场景`。
- 每个来源加载一个本地静态 PLY、Compressed PLY、SPZ、SOG、SPLAT、KSPLAT、ZIP 或 RAD 文件。
- 更换文件时先后台加载，成功后再替换，失败时保留旧场景。
- 支持场景位移/旋转/统一缩放、全画幅等效焦段、环绕/平移/推拉、显示参数、LOD 质量档位、镜头预设和 OBS 热键。
- 提供紧凑的原生 `3DGS 实时控制` Dock，不额外渲染第二个预览。
- 原生界面和画布状态支持简体中文与英文。
- 只通过带随机令牌的本机回环 HTTP 地址映射用户明确选择的文件。

正式格式为 PLY、Compressed PLY、SPZ、SOG；SPLAT、KSPLAT、ZIP、RAD 在首个 Beta 中标为实验格式。

## 支持环境

| 平台 | 主机要求 |
|---|---|
| Windows | Windows 10/11 x64，OBS 32.0+ |
| macOS | Universal arm64+x86_64，插件部署目标 macOS 12 |
| Linux | 0.1 不支持 |

注意：OBS 32.2.x 自身已无法在 macOS 12 启动。macOS 12 应使用 OBS 32.1.2；更高版本 macOS 可使用 OBS 32.2.2+。

## 开发命令

需要 Node.js 24+、npm、CMake 3.30+；Windows 使用 Visual Studio 2022 Build Tools，macOS 使用 Xcode 16。

```text
npm ci
npm run dev
npm run build
npm test
npm run lint
```

Windows 原生构建：

```powershell
cmake --preset windows-x64
cmake --build --preset windows-x64 --parallel
ctest --test-dir build_x64 -C RelWithDebInfo --output-on-failure
cmake --install build_x64 --config RelWithDebInfo --prefix dist/windows-x64
```

CMake 会从官方地址下载并校验固定版本的依赖：Windows 使用 OBS 32.2.2，macOS 使用 OBS 32.1.2 SDK 以保留 macOS 12 部署目标；cpp-httplib 和 nlohmann/json 同样固定。下载内容保存在 `.deps/`，不会提交到仓库。

整个项目统一维护于 [sunpanran/obs-3dgs](https://github.com/sunpanran/obs-3dgs)：Windows 与 macOS 共用版本号、CI 和发布入口。

进一步阅读：[技术架构](docs/architecture.zh-CN.md)、[安装说明](docs/install.zh-CN.md)、[测试说明](docs/testing.zh-CN.md)、[安全设计](docs/security.zh-CN.md)。

欢迎参与贡献；提交代码或敏感问题前，请先阅读[贡献指南](CONTRIBUTING.zh-CN.md)与[安全策略](SECURITY.md)。

## 许可证

整个仓库使用 `GPL-2.0-or-later`。第三方组件和示例素材保留其各自许可证，详见[第三方声明](data/licenses/THIRD_PARTY_NOTICES.md)。
