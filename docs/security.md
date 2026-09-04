# Security model

Imported scenes are untrusted input. Before Spark sees a file, the native layer verifies that it is a canonical regular file, rejects direct symlinks, checks the supported extension and format signature, validates important header bounds, warns above 1 GiB, and rejects non-RAD files above 2 GiB.

The server never binds a LAN interface and has no fallback from `127.0.0.1`. Asset URLs are unguessable without the process token, map one exact canonical file, disable caching, and are invalidated when a source changes or closes. The server limits reverse event bodies to 64 KiB and validates protocol version, source UUID, revision type, event type, and JSON shape.

No telemetry exists. Runtime URLs, tokens, ports, and metrics are not persisted. Logs and diagnostics must not expose the complete selected path by default.

This model reduces exposure but does not make malformed parsers impossible. Report security issues privately to the future repository security contact before public disclosure.
