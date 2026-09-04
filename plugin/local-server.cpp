// SPDX-License-Identifier: GPL-2.0-or-later

#include "local-server.hpp"
#include "asset-validation.hpp"

#include <obs-module.h>

#include <QByteArray>
#include <QUrl>
#include <QUuid>

#include <algorithm>
#include <array>
#include <cctype>
#include <fstream>
#include <limits>
#include <sstream>
#include <system_error>

namespace obs3dgs {
namespace {

constexpr std::size_t EVENT_LIMIT = 64ULL * 1024ULL;
constexpr std::size_t STREAM_CHUNK = 64ULL * 1024ULL;

bool constantTimeEquals(const std::string &left, const std::string &right)
{
  const std::size_t length = std::max(left.size(), right.size());
  std::size_t difference = left.size() ^ right.size();
  for (std::size_t index = 0; index < length; ++index) {
    const unsigned char a = index < left.size() ? static_cast<unsigned char>(left[index]) : 0;
    const unsigned char b = index < right.size() ? static_cast<unsigned char>(right[index]) : 0;
    difference |= static_cast<std::size_t>(a ^ b);
  }
  return difference == 0;
}

std::string lowercase(std::string value)
{
  std::transform(value.begin(), value.end(), value.begin(),
                 [](unsigned char character) { return static_cast<char>(std::tolower(character)); });
  return value;
}

std::string routeKey(const std::string &sourceId, std::uint64_t revision, const std::string &extension)
{
  return "/api/v1/assets/" + sourceId + "/" + std::to_string(revision) + "/scene" + extension;
}

bool validSourceId(const std::string &sourceId)
{
  return !sourceId.empty() && sourceId.size() <= 128 &&
         std::all_of(sourceId.begin(), sourceId.end(),
                     [](unsigned char character) { return std::isalnum(character) != 0 || character == '-'; });
}

std::filesystem::path pathFromUtf8(const std::string &value)
{
#ifdef _WIN32
  return std::filesystem::path(QString::fromUtf8(value.c_str()).toStdWString());
#else
  return std::filesystem::path(value);
#endif
}

} // namespace

LocalServer &LocalServer::instance()
{
  static LocalServer server;
  return server;
}

LocalServer::LocalServer() : token_(makeToken())
{
  server_.set_payload_max_length(EVENT_LIMIT);
  server_.set_read_timeout(10, 0);
  server_.set_write_timeout(30, 0);
  server_.set_idle_interval(0, 250000);
}

LocalServer::~LocalServer()
{
  stop();
}

bool LocalServer::ensureStarted(std::string &error)
{
  std::lock_guard lock(mutex_);
  if (port_ != 0)
    return true;

  char *indexPath = obs_module_file("web/index.html");
  if (!indexPath) {
    error = "Error.WebRuntimeMissing";
    return false;
  }
  webRoot_ = pathFromUtf8(indexPath).parent_path();
  bfree(indexPath);

  std::error_code filesystemError;
  webRoot_ = std::filesystem::canonical(webRoot_, filesystemError);
  if (filesystemError || !std::filesystem::is_directory(webRoot_)) {
    error = "Error.WebRuntimeUnreadable";
    return false;
  }

  if (!routesConfigured_) {
    configureRoutes();
    routesConfigured_ = true;
  }
  if (!server_.set_mount_point("/web", webRoot_.string())) {
    error = "Error.WebRuntimeMount";
    return false;
  }

  const int selectedPort = server_.bind_to_any_port("127.0.0.1");
  if (selectedPort <= 0 || selectedPort > std::numeric_limits<std::uint16_t>::max()) {
    error = "Error.ServerBind";
    return false;
  }
  port_ = static_cast<std::uint16_t>(selectedPort);
  thread_ = std::thread([this] {
    if (!server_.listen_after_bind())
      blog(LOG_ERROR, "[obs-3dgs] Local loopback server stopped unexpectedly");
  });
  blog(LOG_INFO, "[obs-3dgs] Local runtime listening on 127.0.0.1:%u", port_);
  return true;
}

void LocalServer::stop()
{
  {
    std::lock_guard lock(mutex_);
    if (port_ == 0)
      return;
    for (auto &[key, asset] : assets_) {
      (void)key;
      asset->cancelled->store(true);
    }
    assets_.clear();
    mailboxes_.clear();
    port_ = 0;
  }
  server_.stop();
  if (thread_.joinable())
    thread_.join();
}

AssetResult LocalServer::mapAsset(const std::string &sourceId, std::uint64_t revision, const std::string &path)
{
  AssetResult result;
  if (!validSourceId(sourceId)) {
    result.error = "Error.InvalidSourceId";
    return result;
  }

  std::error_code error;
  const auto requested = pathFromUtf8(path);
  if (std::filesystem::is_symlink(requested, error)) {
    result.error = "Error.AssetSymlink";
    return result;
  }
  const auto canonical = std::filesystem::canonical(requested, error);
  if (error || !std::filesystem::is_regular_file(canonical, error)) {
    result.error = "Error.AssetNotRegular";
    return result;
  }

  const auto extension = lowercase(canonical.extension().string());
  static const std::array supported = {".ply", ".spz", ".sog", ".splat", ".ksplat", ".zip", ".rad"};
  if (std::find(supported.begin(), supported.end(), extension) == supported.end()) {
    result.error = "Error.UnsupportedExtension";
    return result;
  }

  const auto size = std::filesystem::file_size(canonical, error);
  if (error) {
    result.error = "Error.AssetSize";
    return result;
  }
  const auto validation = validateSceneHeader(canonical, extension, size);
  if (!validation.ok) {
    result.error = validation.error;
    return result;
  }

  std::string startError;
  if (!ensureStarted(startError)) {
    result.error = startError;
    return result;
  }

  const std::string route = routeKey(sourceId, revision, extension);
  auto record = std::make_shared<AssetRecord>();
  record->path = canonical;
  record->size = size;
  record->mimeType = contentTypeFor(canonical);
  record->cancelled = std::make_shared<std::atomic_bool>(false);

  {
    std::lock_guard lock(mutex_);
    for (auto iterator = assets_.begin(); iterator != assets_.end();) {
      if (iterator->first.rfind("/api/v1/assets/" + sourceId + "/", 0) == 0) {
        iterator->second->cancelled->store(true);
        iterator = assets_.erase(iterator);
      } else {
        ++iterator;
      }
    }
    assets_[route] = std::move(record);
    result.url = "http://127.0.0.1:" + std::to_string(port_) + route + "?token=" + percentEncode(token_);
  }

  result.ok = true;
  result.size = size;
  result.largeFileWarning = validation.largeFileWarning;
  result.fileType = extension.substr(1);
  return result;
}

void LocalServer::unmapSource(const std::string &sourceId)
{
  std::lock_guard lock(mutex_);
  for (auto iterator = assets_.begin(); iterator != assets_.end();) {
    if (iterator->first.rfind("/api/v1/assets/" + sourceId + "/", 0) == 0) {
      iterator->second->cancelled->store(true);
      iterator = assets_.erase(iterator);
    } else {
      ++iterator;
    }
  }
}

void LocalServer::registerMailbox(const std::string &sourceId, const std::shared_ptr<RuntimeMailbox> &mailbox)
{
  std::lock_guard lock(mutex_);
  mailboxes_[sourceId] = mailbox;
}

void LocalServer::unregisterMailbox(const std::string &sourceId)
{
  std::lock_guard lock(mutex_);
  mailboxes_.erase(sourceId);
}

std::string LocalServer::runtimeUrl(const std::string &sourceId, const std::string &assetUrl) const
{
  std::lock_guard lock(mutex_);
  if (port_ == 0)
    return {};
  std::string url = "http://127.0.0.1:" + std::to_string(port_) +
                    "/web/index.html?sourceId=" + percentEncode(sourceId) + "&token=" + percentEncode(token_);
  if (!assetUrl.empty())
    url += "&asset=" + percentEncode(assetUrl);
  return url;
}

std::uint16_t LocalServer::port() const
{
  std::lock_guard lock(mutex_);
  return port_;
}

void LocalServer::configureRoutes()
{
  server_.Get(R"(/api/v1/assets/[A-Za-z0-9-]+/[0-9]+/scene\.[A-Za-z0-9]+)",
              [this](const httplib::Request &request, httplib::Response &response) {
                serveAsset(request, response, request.method == "HEAD");
              });
  server_.Post(R"(/api/v1/sources/[A-Za-z0-9-]+/events)",
               [this](const auto &request, auto &response) { receiveEvent(request, response); });
  server_.set_error_handler([](const httplib::Request &, httplib::Response &response) {
    response.set_header("Cache-Control", "no-store");
    response.set_content("Not found", "text/plain; charset=utf-8");
  });
  server_.set_exception_handler([](const httplib::Request &, httplib::Response &response, std::exception_ptr) {
    response.status = 500;
    response.set_content("Internal error", "text/plain; charset=utf-8");
  });
}

bool LocalServer::authorized(const httplib::Request &request) const
{
  std::string provided;
  if (request.has_header("Authorization")) {
    const auto authorization = request.get_header_value("Authorization");
    constexpr std::string_view prefix = "Bearer ";
    if (authorization.rfind(prefix, 0) == 0)
      provided = authorization.substr(prefix.size());
  }
  if (provided.empty() && request.has_param("token"))
    provided = request.get_param_value("token");
  return constantTimeEquals(provided, token_);
}

void LocalServer::serveAsset(const httplib::Request &request, httplib::Response &response, bool headOnly)
{
  (void)headOnly;
  response.set_header("Cache-Control", "no-store");
  response.set_header("Accept-Ranges", "bytes");
  if (!authorized(request)) {
    response.status = 401;
    return;
  }

  std::shared_ptr<AssetRecord> asset;
  {
    std::lock_guard lock(mutex_);
    const auto found = assets_.find(request.path);
    if (found == assets_.end()) {
      response.status = 404;
      return;
    }
    asset = found->second;
  }
  if (asset->cancelled->load()) {
    response.status = 410;
    return;
  }

  if (request.has_header("Range")) {
    if (!parseByteRange(request.get_header_value("Range"), asset->size)) {
      response.status = 416;
      response.set_header("Content-Range", "bytes */" + std::to_string(asset->size));
      return;
    }
  }
  response.set_header("Content-Type", asset->mimeType);

  response.set_content_provider(
      static_cast<std::size_t>(asset->size), asset->mimeType,
      [asset](std::size_t relativeOffset, std::size_t requestedLength, httplib::DataSink &sink) {
        if (asset->cancelled->load())
          return false;
        std::ifstream stream(asset->path, std::ios::binary);
        if (!stream)
          return false;
        stream.seekg(static_cast<std::streamoff>(relativeOffset));
        std::array<char, STREAM_CHUNK> buffer{};
        std::size_t remaining = requestedLength;
        while (remaining > 0 && stream && !asset->cancelled->load()) {
          const auto chunk = std::min(remaining, buffer.size());
          stream.read(buffer.data(), static_cast<std::streamsize>(chunk));
          const auto count = stream.gcount();
          if (count <= 0)
            break;
          if (!sink.write(buffer.data(), static_cast<std::size_t>(count)))
            return false;
          remaining -= static_cast<std::size_t>(count);
        }
        return remaining == 0;
      });
}

void LocalServer::receiveEvent(const httplib::Request &request, httplib::Response &response)
{
  response.set_header("Cache-Control", "no-store");
  if (!authorized(request)) {
    response.status = 401;
    return;
  }
  if (request.body.size() > EVENT_LIMIT) {
    response.status = 413;
    return;
  }

  const auto marker = request.path.find("/api/v1/sources/");
  const auto suffix = request.path.rfind("/events");
  if (marker != 0 || suffix == std::string::npos || suffix <= 16) {
    response.status = 404;
    return;
  }
  const std::string sourceId = request.path.substr(16, suffix - 16);

  const auto event = nlohmann::json::parse(request.body, nullptr, false);
  if (event.is_discarded() || !event.is_object() || !event.contains("protocolVersion") ||
      !event["protocolVersion"].is_number_integer() || event["protocolVersion"] != 1 ||
      !event.contains("sourceId") || !event["sourceId"].is_string() || event["sourceId"] != sourceId ||
      !event.contains("revision") ||
      !event["revision"].is_number_unsigned() || !event.contains("type") || !event["type"].is_string() ||
      !event.contains("payload") || !event["payload"].is_object()) {
    response.status = 400;
    return;
  }

  static const std::array acceptedTypes = {"ready", "progress", "cameraChanged", "metrics", "error"};
  const auto type = event["type"].get<std::string>();
  if (std::find(acceptedTypes.begin(), acceptedTypes.end(), type) == acceptedTypes.end()) {
    response.status = 400;
    return;
  }

  std::shared_ptr<RuntimeMailbox> mailbox;
  {
    std::lock_guard lock(mutex_);
    const auto found = mailboxes_.find(sourceId);
    if (found != mailboxes_.end())
      mailbox = found->second.lock();
  }
  if (!mailbox || !mailbox->active.load()) {
    response.status = 410;
    return;
  }
  {
    std::lock_guard mailboxLock(mailbox->mutex);
    if (mailbox->events.size() >= 128)
      mailbox->events.erase(mailbox->events.begin());
    mailbox->events.push_back(event);
  }
  response.status = 204;
}

std::string LocalServer::contentTypeFor(const std::filesystem::path &path)
{
  const auto extension = lowercase(path.extension().string());
  if (extension == ".json")
    return "application/json";
  if (extension == ".zip" || extension == ".sog")
    return "application/zip";
  return "application/octet-stream";
}

std::string LocalServer::makeToken()
{
  std::string token;
  token.reserve(64);
  for (int index = 0; index < 4; ++index) {
    auto uuid = QUuid::createUuid().toString(QUuid::WithoutBraces).remove('-').toUtf8();
    token.append(uuid.constData(), static_cast<std::size_t>(uuid.size()));
  }
  return token.substr(0, 64);
}

std::string LocalServer::percentEncode(const std::string &value)
{
  const auto encoded = QUrl::toPercentEncoding(QString::fromUtf8(value.c_str()));
  return std::string(encoded.constData(), static_cast<std::size_t>(encoded.size()));
}

} // namespace obs3dgs
