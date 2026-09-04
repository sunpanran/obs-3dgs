// SPDX-License-Identifier: GPL-2.0-or-later

#pragma once

#include <QComboBox>
#include <QSignalBlocker>
#include <nlohmann/json.hpp>

#include <algorithm>
#include <cstring>
#include <string>
#include <vector>

namespace obs3dgs {

class DockPresetState {
public:
  void refresh(QComboBox *presetCombo_, std::vector<nlohmann::json> &presets_,
               const std::string &currentSourceId_, const char *serialized, long long activeIndex)
  {
    const std::string json = serialized && std::strlen(serialized) <= 64 * 1024 ? serialized : "[]";
    const bool changed = presetsSourceId_ != currentSourceId_ || presetsJson_ != json;
    if (!changed) {
      if (activeIndex != observedPresetIndex_) {
        QSignalBlocker blocker(presetCombo_);
        presetCombo_->setCurrentIndex(presets_.empty() ? -1 : static_cast<int>(
            std::clamp<long long>(activeIndex, 0, static_cast<long long>(presets_.size()) - 1)));
      }
      observedPresetIndex_ = activeIndex;
      return;
    }
    presetsSourceId_ = currentSourceId_;
    presetsJson_ = json;
    observedPresetIndex_ = activeIndex;
    presets_.clear();
    nlohmann::json parsed = nlohmann::json::array();
    parsed = nlohmann::json::parse(json, nullptr, false);
    if (parsed.is_array()) {
      for (const auto &preset : parsed) {
        if (preset.is_object() && preset.contains("name") && preset["name"].is_string())
          presets_.push_back(preset);
        if (presets_.size() >= 16)
          break;
      }
    }
    QSignalBlocker blocker(presetCombo_);
    presetCombo_->clear();
    for (const auto &preset : presets_)
      presetCombo_->addItem(QString::fromUtf8(preset.value("name", std::string{}).c_str()));
    presetCombo_->setCurrentIndex(presets_.empty() ? -1 : static_cast<int>(
        std::clamp<long long>(activeIndex, 0, static_cast<long long>(presets_.size()) - 1)));
  }

private:
  std::string presetsSourceId_;
  std::string presetsJson_;
  long long observedPresetIndex_ = -1;
};

} // namespace obs3dgs
