// SPDX-License-Identifier: GPL-2.0-or-later
#pragma once
#include <string_view>

namespace obs3dgs {
// A rejected replacement can leave a valid frame loaded and an error to report.
inline std::string_view effectiveDockStatus(bool ready, std::string_view status)
{
  return status == "error" ? status : ready ? "ready" : status;
}
} // namespace obs3dgs
