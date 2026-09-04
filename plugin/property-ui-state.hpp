// SPDX-License-Identifier: GPL-2.0-or-later

#pragma once

#include <array>
#include <string_view>
#include <utility>

namespace obs3dgs {

inline constexpr const char *KEY_UI_SETTINGS_PAGE = "obs3dgs_ui_settings_page";
inline constexpr const char *KEY_UI_ADVANCED_CAMERA = "obs3dgs_ui_advanced_camera";
inline constexpr std::array<std::string_view, 6> SETTINGS_PAGES = {"scene-file", "transform", "camera",
                                                                   "display",    "quality",   "advanced"};
inline constexpr std::array<std::pair<std::string_view, std::string_view>, 6> SETTINGS_PAGE_GROUPS = {
    std::pair{"scene-file", "scene_file_group"}, std::pair{"transform", "transform_group"},
    std::pair{"camera", "camera_group"},         std::pair{"display", "display_group"},
    std::pair{"quality", "quality_group"},       std::pair{"advanced", "advanced_group"},
};

[[nodiscard]] inline std::string_view normalizeSettingsPage(std::string_view value) noexcept
{
  for (const auto page : SETTINGS_PAGES) {
    if (page == value)
      return page;
  }
  return SETTINGS_PAGES.front();
}

struct ConditionalPropertyVisibility {
  bool backgroundColor = true;
  bool qualityDetails = false;
  bool customSize = false;
  bool advancedCamera = false;
  bool manualClipping = false;
};

[[nodiscard]] inline ConditionalPropertyVisibility propertyVisibility(bool transparentBackground, bool customQuality,
                                                                      bool followsCanvas, bool advancedCamera,
                                                                      bool automaticClipping) noexcept
{
  return {
      .backgroundColor = !transparentBackground,
      .qualityDetails = customQuality,
      .customSize = !followsCanvas,
      .advancedCamera = advancedCamera,
      .manualClipping = advancedCamera && !automaticClipping,
  };
}

} // namespace obs3dgs
