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
lipo -verify_arch arm64 x86_64 "${stage_root}/obs-3dgs.plugin/Contents/MacOS/obs-3dgs"
ditto -c -k --keepParent "${stage_root}/obs-3dgs.plugin" "${archive_path}"
shasum -a 256 "${archive_path}" | sed "s#${archive_path}#$(basename "${archive_path}")#" > "${archive_path}.sha256"
print "Created ${archive_path}"
