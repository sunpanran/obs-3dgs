// SPDX-License-Identifier: GPL-2.0-or-later

#include "source-selection.hpp"

#include <cstring>
#include <set>

namespace obs3dgs {
namespace {

std::string itemUuid(obs_sceneitem_t *item)
{
  obs_source_t *source = obs_sceneitem_get_source(item);
  const char *id = source ? obs_source_get_unversioned_id(source) : nullptr;
  if (!id || std::strcmp(id, "obs_3dgs_source") != 0)
    return {};
  const char *uuid = obs_source_get_uuid(source);
  return uuid ? uuid : "";
}

bool findSelectedItem(obs_scene_t *, obs_sceneitem_t *item, void *data)
{
  auto &uuid = *static_cast<std::string *>(data);
  if (obs_sceneitem_is_group(item))
    obs_sceneitem_group_enum_items(item, findSelectedItem, data);
  else if (obs_sceneitem_selected(item))
    uuid = itemUuid(item);
  return uuid.empty();
}

bool collectGroupSources(obs_scene_t *, obs_sceneitem_t *item, void *data)
{
  auto &candidates = *static_cast<std::set<std::string> *>(data);
  if (obs_sceneitem_is_group(item)) {
    obs_sceneitem_group_enum_items(item, collectGroupSources, data);
  } else {
    const auto uuid = itemUuid(item);
    if (!uuid.empty())
      candidates.insert(uuid);
  }
  return candidates.size() < 2;
}

bool findSelectedGroups(obs_scene_t *, obs_sceneitem_t *item, void *data)
{
  if (obs_sceneitem_is_group(item)) {
    obs_sceneitem_group_enum_items(item, obs_sceneitem_selected(item) ? collectGroupSources : findSelectedGroups, data);
  }
  return static_cast<std::set<std::string> *>(data)->size() < 2;
}

} // namespace

SourceSelection selected3dgsSource(obs_scene_t *scene)
{
  SourceSelection result;
  if (!scene)
    return result;
  // An explicitly selected source takes priority over a selected ancestor group.
  obs_scene_enum_items(scene, findSelectedItem, &result.uuid);
  if (!result.uuid.empty())
    return result;
  std::set<std::string> candidates;
  obs_scene_enum_items(scene, findSelectedGroups, &candidates);
  if (candidates.size() == 1)
    result.uuid = *candidates.begin();
  result.ambiguousGroup = candidates.size() > 1;
  return result;
}

} // namespace obs3dgs
