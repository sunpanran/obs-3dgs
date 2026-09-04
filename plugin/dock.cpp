// SPDX-License-Identifier: GPL-2.0-or-later

#include "dock.hpp"

#include "lens-presets.hpp"
#include "dock-preset-state.hpp"
#include "dock-status.hpp"
#include "pending-dock-edits.hpp"
#include "scalar-control.hpp"
#include "source.hpp"
#include "localization.hpp"

#include <obs-frontend-api.h>
#include <obs-module.h>

#include <QCheckBox>
#include <QAbstractButton>
#include <QComboBox>
#include "dock-visibility.hpp"

#include <QDockWidget>
#include <QDoubleSpinBox>
#include <QFormLayout>
#include <QFrame>
#include <QGridLayout>
#include <QHBoxLayout>
#include <QInputDialog>
#include <QLabel>
#include <QLineEdit>
#include <QMessageBox>
#include <QPushButton>
#include <QScrollArea>
#include <QSignalBlocker>
#include <QSlider>
#include <QTimer>
#include <QVBoxLayout>
#include <QVariant>

#include <nlohmann/json.hpp>

#include <algorithm>
#include <cmath>
#include <cstring>
#include <functional>
#include <map>
#include <numbers>
#include <string>
#include <utility>
#include <vector>

#define obs_module_text(key) obs3dgs::text(key)

namespace obs3dgs {
namespace {

constexpr const char *DOCK_ID = "obs-3dgs-control-dock";
constexpr const char *SOURCE_ID = "obs_3dgs_source";
constexpr const char *KEY_PRESETS = "camera_presets_json";
constexpr const char *KEY_ACTIVE_PRESET = "active_camera_preset";
constexpr const char *I18N_KEY_PROPERTY = "obs3dgsI18nKey";

void setI18nKey(QWidget *widget, const char *key)
{
  widget->setProperty(I18N_KEY_PROPERTY, QString::fromUtf8(key));
}

QLabel *translatedLabel(const char *key, QWidget *parent)
{
  auto *label = new QLabel(QString::fromUtf8(obs_module_text(key)), parent);
  setI18nKey(label, key);
  return label;
}


QFrame *separator(QWidget *parent)
{
  auto *line = new QFrame(parent);
  line->setFrameShape(QFrame::HLine);
  line->setFrameShadow(QFrame::Sunken);
  return line;
}

QLabel *sectionLabel(const char *key, QWidget *parent)
{
  auto *label = translatedLabel(key, parent);
  QFont font = label->font();
  font.setBold(true);
  label->setFont(font);
  return label;
}

std::string selected3dgsUuid()
{
  obs_source_t *sceneSource = obs_frontend_get_current_scene();
  if (!sceneSource)
    return {};
  obs_scene_t *scene = obs_scene_from_source(sceneSource);
  std::string uuid;
  if (scene) {
    obs_scene_enum_items(
        scene,
        [](obs_scene_t *, obs_sceneitem_t *item, void *parameter) {
          if (!obs_sceneitem_selected(item))
            return true;
          obs_source_t *source = obs_sceneitem_get_source(item);
          if (!source || std::string(obs_source_get_unversioned_id(source)) != SOURCE_ID)
            return true;
          const char *sourceUuid = obs_source_get_uuid(source);
          if (sourceUuid)
            *static_cast<std::string *>(parameter) = sourceUuid;
          return false;
        },
        &uuid);
  }
  obs_source_release(sceneSource);
  return uuid;
}

class ControlDock final : public QWidget {
public:
  explicit ControlDock(QWidget *parent = nullptr) : QWidget(parent)
  {
    setObjectName(QStringLiteral("obs3dgsControlDockContents"));
    auto *root = new QVBoxLayout(this);
    root->setContentsMargins(10, 10, 10, 10);
    root->setSpacing(8);

    auto *top = new QGridLayout();
    top->addWidget(translatedLabel("Dock.Source", this), 0, 0);
    sourceCombo_ = new QComboBox(this);
    top->addWidget(sourceCombo_, 0, 1, 1, 2);
    status_ = new QLabel(QString::fromUtf8(obs_module_text("Dock.NoSource")), this);
    top->addWidget(status_, 1, 0, 1, 3);
    top->addWidget(translatedLabel("Quality.Preset", this), 2, 0);
    quality_ = new QComboBox(this);
    quality_->addItem(QString::fromUtf8(obs_module_text("Quality.Performance")), "performance");
    quality_->addItem(QString::fromUtf8(obs_module_text("Quality.Balanced")), "balanced");
    quality_->addItem(QString::fromUtf8(obs_module_text("Quality.Quality")), "quality");
    quality_->addItem(QString::fromUtf8(obs_module_text("Quality.Custom")), "custom");
    top->addWidget(quality_, 2, 1);
    liveLock_ = new QCheckBox(QString::fromUtf8(obs_module_text("Safety.LiveLock")), this);
    setI18nKey(liveLock_, "Safety.LiveLock");
    top->addWidget(liveLock_, 2, 2);
    top->addWidget(translatedLabel("Dock.Language", this), 3, 0);
    language_ = new QComboBox(this);
    language_->addItem(QString::fromUtf8(obs_module_text("Language.Auto")), "auto");
    language_->addItem(QString::fromUtf8(obs_module_text("Language.Chinese")), "zh-CN");
    language_->addItem(QString::fromUtf8(obs_module_text("Language.English")), "en-US");
    const int languageIndex = language_->findData(QString::fromStdString(Localization::instance().selection()));
    language_->setCurrentIndex(std::max(0, languageIndex));
    top->addWidget(language_, 3, 1, 1, 2);
    root->addLayout(top);

    auto *scroll = new QScrollArea(this);
    scroll->setWidgetResizable(true);
    scroll->setFrameShape(QFrame::NoFrame);
    auto *contents = new QWidget(scroll);
    auto *controls = new QVBoxLayout(contents);
    controls->setContentsMargins(0, 4, 0, 4);
    controls->setSpacing(6);

    controls->addWidget(sectionLabel("Transform.Title", contents));
    positionX_ = addScalar(controls, "Transform.PositionX", -1000, 1000, 0.01, false, "position_x");
    positionY_ = addScalar(controls, "Transform.PositionY", -1000, 1000, 0.01, false, "position_y");
    positionZ_ = addScalar(controls, "Transform.PositionZ", -1000, 1000, 0.01, false, "position_z");
    rotationX_ = addScalar(controls, "Transform.RotationX", -180, 180, 0.1, false, "rotation_x");
    rotationY_ = addScalar(controls, "Transform.RotationY", -180, 180, 0.1, false, "rotation_y");
    rotationZ_ = addScalar(controls, "Transform.RotationZ", -180, 180, 0.1, false, "rotation_z");
    sceneScale_ = addScalar(controls, "Transform.Scale", 0.001, 1000, 0.01, true, "scene_scale");
    auto *resetScene = new QPushButton(QString::fromUtf8(obs_module_text("Transform.Reset")), contents);
    setI18nKey(resetScene, "Transform.Reset");
    connect(resetScene, &QPushButton::clicked, this, [this] { resetSceneTransform(); });
    lockedControls_.push_back(resetScene);
    controls->addWidget(resetScene);
    controls->addWidget(separator(contents));

    controls->addWidget(sectionLabel("Camera.Title", contents));
    auto *lensRail = new QHBoxLayout();
    for (const int focalLength : COMMON_LENS_PRESETS) {
      auto *button = new QPushButton(QString::number(focalLength), contents);
      button->setToolTip(QStringLiteral("%1 mm").arg(focalLength));
      button->setProperty("obs3dgsLensButton", true);
      connect(button, &QPushButton::clicked, this, [this, focalLength] { setDouble("focal_length_mm", focalLength); });
      lensRail->addWidget(button);
      lockedControls_.push_back(button);
    }
    auto *millimetres = new QLabel(QStringLiteral("mm"), contents);
    lensRail->addWidget(millimetres);
    controls->addLayout(lensRail);
    focalLength_ = addScalar(controls, "Camera.FocalLengthShort", 16, 200, 1, false, "focal_length_mm");
    focalLength_->setSuffix(QStringLiteral(" mm"));
    cameraYaw_ = addScalar(controls, "Camera.Yaw", -180, 180, 0.1, false, "camera_yaw");
    cameraPitch_ = addScalar(controls, "Camera.Pitch", -89.5, 89.5, 0.1, false, "camera_pitch");
    cameraDistance_ = addScalar(controls, "Camera.Distance", 0.001, 10000, 0.01, true, "camera_distance");
    fov_ = new QLabel(contents);
    fov_->setStyleSheet(QStringLiteral("color: palette(mid);"));
    controls->addWidget(fov_);
    auto *cameraButtons = new QGridLayout();
    frameAll_ = new QPushButton(QString::fromUtf8(obs_module_text("Camera.FrameAll")), contents);
    resetCamera_ = new QPushButton(QString::fromUtf8(obs_module_text("Camera.Reset")), contents);
    interactive_ = new QPushButton(QString::fromUtf8(obs_module_text("Camera.Interaction")), contents);
    setI18nKey(frameAll_, "Camera.FrameAll");
    setI18nKey(resetCamera_, "Camera.Reset");
    setI18nKey(interactive_, "Camera.Interaction");
    cameraButtons->addWidget(frameAll_, 0, 0);
    cameraButtons->addWidget(resetCamera_, 0, 1);
    cameraButtons->addWidget(interactive_, 1, 0, 1, 2);
    connect(frameAll_, &QPushButton::clicked, this, [this] { command("frameAll"); });
    connect(resetCamera_, &QPushButton::clicked, this, [this] { command("resetCamera"); });
    connect(interactive_, &QPushButton::clicked, this, [this] { openInteraction(); });
    lockedControls_.insert(lockedControls_.end(), {frameAll_, resetCamera_, interactive_});
    controls->addLayout(cameraButtons);
    controls->addWidget(separator(contents));

    controls->addWidget(sectionLabel("Presets.Title", contents));
    presetCombo_ = new QComboBox(contents);
    controls->addWidget(presetCombo_);
    auto *presetButtons = new QGridLayout();
    applyPreset_ = new QPushButton(QString::fromUtf8(obs_module_text("Presets.Apply")), contents);
    savePreset_ = new QPushButton(QString::fromUtf8(obs_module_text("Presets.Save")), contents);
    deletePreset_ = new QPushButton(QString::fromUtf8(obs_module_text("Presets.Delete")), contents);
    previousPreset_ = new QPushButton(QString::fromUtf8(obs_module_text("Presets.Previous")), contents);
    nextPreset_ = new QPushButton(QString::fromUtf8(obs_module_text("Presets.Next")), contents);
    setI18nKey(applyPreset_, "Presets.Apply");
    setI18nKey(savePreset_, "Presets.Save");
    setI18nKey(deletePreset_, "Presets.Delete");
    setI18nKey(previousPreset_, "Presets.Previous");
    setI18nKey(nextPreset_, "Presets.Next");
    presetButtons->addWidget(applyPreset_, 0, 0);
    presetButtons->addWidget(savePreset_, 0, 1);
    presetButtons->addWidget(deletePreset_, 0, 2);
    presetButtons->addWidget(previousPreset_, 1, 0, 1, 2);
    presetButtons->addWidget(nextPreset_, 1, 2);
    controls->addLayout(presetButtons);
    connect(applyPreset_, &QPushButton::clicked, this, [this] { applyPreset(); });
    connect(savePreset_, &QPushButton::clicked, this, [this] { savePreset(); });
    connect(deletePreset_, &QPushButton::clicked, this, [this] { deletePreset(); });
    connect(previousPreset_, &QPushButton::clicked, this, [this] { stepPreset(-1); });
    connect(nextPreset_, &QPushButton::clicked, this, [this] { stepPreset(1); });
    lockedControls_.insert(lockedControls_.end(), {savePreset_, deletePreset_});

    controls->addStretch(1);
    scroll->setWidget(contents);
    root->addWidget(scroll, 1);

    connect(sourceCombo_, &QComboBox::currentIndexChanged, this, [this] { refresh(); });
    connect(quality_, &QComboBox::currentIndexChanged, this, [this] {
      if (!syncing_)
        setString("quality_preset", quality_->currentData().toString().toStdString());
    });
    connect(liveLock_, &QCheckBox::toggled, this, [this](bool checked) {
      if (!syncing_)
        Obs3dgsSource::setSetting(currentSourceId_, "live_lock", checked);
      updateLockUi(checked);
    });
    connect(language_, &QComboBox::currentIndexChanged, this, [this] {
      if (syncing_)
        return;
      Localization::instance().setSelection(language_->currentData().toString().toStdString());
      retranslate();
      Obs3dgsSource::notifyLocaleChanged();
      status_->setText(QString::fromUtf8(obs_module_text("Dock.ReopenProperties")));
    });

    changeTimer_.setInterval(34);
    changeTimer_.setSingleShot(true);
    connect(&changeTimer_, &QTimer::timeout, this, [this] { flushPendingDouble(); });
    refreshTimer_.setInterval(250);
    connect(&refreshTimer_, &QTimer::timeout, this, [this] { refresh(); });
    refreshTimer_.start();
    refresh();
  }

private:
  ScalarControl *addScalar(QVBoxLayout *layout, const char *labelKey, double minimum, double maximum, double step,
                           bool logarithmic, const char *setting)
  {
    auto *control = new ScalarControl(QString::fromUtf8(obs_module_text(labelKey)), labelKey,
                                      minimum, maximum, step, logarithmic, this);
    control->onChanged([this, setting](double value) { setDouble(setting, value); });
    layout->addWidget(control);
    lockedControls_.push_back(control);
    return control;
  }

  void refresh()
  {
    const auto summaries = Obs3dgsSource::sourceSummaries();
    const bool automatic = sourceCombo_->currentIndex() <= 0;
    const std::string manualSelection =
        automatic ? std::string{} : sourceCombo_->currentData().toString().toStdString();
    bool sourceListChanged = sourceCombo_->count() != static_cast<int>(summaries.size()) + 1;
    for (std::size_t index = 0; !sourceListChanged && index < summaries.size(); ++index) {
      sourceListChanged =
          sourceCombo_->itemData(static_cast<int>(index) + 1).toString().toStdString() != summaries[index].uuid ||
          sourceCombo_->itemText(static_cast<int>(index) + 1) != QString::fromUtf8(summaries[index].name.c_str());
    }
    if (sourceListChanged) {
      QSignalBlocker blocker(sourceCombo_);
      sourceCombo_->clear();
      sourceCombo_->addItem(QString::fromUtf8(obs_module_text("Dock.AutoSource")), "");
      for (const auto &summary : summaries)
        sourceCombo_->addItem(QString::fromUtf8(summary.name.c_str()), QString::fromStdString(summary.uuid));
      if (!automatic) {
        const int index = sourceCombo_->findData(QString::fromStdString(manualSelection));
        sourceCombo_->setCurrentIndex(index >= 0 ? index : 0);
      }
    }

    const std::string resolved =
        sourceCombo_->currentIndex() <= 0 ? selected3dgsUuid() : sourceCombo_->currentData().toString().toStdString();
    if (resolved != currentSourceId_) {
      currentSourceId_ = resolved;
      refreshFromSource();
    } else {
      updateStatus(summaries);
      refreshFromSource(false);
    }
  }

  void updateStatus(const std::vector<SourceSummary> &summaries)
  {
    const auto found = std::find_if(summaries.begin(), summaries.end(),
                                    [this](const auto &summary) { return summary.uuid == currentSourceId_; });
    if (found == summaries.end()) {
      status_->setText(QString::fromUtf8(obs_module_text("Dock.NoSource")));
      return;
    }
    const auto displayStatus = effectiveDockStatus(found->ready, found->status);
    if (displayStatus == "ready") {
      status_->setText(QString::fromUtf8(obs_module_text("Dock.ReadyStatus")).arg(found->fps, 0, 'f', 1));
    } else if (displayStatus == "loading") {
      status_->setText(
          QString::fromUtf8(obs_module_text("Dock.LoadingStatus")).arg(found->progress * 100.0, 0, 'f', 0));
    } else if (displayStatus == "waiting") {
      status_->setText(QString::fromUtf8(obs_module_text("Dock.Waiting")));
    } else if (displayStatus == "runtime-ready") {
      status_->setText(QString::fromUtf8(obs_module_text("Dock.RuntimeReady")));
    } else if (displayStatus == "large-file-warning") {
      status_->setText(QString::fromUtf8(obs_module_text("Dock.LargeFileWarning")));
    } else if (displayStatus == "error") {
      status_->setText(QString::fromUtf8(obs_module_text("Dock.Error")));
    } else {
      status_->setText(QString::fromUtf8(found->status.c_str()));
    }
  }

  void refreshFromSource(bool forceRefresh = true)
  {
    if (currentSourceId_.empty()) {
      setControlsAvailable(false);
      return;
    }
    obs_source_t *source = obs_get_source_by_uuid(currentSourceId_.c_str());
    if (!source)
      return;
    obs_data_t *settings = obs_source_get_settings(source);
    syncing_ = true;
    positionX_->setValue(obs_data_get_double(settings, "position_x"), forceRefresh);
    positionY_->setValue(obs_data_get_double(settings, "position_y"), forceRefresh);
    positionZ_->setValue(obs_data_get_double(settings, "position_z"), forceRefresh);
    rotationX_->setValue(obs_data_get_double(settings, "rotation_x"), forceRefresh);
    rotationY_->setValue(obs_data_get_double(settings, "rotation_y"), forceRefresh);
    rotationZ_->setValue(obs_data_get_double(settings, "rotation_z"), forceRefresh);
    sceneScale_->setValue(obs_data_get_double(settings, "scene_scale"), forceRefresh);
    focalLength_->setValue(obs_data_get_double(settings, "focal_length_mm"), forceRefresh);
    cameraYaw_->setValue(obs_data_get_double(settings, "camera_yaw"), forceRefresh);
    cameraPitch_->setValue(obs_data_get_double(settings, "camera_pitch"), forceRefresh);
    cameraDistance_->setValue(obs_data_get_double(settings, "camera_distance"), forceRefresh);
    const auto qualityValue = QString::fromUtf8(obs_data_get_string(settings, "quality_preset"));
    quality_->setCurrentIndex(std::max(0, quality_->findData(qualityValue)));
    liveLock_->setChecked(obs_data_get_bool(settings, "live_lock"));
    updateFov(obs_data_get_double(settings, "focal_length_mm"));
    readPresets(settings);
    syncing_ = false;
    updateLockUi(liveLock_->isChecked());
    setControlsAvailable(true);
    obs_data_release(settings);
    obs_source_release(source);
  }

  void setDouble(const std::string &name, double value)
  {
    if (syncing_ || currentSourceId_.empty())
      return;
    pendingDouble_.set(currentSourceId_, name, value);
    if (!changeTimer_.isActive())
      changeTimer_.start();
    if (name == "focal_length_mm")
      updateFov(value);
  }

  void flushPendingDouble()
  {
    for (const auto &[target, value] : pendingDouble_.take())
      Obs3dgsSource::setSetting(target.first, target.second.c_str(), value);
  }

  void setString(const char *name, const std::string &value)
  {
    if (!currentSourceId_.empty())
      Obs3dgsSource::setSetting(currentSourceId_, name, value);
  }

  void command(const std::string &name)
  {
    if (!currentSourceId_.empty())
      Obs3dgsSource::invokeCommand(currentSourceId_, name);
  }

  void openInteraction()
  {
    if (currentSourceId_.empty())
      return;
    obs_source_t *source = obs_get_source_by_uuid(currentSourceId_.c_str());
    if (source) {
      obs_frontend_open_source_interaction(source);
      obs_source_release(source);
    }
  }

  void resetSceneTransform()
  {
    for (const auto &[key, value] : std::vector<std::pair<const char *, double>>{
             {"position_x", 0.0},
             {"position_y", 0.0},
             {"position_z", 0.0},
             {"rotation_x", 0.0},
             {"rotation_y", 0.0},
             {"rotation_z", 0.0},
             {"scene_scale", 1.0},
         }) {
      Obs3dgsSource::setSetting(currentSourceId_, key, value);
    }
  }

  void updateFov(double focalLength)
  {
    double aspect = 16.0 / 9.0;
    obs_source_t *source = currentSourceId_.empty() ? nullptr : obs_get_source_by_uuid(currentSourceId_.c_str());
    if (source) {
      obs_data_t *settings = obs_source_get_settings(source);
      if (!obs_data_get_bool(settings, "follow_canvas") && obs_data_get_int(settings, "output_height") > 0) {
        aspect = static_cast<double>(obs_data_get_int(settings, "output_width")) /
                 static_cast<double>(obs_data_get_int(settings, "output_height"));
      } else {
        obs_video_info info{};
        if (obs_get_video_info(&info) && info.base_height > 0)
          aspect = static_cast<double>(info.base_width) / info.base_height;
      }
      obs_data_release(settings);
      obs_source_release(source);
    }
    const double filmWidth = aspect >= 1.0 ? 36.0 : 36.0 * aspect;
    const double filmHeight = aspect >= 1.0 ? 36.0 / aspect : 36.0;
    const double horizontal = 2.0 * std::atan(filmWidth / (2.0 * focalLength)) * 180.0 / std::numbers::pi;
    const double vertical = 2.0 * std::atan(filmHeight / (2.0 * focalLength)) * 180.0 / std::numbers::pi;
    fov_->setText(
        QString::fromUtf8(obs_module_text("Camera.FovReadout")).arg(horizontal, 0, 'f', 1).arg(vertical, 0, 'f', 1));
  }

  void readPresets(obs_data_t *settings)
  {
    presetState_.refresh(presetCombo_, presets_, currentSourceId_,
                         obs_data_get_string(settings, KEY_PRESETS), obs_data_get_int(settings, KEY_ACTIVE_PRESET));
  }

  void applyPreset()
  {
    const int index = presetCombo_->currentIndex();
    if (index < 0 || index >= static_cast<int>(presets_.size()))
      return;
    Obs3dgsSource::invokeCommand(currentSourceId_, "preset:" + std::to_string(index), true);
  }

  void savePreset()
  {
    if (currentSourceId_.empty())
      return;
    bool accepted = false;
    const QString name =
        QInputDialog::getText(this, QString::fromUtf8(obs_module_text("Presets.Save")),
                              QString::fromUtf8(obs_module_text("Presets.Name")), QLineEdit::Normal, {}, &accepted)
            .trimmed();
    if (!accepted || name.isEmpty())
      return;
    const QString safeName = name.left(64);
    obs_source_t *source = obs_get_source_by_uuid(currentSourceId_.c_str());
    if (!source)
      return;
    obs_data_t *settings = obs_source_get_settings(source);
    nlohmann::json preset = {
        {"name", safeName.toStdString()},
        {"target",
         {
             {"x", obs_data_get_double(settings, "camera_target_x")},
             {"y", obs_data_get_double(settings, "camera_target_y")},
             {"z", obs_data_get_double(settings, "camera_target_z")},
         }},
        {"yawDeg", obs_data_get_double(settings, "camera_yaw")},
        {"pitchDeg", obs_data_get_double(settings, "camera_pitch")},
        {"rollDeg", obs_data_get_double(settings, "camera_roll")},
        {"distance", obs_data_get_double(settings, "camera_distance")},
        {"focalLengthMm", obs_data_get_double(settings, "focal_length_mm")},
    };
    obs_data_release(settings);
    obs_source_release(source);

    const auto duplicate = std::find_if(presets_.begin(), presets_.end(), [&safeName](const auto &existing) {
      return QString::fromStdString(existing.value("name", std::string{})).compare(safeName, Qt::CaseInsensitive) == 0;
    });
    if (duplicate != presets_.end())
      *duplicate = std::move(preset);
    else if (presets_.size() < 16)
      presets_.push_back(std::move(preset));
    else {
      QMessageBox::information(this, QString::fromUtf8(obs_module_text("Presets.Title")),
                               QString::fromUtf8(obs_module_text("Presets.Limit")));
      return;
    }
    persistPresets();
  }

  void deletePreset()
  {
    const int index = presetCombo_->currentIndex();
    if (index < 0 || index >= static_cast<int>(presets_.size()))
      return;
    presets_.erase(presets_.begin() + index);
    persistPresets();
  }

  void stepPreset(int direction)
  {
    if (presets_.empty())
      return;
    Obs3dgsSource::invokeCommand(currentSourceId_, direction < 0 ? "previousPreset" : "nextPreset", true);
  }

  void persistPresets()
  {
    const nlohmann::json value = presets_;
    Obs3dgsSource::setSetting(currentSourceId_, KEY_PRESETS, value.dump());
  }

  void updateLockUi(bool locked)
  {
    for (auto *widget : lockedControls_)
      widget->setEnabled(!locked && !currentSourceId_.empty());
    quality_->setEnabled(!locked && !currentSourceId_.empty());
    applyPreset_->setEnabled(!presets_.empty() && !currentSourceId_.empty());
    previousPreset_->setEnabled(!presets_.empty() && !currentSourceId_.empty());
    nextPreset_->setEnabled(!presets_.empty() && !currentSourceId_.empty());
  }

  void retranslate()
  {
    const auto widgets = findChildren<QWidget *>();
    for (auto *widget : widgets) {
      const QString key = widget->property(I18N_KEY_PROPERTY).toString();
      if (key.isEmpty())
        continue;
      const QString value = Localization::instance().translate(key.toUtf8().constData());
      if (auto *label = qobject_cast<QLabel *>(widget))
        label->setText(value);
      else if (auto *button = qobject_cast<QAbstractButton *>(widget))
        button->setText(value);
    }
    if (sourceCombo_->count() > 0)
      sourceCombo_->setItemText(0, QString::fromUtf8(obs_module_text("Dock.AutoSource")));
    quality_->setItemText(0, QString::fromUtf8(obs_module_text("Quality.Performance")));
    quality_->setItemText(1, QString::fromUtf8(obs_module_text("Quality.Balanced")));
    quality_->setItemText(2, QString::fromUtf8(obs_module_text("Quality.Quality")));
    quality_->setItemText(3, QString::fromUtf8(obs_module_text("Quality.Custom")));
    language_->setItemText(0, QString::fromUtf8(obs_module_text("Language.Auto")));
    language_->setItemText(1, QString::fromUtf8(obs_module_text("Language.Chinese")));
    language_->setItemText(2, QString::fromUtf8(obs_module_text("Language.English")));
    updateFov(focalLength_ ? focalLength_->value() : 35.0);
    QWidget *parent = this;
    while (parent && !qobject_cast<QDockWidget *>(parent))
      parent = parent->parentWidget();
    if (parent)
      parent->setWindowTitle(QString::fromUtf8(obs_module_text("Dock.Title")));
  }

  void setControlsAvailable(bool available)
  {
    liveLock_->setEnabled(available);
    for (auto *widget : lockedControls_)
      widget->setEnabled(available && !liveLock_->isChecked());
    quality_->setEnabled(available && !liveLock_->isChecked());
    applyPreset_->setEnabled(available && !presets_.empty());
    previousPreset_->setEnabled(available && !presets_.empty());
    nextPreset_->setEnabled(available && !presets_.empty());
  }

  QComboBox *sourceCombo_ = nullptr;
  QLabel *status_ = nullptr;
  QComboBox *quality_ = nullptr;
  QCheckBox *liveLock_ = nullptr;
  QComboBox *language_ = nullptr;
  ScalarControl *positionX_ = nullptr;
  ScalarControl *positionY_ = nullptr;
  ScalarControl *positionZ_ = nullptr;
  ScalarControl *rotationX_ = nullptr;
  ScalarControl *rotationY_ = nullptr;
  ScalarControl *rotationZ_ = nullptr;
  ScalarControl *sceneScale_ = nullptr;
  ScalarControl *focalLength_ = nullptr;
  ScalarControl *cameraYaw_ = nullptr;
  ScalarControl *cameraPitch_ = nullptr;
  ScalarControl *cameraDistance_ = nullptr;
  QLabel *fov_ = nullptr;
  QPushButton *frameAll_ = nullptr;
  QPushButton *resetCamera_ = nullptr;
  QPushButton *interactive_ = nullptr;
  QComboBox *presetCombo_ = nullptr;
  QPushButton *applyPreset_ = nullptr;
  QPushButton *savePreset_ = nullptr;
  QPushButton *deletePreset_ = nullptr;
  QPushButton *previousPreset_ = nullptr;
  QPushButton *nextPreset_ = nullptr;
  std::vector<QWidget *> lockedControls_;
  std::vector<nlohmann::json> presets_;
  PendingDockEdits pendingDouble_;
  DockPresetState presetState_;
  QTimer changeTimer_;
  QTimer refreshTimer_;
  std::string currentSourceId_;
  bool syncing_ = false;
};

QWidget *dockContents = nullptr;

} // namespace

QWidget *createControlDock()
{
  if (!dockContents)
    dockContents = new ControlDock();
  return dockContents;
}

void destroyControlDock()
{
  obs_frontend_remove_dock(DOCK_ID);
  dockContents = nullptr;
}

void showControlDock()
{
  showDockContents(dockContents);
}

} // namespace obs3dgs
