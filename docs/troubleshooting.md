# Troubleshooting

- **The source type is missing:** verify the folder layout and OBS 32.0+ version, then inspect `Help > Log Files > View Current Log` for `[obs-3dgs]`.
- **Browser Source unavailable:** install the Browser Source component matching OBS. The plugin displays an internal error image instead of crashing.
- **Scene appears upside down:** change Coordinate Preset from Auto to OpenGL/Y-up, OpenCV/X-180, or Z-up.
- **A new file fails:** the previous valid GPU scene remains visible. Reopen source properties to see the sanitized validation error.
- **Transparent background is black:** choose Transparent in Display and verify downstream OBS filters do not force opaque alpha.
- **Interaction does nothing:** disable Live Safety Lock, then use Open Interactive View. Left drag orbits, right drag pans, wheel dollies, and `R` resets.
- **Poor performance:** use Performance or Balanced, lower the LOD splat budget, and keep Browser Source hardware acceleration enabled in OBS.

When reporting a bug, include OBS version, OS, GPU, format and file size, selected quality preset, reproduction steps, and an OBS log. Do not attach a private scene. Diagnostic exports must redact directories and include only the filename and size by default.
