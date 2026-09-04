// SPDX-License-Identifier: GPL-2.0-or-later

#include "local-server.hpp"
#include "dock.hpp"
#include "localization.hpp"
#include "source.hpp"

#include <obs-module.h>
#include <obs-frontend-api.h>

#include <QWidget>

OBS_DECLARE_MODULE()
OBS_MODULE_USE_DEFAULT_LOCALE("obs-3dgs", "en-US")
OBS_MODULE_AUTHOR("obs-3dgs contributors")

bool obs_module_load()
{
  obs3dgs::Localization::instance().initialize();
  obs3dgs::registerSource();
  QWidget *dock = obs3dgs::createControlDock();
  if (obs_frontend_add_dock_by_id("obs-3dgs-control-dock", obs3dgs::text("Dock.Title"), dock))
    dock->setVisible(false);
  else
    blog(LOG_WARNING, "[obs-3dgs] Unable to register control dock");
  blog(LOG_INFO, "[obs-3dgs] Loaded version %s", OBS_3DGS_VERSION);
  return true;
}

void obs_module_unload()
{
  obs3dgs::destroyControlDock();
  obs3dgs::LocalServer::instance().stop();
  blog(LOG_INFO, "[obs-3dgs] Unloaded");
}

const char *obs_module_description()
{
  return "Local 3D Gaussian Splatting scenes for OBS Studio";
}
