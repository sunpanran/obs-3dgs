// SPDX-License-Identifier: GPL-2.0-or-later

#pragma once

#include <QDockWidget>
#include <QWidget>

namespace obs3dgs {

inline void showDockContents(QWidget *contents)
{
  if (!contents)
    return;
  QWidget *dock = contents;
  while (dock && !qobject_cast<QDockWidget *>(dock))
    dock = dock->parentWidget();
  // A child explicitly hidden during registration stays hidden when its dock
  // is shown. Restore the contents as well as the OBS-owned outer dock.
  contents->show();
  if (dock) {
    dock->show();
    dock->raise();
    dock->activateWindow();
  }
}

} // namespace obs3dgs
