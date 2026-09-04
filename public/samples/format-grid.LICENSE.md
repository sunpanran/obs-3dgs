# Original format fixtures

`format-grid.ply`, `format-grid-compressed.ply`, `format-grid.spz`, `format-grid.splat`, `format-grid.ksplat`, and `format-grid.rad`
contain an original deterministic 8×8 colored Gaussian grid made for this repository.

Copyright 2026 obs-3dgs contributors. License: GPL-2.0-or-later, as provided in the repository LICENSE.
No third-party captured scene, texture, or personal data is included.

Rebuild with `node scripts/generate-format-fixtures.mjs` after `npm ci`.
SPZ uses the pinned MIT-licensed Spark 2.1.0 writer. The other files are directly encoded from the same geometry.
These fixtures are for parser/rendering smoke tests, not performance benchmarks. They are excluded from plugin ZIPs.

RAD is a minimal independently written container of uncompressed float32 columns. Its field names and byte layout follow the public RAD format (RAD0/RADC descriptors, 8-byte metadata alignment). It includes only this project's original grid geometry; no upstream Rust implementation or converter is copied or distributed.
