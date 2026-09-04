# Grouped sources and Dock layout regression — 2026-09-04

[简体中文](2026-09-04-dock-groups-layout.zh-CN.md)

The user confirmed the Windows fix1 preset-hotkey and Missing Files checks passed, then reported automatic selection failing for grouped sources and requested a less crowded Dock.

Selection now visits nested groups, prioritizes explicitly selected 3DGS sources and resolves a selected group only when it contains one unique 3DGS source. Ambiguous groups require an explicit source selection. Multiple references to the same source remain unambiguous.

The Dock retains the OBS theme and uses Camera, Scene and Presets tabs. Source selection occupies a full row; quality and the live lock are spaced separately. Numeric inputs sit above full-width sliders, focal-length shortcuts use a three-column grid, and presets have their own tab.

Validation: strict Windows compilation and four CTest groups passed. Twelve checks exercise selection against real libobs source/group structures. Qt checks cover numeric/slider separation and usable slider width in a 300-pixel control, alongside the existing editing, isolation, preset and visibility regressions. A dedicated OBS instance loaded the fixture inside nested groups and reported scene-ready state. The user subsequently confirmed grouped-source handling and the updated layout passed manual validation.

See the [acceptance checklist](../manual-acceptance.md) for remaining frontend checks. The regression fixture is the repository's original GPL-2.0-or-later small PLY, copied into a dedicated test directory.
