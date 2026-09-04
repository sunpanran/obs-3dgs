# Architecture

`obs-3dgs` deliberately separates native OBS integration from Gaussian rendering.

```text
OBS source properties + Qt dock + hotkeys
                  │
          native state owner
                  │ javascript_event / authenticated HTTP events
          private browser_source
                  │
        Three.js + Spark WebGL2
```

The C++ source owns persistent settings, source UUID, camera presets, live-lock policy, and the private Browser Source lifetime. Runtime ports, tokens, asset URLs, loading state, and metrics are never written to an OBS scene collection.

The web runtime owns GPU resources. A replacement `SplatMesh` is initialized off-scene and swapped only after success. Scene transforms are separated from coordinate conversion. Camera state uses a fixed 36 mm film gauge and a 16–200 mm focal length; FOV is derived rather than persisted.

The process-wide server binds an OS-selected port on `127.0.0.1` only. Asset routes point to one canonical regular file, require a random startup token, and support GET, HEAD, Range, and cancellation. The bundled web directory is read-only and contains no user files.

Rendering is invalidation-driven. Loading, interaction, camera changes, or Spark sorting schedule frames at the selected target rate. A static scene stops scheduling frames after the dirty interval.
