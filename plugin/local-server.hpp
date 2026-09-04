// SPDX-License-Identifier: GPL-2.0-or-later

#pragma once

#include <httplib.h>
#include <nlohmann/json.hpp>

#include <atomic>
#include <cstdint>
#include <filesystem>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>

namespace obs3dgs {

struct RuntimeMailbox {
  std::mutex mutex;
  std::vector<nlohmann::json> events;
  std::atomic_bool active{true};
};

struct AssetResult {
  bool ok = false;
  bool largeFileWarning = false;
  std::uint64_t size = 0;
  std::string url;
  std::string fileType;
  std::string error;
};

class LocalServer final {
public:
  static LocalServer &instance();

  LocalServer(const LocalServer &) = delete;
  LocalServer &operator=(const LocalServer &) = delete;

  bool ensureStarted(std::string &error);
  void stop();

  AssetResult mapAsset(const std::string &sourceId, std::uint64_t revision, const std::string &path);
  void unmapSource(const std::string &sourceId);
  void registerMailbox(const std::string &sourceId, const std::shared_ptr<RuntimeMailbox> &mailbox);
  void unregisterMailbox(const std::string &sourceId);

  [[nodiscard]] std::string runtimeUrl(const std::string &sourceId, const std::string &assetUrl = {}) const;
  [[nodiscard]] std::uint16_t port() const;

private:
  struct AssetRecord {
    std::filesystem::path path;
    std::uint64_t size = 0;
    std::string mimeType;
    std::shared_ptr<std::atomic_bool> cancelled;
  };

  LocalServer();
  ~LocalServer();

  void configureRoutes();
  bool authorized(const httplib::Request &request) const;
  void serveAsset(const httplib::Request &request, httplib::Response &response, bool headOnly);
  void receiveEvent(const httplib::Request &request, httplib::Response &response);
  static std::string contentTypeFor(const std::filesystem::path &path);
  static std::string makeToken();
  static std::string percentEncode(const std::string &value);

  mutable std::mutex mutex_;
  httplib::Server server_;
  std::thread thread_;
  std::unordered_map<std::string, std::shared_ptr<AssetRecord>> assets_;
  std::unordered_map<std::string, std::weak_ptr<RuntimeMailbox>> mailboxes_;
  std::string token_;
  std::filesystem::path webRoot_;
  std::uint16_t port_ = 0;
  bool routesConfigured_ = false;
};

} // namespace obs3dgs
