// SPDX-License-Identifier: GPL-2.0-or-later

import type { LocaleCode } from "./protocol";

const EN = {
  chooseScene: "Choose a 3D Gaussian Splat scene",
  chooseSceneDetail: "Select a local PLY, SPZ, SOG, SPLAT, KSPLAT, ZIP, or RAD file in source properties.",
  loading: "Loading 3D Gaussian scene",
  preparing: "Preparing renderer…",
  ready: "Scene ready",
  failed: "Scene could not be loaded",
  webglLost: "Graphics context was lost",
  webglUnavailable: "WebGL2 is unavailable. Enable Browser Source hardware acceleration or update the graphics driver.",
  webglRestoring: "Trying to restore the scene…",
  locked: "Live safety lock is enabled",
  diagnostics: "Runtime diagnostics",
  renderer: "Renderer",
  scene: "Scene",
  resolution: "Resolution",
  fps: "FPS",
  frameP95: "P95 frame",
  focalLength: "Focal length",
  cameraDistance: "Camera distance",
  cameraTarget: "Camera target",
  activeSplats: "Active splats",
  horizontalFov: "Horizontal FOV",
  verticalFov: "Vertical FOV"
} as const;

export type TranslationKey = keyof typeof EN;

const ZH: Record<TranslationKey, string> = {
  chooseScene: "请选择一个 3D 高斯场景",
  chooseSceneDetail: "请在来源属性中选择本地 PLY、SPZ、SOG、SPLAT、KSPLAT、ZIP 或 RAD 文件。",
  loading: "正在加载 3D 高斯场景",
  preparing: "正在准备渲染器…",
  ready: "场景已就绪",
  failed: "无法加载场景",
  webglLost: "图形上下文已丢失",
  webglUnavailable: "WebGL2 不可用。请开启 Browser Source 硬件加速或更新显卡驱动。",
  webglRestoring: "正在尝试恢复场景…",
  locked: "直播防误触已开启",
  diagnostics: "运行诊断",
  renderer: "渲染器",
  scene: "场景",
  resolution: "分辨率",
  fps: "帧率",
  frameP95: "P95 帧时间",
  focalLength: "等效焦段",
  cameraDistance: "机位距离",
  cameraTarget: "取景中心",
  activeSplats: "可见高斯",
  horizontalFov: "水平视角",
  verticalFov: "垂直视角"
};

export class I18n {
  private locale: LocaleCode;

  constructor(locale: LocaleCode) {
    this.locale = locale;
  }

  setLocale(locale: LocaleCode): void {
    this.locale = locale;
    document.documentElement.lang = locale;
  }

  t(key: TranslationKey): string {
    return (this.locale === "zh-CN" ? ZH : EN)[key] ?? EN[key];
  }
}

export const translationKeysMatch = (): boolean => {
  const enKeys = Object.keys(EN).sort();
  const zhKeys = Object.keys(ZH).sort();
  return enKeys.length === zhKeys.length && enKeys.every((key, index) => key === zhKeys[index]);
};
