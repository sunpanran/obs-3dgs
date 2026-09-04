// SPDX-License-Identifier: GPL-2.0-or-later

#pragma once

#include <cmath>

namespace obs3dgs {

inline double normalizeDegrees(double value)
{
  if (!std::isfinite(value) || value == 0.0)
    return 0.0;
  // Keep in-range values bit-for-bit stable across native/web round trips.
  if (value >= -180.0 && value < 180.0)
    return value;
  double wrapped = std::fmod(value, 360.0);
  if (wrapped < -180.0)
    wrapped += 360.0;
  else if (wrapped >= 180.0)
    wrapped -= 360.0;
  return wrapped == 0.0 ? 0.0 : wrapped;
}

} // namespace obs3dgs
