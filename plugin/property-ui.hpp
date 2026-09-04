// SPDX-License-Identifier: GPL-2.0-or-later

#pragma once

#include <obs-properties.h>

#include <string_view>

namespace obs3dgs {

void setPropertyVisible(obs_properties_t *properties, const char *name, bool visible);
void applySettingsPageVisibility(obs_properties_t *properties, std::string_view selectedPage);

} // namespace obs3dgs
