# Installation

## Windows x64

1. Close OBS Studio.
2. Extract `obs-3dgs-0.1.0-beta.1-windows-x64.zip`.
3. Copy the complete `obs-3dgs` folder to `C:\ProgramData\obs-studio\plugins\`.
4. Start OBS and add `3DGS Scene` from the Sources `+` menu.

The final DLL path must be `C:\ProgramData\obs-studio\plugins\obs-3dgs\bin\64bit\obs-3dgs.dll`.

## macOS Universal

1. Close OBS Studio.
2. Extract `obs-3dgs-0.1.0-beta.1-macos-universal.zip`.
3. Copy `obs-3dgs.plugin` to `~/Library/Application Support/obs-studio/plugins/`.
4. Start OBS and add `3DGS Scene`.

The first beta has no Developer ID signature or notarization; the macOS bundle uses the ad-hoc signature required on Apple Silicon. If Gatekeeper quarantines the manually copied open-source bundle, use Finder's Open confirmation or remove quarantine only from the exact `obs-3dgs.plugin` bundle after verifying the published SHA-256.

To update, close OBS and replace the plugin folder or bundle. To uninstall, close OBS and remove it. OBS scene collections and camera presets are stored in the scene collection, so replacing plugin files does not erase them.

See [troubleshooting](troubleshooting.md) before reporting an issue.
