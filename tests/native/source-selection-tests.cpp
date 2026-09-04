// SPDX-License-Identifier: GPL-2.0-or-later

#include "source-selection.hpp"

#include <iostream>
#include <string>
#include <chrono>
#include <condition_variable>
#include <mutex>

namespace {
int failures = 0;
int destroyedFixtures = 0;
std::mutex destructionMutex;
std::condition_variable destructionFinished;
void expect(bool passed, const char *message)
{
  if (!passed) {
    std::cerr << "FAIL: " << message << '\n';
    ++failures;
  }
}

void registerFixture(const char *id)
{
  obs_source_info info = {};
  info.id = id;
  info.type = OBS_SOURCE_TYPE_INPUT;
  info.output_flags = OBS_SOURCE_VIDEO;
  info.get_name = [](void *) { return "Selection fixture"; };
  info.create = [](obs_data_t *, obs_source_t *) -> void * { return new int(0); };
  info.destroy = [](void *data) {
    delete static_cast<int *>(data);
    {
      std::lock_guard lock(destructionMutex);
      ++destroyedFixtures;
    }
    destructionFinished.notify_one();
  };
  info.get_width = [](void *) -> uint32_t { return 16; };
  info.get_height = [](void *) -> uint32_t { return 16; };
  obs_register_source(&info);
}
}

int main()
{
  if (!obs_startup("en-US", nullptr, nullptr))
    return 1;
  registerFixture("obs_3dgs_source");
  registerFixture("selection_fixture_other");
  obs_scene_t *scene = obs_scene_create_private("selection regression");
  obs_source_t *a = obs_source_create_private("obs_3dgs_source", "A", nullptr);
  obs_source_t *b = obs_source_create_private("obs_3dgs_source", "B", nullptr);
  obs_source_t *c = obs_source_create_private("obs_3dgs_source", "C", nullptr);
  obs_source_t *other = obs_source_create_private("selection_fixture_other", "Other", nullptr);
  if (!scene || !a || !b || !c || !other)
    return 1;
  const std::string aUuid = obs_source_get_uuid(a);
  const std::string bUuid = obs_source_get_uuid(b);
  const std::string cUuid = obs_source_get_uuid(c);
  auto *aItem = obs_scene_add(scene, a);
  auto *otherItem = obs_scene_add(scene, other);
  expect(obs3dgs::selected3dgsSource(nullptr).uuid.empty(), "a missing scene has no automatic target");
  expect(obs3dgs::selected3dgsSource(scene).uuid.empty(), "unselected sources must not be chosen automatically");
  obs_sceneitem_select(aItem, true);
  expect(obs3dgs::selected3dgsSource(scene).uuid == aUuid, "top-level selected sources remain supported");
  obs_sceneitem_select(aItem, false);

  auto *outer = obs_scene_add_group(scene, "Outer group");
  auto *outerScene = obs_sceneitem_group_get_scene(outer);
  auto *bItem = obs_scene_add(outerScene, b);
  obs_sceneitem_select(bItem, true);
  expect(obs3dgs::selected3dgsSource(scene).uuid == bUuid, "a selected source inside an unselected group is found");
  obs_sceneitem_select(bItem, false);
  obs_sceneitem_select(outer, true);
  expect(obs3dgs::selected3dgsSource(scene).uuid == bUuid, "a selected group with one 3DGS source resolves that source");
  obs_sceneitem_select(outer, false);

  auto *inner = obs_scene_add_group(outerScene, "Nested group");
  auto *innerScene = obs_sceneitem_group_get_scene(inner);
  auto *cItem = obs_scene_add(innerScene, c);
  obs_sceneitem_select(cItem, true);
  expect(obs3dgs::selected3dgsSource(scene).uuid == cUuid, "selected sources in nested groups are found");
  obs_sceneitem_select(cItem, false);
  obs_sceneitem_select(outer, true);
  auto selection = obs3dgs::selected3dgsSource(scene);
  expect(selection.uuid.empty() && selection.ambiguousGroup, "a group containing distinct sources requires explicit selection");
  obs_sceneitem_select(cItem, true);
  expect(obs3dgs::selected3dgsSource(scene).uuid == cUuid, "a selected nested source wins over an ambiguous parent group");
  obs_sceneitem_select(cItem, false);
  obs_sceneitem_select(aItem, true);
  expect(obs3dgs::selected3dgsSource(scene).uuid == aUuid, "an explicit top-level selection wins over an ambiguous group");
  obs_sceneitem_select(aItem, false);
  obs_sceneitem_select(outer, false);
  obs_sceneitem_select(inner, true);
  expect(obs3dgs::selected3dgsSource(scene).uuid == cUuid, "a selected nested group with one source resolves correctly");
  obs_scene_add(innerScene, c);
  expect(obs3dgs::selected3dgsSource(scene).uuid == cUuid, "multiple references to one source are not ambiguous");
  obs_sceneitem_select(inner, false);
  obs_sceneitem_select(otherItem, true);
  selection = obs3dgs::selected3dgsSource(scene);
  expect(selection.uuid.empty() && !selection.ambiguousGroup, "selecting an unrelated source does not select hidden descendants");

  obs_scene_release(scene);
  obs_source_release(a);
  obs_source_release(b);
  obs_source_release(c);
  obs_source_release(other);
  // Headless libobs has no audio/video threads, so its usual destroy-queue
  // waiter returns early. Wait for our sources before tearing down the core.
  {
    std::unique_lock lock(destructionMutex);
    expect(destructionFinished.wait_for(lock, std::chrono::seconds(10), [] { return destroyedFixtures == 4; }),
           "all test sources must finish destruction before OBS shutdown");
  }
  obs_queue_task(OBS_TASK_DESTROY, [](void *) {}, nullptr, true);
  obs_shutdown();
  if (!failures)
    std::cout << "All 12 real libobs group-selection checks passed\n";
  return failures ? 1 : 0;
}
