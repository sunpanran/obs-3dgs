<!-- SPDX-License-Identifier: GPL-2.0-or-later -->

# 为 obs-3dgs 贡献代码

[English](CONTRIBUTING.md)

感谢你帮助 3D Gaussian Splatting 更实用地进入 OBS。请保持改动聚焦，并继续分离原生 OBS 集成层（`plugin/`）与 Spark 渲染层（`src/`）。

## 修改前

- 大型界面、协议、依赖、格式支持或架构调整请先在 Issue 中讨论。
- 不要提交私有场景、凭据、生成的构建目录或许可证不明确的素材。
- 可再分发的测试素材放入 `public/samples/`，并附相邻的署名与许可证。SOG 样例使用 Git LFS。
- 所有导入文件均视为不可信输入；进入解析器前必须校验数量、大小、偏移、数值与分配边界。

## 开发检查

使用 Node.js 24+、npm 11+，原生环境要求见 README。

```text
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

原生改动还需使用对应 CMake 预设构建并运行 CTest。Windows 提交前请使用 `windows-ci-x64`，确保编译警告会导致失败。

渲染改动必须记录场景及许可证、相机姿态、焦段、输出分辨率、内部比例、画质档位、GPU、平均 FPS、P95 帧时间和截图。不要为了复现问题而上传私有场景。

## Pull Request

提交信息使用 Conventional Commits，例如 `feat: add SOG loading diagnostics` 或 `fix: preserve custom focal length`。PR 需说明范围、列出执行过的命令、关联 Issue，并为渲染改动附上视觉或性能证据。

提交贡献即表示你同意以 GPL-2.0-or-later 许可发布该贡献。
