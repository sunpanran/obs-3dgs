-- SPDX-License-Identifier: GPL-2.0-or-later
-- Dedicated OBS scene collection only. Opens the real Dock for visual QA with
-- a selected nested group containing one 3DGS source and two saved views.
local obs = obslua
local source, outer, sceneSource

local function setup()
  obs.timer_remove(setup)
  sceneSource = obs.obs_frontend_get_current_scene()
  local scene = assert(obs.obs_scene_from_source(sceneSource))
  local settings = obs.obs_data_create()
  obs.obs_data_set_string(settings, "asset_path", script_path() .. "../../tmp/obs-missing-callback-fixtures/relocated 场景.ply")
  obs.obs_data_set_double(settings, "focal_length_mm", 35)
  obs.obs_data_set_string(settings, "camera_presets_json", '[{"name":"全景机位","camera":{"focalLengthMm":35}},{"name":"近景机位","camera":{"focalLengthMm":85}}]')
  source = assert(obs.obs_source_create("obs_3dgs_source", "群组内 3DGS 示例", settings, nil))
  obs.obs_data_release(settings)
  outer = obs.obs_scene_add_group(scene, "背景群组")
  local inner = obs.obs_scene_add_group(obs.obs_sceneitem_group_get_scene(outer), "嵌套群组")
  obs.obs_scene_add(obs.obs_sceneitem_group_get_scene(inner), source)
  obs.obs_sceneitem_select(inner, true)
  local properties = obs.obs_source_properties(source)
  local button = assert(obs.obs_properties_get(properties, "open_dock"))
  obs.obs_property_button_clicked(button, nil)
  obs.obs_properties_destroy(properties)
  obs.script_log(obs.LOG_INFO, "Grouped 3DGS Dock preview opened")
end

function script_description()
  return "Isolated grouped-source Dock layout preview. Creates its own nested group and source."
end
function script_load() obs.timer_add(setup, 1000) end
function script_unload()
  obs.timer_remove(setup)
  if outer then obs.obs_sceneitem_remove(outer); outer = nil end
  if source then obs.obs_source_remove(source); obs.obs_source_release(source); source = nil end
  if sceneSource then obs.obs_source_release(sceneSource); sceneSource = nil end
end
