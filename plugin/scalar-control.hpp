// SPDX-License-Identifier: GPL-2.0-or-later

#pragma once

#include <QDoubleSpinBox>
#include <QGridLayout>
#include <QLabel>
#include <QLineEdit>
#include <QSlider>
#include <QVariant>
#include <QWidget>

#include <algorithm>
#include <cmath>
#include <functional>
#include <utility>

namespace obs3dgs {

class ScalarControl final : public QWidget {
public:
  ScalarControl(const QString &label, const char *labelKey, double minimum, double maximum, double step, bool logarithmic,
                QWidget *parent = nullptr)
      : QWidget(parent), minimum_(minimum), maximum_(maximum), logarithmic_(logarithmic)
  {
    auto *layout = new QGridLayout(this);
    layout->setContentsMargins(0, 0, 0, 0);
    layout->setHorizontalSpacing(8);
    label_ = new QLabel(label, this);
    label_->setProperty("obs3dgsI18nKey", QString::fromUtf8(labelKey));
    label_->setMinimumWidth(82);
    slider_ = new QSlider(Qt::Horizontal, this);
    slider_->setRange(0, 10000);
    spin_ = new QDoubleSpinBox(this);
    spin_->setRange(minimum, maximum);
    spin_->setSingleStep(step);
    spin_->setDecimals(step < 0.01 ? 3 : step < 0.1 ? 2 : 1);
    spin_->setKeyboardTracking(false);
    spin_->setMinimumWidth(88);
    layout->addWidget(label_, 0, 0);
    layout->addWidget(slider_, 0, 1);
    layout->addWidget(spin_, 0, 2);

    connect(slider_, &QSlider::valueChanged, this, [this](int position) {
      if (syncing_)
        return;
      syncing_ = true;
      spin_->setValue(fromSlider(position));
      syncing_ = false;
      if (onChanged_)
        onChanged_(spin_->value());
    });
    connect(spin_, &QDoubleSpinBox::valueChanged, this, [this](double value) {
      if (syncing_)
        return;
      syncing_ = true;
      slider_->setValue(toSlider(value));
      syncing_ = false;
      if (onChanged_)
        onChanged_(value);
    });
  }

  void setValue(double value, bool force = false)
  {
    if (!force && (spin_->hasFocus() || slider_->isSliderDown()))
      return;
    syncing_ = true;
    spin_->setValue(value);
    slider_->setValue(toSlider(value));
    syncing_ = false;
  }

  void setSuffix(const QString &suffix)
  {
    spin_->setSuffix(suffix);
  }
  [[nodiscard]] double value() const
  {
    return spin_->value();
  }
  void onChanged(std::function<void(double)> callback)
  {
    onChanged_ = std::move(callback);
  }

private:
  int toSlider(double value) const
  {
    value = std::clamp(value, minimum_, maximum_);
    const double normalized = logarithmic_
                                  ? (std::log(value) - std::log(minimum_)) / (std::log(maximum_) - std::log(minimum_))
                                  : (value - minimum_) / (maximum_ - minimum_);
    return static_cast<int>(std::round(normalized * 10000.0));
  }

  double fromSlider(int position) const
  {
    const double normalized = static_cast<double>(position) / 10000.0;
    return logarithmic_ ? std::exp(std::log(minimum_) + normalized * (std::log(maximum_) - std::log(minimum_)))
                        : minimum_ + normalized * (maximum_ - minimum_);
  }

  QLabel *label_ = nullptr;
  QSlider *slider_ = nullptr;
  QDoubleSpinBox *spin_ = nullptr;
  double minimum_ = 0.0;
  double maximum_ = 1.0;
  bool logarithmic_ = false;
  bool syncing_ = false;
  std::function<void(double)> onChanged_;
};

} // namespace obs3dgs
