// SPDX-License-Identifier: GPL-2.0-or-later

#include "property-ui.hpp"

#include "property-ui-state.hpp"

namespace obs3dgs {

void setPropertyVisible(obs_properties_t *properties, const char *name, bool visible)
{
  if (auto *property = obs_properties_get(properties, name))
    obs_property_set_visible(property, visible);
}

void applySettingsPageVisibility(obs_properties_t *properties, std::string_view selectedPage)
{
  const auto normalized = normalizeSettingsPage(selectedPage);
  for (const auto &[page, group] : SETTINGS_PAGE_GROUPS)
    setPropertyVisible(properties, group.data(), page == normalized);
}

} // namespace obs3dgs
