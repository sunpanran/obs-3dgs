// SPDX-License-Identifier: GPL-2.0-or-later

#include "localization.hpp"

#include <obs-module.h>

#include <QByteArray>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QSettings>
#include <QStringConverter>
#include <QTextStream>

#include <cstring>

namespace obs3dgs {

Localization &Localization::instance()
{
  static Localization catalog;
  return catalog;
}

void Localization::initialize()
{
  std::lock_guard lock(mutex_);
  english_ = loadLocale("en-US");
  chinese_ = loadLocale("zh-CN");
  char *configPath = obs_module_config_path("settings.ini");
  if (configPath) {
    configPath_ = QString::fromUtf8(configPath);
    bfree(configPath);
    QSettings settings(configPath_, QSettings::IniFormat);
    const auto stored = settings.value(QStringLiteral("language"), QStringLiteral("auto")).toString().toStdString();
    if (stored == "auto" || stored == "zh-CN" || stored == "en-US")
      selection_ = stored;
  }
}

QString Localization::translate(const char *key) const
{
  std::lock_guard lock(mutex_);
  const bool chinese = selection_ == "zh-CN" ||
                       (selection_ == "auto" && obs_get_locale() && std::strncmp(obs_get_locale(), "zh", 2) == 0);
  const auto &primary = chinese ? chinese_ : english_;
  if (const auto found = primary.find(key); found != primary.end())
    return found->second;
  if (const auto fallback = english_.find(key); fallback != english_.end())
    return fallback->second;
  return QString::fromUtf8(key);
}

std::string Localization::selection() const
{
  std::lock_guard lock(mutex_);
  return selection_;
}

std::string Localization::effectiveLocale() const
{
  std::lock_guard lock(mutex_);
  if (selection_ != "auto")
    return selection_;
  const char *locale = obs_get_locale();
  return locale && std::strncmp(locale, "zh", 2) == 0 ? "zh-CN" : "en-US";
}

void Localization::setSelection(const std::string &selection)
{
  if (selection != "auto" && selection != "zh-CN" && selection != "en-US")
    return;
  {
    std::lock_guard lock(mutex_);
    selection_ = selection;
  }
  saveSelection();
}

std::unordered_map<std::string, QString> Localization::loadLocale(const char *name)
{
  std::unordered_map<std::string, QString> result;
  const std::string relative = std::string("locale/") + name + ".ini";
  char *path = obs_module_file(relative.c_str());
  if (!path)
    return result;
  QFile file(QString::fromUtf8(path));
  bfree(path);
  if (!file.open(QIODevice::ReadOnly | QIODevice::Text))
    return result;

  QTextStream stream(&file);
  stream.setEncoding(QStringConverter::Utf8);
  while (!stream.atEnd()) {
    const QString line = stream.readLine().trimmed();
    if (line.isEmpty() || line.startsWith(QLatin1Char('#')) || line.startsWith(QLatin1Char(';')))
      continue;
    const qsizetype separator = line.indexOf(QLatin1Char('='));
    if (separator <= 0)
      continue;
    const QString key = line.left(separator).trimmed();
    QString value = line.mid(separator + 1).trimmed();
    if (value.size() >= 2 && value.front() == QLatin1Char('"') && value.back() == QLatin1Char('"'))
      value = value.mid(1, value.size() - 2);
    value.replace(QStringLiteral("\\n"), QStringLiteral("\n"));
    value.replace(QStringLiteral("\\\""), QStringLiteral("\""));
    result[key.toStdString()] = value;
  }
  return result;
}

void Localization::saveSelection() const
{
  std::lock_guard lock(mutex_);
  if (configPath_.isEmpty())
    return;
  QDir().mkpath(QFileInfo(configPath_).absolutePath());
  QSettings settings(configPath_, QSettings::IniFormat);
  settings.setValue(QStringLiteral("language"), QString::fromStdString(selection_));
  settings.sync();
}

const char *text(const char *key)
{
  thread_local QByteArray translated;
  translated = Localization::instance().translate(key).toUtf8();
  return translated.constData();
}

} // namespace obs3dgs
