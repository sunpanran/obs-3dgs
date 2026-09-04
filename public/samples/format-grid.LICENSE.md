# Original format fixtures

`format-grid.ply`, `format-grid-compressed.ply`, `format-grid.spz`, `format-grid.splat`, and `format-grid.ksplat`
contain an original deterministic 8×8 colored Gaussian grid made for this repository.

Copyright 2026 obs-3dgs contributors. License: GPL-2.0-or-later, as provided in the repository LICENSE.
No third-party captured scene, texture, or personal data is included.

Rebuild with `node scripts/generate-format-fixtures.mjs` after `npm ci`.
SPZ uses the pinned MIT-licensed Spark 2.1.0 writer. The other files are directly encoded from the same geometry.
These fixtures are for parser/rendering smoke tests, not performance benchmarks. They are excluded from plugin ZIPs.
