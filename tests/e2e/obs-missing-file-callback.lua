-- SPDX-License-Identifier: GPL-2.0-or-later
-- Windows OBS test profile only. Exercise the exact libobs dispatcher used by
-- OBSMissingFiles::saveFiles; setting asset_path through WebSocket skips it.
local obs = obslua
local ffi = require("ffi")
ffi.cdef[[
typedef struct obs_source obs_source_t;
typedef struct obs_missing_files obs_missing_files_t;
typedef struct obs_missing_file obs_missing_file_t;
obs_source_t *obs_get_source_by_name(const char *name);
void obs_source_release(obs_source_t *source);
obs_missing_files_t *obs_source_get_missing_files(const obs_source_t *source);
size_t obs_missing_files_count(obs_missing_files_t *files);
obs_missing_file_t *obs_missing_files_get_file(obs_missing_files_t *files, int idx);
void obs_missing_file_issue_callback(obs_missing_file_t *file, const char *new_path);
void obs_missing_files_destroy(obs_missing_files_t *files);
]]
local native = ffi.load("obs")
local root = script_path() .. "../../"
local relocated = root .. "tmp/obs-missing-callback-fixtures/relocated 场景.ply"
local presetJson = '[{"name":"Saved view","camera":{"focalLengthMm":73}}]'
local cases = {
  { name = "relink", locked = false, visible = true, replacement = relocated },
  { name = "clear", locked = false, replacement = "" },
  { name = "locked-relink", locked = true, visible = true, replacement = relocated }
}
local results, source = {}, nil
local phase, caseIndex, failureCount = "create", 1, 0
local initialUuid
local showing, readyWaits = false, 0

local function check(name, passed)
  results[#results + 1] = { name = cases[caseIndex].name .. ": " .. name, passed = not not passed }
  if not passed then failureCount = failureCount + 1 end
end

local function removeSource()
  if source then
    if showing then obs.obs_source_dec_showing(source); showing = false end
    obs.obs_source_remove(source)
    obs.obs_source_release(source)
    source = nil
  end
end

local function finish()
  removeSource()
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
  obs.obs_data_set_bool(report, "passed", failureCount == 0 and caseIndex == #cases)
  obs.obs_data_set_int(report, "failures", failureCount)
  obs.obs_data_set_string(report, "dispatcher", "obs_missing_file_issue_callback")
  local file = assert(io.open(root .. "output/obs-missing-file-callback/report.json", "w"))
  file:write(obs.obs_data_get_json(report), "\n")
  file:close()
  obs.obs_data_release(report)
  phase = "done"
  obs.script_log(obs.LOG_INFO, "obs-3dgs missing-file callback checks completed; failures=" .. failureCount)
end

local function dispatchReplacement()
  local nativeSource = native.obs_get_source_by_name(obs.obs_source_get_name(source))
  assert(nativeSource ~= nil, "Native test source was not found")
  local files = native.obs_source_get_missing_files(nativeSource)
  assert(files ~= nil, "Missing-file list was not returned")
  local count = tonumber(native.obs_missing_files_count(files))
  check("one missing file is registered", count == 1)
  if count == 1 then
    local file = native.obs_missing_files_get_file(files, 0)
    native.obs_missing_file_issue_callback(file, cases[caseIndex].replacement)
    check("native dispatcher returned without crashing OBS", true)
  end
  native.obs_missing_files_destroy(files)
  native.obs_source_release(nativeSource)
end

local function advance()
  local testCase = cases[caseIndex]
  if phase == "create" then
    local settings = obs.obs_data_create()
    obs.obs_data_set_string(settings, "asset_path", root .. "tmp/obs-missing-callback-fixtures/missing-" .. testCase.name .. ".ply")
    obs.obs_data_set_double(settings, "focal_length_mm", 73)
    obs.obs_data_set_double(settings, "exposure", 1.25)
    obs.obs_data_set_double(settings, "camera_distance", 7.5)
    obs.obs_data_set_double(settings, "camera_target_x", 1.2)
    obs.obs_data_set_double(settings, "camera_yaw", 17)
    obs.obs_data_set_bool(settings, "live_lock", testCase.locked)
    obs.obs_data_set_string(settings, "camera_presets_json", presetJson)
    source = assert(obs.obs_source_create("obs_3dgs_source", "obs-3dgs-missing-callback-" .. testCase.name, settings, nil))
    obs.obs_data_release(settings)
    initialUuid = obs.obs_source_get_uuid(source)
    local private = obs.obs_source_get_private_settings(source)
    obs.obs_data_set_string(private, "obs3dgs_ui_settings_page", "camera")
    obs.obs_data_set_bool(private, "obs3dgs_ui_advanced_camera", true)
    obs.obs_data_release(private)
    if testCase.visible then obs.obs_source_inc_showing(source); showing = true end
    phase = "resolve"
  elseif phase == "resolve" then
    dispatchReplacement()
    readyWaits = 0
    phase = testCase.visible and "wait-ready" or "verify"
  elseif phase == "wait-ready" then
    local properties = obs.obs_source_properties(source)
    local status = obs.obs_properties_get(properties, "obs3dgs_property_status")
    local text = status and obs.obs_property_description(status) or ""
    obs.obs_properties_destroy(properties)
    -- Both shipped locales reserve the FPS suffix for a loaded, ready scene.
    local ready = string.find(text, " FPS", 1, true) ~= nil
    readyWaits = readyWaits + 1
    if ready or readyWaits >= 45 then
      check("relocated scene reaches renderer-ready state", ready)
      phase = "verify"
    end
  elseif phase == "verify" then
    local settings = obs.obs_source_get_settings(source)
    check("replacement path is committed", obs.obs_data_get_string(settings, "asset_path") == testCase.replacement)
    check("camera and exposure are preserved", obs.obs_data_get_double(settings, "focal_length_mm") == 73 and obs.obs_data_get_double(settings, "exposure") == 1.25)
    check("relink does not reframe the saved camera", math.abs(obs.obs_data_get_double(settings, "camera_distance") - 7.5) < 0.000001 and math.abs(obs.obs_data_get_double(settings, "camera_target_x") - 1.2) < 0.000001 and math.abs(obs.obs_data_get_double(settings, "camera_yaw") - 17) < 0.000001)
    check("saved presets are preserved", obs.obs_data_get_string(settings, "camera_presets_json") == presetJson)
    check("live lock is preserved", obs.obs_data_get_bool(settings, "live_lock") == testCase.locked)
    obs.obs_data_release(settings)
    check("source identity is preserved", obs.obs_source_get_uuid(source) == initialUuid)
    local private = obs.obs_source_get_private_settings(source)
    check("private UI state is preserved", obs.obs_data_get_string(private, "obs3dgs_ui_settings_page") == "camera" and obs.obs_data_get_bool(private, "obs3dgs_ui_advanced_camera"))
    obs.obs_data_release(private)
    local saved = obs.obs_save_source(source)
    local savedSettings = obs.obs_data_get_obj(saved, "settings")
    check("replacement path is serialized", obs.obs_data_get_string(savedSettings, "asset_path") == testCase.replacement)
    obs.obs_data_release(savedSettings)
    obs.obs_data_release(saved)
    if testCase.locked then
      local change = obs.obs_data_create()
      obs.obs_data_set_double(change, "focal_length_mm", 120)
      obs.obs_source_update(source, change)
      obs.obs_data_release(change)
      phase = "verify-lock"
    else
      phase = "next"
    end
  elseif phase == "verify-lock" then
    local settings = obs.obs_source_get_settings(source)
    check("ordinary edits remain locked after recovery", obs.obs_data_get_double(settings, "focal_length_mm") == 73)
    obs.obs_data_release(settings)
    phase = "next"
  elseif phase == "next" then
    removeSource()
    if caseIndex == #cases then finish() else caseIndex = caseIndex + 1; phase = "create" end
  end
end

local function tick()
  local ok, message = pcall(advance)
  if not ok then check("script error: " .. tostring(message), false); pcall(finish) end
  if phase == "done" then obs.timer_remove(tick) end
end

function script_description()
  return "Windows-only native missing-file callback regression. Use an isolated OBS collection and the documented fixture."
end
function script_load() obs.timer_add(tick, 1000) end
function script_unload()
  obs.timer_remove(tick)
  if phase ~= "done" then check("completed before unload", false); pcall(finish) end
end
