// SPDX-License-Identifier: GPL-2.0-or-later

#include "asset-validation.hpp"

#include <algorithm>
#include <array>
#include <charconv>
#include <fstream>
#include <sstream>
#include <string_view>
#include <vector>

namespace obs3dgs {
namespace {

constexpr std::size_t MAX_HEADER_BYTES = 64ULL * 1024ULL;

bool startsWith(const std::vector<unsigned char> &bytes, std::initializer_list<unsigned char> signature)
{
  return bytes.size() >= signature.size() && std::equal(signature.begin(), signature.end(), bytes.begin());
}

std::optional<std::uint64_t> parseUnsigned(std::string_view value)
{
  if (value.empty())
    return std::nullopt;
  std::uint64_t result = 0;
  const auto parsed = std::from_chars(value.data(), value.data() + value.size(), result);
  if (parsed.ec != std::errc{} || parsed.ptr != value.data() + value.size())
    return std::nullopt;
  return result;
}

std::optional<std::uint64_t> plyScalarSize(std::string_view type)
{
  if (type == "char" || type == "uchar" || type == "int8" || type == "uint8")
    return 1;
  if (type == "short" || type == "ushort" || type == "int16" || type == "uint16")
    return 2;
  if (type == "int" || type == "uint" || type == "float" || type == "int32" || type == "uint32" || type == "float32")
    return 4;
  if (type == "double" || type == "int64" || type == "uint64" || type == "float64")
    return 8;
  return std::nullopt;
}

} // namespace

HeaderValidation validateSceneHeader(const std::filesystem::path &path, const std::string &extension,
                                     std::uint64_t declaredSize)
{
  HeaderValidation result;
  if (declaredSize == 0) {
    result.error = "Error.AssetEmpty";
    return result;
  }
  if (extension != ".rad" && declaredSize > TWO_GIB) {
    result.error = "Error.AssetTooLarge";
    return result;
  }

  std::ifstream stream(path, std::ios::binary);
  if (!stream) {
    result.error = "Error.AssetOpen";
    return result;
  }
  const auto headerLength = static_cast<std::size_t>(std::min<std::uint64_t>(declaredSize, MAX_HEADER_BYTES));
  std::vector<unsigned char> bytes(headerLength);
  stream.read(reinterpret_cast<char *>(bytes.data()), static_cast<std::streamsize>(bytes.size()));
  bytes.resize(static_cast<std::size_t>(stream.gcount()));

  if (extension == ".ply") {
    const std::string header(bytes.begin(), bytes.end());
    if (header.rfind("ply\n", 0) != 0 && header.rfind("ply\r\n", 0) != 0) {
      result.error = "Error.PlySignature";
      return result;
    }
    if (header.find("format binary_little_endian 1.0") == std::string::npos) {
      result.error = "Error.PlyEncoding";
      return result;
    }
    const auto endHeader = header.find("end_header");
    if (endHeader == std::string::npos) {
      result.error = "Error.PlyHeader";
      return result;
    }
    const auto dataOffsetMarker = header.find('\n', endHeader);
    if (dataOffsetMarker == std::string::npos) {
      result.error = "Error.PlyHeader";
      return result;
    }
    const std::uint64_t dataOffset = dataOffsetMarker + 1;

    std::istringstream lines(header.substr(0, static_cast<std::size_t>(dataOffset)));
    std::string line;
    std::uint64_t vertexCount = 0;
    std::uint64_t elementCount = 0;
    std::uint64_t elementStride = 0;
    std::uint64_t minimumDataBytes = 0;
    bool vertexElementFound = false;
    bool elementFound = false;
    bool invalidProperties = false;
    const auto finishElement = [&] {
      if (!elementFound || elementCount == 0)
        return true;
      const auto available = declaredSize - dataOffset - minimumDataBytes;
      if (elementStride == 0 || elementCount > available / elementStride)
        return false;
      minimumDataBytes += elementCount * elementStride;
      return true;
    };
    while (std::getline(lines, line)) {
      if (!line.empty() && line.back() == '\r')
        line.pop_back();
      std::istringstream tokens(line);
      std::string keyword;
      tokens >> keyword;
      if (keyword == "element") {
        if (!finishElement()) {
          result.error = "Error.PlyTruncated";
          return result;
        }
        std::string name;
        std::string countText;
        tokens >> name >> countText;
        const auto count = parseUnsigned(countText);
        if (!count || *count > 500'000'000ULL) {
          result.error = "Error.PlyCountInvalid";
          return result;
        }
        elementCount = *count;
        elementStride = 0;
        elementFound = true;
        if (name == "vertex") {
          if (*count == 0 || vertexElementFound) {
            result.error = "Error.PlyCountInvalid";
            return result;
          }
          vertexCount = *count;
          vertexElementFound = true;
        }
      } else if (keyword == "property" && elementFound && elementCount > 0) {
        std::string type;
        tokens >> type;
        if (type == "list") {
          invalidProperties = true;
          break;
        }
        const auto scalarSize = plyScalarSize(type);
        if (!scalarSize || elementStride > 4096 - *scalarSize) {
          invalidProperties = true;
          break;
        }
        elementStride += *scalarSize;
      }
    }
    if (!vertexElementFound) {
      result.error = "Error.PlyCountMissing";
      return result;
    }
    if (invalidProperties) {
      result.error = "Error.PlyProperties";
      return result;
    }
    if (vertexCount == 0 || !finishElement()) {
      result.error = "Error.PlyTruncated";
      return result;
    }
  } else if (extension == ".spz") {
    if (!startsWith(bytes, {0x1F, 0x8B})) {
      result.error = "Error.SpzSignature";
      return result;
    }
  } else if (extension == ".sog" || extension == ".zip") {
    if (!startsWith(bytes, {0x50, 0x4B, 0x03, 0x04})) {
      result.error = "Error.SogSignature";
      return result;
    }
  } else if (extension == ".splat") {
    if (declaredSize < 32 || declaredSize % 32 != 0) {
      result.error = "Error.SplatRecords";
      return result;
    }
  } else if (extension == ".ksplat") {
    if (declaredSize < 64) {
      result.error = "Error.KsplatHeader";
      return result;
    }
  } else if (extension == ".rad") {
    if (!startsWith(bytes, {'R', 'A', 'D', '0'})) {
      result.error = "Error.RadSignature";
      return result;
    }
  } else {
    result.error = "Error.UnsupportedExtension";
    return result;
  }

  result.ok = true;
  result.largeFileWarning = extension != ".rad" && declaredSize > ONE_GIB;
  return result;
}

std::optional<std::pair<std::uint64_t, std::uint64_t>> parseByteRange(const std::string &header, std::uint64_t fileSize)
{
  if (fileSize == 0 || header.rfind("bytes=", 0) != 0 || header.find(',') != std::string::npos)
    return std::nullopt;
  const std::string_view value(header.data() + 6, header.size() - 6);
  const auto dash = value.find('-');
  if (dash == std::string_view::npos)
    return std::nullopt;

  if (dash == 0) {
    const auto suffixLength = parseUnsigned(value.substr(1));
    if (!suffixLength || *suffixLength == 0)
      return std::nullopt;
    const auto length = std::min<std::uint64_t>(*suffixLength, fileSize);
    return std::pair{fileSize - length, length};
  }

  const auto start = parseUnsigned(value.substr(0, dash));
  if (!start || *start >= fileSize)
    return std::nullopt;
  const auto end =
      dash + 1 == value.size() ? std::optional<std::uint64_t>{fileSize - 1} : parseUnsigned(value.substr(dash + 1));
  if (!end || *end < *start)
    return std::nullopt;
  const auto boundedEnd = std::min<std::uint64_t>(*end, fileSize - 1);
  return std::pair{*start, boundedEnd - *start + 1};
}

} // namespace obs3dgs
