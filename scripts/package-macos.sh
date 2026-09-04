#!/bin/zsh
# SPDX-License-Identifier: GPL-2.0-or-later
set -euo pipefail

project_root="${0:A:h:h}"
release_root="${project_root}/release"
stage_root="${release_root}/macos-universal-stage"
archive_path="${release_root}/obs-3dgs-0.1.0-beta.1-macos-universal.zip"

case "${stage_root}" in
  "${project_root}"/release/*) ;;
  *) print -u2 "Refusing to clean outside the project release directory"; exit 1 ;;
esac

rm -rf "${stage_root}"
rm -f "${archive_path}" "${archive_path}.sha256"
mkdir -p "${release_root}"
cmake --install "${project_root}/build_macos" --config RelWithDebInfo --prefix "${stage_root}"
cp "${project_root}/dist/sbom.cdx.json" "${stage_root}/obs-3dgs.plugin/Contents/Resources/licenses/sbom.cdx.json"
# Ad-hoc signing is required on Apple Silicon; it is not Developer ID signing.
# Include the SBOM before signing so the staged resource seal remains valid.
codesign --force --deep --sign - "${stage_root}/obs-3dgs.plugin"
codesign --verify --deep --strict "${stage_root}/obs-3dgs.plugin"
binary_path="${stage_root}/obs-3dgs.plugin/Contents/MacOS/obs-3dgs"
lipo "${binary_path}" -verify_arch arm64 x86_64
linked_libraries="$(otool -L "${binary_path}")"
if print -r -- "${linked_libraries}" | tail -n +2 | grep -E '/opt/homebrew/|/usr/local/Cellar/|/Users/runner/'; then
  print -u2 "The plugin must not depend on the build machine's private libraries"
  exit 1
fi
ditto -c -k --keepParent "${stage_root}/obs-3dgs.plugin" "${archive_path}"
archive_entries="$(unzip -Z1 "${archive_path}")"
for required in \
  obs-3dgs.plugin/Contents/MacOS/obs-3dgs \
  obs-3dgs.plugin/Contents/Info.plist \
  obs-3dgs.plugin/Contents/Resources/locale/en-US.ini \
  obs-3dgs.plugin/Contents/Resources/locale/zh-CN.ini \
  obs-3dgs.plugin/Contents/Resources/web/index.html \
  obs-3dgs.plugin/Contents/Resources/licenses/sbom.cdx.json; do
  if ! print -r -- "${archive_entries}" | grep -Fx -- "${required}" > /dev/null; then
    print -u2 "Release archive is missing ${required}"
    exit 1
  fi
done
if print -r -- "${archive_entries}" | grep -E '(^|/)(samples|node_modules|include)/|\.map$'; then
  print -u2 "Release archive contains development files or sample scenes"
  exit 1
fi
shasum -a 256 "${archive_path}" | sed "s#${archive_path}#$(basename "${archive_path}")#" > "${archive_path}.sha256"
print "Created ${archive_path}"
