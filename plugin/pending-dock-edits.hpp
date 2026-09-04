// SPDX-License-Identifier: GPL-2.0-or-later

#pragma once

#include <map>
#include <string>
#include <utility>

namespace obs3dgs {

// Each queued edit retains the source that was selected when the user made it.
class PendingDockEdits {
public:
  using Key = std::pair<std::string, std::string>;
  using Edits = std::map<Key, double>;

  void set(const std::string &sourceId, const std::string &setting, double value)
  {
    edits_[{sourceId, setting}] = value;
  }

  Edits take()
  {
    return std::exchange(edits_, {});
  }

private:
  Edits edits_;
};

} // namespace obs3dgs
