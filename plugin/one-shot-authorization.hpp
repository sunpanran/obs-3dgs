// SPDX-License-Identifier: GPL-2.0-or-later

#pragma once

#include <atomic>

namespace obs3dgs {

// Carries an authorization across obs_source_update(), whose callback is
// deferred for video sources, and consumes it exactly once in update().
class OneShotAuthorization final {
public:
  void grant() noexcept
  {
    granted_.store(true);
  }

  [[nodiscard]] bool consume() noexcept
  {
    return granted_.exchange(false);
  }

private:
  std::atomic_bool granted_{false};
};

} // namespace obs3dgs
