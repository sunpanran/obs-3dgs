#include "asset-validation.hpp"
#include "angle-utils.hpp"
#include "lens-presets.hpp"
#include "one-shot-authorization.hpp"
#include "property-ui.hpp"
#include "property-ui-state.hpp"
#include "settings-snapshot.hpp"

#include <array>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <iterator>
#include <limits>
#include <set>
#include <string>

namespace {

int failures = 0;

void expect(bool condition, const char *message)
{
  if (condition)
    return;
  std::cerr << "FAIL: " << message << '\n';
  ++failures;
}

void writeFixture(const std::filesystem::path &path, const std::string &bytes)
{
  std::ofstream stream(path, std::ios::binary);
  stream.write(bytes.data(), static_cast<std::streamsize>(bytes.size()));
}

std::string readTextFile(const std::filesystem::path &path)
{
  std::ifstream stream(path, std::ios::binary);
  return {std::istreambuf_iterator<char>(stream), std::istreambuf_iterator<char>()};
}

void setSnapshotDefaults(obs_data_t *settings)
{
  obs_data_set_default_double(settings, "scene_opacity", 1.0);
  obs_data_set_default_int(settings, "scene_recolor", 0xFFFFFF);
  obs_data_set_default_double(settings, "exposure", 1.0);
  obs_data_set_default_double(settings, "focal_length_mm", 35.0);
}

std::set<std::string> localeKeys(const std::filesystem::path &path)
{
  std::ifstream stream(path);
  std::set<std::string> keys;
  std::string line;
  while (std::getline(stream, line)) {
    const auto separator = line.find('=');
    if (separator != std::string::npos && separator > 0)
      keys.insert(line.substr(0, separator));
  }
  return keys;
}

} // namespace

int main()
{
  for (const auto &[input, expected] : std::array<std::pair<double, double>, 9>{{
           {803.45, 83.45}, {-803.45, -83.45}, {-190.0, 170.0}, {180.0, -180.0},
           {-180.0, -180.0}, {540.0, -180.0}, {-540.0, -180.0}, {720.0, 0.0}, {-720.0, 0.0}}}) {
    expect(std::abs(obs3dgs::normalizeDegrees(input) - expected) < 1e-10,
           "camera angle must wrap into the control range without changing its pose");
  }
  double repeatedAngle = 83.45;
  for (int iteration = 0; iteration < 1000; ++iteration)
    repeatedAngle = obs3dgs::normalizeDegrees(repeatedAngle);
  expect(repeatedAngle == 83.45, "camera round trips must preserve in-range decimal values exactly");
  expect(obs3dgs::normalizeDegrees(std::numeric_limits<double>::infinity()) == 0.0,
         "invalid angles must not propagate non-finite camera values");
  expect(!std::signbit(obs3dgs::normalizeDegrees(-0.0)), "negative zero should have one canonical value");
  expect(obs3dgs::SETTINGS_PAGES.size() == 6, "the source properties should expose six settings pages");
  expect(obs3dgs::normalizeSettingsPage("camera") == "camera", "a supported settings page should be retained");
  expect(obs3dgs::normalizeSettingsPage("unknown") == "scene-file",
         "an invalid settings page should fall back to scene file");
  const auto compactVisibility = obs3dgs::propertyVisibility(true, false, true, false, true);
  expect(!compactVisibility.backgroundColor, "transparent background should hide the background color");
  expect(!compactVisibility.qualityDetails, "non-custom quality should hide detailed quality fields");
  expect(!compactVisibility.customSize, "canvas-follow mode should hide custom dimensions");
  expect(!compactVisibility.advancedCamera, "advanced camera fields should be hidden by default");
  expect(!compactVisibility.manualClipping, "automatic clipping should hide manual clipping fields");
  const auto expandedVisibility = obs3dgs::propertyVisibility(false, true, false, true, false);
  expect(expandedVisibility.backgroundColor && expandedVisibility.qualityDetails && expandedVisibility.customSize &&
             expandedVisibility.advancedCamera && expandedVisibility.manualClipping,
         "expanded custom settings should expose every conditional field");

  obs_properties_t *pageProperties = obs_properties_create();
  for (const auto &[page, group] : obs3dgs::SETTINGS_PAGE_GROUPS) {
    (void)page;
    obs_properties_add_group(pageProperties, group.data(), group.data(), OBS_GROUP_NORMAL, obs_properties_create());
  }
  for (std::size_t iteration = 0; iteration < 100; ++iteration) {
    const auto selectedPage = obs3dgs::SETTINGS_PAGES[iteration % obs3dgs::SETTINGS_PAGES.size()];
    obs3dgs::applySettingsPageVisibility(pageProperties, selectedPage);
    std::size_t visiblePages = 0;
    for (const auto &[page, group] : obs3dgs::SETTINGS_PAGE_GROUPS) {
      const bool visible = obs_property_visible(obs_properties_get(pageProperties, group.data()));
      visiblePages += visible ? 1 : 0;
      expect(visible == (page == selectedPage), "the selected settings page should be the visible page");
    }
    expect(visiblePages == 1, "exactly one settings page should remain visible after repeated switching");
  }
  obs_properties_destroy(pageProperties);

  expect(obs3dgs::lensPresetForFocalLength(35.0) == 35, "a common focal length should select its lens preset");
  expect(obs3dgs::lensPresetForFocalLength(42.0) == 0, "an arbitrary focal length should remain a custom lens value");

  obs3dgs::OneShotAuthorization authorization;
  expect(!authorization.consume(), "locked update authorization should start empty");
  authorization.grant();
  expect(authorization.consume(), "locked update authorization should survive until the deferred update");
  expect(!authorization.consume(), "locked update authorization should be consumed exactly once");

  obs_data_t *settings = obs_data_create();
  setSnapshotDefaults(settings);
  obs_data_set_string(settings, "asset_path", "scene.sog");
  obs_data_t *snapshot = obs3dgs::snapshotSettings(settings, setSnapshotDefaults);
  expect(obs_data_get_double(snapshot, "scene_opacity") == 1.0,
         "settings snapshot should retain the default scene opacity");
  expect(obs_data_get_int(snapshot, "scene_recolor") == 0xFFFFFF,
         "settings snapshot should retain the default white recolor");
  expect(obs_data_get_double(snapshot, "exposure") == 1.0, "settings snapshot should retain the default exposure");
  expect(obs_data_get_double(snapshot, "focal_length_mm") == 35.0,
         "settings snapshot should retain the default focal length");
  expect(std::string(obs_data_get_string(snapshot, "asset_path")) == "scene.sog",
         "settings snapshot should retain explicit user values");

  obs_data_t *lockedUpdate = obs_data_create();
  setSnapshotDefaults(lockedUpdate);
  obs_data_set_double(lockedUpdate, "scene_opacity", 0.0);
  obs3dgs::applyEffectiveSettings(lockedUpdate, snapshot);
  expect(obs_data_get_double(lockedUpdate, "scene_opacity") == 1.0,
         "live-lock restore should overwrite changes to previously default-valued settings");
  expect(std::string(obs_data_get_string(lockedUpdate, "asset_path")) == "scene.sog",
         "live-lock restore should retain explicit committed settings");
  obs_data_release(lockedUpdate);
  obs_data_release(snapshot);
  obs_data_release(settings);

  const auto directory = std::filesystem::temp_directory_path() / "obs-3dgs-native-tests";
  std::filesystem::create_directories(directory);

  const auto validPly = directory / "valid.ply";
  const std::string plyHeader =
      "ply\nformat binary_little_endian 1.0\nelement vertex 1\nproperty float x\nend_header\n";
  writeFixture(validPly, plyHeader + std::string(32, '\0'));
  expect(obs3dgs::validateSceneHeader(validPly, ".ply", std::filesystem::file_size(validPly)).ok,
         "valid binary PLY header should pass");

  const auto truncatedPly = directory / "truncated.ply";
  writeFixture(truncatedPly, "ply\nformat binary_little_endian 1.0\nelement vertex 1\n");
  expect(!obs3dgs::validateSceneHeader(truncatedPly, ".ply", std::filesystem::file_size(truncatedPly)).ok,
         "truncated PLY header should fail");

  const auto truncatedPlyData = directory / "truncated-data.ply";
  const std::string truncatedDataHeader =
      "ply\nformat binary_little_endian 1.0\nelement vertex 2\nproperty float x\nproperty float y\nproperty float "
      "z\nend_header\n";
  writeFixture(truncatedPlyData, truncatedDataHeader + std::string(12, '\0'));
  expect(!obs3dgs::validateSceneHeader(truncatedPlyData, ".ply", std::filesystem::file_size(truncatedPlyData)).ok,
         "PLY data shorter than vertex count times stride should fail");

  const auto spz = directory / "scene.spz";
  const auto compressedPly = directory / "compressed.ply";
  const std::string compressedHeader =
      "ply\nformat binary_little_endian 1.0\nelement chunk 1\nproperty float min_x\n"
      "element vertex 1\nproperty uint packed_position\nproperty uint packed_rotation\n"
      "property uint packed_scale\nproperty uint packed_color\nend_header\n";
  writeFixture(compressedPly, compressedHeader + std::string(20, '\0'));
  expect(obs3dgs::validateSceneHeader(compressedPly, ".ply", std::filesystem::file_size(compressedPly)).ok,
         "compressed PLY must include both chunk and vertex data");
  writeFixture(compressedPly, compressedHeader + std::string(19, '\0'));
  expect(!obs3dgs::validateSceneHeader(compressedPly, ".ply", std::filesystem::file_size(compressedPly)).ok,
         "chunk bytes must not conceal a truncated compressed vertex payload");
  const auto withSh = compressedHeader.substr(0, compressedHeader.find("end_header")) +
      "element sh 1\nproperty float f_rest_0\nend_header\n";
  writeFixture(compressedPly, withSh + std::string(23, '\0'));
  expect(!obs3dgs::validateSceneHeader(compressedPly, ".ply", std::filesystem::file_size(compressedPly)).ok,
         "a truncated SH element after vertices must fail validation too");

  writeFixture(spz, std::string("\x1f\x8b", 2) + std::string(62, '\0'));
  expect(obs3dgs::validateSceneHeader(spz, ".spz", std::filesystem::file_size(spz)).ok,
         "SPZ gzip signature should pass");
  const auto invalidSpz = directory / "invalid.spz";
  writeFixture(invalidSpz, std::string(64, '\0'));
  expect(!obs3dgs::validateSceneHeader(invalidSpz, ".spz", std::filesystem::file_size(invalidSpz)).ok,
         "SPZ without the gzip signature should fail");

  const auto sog = directory / "scene.sog";
  writeFixture(sog, std::string("PK\x03\x04", 4) + std::string(60, '\0'));
  expect(obs3dgs::validateSceneHeader(sog, ".sog", std::filesystem::file_size(sog)).ok,
         "SOG zip signature should pass");
  expect(obs3dgs::validateSceneHeader(sog, ".zip", std::filesystem::file_size(sog)).ok,
         "experimental ZIP-wrapped SOG signature should pass");
  const auto invalidSog = directory / "invalid.sog";
  writeFixture(invalidSog, std::string(64, '\0'));
  expect(!obs3dgs::validateSceneHeader(invalidSog, ".sog", std::filesystem::file_size(invalidSog)).ok,
         "SOG without a local-file zip signature should fail");

  const auto splat = directory / "scene.splat";
  writeFixture(splat, std::string(32, '\0'));
  expect(obs3dgs::validateSceneHeader(splat, ".splat", std::filesystem::file_size(splat)).ok,
         "one complete SPLAT record should pass experimental validation");
  writeFixture(splat, std::string(33, '\0'));
  expect(!obs3dgs::validateSceneHeader(splat, ".splat", std::filesystem::file_size(splat)).ok,
         "partial SPLAT record should fail");

  const auto ksplat = directory / "scene.ksplat";
  writeFixture(ksplat, std::string(64, '\0'));
  expect(obs3dgs::validateSceneHeader(ksplat, ".ksplat", std::filesystem::file_size(ksplat)).ok,
         "a minimum-size KSPLAT header should pass experimental validation");
  writeFixture(ksplat, std::string(63, '\0'));
  expect(!obs3dgs::validateSceneHeader(ksplat, ".ksplat", std::filesystem::file_size(ksplat)).ok,
         "a truncated KSPLAT header should fail");

  const auto rad = directory / "scene.rad";
  writeFixture(rad, std::string("RAD0", 4) + std::string(60, '\0'));
  expect(obs3dgs::validateSceneHeader(rad, ".rad", std::filesystem::file_size(rad)).ok,
         "RAD0 signature should pass experimental validation");
  writeFixture(rad, std::string("BAD0", 4) + std::string(60, '\0'));
  expect(!obs3dgs::validateSceneHeader(rad, ".rad", std::filesystem::file_size(rad)).ok,
         "RAD without a RAD0 signature should fail");

  expect(!obs3dgs::validateSceneHeader(spz, ".spz", obs3dgs::TWO_GIB + 1).ok,
         "non-RAD files above 2 GiB should fail before allocation");

  const auto full = obs3dgs::parseByteRange("bytes=0-99", 1000);
  expect(full && full->first == 0 && full->second == 100, "explicit byte range should parse");
  const auto suffix = obs3dgs::parseByteRange("bytes=-50", 1000);
  expect(suffix && suffix->first == 950 && suffix->second == 50, "suffix byte range should parse");
  const auto open = obs3dgs::parseByteRange("bytes=900-", 1000);
  expect(open && open->first == 900 && open->second == 100, "open byte range should parse");
  expect(!obs3dgs::parseByteRange("bytes=1000-1001", 1000), "out-of-bounds byte range should fail");
  expect(!obs3dgs::parseByteRange("bytes=0-1,4-5", 1000), "multipart byte range should fail");

  const auto sourceRoot = std::filesystem::path(OBS_3DGS_SOURCE_DIR);
  const auto englishKeys = localeKeys(sourceRoot / "data" / "locale" / "en-US.ini");
  const auto chineseKeys = localeKeys(sourceRoot / "data" / "locale" / "zh-CN.ini");
  expect(!englishKeys.empty(), "English native locale should not be empty");
  expect(englishKeys == chineseKeys, "English and Chinese native locale keys should match");

  const auto sourceImplementation = readTextFile(sourceRoot / "plugin" / "source.cpp");
  expect(sourceImplementation.find("obs_source_inc_active(browser_)") == std::string::npos,
         "the parent source must not duplicate active-child reference propagation");
  expect(sourceImplementation.find("obs_source_dec_active(browser_)") == std::string::npos,
         "the parent source must not duplicate active-child reference release");
  expect(sourceImplementation.find("obs_source_inc_showing(browser_)") == std::string::npos,
         "the parent source must not duplicate showing-child reference propagation");
  expect(sourceImplementation.find("obs_source_dec_showing(browser_)") == std::string::npos,
         "the parent source must not duplicate showing-child reference release");
  expect(sourceImplementation.find("runtimeSettingsEqual(settings, committedSettings_)") != std::string::npos,
         "source updates should compare only settings that affect the web runtime");
  expect(sourceImplementation.find("bridgeReady_.load() && runtimeSettingsChanged") != std::string::npos,
         "UI-only changes and runtime camera persistence should not echo state to the web view");
  expect(sourceImplementation.find("browser_ || obs_source_showing(source_)") != std::string::npos,
         "an unused hidden source should defer creation of its private browser runtime");
  expect(sourceImplementation.find("OBS_SOURCE_COMPOSITE | OBS_SOURCE_SRGB") != std::string::npos,
         "the source should declare that it composites its private browser child");
  expect(sourceImplementation.find("info.audio_render") != std::string::npos,
         "a composite video-only source should explicitly report that it has no audio mix");
  expect(sourceImplementation.find("obs_data_get_string(committedSettings_, KEY_ASSET)") != std::string::npos,
         "missing-file discovery should use the persisted path before an asset can become active");

  std::error_code ignored;
  std::filesystem::remove_all(directory, ignored);
  if (failures == 0)
    std::cout << "All native validation tests passed\n";
  return failures == 0 ? 0 : 1;
}
