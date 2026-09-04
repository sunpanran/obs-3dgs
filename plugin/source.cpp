// SPDX-License-Identifier: GPL-2.0-or-later

#include "source.hpp"
#include "angle-utils.hpp"
#include "dock.hpp"
#include "lens-presets.hpp"
#include "localization.hpp"
#include "property-ui.hpp"
#include "property-ui-state.hpp"
#include "settings-snapshot.hpp"

#include <obs-frontend-api.h>
#include <obs-module.h>

#include <QColor>
#include <QFont>
#include <QFileDialog>
#include <QFileInfo>
#include <QImage>
#include <QPainter>
#include <QSaveFile>
#include <QString>
#include <QSysInfo>

#include <algorithm>
#include <array>
#include <cmath>
#include <cstring>
#include <limits>
#include <numbers>

#define obs_module_text(key) obs3dgs::text(key)

namespace obs3dgs {
namespace {

constexpr const char *SOURCE_ID = "obs_3dgs_source";
constexpr int SETTINGS_SCHEMA_VERSION = 1;

constexpr const char *KEY_SCHEMA = "settings_schema_version";
constexpr const char *KEY_ASSET = "asset_path";
constexpr const char *KEY_COORDINATE = "coordinate_preset";
constexpr const char *KEY_WIDTH = "output_width";
constexpr const char *KEY_HEIGHT = "output_height";
constexpr const char *KEY_FOLLOW_CANVAS = "follow_canvas";
constexpr const char *KEY_RENDER_SCALE = "render_scale";
constexpr const char *KEY_TARGET_FPS = "target_fps";
constexpr const char *KEY_BACKGROUND_MODE = "background_mode";
constexpr const char *KEY_BACKGROUND_COLOR = "background_color";
constexpr const char *KEY_POSITION_X = "position_x";
constexpr const char *KEY_POSITION_Y = "position_y";
constexpr const char *KEY_POSITION_Z = "position_z";
constexpr const char *KEY_ROTATION_X = "rotation_x";
constexpr const char *KEY_ROTATION_Y = "rotation_y";
constexpr const char *KEY_ROTATION_Z = "rotation_z";
constexpr const char *KEY_SCALE = "scene_scale";
constexpr const char *KEY_OPACITY = "scene_opacity";
constexpr const char *KEY_RECOLOR = "scene_recolor";
constexpr const char *KEY_MAX_SH = "max_sh";
constexpr const char *KEY_CAMERA_TARGET_X = "camera_target_x";
constexpr const char *KEY_CAMERA_TARGET_Y = "camera_target_y";
constexpr const char *KEY_CAMERA_TARGET_Z = "camera_target_z";
constexpr const char *KEY_CAMERA_YAW = "camera_yaw";
constexpr const char *KEY_CAMERA_PITCH = "camera_pitch";
constexpr const char *KEY_CAMERA_ROLL = "camera_roll";
constexpr const char *KEY_CAMERA_DISTANCE = "camera_distance";
constexpr const char *KEY_FOCAL_LENGTH = "focal_length_mm";
constexpr const char *KEY_AUTO_CLIPPING = "camera_auto_clipping";
constexpr const char *KEY_NEAR_CLIP = "camera_near_clip";
constexpr const char *KEY_FAR_CLIP = "camera_far_clip";
constexpr const char *KEY_TONE_MAPPING = "tone_mapping";
constexpr const char *KEY_EXPOSURE = "exposure";
constexpr const char *KEY_QUALITY_PRESET = "quality_preset";
constexpr const char *KEY_LOD_ENABLED = "lod_enabled";
constexpr const char *KEY_LOD_COUNT = "lod_splat_count";
constexpr const char *KEY_LIVE_LOCK = "live_lock";
constexpr const char *KEY_HIDE_RELEASE = "release_when_hidden";
constexpr const char *KEY_PRESETS = "camera_presets_json";
constexpr const char *KEY_ACTIVE_PRESET = "active_camera_preset";
constexpr const char *KEY_PROPERTY_STATUS = "obs3dgs_property_status";

constexpr std::array ADVANCED_CAMERA_PROPERTIES = {
    KEY_CAMERA_TARGET_X, KEY_CAMERA_TARGET_Y,   KEY_CAMERA_TARGET_Z,
    KEY_CAMERA_ROLL,     "camera_sensor_width", KEY_AUTO_CLIPPING,
};

constexpr std::array LOCKED_PROPERTY_NAMES = {
    KEY_ASSET,           "reload_asset",      KEY_COORDINATE,       KEY_POSITION_X,     KEY_POSITION_Y,
    KEY_POSITION_Z,      KEY_ROTATION_X,      KEY_ROTATION_Y,       KEY_ROTATION_Z,     KEY_SCALE,
    "reset_scene",       KEY_FOCAL_LENGTH,    "lens_preset_mm",     KEY_CAMERA_YAW,     KEY_CAMERA_PITCH,
    KEY_CAMERA_DISTANCE, "frame_all",         "reset_camera",       "open_interaction", KEY_CAMERA_TARGET_X,
    KEY_CAMERA_TARGET_Y, KEY_CAMERA_TARGET_Z, KEY_CAMERA_ROLL,      KEY_AUTO_CLIPPING,  KEY_NEAR_CLIP,
    KEY_FAR_CLIP,        KEY_BACKGROUND_MODE, KEY_BACKGROUND_COLOR, KEY_OPACITY,        KEY_RECOLOR,
    KEY_MAX_SH,          KEY_TONE_MAPPING,    KEY_EXPOSURE,         "reset_appearance", KEY_QUALITY_PRESET,
    KEY_RENDER_SCALE,    KEY_LOD_ENABLED,     KEY_LOD_COUNT,        KEY_TARGET_FPS,     KEY_FOLLOW_CANVAS,
    KEY_WIDTH,           KEY_HEIGHT,          KEY_HIDE_RELEASE,
};

constexpr std::array RUNTIME_STRING_SETTINGS = {
    KEY_ASSET, KEY_COORDINATE, KEY_BACKGROUND_MODE, KEY_TONE_MAPPING, KEY_QUALITY_PRESET,
};

constexpr std::array RUNTIME_DOUBLE_SETTINGS = {
    KEY_RENDER_SCALE,    KEY_POSITION_X,      KEY_POSITION_Y, KEY_POSITION_Z,   KEY_ROTATION_X,
    KEY_ROTATION_Y,      KEY_ROTATION_Z,      KEY_SCALE,      KEY_OPACITY,      KEY_CAMERA_TARGET_X,
    KEY_CAMERA_TARGET_Y, KEY_CAMERA_TARGET_Z, KEY_CAMERA_YAW, KEY_CAMERA_PITCH, KEY_CAMERA_ROLL,
    KEY_CAMERA_DISTANCE, KEY_FOCAL_LENGTH,    KEY_NEAR_CLIP,  KEY_FAR_CLIP,     KEY_EXPOSURE,
};

constexpr std::array RUNTIME_INT_SETTINGS = {
    KEY_WIDTH, KEY_HEIGHT, KEY_TARGET_FPS, KEY_BACKGROUND_COLOR, KEY_RECOLOR, KEY_MAX_SH, KEY_LOD_COUNT,
};

constexpr std::array RUNTIME_BOOL_SETTINGS = {
    KEY_FOLLOW_CANVAS,
    KEY_AUTO_CLIPPING,
    KEY_LOD_ENABLED,
    KEY_LIVE_LOCK,
};

std::uint64_t settingColor(obs_data_t *settings, const char *name)
{
  return static_cast<std::uint64_t>(obs_data_get_int(settings, name));
}

nlohmann::json vec3(obs_data_t *settings, const char *x, const char *y, const char *z)
{
  return {
      {"x", obs_data_get_double(settings, x)},
      {"y", obs_data_get_double(settings, y)},
      {"z", obs_data_get_double(settings, z)},
  };
}

double jsonNumber(const nlohmann::json &object, const char *key, double fallback, double minimum, double maximum)
{
  const auto found = object.find(key);
  if (found == object.end() || !found->is_number())
    return fallback;
  const double value = found->get<double>();
  return std::isfinite(value) ? std::clamp(value, minimum, maximum) : fallback;
}

bool jsonBoolean(const nlohmann::json &object, const char *key, bool fallback)
{
  const auto found = object.find(key);
  return found != object.end() && found->is_boolean() ? found->get<bool>() : fallback;
}

std::string jsonText(const nlohmann::json &object, const char *key, const std::string &fallback = {})
{
  const auto found = object.find(key);
  if (found == object.end() || !found->is_string())
    return fallback;
  return found->get<std::string>().substr(0, 512);
}

void addComboItem(obs_property_t *property, const char *textKey, const char *value)
{
  obs_property_list_add_string(property, obs_module_text(textKey), value);
}

void applyConditionalVisibility(obs_properties_t *properties, obs_data_t *settings)
{
  const bool transparent = std::strcmp(obs_data_get_string(settings, KEY_BACKGROUND_MODE), "transparent") == 0;
  const bool customQuality = std::strcmp(obs_data_get_string(settings, KEY_QUALITY_PRESET), "custom") == 0;
  const auto visibility = propertyVisibility(transparent, customQuality, obs_data_get_bool(settings, KEY_FOLLOW_CANVAS),
                                             obs_data_get_bool(settings, KEY_UI_ADVANCED_CAMERA),
                                             obs_data_get_bool(settings, KEY_AUTO_CLIPPING));

  setPropertyVisible(properties, KEY_BACKGROUND_COLOR, visibility.backgroundColor);
  for (const char *key : {KEY_RENDER_SCALE, KEY_LOD_ENABLED, KEY_LOD_COUNT, KEY_TARGET_FPS})
    setPropertyVisible(properties, key, visibility.qualityDetails);
  setPropertyVisible(properties, KEY_WIDTH, visibility.customSize);
  setPropertyVisible(properties, KEY_HEIGHT, visibility.customSize);
  for (const char *key : ADVANCED_CAMERA_PROPERTIES)
    setPropertyVisible(properties, key, visibility.advancedCamera);
  setPropertyVisible(properties, KEY_NEAR_CLIP, visibility.manualClipping);
  setPropertyVisible(properties, KEY_FAR_CLIP, visibility.manualClipping);
}

bool runtimeSettingsEqual(obs_data_t *left, obs_data_t *right)
{
  if (!left || !right)
    return false;
  for (const char *key : RUNTIME_STRING_SETTINGS) {
    if (std::strcmp(obs_data_get_string(left, key), obs_data_get_string(right, key)) != 0)
      return false;
  }
  for (const char *key : RUNTIME_DOUBLE_SETTINGS) {
    if (obs_data_get_double(left, key) != obs_data_get_double(right, key))
      return false;
  }
  for (const char *key : RUNTIME_INT_SETTINGS) {
    if (obs_data_get_int(left, key) != obs_data_get_int(right, key))
      return false;
  }
  for (const char *key : RUNTIME_BOOL_SETTINGS) {
    if (obs_data_get_bool(left, key) != obs_data_get_bool(right, key))
      return false;
  }
  return true;
}

bool propertiesButton(obs_properties_t *, obs_property_t *property, void *data)
{
  auto *self = static_cast<Obs3dgsSource *>(data);
  const char *name = obs_property_name(property);
  if (std::strcmp(name, "reload_asset") == 0)
    self->reloadAsset();
  else if (std::strcmp(name, "frame_all") == 0)
    self->sendCommand("frameAll");
  else if (std::strcmp(name, "reset_camera") == 0)
    self->sendCommand("resetCamera");
  else if (std::strcmp(name, "open_interaction") == 0)
    self->openInteraction();
  else if (std::strcmp(name, "open_dock") == 0)
    showControlDock();
  else if (std::strcmp(name, "reset_scene") == 0)
    self->resetSceneTransform();
  else if (std::strcmp(name, "reset_appearance") == 0)
    self->resetAppearance();
  else if (std::strcmp(name, "export_diagnostics") == 0)
    self->exportDiagnostics();
  else
    return false;
  return true;
}

bool liveLockModified(void *, obs_properties_t *properties, obs_property_t *, obs_data_t *settings)
{
  const bool enabled = !obs_data_get_bool(settings, KEY_LIVE_LOCK);
  for (const char *name : LOCKED_PROPERTY_NAMES) {
    if (auto *property = obs_properties_get(properties, name))
      obs_property_set_enabled(property, enabled);
  }
  applyConditionalVisibility(properties, settings);
  return true;
}

bool autoClippingModified(void *, obs_properties_t *properties, obs_property_t *, obs_data_t *settings)
{
  applyConditionalVisibility(properties, settings);
  return true;
}

bool followCanvasModified(void *, obs_properties_t *properties, obs_property_t *, obs_data_t *settings)
{
  applyConditionalVisibility(properties, settings);
  return true;
}

bool qualityPresetModified(void *, obs_properties_t *properties, obs_property_t *, obs_data_t *settings)
{
  applyConditionalVisibility(properties, settings);
  return true;
}

bool backgroundModified(void *, obs_properties_t *properties, obs_property_t *, obs_data_t *settings)
{
  applyConditionalVisibility(properties, settings);
  return true;
}

bool refreshDerivedCamera(void *, obs_properties_t *properties, obs_property_t *, obs_data_t *settings)
{
  const double focalLength = std::clamp(obs_data_get_double(settings, KEY_FOCAL_LENGTH), 16.0, 200.0);
  double width = static_cast<double>(obs_data_get_int(settings, KEY_WIDTH));
  double height = static_cast<double>(obs_data_get_int(settings, KEY_HEIGHT));
  if (obs_data_get_bool(settings, KEY_FOLLOW_CANVAS)) {
    obs_video_info videoInfo{};
    if (obs_get_video_info(&videoInfo)) {
      width = videoInfo.base_width;
      height = videoInfo.base_height;
    }
  }
  const double aspect = height > 0.0 ? width / height : 16.0 / 9.0;
  const double filmWidth = aspect >= 1.0 ? 36.0 : 36.0 * aspect;
  const double filmHeight = aspect >= 1.0 ? 36.0 / aspect : 36.0;
  const double horizontal = 2.0 * std::atan(filmWidth / (2.0 * focalLength)) * 180.0 / std::numbers::pi;
  const double vertical = 2.0 * std::atan(filmHeight / (2.0 * focalLength)) * 180.0 / std::numbers::pi;
  const QByteArray textValue = QString::fromUtf8(obs_module_text("Camera.FovReadout"))
                                   .arg(horizontal, 0, 'f', 1)
                                   .arg(vertical, 0, 'f', 1)
                                   .toUtf8();
  if (auto *fovProperty = obs_properties_get(properties, "camera_fov"))
    obs_property_set_description(fovProperty, textValue.constData());
  return true;
}

bool focalLengthModified(void *privateData, obs_properties_t *properties, obs_property_t *property,
                         obs_data_t *settings)
{
  obs_data_set_int(settings, "lens_preset_mm",
                   lensPresetForFocalLength(obs_data_get_double(settings, KEY_FOCAL_LENGTH)));
  return refreshDerivedCamera(privateData, properties, property, settings);
}

bool lensPresetModified(void *privateData, obs_properties_t *properties, obs_property_t *property, obs_data_t *settings)
{
  const auto selected = obs_data_get_int(settings, "lens_preset_mm");
  if (selected >= 16 && selected <= 200)
    obs_data_set_double(settings, KEY_FOCAL_LENGTH, static_cast<double>(selected));
  return refreshDerivedCamera(privateData, properties, property, settings);
}

void missingFileResolved(void *sourcePointer, const char *newPath, void *)
{
  auto *source = static_cast<obs_source_t *>(sourcePointer);
  if (!source || !newPath)
    return;
  obs_data_t *settings = obs_source_get_settings(source);
  obs_data_set_string(settings, KEY_ASSET, newPath);
  obs_source_update(source, settings);
  obs_data_release(settings);
}

void procCommand(void *data, calldata_t *calldata)
{
  auto *self = static_cast<Obs3dgsSource *>(data);
  const char *command = calldata_string(calldata, "command");
  if (command)
    self->sendCommand(command);
}

} // namespace

std::mutex Obs3dgsSource::registryMutex_;
std::vector<Obs3dgsSource *> Obs3dgsSource::registry_;

Obs3dgsSource::Obs3dgsSource(obs_data_t *settings, obs_source_t *source) : source_(source)
{
  const char *uuid = obs_source_get_uuid(source_);
  sourceId_ = uuid ? uuid : "unknown";
  mailbox_ = std::make_shared<RuntimeMailbox>();
  LocalServer::instance().registerMailbox(sourceId_, mailbox_);

  {
    std::lock_guard lock(registryMutex_);
    registry_.push_back(this);
  }

  proc_handler_t *handler = obs_source_get_proc_handler(source_);
  proc_handler_add(handler, "void obs3dgs_command(string command)", procCommand, this);

  const auto registerHotkey = [this](const char *id, const char *description, auto callback) {
    obs_hotkey_register_source(source_, id, obs_module_text(description), callback, this);
  };
  registerHotkey("obs3dgs.reset_camera", "Hotkey.ResetCamera",
                 [](void *data, obs_hotkey_id, obs_hotkey_t *, bool pressed) {
                   if (pressed)
                     static_cast<Obs3dgsSource *>(data)->sendCommand("resetCamera");
                 });
  registerHotkey("obs3dgs.previous_preset", "Hotkey.PreviousPreset",
                 [](void *data, obs_hotkey_id, obs_hotkey_t *, bool pressed) {
                   if (pressed)
                     static_cast<Obs3dgsSource *>(data)->stepPreset(-1);
                 });
  registerHotkey("obs3dgs.next_preset", "Hotkey.NextPreset",
                 [](void *data, obs_hotkey_id, obs_hotkey_t *, bool pressed) {
                   if (pressed)
                     static_cast<Obs3dgsSource *>(data)->stepPreset(1);
                 });
  for (std::size_t index = 0; index < 4; ++index) {
    const std::string id = "obs3dgs.preset_" + std::to_string(index + 1);
    const std::string description = "Hotkey.Preset" + std::to_string(index + 1);
    obs_hotkey_register_source(
        source_, id.c_str(), obs_module_text(description.c_str()),
        [](void *data, obs_hotkey_id, obs_hotkey_t *hotkey, bool pressed) {
          if (!pressed)
            return;
          const char *name = obs_hotkey_get_name(hotkey);
          if (!name || std::strlen(name) == 0)
            return;
          const char last = name[std::strlen(name) - 1];
          if (last >= '1' && last <= '4')
            static_cast<Obs3dgsSource *>(data)->applyPresetIndex(static_cast<std::size_t>(last - '1'));
        },
        this);
  }
  update(settings);
  restoringInitialSettings_ = false;
}

Obs3dgsSource::~Obs3dgsSource()
{
  mailbox_->active.store(false);
  LocalServer::instance().unregisterMailbox(sourceId_);
  LocalServer::instance().unmapSource(sourceId_);
  {
    std::lock_guard lock(registryMutex_);
    std::erase(registry_, this);
  }

  if (browser_) {
    obs_source_remove_active_child(source_, browser_);
    obs_source_release(browser_);
    browser_ = nullptr;
  }
  destroyErrorTexture();
  if (committedSettings_)
    obs_data_release(committedSettings_);
}

void Obs3dgsSource::update(obs_data_t *settings)
{
  obs_data_set_int(settings, KEY_SCHEMA, SETTINGS_SCHEMA_VERSION);
  const bool authorizedLockedUpdate = lockedUpdateAuthorization_.consume();
  if (committedSettings_ && isLiveLocked() && obs_data_get_bool(settings, KEY_LIVE_LOCK) && !authorizedLockedUpdate) {
    applyEffectiveSettings(settings, committedSettings_);
  }
  obs_data_set_double(settings, KEY_CAMERA_YAW, normalizeDegrees(obs_data_get_double(settings, KEY_CAMERA_YAW)));
  obs_data_set_double(settings, KEY_CAMERA_ROLL, normalizeDegrees(obs_data_get_double(settings, KEY_CAMERA_ROLL)));

  const char *requestedPathValue = obs_data_get_string(settings, KEY_ASSET);
  const std::string requestedPath = requestedPathValue ? requestedPathValue : "";
  const bool assetChanged = requestedPath != activeAssetPath_;
  {
    std::lock_guard statusLock(statusMutex_);
    nativeError_.clear();
  }

  if (assetChanged && !requestedPath.empty()) {
    const auto mapped = LocalServer::instance().mapAsset(sourceId_, ++assetRevision_, requestedPath);
    if (mapped.ok) {
      rollbackAssetPath_ = lastReadyAssetPath_;
      activeAssetPath_ = requestedPath;
      localAssetUrl_ = mapped.url;
      fileType_ = mapped.fileType;
      largeFileWarning_ = mapped.largeFileWarning;
      {
        std::lock_guard statusLock(statusMutex_);
        runtimeStatus_ = mapped.largeFileWarning ? "large-file-warning" : "loading";
      }
      progress_ = 0.0;
      runtimeReady_ = false;
      frameOnNextLoad_ = !restoringInitialSettings_;
      assetLoadPending_ = true;
    } else {
      {
        std::lock_guard statusLock(statusMutex_);
        nativeError_ = obs_module_text(mapped.error.c_str());
        runtimeStatus_ = "error";
      }
      if (!activeAssetPath_.empty())
        obs_data_set_string(settings, KEY_ASSET, activeAssetPath_.c_str());
      if (bridgeReady_.load())
        sendErrorStatus(obs_module_text(mapped.error.c_str()));
    }
  } else if (requestedPath.empty() && assetChanged) {
    LocalServer::instance().unmapSource(sourceId_);
    activeAssetPath_.clear();
    lastReadyAssetPath_.clear();
    rollbackAssetPath_.clear();
    localAssetUrl_.clear();
    fileType_ = "auto";
    largeFileWarning_ = false;
    {
      std::lock_guard statusLock(statusMutex_);
      runtimeStatus_ = "waiting";
    }
    runtimeReady_ = false;
    assetLoadPending_ = false;
  }

  std::string qualityPreset = obs_data_get_string(settings, KEY_QUALITY_PRESET);
  const bool presetChanged = qualityPreset != lastQualityPreset_;
  const auto presetMatches = [settings](double renderScale, long long lodCount, long long maxSh, long long fps) {
    return std::abs(obs_data_get_double(settings, KEY_RENDER_SCALE) - renderScale) < 0.0001 &&
           obs_data_get_int(settings, KEY_LOD_COUNT) == lodCount && obs_data_get_int(settings, KEY_MAX_SH) == maxSh &&
           obs_data_get_int(settings, KEY_TARGET_FPS) == fps && obs_data_get_bool(settings, KEY_LOD_ENABLED);
  };
  if (!presetChanged && qualityPreset == "performance" && !presetMatches(0.5, 500000, 1, 30))
    qualityPreset = "custom";
  else if (!presetChanged && qualityPreset == "balanced" && !presetMatches(0.75, 1000000, 2, 60))
    qualityPreset = "custom";
  else if (!presetChanged && qualityPreset == "quality" && !presetMatches(1.0, 1500000, 3, 60))
    qualityPreset = "custom";
  if (qualityPreset == "custom")
    obs_data_set_string(settings, KEY_QUALITY_PRESET, "custom");

  if (presetChanged && qualityPreset == "performance") {
    obs_data_set_double(settings, KEY_RENDER_SCALE, 0.5);
    obs_data_set_int(settings, KEY_LOD_COUNT, 500000);
    obs_data_set_int(settings, KEY_MAX_SH, 1);
    obs_data_set_int(settings, KEY_TARGET_FPS, 30);
    obs_data_set_bool(settings, KEY_LOD_ENABLED, true);
  } else if (presetChanged && qualityPreset == "balanced") {
    obs_data_set_double(settings, KEY_RENDER_SCALE, 0.75);
    obs_data_set_int(settings, KEY_LOD_COUNT, 1000000);
    obs_data_set_int(settings, KEY_MAX_SH, 2);
    obs_data_set_int(settings, KEY_TARGET_FPS, 60);
    obs_data_set_bool(settings, KEY_LOD_ENABLED, true);
  } else if (presetChanged && qualityPreset == "quality") {
    obs_data_set_double(settings, KEY_RENDER_SCALE, 1.0);
    obs_data_set_int(settings, KEY_LOD_COUNT, 1500000);
    obs_data_set_int(settings, KEY_MAX_SH, 3);
    obs_data_set_int(settings, KEY_TARGET_FPS, 60);
    obs_data_set_bool(settings, KEY_LOD_ENABLED, true);
  }
  lastQualityPreset_ = qualityPreset;
  activePresetIndex_ = static_cast<std::size_t>(std::max<long long>(0, obs_data_get_int(settings, KEY_ACTIVE_PRESET)));
  obs_data_set_int(settings, "lens_preset_mm",
                   lensPresetForFocalLength(obs_data_get_double(settings, KEY_FOCAL_LENGTH)));

  const bool runtimeSettingsChanged = !runtimeSettingsEqual(settings, committedSettings_);
  commitSettings(settings);
  const auto targetFps = static_cast<std::uint32_t>(obs_data_get_int(committedSettings_, KEY_TARGET_FPS));
  const bool browserRequired = browser_ || obs_source_showing(source_);
  if (browserRequired &&
      (!browser_ || browserWidth_ != width() || browserHeight_ != height() || browserFps_ != targetFps))
    createOrUpdateBrowser();
  if (bridgeReady_.load() && runtimeSettingsChanged)
    queueState(authorizedLockedUpdate);
}

void Obs3dgsSource::videoRender()
{
  if (browser_) {
    obs_source_video_render(browser_);
    return;
  }
  if (errorTexture_)
    obs_source_draw(errorTexture_, 0, 0, width(), height(), false);
}

void Obs3dgsSource::videoTick(float)
{
  processRuntimeEvents();
  if (browser_ && (browserWidth_ != width() || browserHeight_ != height())) {
    createOrUpdateBrowser();
    if (bridgeReady_.load())
      queueState();
  }
  const auto now = std::chrono::steady_clock::now();
  if (bridgeReady_.load() && statePending_.load() && now - lastStateSent_ >= std::chrono::milliseconds(34)) {
    const bool presetBypass = presetBypassPending_.exchange(false);
    statePending_ = false;
    sendState(presetBypass);
    lastStateSent_ = now;
  }
}

void Obs3dgsSource::show()
{
  if (!browser_)
    createOrUpdateBrowser();
  sendVisibility(true);
}

void Obs3dgsSource::hide()
{
  sendVisibility(false);
  if (browser_ && committedSettings_ && obs_data_get_bool(committedSettings_, KEY_HIDE_RELEASE)) {
    obs_source_remove_active_child(source_, browser_);
    obs_source_release(browser_);
    browser_ = nullptr;
    runtimeReady_ = false;
    bridgeReady_ = false;
  }
}

void Obs3dgsSource::mouseClick(const obs_mouse_event *event, int32_t type, bool mouseUp, uint32_t clickCount)
{
  if (browser_ && !isLiveLocked())
    obs_source_send_mouse_click(browser_, event, type, mouseUp, clickCount);
}

void Obs3dgsSource::mouseMove(const obs_mouse_event *event, bool mouseLeave)
{
  if (browser_ && !isLiveLocked())
    obs_source_send_mouse_move(browser_, event, mouseLeave);
}

void Obs3dgsSource::mouseWheel(const obs_mouse_event *event, int xDelta, int yDelta)
{
  if (browser_ && !isLiveLocked())
    obs_source_send_mouse_wheel(browser_, event, xDelta, yDelta);
}

void Obs3dgsSource::focus(bool focused)
{
  if (browser_)
    obs_source_send_focus(browser_, focused);
}

void Obs3dgsSource::keyClick(const obs_key_event *event, bool keyUp)
{
  if (browser_ && !isLiveLocked())
    obs_source_send_key_click(browser_, event, keyUp);
}

void Obs3dgsSource::enumSources(obs_source_enum_proc_t callback, void *parameter)
{
  if (browser_)
    callback(source_, browser_, parameter);
}

uint32_t Obs3dgsSource::width() const
{
  if (committedSettings_ && obs_data_get_bool(committedSettings_, KEY_FOLLOW_CANVAS)) {
    obs_video_info info{};
    if (obs_get_video_info(&info))
      return info.base_width;
  }
  return committedSettings_ ? static_cast<uint32_t>(obs_data_get_int(committedSettings_, KEY_WIDTH)) : 1920;
}

uint32_t Obs3dgsSource::height() const
{
  if (committedSettings_ && obs_data_get_bool(committedSettings_, KEY_FOLLOW_CANVAS)) {
    obs_video_info info{};
    if (obs_get_video_info(&info))
      return info.base_height;
  }
  return committedSettings_ ? static_cast<uint32_t>(obs_data_get_int(committedSettings_, KEY_HEIGHT)) : 1080;
}

std::string Obs3dgsSource::selectedSettingsPage() const
{
  obs_data_t *privateSettings = obs_source_get_private_settings(source_);
  const char *stored = obs_data_get_string(privateSettings, KEY_UI_SETTINGS_PAGE);
  const std::string page(normalizeSettingsPage(stored ? stored : ""));
  obs_data_release(privateSettings);
  return page;
}

bool Obs3dgsSource::advancedCameraExpanded() const
{
  obs_data_t *privateSettings = obs_source_get_private_settings(source_);
  const bool expanded = obs_data_get_bool(privateSettings, KEY_UI_ADVANCED_CAMERA);
  obs_data_release(privateSettings);
  return expanded;
}

std::string Obs3dgsSource::propertyStatusText() const
{
  std::string status;
  std::string error;
  {
    std::lock_guard statusLock(statusMutex_);
    status = runtimeStatus_;
    error = nativeError_;
  }

  QString value;
  if (!error.empty() || status == "error") {
    const QString detail =
        error.empty() ? QString::fromUtf8(obs_module_text("Dock.Error")) : QString::fromUtf8(error.c_str());
    value = QString::fromUtf8(obs_module_text("Properties.StatusError")).arg(detail);
  } else if (runtimeReady_.load()) {
    value = QString::fromUtf8(obs_module_text("Properties.StatusReady")).arg(fps_.load(), 0, 'f', 1);
  } else if (status == "loading" || status == "large-file-warning") {
    value = QString::fromUtf8(obs_module_text("Properties.StatusLoading")).arg(progress_.load() * 100.0, 0, 'f', 0);
  } else if (status == "runtime-ready") {
    value = QString::fromUtf8(obs_module_text("Properties.StatusRuntimeReady"));
  } else {
    value = QString::fromUtf8(obs_module_text("Properties.StatusWaiting"));
  }
  return value.toUtf8().toStdString();
}

void Obs3dgsSource::persistSettingsPage(obs_data_t *settings, const std::string &page)
{
  const std::string normalized(normalizeSettingsPage(page));
  obs_data_t *privateSettings = obs_source_get_private_settings(source_);
  obs_data_set_string(privateSettings, KEY_UI_SETTINGS_PAGE, normalized.c_str());
  obs_data_release(privateSettings);
  obs_data_set_default_string(settings, KEY_UI_SETTINGS_PAGE, normalized.c_str());
  obs_data_unset_user_value(settings, KEY_UI_SETTINGS_PAGE);
}

void Obs3dgsSource::persistAdvancedCamera(obs_data_t *settings, bool expanded)
{
  obs_data_t *privateSettings = obs_source_get_private_settings(source_);
  obs_data_set_bool(privateSettings, KEY_UI_ADVANCED_CAMERA, expanded);
  obs_data_release(privateSettings);
  obs_data_set_default_bool(settings, KEY_UI_ADVANCED_CAMERA, expanded);
  obs_data_unset_user_value(settings, KEY_UI_ADVANCED_CAMERA);
}

bool Obs3dgsSource::settingsPageModified(void *data, obs_properties_t *properties, obs_property_t *,
                                         obs_data_t *settings)
{
  auto *self = static_cast<Obs3dgsSource *>(data);
  const std::string page(normalizeSettingsPage(obs_data_get_string(settings, KEY_UI_SETTINGS_PAGE)));
  self->persistSettingsPage(settings, page);
  applySettingsPageVisibility(properties, page);
  if (auto *status = obs_properties_get(properties, KEY_PROPERTY_STATUS)) {
    const auto text = self->propertyStatusText();
    obs_property_set_description(status, text.c_str());
  }
  return true;
}

bool Obs3dgsSource::advancedCameraModified(void *data, obs_properties_t *properties, obs_property_t *,
                                           obs_data_t *settings)
{
  auto *self = static_cast<Obs3dgsSource *>(data);
  self->persistAdvancedCamera(settings, obs_data_get_bool(settings, KEY_UI_ADVANCED_CAMERA));
  applyConditionalVisibility(properties, settings);
  return true;
}

obs_properties_t *Obs3dgsSource::properties()
{
  obs_properties_t *properties = obs_properties_create();
  const std::string selectedPage = selectedSettingsPage();
  const bool showAdvancedCamera = advancedCameraExpanded();
  obs_data_t *propertySettings = obs_source_get_settings(source_);
  obs_data_unset_user_value(propertySettings, KEY_UI_SETTINGS_PAGE);
  obs_data_set_default_string(propertySettings, KEY_UI_SETTINGS_PAGE, selectedPage.c_str());
  obs_data_unset_user_value(propertySettings, KEY_UI_ADVANCED_CAMERA);
  obs_data_set_default_bool(propertySettings, KEY_UI_ADVANCED_CAMERA, showAdvancedCamera);

  const auto statusText = propertyStatusText();
  obs_properties_add_text(properties, KEY_PROPERTY_STATUS, statusText.c_str(), OBS_TEXT_INFO);
  auto *settingsPage = obs_properties_add_list(properties, KEY_UI_SETTINGS_PAGE, obs_module_text("SettingsPage.Title"),
                                               OBS_COMBO_TYPE_LIST, OBS_COMBO_FORMAT_STRING);
  addComboItem(settingsPage, "SettingsPage.SceneFile", "scene-file");
  addComboItem(settingsPage, "SettingsPage.Transform", "transform");
  addComboItem(settingsPage, "SettingsPage.Camera", "camera");
  addComboItem(settingsPage, "SettingsPage.Display", "display");
  addComboItem(settingsPage, "SettingsPage.Quality", "quality");
  addComboItem(settingsPage, "SettingsPage.Advanced", "advanced");
  obs_property_set_modified_callback2(settingsPage, settingsPageModified, this);
  obs_properties_add_button2(properties, "open_dock", obs_module_text("Dock.Open"), propertiesButton, this);
  auto *liveLock = obs_properties_add_bool(properties, KEY_LIVE_LOCK, obs_module_text("Safety.LiveLock"));
  obs_property_set_modified_callback2(liveLock, liveLockModified, this);

  obs_properties_t *assetProperties = obs_properties_create();
  obs_properties_add_path(assetProperties, KEY_ASSET, obs_module_text("SceneFile.Path"), OBS_PATH_FILE,
                          "3D Gaussian Scenes (*.ply *.spz *.sog *.splat *.ksplat *.zip *.rad);;All files (*.*)",
                          activeAssetPath_.empty() ? nullptr : activeAssetPath_.c_str());
  obs_properties_add_button2(assetProperties, "reload_asset", obs_module_text("SceneFile.Reload"), propertiesButton,
                             this);
  auto *coordinate = obs_properties_add_list(assetProperties, KEY_COORDINATE, obs_module_text("SceneFile.Coordinate"),
                                             OBS_COMBO_TYPE_LIST, OBS_COMBO_FORMAT_STRING);
  addComboItem(coordinate, "Coordinate.Auto", "auto");
  addComboItem(coordinate, "Coordinate.OpenGL", "opengl-y-up");
  addComboItem(coordinate, "Coordinate.OpenCV", "opencv-x-180");
  addComboItem(coordinate, "Coordinate.ZUp", "z-up");
  obs_property_set_long_description(coordinate, obs_module_text("Tooltip.Coordinate"));
  obs_properties_add_text(assetProperties, "format_support", obs_module_text("SceneFile.Formats"), OBS_TEXT_INFO);
  obs_properties_add_text(assetProperties, "layer_hint", obs_module_text("Source.LayerHint"), OBS_TEXT_INFO);
  if (!activeAssetPath_.empty()) {
    const QFileInfo assetInfo(QString::fromUtf8(activeAssetPath_));
    const QString extension = assetInfo.suffix().toUpper();
    const bool stable =
        extension == QStringLiteral("PLY") || extension == QStringLiteral("SPZ") || extension == QStringLiteral("SOG");
    const QString tier = QString::fromUtf8(obs_module_text(stable ? "SceneFile.Stable" : "SceneFile.Experimental"));
    const double mebibytes = assetInfo.exists() ? static_cast<double>(assetInfo.size()) / (1024.0 * 1024.0) : 0.0;
    const QByteArray description = QString::fromUtf8(obs_module_text("SceneFile.CurrentInfo"))
                                       .arg(extension, tier)
                                       .arg(mebibytes, 0, 'f', 1)
                                       .toUtf8();
    obs_properties_add_text(assetProperties, "asset_info", description.constData(), OBS_TEXT_INFO);
    if (largeFileWarning_)
      obs_properties_add_text(assetProperties, "asset_warning", obs_module_text("SceneFile.LargeWarning"),
                              OBS_TEXT_INFO);
  }
  {
    std::lock_guard statusLock(statusMutex_);
    if (!nativeError_.empty())
      obs_properties_add_text(assetProperties, "asset_error", nativeError_.c_str(), OBS_TEXT_INFO);
  }
  obs_properties_add_group(properties, "scene_file_group", obs_module_text("SceneFile.Title"), OBS_GROUP_NORMAL,
                           assetProperties);

  obs_properties_t *transformProperties = obs_properties_create();
  obs_properties_add_float_slider(transformProperties, KEY_POSITION_X, obs_module_text("Transform.PositionX"), -1000.0,
                                  1000.0, 0.01);
  obs_properties_add_float_slider(transformProperties, KEY_POSITION_Y, obs_module_text("Transform.PositionY"), -1000.0,
                                  1000.0, 0.01);
  obs_properties_add_float_slider(transformProperties, KEY_POSITION_Z, obs_module_text("Transform.PositionZ"), -1000.0,
                                  1000.0, 0.01);
  obs_properties_add_float_slider(transformProperties, KEY_ROTATION_X, obs_module_text("Transform.RotationX"), -180.0,
                                  180.0, 0.1);
  obs_properties_add_float_slider(transformProperties, KEY_ROTATION_Y, obs_module_text("Transform.RotationY"), -180.0,
                                  180.0, 0.1);
  obs_properties_add_float_slider(transformProperties, KEY_ROTATION_Z, obs_module_text("Transform.RotationZ"), -180.0,
                                  180.0, 0.1);
  obs_properties_add_float(transformProperties, KEY_SCALE, obs_module_text("Transform.Scale"), 0.001, 1000.0, 0.01);
  obs_properties_add_button2(transformProperties, "reset_scene", obs_module_text("Transform.Reset"), propertiesButton,
                             this);
  obs_properties_add_group(properties, "transform_group", obs_module_text("Transform.Title"), OBS_GROUP_NORMAL,
                           transformProperties);

  obs_properties_t *cameraProperties = obs_properties_create();
  auto *focal = obs_properties_add_float(cameraProperties, KEY_FOCAL_LENGTH, obs_module_text("Camera.FocalLength"),
                                         16.0, 200.0, 1.0);
  obs_property_float_set_suffix(focal, " mm");
  obs_property_set_long_description(focal, obs_module_text("Tooltip.FocalLength"));
  obs_property_set_modified_callback2(focal, focalLengthModified, this);
  auto *lensPreset = obs_properties_add_list(cameraProperties, "lens_preset_mm", obs_module_text("Camera.LensPreset"),
                                             OBS_COMBO_TYPE_LIST, OBS_COMBO_FORMAT_INT);
  obs_property_list_add_int(lensPreset, obs_module_text("Camera.CustomLens"), 0);
  for (const int preset : COMMON_LENS_PRESETS) {
    const QByteArray label = QStringLiteral("%1 mm").arg(preset).toUtf8();
    obs_property_list_add_int(lensPreset, label.constData(), preset);
  }
  obs_property_set_modified_callback2(lensPreset, lensPresetModified, this);
  obs_properties_add_float_slider(cameraProperties, KEY_CAMERA_YAW, obs_module_text("Camera.Yaw"), -180.0, 180.0, 0.1);
  obs_properties_add_float_slider(cameraProperties, KEY_CAMERA_PITCH, obs_module_text("Camera.Pitch"), -89.5, 89.5,
                                  0.1);
  obs_properties_add_float(cameraProperties, KEY_CAMERA_DISTANCE, obs_module_text("Camera.Distance"), 0.001, 1000000.0,
                           0.01);
  if (committedSettings_) {
    const double focalLength = std::clamp(obs_data_get_double(committedSettings_, KEY_FOCAL_LENGTH), 16.0, 200.0);
    const double aspect = height() > 0 ? static_cast<double>(width()) / static_cast<double>(height()) : 16.0 / 9.0;
    const double filmWidth = aspect >= 1.0 ? 36.0 : 36.0 * aspect;
    const double filmHeight = aspect >= 1.0 ? 36.0 / aspect : 36.0;
    const double horizontal = 2.0 * std::atan(filmWidth / (2.0 * focalLength)) * 180.0 / std::numbers::pi;
    const double vertical = 2.0 * std::atan(filmHeight / (2.0 * focalLength)) * 180.0 / std::numbers::pi;
    const QByteArray fovText = QString::fromUtf8(obs_module_text("Camera.FovReadout"))
                                   .arg(horizontal, 0, 'f', 1)
                                   .arg(vertical, 0, 'f', 1)
                                   .toUtf8();
    obs_properties_add_text(cameraProperties, "camera_fov", fovText.constData(), OBS_TEXT_INFO);
  }
  obs_properties_add_button2(cameraProperties, "frame_all", obs_module_text("Camera.FrameAll"), propertiesButton, this);
  obs_properties_add_button2(cameraProperties, "reset_camera", obs_module_text("Camera.Reset"), propertiesButton, this);
  obs_properties_add_button2(cameraProperties, "open_interaction", obs_module_text("Camera.Interaction"),
                             propertiesButton, this);
  auto *advancedCamera =
      obs_properties_add_bool(cameraProperties, KEY_UI_ADVANCED_CAMERA, obs_module_text("Camera.ShowAdvanced"));
  obs_property_set_modified_callback2(advancedCamera, advancedCameraModified, this);
  obs_properties_add_float(cameraProperties, KEY_CAMERA_TARGET_X, obs_module_text("Camera.TargetX"), -1000000.0,
                           1000000.0, 0.01);
  obs_properties_add_float(cameraProperties, KEY_CAMERA_TARGET_Y, obs_module_text("Camera.TargetY"), -1000000.0,
                           1000000.0, 0.01);
  obs_properties_add_float(cameraProperties, KEY_CAMERA_TARGET_Z, obs_module_text("Camera.TargetZ"), -1000000.0,
                           1000000.0, 0.01);
  obs_properties_add_float_slider(cameraProperties, KEY_CAMERA_ROLL, obs_module_text("Camera.Roll"), -180.0, 180.0,
                                  0.1);
  obs_properties_add_text(cameraProperties, "camera_sensor_width", obs_module_text("Camera.SensorWidth"),
                          OBS_TEXT_INFO);
  auto *autoClipping =
      obs_properties_add_bool(cameraProperties, KEY_AUTO_CLIPPING, obs_module_text("Camera.AutoClipping"));
  obs_property_set_modified_callback2(autoClipping, autoClippingModified, this);
  obs_properties_add_float(cameraProperties, KEY_NEAR_CLIP, obs_module_text("Camera.NearClip"), 0.0001, 1000000.0,
                           0.001);
  obs_properties_add_float(cameraProperties, KEY_FAR_CLIP, obs_module_text("Camera.FarClip"), 0.001, 10000000.0, 0.1);
  obs_properties_add_group(properties, "camera_group", obs_module_text("Camera.Title"), OBS_GROUP_NORMAL,
                           cameraProperties);

  obs_properties_t *displayProperties = obs_properties_create();
  auto *background =
      obs_properties_add_list(displayProperties, KEY_BACKGROUND_MODE, obs_module_text("Display.Background"),
                              OBS_COMBO_TYPE_LIST, OBS_COMBO_FORMAT_STRING);
  addComboItem(background, "Display.BackgroundOpaque", "opaque");
  addComboItem(background, "Display.BackgroundTransparent", "transparent");
  obs_property_set_modified_callback2(background, backgroundModified, this);
  obs_properties_add_color(displayProperties, KEY_BACKGROUND_COLOR, obs_module_text("Display.BackgroundColor"));
  obs_properties_add_float_slider(displayProperties, KEY_OPACITY, obs_module_text("Display.Opacity"), 0.0, 1.0, 0.01);
  obs_properties_add_color(displayProperties, KEY_RECOLOR, obs_module_text("Display.Recolor"));
  auto *maxSh = obs_properties_add_int_slider(displayProperties, KEY_MAX_SH, obs_module_text("Display.SH"), 0, 3, 1);
  obs_property_set_long_description(maxSh, obs_module_text("Tooltip.SH"));
  auto *toneMapping =
      obs_properties_add_list(displayProperties, KEY_TONE_MAPPING, obs_module_text("Display.ToneMapping"),
                              OBS_COMBO_TYPE_LIST, OBS_COMBO_FORMAT_STRING);
  addComboItem(toneMapping, "Display.ToneNone", "none");
  addComboItem(toneMapping, "Display.ToneLinear", "linear");
  addComboItem(toneMapping, "Display.ToneAces", "aces");
  obs_property_set_long_description(toneMapping, obs_module_text("Tooltip.ToneMapping"));
  obs_properties_add_float_slider(displayProperties, KEY_EXPOSURE, obs_module_text("Display.Exposure"), 0.0, 16.0,
                                  0.05);
  obs_properties_add_button2(displayProperties, "reset_appearance", obs_module_text("Display.Reset"), propertiesButton,
                             this);
  obs_properties_add_group(properties, "display_group", obs_module_text("Display.Title"), OBS_GROUP_NORMAL,
                           displayProperties);

  obs_properties_t *qualityProperties = obs_properties_create();
  auto *quality = obs_properties_add_list(qualityProperties, KEY_QUALITY_PRESET, obs_module_text("Quality.Preset"),
                                          OBS_COMBO_TYPE_LIST, OBS_COMBO_FORMAT_STRING);
  addComboItem(quality, "Quality.Performance", "performance");
  addComboItem(quality, "Quality.Balanced", "balanced");
  addComboItem(quality, "Quality.Quality", "quality");
  addComboItem(quality, "Quality.Custom", "custom");
  obs_property_set_modified_callback2(quality, qualityPresetModified, this);
  obs_properties_add_float_slider(qualityProperties, KEY_RENDER_SCALE, obs_module_text("Quality.RenderScale"), 0.25,
                                  1.0, 0.05);
  auto *lodEnabled = obs_properties_add_bool(qualityProperties, KEY_LOD_ENABLED, obs_module_text("Quality.LOD"));
  obs_property_set_long_description(lodEnabled, obs_module_text("Tooltip.LOD"));
  obs_properties_add_int_slider(qualityProperties, KEY_LOD_COUNT, obs_module_text("Quality.LODCount"), 250000, 4000000,
                                50000);
  obs_properties_add_int_slider(qualityProperties, KEY_TARGET_FPS, obs_module_text("Quality.FPS"), 15, 60, 1);
  obs_properties_add_group(properties, "quality_group", obs_module_text("Quality.Title"), OBS_GROUP_NORMAL,
                           qualityProperties);

  obs_properties_t *advancedProperties = obs_properties_create();
  auto *followCanvas =
      obs_properties_add_bool(advancedProperties, KEY_FOLLOW_CANVAS, obs_module_text("Advanced.FollowCanvas"));
  obs_property_set_modified_callback2(followCanvas, followCanvasModified, this);
  obs_properties_add_int(advancedProperties, KEY_WIDTH, obs_module_text("Advanced.Width"), 16, 16384, 1);
  obs_properties_add_int(advancedProperties, KEY_HEIGHT, obs_module_text("Advanced.Height"), 16, 16384, 1);
  obs_properties_add_bool(advancedProperties, KEY_HIDE_RELEASE, obs_module_text("Advanced.ReleaseWhenHidden"));
  {
    std::lock_guard statusLock(statusMutex_);
    const QString deviceText = rendererName_.empty() ? QString::fromUtf8(obs_module_text("Advanced.DevicePending"))
                                                     : QString::fromUtf8(rendererName_.c_str());
    obs_properties_add_text(advancedProperties, "device_info",
                            QString::fromUtf8(obs_module_text("Advanced.Device")).arg(deviceText).toUtf8().constData(),
                            OBS_TEXT_INFO);
  }
  obs_properties_add_button2(advancedProperties, "export_diagnostics", obs_module_text("Advanced.ExportDiagnostics"),
                             propertiesButton, this);
  obs_properties_add_group(properties, "advanced_group", obs_module_text("Advanced.Title"), OBS_GROUP_NORMAL,
                           advancedProperties);

  applySettingsPageVisibility(properties, selectedPage);
  applyConditionalVisibility(properties, propertySettings);
  liveLockModified(this, properties, liveLock, propertySettings);
  obs_data_release(propertySettings);
  return properties;
}

obs_missing_files_t *Obs3dgsSource::missingFiles()
{
  obs_missing_files_t *files = obs_missing_files_create();
  const char *configuredPath = committedSettings_ ? obs_data_get_string(committedSettings_, KEY_ASSET) : nullptr;
  const std::string missingPath = configuredPath && configuredPath[0] != '\0' ? configuredPath : activeAssetPath_;
  if (!missingPath.empty() && !QFileInfo::exists(QString::fromUtf8(missingPath.c_str()))) {
    obs_missing_file_t *file = obs_missing_file_create(missingPath.c_str(), missingFileResolved,
                                                       OBS_MISSING_FILE_SOURCE, source_, nullptr);
    obs_missing_files_add_file(files, file);
  }
  return files;
}

void Obs3dgsSource::sendCommand(const std::string &command, bool bypassLiveLock)
{
  if (command == "previousPreset") {
    stepPreset(-1);
    return;
  }
  if (command == "nextPreset") {
    stepPreset(1);
    return;
  }
  if (command.rfind("preset:", 0) == 0) {
    try {
      applyPresetIndex(static_cast<std::size_t>(std::stoul(command.substr(7))));
    } catch (...) {
    }
    return;
  }
  if (!bypassLiveLock && !commandAllowed(command))
    return;
  sendJavascript({
      {"protocolVersion", 1},
      {"sourceId", sourceId_},
      {"revision", ++messageRevision_},
      {"type", "command"},
      {"payload", {{"command", command}}},
  });
}

void Obs3dgsSource::reloadAsset()
{
  if (isLiveLocked() || activeAssetPath_.empty())
    return;
  const auto mapped = LocalServer::instance().mapAsset(sourceId_, ++assetRevision_, activeAssetPath_);
  if (!mapped.ok) {
    {
      std::lock_guard statusLock(statusMutex_);
      nativeError_ = obs_module_text(mapped.error.c_str());
      runtimeStatus_ = "error";
    }
    return;
  }
  localAssetUrl_ = mapped.url;
  fileType_ = mapped.fileType;
  largeFileWarning_ = mapped.largeFileWarning;
  frameOnNextLoad_ = false;
  assetLoadPending_ = true;
  createOrUpdateBrowser();
  queueState();
}

void Obs3dgsSource::openInteraction()
{
  if (!isLiveLocked())
    obs_frontend_open_source_interaction(source_);
}

void Obs3dgsSource::resetSceneTransform()
{
  if (isLiveLocked())
    return;
  obs_data_t *settings = obs_source_get_settings(source_);
  for (const char *key :
       {KEY_POSITION_X, KEY_POSITION_Y, KEY_POSITION_Z, KEY_ROTATION_X, KEY_ROTATION_Y, KEY_ROTATION_Z})
    obs_data_set_double(settings, key, 0.0);
  obs_data_set_double(settings, KEY_SCALE, 1.0);
  obs_source_update(source_, settings);
  obs_data_release(settings);
}

void Obs3dgsSource::resetAppearance()
{
  if (isLiveLocked())
    return;
  obs_data_t *settings = obs_source_get_settings(source_);
  obs_data_set_string(settings, KEY_BACKGROUND_MODE, "opaque");
  obs_data_set_int(settings, KEY_BACKGROUND_COLOR, 0x000000);
  obs_data_set_double(settings, KEY_OPACITY, 1.0);
  obs_data_set_int(settings, KEY_RECOLOR, 0xFFFFFF);
  obs_data_set_int(settings, KEY_MAX_SH, 2);
  obs_data_set_string(settings, KEY_TONE_MAPPING, "none");
  obs_data_set_double(settings, KEY_EXPOSURE, 1.0);
  obs_source_update(source_, settings);
  obs_data_release(settings);
}

void Obs3dgsSource::exportDiagnostics()
{
  const QString target =
      QFileDialog::getSaveFileName(static_cast<QWidget *>(obs_frontend_get_main_window()),
                                   QString::fromUtf8(obs_module_text("Advanced.ExportDiagnostics")),
                                   QStringLiteral("obs-3dgs-diagnostics.json"), QStringLiteral("JSON (*.json)"));
  if (target.isEmpty())
    return;

  std::string runtimeStatus;
  std::string rendererName;
  std::string error;
  {
    std::lock_guard statusLock(statusMutex_);
    runtimeStatus = runtimeStatus_;
    rendererName = rendererName_;
    error = nativeError_;
  }
  const QFileInfo assetInfo(QString::fromUtf8(activeAssetPath_));
  const std::uint64_t assetSize =
      assetInfo.exists() && assetInfo.size() >= 0 ? static_cast<std::uint64_t>(assetInfo.size()) : 0;

  const nlohmann::json diagnostics = {
      {"pluginVersion", OBS_3DGS_VERSION},
      {"settingsSchemaVersion", SETTINGS_SCHEMA_VERSION},
      {"obsVersion", obs_get_version_string()},
      {"os", QSysInfo::prettyProductName().toStdString()},
      {"architecture", QSysInfo::currentCpuArchitecture().toStdString()},
      {"sourceName", obs_source_get_name(source_)},
      {"sourceId", sourceId_},
      {"asset",
       {
           {"fileName", assetInfo.fileName().toStdString()},
           {"size", assetSize},
           {"fileType", fileType_},
       }},
      {"runtime",
       {
           {"status", runtimeStatus},
           {"renderer", rendererName},
           {"fps", fps_.load()},
           {"frameP95Ms", p95Ms_.load()},
           {"error", error},
       }},
      {"quality",
       {
           {"preset", obs_data_get_string(committedSettings_, KEY_QUALITY_PRESET)},
           {"renderScale", obs_data_get_double(committedSettings_, KEY_RENDER_SCALE)},
           {"targetFps", obs_data_get_int(committedSettings_, KEY_TARGET_FPS)},
           {"lodEnabled", obs_data_get_bool(committedSettings_, KEY_LOD_ENABLED)},
           {"lodSplatCount", obs_data_get_int(committedSettings_, KEY_LOD_COUNT)},
           {"maxSh", obs_data_get_int(committedSettings_, KEY_MAX_SH)},
       }},
  };

  QSaveFile file(target);
  if (!file.open(QIODevice::WriteOnly | QIODevice::Text))
    return;
  const auto bytes = QByteArray::fromStdString(diagnostics.dump(2) + "\n");
  file.write(bytes);
  file.commit();
}

void Obs3dgsSource::applyPresetIndex(std::size_t index)
{
  if (!committedSettings_)
    return;
  const char *serialized = obs_data_get_string(committedSettings_, KEY_PRESETS);
  if (!serialized || std::strlen(serialized) > 64 * 1024)
    return;
  const auto presets = nlohmann::json::parse(serialized, nullptr, false);
  if (!presets.is_array() || index >= presets.size() || index >= 16 || !presets[index].is_object())
    return;
  const auto &preset = presets[index];
  const auto target =
      preset.contains("target") && preset["target"].is_object() ? preset["target"] : nlohmann::json::object();
  obs_data_t *settings = obs_source_get_settings(source_);
  obs_data_set_double(settings, KEY_CAMERA_TARGET_X, jsonNumber(target, "x", 0.0, -1000000.0, 1000000.0));
  obs_data_set_double(settings, KEY_CAMERA_TARGET_Y, jsonNumber(target, "y", 0.0, -1000000.0, 1000000.0));
  obs_data_set_double(settings, KEY_CAMERA_TARGET_Z, jsonNumber(target, "z", 0.0, -1000000.0, 1000000.0));
  obs_data_set_double(settings, KEY_CAMERA_YAW,
                      normalizeDegrees(jsonNumber(preset, "yawDeg", 35.0, -100000.0, 100000.0)));
  obs_data_set_double(settings, KEY_CAMERA_PITCH, jsonNumber(preset, "pitchDeg", -12.0, -89.5, 89.5));
  obs_data_set_double(settings, KEY_CAMERA_ROLL,
                      normalizeDegrees(jsonNumber(preset, "rollDeg", 0.0, -100000.0, 100000.0)));
  obs_data_set_double(settings, KEY_CAMERA_DISTANCE, jsonNumber(preset, "distance", 4.2, 0.001, 1000000.0));
  obs_data_set_double(settings, KEY_FOCAL_LENGTH, jsonNumber(preset, "focalLengthMm", 35.0, 16.0, 200.0));
  obs_data_set_int(settings, KEY_ACTIVE_PRESET, static_cast<long long>(index));
  activePresetIndex_ = index;
  lockedUpdateAuthorization_.grant();
  obs_source_update(source_, settings);
  obs_data_release(settings);
}

void Obs3dgsSource::stepPreset(int direction)
{
  if (!committedSettings_)
    return;
  const char *serialized = obs_data_get_string(committedSettings_, KEY_PRESETS);
  if (!serialized || std::strlen(serialized) > 64 * 1024)
    return;
  const auto presets = nlohmann::json::parse(serialized, nullptr, false);
  if (!presets.is_array() || presets.empty())
    return;
  const auto count = std::min<std::size_t>(presets.size(), 16);
  const auto current = activePresetIndex_ % count;
  const auto next = direction < 0 ? (current + count - 1) % count : (current + 1) % count;
  applyPresetIndex(next);
}

void Obs3dgsSource::defaults(obs_data_t *settings)
{
  obs_data_set_default_int(settings, KEY_SCHEMA, SETTINGS_SCHEMA_VERSION);
  obs_data_set_default_string(settings, KEY_ASSET, "");
  obs_data_set_default_string(settings, KEY_COORDINATE, "auto");
  obs_data_set_default_int(settings, KEY_WIDTH, 1920);
  obs_data_set_default_int(settings, KEY_HEIGHT, 1080);
  obs_data_set_default_bool(settings, KEY_FOLLOW_CANVAS, true);
  obs_data_set_default_double(settings, KEY_RENDER_SCALE, 0.75);
  obs_data_set_default_int(settings, KEY_TARGET_FPS, 60);
  obs_data_set_default_string(settings, KEY_BACKGROUND_MODE, "opaque");
  obs_data_set_default_int(settings, KEY_BACKGROUND_COLOR, 0x000000);
  obs_data_set_default_double(settings, KEY_POSITION_X, 0.0);
  obs_data_set_default_double(settings, KEY_POSITION_Y, 0.0);
  obs_data_set_default_double(settings, KEY_POSITION_Z, 0.0);
  obs_data_set_default_double(settings, KEY_ROTATION_X, 0.0);
  obs_data_set_default_double(settings, KEY_ROTATION_Y, 0.0);
  obs_data_set_default_double(settings, KEY_ROTATION_Z, 0.0);
  obs_data_set_default_double(settings, KEY_SCALE, 1.0);
  obs_data_set_default_double(settings, KEY_OPACITY, 1.0);
  obs_data_set_default_int(settings, KEY_RECOLOR, 0xFFFFFF);
  obs_data_set_default_int(settings, KEY_MAX_SH, 2);
  obs_data_set_default_double(settings, KEY_CAMERA_TARGET_X, 0.0);
  obs_data_set_default_double(settings, KEY_CAMERA_TARGET_Y, 0.0);
  obs_data_set_default_double(settings, KEY_CAMERA_TARGET_Z, 0.0);
  obs_data_set_default_double(settings, KEY_CAMERA_YAW, 35.0);
  obs_data_set_default_double(settings, KEY_CAMERA_PITCH, -12.0);
  obs_data_set_default_double(settings, KEY_CAMERA_ROLL, 0.0);
  obs_data_set_default_double(settings, KEY_CAMERA_DISTANCE, 4.2);
  obs_data_set_default_double(settings, KEY_FOCAL_LENGTH, 35.0);
  obs_data_set_default_int(settings, "lens_preset_mm", 35);
  obs_data_set_default_bool(settings, KEY_AUTO_CLIPPING, true);
  obs_data_set_default_double(settings, KEY_NEAR_CLIP, 0.01);
  obs_data_set_default_double(settings, KEY_FAR_CLIP, 10000.0);
  obs_data_set_default_string(settings, KEY_TONE_MAPPING, "none");
  obs_data_set_default_double(settings, KEY_EXPOSURE, 1.0);
  obs_data_set_default_string(settings, KEY_QUALITY_PRESET, "balanced");
  obs_data_set_default_bool(settings, KEY_LOD_ENABLED, true);
  obs_data_set_default_int(settings, KEY_LOD_COUNT, 1000000);
  obs_data_set_default_bool(settings, KEY_LIVE_LOCK, false);
  obs_data_set_default_bool(settings, KEY_HIDE_RELEASE, false);
  obs_data_set_default_string(settings, KEY_PRESETS, "[]");
  obs_data_set_default_int(settings, KEY_ACTIVE_PRESET, 0);
}

std::vector<SourceSummary> Obs3dgsSource::sourceSummaries()
{
  std::lock_guard lock(registryMutex_);
  std::vector<SourceSummary> summaries;
  summaries.reserve(registry_.size());
  for (const auto *source : registry_) {
    std::lock_guard statusLock(source->statusMutex_);
    summaries.push_back({
        source->sourceId_,
        obs_source_get_name(source->source_),
        source->nativeError_.empty() ? source->runtimeStatus_ : source->nativeError_,
        source->progress_.load(),
        source->fps_.load(),
        source->p95Ms_.load(),
        source->runtimeReady_.load(),
        source->isLiveLocked(),
    });
  }
  return summaries;
}

bool Obs3dgsSource::invokeCommand(const std::string &uuid, const std::string &command, bool bypassLiveLock)
{
  std::lock_guard lock(registryMutex_);
  const auto found = std::find_if(registry_.begin(), registry_.end(),
                                  [&uuid](const auto *source) { return source->sourceId_ == uuid; });
  if (found == registry_.end())
    return false;
  (*found)->sendCommand(command, bypassLiveLock);
  return true;
}

bool Obs3dgsSource::updateSettingValue(const std::string &uuid, const char *name, bool bypassLiveLock,
                                       const std::function<void(obs_data_t *)> &setter)
{
  std::lock_guard lock(registryMutex_);
  const auto found = std::find_if(registry_.begin(), registry_.end(),
                                  [&uuid](const auto *instance) { return instance->sourceId_ == uuid; });
  if (found == registry_.end())
    return false;

  auto *instance = *found;
  if (instance->isLiveLocked() && !bypassLiveLock && std::strcmp(name, KEY_LIVE_LOCK) != 0)
    return false;
  obs_data_t *settings = obs_source_get_settings(instance->source_);
  setter(settings);
  if (bypassLiveLock)
    instance->lockedUpdateAuthorization_.grant();
  obs_source_update(instance->source_, settings);
  obs_data_release(settings);
  return true;
}

bool Obs3dgsSource::setSetting(const std::string &uuid, const char *name, double value, bool bypassLiveLock)
{
  return updateSettingValue(uuid, name, bypassLiveLock,
                            [name, value](obs_data_t *settings) { obs_data_set_double(settings, name, value); });
}

bool Obs3dgsSource::setSetting(const std::string &uuid, const char *name, std::int64_t value, bool bypassLiveLock)
{
  return updateSettingValue(uuid, name, bypassLiveLock,
                            [name, value](obs_data_t *settings) { obs_data_set_int(settings, name, value); });
}

bool Obs3dgsSource::setSetting(const std::string &uuid, const char *name, bool value, bool bypassLiveLock)
{
  return updateSettingValue(uuid, name, bypassLiveLock,
                            [name, value](obs_data_t *settings) { obs_data_set_bool(settings, name, value); });
}

bool Obs3dgsSource::setSetting(const std::string &uuid, const char *name, const std::string &value, bool bypassLiveLock)
{
  return updateSettingValue(uuid, name, bypassLiveLock, [name, value](obs_data_t *settings) {
    obs_data_set_string(settings, name, value.c_str());
  });
}

void Obs3dgsSource::notifyLocaleChanged()
{
  std::lock_guard lock(registryMutex_);
  for (auto *source : registry_) {
    source->queueState();
    obs_source_update_properties(source->source_);
  }
}

void Obs3dgsSource::createOrUpdateBrowser()
{
  std::string serverError;
  if (!LocalServer::instance().ensureStarted(serverError)) {
    {
      std::lock_guard statusLock(statusMutex_);
      nativeError_ = obs_module_text(serverError.c_str());
    }
    createErrorTexture(obs_module_text(serverError.c_str()));
    return;
  }

  const auto url = LocalServer::instance().runtimeUrl(sourceId_);
  obs_data_t *browserSettings = obs_data_create();
  obs_data_set_bool(browserSettings, "is_local_file", false);
  obs_data_set_string(browserSettings, "url", url.c_str());
  obs_data_set_int(browserSettings, "width", width());
  obs_data_set_int(browserSettings, "height", height());
  obs_data_set_bool(browserSettings, "fps_custom", true);
  obs_data_set_int(browserSettings, "fps",
                   committedSettings_ ? obs_data_get_int(committedSettings_, KEY_TARGET_FPS) : 60);
  obs_data_set_bool(browserSettings, "shutdown", false);
  obs_data_set_bool(browserSettings, "restart_when_active", false);
  obs_data_set_bool(browserSettings, "reroute_audio", false);

  if (!browser_) {
    browser_ = obs_source_create_private("browser_source", nullptr, browserSettings);
    if (browser_) {
      obs_source_add_active_child(source_, browser_);
      bridgeReady_ = false;
      lastRuntimeRevision_ = 0;
      destroyErrorTexture();
    } else {
      std::string browserError = obs_module_text("Error.BrowserMissing");
      {
        std::lock_guard statusLock(statusMutex_);
        nativeError_ = browserError;
      }
      createErrorTexture(browserError);
    }
  } else {
    obs_source_update(browser_, browserSettings);
  }
  browserWidth_ = width();
  browserHeight_ = height();
  browserFps_ = static_cast<std::uint32_t>(obs_data_get_int(committedSettings_, KEY_TARGET_FPS));
  obs_data_release(browserSettings);
}

void Obs3dgsSource::createErrorTexture(const std::string &message)
{
  destroyErrorTexture();
  constexpr int textureWidth = 1280;
  constexpr int textureHeight = 720;
  QImage image(textureWidth, textureHeight, QImage::Format_RGBA8888_Premultiplied);
  image.fill(QColor(23, 25, 29, 255));
  QPainter painter(&image);
  painter.setRenderHint(QPainter::Antialiasing);
  painter.setPen(QColor(237, 241, 245));
  painter.setFont(QFont(QStringLiteral("Segoe UI"), 25, QFont::DemiBold));
  painter.drawText(QRect(80, 240, textureWidth - 160, 70), Qt::AlignCenter,
                   QString::fromUtf8(obs_module_text("Error.Title")));
  painter.setPen(QColor(170, 179, 191));
  painter.setFont(QFont(QStringLiteral("Segoe UI"), 15));
  painter.drawText(QRect(100, 320, textureWidth - 200, 150), Qt::AlignHCenter | Qt::AlignTop | Qt::TextWordWrap,
                   QString::fromUtf8(message.c_str()));
  painter.end();

  const uint8_t *pixels = image.constBits();
  obs_enter_graphics();
  errorTexture_ = gs_texture_create(textureWidth, textureHeight, GS_RGBA, 1, &pixels, 0);
  obs_leave_graphics();
}

void Obs3dgsSource::destroyErrorTexture()
{
  if (!errorTexture_)
    return;
  obs_enter_graphics();
  gs_texture_destroy(errorTexture_);
  obs_leave_graphics();
  errorTexture_ = nullptr;
}

void Obs3dgsSource::processRuntimeEvents()
{
  std::vector<nlohmann::json> events;
  {
    std::lock_guard lock(mailbox_->mutex);
    events.swap(mailbox_->events);
  }
  for (const auto &event : events)
    try {
      processRuntimeEvent(event);
    } catch (const std::exception &exception) {
      blog(LOG_WARNING, "[obs-3dgs] Ignored malformed runtime event: %s", exception.what());
    }
}

void Obs3dgsSource::processRuntimeEvent(const nlohmann::json &event)
{
  const auto revision = event.value("revision", std::uint64_t{0});
  const auto type = jsonText(event, "type");
  const auto &payload = event["payload"];
  const bool runtimeRestart = type == "ready" && jsonBoolean(payload, "runtime", false) &&
                              !jsonBoolean(payload, "sceneLoaded", false) && revision > 0 &&
                              revision <= lastRuntimeRevision_;
  if (runtimeRestart)
    lastRuntimeRevision_ = 0;
  if (revision <= lastRuntimeRevision_)
    return;
  lastRuntimeRevision_ = revision;
  if (type == "ready") {
    bridgeReady_ = true;
    const bool sceneLoaded = jsonBoolean(payload, "sceneLoaded", false);
    runtimeReady_ = sceneLoaded;
    {
      std::lock_guard statusLock(statusMutex_);
      runtimeStatus_ = sceneLoaded ? "ready" : "runtime-ready";
      if (sceneLoaded)
        nativeError_.clear();
    }
    progress_ = sceneLoaded ? 1.0 : progress_.load();
    if (sceneLoaded) {
      lastReadyAssetPath_ = activeAssetPath_;
      rollbackAssetPath_.clear();
      assetLoadPending_ = false;
    }
    if (payload.contains("device") && payload["device"].is_object()) {
      std::lock_guard statusLock(statusMutex_);
      rendererName_ = jsonText(payload["device"], "renderer");
    }
    if (sceneLoaded) {
      std::string renderer;
      {
        std::lock_guard statusLock(statusMutex_);
        renderer = rendererName_;
      }
      const auto splatCount = static_cast<std::uint64_t>(
          jsonNumber(payload, "splatCount", 0.0, 0.0, static_cast<double>(std::numeric_limits<std::uint32_t>::max())));
      blog(LOG_INFO, "[obs-3dgs] Scene ready for source %s (%llu splats, renderer: %s)", sourceId_.c_str(),
           static_cast<unsigned long long>(splatCount), renderer.empty() ? "unknown" : renderer.c_str());
    }
    statePending_ = false;
    presetBypassPending_ = false;
    sendState();
    lastStateSent_ = std::chrono::steady_clock::now();
    std::string pendingError;
    {
      std::lock_guard statusLock(statusMutex_);
      pendingError = nativeError_;
    }
    if (!pendingError.empty())
      sendErrorStatus(pendingError);
  } else if (type == "progress") {
    {
      std::lock_guard statusLock(statusMutex_);
      runtimeStatus_ = "loading";
    }
    progress_ = jsonNumber(payload, "progress", 0.0, 0.0, 1.0);
  } else if (type == "cameraChanged" && payload.contains("camera")) {
    updateRuntimeCamera(payload["camera"]);
  } else if (type == "metrics") {
    fps_ = jsonNumber(payload, "fps", 0.0, 0.0, 1000.0);
    p95Ms_ = jsonNumber(payload, "frameP95Ms", 0.0, 0.0, 100000.0);
  } else if (type == "error") {
    const std::string message = jsonText(payload, "message", obs_module_text("Error.Runtime"));
    const std::string code = jsonText(payload, "code", "runtime-error");
    blog(LOG_WARNING, "[obs-3dgs] Runtime error for source %s (%s)", sourceId_.c_str(), code.c_str());
    const bool shouldRollback = jsonText(payload, "code") == "asset-load-failed" &&
                                jsonBoolean(payload, "recoverable", false) && assetLoadPending_ &&
                                !rollbackAssetPath_.empty();
    if (shouldRollback) {
      const std::string rollbackPath = rollbackAssetPath_;
      rollbackAssetPath_.clear();
      const auto mapped = LocalServer::instance().mapAsset(sourceId_, ++assetRevision_, rollbackPath);
      if (mapped.ok) {
        activeAssetPath_ = rollbackPath;
        localAssetUrl_ = mapped.url;
        fileType_ = mapped.fileType;
        largeFileWarning_ = mapped.largeFileWarning;
        frameOnNextLoad_ = false;
        assetLoadPending_ = true;
        obs_data_t *settings = obs_source_get_settings(source_);
        obs_data_set_string(settings, KEY_ASSET, rollbackPath.c_str());
        obs_source_update(source_, settings);
        obs_data_release(settings);
      }
    }
    {
      std::lock_guard statusLock(statusMutex_);
      runtimeStatus_ = "error";
      nativeError_ = message;
    }
  }
}

void Obs3dgsSource::updateRuntimeCamera(const nlohmann::json &camera)
{
  if (!committedSettings_ || isLiveLocked() || !camera.is_object())
    return;
  const auto target =
      camera.contains("target") && camera["target"].is_object() ? camera["target"] : nlohmann::json::object();
  obs_data_set_double(committedSettings_, KEY_CAMERA_TARGET_X, jsonNumber(target, "x", 0.0, -1000000.0, 1000000.0));
  obs_data_set_double(committedSettings_, KEY_CAMERA_TARGET_Y, jsonNumber(target, "y", 0.0, -1000000.0, 1000000.0));
  obs_data_set_double(committedSettings_, KEY_CAMERA_TARGET_Z, jsonNumber(target, "z", 0.0, -1000000.0, 1000000.0));
  obs_data_set_double(committedSettings_, KEY_CAMERA_YAW,
                      normalizeDegrees(jsonNumber(camera, "yawDeg", 35.0, -100000.0, 100000.0)));
  obs_data_set_double(committedSettings_, KEY_CAMERA_PITCH, jsonNumber(camera, "pitchDeg", -12.0, -89.5, 89.5));
  obs_data_set_double(committedSettings_, KEY_CAMERA_ROLL,
                      normalizeDegrees(jsonNumber(camera, "rollDeg", 0.0, -100000.0, 100000.0)));
  obs_data_set_double(committedSettings_, KEY_CAMERA_DISTANCE, jsonNumber(camera, "distance", 4.2, 0.001, 1000000.0));
  obs_data_set_double(committedSettings_, KEY_FOCAL_LENGTH, jsonNumber(camera, "focalLengthMm", 35.0, 16.0, 200.0));
  obs_source_update(source_, committedSettings_);
}

void Obs3dgsSource::sendState(bool allowLockedCameraPreset)
{
  if (!browser_ || !committedSettings_)
    return;
  const char *coordinate = obs_data_get_string(committedSettings_, KEY_COORDINATE);
  const char *backgroundMode = obs_data_get_string(committedSettings_, KEY_BACKGROUND_MODE);
  const char *toneMapping = obs_data_get_string(committedSettings_, KEY_TONE_MAPPING);
  const char *qualityPreset = obs_data_get_string(committedSettings_, KEY_QUALITY_PRESET);

  nlohmann::json payload = {
      {"settingsSchemaVersion", SETTINGS_SCHEMA_VERSION},
      {"locale", effectiveLocale(committedSettings_)},
      {"asset",
       {
           {"localUrl", localAssetUrl_},
           {"fileType", fileType_},
           {"coordinatePreset", coordinate ? coordinate : "auto"},
           {"frameOnLoad", frameOnNextLoad_},
       }},
      {"output",
       {
           {"width", width()},
           {"height", height()},
           {"renderScale", obs_data_get_double(committedSettings_, KEY_RENDER_SCALE)},
           {"targetFps", obs_data_get_int(committedSettings_, KEY_TARGET_FPS)},
           {"background",
            {
                {"mode", backgroundMode ? backgroundMode : "opaque"},
                {"color", colorJson(settingColor(committedSettings_, KEY_BACKGROUND_COLOR))},
            }},
       }},
      {"scene",
       {
           {"position", vec3(committedSettings_, KEY_POSITION_X, KEY_POSITION_Y, KEY_POSITION_Z)},
           {"rotationDeg", vec3(committedSettings_, KEY_ROTATION_X, KEY_ROTATION_Y, KEY_ROTATION_Z)},
           {"scale", obs_data_get_double(committedSettings_, KEY_SCALE)},
           {"opacity", obs_data_get_double(committedSettings_, KEY_OPACITY)},
           {"recolor", colorJson(settingColor(committedSettings_, KEY_RECOLOR))},
           {"maxSh", obs_data_get_int(committedSettings_, KEY_MAX_SH)},
       }},
      {"camera",
       {
           {"target", vec3(committedSettings_, KEY_CAMERA_TARGET_X, KEY_CAMERA_TARGET_Y, KEY_CAMERA_TARGET_Z)},
           {"yawDeg", obs_data_get_double(committedSettings_, KEY_CAMERA_YAW)},
           {"pitchDeg", obs_data_get_double(committedSettings_, KEY_CAMERA_PITCH)},
           {"rollDeg", obs_data_get_double(committedSettings_, KEY_CAMERA_ROLL)},
           {"distance", obs_data_get_double(committedSettings_, KEY_CAMERA_DISTANCE)},
           {"focalLengthMm", obs_data_get_double(committedSettings_, KEY_FOCAL_LENGTH)},
           {"filmGaugeMm", 36},
           {"autoClipping", obs_data_get_bool(committedSettings_, KEY_AUTO_CLIPPING)},
           {"nearClip", obs_data_get_double(committedSettings_, KEY_NEAR_CLIP)},
           {"farClip", obs_data_get_double(committedSettings_, KEY_FAR_CLIP)},
       }},
      {"display",
       {
           {"toneMapping", toneMapping ? toneMapping : "none"},
           {"exposure", obs_data_get_double(committedSettings_, KEY_EXPOSURE)},
       }},
      {"quality",
       {
           {"preset", qualityPreset ? qualityPreset : "balanced"},
           {"lodEnabled", obs_data_get_bool(committedSettings_, KEY_LOD_ENABLED)},
           {"lodSplatCount", obs_data_get_int(committedSettings_, KEY_LOD_COUNT)},
       }},
      {"safety", {{"liveLock", obs_data_get_bool(committedSettings_, KEY_LIVE_LOCK)}}},
  };
  if (allowLockedCameraPreset)
    payload["_allowedMutation"] = "applyPreset";

  sendJavascript({
      {"protocolVersion", 1},
      {"sourceId", sourceId_},
      {"revision", ++messageRevision_},
      {"type", "state"},
      {"payload", payload},
  });
}

void Obs3dgsSource::queueState(bool allowLockedCameraPreset)
{
  if (allowLockedCameraPreset)
    presetBypassPending_ = true;
  statePending_ = true;
}

void Obs3dgsSource::sendJavascript(const nlohmann::json &message)
{
  if (!browser_)
    return;
  const auto json = message.dump();
  calldata_t calldata;
  calldata_init(&calldata);
  calldata_set_string(&calldata, "eventName", "obs3dgs:message");
  calldata_set_string(&calldata, "jsonString", json.c_str());
  proc_handler_call(obs_source_get_proc_handler(browser_), "javascript_event", &calldata);
  calldata_free(&calldata);
}

void Obs3dgsSource::sendVisibility(bool visible)
{
  sendJavascript({
      {"protocolVersion", 1},
      {"sourceId", sourceId_},
      {"revision", ++messageRevision_},
      {"type", "visibility"},
      {"payload", {{"visible", visible}}},
  });
}

void Obs3dgsSource::sendErrorStatus(const std::string &message)
{
  sendJavascript({
      {"protocolVersion", 1},
      {"sourceId", sourceId_},
      {"revision", ++messageRevision_},
      {"type", "command"},
      {"payload", {{"command", "showError"}, {"message", message.substr(0, 320)}}},
  });
}

void Obs3dgsSource::commitSettings(obs_data_t *settings)
{
  obs_data_t *snapshot = snapshotSettings(settings, defaults);
  if (committedSettings_)
    obs_data_release(committedSettings_);
  committedSettings_ = snapshot;
}

bool Obs3dgsSource::isLiveLocked() const
{
  return committedSettings_ && obs_data_get_bool(committedSettings_, KEY_LIVE_LOCK);
}

bool Obs3dgsSource::commandAllowed(const std::string &command) const
{
  if (!isLiveLocked())
    return true;
  static const std::array allowed = {"applyPreset", "previousPreset", "nextPreset", "presetHotkey"};
  return std::find(allowed.begin(), allowed.end(), command) != allowed.end();
}

std::string Obs3dgsSource::effectiveLocale(obs_data_t *settings)
{
  (void)settings;
  return Localization::instance().effectiveLocale();
}

nlohmann::json Obs3dgsSource::colorJson(std::uint64_t color)
{
  return {
      {"r", static_cast<double>(color & 0xFFU) / 255.0},
      {"g", static_cast<double>((color >> 8U) & 0xFFU) / 255.0},
      {"b", static_cast<double>((color >> 16U) & 0xFFU) / 255.0},
  };
}

void registerSource()
{
  obs_source_info info{};
  info.id = SOURCE_ID;
  info.type = OBS_SOURCE_TYPE_INPUT;
  info.output_flags =
      OBS_SOURCE_VIDEO | OBS_SOURCE_CUSTOM_DRAW | OBS_SOURCE_INTERACTION | OBS_SOURCE_COMPOSITE | OBS_SOURCE_SRGB;
  info.icon_type = OBS_ICON_TYPE_BROWSER;
  info.get_name = [](void *) { return obs_module_text("Source.Name"); };
  info.create = [](obs_data_t *settings, obs_source_t *source) -> void * {
    try {
      return new Obs3dgsSource(settings, source);
    } catch (const std::exception &error) {
      blog(LOG_ERROR, "[obs-3dgs] Source creation failed: %s", error.what());
      return nullptr;
    }
  };
  info.destroy = [](void *data) { delete static_cast<Obs3dgsSource *>(data); };
  info.update = [](void *data, obs_data_t *settings) { static_cast<Obs3dgsSource *>(data)->update(settings); };
  info.get_defaults = Obs3dgsSource::defaults;
  info.get_properties = [](void *data) {
    return data ? static_cast<Obs3dgsSource *>(data)->properties() : obs_properties_create();
  };
  info.get_width = [](void *data) { return static_cast<Obs3dgsSource *>(data)->width(); };
  info.get_height = [](void *data) { return static_cast<Obs3dgsSource *>(data)->height(); };
  info.video_render = [](void *data, gs_effect_t *) { static_cast<Obs3dgsSource *>(data)->videoRender(); };
  info.video_tick = [](void *data, float seconds) { static_cast<Obs3dgsSource *>(data)->videoTick(seconds); };
  info.show = [](void *data) { static_cast<Obs3dgsSource *>(data)->show(); };
  info.hide = [](void *data) { static_cast<Obs3dgsSource *>(data)->hide(); };
  info.mouse_click = [](void *data, const obs_mouse_event *event, int32_t type, bool mouseUp, uint32_t clicks) {
    static_cast<Obs3dgsSource *>(data)->mouseClick(event, type, mouseUp, clicks);
  };
  info.mouse_move = [](void *data, const obs_mouse_event *event, bool leave) {
    static_cast<Obs3dgsSource *>(data)->mouseMove(event, leave);
  };
  info.mouse_wheel = [](void *data, const obs_mouse_event *event, int xDelta, int yDelta) {
    static_cast<Obs3dgsSource *>(data)->mouseWheel(event, xDelta, yDelta);
  };
  info.focus = [](void *data, bool focused) { static_cast<Obs3dgsSource *>(data)->focus(focused); };
  info.key_click = [](void *data, const obs_key_event *event, bool keyUp) {
    static_cast<Obs3dgsSource *>(data)->keyClick(event, keyUp);
  };
  info.enum_active_sources = [](void *data, obs_source_enum_proc_t callback, void *parameter) {
    static_cast<Obs3dgsSource *>(data)->enumSources(callback, parameter);
  };
  info.enum_all_sources = info.enum_active_sources;
  info.audio_render = [](void *, uint64_t *, obs_source_audio_mix *, uint32_t, size_t, size_t) { return false; };
  info.missing_files = [](void *data) { return static_cast<Obs3dgsSource *>(data)->missingFiles(); };
  info.video_get_color_space = [](void *, size_t, const gs_color_space *) { return GS_CS_SRGB; };
  obs_register_source(&info);
}

} // namespace obs3dgs
