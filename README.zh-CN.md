# obs-3dgs

[English](README.md)

`obs-3dgs` 是一个开源 OBS 输入来源插件，用于把本地 3D Gaussian Splatting 场景作为直播背景。插件采用“小型原生 OBS/Qt 包装层 + [Spark](https://github.com/sparkjsdev/spark) WebGL2 渲染器”的结构，不重复开发高斯格式解析、排序和 LOD 引擎。

> 当前状态：`0.1.0-beta.1` 候选版，发布暂为草稿。Windows x64 与 macOS Universal 已通过 CI 构建、自动测试和打包；Windows 已有真实 OBS 回归与录制证据。**macOS 尚未在真实 Mac 的 OBS 中验证。** Windows 前端人工验收也尚未全部完成，详见[验收清单](docs/manual-acceptance.zh-CN.md)。

## 下载与安装

两个平台的公开安装包统一放在 [GitHub Releases 发布页](https://github.com/sunpanran/obs-3dgs/releases)。打开版本详情，展开 **Assets**，按系统下载对应 ZIP：

| 系统 | 插件安装包 |
|---|---|
| Windows x64 | `obs-3dgs-0.1.0-beta.1-windows-x64.zip` |
| macOS，Apple Silicon 或 Intel | `obs-3dgs-0.1.0-beta.1-macos-universal.zip` |

安装使用上表中的插件 ZIP；GitHub 自动生成的 **Source code** 压缩包供开发使用。每个插件 ZIP 都附有同名 `.sha256` 校验文件与 SBOM。普通安装只需要 OBS Studio；下文的 Node.js 和编译工具仅供开发使用。

### Windows 安装

当前实机测试环境为 Windows 11 x64 + OBS Studio 32.2.2。

1. 关闭 OBS Studio，解压 Windows 安装包。
2. 在资源管理器地址栏粘贴 `C:\ProgramData\obs-studio\plugins\`。目录不存在时先新建。
3. 将解压得到的完整 **`obs-3dgs` 文件夹**复制进去，保留其中的 `bin` 和 `data` 目录。
4. 确认 DLL 的最终路径为 `C:\ProgramData\obs-studio\plugins\obs-3dgs\bin\64bit\obs-3dgs.dll`。
5. 启动 OBS，点击**来源 → + → 3DGS 场景**，新建来源。

### macOS 安装

Universal 包同时包含 Apple Silicon 和 Intel 架构。**安装、OBS 加载、渲染及性能尚未经过 Mac 实机验证。**

1. 关闭 OBS Studio，解压 macOS 安装包。
2. 在 Finder 中按 **Command + Shift + G**，输入 `~/Library/Application Support/obs-studio/plugins/`。目录不存在时先新建。
3. 将解压得到的 **`obs-3dgs.plugin`** 复制进去。
4. 启动 OBS，点击**来源 → + → 3DGS 场景**，新建来源。

测试包使用 ad-hoc 签名，未经 Apple Developer ID 签名或公证，macOS 可能拦截首次加载。处理方法见[安装说明](docs/install.zh-CN.md)与[故障排查](docs/troubleshooting.zh-CN.md)。

### 加载测试场景

1. 下载 [Knock Community Hall 测试场景（`.sog`，约 30 MB）](https://media.githubusercontent.com/media/sunpanran/obs-3dgs/main/public/samples/knock-community-hall.sog)。场景单独提供；下载后直接使用 `.sog` 文件。
2. 打开 **3DGS 场景**来源属性，选择本地场景文件，等待加载完成。
3. 在来源属性或 **3DGS 实时控制** Dock 中调整取景。作为直播背景时，将它放在摄像头来源下方。

测试场景 **Knock Community Hall** 的作者为 **scbenoit**，采用 **CC BY 4.0** 许可；[来源及署名说明](public/samples/README.md)。

更新时关闭 OBS，用新版解压出的文件夹或 bundle 覆盖旧版本；卸载时关闭 OBS 后删除该文件夹或 bundle。场景集合和镜头预设由 OBS 保存。若来源没有出现或场景无法加载，请查看[故障排查](docs/troubleshooting.zh-CN.md)，反馈时附上系统、OBS 版本和 GPU 信息。

## 已实现能力

- 在 OBS“来源”中添加 `3DGS 场景`。
- 每个来源加载一个本地静态 PLY、Compressed PLY、SPZ、SOG、SPLAT、KSPLAT、ZIP 或 RAD 文件。
- 更换文件时先后台加载，成功后再替换，失败时保留旧场景。
- 支持场景位移/旋转/统一缩放、全画幅等效焦段、环绕/平移/推拉、显示参数、LOD 质量档位、镜头预设和 OBS 热键。
- 提供紧凑的原生 `3DGS 实时控制` Dock，不额外渲染第二个预览。
- 原生界面和画布状态支持简体中文与英文。
- 只通过带随机令牌的本机回环 HTTP 地址映射用户明确选择的文件。

正式格式为 PLY、Compressed PLY、SPZ、SOG；SPLAT、KSPLAT、ZIP、RAD 在首个 Beta 中标为实验格式。

PLY 当前接受 binary little-endian 编码。八种格式/变体已有实机加载与错误恢复证据；RAD 覆盖单文件最小样例，外部多文件分块不在当前范围内。

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
