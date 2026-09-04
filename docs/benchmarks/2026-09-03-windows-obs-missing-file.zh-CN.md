<!-- SPDX-License-Identifier: GPL-2.0-or-later -->

# Windows OBS 缺失文件恢复 — 2026-09-03

[English](2026-09-03-windows-obs-missing-file.md)

状态：在独立 OBS 场景集合中，启动时保留缺失路径和重新定位均通过。

| 项目 | 证据 |
|---|---|
| 主机 | Windows 10.0.26200、OBS 32.2.2 portable、NVIDIA GeForce RTX 4090 |
| 插件 DLL | SHA-256 `E32C398B0A00E073C91C03C3E90BB1B8AF73712C5CE3D42E6FD23F16687DEFB2` |
| 场景集合保存 | 通过切换到临时集合再切回，保存并重新载入当前集合；来源 UUID 保持不变 |
| 启动时缺失 | 重启前移动所选 SOG；OBS 保留保存路径，来源显示本地化的“文件不可读”状态 |
| 重新定位 | 指向移动后的 SOG 后成功加载，并在测试结束时恢复为仓库原始样例 |
| 画面一致 | 重定位版和恢复原始路径版截图 SHA-256 均为 `880aac9042aaa4a8e8cad48de6cb5bfd44b3c20a212874eee93e4897ea292dae` |

现在 OBS 缺失文件回调会读取持久化的 `asset_path`，即使启动时没有任何文件能成为活动场景也能报告缺失项。这修复了旧逻辑因运行时路径为空而漏报的问题。

证据：

- [机器可读恢复报告](data/2026-09-03-windows-missing-file.json)
- [缺失路径画面](assets/knock-community-hall-missing-path.png)
- [重新定位后的场景](assets/knock-community-hall-relinked.png)

命令需要在 OBS 重启前后分别执行：

```powershell
npm run test:obs:missing-file -- --mode prepare --url ws://127.0.0.1:4456 --obs-log <当前-obs-日志> --output output/obs-missing-file
npm run test:obs:missing-file -- --mode recover --url ws://127.0.0.1:4456 --obs-log <重启后-obs-日志> --output output/obs-missing-file
```

自动化测试执行了与缺失文件回调相同的设置更新；在 OBS“缺失文件”对话框中点击完成重新定位仍属于人工前端检查。
