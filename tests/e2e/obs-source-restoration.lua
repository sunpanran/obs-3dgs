-- SPDX-License-Identifier: GPL-2.0-or-later
-- Dedicated OBS profile only. Tests real save/remove/load calls across video ticks.
local obs = obslua
local source, saved
local uuid = nil
local cycles = 0
local phase = "create"
local errors = {}

local function check(condition, message)
  if not condition then error(message) end
end
local function removeSource()
  if source then obs.obs_source_remove(source); obs.obs_source_release(source); source = nil end
end
local function finish()
  removeSource()
  if saved then obs.obs_data_release(saved); saved = nil end
  local report = obs.obs_data_create()
  obs.obs_data_set_bool(report, "passed", #errors == 0 and cycles == 100)
  obs.obs_data_set_int(report, "restoredCycles", cycles)
  obs.obs_data_set_string(report, "error", table.concat(errors, "; "))
  local file = assert(io.open(script_path() .. "../../output/obs-source-restoration/report.json", "w"))
  file:write(obs.obs_data_get_json(report), "\n"); file:close()
  obs.obs_data_release(report)
  obs.script_log(obs.LOG_INFO, "obs-3dgs restored source cycles=" .. cycles .. ", errors=" .. #errors)
end
local function advance()
  if phase == "create" then
    local data = obs.obs_data_create()
    obs.obs_data_set_double(data, "focal_length_mm", 42)
    obs.obs_data_set_double(data, "exposure", 1.25)
    obs.obs_data_set_double(data, "camera_yaw", 803.45)
    obs.obs_data_set_bool(data, "live_lock", true)
    obs.obs_data_set_string(data, "camera_presets_json", '[{"name":"Restored view","camera":{"focalLengthMm":42}}]')
    source = assert(obs.obs_source_create("obs_3dgs_source", "obs-3dgs-restoration-test", data, nil))
    obs.obs_data_release(data)
    uuid = obs.obs_source_get_uuid(source)
    local private = obs.obs_source_get_private_settings(source)
    obs.obs_data_set_string(private, "obs3dgs_ui_settings_page", "camera")
    obs.obs_data_set_bool(private, "obs3dgs_ui_advanced_camera", true)
    obs.obs_data_release(private)
    saved = assert(obs.obs_save_source(source))
    phase = "remove"
  elseif phase == "remove" then
    removeSource()
    phase = "load"
  elseif phase == "load" then
    source = assert(obs.obs_load_source(saved))
    check(obs.obs_source_get_uuid(source) == uuid, "Restoration changed the saved UUID")
    local data = obs.obs_source_get_settings(source)
    check(obs.obs_data_get_double(data, "focal_length_mm") == 42, "Focal length was not restored")
    check(obs.obs_data_get_double(data, "exposure") == 1.25, "Exposure was not restored")
    check(math.abs(obs.obs_data_get_double(data, "camera_yaw") - 83.45) < 0.000001, "Wrapped camera direction changed")
    check(obs.obs_data_get_bool(data, "live_lock"), "Live lock was not restored")
    check(string.find(obs.obs_data_get_string(data, "camera_presets_json"), "Restored view", 1, true), "Preset JSON was lost")
    obs.obs_data_release(data)
    local private = obs.obs_source_get_private_settings(source)
    check(obs.obs_data_get_string(private, "obs3dgs_ui_settings_page") == "camera", "Private page was lost")
    check(obs.obs_data_get_bool(private, "obs3dgs_ui_advanced_camera"), "Private camera reveal was lost")
    obs.obs_data_release(private)
    cycles = cycles + 1
    if cycles == 100 then phase = "done"; finish() else phase = "remove" end
  end
end
local function tick()
  local ok, message = pcall(advance)
  if not ok then errors[#errors + 1] = tostring(message); phase = "done"; pcall(finish) end
  if phase == "done" then obs.timer_remove(tick) end
end
function script_description() return "100-cycle obs-3dgs source serialization/restoration validation." end
function script_load() obs.timer_add(tick, 100) end
function script_unload()
  obs.timer_remove(tick)
  if phase ~= "done" then errors[#errors + 1] = "Interrupted before completion"; pcall(finish) end
end
