// SPDX-License-Identifier: GPL-2.0-or-later

#pragma once

#include "local-server.hpp"
#include "one-shot-authorization.hpp"

#include <obs.h>

#include <graphics/graphics.h>
#include <nlohmann/json.hpp>

#include <cstdint>
#include <atomic>
#include <chrono>
#include <functional>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

namespace obs3dgs {

struct SourceSummary {
  std::string uuid;
  std::string name;
  std::string status;
  double progress = 0.0;
  double fps = 0.0;
  double p95Ms = 0.0;
  bool ready = false;
  bool liveLock = false;
};

class Obs3dgsSource final {
public:
  Obs3dgsSource(obs_data_t *settings, obs_source_t *source);
  ~Obs3dgsSource();

  Obs3dgsSource(const Obs3dgsSource &) = delete;
  Obs3dgsSource &operator=(const Obs3dgsSource &) = delete;

  void update(obs_data_t *settings);
  void videoRender();
  void videoTick(float seconds);
  void show();
  void hide();
  void mouseClick(const obs_mouse_event *event, int32_t type, bool mouseUp, uint32_t clickCount);
  void mouseMove(const obs_mouse_event *event, bool mouseLeave);
  void mouseWheel(const obs_mouse_event *event, int xDelta, int yDelta);
  void focus(bool focused);
  void keyClick(const obs_key_event *event, bool keyUp);
  void enumSources(obs_source_enum_proc_t callback, void *parameter);

  [[nodiscard]] uint32_t width() const;
  [[nodiscard]] uint32_t height() const;
  [[nodiscard]] obs_properties_t *properties();
  [[nodiscard]] obs_missing_files_t *missingFiles();

  void sendCommand(const std::string &command, bool bypassLiveLock = false);
  void reloadAsset();
  void openInteraction();
  void resetSceneTransform();
  void resetAppearance();
  void exportDiagnostics();
  void applyPresetIndex(std::size_t index);
  void stepPreset(int direction);

  static void defaults(obs_data_t *settings);
  static std::vector<SourceSummary> sourceSummaries();
  static bool invokeCommand(const std::string &uuid, const std::string &command, bool bypassLiveLock = false);
  static bool setSetting(const std::string &uuid, const char *name, double value, bool bypassLiveLock = false);
  static bool setSetting(const std::string &uuid, const char *name, std::int64_t value, bool bypassLiveLock = false);
  static bool setSetting(const std::string &uuid, const char *name, bool value, bool bypassLiveLock = false);
  static bool setSetting(const std::string &uuid, const char *name, const std::string &value,
                         bool bypassLiveLock = false);
  static void notifyLocaleChanged();

private:
  void createOrUpdateBrowser();
  void createErrorTexture(const std::string &message);
  void destroyErrorTexture();
  void processRuntimeEvents();
  void processRuntimeEvent(const nlohmann::json &event);
  void updateRuntimeCamera(const nlohmann::json &camera);
  void sendState(bool allowLockedCameraPreset = false);
  void queueState(bool allowLockedCameraPreset = false);
  void sendVisibility(bool visible);
  void sendErrorStatus(const std::string &message);
  void sendJavascript(const nlohmann::json &message);
  void commitSettings(obs_data_t *settings);
  [[nodiscard]] std::string selectedSettingsPage() const;
  [[nodiscard]] bool advancedCameraExpanded() const;
  [[nodiscard]] std::string propertyStatusText() const;
  void persistSettingsPage(obs_data_t *settings, const std::string &page);
  void persistAdvancedCamera(obs_data_t *settings, bool expanded);
  static bool settingsPageModified(void *data, obs_properties_t *properties, obs_property_t *property,
                                   obs_data_t *settings);
  static bool advancedCameraModified(void *data, obs_properties_t *properties, obs_property_t *property,
                                     obs_data_t *settings);
  bool isLiveLocked() const;
  bool commandAllowed(const std::string &command) const;
  static std::string effectiveLocale(obs_data_t *settings);
  static nlohmann::json colorJson(std::uint64_t color);
  static bool updateSettingValue(const std::string &uuid, const char *name, bool bypassLiveLock,
                                 const std::function<void(obs_data_t *)> &setter);

  obs_source_t *source_ = nullptr;
  obs_source_t *browser_ = nullptr;
  obs_data_t *committedSettings_ = nullptr;
  gs_texture_t *errorTexture_ = nullptr;
  std::shared_ptr<RuntimeMailbox> mailbox_;
  std::string sourceId_;
  std::string activeAssetPath_;
  std::string lastReadyAssetPath_;
  std::string rollbackAssetPath_;
  std::string localAssetUrl_;
  std::string fileType_ = "auto";
  std::string nativeError_;
  std::string runtimeStatus_ = "waiting";
  std::string rendererName_;
  std::string lastQualityPreset_;
  std::uint64_t assetRevision_ = 0;
  std::uint64_t messageRevision_ = 0;
  std::uint64_t lastRuntimeRevision_ = 0;
  std::atomic<double> progress_{0.0};
  std::atomic<double> fps_{0.0};
  std::atomic<double> p95Ms_{0.0};
  std::atomic_bool runtimeReady_{false};
  std::atomic_bool bridgeReady_{false};
  OneShotAuthorization lockedUpdateAuthorization_;
  bool restoringInitialSettings_ = true;
  bool frameOnNextLoad_ = false;
  bool assetLoadPending_ = false;
  bool largeFileWarning_ = false;
  std::size_t activePresetIndex_ = 0;
  std::uint32_t browserWidth_ = 0;
  std::uint32_t browserHeight_ = 0;
  std::uint32_t browserFps_ = 0;
  std::atomic_bool statePending_{false};
  std::atomic_bool presetBypassPending_{false};
  std::chrono::steady_clock::time_point lastStateSent_{};
  mutable std::mutex statusMutex_;

  static std::mutex registryMutex_;
  static std::vector<Obs3dgsSource *> registry_;
};

void registerSource();

} // namespace obs3dgs
