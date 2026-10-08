# HMI tooling

Development, test and build helpers for the HMI/SCADA plugin. The documentation is in `docs/hmi/` (SRS, implementation plan, user guide, gateway and hardening guides). The module contract is `src/main/webapp/plugins/hmi/ARCHITECTURE.md`.

| Path | Purpose |
|---|---|
| `dev/` | Local MQTT/WebSocket/HTTP/SSE servers and a plant simulator (`node dev/server.js`). See `dev/README.md`. |
| `e2e/` | Playwright end-to-end, performance and bundle tests. |
| `check-hooks.sh` | Verifies the `// HMI:` core hooks after merging an upstream release. |
| `update-build-lists.py` | Regenerates the HMI file lists in `etc/build/build.xml` from `Hmi.FILES`. |
| `gen-intouch-demo.py` | Regenerates `templates/hmi/intouch_links_demo.xml` (InTouch animation links demo). |

## Running the app locally

The app is static files: serve `src/main/webapp` with any web server and open it in a browser over `http://localhost`. Opening `index.html` as a `file://` page does not work.

### On Windows

Use PowerShell from the repository root. `-c-1` turns off caching, so your edits show on reload.

```powershell
npx http-server src\main\webapp -p 8080 -c-1
# or, with Python:
python -m http.server 8080 --directory src\main\webapp
```

Then open one of these:

| URL | Loads |
|---|---|
| `http://localhost:8080/index.html?dev=1&p=hmi` | The plugin source files directly. Edits to `plugins/hmi/*.js` show after a reload, with no build step. |
| `http://localhost:8080/index.html?p=hmi` | The built bundle `plugins/hmi.min.js`. Run the Ant build first if you changed the source (see Building). |
| `http://localhost:8080/hmi-run.html?dev=1` | The Run Screen viewer, using the source files. |

For live test data, start the simulated plant in a second terminal (see `dev/README.md`):

```powershell
cd etc\hmi\dev
npm install        # first time only
node server.js
```

It serves MQTT over WebSocket at `ws://localhost:9001/mqtt`, publishing `plant/Tank1/Level`, `plant/Pump1/Run` and other tags every 500 ms. It also serves a JSON WebSocket on port 9002 and HTTP and SSE on port 9003. In the editor, open **Screen Settings → Data Sources** and add an MQTT source with URL `ws://localhost:9001/mqtt` and topic filter `plant/#`. Then bind objects to those tags, or use **Live Preview**.

- If Windows Firewall asks about Node or Python, allowing it on private networks is enough for localhost.
- If port 8080 is in use, choose another port in the command and use the same number in the URL.

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
node --test --test-concurrency=1 etc/hmi/e2e/runtime.e2e.js etc/hmi/e2e/ui.e2e.js etc/hmi/e2e/runscreen.e2e.js etc/hmi/e2e/links.e2e.js etc/hmi/e2e/links-ui.e2e.js etc/hmi/e2e/halo.e2e.js etc/hmi/e2e/links-meta2d.e2e.js etc/hmi/e2e/links-meta2d-ui.e2e.js etc/hmi/e2e/links-help.e2e.js etc/hmi/e2e/dialogs-help.e2e.js etc/hmi/e2e/links-unified.e2e.js etc/hmi/e2e/screen-settings.e2e.js etc/hmi/e2e/links-flowcharting.e2e.js
node --test --test-concurrency=1 etc/hmi/e2e/perf.e2e.js
HMI_SOAK_MINUTES=1440 node --test --test-name-pattern=soak etc/hmi/e2e/perf.e2e.js
node --test etc/hmi/e2e/bundle.e2e.js    # after the Ant build
```

### On Windows

The tests are plain Node scripts and run the same way on Windows. Use PowerShell from the repository root:

```powershell
# Once: Node 22 and Playwright with its Chromium
npm install --no-save playwright
npx playwright install chromium

# Unit tests
cd src\main\webapp\plugins\hmi\test
node --test --test-concurrency=1
cd ..\..\..\..\..\..

# One end-to-end file, or one test in it
node --test etc\hmi\e2e\screen-settings.e2e.js
node --test --test-name-pattern="page state machines" etc\hmi\e2e\screen-settings.e2e.js
```

- Playwright finds the Chromium that `npx playwright install` downloaded. To use another Chrome, set `$env:CHROMIUM_PATH = "C:\Program Files\Google\Chrome\Application\chrome.exe"`. If Playwright is installed elsewhere, set `$env:PLAYWRIGHT_MODULE` to its folder.
- Environment variables use `$env:NAME = "value"` instead of `NAME=value`, for example `$env:HMI_SOAK_MINUTES = "1440"`.
- The bundle tests need the Ant build first: `cd etc\build` then `ant app`.
- The help screenshot tests write images only when `HMI_HELP_SHOTS` or `HMI_UNIFIED_SHOTS` is set to a folder.

## Building

```sh
cd etc/build && ant app     # includes the hmi and hmi-viewer targets
cd etc/build && ant hmi     # plugin bundle only (viewer needs base-viewer.min.js from app)
```

The build produces:
- `src/main/webapp/plugins/hmi.min.js` (loaded for `?p=hmi` / `?hmi=...` outside dev mode)
- `src/main/webapp/js/hmi-viewer.min.js` (lightweight runtime used by `hmi-run.html` and the standalone viewer)

Run `python3 etc/hmi/update-build-lists.py` after adding a module to `Hmi.FILES`.

## Upstream merges

1. `git merge upstream/<release>`
2. `sh etc/hmi/check-hooks.sh`
3. `ant app`
4. Run the unit and end-to-end tests.
