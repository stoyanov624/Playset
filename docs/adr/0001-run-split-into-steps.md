# The run is split into stateless steps

`runPlayset` asks its questions mid-run through `RunFrontEnd` callbacks, which do not map to stateless HTTP. We split the core run into step functions (find Artists → list Setlists → prepare a Setlist → preview Matches → create or update the Setlist Playlist); the web server keeps no in-flight run and the browser carries the user's choices between steps. `runPlayset` is rebuilt on the same steps so the CLI behaves exactly as before.

## Considered Options

- **Server-side run session** bridging `RunFrontEnd` over WebSocket/long-poll: keeps `runPlayset` untouched, but needs per-user in-memory state, loses runs on restart and is hard to test. Rejected.
