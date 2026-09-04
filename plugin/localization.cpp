// SPDX-License-Identifier: GPL-2.0-or-later

#include "localization.hpp"
#include "obs-locale.hpp"

#include <obs-module.h>

#include <QByteArray>
#include <QFile>
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
}

QString Localization::translate(const char *key) const
{
  std::lock_guard lock(mutex_);
  const bool chinese = std::strcmp(localeForObs(obs_get_locale()), "zh-CN") == 0;
  const auto &primary = chinese ? chinese_ : english_;
  if (const auto found = primary.find(key); found != primary.end())
    return found->second;
  if (const auto fallback = english_.find(key); fallback != english_.end())
    return fallback->second;
  return QString::fromUtf8(key);
}

std::string Localization::effectiveLocale() const
{
  return localeForObs(obs_get_locale());
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

const char *text(const char *key)
{
  thread_local QByteArray translated;
  translated = Localization::instance().translate(key).toUtf8();
  return translated.constData();
}

} // namespace obs3dgs
