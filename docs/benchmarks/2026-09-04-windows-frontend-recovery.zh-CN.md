# Windows 前端问题回归 — 2026-09-04

[English](2026-09-04-windows-frontend-recovery.md)

用户在 Windows 11 / OBS 32.2.2 的人工验收中发现两个问题：点击“打开实时控制面板”后内容不可见；在“缺失文件”窗口选择新文件并应用时 OBS 崩溃。修复后的自动化回归通过，用户已确认相关菜单和按钮复测通过，结果记录在[人工验收清单](../manual-acceptance.zh-CN.md)中。

## 原因及修复

- **控制面板内容不可见：** OBS 注册 Dock 时已经隐藏外框，插件又显式隐藏了内部 QWidget。显示外框无法自动显示这个被单独隐藏的子控件。现在由 OBS 管理初始外框状态，打开面板时恢复外框和内容；Qt 回归验证预设按钮可见及关闭后重新打开。
- **缺失文件应用时崩溃：** `obs_source_replace_missing_file` 传给回调的是插件的 `source->context.data`。原回调误将其当作 `obs_source_t *`，与用户崩溃栈中 `OBSMissingFiles::saveFiles → obs_source_update → 0x3` 相符。现在从 `Obs3dgsSource` 实例取得正确来源句柄。
- **锁定状态下的文件恢复：** 明确的“缺失文件”确认获得一次恢复授权；原生层和渲染层只接受本次资源替换，继续保留直播锁和其他参数。恢复不执行自动重新取景。测试同时确认恢复后的普通编辑仍被锁定。

## 实测证据

- 严格 Windows 原生编译通过；3 组 CTest 通过，包含真实 Qt 控件的显示/重新打开回归。
- Web：69 项测试通过，其中 13 项覆盖资源恢复授权及其边界；类型检查、lint 和生产构建通过。
- 真实 Windows OBS / RTX 4090：通过[Lua 回归](../../tests/e2e/obs-missing-file-callback.lua)调用 `obs_missing_file_issue_callback`，与“缺失文件”窗口的分发入口相同。33 项检查全部通过。
- 普通重新定位及锁定状态重新定位均实际启动 CEF/Spark 渲染，并报告场景就绪。路径、来源 UUID、曝光、预设、分类和高级相机状态保留；新路径写入序列化数据。
- 相机断言：73 mm、机位距离 7.5、取景中心 X = 1.2、水平角度 17°；恢复后保持相同值。曝光为 1.25。
- 场景：仓库原创 `format-grid.ply`，复制到带空格和中文的测试路径，许可为 GPL-2.0-or-later。图形后端为 ANGLE / Direct3D 11，RTX 4090。该检查验证实际加载和状态恢复，不是性能基准。

结果及测试 DLL/场景哈希见[回归 JSON](data/2026-09-04-missing-file-callback.json)。之前通过 WebSocket 直接设置 `asset_path` 的恢复检查没有调用原生缺失文件回调，因此未覆盖本次崩溃入口。

## 复现回归

1. 使用独立 Windows OBS 测试配置，安装当前构建。准备 `tmp/obs-missing-callback-fixtures/` 和 `output/obs-missing-file-callback/` 两个目录，将 `public/samples/format-grid.ply` 复制为前一目录中的 `relocated 场景.ply`。
2. 在独立测试场景集合中，通过 OBS“工具 → 脚本”载入 `tests/e2e/obs-missing-file-callback.lua`。脚本使用 OBS 自带 LuaJIT FFI 调用 libobs 分发器，创建并清理自己命名的测试来源。
3. 等待 `output/obs-missing-file-callback/report.json` 更新，确认 `passed: true`。脚本覆盖普通恢复、清除文件、锁定恢复及恢复后仍受保护的普通编辑；完成后移除该测试脚本。

用户复测入口：来源属性 →“打开实时控制面板”→“确定”关闭属性窗口；在 Dock 向下滚动到“镜头预设 → 保存当前”，再到 OBS“设置 → 热键”绑定对应来源的预设。缺失文件窗口重新定位后，应恢复画面且不再崩溃。
