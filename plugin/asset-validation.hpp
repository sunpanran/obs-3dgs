// SPDX-License-Identifier: GPL-2.0-or-later

#pragma once

#include <cstdint>
#include <filesystem>
#include <optional>
#include <string>
#include <utility>

namespace obs3dgs {

constexpr std::uint64_t ONE_GIB = 1024ULL * 1024ULL * 1024ULL;
constexpr std::uint64_t TWO_GIB = 2ULL * ONE_GIB;

struct HeaderValidation {
  bool ok = false;
  bool largeFileWarning = false;
  std::string error;
};

HeaderValidation validateSceneHeader(const std::filesystem::path &path, const std::string &extension,
                                     std::uint64_t declaredSize);

std::optional<std::pair<std::uint64_t, std::uint64_t>> parseByteRange(const std::string &header,
                                                                      std::uint64_t fileSize);

} // namespace obs3dgs
