# SPDX-License-Identifier: GPL-2.0-or-later

# OBS 32.1.2 configures libobs-metal even when ENABLE_FRONTEND is OFF.
# Its frontend normally enables Swift; SDK-only builds must do that after project().
include_guard(GLOBAL)
if(APPLE)
  enable_language(OBJC OBJCXX Swift)
endif()
