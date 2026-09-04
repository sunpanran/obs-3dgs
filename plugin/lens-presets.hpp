// SPDX-License-Identifier: GPL-2.0-or-later

#pragma once

#include <array>
#include <cmath>

namespace obs3dgs {

inline constexpr std::array<int, 6> COMMON_LENS_PRESETS = {16, 24, 35, 50, 85, 135};

[[nodiscard]] inline int lensPresetForFocalLength(double focalLength) noexcept
{
  if (!std::isfinite(focalLength))
    return 0;
  for (const int preset : COMMON_LENS_PRESETS) {
    if (std::abs(focalLength - static_cast<double>(preset)) < 0.01)
      return preset;
  }
  return 0;
}

} // namespace obs3dgs
