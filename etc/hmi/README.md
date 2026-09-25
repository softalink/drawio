# HMI tooling

Development, test and build helpers for the HMI/SCADA plugin. The documentation is in `docs/hmi/` (SRS, implementation plan, user guide, gateway and hardening guides). The module contract is `src/main/webapp/plugins/hmi/ARCHITECTURE.md`.

| Path | Purpose |
|---|---|
| `dev/` | Local MQTT/WebSocket/HTTP/SSE servers and a plant simulator (`node dev/server.js`). See `dev/README.md`. |
| `e2e/` | Playwright end-to-end, performance and bundle tests. |
| `check-hooks.sh` | Verifies the `// HMI:` core hooks after merging an upstream release. |
| `update-build-lists.py` | Regenerates the HMI file lists in `etc/build/build.xml` from `Hmi.FILES`. |

## Running the tests

Install the dev dependencies once:

```sh
cd etc/hmi/dev && npm install
```

Unit and integration tests (Node 22). Run them from the test directory, because `node --test <dir>` does not accept a directory argument on some Node 22 builds:

```sh
cd src/main/webapp/plugins/hmi/test && node --test --test-concurrency=1
```

End-to-end tests need Playwright with Chromium. Set `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH` if they are not auto-detected.

```sh
node --test --test-concurrency=1 etc/hmi/e2e/runtime.e2e.js etc/hmi/e2e/ui.e2e.js
node --test --test-concurrency=1 etc/hmi/e2e/perf.e2e.js
HMI_SOAK_MINUTES=1440 node --test --test-name-pattern=soak etc/hmi/e2e/perf.e2e.js
node --test etc/hmi/e2e/bundle.e2e.js    # after the Ant build
```

## Building

```sh
cd etc/build && ant app     # includes the hmi and hmi-viewer targets
cd etc/build && ant hmi     # plugin bundle only (viewer needs base-viewer.min.js from app)
```

The build produces:
- `src/main/webapp/plugins/hmi.min.js` (loaded for `?p=hmi` / `?hmi=...` outside dev mode)
- `src/main/webapp/js/hmi-viewer.min.js` (standalone viewer)

Run `python3 etc/hmi/update-build-lists.py` after adding a module to `Hmi.FILES`.

## Upstream merges

1. `git merge upstream/<release>`
2. `sh etc/hmi/check-hooks.sh`
3. `ant app`
4. Run the unit and end-to-end tests.
