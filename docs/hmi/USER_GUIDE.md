# draw.io HMI / SCADA — User Guide

This guide covers the HMI/SCADA extension of this draw.io fork: building operator screens ("screen design") and running them ("operation"). It documents only what is implemented in this codebase (branch `claude/confident-gates-rqzs24`); for the requirements it implements, see [SRS.md](SRS.md), and for the internal schemas and module contracts, see [ARCHITECTURE.md](../../src/main/webapp/plugins/hmi/ARCHITECTURE.md).

Audience:
- **Screen designers** (engineers/integrators) — read sections 1–11, 15–17.
- **Operators** — read sections 1, 13, and the parts of 6/12 about the Tag Browser and alarms.

---

## 1. Overview & safety notice

draw.io HMI adds, on top of the standard draw.io editor:

- **Data sources** — MQTT (over WebSocket), WebSocket, HTTP polling and Server-Sent Events connections, configured per document.
- **Tags** — a document-level catalogue of named data points, fed from sources or from a built-in simulator.
- **Bindings** — rules that map a tag (or an expression) to a shape's label, style, geometry, visibility or widget property.
- **Events & actions** — click/hover/value-change handlers that run actions such as writing a tag, navigating, opening a dialog or animating.
- **Triggers & state machines** — condition-driven rules, the basis for alarm visualisation and other state-dependent appearance.
- **Animations** — blink/pulse/spin/shake/colour-cycle/fade presets, keyframe sequences, and edge flow animation.
- **A widget library** — gauges, tanks, indicators, switches, sliders, buttons, charts, tables, equipment symbols and pipes (`mxgraph.hmi.*` shapes).
- **A runtime mode** — a locked, chromeless operator view separate from the editor, where data flows and events fire.
- **A simulator** — mock tag values, for designing and testing without live equipment.

> **Safety notice.** draw.io HMI is a supervisory **visualisation** tool. It is **not** intended for safety-critical or real-time control. Write actions must be protected by authorisation and interlocks in the control system and gateway, never only in the screen. The editor shows this notice (a confirm dialog, remembered per browser) before the first Live Preview or Run in a session; you can suppress it deployment-wide with `DRAWIO_CONFIG.hmi.hideSafetyNotice = true`.

Runtime state (tag values, animation state, live styling) is applied through an **overlay** and is never written into the diagram file — see §4.

---

## 2. Enabling the plugin

The HMI plugin is off by default and must be explicitly enabled. It loads automatically when any of the following are true:

| Mechanism | How |
|---|---|
| URL parameter | `?p=hmi` (load it like any other plugin), or any `?hmi=...` parameter (e.g. `?hmi=run`) |
| Deployment config | `window.DRAWIO_CONFIG.hmi` is set to any object (even `{}`) in your `js/PreConfig.js` or Docker config |
| Plugins dialog | *Extras → Edit Diagram* is unrelated; instead use *Extras → Plugins…* and add `hmi` (mapped through `App.pluginRegistry`) the same way as any other bundled plugin, when `?p=` handling is exposed by your deployment |

In development (`?dev=1`) the plugin loads its module files individually from `plugins/hmi/*`; in production it loads the single concatenated bundle `plugins/hmi.min.js`.

Once enabled, a new **Extras → HMI / SCADA** submenu appears (see §3), and selecting a cell adds an **HMI** tab to the Format panel (§7–10).

### Self-hosting note

**app.diagrams.net (the public draw.io instance) does not support live HMI data.** Its Content-Security-Policy `connect-src` does not allow arbitrary WebSocket/HTTP endpoints, so MQTT/WS/HTTP/SSE sources cannot connect there. Live data, Live Preview, Run Screen and the simulator's connections all require a **self-hosted deployment** of this fork (a static build of `src/main/webapp`, e.g. via Docker) where you control the CSP `connect-src` and, optionally, `DRAWIO_CONFIG.hmi.allowedEndpoints` (see [HARDENING.md](HARDENING.md)). Editing HMI screens (bindings, tags, widgets) works anywhere the plugin loads; only *connecting to live data* is restricted.

---

## 3. Quick start (5 minutes)

1. **Start a screen.** *File → New*, then pick one of the four **HMI / SCADA** templates (search `hmi` or `scada` in the New dialog — Water Treatment Plant, Tank Farm, Motor Control Center, Building HVAC; see §11 templates catalogue) or start from a blank page and drag a **Tank** shape onto the canvas from the **HMI / Displays** sidebar palette (*More Shapes → HMI / SCADA*, or search `tank`).
2. **Add a simulated tag.** *Extras → HMI / SCADA → Tags…* → **Add Tag**. Give it a name (e.g. `Tank1.Level`), type `number`, and under **Simulation** pick kind `sine`, min `10`, max `90`, period `20000` (ms). Click OK, then OK to close the dialog.
3. **Bind the tank to the tag.** Select the tank shape. In the Format panel's **HMI** tab, either:
   - use the **Quick Add** section's *Level* button (fills in a placeholder tag name you then edit to `Tank1.Level`), or
   - open the **Tag Browser** (*Extras → HMI / SCADA → Tag Browser…*) and drag `Tank1.Level` onto the tank — dropping onto a tank/cylinder shape auto-creates a `style:hmiLevel` binding.
4. **Preview it.** Press **F5** (Live Preview). The tank should start filling and draining on a 20-second sine wave. Toggle **Interactive** in the same menu if you also want click/event handlers to fire while still editing.
5. **Run it.** Press **Ctrl/Cmd+Shift+F5** (Run Screen) to open the locked, chromeless operator view in a new tab/window — no editing, no sidebar, just the running screen with a status bar (§13).

---

## 4. Concepts

| Concept | Summary |
|---|---|
| **Data source** | A configured connection (MQTT/WS/HTTP/SSE/host) that produces tag values and, optionally, accepts writes. Document- or page-scoped. §5. |
| **Tag** | A named data point with a current value, quality (`good`/`bad`/`uncertain`/`stale`) and timestamp, held only in memory. §6. |
| **Binding** | A rule on a cell mapping a tag (or an expression) to a property: label, style key, geometry offset, visibility, tooltip or widget property. §7. |
| **Event / action** | A handler on a cell (click, value change, hover, page open/close, a named message) that runs one or more actions (write a tag, navigate, open a dialog, animate, run a script, …). §8. |
| **Trigger** | A condition-and-action rule, or a multi-state machine, evaluated whenever a referenced tag changes. The basis for alarm colouring and other state-driven appearance. §9. |
| **Animation** | A named, cell-level animation (a built-in preset or a keyframe sequence) started by triggers, events, or auto-play. §10. |
| **Alarm** | A tag-level limit (`hihi`/`hi`/`lo`/`lolo`, or a boolean alarm value) tracked in a session-local alarm list with acknowledgement. §12. |
| **Runtime vs. edit mode** | Edit mode is the ordinary draw.io editor (nothing runs unless Live Preview is on). Runtime mode (Run Screen, `?hmi=run`, or an embed) is a locked, chromeless view where sources connect, bindings/triggers/events/animations are all live. §13. |
| **Isolation** | Runtime values are held in a per-cell **overlay** (a map of transient style/label/property changes), never in the `mxGraphModel`. No runtime code path calls `model.setValue`/`setStyle`/`setGeometry` or opens an undoable edit; stopping the runtime restores every cell to its exact design-time appearance and the file's modified flag is untouched. |

---

## 5. Data sources

Manage sources in *Extras → HMI / SCADA → Data Sources…*. Each source has a name, protocol type, an enabled flag, a scope (`file` — connects once regardless of page; or `page` — connects/disconnects with the page that references it), and an optional tag-name **prefix** (e.g. `plant1/`) prepended to every tag it produces.

Connections open **only** in runtime mode or while Live Preview is on; they close when you leave that mode, close the file, or unload the page. Untrusted files never auto-connect just from being opened.

### Protocol settings

| Type | Settings |
|---|---|
| `mqtt` | Broker URL (`ws://`/`wss://`), client ID, keep-alive, MQTT protocol version, clean session, subscribed topic filters (comma-separated, wildcards `+`/`#` supported) |
| `ws` | URL, an optional message sent right after connect (subscription handshake) |
| `http` | Method (GET/POST/PUT), poll interval (ms, minimum enforced at 250 by the SRS; the dialog defaults to 1000), request body, headers. Overlapping polls are prevented — a new request is not issued while one is outstanding |
| `sse` | URL, event names to listen for (default `message`) |
| `host` | No connection settings — values arrive only through the embed postMessage API (§14); used when draw.io is embedded in a host page that pushes data in |

### Payload formats

Set under **Format** in the source editor (`format.kind`):

| Kind | Example | Resulting update |
|---|---|---|
| `flat` | `{"Tank1/Level": 42.1, "Pump1/Run": true}` | Each key is a tag name |
| `array` | `[{"tag": "Tank1/Level", "value": 42.1, "ts": ..., "quality": "good"}]` | One update per item (`id`/`dataId` are accepted aliases of `tag`) |
| `topic` | MQTT topic `plant/Tank1/Level`, payload `42.1` | With template `plant/{tag}`, the tag name is extracted from the topic |
| `jsonpath` | A list of `{tag, path}` pairs evaluated against the payload | One update per configured path |
| `drawio-update-xml` | `<updates><update id="cell1" value="…"/></updates>` | Compatibility with the legacy `plugins/update.js` protocol |
| `auto` (default) | any of the above | Format detected from the message shape |

A source may also define a **parser script** (`(message, context) → updates | false`, dropped if it returns `false`) and a **pre-connect script** that can rewrite the URL/headers/credentials before connecting — both subject to the script policy (§16, §17).

### Credentials

Per source, a **Credentials mode**:

| Mode | Behaviour |
|---|---|
| `none` | No credentials sent |
| `save` | Username/password stored in the source config (and therefore in the file) — the dialog shows a warning in red |
| `prompt` | The operator is asked once per runtime session (`Hmi.CredentialsDialog`), cached for that session only |
| `param` | Looked up at runtime from `${paramName}` (screen variables, URL parameters, `localStorage`, or `DRAWIO_CONFIG.hmi.params`) |

### Test connection

Each source row has a **Test Connection** button: it spins up a temporary, isolated `SourceManager`/`TagStore` for 5 seconds, shows connection state and received/error counts, and tears everything down on close — it never touches the runtime or the document's real tag store.

### Reconnection

Sources reconnect automatically with exponential backoff (starting at 1 s, capped at 30 s, with jitter), with an optional maximum attempt count. Connection state is one of `disconnected`, `connecting`, `connected`, `error`.

---

## 6. Tags

Manage the tag catalogue in *Extras → HMI / SCADA → Tags…*. This dialog also holds document-wide runtime settings (simulation mode, script policy, fit mode, navigation, max update rate, quality indication style, pan/zoom, and a design resolution).

### Catalogue fields

| Field | Meaning |
|---|---|
| `name` | Tag name (any string; slash-separated names like `Tank1/Level` or dot-separated like `Tank1.Level` are both common) |
| `type` | `number` \| `integer` \| `boolean` \| `string` \| `object` |
| `unit`, `description` | Display metadata |
| `min` / `max` | Engineering range |
| `decimals` | Default number formatting for this tag |
| `access` | `r` (read-only) or `rw` (writable) |
| `initial` | Value shown before any update arrives |
| `staleMs` | If set, the tag's quality becomes `stale` when no update arrives within this many ms |
| `local` | Screen variable: no data source, writes stay local |
| `expr` | Derived-tag expression, re-evaluated whenever a referenced tag changes (e.g. `(T1 + T2) / 2`) |
| `sim` | Simulation settings (see below) |
| `write` | Write target (see below) |
| `alarms` | Alarm limits (see §12) |
| `roles` | Roles required to write to this tag |

Tags used in bindings but not declared in the catalogue still work — their type is inferred from the values received, and they show up in the Tag Browser once seen.

### Simulation kinds

| Kind | Fields | Behaviour |
|---|---|---|
| `random` | `min`, `max`, integer/float | Random value each update |
| `sine` | `min`, `max`, `period` (ms) | Sine wave |
| `ramp` | `min`, `max`, `step`, `interval` | Steps up, wraps at `max` back to `min` |
| `list` | `values` | Cycles through a fixed list |
| `toggle` | `interval` (or `period`) | Flips a boolean on an interval |
| `constant` | `values[0]` | Fixed value |
| `script` | `code` | Custom generator, subject to script policy |

Simulation is document-wide, in *Tags…* → **Simulation mode**: `off`, `on` (simulated tags run alongside real sources), or `only` (no real connections — used automatically by Live Preview when nothing else is reachable, and set via `hmi-sim=only` in a runtime URL).

### Write targets, screen variables, derived tags

A writable tag's `write` block routes writes to a source: `{source, topic, payload}` for MQTT (payload template default `'{"value":${value}}'`, with `qos`/`retain`), `{message}` for WebSocket, or `{method, url, headers, body}` for HTTP. A **screen variable** (`local: true`) has no source — writes just update the in-memory value, useful for local screen state (selected view, a UI toggle) or values later wired to a real source. A **derived tag** (`expr` set) has no source of its own either; it recomputes from other tags' current values whenever one of them changes.

### Stale, quality, and system tags

`good` / `bad` / `uncertain` / `stale` quality is tracked per tag. `bad` happens when an incoming value fails type coercion (the last good value is kept). `stale` happens when `staleMs` elapses with no update. Bound cells show quality via the configurable **Quality** setting (`outline` — a dashed grey border plus a small badge — or `none`).

Built-in **system tags** (read-only, bindable like any tag):

| Tag | Value |
|---|---|
| `$alarms` | JSON array of active alarms |
| `$alarmCount` | Number of active alarms |
| `$alarmUnack` | Number of unacknowledged alarms |
| `$status/<sourceId>` | Connection state of that data source |

### CSV / JSON import-export

*Tags…* → **Import CSV / Export CSV / Import JSON / Export JSON**. CSV columns (in order): `name,type,unit,min,max,decimals,access,initial,staleMs,simKind,simMin,simMax,simPeriod`. JSON import/export is the raw `TagDef[]` array (all fields, including `write`/`alarms`/`expr`).

### Tag Browser

*Extras → HMI / SCADA → Tag Browser…* opens a floating panel listing every catalogue tag plus every tag seen at runtime, with a search box. While a runtime (or Live Preview) is running it shows live value and quality (refreshed at 4 Hz), and offers:

- **Drag-to-bind** — drag a row onto a shape to create a default binding: `style:flowAnimation` for an edge, `prop:value` for an `mxgraph.hmi.*` widget, `style:hmiLevel` for a shape that already has a level (or a cylinder), otherwise `label`.
- **Manual override** — the pencil (✎) button next to a value prompts for a new value and writes it directly into the running tag store (and into the simulator, if that tag is simulated), for testing triggers without waiting for real data.

---

## 7. Bindings

A binding maps a tag (or expression) to one property of a cell. Add/edit them from the Format panel's **HMI** tab (select a cell → **Bindings** section → Add), or via drag-and-drop from the Tag Browser.

### Targets

| Target | Applies to |
|---|---|
| `label` | The cell's text |
| `tooltip` | The cell's tooltip |
| `visible` | Show/hide the cell |
| `attr:<name>` | A user-object attribute (updates `%name%` placeholders in labels) |
| `style:<key>` | Any style key (`fillColor`, `strokeColor`, `fontColor`, `opacity`, `rotation`, `hmiLevel`, `flowAnimation`, …) |
| `geo:x` \| `geo:y` \| `geo:width` \| `geo:height` | A geometry offset relative to the design value |
| `prop:<name>` | A widget-specific runtime property — shorthand for `style:hmi<Name>` (first letter upper-cased), e.g. `prop:value` → `style:hmiValue` |
| `prop:series` | Appends `(ts, value)` to the cell's overlay series buffer (used by the trend chart); takes `maxPoints` and `name` alongside the binding |

### Transforms

| Kind | Fields | Behaviour |
|---|---|---|
| `scale` | `inMin, inMax, outMin, outMax, clamp` | Linear scaling, optional clamping |
| `map` | `entries: [{operator, value, output}], default` | First matching entry wins (same operators as trigger conditions, §9) |
| `invert` | — | Boolean invert |
| `expr` | `expr` | The HMI expression language: arithmetic, comparison, logical/ternary operators, string concatenation, functions `min max abs round(x[,n]) floor ceil clamp fmt str num bool len now() if(c,a,b)`; references `value` and other tags via `tag("name")` |
| `script` | `code` | Async, sandboxed script (§16); returns the transformed value |

### Formatting

`format: {decimals, pattern, unit}` on a `label`/`tooltip`/`attr:` binding controls number formatting (decimals, unit suffix pulled from the tag's catalogue `unit`). `--` is shown for `null`/`undefined`.

### Placeholders

Inside a label or tooltip of a cell with `placeholders="1"`, `%tag:<name>%` (optionally `%tag:<name>|<format>%`, e.g. `%tag:Tank1.Level|0.0%`) resolves to the current formatted tag value. In edit mode with Live Preview off, it shows the tag's simulated/initial value from the catalogue, or `--`.

### Multi-selection and group targets

- **Quick Add** (Format panel → HMI tab, cells selected) inserts a binding template using `Tag{id}` — `{id}` (and any other `{attrName}`) is substituted per cell from that cell's own id/attributes when applied to a multi-selection, so the same click wires up several similar shapes at once.
- **Group-level bindings**: a binding may carry `targetCells: {cells: [ids], tags: [cellTags], path: 'i/j'}` to apply its value to descendant cells of a group/container — by id, by draw.io cell tag among descendants, or by a relative child-index path.
- **Parameterised tags**: a tag name may itself contain `%attr%` placeholders resolved from the cell's (or an ancestor's) attributes, so one reusable symbol (e.g. a "Pump" group) can be instantiated per device just by setting an attribute.

### Bad-quality display

When a bound tag's quality is `bad` or `stale`, the cell shows the document's configured quality indication (default: dashed grey outline + badge).

### JSON example

```json
{"tag": "Tank1.Level", "target": "style:hmiLevel", "format": {"decimals": 1}}
```

```json
{"expr": "tag(\"T1\")+tag(\"T2\")", "target": "label", "format": {"decimals": 0, "unit": true}}
```

---

## 8. Events & actions

Add event handlers from the Format panel's HMI tab, **Events** section. Each handler:

```json
{"on": "click", "conditions": [], "conditionType": "and", "actions": [...], "confirm": true, "delay": 0, "stopOnError": false}
```

### Events

| `on` | Fires when |
|---|---|
| `click`, `dblclick`, `mousedown`, `mouseup` | Mouse interaction |
| `enter`, `leave` | Hover in/out |
| `valueChange` | Any bound tag on the cell changes |
| `pageOpen`, `pageClose` | The page (or the runtime) opens/closes |
| `message` | A named message fired by an `emit` action elsewhere (`message` field selects which name, or all if omitted) |
| `contextmenu`, `longpress` | Right-click / long-press (touch) |
| `change` | A control widget's value is committed (numeric input, dropdown) |

Handlers run only in runtime mode, or in edit mode with Live Preview **and** Interactive both on. Events on hidden/disabled cells are ignored; an event not handled on a cell bubbles to its parent group.

### Actions

| Type | Fields | Notes |
|---|---|---|
| `setProps` | `target, style:{}, attrs:{}, label, visible` | Values may contain `${var}`; transient (overlay only) |
| `writeTag` | `tag`, and one of `value` \| `expr` \| `prompt:{title}` \| `fromWidget:true` | Routed through the tag's write target; `fromWidget` uses the value the operator just typed/selected |
| `toggleTag` | `tag` | Inverts a boolean tag |
| `pulseTag` | `tag, value, reset, ms` | Writes `value`, then writes `reset` after `ms` |
| `navigate` | `page` (id or name) \| `url` | Page switch or external navigation |
| `openUrl` | `url, target` | Opens a URL (`Graph.sanitizeLink` applied) |
| `dialog` | `page` \| `url`, `title, width, height` | Faceplate: renders another page read-only in a floating window, or a sandboxed iframe for a URL |
| `startAnimation` / `pauseAnimation` / `stopAnimation` | `target, name` | Controls a named animation on target cells |
| `emit` | `name, payload` | Fires a named message, received by `message` event handlers |
| `send` | `source, topic, payload, method, url` | Publishes an arbitrary payload directly to a source |
| `notify` | `text, level` | Toast message (`info`/`warn`/`error`) |
| `postMessage` | `to: 'parent' \| <cellId>`, `data` | To the embedding host, or into an iframe-widget cell |
| `script` | `code` | Sandboxed script (§16) |
| `drawioAction` | `action` | Runs an existing draw.io custom-link action (`show`, `hide`, `toggle`, `highlight`, `fadeIn`, `flow`, …) via `Graph.executeCustomActions`, forced transient |
| `ackAlarms` | `tag` (optional) | Acknowledges one alarm, or all when omitted |
| `playMedia` | `target, command: play\|pause\|stop` | Controls `<video>`/`<audio>` inside the target cell |

Actions in a handler run **sequentially**; each may set its own `delay` (ms). A failing action is logged to diagnostics and does not stop the rest unless the handler sets `stopOnError`.

### Confirmation, delay, conditions

- `confirm: true` (or `{title, text}`) shows a confirm dialog before the actions run — this is the mechanism behind `hmiConfirm`-style write protection (see also the built-in control widgets' own `hmiConfirm` style key, default on, described in §11).
- `delay` on the handler delays running its actions; `delay` on an individual action delays just that step.
- `conditions`/`conditionType` gate the whole handler using the same condition syntax as triggers (§9).

### Custom links referencing HMI actions

Existing draw.io `data:action/json` custom links keep working in runtime mode and may include `{"hmi": {...}}` entries, handled by the same action executor (`Graph.customActionHandler`) that HMI events use.

---

## 9. Triggers & state machines

Triggers evaluate whenever a tag they reference changes, and run actions on state transitions — never on every update. Add them from the Format panel's HMI tab (**Triggers** section) or, for page-wide logic, in the **Page Triggers** section of the HMI tab shown when nothing is selected.

### Simple trigger

```json
{
  "name": "HighLevel",
  "conditions": [{"tag": "Tank1.Level", "operator": ">", "value": 90}],
  "conditionType": "and",
  "actions": [
    {"type": "setProps", "target": "self", "style": {"strokeColor": "#e74c3c"}},
    {"type": "startAnimation", "target": "self", "name": "blink"}
  ],
  "elseActions": [
    {"type": "setProps", "target": "self", "style": {"strokeColor": "#607d8b"}},
    {"type": "stopAnimation", "target": "self", "name": "blink"}
  ]
}
```

`actions` run on the false→true transition; `elseActions` run on the true→false transition. An empty `conditions` array is always true.

### State machine

```json
{
  "name": "PumpState",
  "states": [
    {"name": "fault", "conditions": [{"tag": "Pump1.Fault", "operator": "==", "value": true}], "actions": [...]},
    {"name": "running", "conditions": [{"tag": "Pump1.Run", "operator": "==", "value": true}], "actions": [...]},
    {"name": "stopped", "conditions": [], "actions": [...]}
  ]
}
```

States are evaluated in order; the first matching state is entered, and its actions run only on entry (not on every subsequent update). List the "always true" fallback state last, with empty `conditions`.

### Condition operators

`==`, `!=`, `>`, `<`, `>=`, `<=`, `range` (`[a,b)`, value as `[a,b]` or `"a,b"`) and `!range`, `in`/`!in` (set membership, items may include `a..b` ranges), `changed`, `isBad` (quality not `good`), `true` (always true — used for an "else" state).

### Hysteresis and delay

A trigger may declare `deadband` (numeric hysteresis) and `onDelay`/`offDelay` (ms).

### Document-level triggers and initial evaluation

Triggers stored under the document config's `triggers` (not attached to a cell) run page-wide logic independent of any one shape. On runtime start, all triggers are evaluated once against the initial values — after the first data arrives, or after a configurable timeout (`DRAWIO_CONFIG.hmi.initialTimeout`, default 1000 ms) — so the screen opens in the correct state even before live data settles.

---

## 10. Animations & flow

### Named animations and presets

```json
{"name": "spin", "preset": "spin", "params": {"rpmTag": "IntakePump.Speed"}, "autoPlay": true}
```

| Field | Meaning |
|---|---|
| `preset` | `blink` \| `pulse` \| `spin` \| `shake` \| `colorCycle` \| `fadeInOut`, or `null` for a pure keyframe animation |
| `params.rate` | Blink/pulse rate override (frequency) |
| `params.rpm` / `params.rpmTag` | Spin speed in RPM, static or bound to a tag (recomputed live as the tag changes) |
| `params.colors` | `colorCycle` palette (default red/yellow/green) |
| `autoPlay` | Starts automatically when the page opens |
| `cycles` | `0` = infinite |
| `duration`, `easing` | For keyframe animations (`linear`/`ease-in`/`ease-out`/`ease-in-out`) |
| `keepState` | Keep the final frame's appearance after the animation completes, instead of reverting |
| `next: {target, name}` | Chains into another animation on completion; also fires an `animationEnd` event on the cell |
| `frames: [{duration, props}]` | Keyframe list; `props` may include `rotation, opacity, fillColor, strokeColor, fontColor, dx, dy, scale, visible, hmiLevel` |

Presets `blink`/`pulse`/`spin`/`shake`/`fadeInOut` run as CSS animations (no per-frame JS cost); `colorCycle` and keyframe animations are interpolated per render frame. Animations pause automatically when the browser tab is hidden, and respect `prefers-reduced-motion` (blink falls back to a static high-contrast outline). Start/stop/pause an animation from a trigger or event via the `startAnimation`/`pauseAnimation`/`stopAnimation` actions.

### Edge flow animation

Standard draw.io `flowAnimation=1` is extended with:

| Style key | Values |
|---|---|
| `flowAnimationType` | `dash` (built-in) \| `dots` \| `beads` \| `arrows` \| `liquid` |
| `flowAnimationReverse` | `0`/`1` |
| `flowAnimationDuration` | ms |
| `flowAnimationColor` | colour |
| `flowAnimationWidth` | width |

Bind `style:flowAnimation` to a run/stop tag, and `style:flowAnimationType`/`style:flowAnimationColor` to change the flow's look live (e.g. a pipe shown as `liquid` while a pump is running).

### Level fill

Any vertex shape supports a level fill via style keys `hmiLevel` (value, default range 0–100), `hmiLevelMin`/`hmiLevelMax`, `hmiLevelColor`, `hmiLevelDirection` (`up`/`down`/`left`/`right`), `hmiLevelOpacity`. The fill is built as a closed path reusing the shape's own outline (no canvas clipping), so it works on the `mxgraph.hmi.tank` widget, plain cylinders, P&ID vessel stencils, or any other vertex.

---

## 11. Widget library

All HMI widgets are `shape=mxgraph.hmi.*` cells, in the **HMI / SCADA** sidebar category (*More Shapes*), grouped into palettes: **Displays**, **Controls**, **Charts**, **Media**, **Equipment**, **Pipes**. Every widget that shows a live value reads it from the style key **`hmiValue`** — a binding with `target: 'prop:value'` writes to that same key, so the design-time default and the live value use one code path. Non-good quality shows as a dashed border plus a small badge (never colour alone).

| Widget | Key style keys | Typical binding |
|---|---|---|
| `numDisplay` — numeric display | `hmiValue, hmiDecimals, hmiUnit, hmiPrefix, hmiAlign, hmiLcd, hmiQuality` | `prop:value` |
| `radialGauge` — radial gauge | `hmiValue, hmiMin/hmiMax, hmiStartAngle/hmiEndAngle, hmiMajorTicks/hmiMinorTicks, hmiBands ("min:max:color,...")`, `hmiNeedleColor, hmiUnit, hmiDecimals` | `prop:value` |
| `linearGauge` — linear gauge/bar | `hmiValue, hmiMin/hmiMax, hmiOrientation, hmiBands, hmiTicks, hmiFillColor, hmiUnit, hmiDecimals` | `prop:value` |
| `tank` — tank/vessel | `hmiValue, hmiMin/hmiMax, tankType (vertical\|horizontal\|coneBottom\|sphere), hmiLiquidColor, hmiShowScale, hmiUnit` | `prop:value` |
| `lamp` — indicator lamp/LED | `hmiValue, hmiOnColor/hmiOffColor/hmiFaultColor, hmiStates, hmiShape (round\|square)` | `prop:value` |
| `switch` — toggle switch | `hmiValue (bool), hmiOnColor/hmiOffColor, hmiDisabled, hmiOnLabel/hmiOffLabel` | `prop:value`; click runs `toggleTag` at runtime |
| `button` — push button | `hmiMode (momentary\|latched), hmiValue, hmiOnColor/hmiOffColor, hmiDisabled` | write-on-press (momentary) or `toggleTag` (latched) |
| `slider` — set-point slider | `hmiValue, hmiMin/hmiMax, hmiStep, hmiOrientation, hmiTrackColor/hmiThumbColor` | `prop:value`; writes on release, arrow keys adjust when focused |
| `numInput` — numeric/text input | `hmiValue, hmiUnit, hmiEditable, hmiDecimals` | `prop:value`; runtime overlays a real `<input>` for typing |
| `dropdown` — multi-state selector | `hmiValue, hmiOptions ("value:label,...")` | `prop:value`; writes selected value |
| `trendChart` — trend line chart | `hmiTimeWindow, hmiYMin/hmiYMax, hmiLineColor, hmiGridColor, hmiShowLegend, hmiFillArea` | `prop:series` (appends points) |
| `barChart` / `pieChart` | `hmiValue (JSON), hmiBarColor/hmiOrientation` (bar); `hmiShowLegend/hmiDonut` (pie) | `prop:value` |
| `table` — data table | `hmiValue (JSON rows), hmiColumns, hmiHeader, hmiStripe, hmiMaxRows, hmiAutoScroll, hmiScrollInterval` | `prop:value` |
| `alarmBanner` / alarm list | `hmiValue` (JSON alarm array) | typically `$alarms` (system tag) |
| Equipment: `pump`, `fan`, `motor`, `agitator`, `valve`, `conveyor`, `heatExchanger`, `pipeTee`, `pipeElbow` | `hmiValue`/`hmiState` (0 stopped/grey, 1 running/green, 2 fault/red, 3 transit/amber; valve: 0 closed/1 open), `hmiStates` override map | `prop:value`; `spin` animation for rotating equipment (pump/fan/motor/agitator) |
| Pipe (edge) | `shape=pipe`, `flowAnimation*` (see §10) | `style:flowAnimation`, `style:flowAnimationType` |
| `clock` — date/time display | `hmiValue (timestamp or blank='now'), hmiFormat, hmiAnalog` | usually unbound (reads system clock) |
| `statusIndicator` — connection status | `hmiValue (connected\|connecting\|error\|disconnected)` | `$status/<sourceId>` |
| `iframe`, `video`, `echarts` (runtime-only) | `hmiUrl, hmiRefresh, hmiSandbox` (iframe); `hmiUrl, hmiAutoplay, hmiMuted, hmiLoop` (video); `hmiOption` (echarts) | Live only inside the runtime; a plain placeholder is shown at design time and in exports |

Every value-showing widget accepts its value both from a binding and as a static design-time default (useful for mock-ups before any tag exists). Interactive widgets (switch, button, slider, numInput, dropdown) are keyboard-operable at runtime (Tab to focus, Enter/Space to activate, arrow keys adjust a slider) and expose ARIA roles/labels. The full style-key reference, including chart and equipment shapes, is in [`src/main/webapp/shapes/hmi/README.md`](../../src/main/webapp/shapes/hmi/README.md).

### Ready-made templates

Four complete example screens ship under *File → New* in the **HMI / SCADA** template category (they are also found by searching `hmi` or `scada`):

| Template | File |
|---|---|
| Water Treatment Plant | `src/main/webapp/templates/hmi/water_treatment.xml` |
| Tank Farm | `src/main/webapp/templates/hmi/tank_farm.xml` |
| Motor Control Center | `src/main/webapp/templates/hmi/motor_control_center.xml` |
| Building HVAC | `src/main/webapp/templates/hmi/building_hvac.xml` |

Each template ships with its own simulated tags (`sim: "only"`) so it runs immediately without any real data source.

---

## 12. Alarms

A tag's `alarms` block declares limits: `hihi`, `hi`, `lo`, `lolo` (numeric), or `bool` (a boolean alarm value), plus `deadband`, per-limit `severity` (1 = highest … 4 = lowest) and per-limit `messages`.

- **Alarm list.** Active alarms are tracked session-locally with state `active-unack`, `active-ack`, or `cleared-unack`. Its own floating window (separate from the Diagnostics panel) opens by clicking the alarm summary in the runtime status bar. Acknowledge individually or all at once (**Acknowledge all**).
- **`hmiAlarmIndicator=1`** on any cell bound to an alarmed tag applies the alarm's severity colour to its stroke and blinks while unacknowledged (stops blinking once acknowledged); the highest-severity active alarm among the cell's bound tags wins.
- **Alarm Banner / Alarm List widgets** (`mxgraph.hmi.alarmBanner`, §11) render the `$alarms` system tag (or any JSON array in the same shape) directly on the screen.
- **Audible alarms** (optional, `runtime.alarmSound` or `DRAWIO_CONFIG.hmi.alarmSound`, `true` or a max-severity number) play a short tone via the Web Audio API for new unacknowledged alarms at or above that severity — browsers only allow this after a user gesture on the page.
- **External acknowledgement** — `runtime.ackTarget = {source, topic|url, payload, method, qos}` (with `${tag}`/`${ts}`/`${user}` placeholders) publishes every acknowledgement to a data source, e.g. for external persistence.

---

## 13. Running screens

### Run Screen and runtime chrome

**Ctrl/Cmd+Shift+F5** (or *Extras → HMI / SCADA → Run*) opens the current file in a new tab/window at `?hmi=run#R<data>`, honouring the safety notice (§1). The runtime is a locked, chromeless view (based on draw.io's lightbox mode): no editing, no selection handles, no sidebar or Format panel. It adds a **status bar** at the bottom showing:

- one dot per connected source (green = connected, amber = connecting, grey = disconnected, a small square = error), with the source's name and state as a tooltip of the last error;
- the current alarm summary (click to open the Alarm List);
- fullscreen and diagnostics buttons, and a clock.

**Ctrl/Cmd+Shift+D** opens the Diagnostics panel from anywhere in the runtime.

### Kiosk URL parameters

| Parameter | Effect |
|---|---|
| `hmi=run` | Starts runtime mode |
| `page-id=<id>` | Opens on a specific page |
| `hmi-fit=none\|page\|width\|stretch` | Overrides the document's fit mode |
| `hmi-hide-nav=1` | Hides the chromeless toolbar/page navigation |
| `hmi-hide-status=1` | Hides the status bar entirely |
| `hmi-role=<role[,role...]>` | Sets the runtime user's roles (subject to `DRAWIO_CONFIG.hmi.allowUrlRoles`) |
| `hmi-reload=<minutes>` | Reloads the page periodically (leak recovery for unattended kiosks) |
| `hmi-sim=off\|on\|only` | Overrides the document's simulation mode |
| `hmi-connect-src=<hosts>` | Adds extra CSP `connect-src` hosts (dev/desktop builds only) |

### Fit modes and ISA-101 theme

`runtime.fit`: `none` (no auto-zoom), `page` (fit the whole page — default), `width` (fit width only), `stretch`. `runtime.width`/`runtime.height` optionally pin a design resolution. The layout re-fits on window resize. `runtime.theme: 'isa101'` applies a neutral grey background (colour reserved for abnormal states, per the ISA-101 high-performance HMI style); `default` leaves draw.io's normal background.

### Pages & navigation

`runtime.nav`: `tabs` (default chromeless page tabs) or `none`. Page switches can also be driven purely by `navigate` actions (§8). On a page switch, the outgoing page's bindings/triggers/animations are torn down and the new page's are built; file-scoped sources stay connected across pages, page-scoped sources reconnect.

### Faceplates and dialogs

The `dialog` action (§8) opens either another page, read-only, as a floating faceplate window bound to the same live tag store (bindings and click actions work; animations are not driven inside a faceplate — no its own render loop), or a sandboxed iframe for an external URL. Multiple faceplates can be open at once.

### Keyboard operation

Interactive widgets are reachable by Tab and operate with Enter/Space (and arrow keys for sliders), per §11.

---

## 14. Embedding

### postMessage API

Available when the runtime is loaded in the standard draw.io embed mode (`?embed=1&proto=json`), in addition to the existing embed protocol:

| Direction | Message | Purpose |
|---|---|---|
| Host → draw.io | `{action: "hmiSetValues", values: {tag: value, ...} \| [{tag, value, ts, quality}]}` | Push tag values in |
| Host → draw.io | `{action: "hmiRun"}` / `{action: "hmiStop"}` | Start/stop the runtime |
| Host → draw.io | `{action: "hmiNavigate", page}` | Switch page |
| Host → draw.io | `{action: "hmiGetTags"}` | Request a tag snapshot |
| Host → draw.io | `{action: "hmiSetRoles", roles: [...]}` | Set the runtime user's roles |
| Host → draw.io | `{action: "hmiWrite", tag, value}` | Issue a validated write |
| draw.io → host | `{event: "hmiWrite", tag, value, cellId}` | A write targeted a `host` source, or `forwardWrites` is on |
| draw.io → host | `{event: "hmiEvent", name, payload, cellId}` | An `emit` action fired |
| draw.io → host | `{event: "hmiStatus", sources}` | Source connection status changed |
| draw.io → host | `{event: "hmiTags", tags}` | Response to `hmiGetTags` |
| draw.io → host | `{event: "hmiStarted"}` / `{event: "hmiStopped"}` | Runtime lifecycle |
| draw.io → host | `{event: "hmiPostMessage", data, cellId}` | A `postMessage` action targeting `parent` |

Only messages from `window.parent`/`window.opener` are accepted (the existing embed security rule); credentials are never included in outgoing messages.

### JS API (`ui.hmi`)

When draw.io is embedded as a JS application (not just an iframe with postMessage), `ui.hmi` exposes: `run(options)`, `stop()`, `isRunning()`, `setValues(values)`, `getValue(tag)`, `getTags()`, `write(tag, value) → Promise`, `subscribe(fn) → unsubscribe`, `onStart(fn)`, `getRuntime()`.

### Standalone viewer

`js/hmi-viewer.min.js` embeds an HMI screen into a third-party page without the full editor, using the existing draw.io viewer embed convention:

```html
<div class="mxgraph" data-mxgraph='{"xml": "...", "hmi": {"sim": "only"}}'></div>
<script src="https://your-host/js/hmi-viewer.min.js"></script>
```

`"hmi"` may be `true` or `{sim, interactive, roles, config}`, where `config` is merged into `DRAWIO_CONFIG.hmi` for that embed. The runtime API is available on the viewer instance as `viewer.hmi`.

---

## 15. Importing meta2d screens & exporting HTML

**Import.** *Extras → HMI / SCADA → Import meta2d JSON…* converts a meta2d.js (`@meta2d/core`) JSON export into draw.io cells with HMI attributes: pens → shapes, `networks` → sources, `realTimes` → bindings + tag catalogue, `events`/`triggers` → HMI events/triggers, `frames` → animations. Unsupported meta2d features (JetLinks/ADIIOT/SQL networks, `table2`, most chart types, `SendData`, etc.) are reported in a dialog listing exactly what was skipped, rather than silently dropped. If the app supports multiple pages, the import lands on a new page named after the source file.

**Export.** *Extras → HMI / SCADA → Export HMI Screen (HTML)…* saves a self-contained `.html` file for the current screen. By default it's a thin wrapper embedding an iframe that points at this deployment's `?hmi=run` runtime URL; if a standalone viewer bundle is configured (`Hmi.viewerBundleUrl`), it instead inlines the viewer script directly with the diagram data, so the exported file needs no round trip back to this server.

---

## 16. Diagnostics & validation

**Diagnostics** (*Extras → HMI / SCADA → Diagnostics…*, or Ctrl/Cmd+Shift+D in the runtime) is a tabbed window:

| Tab | Shows |
|---|---|
| Sources | Per-source state, received/error counts, last message time/error; click a row to see its last messages (a 100-entry ring buffer, secrets redacted) |
| Rate | Frame count, tag updates processed, cells flushed per second |
| Log | The diagnostics log (level/category filterable): warnings, errors, script/binding failures |
| Writes | The write audit log (timestamp, tag, value, outcome) |

**Validate** (*Extras → HMI / SCADA → Validate…*) is a static check over the current page's configuration, listing errors and warnings, click-to-select the offending cell:

- bindings/conditions referencing undeclared tags (warning);
- invalid expressions (error, with the parser's message);
- write actions targeting a read-only tag (error);
- `navigate`/`dialog` actions targeting a missing page (error);
- action targets referencing a missing cell id (error);
- MQTT sources with no subscribed topics, HTTP sources with no URL (error/warning);
- scripts present while the effective script policy is `off` (warning);
- schema violations in any source/tag/binding/event/trigger/animation entry (error).

---

## 17. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| A source never connects, browser console shows a CSP error | The endpoint isn't in the page's CSP `connect-src` (and, on a hardened deployment, not in `DRAWIO_CONFIG.hmi.allowedEndpoints`). See [HARDENING.md](HARDENING.md) and, for a dev/kiosk one-off, `hmi-connect-src=<host>` in the URL. Remember app.diagrams.net never allows this (§2). |
| "Endpoint not allowed" style error at connect time | `DRAWIO_CONFIG.hmi.allowedEndpoints` is set and the source's URL doesn't match any prefix/regex entry — add it, or fix the source URL. |
| Scripts (parser/transform/action) silently don't run | The effective script policy is `off` — check `DRAWIO_CONFIG.hmi.scripts` and the document's own `scripts` setting in *Tags…* (a document can only restrict, never relax, the deployment policy). Validate (§16) flags this. |
| A value shows `--` or a dashed border with a `?` badge | Quality is `bad` (failed type coercion — check the tag's declared `type`) or `stale` (no update within `staleMs`). Check the source in Diagnostics → Sources. |
| Runtime feels sluggish under heavy load | The runtime already adapts: **Adaptive rate** lowers the effective update rate (down to 2 Hz) when frames run late or use over ~60% of the frame budget, and recovers gradually — check the current rate in Diagnostics → Rate. You can also lower `runtime.maxRate` (document-wide) or `DRAWIO_CONFIG.hmi.maxRate` (deployment-wide, default 30 Hz), and use `flowAnimation`/animations sparingly on very large screens. |
| Off-screen animations still seem to cost CPU | Per the SRS, only tab-hidden pausing is guaranteed; strict per-cell viewport culling is a "should", not implemented as a hard guarantee everywhere — keep large numbers of continuously-animated cells (spin/pulse/colorCycle) to what's actually visible on a typical operator screen. |
| A password/token appears to leak | It shouldn't: credentials are never written to the diagnostics log, exports, or postMessage events (`HMI-SEC-6`). If you see one, treat it as a bug and check whether `credentials.mode` is `save` (stored in the file) rather than `prompt`/`param`. |

For deployment-wide security configuration (endpoint allow-listing, script policy, roles, CSP), see [HARDENING.md](HARDENING.md). For setting up a gateway between field protocols (Modbus/OPC UA/S7/BACnet) and an HMI-compatible source (MQTT/WS/HTTP/SSE), see [GATEWAY_GUIDE.md](GATEWAY_GUIDE.md). For running local MQTT/WS/HTTP/SSE test servers while developing screens, see [`etc/hmi/dev/README.md`](../../etc/hmi/dev/README.md).

---

## Appendix: JSON reference examples

### Document config (`hmi` attribute on the model root, per page)

```json
{
  "version": 1,
  "sim": "off",
  "scripts": "inherit",
  "sources": [
    {"id": "mqtt1", "name": "Plant MQTT", "type": "mqtt", "enabled": true, "scope": "file",
     "url": "wss://broker.plant.example.com:8884/mqtt",
     "topics": [{"filter": "plant/#", "qos": 0}],
     "format": {"kind": "topic", "template": "plant/{tag}"},
     "credentials": {"mode": "none"}}
  ],
  "tags": [
    {"name": "Tank1.Level", "type": "number", "unit": "%", "min": 0, "max": 100, "decimals": 1,
     "sim": {"kind": "sine", "min": 10, "max": 90, "period": 20000},
     "alarms": {"hi": 85, "hihi": 95, "deadband": 1}}
  ],
  "triggers": [],
  "runtime": {"fit": "page", "panZoom": true, "nav": "tabs", "maxRate": 30,
              "quality": "outline", "theme": "default"}
}
```

### Cell binding (`hmiBindings` attribute)

```json
[{"tag": "Tank1.Level", "target": "style:hmiLevel", "format": {"decimals": 1}}]
```

### Cell event (`hmiEvents` attribute)

```json
[{"on": "click", "confirm": true,
  "actions": [{"type": "toggleTag", "tag": "Pump1.Run"}]}]
```

### Cell trigger — state machine (`hmiTriggers` attribute)

```json
[{"name": "PumpAnim", "states": [
  {"name": "running", "conditions": [{"tag": "Pump1.Run", "operator": "==", "value": true}],
   "actions": [{"type": "startAnimation", "target": "self", "name": "spin"}]},
  {"name": "stopped", "conditions": [],
   "actions": [{"type": "stopAnimation", "target": "self", "name": "spin"}]}
]}]
```

### Cell animation (`hmiAnimations` attribute)

```json
[{"name": "spin", "preset": "spin", "params": {"rpmTag": "Pump1.Speed"}, "autoPlay": true}]
```

For the complete, authoritative schema (every field, every default) see [ARCHITECTURE.md §2](../../src/main/webapp/plugins/hmi/ARCHITECTURE.md#2-persisted-schemas-json-stored-in-xml-attributes).
