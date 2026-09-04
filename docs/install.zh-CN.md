# 安装说明

## Windows x64

1. 关闭 OBS Studio。
2. 解压 `obs-3dgs-0.1.0-beta.1-windows-x64.zip`。
3. 将完整的 `obs-3dgs` 文件夹复制到 `C:\ProgramData\obs-studio\plugins\`。
4. 启动 OBS，在“来源”的 `+` 菜单中添加 `3DGS 场景`。

最终 DLL 路径必须是 `C:\ProgramData\obs-studio\plugins\obs-3dgs\bin\64bit\obs-3dgs.dll`。

## macOS Universal

1. 关闭 OBS Studio。
2. 解压 `obs-3dgs-0.1.0-beta.1-macos-universal.zip`。
3. 将 `obs-3dgs.plugin` 复制到 `~/Library/Application Support/obs-studio/plugins/`。
4. 启动 OBS，添加 `3DGS 场景`。

首个 Beta 不提供 Developer ID 签名或公证；macOS bundle 使用 Apple Silicon 所需的 ad-hoc 本地签名。如果 Gatekeeper 隔离了手动复制的开源插件，请先核对发布页 SHA-256，然后只对准确的 `obs-3dgs.plugin` 使用 Finder 的“打开”确认或移除隔离属性。

更新时关闭 OBS 并覆盖插件文件夹或 bundle；卸载时关闭 OBS 后删除。场景集合和镜头预设保存在 OBS 场景集合中，覆盖插件文件不会清除它们。

提交问题前请先查看[故障排查](troubleshooting.zh-CN.md)。
