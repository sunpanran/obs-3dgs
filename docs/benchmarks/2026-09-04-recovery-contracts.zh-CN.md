# 来源恢复与 WebGL 恢复验收

环境：Windows 11、OBS 32.2.2 隔离实例、RTX 4090；使用当前候选版的原生插件与 Web 资源。

## 来源序列化恢复

`tests/e2e/obs-source-restoration.lua` 在视频线程有机会完成销毁后，交替执行真正的 `obs_save_source`、移除和 `obs_load_source`，完成 100 次恢复。每次核对 UUID、42 mm 焦段、曝光、归一化相机角度、直播锁、预设 JSON、私有分类页和高级相机展开状态。

结果：[100 次全部通过](data/2026-09-04-source-restoration.json)。该测试覆盖来源持久化 API；完整场景集合的保存、重开和缺失文件定位另见已有测试，OBS 窗口按钮仍与人工验收分开记录。

## WebGL 上下文丢失

`npm run test:obs:context` 在独立的 640×360 网格来源中使用标准 `WEBGL_lose_context` 扩展触发丢失：

- 第一次丢失出现恢复状态，恢复后页面自动重载一次，输出 PNG 与原图 SHA-256 相同。
- 第二次丢失并恢复后没有第二次自动重载，页面保持错误提示，原生层收到 `webgl-context-restore-failed`。
- OBS WebSocket 持续响应；临时来源被删除。

精确设置、源文件哈希和结果：[JSON 报告](data/2026-09-04-context-recovery.json)。此为真实 CEF 上下文生命周期测试，不等同于拔出显卡或系统级驱动重置。

![超过自动恢复次数后的状态](assets/format-grid-context-retry-limit.png)

运行前设置本机 `OBS_WEBSOCKET_PASSWORD` 与 `OBS_LOG_PATH`，并仅对专用实例启用 CEF 调试。Lua 测试需先创建 `output/obs-source-restoration/`。结束后通过场景集合切换完成 OBS 保存，移除测试脚本注册，再关闭实例，防止异步保存使测试来源重新出现。
