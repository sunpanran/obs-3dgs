// SPDX-License-Identifier: GPL-2.0-or-later

#pragma once

namespace obs3dgs {

inline const char *localeForObs(const char *locale) noexcept
{
  return locale && (locale[0] == 'z' || locale[0] == 'Z') && (locale[1] == 'h' || locale[1] == 'H') ? "zh-CN" : "en-US";
}

} // namespace obs3dgs
