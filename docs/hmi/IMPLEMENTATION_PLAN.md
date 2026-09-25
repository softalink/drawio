# Implementation Plan: HMI/SCADA for draw.io

| | |
|---|---|
| Document | PLAN-HMI-001 |
| Version | 0.1 (draft) |
| Date | 2026-09-25 |
| Implements | [SRS.md](SRS.md) (SRS-HMI-001) |
| Codebase | `softalink/drawio` fork of jgraph/drawio 31.5.2 |

---

## 1. Strategy

### 1.1 Guiding decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **Re-implement** meta2d's HMI concepts on mxGraph. Do **not** embed the meta2d canvas engine. | draw.io renders SVG through mxGraph. Embedding a second Canvas engine would split the editing model, break export, and lose the P&ID libraries. meta2d's logic layers (conditions, mock values, payload dispatch, interpolation) are small and portable. Its renderer is not. |
| D2 | Ship **most code as a plugin** (`plugins/hmi/`), plus **delimited core hooks** marked `// HMI:`. | Upstream accepts no PRs (constraint C-1), so the fork must rebase each release. Plugin files never conflict. The hooks are few, small and greppable. |
| D3 | **Runtime overlay, not model mutation.** | Live values must never touch undo, the modified flag, autosave or sync (C-5). The overlay is merged at style and label computation time, and only the affected cell states are re-rendered. |
| D4 | Store HMI configuration as **JSON attributes on user objects** (`hmi` on the root cell; `hmiBindings`, `hmiEvents`, `hmiTriggers` and `hmiAnimations` on cells). | This reuses draw.io's persistence, copy/paste, library and undo handling unchanged. It degrades gracefully in stock draw.io, where the attributes are just unused data. |
| D5 | Base the **runtime mode on the App lightbox/chromeless mode** (`?lightbox=1`), which loads plugins. The standalone `viewer.min.js` bundle comes later (M6). | Plugins do not load in `GraphViewer`. Lightbox gives page navigation, fit and a toolbar without extra work. |
| D6 | **Lazy-load third-party libraries**: MQTT.js (MIT, browser bundle ~90 KB gz), and optionally ECharts (Apache-2.0). They are vendored into `plugins/hmi/lib/`. | Keeps the initial load small (HMI-PERF-6). Both licences are Apache-compatible. |
| D7 | Use a **purpose-built expression interpreter** for transforms and conditions. User scripts run in a **sandboxed Worker**. | HMI-SEC-2/3. It also works under Electron's `allowEval=false` posture. |

### 1.2 What is reused from each codebase

**From draw.io:**
- User-object attributes: `Graph.getAttributeForCell` / `setAttributeForCell`
- Placeholders: `Graph.replacePlaceholders`, `placeholderPattern`
- Transient styling: `setCellStylesTransient`, `redrawTransientStyle`
- Custom actions: `Graph.executeCustomActions`
- `customProperties` in the Format panel
- Edge flow animation: `addFlowAnimationToNode`
- `mxWindow` tool windows
- The embed message handler
- The lightbox view
- `plugins/update.js` and `EditorUi.updateDiagram`, as a compatibility source format
- P&ID stencils

**From meta2d.js (MIT, ported algorithms with attribution):**
- Condition semantics: `judgeCondition`, `valueInRange`, `valueInArray` and `Comparison` operators (`packages/core/src/core.ts`)
- Payload dispatch rules of `socketCallback`: flat object, `dataId` array, or id updates
- Mock generation: `mockValue` range/list/bool/string syntax
- The trigger `status` first-match state machine
- Keyframe interpolation: `setNodeAnimate` / `setNodeAnimateProcess` in `pen/render.ts`
- Line-animation type catalogue: `LineAnimateType`
- Gauge geometry: `le5le-charts/src/gauge.ts`
- Slider and switch interaction: `form-diagram`

---

## 2. Target code layout

```
src/main/webapp/
├── plugins/hmi/
│   ├── hmi.js                 # plugin entry: Draw.loadPlugin → HmiPlugin.install(ui)
│   ├── core/
│   │   ├── HmiModel.js        # read/write/validate JSON attrs; schema versioning; defaults
│   │   ├── HmiExpr.js         # tokenizer + Pratt parser + evaluator (no eval)
│   │   ├── HmiCondition.js    # operators (ported from meta2d judgeCondition)
│   │   ├── HmiTagStore.js     # values, quality, ts, subscriptions, stale timers
│   │   ├── HmiFormat.js       # number/date formatting, units
│   │   ├── HmiTransform.js    # scale, map, invert, expr, script
│   │   └── HmiSimulator.js    # random/sine/ramp/list/toggle (ported mockValue)
│   ├── sources/
│   │   ├── HmiSourceManager.js# lifecycle, backoff, allow-list, status events
│   │   ├── HmiPayload.js      # flat/array/topic/jsonpath/update-xml mapping
│   │   ├── HmiMqttSource.js   # lazy-loads lib/mqtt.min.js
│   │   ├── HmiWsSource.js
│   │   ├── HmiHttpSource.js
│   │   ├── HmiSseSource.js
│   │   └── HmiHostSource.js   # values pushed via postMessage / JS API
│   ├── runtime/
│   │   ├── HmiRuntime.js      # orchestrator: start/stop, page lifecycle, frame loop
│   │   ├── HmiOverlay.js      # per-cell runtime style/label/props; dirty set; flush
│   │   ├── HmiBindingEngine.js# tag→cells index; evaluates bindings into overlay
│   │   ├── HmiTriggerEngine.js# simple + state-machine triggers, hysteresis, delays
│   │   ├── HmiEventDispatcher.js # mouse/keyboard → hmiEvents; bubbling; confirm
│   │   ├── HmiActions.js      # action registry + executors (setProps, writeTag, …)
│   │   ├── HmiAnimator.js     # keyframes, presets, rAF loop, visibility pause
│   │   ├── HmiAlarms.js       # limit evaluation, alarm list, ack
│   │   ├── HmiWriter.js       # write targets, validation, confirm/optimistic, audit
│   │   └── HmiScriptHost.js   # sandboxed Worker for user scripts, timeouts
│   ├── ui/
│   │   ├── HmiFormatPanel.js  # "HMI" tab: bindings/events/triggers/animations editors
│   │   ├── HmiSourcesDialog.js
│   │   ├── HmiTagBrowser.js   # mxWindow, live values, drag-to-bind, overrides
│   │   ├── HmiDiagnostics.js  # mxWindow: sources, raw msgs, write log, errors
│   │   ├── HmiRunChrome.js    # runtime status bar, page nav, alarm banner host
│   │   ├── HmiValidator.js
│   │   └── HmiEditors.js      # shared widgets: tag picker, condition row, action row
│   ├── lib/mqtt.min.js        # vendored MQTT.js (MIT) + LICENSE
│   └── test/                  # unit tests (see §7)
├── shapes/hmi/
│   ├── mxHmiWidgets.js        # gauge, bar, tank, lamp, switch, button, slider, input, …
│   ├── mxHmiCharts.js         # trend, bar, pie (SVG, no deps)
│   └── mxHmiEquipment.js      # pump, fan, motor, valve, agitator, conveyor (state-aware)
├── js/diagramly/sidebar/Sidebar-HMI.js   # palettes
└── images/sidebar-hmi.png                # "More shapes" preview
docs/hmi/                                 # SRS, plan, user guide, JSON schema
```

Everything under `plugins/hmi/` is served raw, so no build step is needed in development. For production, M6 adds an Ant target that concatenates and minifies it into `plugins/hmi.min.js`.

---

## 3. Core hook points (the only edits to upstream files)

Each edit is wrapped in `// HMI: begin … // HMI: end`. The rebase check in §8 greps for these markers.

| # | File / function | Change | Purpose |
|---|---|---|---|
| H1 | `js/diagramly/App.js:326` `App.pluginRegistry` | Add `'hmi': 'plugins/hmi/hmi.js'`. Add `'hmi'` to `App.publicPlugin`. | Load with `?p=hmi` or the Plugins dialog. |
| H2 | `js/diagramly/Init.js` | Add `window.HMI_ENABLED` (default `urlParams['hmi'] != null` or `DRAWIO_CONFIG.hmi != null`). App.main auto-loads the plugin when it is set. | Enables `?hmi=run` and deployments with HMI on by default. |
| H3 | `js/diagramly/Editor.js:9163` `Graph.prototype.postProcessCellStyle` (diagramly override) | After the existing logic, `if (this.hmiOverlay != null) style = this.hmiOverlay.applyStyle(cell, style);` | Runtime style overlay (bindings, triggers, animation). The plugin could wrap the prototype itself, but an explicit hook documents the contract and survives upstream refactors of the wrapper chain. |
| H4 | `js/grapheditor/Graph.js:11027` `Graph.prototype.getLabel` and `:11355` `replacePlaceholders` | In `replacePlaceholders`, before the attribute lookup: `if (name.substring(0,4) == 'tag:' && this.hmiOverlay != null) tmp = this.hmiOverlay.formatTag(cell, name.substring(4));`. In `getLabel`, if `hmiOverlay.hasLabel(cell)`, return the overlay label. | `%tag:X%` placeholders (HMI-BND-5) and label bindings. |
| H5 | `js/grapheditor/Graph.js:16740` `mxShape.prototype.isFlowAnimationEnabled` / `addFlowAnimationToNode` (14279) | Route `flowAnimationType` (dash, dots, arrows, liquid), `flowAnimationReverse` and a speed override through a pluggable `Graph.flowAnimationRenderers[type]` map. The default is the existing dash behaviour. | HMI-ANI-3 flow variants, runtime-controllable. |
| H6 | `js/grapheditor/Shapes.js` / `mxShape.prototype.paint` wrapper (next to the flow animation wrapper at `Graph.js:~16760`) | After paint, `if (mxShape.levelFillPainter != null && this.style.hmiLevel != null) mxShape.levelFillPainter(this);` | Level fill on any shape (HMI-ANI-4). |
| H7 | `js/diagramly/Editor.js:10682` `Graph.prototype.executeCustomActions` | At the top of the per-action loop: `if (Graph.customActionHandlers != null && …)` delegate unknown action keys to a registry, and handle `{hmi:{…}}`. | HMI-EVT-8, and lets HMI actions run inside existing custom links and animations. |
| H8 | `js/diagramly/EditorUi.js:25904` `installMessageHandler` | Before the "unknown action" branch, call `if (this.hmi != null && this.hmi.handleMessage(data)) return;` | Embed API (HMI-EMB-1). |
| H9 | `js/diagramly/Devel.js:16` CSP `connect-src`, and the Electron CSP in `js/bootstrap.js:~219` | Append `DRAWIO_CONFIG.hmi.connectSrc` / `urlParams['hmi-connect-src']`, which default to empty. | Lets dev and desktop builds reach the configured brokers (HMI-SEC-1, HMI-PRT-1). |
| H10 | `js/diagramly/sidebar/Sidebar.js:133` `configuration` and `updateEntries` (490); `js/diagramly/Editor.js:~12132` `mxStencilRegistry.libraries` | Register the `hmi` palette and lazy-load entries `libraries['hmi'] = [SHAPES_PATH + '/hmi/mxHmiWidgets.js', …]`. | Widget library in "More Shapes" (HMI-WGT). |
| H11 | `etc/build/build.xml` | Add `Sidebar-HMI.js` to `sidebar.min.js`, add `shapes/hmi/*.js` to the merge, and add a new `hmi` target for `plugins/hmi.min.js` and `hmi-viewer.min.js`. | Production build. |
| H12 | `src/main/java/.../EmbedServlet2.java` shape library map | Add the `hmi` library paths. | Embed/viewer stencil loading. |
| H13 | `resources/dia.txt` | Add new `hmi*` keys. | i18n (HMI-USA-1). |

Hooks H3, H4 and H6 are one-line calls to a nullable global or a `graph` field. When the plugin is absent they are no-ops, which meets HMI-DOC-3.

---

## 4. Key technical designs

### 4.1 Runtime overlay and render path (D3; meets HMI-PERF-1..3)

```
source msg ─► HmiPayload.map ─► TagStore.set(tag, v, q, ts)      (sync, cheap)
                                   │ marks tag dirty
rAF tick (≤ maxRate Hz) ──────────►│
  HmiRuntime.flush():
    dirtyTags ─► BindingEngine: for each cell bound to tag → evaluate bindings
                 → overlay.set(cellId, {style:{…}, label, props})  → dirtyCells
             ─► TriggerEngine: evaluate triggers referencing tag → actions
                 (setProps → overlay; animations → Animator)
    Animator.step(now) → overlay updates for animating cells → dirtyCells
    for cellId in dirtyCells:
       state = view.getState(cell)            (skip if null / not in viewport*)
       state.style = graph.getCellStyle(cell) (postProcessCellStyle merges overlay, H3)
       graph.redrawTransientStyle(state)      (existing: resetStyles/configure/redraw)
       if label changed: state.text.value = …; state.text.redraw()
```

- `graph.getCellStyle` recomputes a single cell's style. `redrawTransientStyle` (`diagramly/Editor.js:10582`) redraws only that cell's SVG. There is no model change and no `view.validate()` over the whole graph.
- \* Viewport skipping: cells outside `graph.view.getGraphBounds() ∩ container` are left dirty and flushed when they scroll into view. A `mxEvent.SCALE_AND_TRANSLATE` listener handles this.
- Geometry bindings (`geo:*`) use `state` bounds offsets through a `view.updateCellState` wrapper that adds the overlay offset. This is guarded to cells with an overlay.
- **Restore:** `HmiOverlay.clear()` marks all overlay cells dirty with an empty overlay. The flush then yields design styles. A final `graph.refresh()` runs only on runtime stop, never in the loop.
- **Editing during live preview:** a `graph.getSelectionModel()` CHANGE listener suspends the overlay for selected cells, and the `cellEditor` start/stop events suspend it for the cell being edited. Any model CHANGE clears the style cache for the changed cells, and the overlay re-applies on the next flush.

### 4.2 Binding index

- On runtime start and on page change, `HmiModel.scan(graph)` walks the model once. It parses every `hmi*` attribute into compiled objects: expression ASTs and resolved `%attr%` in tag names (HMI-BND-11). It also builds:
  - `tagToCells: Map<tag, Set<cellId>>`
  - `tagToTriggers`
  - `cellEvents`
  - `messageHandlers`
- A model CHANGE listener, active only in live preview, re-scans the changed cells incrementally.

### 4.3 Sources

- `HmiSourceManager` owns source instances with the interface `{connect(), disconnect(), write(target, value), status, onMessage}`.
- **Backoff:** `min(30s, 1s·2^n) ± 20%`. Each connect first checks the allow-list (`DRAWIO_CONFIG.hmi.allowedEndpoints`).
- **MQTT:** `mxscript('plugins/hmi/lib/mqtt.min.js')` on first use. Subscriptions come from `topics[]`, and publishing comes from the writer.
- **HTTP:** a `setTimeout` chain, not `setInterval`, which prevents overlapping requests. It uses `fetch` with an `AbortController` timeout. `format: 'drawio-update-xml'` delegates to a non-mutating port of `EditorUi.updateDiagram` that writes into the overlay instead of the model (HMI-IMP-2).
- **Parser scripts** are posted to `HmiScriptHost` (§4.6) asynchronously. A message's updates are applied when the Worker replies. Messages are queued per source to keep ordering.

### 4.4 Events and actions

- `HmiEventDispatcher` installs a `graph.addMouseListener` plus `graph.click` override, **only while running**.
  - It maps `mouseDown`/`mouseUp`/`click`/`dblClick` and hover (`enter`/`leave` via `mxCellHighlight`-free hit-testing) to the handlers of the target cell, bubbling to ancestors.
  - It prevents draw.io default link handling when a handler consumed the event.
  - Keyboard: widgets get `tabindex` on their SVG `<g>`, and keydown maps to click, or to value change for sliders.
- `HmiActions` is a registry `{type → fn(ctx, action) → Promise}`. `drawioAction` calls `graph.executeCustomActions([action.action], done, cell)`. Visual changes in `setProps` go to the overlay. `navigate` uses `ui.selectPage(ui.getPageById(id))` in runtime, followed by an overlay re-scan.

### 4.5 Animation

- `HmiAnimator` keeps one rAF loop shared with the flush (§4.1). Animations write overlay props: rotation, opacity, colours, `dx`/`dy`, scale and `hmiLevel`. Colour interpolation is ported from meta2d `setNodeAnimateProcess`.
- **Spin/rotate at RPM** uses an overlay `rotation`. For performance, continuous spin on shapes may instead apply a CSS `transform` on the shape's SVG node (`state.shape.node`), with `transform-origin` at the cell centre. This avoids re-render per frame. The same technique is used for blink (CSS opacity animation).
- **Flow variants** (H5) are CSS-keyframe based, like the existing `addFlowAnimationToNode`, so they cost no JS per frame. A binding changes the duration or direction by updating the overlay style, which rebuilds the keyframe on redraw.
- `document.visibilitychange` pauses the rAF loop and CSS animations (`animation-play-state`).

### 4.6 Scripts and expressions

- **HmiExpr:** a Pratt parser for literals, identifiers (`value`, `tag("x")`, `prop("x")`), `+ - * / %`, comparison, `&& || !`, `?:`, and whitelisted function calls. The AST is cached per binding. Evaluation is pure and synchronous.
- **HmiScriptHost:** a single dedicated Worker created from a Blob.
  - Worker code builds functions with `new Function` inside the Worker only. The Worker has no DOM, a separate global, and CSP permitting `worker-src blob:`.
  - The API surface is posted messages only: `setProps`, `writeTag`, `emit`, `getTag`, `log`.
  - Each call has a watchdog timeout. On overrun the Worker is terminated and recreated.
  - The policy (`off` / `prompt` / `on`) is checked before any script is sent.
  - Under Electron, `allowEval=false` applies to the main window. The Worker context is evaluated separately and must be verified in M5.

### 4.7 Widgets

- These are `mxShape` subclasses painting via `mxAbstractCanvas2D`, so they work in SVG, export and print.
- Runtime values come from the resolved `state.style`: overlay `prop:value` is stored under the style key `hmiValue`. The shapes therefore need no knowledge of the runtime.
- `customProperties` declares design options, following the `mxShapeMockupGauge` pattern in `shapes/mockup/mxMockupGraphics.js:652`.
- The trend chart keeps its ring buffer in the overlay (`HmiOverlay.series[cellId]`) and draws a polyline. It is capped at `maxPoints` (default 600).
- Interactive widgets register a default event handler, for example a switch runs `toggleTag` on its first `prop:value` binding's tag. The designer can override it with `hmiEvents`.
- **Equipment symbols:** P&ID stencil styles plus `hmiState` → a colour map, and `hmiSpin` for rotors. The stencil is duplicated only where a moving sub-part (an impeller) must be separated.

### 4.8 Persistence and schema

- `HmiModel` validates every `hmi*` attribute against a JSON schema (`docs/hmi/schema/*.json`, draft 2020-12). Validation is hand-rolled in the plugin; there are no dependencies.
- **Unknown future fields are preserved** on write-back.
- Writes to these attributes go through `graph.setAttributeForCell` inside `model.beginUpdate` / `endUpdate`, so they are undoable design edits.
- The root-cell `hmi` attribute is written via `graph.model.setValue(root, …)`, which follows the same pattern used for `animation` on the root.
- `EditDataDialog` hides the `hmi*` keys, which are shown in the HMI tab instead. This is done through the `EditDataDialog.prototype` hook the plugin wraps.

---

## 5. Milestones and work breakdown

The estimates assume two engineers, one of whom is familiar with the draw.io/mxGraph internals. The column "SRS" lists the requirements each milestone closes.

### M0: Foundations (1.5 weeks)

| Task | Output |
|---|---|
| M0.1 Fork hygiene: branding decision (C-3), `NOTICE` with meta2d MIT attribution, `// HMI:` marker convention, rebase script `etc/hmi/check-hooks.sh`. | Repo setup |
| M0.2 Dev loop: static server + `?dev=1&p=hmi`. Extend the CSP (H9). Add a Docker compose with Mosquitto (ws 9001), a Node WS/HTTP/SSE test server and a data generator. | `etc/hmi/dev/docker-compose.yml` |
| M0.3 Plugin skeleton (H1, H2): menu `Extras → HMI` with placeholder actions, and loading `plugins/hmi/*` in order. | `plugins/hmi/hmi.js` |
| M0.4 Test harness: Node + `node:test` for pure modules (`core/`, `sources/HmiPayload.js`); Playwright for E2E against the static server (Chromium at `/opt/pw-browsers`). | `plugins/hmi/test`, `etc/hmi/e2e` |

### M1: Data core (2 weeks). SRS: HMI-DOC-1..4, HMI-TAG-1..3, HMI-SRC-1..4, 6..8, 11..12, HMI-SIM-1..3, HMI-SEC-1

| Task | Notes |
|---|---|
| M1.1 `HmiModel` (root `hmi`, schema, versioning) | Unit tests on round-trip and unknown-field preservation |
| M1.2 `HmiTagStore`, `HmiFormat`, type coercion, quality | |
| M1.3 `HmiExpr` + `HmiCondition` (port meta2d operators) | Table tests covering every `Comparison` operator case from meta2d |
| M1.4 `HmiPayload`: flat / array / topic-template / JSONPath-lite | Fixtures from meta2d `socketCallback` shapes |
| M1.5 Sources: WS, HTTP, MQTT (lazy lib), SourceManager with backoff and allow-list | Integration tests against the docker-compose stack |
| M1.6 `HmiSimulator` (port `mockValue`) + simulation modes | |
| M1.7 UI: `HmiSourcesDialog`, Tag catalogue editor (table), `HmiTagBrowser` window | Follow `docs/dialog-style-guide.md` |
| **Exit criteria** | Values from all three protocols and the simulator appear in the Tag Browser. The config round-trips through save and load. |

### M2: Bindings and runtime overlay (2.5 weeks). SRS: HMI-BND-1..8, HMI-RUN-1, 2, 6, 7, HMI-ANI-4, HMI-PERF-1..3

| Task | Notes |
|---|---|
| M2.1 Hooks H3, H4 + `HmiOverlay` + flush loop (§4.1) | The critical-path item. Prototype it first and benchmark it with 2,000 cells before building on it. |
| M2.2 `HmiBindingEngine` + transforms (scale, map, invert, expr) + formatting | |
| M2.3 Quality indication (dashed outline + badge via overlay) | |
| M2.4 Level fill (H6): SVG clipPath cloned from the shape's path nodes, and a rect filled to the level | Must work for stencils, `mxCylinder` and P&ID vessels |
| M2.5 Live preview toggle in the editor; suspend the overlay for selected or edited cells | |
| M2.6 Runtime mode v1: `?hmi=run` → lightbox + `HmiRunChrome` (status, fullscreen, page tabs) + Run action (opens a new window with the current file via `ui.editor.getGraphXml` → `#R` / local draft) | |
| M2.7 HMI Format tab, bindings section (H: wraps `Format.prototype.immediateRefresh` to add an "HMI" tab when the plugin is loaded) + tag autocomplete + drag-tag-to-cell | |
| M2.8 Isolation E2E test (SRS §7 "Isolation") + performance benchmark screens | |
| **Exit criteria** | A tank level and a value label follow an MQTT tag in runtime. Stopping leaves the file unmodified with an empty undo stack. PERF-1 is met on the 500-cell benchmark. |

### M3: Events, actions, triggers, writes (2.5 weeks). SRS: HMI-EVT-1..7, HMI-TRG-1..5, HMI-WRT-1, 2, 4, HMI-SRC-13, HMI-DOC-6, HMI-SEC-4

| Task | Notes |
|---|---|
| M3.1 `HmiEventDispatcher` (mouse, hover, bubbling, keyboard) | |
| M3.2 `HmiActions`: setProps, writeTag, toggleTag, navigate, openUrl, dialog (page-as-faceplate in `mxWindow`; iframe URL), start/stop animation, emit, drawioAction | Faceplate = render another page read-only in a popup graph with its own overlay context |
| M3.3 `HmiWriter` + write targets (MQTT topic template, WS, HTTP) + confirm dialog + audit log | |
| M3.4 `HmiTriggerEngine`: simple + state machine (entry-only actions), document-level triggers, initial evaluation | Port meta2d `status` first-match semantics |
| M3.5 Screen variables + `${var}` resolution (URL, localStorage, config) | Port `getDynamicParam` order |
| M3.6 Hook H7 (custom action registry) | |
| M3.7 Format tab: events, triggers editors (condition rows, action rows) | Reuse `HmiEditors` |
| **Exit criteria** | A switch with confirmation publishes over MQTT. A state-machine trigger colours a pump by state. `navigate` works across pages. |

### M4: Animation and widget library (3 weeks). SRS: HMI-ANI-1..3, 5..6, HMI-WGT-1..9, 11, 15, 16, 21, 22

| Task | Notes |
|---|---|
| M4.1 `HmiAnimator`: keyframes, presets (blink, pulse, spin, shake, colorCycle, fadeInOut), cycles, keepState, visibility pause | CSS fast path for spin and blink |
| M4.2 H5 flow renderers: dots/beads, arrows, liquid; runtime reverse/speed | Extend the SVG export twin at `Graph.js:~22605` for the static export look |
| M4.3 Widgets batch 1: numeric display, radial gauge (port le5le `gauge` geometry), linear bar, tank (4 shapes), lamp/LED | |
| M4.4 Widgets batch 2: switch, push button (momentary/latched), slider, numeric input (runtime-only HTML overlay `<input>` positioned on the cell, like `cellEditor`) | |
| M4.5 Trend chart (SVG polyline, ring buffer, time axis) | |
| M4.6 Equipment symbols from P&ID stencils + pipe edge preset | |
| M4.7 `Sidebar-HMI.js` palettes (Displays, Controls, Charts, Equipment, Pipes & Flow) + H10 + search tags + preview image | |
| M4.8 Keyboard/ARIA for interactive widgets; dark mode check | |
| **Exit criteria** | The demo "Water treatment" screen (a template, see M6) is built only from the palette, and it animates from the simulator. |

### M5: Security, embedding, diagnostics, alarms (2 weeks). SRS: HMI-SEC-2, 3, 5..7, HMI-EMB-1..3, HMI-DIA-1..2, HMI-ALM-1..3, HMI-SRC-5, 9, 10, HMI-WRT-3, HMI-TRG-6

| Task | Notes |
|---|---|
| M5.1 `HmiScriptHost` Worker sandbox + policy + prompt-per-file | Security review gate |
| M5.2 Parser, pre-connect and action scripts wired to the script host | |
| M5.3 SSE source; `host` source; embed messages (H8) + `ui.hmi` JS API | |
| M5.4 Roles (config, embed, URL) → hide/disable cells, refuse writes | |
| M5.5 Credential handling (prompt / `${param}` / saved-with-warning), redaction in logs | |
| M5.6 Diagnostics window; Validator | |
| M5.7 Alarms: limits in the catalogue, alarm list state, banner + list widgets, `hmiAlarmIndicator` preset | |
| M5.8 Confirmed/optimistic writes with pending indicator; trigger hysteresis/delays | |
| **Exit criteria** | The security test suite passes (SRS §7). The embed demo page drives values by postMessage. |

### M6: Packaging, docs, hardening (2 weeks). SRS: HMI-PERF-4..6, HMI-REL-1..3, HMI-MNT-1..4, HMI-PRT-1..2, HMI-RUN-5, 8, HMI-USA-*

| Task | Notes |
|---|---|
| M6.1 Ant targets (H11): `plugins/hmi.min.js`, sidebar/shapes merge, H12 servlet map | Verify the non-dev build and the Docker image |
| M6.2 Electron build of the fork with the CSP extension (H9) | |
| M6.3 24-hour soak test, heap profiling, 2,000-cell benchmark | |
| M6.4 Runtime fit modes + kiosk URL options | |
| M6.5 Templates: "Water treatment", "Tank farm", "Motor control center", "Building HVAC" in `templates/hmi/` + `templates/index.xml` | |
| M6.6 User guide, gateway guide (Node-RED/Mosquitto recipes), JSON schemas, hardening guide, safety disclaimer dialog | |
| M6.7 Stock-draw.io compatibility test (HMI file opens in unmodified 31.5.2) | |
| M6.8 i18n key review (H13) | |

### M7 (optional, v1.x): SRS C/S items deferred from v1.0

- `hmi-viewer.min.js` standalone viewer (HMI-RUN-9): add the HMI runtime to the `base-viewer` concat and a `GraphViewer` hook that starts the runtime when `data-mxgraph` contains `hmi`.
- meta2d JSON importer (HMI-IMP-1):
  - `pen.name` → shape map (rectangle, circle, line types, `svgPath` → `shape=image` with an SVG data URI)
  - `networks` → sources
  - `realTimes` → bindings (`key` → target map: `text`→label, `background`→`style:fillColor`, `color`→`style:strokeColor`, `progress`→`style:hmiLevel`, `visible`→visible, `rotate`→`style:rotation`)
  - `events` / `triggers` → hmiEvents / hmiTriggers (EventAction enum map)
  - `frames` → keyframes
- ECharts widget, iframe/video widgets, data table, dropdown, bar/pie, clock, audible alarms, derived tags, CSV tag import, self-contained HTML export.

**Total for v1.0 (M0–M6):** ~15.5 weeks of calendar time for two engineers, plus ~20% contingency, giving **about 19 weeks**.

---

## 6. Critical path and dependencies

```
M0 ──► M1 ──► M2 (overlay H3/H4 is the pivot) ──► M3 ──► M5
                     └──────────────► M4 ──────────┘      └──► M6
```

- M2.1 (overlay + flush) must be proven first. Everything visual depends on it.
- M4 widgets can start in parallel with M3 once the overlay's `hmiValue` style contract is frozen, at the end of M2 week 1.
- M5.1 (script sandbox) blocks enabling any script feature. Until then, script fields are hidden in the UI.

---

## 7. Test strategy

| Level | Scope | Tooling |
|---|---|---|
| Unit | HmiExpr, HmiCondition (full meta2d operator matrix), HmiTransform, HmiFormat, HmiPayload, HmiSimulator, HmiTagStore, HmiModel schema/round-trip, trigger state machine | `node --test` (these modules are DOM-free by design) |
| Component | Overlay flush with a headless mxGraph (jsdom + `mxClient`), widget `paintVertexShape` snapshot (SVG string) | Node + jsdom |
| Integration | Sources against Mosquitto / WS / HTTP / SSE containers; reconnect after a broker restart; publish on write | docker-compose + Node |
| E2E | Designer flows (bind via Tag Browser, run, stop), operator flows (switch confirm → publish, navigate, alarm ack), isolation check (XML byte-identical, undo empty, `isModified()==false`), security cases | Playwright on the static server (`?dev=1&p=hmi`) and on the built bundle |
| Visual regression | Widgets, flow variants and level fill in light and dark mode | Playwright screenshots |
| Performance | 500- and 2,000-cell screens, synthetic 200 and 1,000 updates/s, p95 latency via `performance.mark` in flush; 24 h soak with heap sampling | Playwright + CDP metrics |
| Compatibility | HMI files in stock 31.5.2; regressions in existing flowAnimation, custom links, `plugins/update.js` | Playwright |

---

## 8. Upstream rebase procedure

1. `git fetch upstream && git merge upstream/<release>` into `hmi/main`. Merge, not rebase, to preserve history.
2. `etc/hmi/check-hooks.sh`:
   - Checks that every `// HMI: begin` block is still present.
   - Checks that the functions it patches still exist, via a grep for the signatures in §3.
   - Fails CI if not.
3. Rebuild with Ant, then run the full E2E suite.
4. The built bundles are committed (upstream convention), so regenerate them. Never hand-merge minified files.

---

## 9. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Per-cell redraw cost too high at 2,000 cells / 30 Hz (SVG DOM churn) | Medium | High | Coalescing; viewport culling; CSS fast paths for spin, blink and flow; configurable max rate; benchmark gate in M2. Fallback: batch into a single `view.validate` with only the dirty cells invalidated. |
| Upstream refactors a hooked function | High (frequent releases) | Medium | Only 13 small hooks; hook check script; plugin-side wrappers preferred where upstream APIs are stable. |
| CSP blocks broker connections in some deployments | High | Medium | Documented `connect-src` config (H9), allow-list error messages, deployment guide. |
| Script sandbox escape or abuse | Low | High | Worker isolation, no DOM, message-only API, default `off` for untrusted files, security review. |
| Runtime values leak into saved files or collaboration sync | Medium | High | Overlay design (no model writes); automated isolation E2E test on every build. |
| Browser can't reach industrial protocols directly | Certain | Medium | Documented gateway pattern (Node-RED, broker bridges); `host` source for integrators. |
| Operators rely on it for safety functions | Low | High | Disclaimer (SRS §6.4), confirm-by-default writes, role checks, audit log; enforcement stays at the broker. |
| Licence contamination from ported meta2d code or libraries | Low | Medium | Only MIT/Apache sources; attribution in `NOTICE`; licence check in CI (`etc/dependencies`). |
| Icon-set usage restriction (README: no use in Atlassian products) | Low | Low | The fork is not distributed via the Atlassian marketplace; noted in the fork README. |

---

## 10. Definition of done (v1.0)

- All **M** requirements of SRS-HMI-001 are implemented and covered by tests listed in §7.
- The E2E isolation, security and performance suites are green on the built bundle and in Electron.
- The upstream-hook check is green against the latest upstream release.
- The user guide, gateway guide, hardening guide and JSON schemas are published in `docs/hmi/`.
- Four templates are available in the template dialog.
- The demo screen runs for 24 h against the simulator with heap growth < 10 MB/h.
