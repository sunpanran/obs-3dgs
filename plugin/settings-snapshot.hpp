// SPDX-License-Identifier: GPL-2.0-or-later

#pragma once

#include <obs-data.h>

namespace obs3dgs {

using SettingsDefaultsCallback = void (*)(obs_data_t *settings);

// OBS keeps default values separately from user values. obs_data_apply copies
// only user values, so a snapshot must install the source defaults before
// applying the user's overrides.
[[nodiscard]] obs_data_t *snapshotSettings(obs_data_t *settings, SettingsDefaultsCallback setDefaults);

// Applies both default and explicit values. This is required when restoring a
// live-locked source because obs_data_apply alone skips default-only values.
void applyEffectiveSettings(obs_data_t *target, obs_data_t *settings);

} // namespace obs3dgs
