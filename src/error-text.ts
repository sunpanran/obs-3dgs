// SPDX-License-Identifier: GPL-2.0-or-later

export const sanitizeErrorText = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[local asset]")
    .replace(/\b[A-Za-z]:[\\/][^\r\n]*/g, "[local file]")
    .replace(/(?:\\\\|\/\/)[^\\/\r\n]+[\\/][^\r\n]*/g, "[local file]")
    .replace(/(?:\/Users\/|\/home\/|\/Volumes\/|\/private\/|\/tmp\/|\/mnt\/)[^\r\n]*/g, "[local file]")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 320);
};
