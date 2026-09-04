// SPDX-License-Identifier: GPL-2.0-or-later

#include "dock-preset-state.hpp"
#include "dock-status.hpp"
#include "pending-dock-edits.hpp"
#include "scalar-control.hpp"

#include <QApplication>
#include <QKeyEvent>

#include <iostream>

namespace {
int failures = 0;
void expect(bool condition, const char *message)
{
  if (!condition) {
    std::cerr << "FAIL: " << message << '\n';
    ++failures;
  }
}
}

int main(int argc, char **argv)
{
  QApplication app(argc, argv);
  expect(obs3dgs::effectiveDockStatus(true, "error") == "error",
         "a retained valid frame must not hide a replacement error in the Dock");
  expect(obs3dgs::effectiveDockStatus(true, "ready") == "ready",
         "a loaded scene without an error should show its live frame rate");
  expect(obs3dgs::effectiveDockStatus(false, "loading") == "loading",
         "loading progress should remain available before a scene is ready");
  obs3dgs::ScalarControl control(QStringLiteral("Focal length"), "Camera.FocalLength", 16, 200, 1, false);
  control.setValue(35, true);
  control.show();
  control.activateWindow();
  auto *spin = control.findChild<QDoubleSpinBox *>();
  auto *slider = control.findChild<QSlider *>();
  expect(spin && slider, "the numeric and slider editors must be discoverable");
  if (!spin || !slider)
    return 1;
  auto *editor = spin->findChild<QLineEdit *>();
  expect(editor != nullptr, "the spin box must expose its text editor");
  if (!editor)
    return 1;
  std::cout << "Qt editors initialized\n" << std::flush;
  spin->setFocus();
  app.processEvents();
  expect(spin->hasFocus(), "the test must actually focus the editable field");
  int writes = 0;
  double writtenValue = 0;
  control.onChanged([&](double value) { ++writes; writtenValue = value; });
  editor->setText(QStringLiteral("8"));
  for (int refresh = 0; refresh < 100; ++refresh)
    control.setValue(35);
  expect(editor->text() == QStringLiteral("8"), "polling must not erase an unfinished numeric entry");
  expect(writes == 0, "polling must not dispatch settings changes");
  editor->setText(QStringLiteral("85"));
  QKeyEvent enter(QEvent::KeyPress, Qt::Key_Return, Qt::NoModifier);
  QApplication::sendEvent(spin, &enter);
  expect(writes == 1 && writtenValue == 85, "committing an edit should emit the entered value exactly once");
  control.setValue(50, true);
  expect(control.value() == 50, "switching to a different source must refresh even a focused control");
  expect(writes == 1, "a forced source refresh must not emit a user edit");
  spin->clearFocus();
  slider->setSliderDown(true);
  slider->setValue(3000);
  const double dragged = control.value();
  control.setValue(35);
  expect(control.value() == dragged, "polling must not reset an active slider drag");
  slider->setSliderDown(false);
  control.setValue(35);
  expect(control.value() == 35, "polling should resume after the drag ends");
  std::cout << "Scalar editing checks completed\n" << std::flush;

  obs3dgs::PendingDockEdits pending;
  pending.set("source-a", "focal_length_mm", 24);
  pending.set("source-a", "focal_length_mm", 35);
  pending.set("source-b", "focal_length_mm", 85);
  pending.set("source-a", "camera_yaw", 17);
  const auto edits = pending.take();
  expect(edits.size() == 3, "rapid edits should coalesce per source and per parameter");
  expect(edits.at({"source-a", "focal_length_mm"}) == 35, "queued edits retain their original source");
  expect(edits.at({"source-b", "focal_length_mm"}) == 85, "a new source's edits remain separate");
  expect(pending.take().empty(), "drained edits must not be applied again");
  std::cout << "Queued edit checks completed\n" << std::flush;

  obs3dgs::DockPresetState model;
  QComboBox combo;
  std::vector<nlohmann::json> presets;
  const char *twoPresets = R"([{"name":"Wide"},{"name":"Close"}])";
  model.refresh(&combo, presets, "source-a", twoPresets, 0);
  expect(combo.count() == 2 && combo.currentIndex() == 0, "initial preset list must select the active camera");
  combo.setCurrentIndex(1);
  for (int refresh = 0; refresh < 100; ++refresh)
    model.refresh(&combo, presets, "source-a", twoPresets, 0);
  expect(combo.currentIndex() == 1, "polling must preserve a browsed preset before Apply is clicked");
  combo.setCurrentIndex(0);
  model.refresh(&combo, presets, "source-a", twoPresets, 1);
  expect(combo.currentIndex() == 1, "a hotkey changing the active preset must update the Dock");
  model.refresh(&combo, presets, "source-b", twoPresets, 0);
  expect(combo.currentIndex() == 0, "switching sources must restore that source's active preset");
  model.refresh(&combo, presets, "source-b", R"([{"name":"Renamed"}])", 0);
  expect(combo.count() == 1 && combo.currentText() == QStringLiteral("Renamed"), "external preset changes must refresh the list");
  model.refresh(&combo, presets, "source-b", "invalid", 4);
  expect(combo.count() == 0 && combo.currentIndex() == -1, "malformed preset JSON must clear stale entries");

  if (!failures)
    std::cout << "Dock editing, source isolation and preset synchronization passed\n";
  return failures ? 1 : 0;
}
