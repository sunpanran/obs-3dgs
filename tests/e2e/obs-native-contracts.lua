-- SPDX-License-Identifier: GPL-2.0-or-later
-- Load only in a dedicated OBS test profile. Uses the same libobs calls as the
-- frontend, without injecting input or replacing the source properties window.
local obs = obslua
local source, original, properties
local phase = 0
local results = {}
local failures = 0
local duplicateCycles = 0

local function check(name, passed)
  results[#results + 1] = { name = name, passed = not not passed }
  if not passed then failures = failures + 1 end
end

local function setting(name)
  local settings = obs.obs_source_get_settings(source)
  local value = obs.obs_data_get_double(settings, name)
  obs.obs_data_release(settings)
  return value
end

local function finish()
  if properties then obs.obs_properties_destroy(properties); properties = nil end
  if original then obs.obs_data_release(original); original = nil end
  if source then obs.obs_source_remove(source); obs.obs_source_release(source); source = nil end
  local report = obs.obs_data_create()
  local checks = obs.obs_data_array_create()
  for _, result in ipairs(results) do
    local item = obs.obs_data_create()
    obs.obs_data_set_string(item, "name", result.name)
    obs.obs_data_set_bool(item, "passed", result.passed)
    obs.obs_data_array_push_back(checks, item)
    obs.obs_data_release(item)
  end
  obs.obs_data_set_array(report, "checks", checks)
  obs.obs_data_array_release(checks)
  obs.obs_data_set_bool(report, "passed", failures == 0)
  obs.obs_data_set_int(report, "duplicateCycles", duplicateCycles)
  local file = assert(io.open(script_path() .. "../../output/obs-native-contracts/report.json", "w"))
  file:write(obs.obs_data_get_json(report), "\n")
  file:close()
  obs.obs_data_release(report)
  obs.script_log(obs.LOG_INFO, "obs-3dgs native contracts completed; failures=" .. failures)
end

local function advance()
  if phase == 0 then
    local settings = obs.obs_data_create()
    obs.obs_data_set_double(settings, "focal_length_mm", 42)
    obs.obs_data_set_double(settings, "exposure", 1)
    obs.obs_data_set_string(settings, "camera_presets_json", '[{"name":"Original preset","camera":{"focalLengthMm":42}}]')
    source = assert(obs.obs_source_create("obs_3dgs_source", "obs-3dgs-native-contracts", settings, nil))
    obs.obs_data_release(settings)
    local private = obs.obs_source_get_private_settings(source)
    obs.obs_data_set_string(private, "obs3dgs_ui_settings_page", "camera")
    obs.obs_data_set_bool(private, "obs3dgs_ui_advanced_camera", true)
    obs.obs_data_release(private)
    for i = 1, 100 do
      local copy = assert(obs.obs_source_duplicate(source, "obs-3dgs-native-copy-" .. i, false))
      local copySettings = obs.obs_source_get_settings(copy)
      local copyPrivate = obs.obs_source_get_private_settings(copy)
      check("duplicate " .. i .. " independent identity", obs.obs_source_get_uuid(copy) ~= obs.obs_source_get_uuid(source))
      check("duplicate " .. i .. " private page", obs.obs_data_get_string(copyPrivate, "obs3dgs_ui_settings_page") == "camera")
      check("duplicate " .. i .. " advanced reveal", obs.obs_data_get_bool(copyPrivate, "obs3dgs_ui_advanced_camera"))
      obs.obs_data_set_double(copySettings, "focal_length_mm", 85)
      obs.obs_data_set_string(copySettings, "camera_presets_json", '[]')
      obs.obs_source_update(copy, copySettings)
      obs.obs_data_set_string(copyPrivate, "obs3dgs_ui_settings_page", "display")
      local basePrivate = obs.obs_source_get_private_settings(source)
      check("duplicate " .. i .. " private isolation", obs.obs_data_get_string(basePrivate, "obs3dgs_ui_settings_page") == "camera")
      check("duplicate " .. i .. " setting isolation", setting("focal_length_mm") == 42)
      obs.obs_data_release(basePrivate)
      obs.obs_data_release(copyPrivate)
      obs.obs_data_release(copySettings)
      obs.obs_source_remove(copy)
      obs.obs_source_release(copy)
      duplicateCycles = duplicateCycles + 1
    end
    local settingsBefore = obs.obs_source_get_settings(source)
    original = obs.obs_data_create()
    obs.obs_data_apply(original, settingsBefore)
    obs.obs_data_release(settingsBefore)
    properties = obs.obs_source_properties(source)
    local changed = obs.obs_data_create()
    obs.obs_data_set_double(changed, "focal_length_mm", 85)
    obs.obs_data_set_double(changed, "exposure", 2)
    obs.obs_data_set_double(changed, "camera_yaw", 803.45)
    obs.obs_source_update(source, changed)
    obs.obs_data_release(changed)
    local private = obs.obs_source_get_private_settings(source)
    obs.obs_data_set_string(private, "obs3dgs_ui_settings_page", "display")
    obs.obs_data_release(private)
  elseif phase == 1 then
    check("native deferred edit was processed", math.abs(setting("camera_yaw") - 83.45) < 0.000001)
    check("property edit is live", setting("focal_length_mm") == 85 and setting("exposure") == 2)
    -- OBSBasicProperties::on_buttonBox_clicked(RejectRole): clear + update oldSettings.
    local settings = obs.obs_source_get_settings(source)
    obs.obs_data_clear(settings)
    obs.obs_source_update(source, original)
    obs.obs_data_release(settings)
  elseif phase == 2 then
    check("property cancel restores render settings", setting("focal_length_mm") == 42 and setting("exposure") == 1)
    local private = obs.obs_source_get_private_settings(source)
    check("property cancel retains browsed page", obs.obs_data_get_string(private, "obs3dgs_ui_settings_page") == "display")
    obs.obs_data_release(private)
    local settings = obs.obs_source_get_settings(source)
    check("private page is absent from renderer settings", not obs.obs_data_has_user_value(settings, "obs3dgs_ui_settings_page"))
    obs.obs_data_release(settings)
    finish()
  end
  phase = phase + 1
end

local function tick()
  local ok, message = pcall(advance)
  if not ok then
    check("script error: " .. tostring(message), false)
    pcall(finish)
    phase = 3
  end
  if phase >= 3 then obs.timer_remove(tick) end
end

function script_description()
  return "Isolated obs-3dgs native duplication/private-state/cancel contract checks."
end
function script_load()
  obs.timer_add(tick, 1000)
end
function script_unload()
  obs.timer_remove(tick)
  if phase < 3 then
    check("test completed before unload", false)
    pcall(finish)
  end
end
