// SPDX-License-Identifier: GPL-2.0-or-later

#include "settings-snapshot.hpp"

namespace obs3dgs {

obs_data_t *snapshotSettings(obs_data_t *settings, SettingsDefaultsCallback setDefaults)
{
  obs_data_t *snapshot = obs_data_create();
  if (setDefaults)
    setDefaults(snapshot);
  if (settings)
    obs_data_apply(snapshot, settings);
  return snapshot;
}

void applyEffectiveSettings(obs_data_t *target, obs_data_t *settings)
{
  if (!target || !settings)
    return;
  obs_data_t *effective = obs_data_get_defaults(settings);
  obs_data_apply(effective, settings);
  obs_data_apply(target, effective);
  obs_data_release(effective);
}

} // namespace obs3dgs
