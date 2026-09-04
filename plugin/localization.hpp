// SPDX-License-Identifier: GPL-2.0-or-later

#pragma once

#include <QString>

#include <mutex>
#include <string>
#include <unordered_map>

namespace obs3dgs {

class Localization final {
public:
  static Localization &instance();

  void initialize();
  [[nodiscard]] QString translate(const char *key) const;
  [[nodiscard]] std::string effectiveLocale() const;

private:
  Localization() = default;

  static std::unordered_map<std::string, QString> loadLocale(const char *name);

  mutable std::mutex mutex_;
  std::unordered_map<std::string, QString> english_;
  std::unordered_map<std::string, QString> chinese_;
};

const char *text(const char *key);

} // namespace obs3dgs
