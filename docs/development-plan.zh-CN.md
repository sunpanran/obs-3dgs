# 已确认开发方案与接续记录

本文件保存已确认的开发方案和接续基线。实际实现的调整和验收状态见测试文档；历史方案中的版本不应覆盖当前 lockfile。

## 2026-09-04 接续基线

- 已实现：原生来源、私有 Browser Source、安全本地服务器、Spark 渲染、六类属性页、Dock、镜头预设、热键。
- 现有证据：100 次空来源增删、20 次 SOG 加载卸载、30 分钟静止录制、锁定/透明/加载回滚、实例隔离、缺失路径保存和恢复。
- 角度归一化已完成，1280×720 前后截图像素一致，803.45° 归一化为 83.45°。
- Dock 修复已编写：轮询不覆盖未提交输入/拖动；延迟修改绑定原来源；预设浏览不被轮询重置。
- 当前构建与验证：51 项 Web 测试、3 组 CTest 通过，Windows 严格编译通过。
- 待完成：真实渲染逐帧与静止缓存证据、剩余格式与集成覆盖、最新 Windows 包与验收说明、macOS CI 和 Apple Silicon 实测。
- 当前没有 Git remote；不得将未运行的 macOS CI 或真机测试标为通过。

## 已接受的后续调整

- 2026-09-04：用户确认 Windows 验证完成；随后要求移除独立语言选择，始终跟随 OBS，并清理项目介绍中的语言宣传措辞。

- 2026-09-04 发布条件调整：用户负责 Windows 七项前端人工验收，通过后可公开 `0.1.0-beta.1`。macOS 实机验证可在 Beta 发布后补做，README 和发布说明必须明确写出尚未验证；这不代表 Mac 安装、渲染或 M1 性能已经通过。README 必须提供下载入口、分平台安装步骤及测试场景。
- 属性页使用六类下拉，每次显示一类，导航记忆和高级相机展开状态存于来源私有设置。完整条件显隐要求已实现。
- 属性页焦段改为 16–200 mm 纯数值输入，保留快捷镜头。
- Vite/Vitest/Node 工具链调整见 `dependency-decisions.zh-CN.md`。
- macOS SDK 已单独固定为 OBS 32.1.2 / 2025-08-23 依赖，保留 macOS 12 部署目标；Windows 使用 OBS 32.2.2 / 2026-07-15 依赖。Universal 构建仍须执行验证。

---

# `obs-3dgs` 最终开发方案

## 1. 项目目标与固定范围

开发一个开源、简单流畅的 OBS 3D Gaussian Splatting 来源插件：

- 安装方式为复制插件文件夹，不制作系统安装器。
- OBS“添加来源”中显示 `3DGS 场景 / 3DGS Scene`。
- 选择本地高斯文件后异步加载，效果直接显示在 OBS 主画布。
- 支持场景变换、摄影化相机控制、显示设置、画质预设和镜头预设。
- 属性页负责首次配置，Dock 负责直播中快速调整。
- 使用 Spark 负责高斯格式解析、LOD、排序和渲染，不重复开发 3DGS 引擎。[Spark](https://github.com/sparkjsdev/spark)

平台与范围：

- Windows 10/11 x64。
- macOS 12+ Universal，arm64+x86_64。
- OBS 32.0+。
- 不支持 Linux。
- 一个来源加载一个本地静态高斯文件。
- 不支持远程 URL、2DGS、4DGS、动态高斯、音频和 HDR。
- 输出 SDR sRGB/Rec.709。
- 全仓 GPL-2.0-or-later。
- 首个公开版本为 `0.1.0-beta.1`，提供未签名 ZIP。

## 2. 技术架构

```text
OBS 3DGS Source
├─ 来源属性页
├─ 实时控制 Dock
├─ 镜头预设与热键
├─ 安全本地文件服务器
└─ 私有 browser_source
          ↓ javascript_event
Spark + Three.js WebGL2
├─ 格式解析
├─ 场景变换
├─ 摄影相机
├─ LOD与排序
└─ SDR RGBA输出
```

### 原生层

- C++20、Qt 6、libobs，原生代码放在 `plugin/`。
- 注册 `obs_3dgs_source` 输入来源，包含视频、自定义绘制、交互和 sRGB 能力。
- 每个来源通过 `obs_source_create_private("browser_source", ...)` 创建独立子来源。
- 转发渲染、宽高、显示/激活状态、鼠标、滚轮、键盘、焦点和子来源生命周期。
- 允许复制来源；复制后相机、预设和参数独立。
- Browser Source 缺失、服务器失败或 WebGL2 不可用时显示内置错误纹理。
- 使用 `obs_frontend_open_source_interaction()` 打开 OBS 原生交互窗口。[OBS Frontend API](https://docs.obsproject.com/reference-frontend-api)

### Web 渲染层

- 严格 TypeScript，放在 `src/`。
- 固定依赖：
  - `@sparkjsdev/spark@2.1.0`
  - `three@0.180.0`
  - `vite@5.4.21`
  - `typescript@5.9.3`
- 构建后的 JS、WASM、Worker 和资源随插件发布；用户运行时不需要 Node.js或网络。
- 每个来源创建一个 `SparkRenderer` 和一个 `SplatMesh`。
- WebGL2 开启预乘 Alpha、关闭 MSAA、使用 sRGB 输出。
- 静止后停止持续排序和重绘；交互、参数变化和加载期间按目标 FPS 更新。
- 更换模型采用 staging，成功后再替换并释放旧模型。
- WebGL context loss 自动恢复一次，失败后进入稳定错误状态。

### 本地服务器

- 使用固定版本 `cpp-httplib`，进程级单例、按需启动。
- 仅绑定 `127.0.0.1` 随机端口，禁止回退到 `0.0.0.0`。
- 只映射用户明确选择的规范化文件，不暴露所在目录。
- URL 包含来源 UUID、资源 revision 和每次启动生成的随机令牌。
- 支持 GET、HEAD、Range 和取消加载。
- 禁止目录浏览、路径穿越、符号链接逃逸和无令牌请求。
- 非 RAD 文件超过 1GiB警告，超过 2GiB拒绝。
- 端口、令牌和运行时 URL 不写入场景集合。

## 3. 控制协议与持久化

原生层通过 Browser Source 的 `javascript_event` 发送 `obs3dgs:message`。[obs-browser 实现](https://github.com/obsproject/obs-browser/blob/master/obs-browser-source.cpp)

```text
protocolVersion: 1
sourceId: OBS来源UUID
revision: 单调递增整数
type: state | command | locale | visibility

payload:
  asset:
    localUrl
    fileType
    coordinatePreset
  output:
    width
    height
    renderScale
    targetFps
    background
  scene:
    position
    rotationDeg
    scale
    opacity
    recolor
    maxSh
  camera:
    target
    yawDeg
    pitchDeg
    rollDeg
    distance
    focalLengthMm
    filmGaugeMm
  quality:
    preset
    lodEnabled
    lodSplatCount
  safety:
    liveLock
```

规则：

- `filmGaugeMm` 固定为 36。
- 网页忽略旧 revision。
- 连续滑杆更新合并为每秒最多 30 次。
- Web 端通过 `/api/v1/sources/{sourceId}/events` 回传：
  - `ready`
  - `progress`
  - `cameraChanged`
  - `metrics`
  - `error`
- 反向请求必须携带令牌，正文不超过 64KB。
- 相机与性能状态每秒最多回传 10 次。
- 来源设置使用 `settingsSchemaVersion: 1`。
- 运行时 URL、端口、令牌和临时加载状态不持久化。

## 4. 安装体验

### Windows

发布包：

```text
obs-3dgs-0.1.0-beta.1-windows-x64.zip
└─ obs-3dgs/
   ├─ bin/64bit/obs-3dgs.dll
   └─ data/
      ├─ locale/
      ├─ web/
      ├─ images/
      └─ licenses/
```

用户关闭 OBS，将整个 `obs-3dgs` 文件夹复制到：

```text
C:\ProgramData\obs-studio\plugins\
```

### macOS

发布包：

```text
obs-3dgs-0.1.0-beta.1-macos-universal.zip
└─ obs-3dgs.plugin
```

用户关闭 OBS，将插件复制到：

```text
~/Library/Application Support/obs-studio/plugins/
```

- 更新：关闭 OBS 后覆盖原文件夹。
- 卸载：关闭 OBS 后删除插件文件夹。
- 不制作 `.exe`、`.msi` 或 `.pkg`。
- 每个 ZIP 提供 SHA-256、安装说明和未签名警告。
- 覆盖更新必须保留 OBS 场景集合和镜头预设。[OBS 插件目录规范](https://obsproject.com/kb/plugins-guide)

## 5. 首次使用流程

1. 用户点击 OBS“来源”区域的 `+`。
2. 选择 `3DGS 场景 / 3DGS Scene`。
3. 使用 OBS 原生命名窗口创建来源。
4. 属性页自动打开。
5. 空来源显示“请选择一个 3D 高斯场景”。
6. 用户点击“浏览”选择文件。
7. 插件立即验证路径、格式和大小。
8. 后台加载并在主画布显示进度。
9. 加载成功后读取包围盒、自动选择坐标方向并执行“显示全部”。
10. 场景立即出现在主画布，无需额外点击“应用”。
11. 属性页中的参数修改实时更新主画布。
12. 用户点击“打开实时控制面板”后显示 Dock；插件不自动改变 OBS 布局。

其他行为：

- 新文件加载失败时保留上一张有效场景。
- 重载同一文件保留相机。
- 更换文件自动重新构图。
- 加载途中选择新文件会取消旧任务。
- 属性页点击“取消”时恢复打开前状态。
- 插件不自动修改来源层级，只提示用户将背景拖到摄像头下方。

## 6. 属性页设计

### 场景文件

- 文件路径、浏览、重新加载。
- 格式、正式/实验标签、文件大小。
- 加载进度和错误。
- 坐标预设：
  - 自动
  - OpenGL/Y-up
  - OpenCV/绕 X 轴 180°
  - Z-up

格式等级：

- 正式：PLY、Compressed PLY、SPZ、SOG。
- 实验：SPLAT、KSPLAT、ZIP、RAD。

### 场景变换

- 位置 X/Y/Z：数值框 + 滑杆。
- 旋转 X/Y/Z：角度数值框 + 滑杆。
- 统一缩放：数值框 + 对数手感滑杆。
- `复位场景变换`。

不提供非均匀缩放和 3D Gizmo。

### 相机

主界面使用全画幅等效焦段，不直接编辑 FOV：

```text
镜头预设
[16] [24] [35] [50] [85] [135] mm

等效焦段   [────●────] [35 mm]
水平角度   [────●────] [35.0°]
俯仰角度   [────●────] [-12.0°]
机位距离   [────●────] [4.20]

水平视角：54.4° · 垂直视角：32.3°
[显示全部] [复位相机]
[鼠标调整视角]
```

规则：

- 默认 35mm，可输入 16–200mm。
- 传感器宽度固定为 36mm。
- 调整焦段采用真实光学变焦：机位不动，只改变视角。
- 画面比例变化后重新应用焦段，保持毫米值不变。
- 水平/垂直 FOV 只读派生。
- 鼠标滚轮改变机位距离，不改变焦段。
- 不显示光圈、ISO、快门、对焦距离和景深。

高级相机参数：

- 取景中心 X/Y/Z。
- Roll。
- 近/远裁剪，默认自动。
- 传感器宽度 36mm，只读。
- 水平/垂直 FOV，只读。

### 显示

- 背景：纯黑不透明（默认）、自定义颜色、透明。
- 场景透明度。
- 场景染色，默认白色。
- SH 阶数 0–3。
- 色调映射：无、线性、ACES。
- 曝光。
- `复位外观`。

### 质量

| 预设 | 内部比例 | LOD预算 | SH | 交互FPS |
|---|---:|---:|---:|---:|
| 性能 | 50% | 500K | 1 | 30 |
| 平衡（默认） | 75% | 1M | 2 | 60 |
| 质量 | 100% | 1.5M | 3 | 60 |
| 自定义 | 用户设置 | 250K–4M | 0–3 | 15–60 |

高级设置默认折叠，包含自定义分辨率、内部比例、LOD、隐藏时释放、设备信息和诊断导出。

## 7. 三个关键操作

### 显示全部 / Frame All

- 将取景中心移动到场景包围盒中心。
- 保留当前焦段、水平角度和俯仰角度。
- 根据焦段、宽高比和包围球计算机位距离。
- 保留约 10% 画面边距。
- 不移动、缩放、旋转、裁剪或修改高斯场景本身。
- 85mm 镜头会退得更远，24mm 镜头会靠得更近。

### 复位相机 / Reset Camera

- 恢复首次加载得到的取景中心。
- 恢复默认水平角度和俯仰角度。
- 恢复 35mm 焦段。
- 恢复自动构图距离。

### 鼠标调整视角 / Open Interactive View

- 调用 OBS 原生来源交互窗口。
- 左键拖动：环绕。
- 右键拖动：平移取景中心。
- 滚轮：推近/拉远机位。
- `R`：复位相机。
- 关闭窗口后保留镜头并同步回 Dock。
- 只改变3D相机，不改变场景变换或 OBS 的2D来源位置。

## 8. 实时控制 Dock

Dock 不包含第二个渲染预览，只使用 OBS 主画布。

```text
3DGS 实时控制
来源：[客厅背景 ▼]  ● 已就绪 59.8 FPS
质量：[平衡 ▼]      直播防误触 [○]

场景变换
位置 X/Y/Z
旋转 X/Y/Z
统一缩放
[复位场景]

相机
[16][24][35][50][85][135] mm
等效焦段
水平角度
俯仰角度
机位距离
[显示全部] [复位相机]
[鼠标调整视角]

镜头预设
[主播近景 ▼]
[应用] [保存当前] [删除]
[上一个] [下一个]
```

行为：

- 自动跟随 OBS 当前选中的 3DGS 来源，也允许手动选择。
- 属性页、Dock 和交互窗口共享同一个原生状态。
- 最多保存 16 个命名镜头预设。
- 预设保存取景中心、水平角度、俯仰角度、Roll、机位距离和等效焦段。
- 提供复位、上一个、下一个、预设 1–4 的 OBS 热键。

### 直播防误触 / Live Safety Lock

默认关闭。开启后锁定：

- 更换和重新加载模型。
- 场景位置、旋转和缩放。
- 焦段、机位角度、距离和取景中心。
- 显示和质量参数。
- 显示全部、复位、保存和删除预设。
- 交互窗口中的鼠标和键盘相机操作。

仍允许：

- 应用已经保存的镜头预设。
- 上一个/下一个预设。
- 预设快捷键。
- 查看加载、性能和错误状态。

它不锁定 OBS 来源层；OBS 来源列表中的2D锁仍由 OBS 自己管理。

## 9. 界面文本

- 界面跟随 `obs_get_locale()`，不提供独立语言选择。
- 文本集中存放在语言资源文件中，缺失条目回退到英文。
- CI 检查资源 key 一致。
- `SH`、`LOD`、等效焦段和坐标系提供工具提示。
- README、安装和故障排查文档说明实际操作。

## 10. 环境与依赖安装

当前环境：

- 已安装 Git 2.45。
- 已安装 Node.js 20.15 和 npm。
- 已安装 OBS 32.2.2 与 Browser Source。
- 已安装 RTX 4090。
- 未检测到 Visual Studio C++ Build Tools、CMake、Ninja 或 MSBuild。
- 仓库尚无提交，现有 `AGENTS.md` 必须保留且不得覆盖。

实施时自行安装缺失环境和依赖：

- Windows 使用现有 `winget` 安装：
  - Visual Studio 2022 Build Tools。
  - Desktop development with C++ / MSVC v143。
  - Windows 10/11 SDK。
  - CMake 3.30.x。
  - Ninja。
- 不重复安装已有 Git、Node.js、npm 和 OBS。
- 不升级无关系统组件。
- 安装后验证 `cmake`、`ninja`、`cl`、`msbuild` 和 OBS SDK 构建。
- Web 依赖通过 `npm ci` 安装，全部写入 lockfile。
- OBS、Qt 和预构建依赖使用官方模板的固定版本下载机制，并更新到 OBS 32.2.2 匹配版本。
- macOS 使用 GitHub Actions 的 Xcode 16/macOS runner 构建 Universal 插件；公开 Beta 前再用 Apple Silicon 真机验证。
- 需要管理员权限或系统 UAC 时允许正常请求提升，不使用非官方破解或来源不明的工具链。

## 11. 仓库、示例与发布

遵循现有 `AGENTS.md`：

- `src/`：Web 渲染与协议。
- `plugin/`：原生 OBS 插件。
- `tests/`：自动与集成测试。
- 固定命令：
  - `npm ci`
  - `npm run dev`
  - `npm run build`
  - `npm test`
  - `npm run lint`

示例素材：

- 使用 CC BY 4.0 的 `Knock Community Hall` 作为公开复现样例。[素材页面](https://superspl.at/scene/0ff2e6dc)
- 样例放在仓库并附许可证和作者信息。
- 样例不打进插件发布 ZIP。
- 不提交私有、大型或许可不明确的场景。

发布：

- Windows x64 ZIP。
- macOS Universal ZIP。
- 不生成安装器和 Linux 包。
- 发布 SHA-256、SBOM、第三方许可证、使用说明和已知限制。
- 不上传遥测；诊断只能由用户手动导出到本地。
- 诊断默认隐藏完整文件路径，只保留文件名和大小。

## 12. 实施顺序

1. 建立 Web/Spark 最小验证页和控制协议。
2. 在普通 OBS Browser Source 中验证 1080p60、Alpha、交互和静止缓存。
3. 安装缺失 Windows 原生工具链。
4. 建立 OBS 插件骨架与安全本地服务器。
5. 实现私有 Browser Source 包装与双向事件桥。
6. 实现来源属性页和实时 Dock。
7. 实现场景变换、摄影相机、显示全部、复位和交互窗口。
8. 实现质量档位、LOD、按需渲染和直播防误触。
9. 实现镜头预设、热键和界面文本。
10. 完成正式/实验格式及错误恢复。
11. 完成 Windows 长时测试。
12. 构建 macOS Universal 并进行 Apple Silicon 真机测试。
13. 发布 `0.1.0-beta.1`。

如果 Spark 在普通 OBS Browser Source 中无法达到 Windows 1080p60 或 M1 1080p30门槛，则暂停原生 UI 开发，先对比 SuperSplat Viewer；v0.1 不临时转向自研 D3D11 渲染器。

## 13. 测试与发布门槛

自动测试：

- 协议 revision、状态序列化和设置迁移。
- 焦段与水平/垂直 FOV 换算。
- 画面比例变化后保持焦段。
- 显示全部保持镜头方向和焦段。
- 直播防误触允许/禁止矩阵。
- 两种语言 key 完整一致。
- 四种正式格式的合法、截断和损坏文件。
- 实验格式 smoke test。
- 路径穿越、无效令牌、Range、取消和 2GiB上限。
- Windows/macOS 构建和发布包目录。

OBS 集成测试：

- 文件夹安装、覆盖更新、卸载。
- 创建、复制、删除和恢复来源各 100 次。
- 场景集合保存、重新打开和缺失文件重新定位。
- 加载途中换文件、取消属性页、失败保留旧画面。
- 属性页、Dock、镜头预设和交互窗口同步。
- 直播锁定下不得通过鼠标、滑杆或属性页改变被锁参数。
- 24/35/50/85mm之间切换时机位保持不动。
- 透明背景与摄像头、色块和常用滤镜正确合成。
- 20 次加载/卸载后无持续内存增长。

性能门槛：

- RTX 4090：平衡档 1080p60，录制 30 分钟，平均 ≥58 FPS、P95 ≤20ms、OBS 渲染延迟丢帧 <0.5%。
- Stable 前 RTX 4060 8GB达到同标准；Beta 可标记待验证。
- Apple M1：平衡画质 1080p30，平均 ≥29 FPS、P95 ≤36ms、渲染延迟丢帧 <0.5%。
- M2 及以上以平衡档 1080p60为目标，不阻塞首个 Beta。
- 场景和相机静止后停止持续排序和重绘。

## 14. 最终默认值

- 来源名称：`3DGS 场景 / 3DGS Scene`。
- 本地单文件。
- 自动坐标方向。
- 首次加载自动“显示全部”。
- 场景位置和旋转为 0，统一缩放为 1。
- 全画幅等效焦段 35mm。
- 可调焦段 16–200mm。
- 六档快捷焦段：16、24、35、50、85、135mm。
- 真实光学变焦。
- 纯黑不透明背景。
- 平衡画质。
- 跟随 OBS 基础画布。
- 交互目标 60 FPS，静止按需重绘。
- SH2、曝光 1、无色调映射。
- 隐藏时保留模型。
- 直播防误触默认关闭。
- 语言自动跟随 OBS。
