// SPDX-License-Identifier: GPL-2.0-or-later

#pragma once

#include <obs.h>
#include <string>

namespace obs3dgs {

struct SourceSelection {
  std::string uuid;
  bool ambiguousGroup = false;
};

[[nodiscard]] SourceSelection selected3dgsSource(obs_scene_t *scene);

} // namespace obs3dgs
