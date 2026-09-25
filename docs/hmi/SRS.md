# Software Requirements Specification: HMI/SCADA capabilities for draw.io

| | |
|---|---|
| Document | SRS-HMI-001 |
| Version | 0.1 (draft) |
| Date | 2026-09-25 |
| Target codebase | `softalink/drawio` (fork of jgraph/drawio 31.5.2) |
| Reference codebase | `softalink/meta2d.js` (le5le meta2d, `@meta2d/core` 1.1.19, MIT) |
| Companion document | [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) |

---

## 1. Introduction

### 1.1 Purpose

This document specifies the requirements for adding HMI (Human-Machine Interface) and lightweight SCADA (Supervisory Control and Data Acquisition) capabilities to draw.io. These capabilities are modelled on the ones in meta2d.js. The goal is for draw.io to be usable both to **design** operator screens (process mimics, dashboards, equipment overviews) and to **run** them:
- Screens are bound to live plant or IoT data.
- Shapes animate and change appearance with the data.
- Operators can send commands back to devices.

The audience is the developers, testers and product owners of the softalink draw.io fork.

### 1.2 Scope

In scope. The HMI feature set ("draw.io HMI") adds:

1. **Data sources**: connections to MQTT (over WebSocket), WebSocket, HTTP polling and Server-Sent Events (SSE) endpoints, configured per document.
2. **Tags**: a document-level catalogue of named data points (tags), fed from data sources or from a simulator.
3. **Bindings**: mappings from tags to shape properties (label text, style keys, geometry, visibility, fill level, custom widget properties), with value transforms.
4. **Animations**: data-driven and event-driven shape animation (blink, rotate, flow, fill level, colour change, keyframe sequences).
5. **Events and actions**: runtime event handlers on shapes (click, value change, …) that run actions such as set property, write tag, navigate page, open URL, show dialog, start/stop animation and run script.
6. **Triggers**: rules that apply state changes when conditions hold, including multi-state machines, which are the basis for alarm visualisation.
7. **HMI widget library**: gauges, tanks and levels, indicators and LEDs, switches, sliders, buttons, numeric displays, trend charts, tables and pipes.
8. **Runtime mode**: a locked operator view in which data flows and events fire, separate from the editor.
9. **Simulation**: mock tag values for designing and testing without live equipment.

Out of scope for this version:
- Device drivers for field protocols (Modbus, OPC UA, S7, BACnet). These must be reached through a gateway that exposes MQTT, WebSocket, HTTP or SSE (see §2.4).
- Historian or time-series storage. Trend widgets keep only a bounded in-memory buffer.
- A full alarm-management server (acknowledgement persistence, shelving, escalation). Only client-side alarm visualisation and a session-local alarm list are in scope.
- Safety-rated or deterministic control. See §6.4.
- Real-time collaborative editing (not supported by draw.io 31.x).
- le5le-specific backends (le5le IoT, JetLinks/ADIIOT, `/api/iot/data/sql`).

### 1.3 Definitions

| Term | Meaning |
|---|---|
| HMI | Human-Machine Interface: an operator screen for monitoring and controlling equipment. |
| SCADA | Supervisory control and data acquisition. Here, the client-side supervisory layer only. |
| Tag | A named data point with a current value, quality and timestamp (for example `Boiler1/Temp`). Equivalent to a meta2d "data point" or `bind.id`. |
| Data source | A configured connection (MQTT, WS, HTTP or SSE) that produces tag values and, optionally, accepts writes. Equivalent to a meta2d `Network`. |
| Binding | A declarative rule that maps a tag (or expression) to a property of a cell. Equivalent to meta2d `realTimes[]`. |
| Trigger | A condition-and-action rule evaluated when a tag changes. Equivalent to meta2d `triggers` / `realTimes[].triggers`. |
| Runtime mode | The locked operator view. Equivalent to meta2d `locked >= 1`. |
| Edit mode | The normal draw.io editor. |
| Cell | A draw.io vertex or edge (`mxCell`). |
| Widget | An HMI shape whose rendering depends on runtime properties (for example `mxgraph.hmi.gauge`). |
| Runtime state | Values that exist only while the screen runs (tag values, animation state). They are never written into the diagram file. |

### 1.4 References

- meta2d.js source: `packages/core/src/core.ts`, `pen/model.ts`, `pen/render.ts`, `event/event.ts`, `store/store.ts`, `packages/form-diagram`, `packages/le5le-charts`, `packages/chart-diagram`.
- draw.io source: `src/main/webapp/js/grapheditor/*`, `js/diagramly/*`, `plugins/update.js`, `plugins/animation.js`, `docs/claude/animations.md`, `docs/claude/realtime-sync.md`, `docs/dialog-style-guide.md`.
- MQTT v3.1.1 / v5.0 over WebSocket; WHATWG WebSocket, EventSource and Fetch APIs.

### 1.5 Requirement notation

- Each requirement has an ID (`HMI-<area>-<n>`) and a priority:
  - **M**: must, required for v1.0.
  - **S**: should, planned for v1.x.
  - **C**: could, a candidate.
- The "meta2d ref" notes name the meta2d feature a requirement is derived from. They make parity easy to trace; they do not require identical behaviour.

---

## 2. Overall description

### 2.1 Product perspective

draw.io is an SVG-based diagram editor built on mxGraph. It already has several capabilities that the HMI features build on:
- User-object attributes and `%placeholder%` substitution.
- Custom link actions (`data:action/json`) that can show, hide, style, highlight and animate cells.
- Edge `flowAnimation`.
- An HTTP polling prototype: `plugins/update.js` together with `EditorUi.updateDiagram`.
- A chromeless lightbox mode.
- P&ID, electrical and fluid-power stencil libraries.

It has no data-source layer, no binding model, no runtime/edit separation for live data, and no HMI widgets.

meta2d.js has these capabilities, but on a different rendering engine (Canvas 2D, JSON "pens"). The feature is therefore a **re-implementation of meta2d's HMI concepts on draw.io's model and renderer**. It is not an embedding of meta2d. The reasons:
- draw.io stays the single editor.
- The files stay standard `.drawio` XML.
- The P&ID and electrical libraries can be reused unchanged.

The feature is delivered as a draw.io plugin plus a small set of core hooks (see §5.1).

### 2.2 Concept mapping (meta2d → draw.io)

| meta2d concept | draw.io realisation |
|---|---|
| `Pen` | `mxCell`: vertex or edge, with a style string and an XML user object |
| `pen.id` / `pen.tags` | `cell.id` / `tags` attribute (`Graph.getTagsForCell`) |
| Pen property (e.g. `background`, `text`, `rotate`, `progress`) | Style key (`fillColor`, `rotation`, `hmiLevel`…), label/attribute, or geometry |
| `Meta2dData.networks[]` | Document HMI config: `hmiSources` on the model root cell |
| `realTimes[]` + `bind` | Cell `hmiBindings` (JSON attribute) |
| `events[]` / `EventAction` | Cell `hmiEvents` (JSON attribute) plus action executor; reuses `Graph.executeCustomActions` for visual actions |
| `triggers[].status[]`, `realTimes[].triggers` | Cell `hmiTriggers` (JSON attribute) |
| `data.triggers`, `dataEvents` | Document `hmiTriggers` on the root cell |
| `frames[]`, `animations[]` | Cell `hmiAnimations` (JSON attribute) plus runtime animator |
| `lineAnimateType` | Extended edge flow animation: `flowAnimation` plus new `hmiFlow*` style keys |
| `progress` fill | `hmiLevel` style and render hook available to any shape |
| `socketCbJs` / `onBeforeValue` | Source parser script and binding transform expressions |
| `enableMock` / `mockValue` | Tag simulator |
| `locked >= 1` preview | HMI runtime mode (`?hmi=run` / lightbox) |
| `form-diagram`, `le5le-charts` | HMI widget library (`mxgraph.hmi.*`) |
| `roles[]` | Cell `hmiRoles`; runtime role filter |

### 2.3 User classes

| User class | Description | Primary needs |
|---|---|---|
| **Screen designer** (engineer / integrator) | Builds HMI screens in edit mode. | Widgets, binding editor, tag browser, simulator, validation. |
| **Operator** | Uses screens in runtime mode. | Clear live values, alarm visibility, safe command controls, navigation. |
| **Administrator** | Deploys the fork. | Configure allowed endpoints (CSP), credentials policy, script policy, branding. |
| **Integrator / developer** | Embeds the runtime in a host app. | postMessage API to push values, receive writes and switch mode. |

### 2.4 Operating environment

- Modern evergreen browsers (Chromium ≥ 120, Firefox ≥ 120, Safari ≥ 17), and draw.io Desktop (Electron) from the fork.
- Self-hosted static deployment of `src/main/webapp` (Docker or any HTTP server). app.diagrams.net is **not** a target, because its CSP does not allow arbitrary endpoints.
- Field connectivity through gateways that expose MQTT-over-WebSocket (for example Mosquitto, EMQX, HiveMQ), WebSocket JSON, REST or SSE. Examples: Node-RED, Kepware IoT Gateway, Ignition MQTT Transmission, Telegraf, a custom gateway.

### 2.5 Design and implementation constraints

- **C-1** The upstream project accepts no pull requests. The feature is developed in the softalink fork. To keep rebasing onto upstream releases cheap, code shall live in isolated new files where possible (`plugins/hmi/…`, `shapes/hmi/…`, `js/diagramly/sidebar/Sidebar-HMI.js`), and core edits shall be minimal and well-delimited.
- **C-2** The code must be Apache-2.0 compatible. Third-party libraries must use MIT, BSD or Apache licences (for example MQTT.js is MIT). No GPL or AGPL.
- **C-3** No draw.io trademark or logo in fork branding.
- **C-4** Source is ES5-style JavaScript in the draw.io idiom (prototype-based, `mxUtils`, no build-time transpilation). It is compiled by the Ant/Closure build (`etc/build/build.xml`) for production and loaded raw in `?dev=1`.
- **C-5** Runtime state must never enter the undo history, the saved file, drafts or realtime sync (see `docs/claude/realtime-sync.md`).
- **C-6** meta2d code may be ported (MIT) with attribution in `NOTICE` / file headers. In practice only algorithms (condition evaluation, mock generation, interpolation) are expected to be reused.

### 2.6 Assumptions and dependencies

- **A-1** Data payloads are JSON, or plain scalar strings or numbers for MQTT topics. Binary protocols need a user parser script (HMI-SRC-9).
- **A-2** Tag counts per screen are ≤ 5,000 and aggregate update rates ≤ 2,000 values/s (see §4).
- **A-3** Authentication to brokers and endpoints uses credentials the browser can present: username/password, bearer tokens, cookies or client-side query tokens. mTLS client certificates are browser-managed.

---

## 3. Functional requirements

### 3.1 Document HMI configuration (HMI-DOC)

| ID | Pri | Requirement |
|---|---|---|
| HMI-DOC-1 | M | The HMI configuration of a document (data sources, tag catalogue, document triggers, runtime options) shall be stored on the diagram's model root cell as the JSON attribute `hmi`, one per page. A file-level default may be stored in `<mxfile hmi="…">`. The page value overrides the file value per key. |
| HMI-DOC-2 | M | The HMI configuration shall carry a `version` field. Loading a newer major version shall show a warning and open the document read-only for HMI features. |
| HMI-DOC-3 | M | A document without HMI configuration shall behave exactly as in stock draw.io. No HMI code path may alter rendering, export or file content for such documents. |
| HMI-DOC-4 | M | HMI configuration and per-cell HMI attributes shall survive save and load, copy and paste, page duplication, library export ("Add to scratchpad" / custom libraries) and the undo/redo of the edits that change them. |
| HMI-DOC-5 | S | Secrets (passwords, tokens) in source configuration shall not be saved by default. The designer chooses per credential between "prompt at runtime", "read from `${param}`" (URL, localStorage or global) and "save in file (insecure)", and the UI shall warn about the last option. meta2d ref: `getDynamicParam`. |
| HMI-DOC-6 | S | The document shall be able to declare **screen variables**: local tags not bound to any source, with initial values, usable by bindings and writable by actions. |

### 3.2 Data sources (HMI-SRC)

| ID | Pri | Requirement |
|---|---|---|
| HMI-SRC-1 | M | The designer shall be able to create, edit, enable, disable and delete data sources in a **Data Sources** dialog. Each source has a name, a protocol, protocol settings and an enabled flag. meta2d ref: `Network`. |
| HMI-SRC-2 | M | **MQTT over WebSocket (ws/wss).** Settings: broker URL, client ID (default: random with prefix), username, password, clean session, keep-alive, MQTT version (3.1.1/5), subscribed topic filters (wildcards `+` and `#`), and QoS per subscription. Publishing is covered in HMI-WRT. meta2d ref: `connectNetMqtt`. |
| HMI-SRC-3 | M | **WebSocket.** Settings: URL, sub-protocols, an optional message sent after connect (subscription handshake), and heartbeat (message plus interval). meta2d ref: `connectNetWebSocket`. |
| HMI-SRC-4 | M | **HTTP polling.** Settings: URL, method (GET/POST), headers, body, interval (ms, minimum 250), `withCredentials`, "run once", and "skip first request". Overlapping requests shall be prevented, so a new poll is not issued while one is outstanding. meta2d ref: `requestHttp`, `onNetworkConnect`. |
| HMI-SRC-5 | S | **Server-Sent Events.** Settings: URL, `withCredentials`, and event names to listen to (default `message`). meta2d ref: `connectSSE`. |
| HMI-SRC-6 | M | **Reconnection.** Sources shall reconnect automatically with exponential backoff (initial 1 s, maximum 30 s, with jitter) and an optional maximum number of attempts (meta2d ref: `reconnetTimes`). Connection state shall be one of `disconnected`, `connecting`, `connected`, `error`. |
| HMI-SRC-7 | M | **Payload mapping, built-in formats.** Each source shall map incoming messages to tag updates using one of these formats: |
| | | (a) **Flat object**: `{"TagA": 1, "TagB": "on"}`. Each key is a tag name. |
| | | (b) **Array of updates**: `[{"tag"\|"id"\|"dataId": "...", "value": ..., "ts"?: ..., "quality"?: ...}]`. |
| | | (c) **Topic-as-tag** (MQTT): the topic, or a template such as `plant/{area}/{tag}`, gives the tag name, and the payload gives the value (scalar or JSON). |
| | | (d) **JSONPath mapping**: a list of `{tag, path}` pairs evaluated against the payload. |
| | | meta2d ref: `socketCallback` dispatch. |
| HMI-SRC-8 | M | **Tag name prefix.** A source may set a prefix (for example `plant1/`) that is prepended to every tag it produces, to avoid name clashes. |
| HMI-SRC-9 | S | **Parser script.** A source may define a parser script `(message, context) → updates \| false`. `context` = `{source, topic, url}`. Returning `false` drops the message. The script is subject to the script policy (HMI-SEC-2). meta2d ref: `socketCbJs`. |
| HMI-SRC-10 | S | **Pre-connect script.** A source may define an async pre-connect script that can rewrite the source's URL, headers or credentials, for example to fetch a token. meta2d ref: `preJs`. |
| HMI-SRC-11 | M | **Runtime-only connections.** Connections shall be opened only in runtime mode or while "Live preview" is on in edit mode (HMI-RUN-6). They shall close on leaving that mode, on closing the file and on page unload. |
| HMI-SRC-12 | M | **Status indicator.** The runtime shall show the connection status per source, both in a status indicator and in the diagnostics panel. |
| HMI-SRC-13 | S | **Built-in source variables.** URLs, headers and bodies may contain `${var}` references, resolved from screen variables, URL parameters, localStorage and `DRAWIO_CONFIG.hmi.params`. meta2d ref: `getDynamicParam`. |
| HMI-SRC-14 | C | **Host (embed) source.** A source of type `host` receives values only through the postMessage API (HMI-EMB-1). |

### 3.3 Tags (HMI-TAG)

| ID | Pri | Requirement |
|---|---|---|
| HMI-TAG-1 | M | The runtime shall keep a **Tag Store**: a map from tag name to `{value, quality: good\|bad\|uncertain\|stale, ts, source}`. It is held only in memory. |
| HMI-TAG-2 | M | The document may declare a **tag catalogue**. Each entry has a name, data type (`number\|integer\|boolean\|string\|object`), unit, description, engineering range (min/max), number format (decimals, or a pattern such as `0.0`), write permission (read / read-write), a write target, and simulation settings. Tags used in bindings but not declared shall still work, with type inferred from the values received. |
| HMI-TAG-3 | M | Incoming values shall be coerced to the declared type. Values that fail coercion shall set quality `bad` and keep the last good value. |
| HMI-TAG-4 | S | **Stale detection.** A tag may declare a stale timeout. If no update arrives within it, quality becomes `stale`. |
| HMI-TAG-5 | M | **Tag browser.** A Tag Browser panel shall list catalogue tags and all tags seen at runtime (with live value, quality and timestamp in live preview), support search, and support drag-and-drop of a tag onto a cell to create a default binding. |
| HMI-TAG-6 | S | **Import and export.** The tag catalogue shall be importable from and exportable to CSV and JSON. |
| HMI-TAG-7 | S | **Derived tags.** The designer may define a derived tag as an expression over other tags (for example `(T1 + T2) / 2`), re-evaluated when any input changes. |

### 3.4 Bindings (HMI-BND)

| ID | Pri | Requirement |
|---|---|---|
| HMI-BND-1 | M | Each cell may have a list of **bindings**, stored as the JSON attribute `hmiBindings` on the cell's user object. Each binding has `{tag \| expr, target, transform?, format?}`. meta2d ref: `realTimes[]`. |
| HMI-BND-2 | M | **Binding targets.** A binding target shall be one of: |
| | | (a) `label`: the cell text. |
| | | (b) `attr:<name>`: a user-object attribute, which makes `%name%` placeholders update. |
| | | (c) `style:<key>`: any style key, such as `fillColor`, `strokeColor`, `fontColor`, `opacity`, `rotation`, `hmiLevel`, or `flowAnimation`. |
| | | (d) `geo:x\|y\|width\|height`: a geometry offset relative to the design value. |
| | | (e) `visible`. |
| | | (f) `tooltip`. |
| | | (g) `prop:<name>`: a widget-specific runtime property, for example a gauge value or chart series. |
| HMI-BND-3 | M | **Transforms.** A binding may transform the value in one of these ways: |
| | | (a) **Linear scaling** (in-min, in-max → out-min, out-max, with a clamp option). |
| | | (b) **Value map**: discrete value or range → output, for example `0 → "#888"`, `1 → "#0a0"`, `[80,100] → "red"`. Uses the same comparison operators as HMI-TRG-3. |
| | | (c) **Boolean invert**. |
| | | (d) **Expression**: a safe expression language with arithmetic, comparison, logical and ternary operators, string concatenation and the functions `min max abs round floor ceil clamp fmt`. It may reference `value` and other tags as `tag("name")`. |
| | | (e) **Script** (subject to HMI-SEC-2). |
| HMI-BND-4 | M | **Formatting.** Label and text bindings shall support number formatting: decimals, thousands separators, and unit suffix from the tag catalogue. meta2d ref: `keepDecimal`. |
| HMI-BND-5 | M | **Placeholder syntax.** A placeholder syntax `%tag:<name>%` (with an optional format `%tag:<name>\|0.0%`) shall resolve to the current formatted tag value inside labels and tooltips of cells with `placeholders="1"`. In edit mode, when live preview is off, it resolves to the tag's simulated or default value, or to `--`. |
| HMI-BND-6 | M | **Bad-quality display.** When a bound tag has quality `bad` or `stale`, the cell shall show a configurable indication. The default is a dashed grey outline plus a quality badge. The document may configure this globally. |
| HMI-BND-7 | M | **Isolation from the model.** Applying bindings shall not create undoable edits, shall not set the file's modified flag, and shall not be persisted. When runtime mode ends, all cells shall show their design-time appearance again. |
| HMI-BND-8 | M | **Binding editor.** The Format panel shall provide an **HMI** tab for the selected cell(s) that lists bindings, events, triggers and animations, with add, edit, delete and reorder. Tag fields shall autocomplete from the tag catalogue. |
| HMI-BND-9 | S | **Multi-selection editing.** With several cells selected, the designer shall be able to apply a binding template to all of them, with tag-name substitution such as `{name}` taken from a cell attribute. |
| HMI-BND-10 | S | **Group-level bindings.** Bindings on a group or container shall be able to target descendant cells by relative path or by tag (`targetCells: {tags: [...]}`). |
| HMI-BND-11 | S | **Parameterised tags.** Tag names in bindings may contain `%attr%` placeholders resolved from the cell's or its ancestors' attributes, so a reusable symbol such as a "Pump" group can be instantiated per device. meta2d ref: `${var}` in JetLinks bind ids. |

### 3.5 Events and actions (HMI-EVT)

| ID | Pri | Requirement |
|---|---|---|
| HMI-EVT-1 | M | Each cell may have **event handlers** (`hmiEvents` JSON attribute). Each handler has `{on, conditions?, conditionType: and\|or, actions[], confirm?, delay?}`. meta2d ref: `Event`. |
| HMI-EVT-2 | M | **Supported events:** `click`, `dblclick`, `mousedown`, `mouseup`, `enter`, `leave`, `valueChange` (when any bound tag changes), `pageOpen`, `pageClose`, and `message` (a named message from HMI-ACT `emit`). S priority: `contextmenu`, `longpress`, `input` / `change` for input widgets. |
| HMI-EVT-3 | M | Handlers shall run only in runtime mode, or in edit mode with "Live preview" and "Interactive" enabled. Events on disabled or hidden cells shall be ignored. Events not handled by a cell shall bubble to its parent group. |
| HMI-EVT-4 | M | **Confirmation.** A handler with `confirm` shall show a confirmation dialog with a configurable title and text before running its actions. This is required for any action that writes to a device unless explicitly disabled. |
| HMI-EVT-5 | M | **Actions.** The following actions shall be supported. meta2d ref: `EventAction` enum. |
| | | **setProps** (M): apply style, attribute, label or visibility changes to targets (`self`, cell ids, tags, layers). Transient by default; see HMI-EVT-7. |
| | | **writeTag** (M): write a value to a tag. The value may be a constant, an expression, a prompt dialog, or the widget's input value. Routed to the tag's write target (HMI-WRT). |
| | | **toggleTag** (M): invert a boolean tag. |
| | | **pulseTag** (S): write a value, then write a reset value after N ms. |
| | | **navigate** (M): go to another page by id or name, or to another file by URL. meta2d ref: `Navigator`. |
| | | **openUrl** (M): open a URL in a new or the same window, with `${}` substitution. meta2d ref: `Link`. |
| | | **dialog** (M): open a popup, either another page rendered as a faceplate or an iframe URL. meta2d ref: `Dialog`. |
| | | **startAnimation / pauseAnimation / stopAnimation** (M): on target cells, by animation name. |
| | | **playMedia** (C): play, pause or stop video or audio cells. |
| | | **emit** (M): raise a named message event with a payload, received by `message` handlers. |
| | | **send** (S): publish an arbitrary payload to a source (an MQTT topic, a WebSocket message, or an HTTP request with an optional response callback). meta2d ref: `SendData`. |
| | | **notify** (S): show a toast message. meta2d ref: `Message`. |
| | | **postMessage** (S): send a message to the parent window or to an iframe cell. |
| | | **script** (S): run a user script with `(cell, value, hmi)`, subject to HMI-SEC-2. meta2d ref: `JS`. |
| | | **drawioAction** (M): run any existing draw.io custom-link action (`show`, `hide`, `toggle`, `highlight`, `fadeIn`, `flow`, …) through `Graph.executeCustomActions`. |
| HMI-EVT-6 | M | Actions in a handler run sequentially. An action may declare `delay` (ms). A failing action shall be logged in diagnostics and shall not stop the following actions unless `stopOnError` is set. |
| HMI-EVT-7 | M | Actions shall not modify the saved diagram. `setProps` in runtime mode is transient and discarded when runtime ends. |
| HMI-EVT-8 | S | Existing `data:action/json` links shall remain functional in runtime mode and may reference HMI actions by `{"hmi": {...}}` entries. |

### 3.6 Triggers and state machines (HMI-TRG)

| ID | Pri | Requirement |
|---|---|---|
| HMI-TRG-1 | M | Each cell may have **triggers** (`hmiTriggers`), evaluated whenever a tag referenced in their conditions changes. meta2d ref: `triggers`, `realTimes[].triggers`. |
| HMI-TRG-2 | M | **Trigger forms.** A trigger shall be either: |
| | | (a) **Simple**: `{conditions, conditionType, actions, elseActions?}`. The actions run on the transition to true; `elseActions` run on the transition to false. |
| | | (b) **State machine**: `{states: [{name, conditions, conditionType, actions}]}`. States are evaluated in order, and the first state whose conditions match is entered. Actions run only on entering a state, not on every update. meta2d ref: `triggers[].status[]` (first match, then break). |
| HMI-TRG-3 | M | **Condition operands and operators.** A condition has `{tag \| expr, operator, value \| valueTag}`. Operators: `== != > < >= <=`, `in range [a,b)`, `not in range`, `in set`, `not in set` (with `a..b` range items), `changed`, `isBad`. meta2d ref: `Comparison`, `judgeCondition`, `valueInRange`, `valueInArray`. |
| HMI-TRG-4 | M | **Document-level triggers.** Triggers stored in the document config, not attached to a cell, shall be supported for page-wide logic such as "when E-stop is on, show the banner layer". meta2d ref: `data.triggers`, `dataEvents`. |
| HMI-TRG-5 | M | **Initial evaluation.** On runtime start, all triggers shall be evaluated once against the initial tag values after the first data arrives, or after a configurable timeout, so screens open in the correct state. |
| HMI-TRG-6 | S | **Hysteresis and debounce.** A trigger may declare a deadband (numeric hysteresis) and an on-delay/off-delay (ms). |

### 3.7 Alarms (HMI-ALM)

| ID | Pri | Requirement |
|---|---|---|
| HMI-ALM-1 | S | **Alarm definitions.** A tag in the catalogue may declare alarm limits (LoLo, Lo, Hi, HiHi, or a boolean alarm state) with a severity (1–4), a message and a deadband. |
| HMI-ALM-2 | S | **Alarm state and list.** Active alarms shall be tracked in a session-local alarm list with the states active-unacknowledged, active-acknowledged and cleared-unacknowledged. An **Alarm Banner** widget and an **Alarm List** widget shall display them. The operator can acknowledge individually or all at once. |
| HMI-ALM-3 | S | **Alarm-state indication.** Cells bound to an alarmed tag may use the built-in style preset `hmiAlarmIndicator=1`, which applies severity colour plus blinking while an alarm is unacknowledged. |
| HMI-ALM-4 | C | **Audible alarms.** An optional audible alarm per severity, subject to browser autoplay rules. The operator must interact once to enable sound. meta2d ref: JetLinks `playMp3`. |
| HMI-ALM-5 | C | **External acknowledgement.** Acknowledgements may be published to a source (for example an MQTT topic) for external persistence. |

### 3.8 Animation (HMI-ANI)

| ID | Pri | Requirement |
|---|---|---|
| HMI-ANI-1 | M | **Named animations.** Each cell may define named animations (`hmiAnimations`), each with `autoPlay`, `cycles` (0 means infinite), `duration`, `easing`, `keepState`, and a keyframe list. Each keyframe is `{duration, props}`, where `props` may include `rotation`, `opacity`, `fillColor`, `strokeColor`, `fontColor`, offsets `dx`/`dy`, `scale`, `visible` and `hmiLevel`. meta2d ref: `frames[]`, `animations[]`, `animateCycle`, `keepAnimateState`, `nextAnimate`. |
| HMI-ANI-2 | M | **Built-in presets.** These presets shall be available: `blink` (on/off at a configurable rate), `pulse`, `spin` (continuous rotation at an RPM value, for pumps, fans and agitators), `shake`, `colorCycle` and `fadeInOut`. The spin rate may be bound to a tag. |
| HMI-ANI-3 | M | **Edge flow animation.** The existing edge `flowAnimation` shall be extended with these runtime-controllable properties: |
| | | (a) direction, reversible by binding. |
| | | (b) speed (duration bound to a tag). |
| | | (c) type: `dash` (existing), `dots`/`beads`, `arrows`, or `liquid` (a wide soft stroke within a pipe). |
| | | (d) colour and width. |
| | | (e) on/off, by binding. |
| | | meta2d ref: `LineAnimateType` (Normal, Beads, Dot, Arrow, WaterDrop), `animateSpan`, `animateReverse`, `animateColor`. |
| HMI-ANI-4 | M | **Level fill.** Any vertex shape shall support a **level fill**: the style keys `hmiLevel` (0–100, or a value within `hmiLevelMin`/`hmiLevelMax`), `hmiLevelColor`, `hmiLevelDirection` (up, down, left or right) and `hmiLevelGradient`. The fill is clipped to the shape's outline. This covers tanks, bars and vessels, including P&ID vessel stencils. meta2d ref: `progress`, `progressColor`, `verticalProgress`, `reverseProgress`. |
| HMI-ANI-5 | M | **Pause and cost when off-screen.** Animations shall pause when the browser tab is hidden. They should be skipped for cells outside the viewport. |
| HMI-ANI-6 | M | **Transience.** Animations shall be transient: they shall not modify the model, and stopping an animation shall restore the design state unless `keepState` is set. |
| HMI-ANI-7 | S | **Chaining.** Animation completion shall raise an `animationEnd` event on the cell, and an animation may name a `next` animation or target (chaining). |
| HMI-ANI-8 | S | **Reduced motion.** When the browser reports `prefers-reduced-motion`, blink animations shall fall back to a static high-contrast indication. |

### 3.9 HMI widget library (HMI-WGT)

All widgets shall be draw.io shapes (`mxShape` subclasses or stencils) under the style namespace `mxgraph.hmi.*`. They shall appear in a new **HMI** sidebar palette ("More Shapes → HMI / SCADA"), expose their options through `customProperties` in the Format panel, render correctly in edit mode with design-time sample values, and export to SVG, PNG and PDF showing their current or design value.

| ID | Pri | Widget | Key properties (style or runtime) | meta2d ref |
|---|---|---|---|---|
| HMI-WGT-1 | M | Numeric display / value label | value, format, unit, alignment, quality indication | text with `keepDecimal` |
| HMI-WGT-2 | M | Radial gauge | value, min, max, start/end angle, major/minor ticks, colour bands (ranges), needle style, unit, label | le5le-charts `gauge` |
| HMI-WGT-3 | M | Linear gauge / bar (horizontal and vertical) | value, min, max, bands, ticks, orientation | `progress` |
| HMI-WGT-4 | M | Tank / vessel | level (0–100 or min–max), liquid colour, scale, shapes (vertical/horizontal cylinder, cone-bottom, sphere) | `progress` |
| HMI-WGT-5 | M | Indicator lamp / LED | state (bool or enum), on/off/fault colours, blink on state | `switch`/`checked` |
| HMI-WGT-6 | M | Toggle switch | checked (bound tag), on/off colours, disabled; click performs `toggleTag` with confirmation | form-diagram `switch` |
| HMI-WGT-7 | M | Push button | label, colours per state, `momentary` (write on press and release) or `latched`; events | `button` (commercial) |
| HMI-WGT-8 | M | Slider / set-point | value, min, max, step, unit; writes on release (configurable: continuous with rate limit) | form-diagram `slider` |
| HMI-WGT-9 | M | Numeric / text input | value, type, min, max, keyboard entry; writes on Enter | `input`, `inputDom` |
| HMI-WGT-10 | S | Dropdown / multi-state selector | options `[{label, value}]`, writes selected value | `dropdownList` |
| HMI-WGT-11 | M | Trend chart (line) | series bound to tags, time window (e.g. 5 min), max points, y-axis range or auto, legend; rolling in-memory buffer | le5le-charts `lineChart`, ECharts |
| HMI-WGT-12 | S | Bar / pie chart | series bound to tags | `histogram`, `pieChart` |
| HMI-WGT-13 | S | Data table | columns, rows bound to an object/array tag, striping, auto-scroll | form-diagram `table2` |
| HMI-WGT-14 | S | Alarm banner and alarm list | filter by severity/area, ack buttons | none |
| HMI-WGT-15 | M | Animated equipment symbols | pump, fan, motor, agitator, valve (open/closed/transit/fault states), conveyor. Built on existing P&ID stencils where possible and made state-aware (`hmiState` style → colour/rotation) | P&ID + `frames` |
| HMI-WGT-16 | M | Pipe | edge style preset with thickness, 3D shading option and flow animation (HMI-ANI-3) | `lineAnimateType` |
| HMI-WGT-17 | S | Clock / date-time display | format string, time zone | form-diagram `time` |
| HMI-WGT-18 | S | Connection status indicator | bound to a source, shows state | none |
| HMI-WGT-19 | C | Embedded web content (iframe) and video stream | URL (with `${}`), refresh; runtime only. Subject to HMI-SEC-4 | `iframe`, `video` |
| HMI-WGT-20 | C | ECharts widget | full ECharts option JSON with bound series. The library is loaded lazily | chart-diagram `echarts` |

Additional widget requirements:
- **HMI-WGT-21 (M)** Every widget exposing a "value" shall accept it both from a binding (`prop:value`) and as a static design value (for mock-ups).
- **HMI-WGT-22 (M)** Interactive widgets (switch, button, slider, input, dropdown) shall be keyboard-operable in runtime mode (focusable, Enter/Space activate, arrows adjust sliders) and shall expose ARIA roles and labels.
- **HMI-WGT-23 (S)** Widgets shall respect draw.io dark mode and sketch mode. Where sketch rendering is not meaningful (charts), it shall degrade gracefully.

### 3.10 Writes and commands (HMI-WRT)

| ID | Pri | Requirement |
|---|---|---|
| HMI-WRT-1 | M | **Write targets.** A tag may declare a **write target**. For MQTT: a topic plus a payload template (default `{"value": ${value}}`), QoS and retain. For WebSocket: a message template. For HTTP: method, URL, headers and a body template. For a screen variable: the local store only. meta2d ref: `doSendDataEvent`, `sendDataToNetWork`. |
| HMI-WRT-2 | M | **Write access control.** Writes shall be refused (with an operator-visible message) when the tag is read-only, the runtime is in view-only mode, the value fails type or range validation, or the user lacks the required role (HMI-SEC-5). |
| HMI-WRT-3 | S | **Write feedback.** A write may be optimistic (update the tag locally at once, then revert if no confirming value arrives within a timeout) or confirmed (wait for the value from the source). The default is confirmed, with a pending indicator on the widget. |
| HMI-WRT-4 | M | **Write audit.** All writes shall be logged in the runtime diagnostics log with timestamp, tag, value, cell and outcome. |

### 3.11 Runtime mode (HMI-RUN)

| ID | Pri | Requirement |
|---|---|---|
| HMI-RUN-1 | M | **Starting runtime.** The runtime can be started in three ways: |
| | | (a) From the editor with a **Run** action (menu Extras/HMI → Run, toolbar button, shortcut). It opens the current file in a runtime view in a new window or tab. |
| | | (b) With the URL `?hmi=run` together with any draw.io file-loading parameter (`#U…`, `#G…`, local file, etc.). |
| | | (c) Through the embed API (HMI-EMB). |
| HMI-RUN-2 | M | **Locked view.** Runtime mode shall be a locked, chromeless view based on draw.io's lightbox/chromeless mode: no editing, no selection handles, and no format panel or sidebar. Pan and zoom are configurable: allowed, disabled or fit-only. meta2d ref: `LockState`. |
| HMI-RUN-3 | M | **Runtime chrome.** Runtime mode shall provide page navigation: tabs or a hidden menu, configurable per document, and able to be driven purely by `navigate` actions. It shall also provide fullscreen, the connection status indicator, the alarm banner (if configured) and a diagnostics panel reachable by a shortcut. |
| HMI-RUN-4 | M | **Page switching.** On a page switch, bindings, triggers and animations of the old page shall be torn down and those of the new page set up. Data sources defined at file level stay connected across pages. Sources defined at page level connect and disconnect with their page. |
| HMI-RUN-5 | M | **Fit and scaling.** Runtime shall support fit modes `none`, `fit page`, `fit width` and `stretch`, plus the screen resolution declared by the designer (for example 1920×1080). The layout shall stay correct on resize. meta2d ref: `fitView`, `fits`. |
| HMI-RUN-6 | M | **Live preview in the editor.** The editor shall offer **Live preview**, a toggle that connects sources (or the simulator) and applies bindings and animations transiently while editing continues. With **Interactive** off, which is the default, events do not fire. Editing a cell while live preview is on shall show its design state until the edit finishes. |
| HMI-RUN-7 | M | **Leaving runtime cleanly.** Leaving runtime or live preview shall restore every cell to its exact design-time rendering. The file shall not be marked modified. |
| HMI-RUN-8 | S | **Kiosk options.** Runtime shall support URL options for kiosk use: `hmi-page=<id>`, `hmi-fit=…`, `hmi-hide-nav=1`, `hmi-role=…`, and `hmi-reload=<minutes>` (a periodic reload to recover from leaks). |
| HMI-RUN-9 | C | **Standalone viewer.** A standalone viewer bundle (`hmi-viewer.min.js`, built from `viewer.min.js` plus the HMI runtime) shall render HMI screens in third-party pages through `data-mxgraph` embeds, with `"hmi": {...}` config. |

### 3.12 Simulation (HMI-SIM)

| ID | Pri | Requirement |
|---|---|---|
| HMI-SIM-1 | M | **Simulation settings.** Each tag in the catalogue may define simulation: `random` (min–max, integer or float), `sine` (min, max, period), `ramp` (min, max, step), `list` (cycle through values), `toggle` (period), `constant`, or `script` (S). meta2d ref: `mockValue` (range `"a-b"`, list `"a,b,c"`, bool, `[len]`). |
| HMI-SIM-2 | M | **Simulation modes.** The document shall have a simulation mode: `off`, `on` (simulated tags only; real sources connected), or `only` (no real connections). Live preview defaults to `only` when no source is reachable. meta2d ref: `enableMock`, `startDataMock`. |
| HMI-SIM-3 | M | **Manual override.** The Tag Browser shall allow a manual value override for any tag during live preview, for testing triggers. |
| HMI-SIM-4 | S | **Writes under simulation.** Writes to a simulated tag shall update the simulated value. |

### 3.13 Embedding and integration API (HMI-EMB)

| ID | Pri | Requirement |
|---|---|---|
| HMI-EMB-1 | M | The embed postMessage protocol (`proto=json`) shall be extended with these messages. |
| | | **Host → draw.io:** |
| | | • `{action: "hmiSetValues", values: {tag: value, ...} \| [{tag, value, ts, quality}]}` |
| | | • `{action: "hmiRun"}`, `{action: "hmiStop"}` |
| | | • `{action: "hmiNavigate", page}` |
| | | • `{action: "hmiGetTags"}` |
| | | **draw.io → host:** |
| | | • `{event: "hmiWrite", tag, value, cell}`, sent when a write targets a `host` source or when `hmi.forwardWrites` is on |
| | | • `{event: "hmiEvent", name, payload}`, sent by `emit` actions |
| | | • `{event: "hmiStatus", sources}` |
| | | • `{event: "hmiTags", tags}` |
| HMI-EMB-2 | M | The existing security rule shall be kept: only messages from `window.parent` or `window.opener` are accepted. |
| HMI-EMB-3 | S | A JavaScript API shall be available on the `EditorUi` instance, `ui.hmi` (`setValues`, `getValue`, `subscribe`, `run`, `stop`, `write`), for plugins and desktop integrations. |

### 3.14 Import and interoperability (HMI-IMP)

| ID | Pri | Requirement |
|---|---|---|
| HMI-IMP-1 | C | **meta2d JSON import.** A meta2d JSON importer (`Meta2dData`) shall convert: |
| | | • pens of common shapes, lines, text and images to cells |
| | | • `networks` to sources |
| | | • `realTimes` to bindings |
| | | • `events` and `triggers` to handlers and triggers |
| | | • `frames` to animations |
| | | Unsupported features shall be reported. |
| HMI-IMP-2 | S | **Legacy `update.js` compatibility.** The plugin's `updateUrl` / `<updates>` protocol shall be supported as an HTTP source format ("draw.io update XML"). |
| HMI-IMP-3 | S | **Screen export.** An HMI screen shall be exportable as a self-contained HTML file: the runtime viewer bundle plus the diagram. |

### 3.15 Diagnostics (HMI-DIA)

| ID | Pri | Requirement |
|---|---|---|
| HMI-DIA-1 | M | **Diagnostics panel.** A diagnostics panel shall show source states with counters (messages received, errors, last message time), recent raw messages per source (ring buffer, 100 entries, redacted secrets), tag updates per second, the write log, script errors, and binding errors (unknown tag, transform failure). |
| HMI-DIA-2 | M | **Validator.** An **HMI → Validate** command in edit mode shall report bindings to undeclared tags, events targeting missing cells or pages, write actions on read-only tags, sources without any subscribed topics, and scripts present while the script policy is `off`. |

---

## 4. Non-functional requirements

### 4.1 Performance (HMI-PERF)

| ID | Pri | Requirement |
|---|---|---|
| HMI-PERF-1 | M | End-to-end latency from message receipt to visible update shall be ≤ 100 ms at the 95th percentile, for a screen of 500 bound cells receiving 200 updates/s, on a mid-range laptop (4-core, 2020+). |
| HMI-PERF-2 | M | Updates shall be **coalesced**: at most one visual update per cell per animation frame, and one render pass per frame. meta2d ref: throttled `render(true)`, `batchRendering`. |
| HMI-PERF-3 | M | Runtime updates shall avoid model changes. Only the affected cell states shall be re-rendered. Full `graph.refresh()` is not allowed on the update path. |
| HMI-PERF-4 | M | A screen with 2,000 bound cells and 1,000 updates/s shall stay interactive, with a main-thread busy time below 50%, and shall not leak memory. Heap growth shall be < 10 MB/hour over a 24-hour soak run. |
| HMI-PERF-5 | S | The maximum global UI update rate shall be configurable (default 30 Hz), matching meta2d `options.interval`. |
| HMI-PERF-6 | M | The HMI plugin shall add less than 150 KB (minified, gzip) to initial load. MQTT.js and the chart library shall be loaded lazily, only when needed. |

### 4.2 Reliability (HMI-REL)

| ID | Pri | Requirement |
|---|---|---|
| HMI-REL-1 | M | Failure of one source shall not affect others. Script errors shall be contained per invocation. |
| HMI-REL-2 | M | Runtime shall survive network loss and resume without a reload, restoring bound values once data returns. |
| HMI-REL-3 | M | A runtime session shall run 7 × 24 without degradation (soak test in §7). |

### 4.3 Security (HMI-SEC)

| ID | Pri | Requirement |
|---|---|---|
| HMI-SEC-1 | M | **Endpoint allow-list.** The deployment shall be able to restrict connectable endpoints through `DRAWIO_CONFIG.hmi.allowedEndpoints` (URL prefixes or patterns). The CSP `connect-src` shall be configurable to match. Endpoints outside the allow-list shall be refused with a clear error. |
| HMI-SEC-2 | M | **Script policy.** User scripts (parsers, transforms, actions) are controlled by `DRAWIO_CONFIG.hmi.scripts`: |
| | | • `off`: the default for files from untrusted sources. |
| | | • `prompt`: ask once per file, remembered by file hash. |
| | | • `on`: allowed. |
| | | Scripts shall run in a sandbox (a sandboxed iframe or a Web Worker) with access only to the documented `hmi` API, and with no access to the draw.io DOM, storage or credentials. They shall be time-limited (default 50 ms per call). meta2d ref: `makeSafeFn`, `options.allowScript`. |
| HMI-SEC-3 | M | **Expressions.** The expression language (HMI-BND-3d) shall be interpreted by a purpose-built parser. It shall not use `eval` or `new Function`. |
| HMI-SEC-4 | M | **Sanitisation.** Tag values rendered into labels shall be escaped: HTML labels shall be sanitised through `Graph.sanitizeHtml`. URLs from bindings or actions shall pass `Graph.sanitizeLink`. Iframe widgets shall use `sandbox` attributes. |
| HMI-SEC-5 | S | **Roles.** Cells, events and write actions may declare required roles (`hmiRoles`). The runtime user's roles come from `DRAWIO_CONFIG.hmi.roles`, the embed API, or a token claim. Unauthorised cells may be hidden or disabled, and unauthorised writes are refused. meta2d ref: `pen.roles`, `hasPermission`. Note: this is presentation-level control only. Enforcement must happen at the broker or gateway, and the documentation shall say so. |
| HMI-SEC-6 | M | **Credentials.** Credentials shall never be written to diagnostics logs, exports or postMessage events. |
| HMI-SEC-7 | M | **Untrusted files.** Opening a file from an untrusted location shall not auto-connect to its sources in the editor. Runtime requires an explicit Run, or `?hmi=run` on a deployment that allow-lists that file location. |

### 4.4 Usability and accessibility (HMI-USA)

| ID | Pri | Requirement |
|---|---|---|
| HMI-USA-1 | M | All new dialogs shall follow `docs/dialog-style-guide.md`. All new strings shall be in `resources/dia.txt` for translation. |
| HMI-USA-2 | M | Status shall not be conveyed by colour alone. Alarm and quality states shall also use shape, icon or text. |
| HMI-USA-3 | S | Runtime text shall meet WCAG 2.1 AA contrast in the default HMI theme. An "ISA-101 high-performance" theme preset (grey background, colour only for abnormal states) shall be provided. |
| HMI-USA-4 | S | A designer familiar with draw.io shall be able to bind a tank level to a simulated tag and run it in under 3 minutes without documentation. This is validated in usability tests. |

### 4.5 Compatibility and maintainability (HMI-MNT)

| ID | Pri | Requirement |
|---|---|---|
| HMI-MNT-1 | M | Files with HMI content shall open in stock draw.io without errors, showing the design-time appearance. HMI widgets shall degrade to a static representation there, because unknown shapes render as rectangles. The widget library should therefore be implementable as stencils where feasible. |
| HMI-MNT-2 | M | Core file changes shall be limited to the hook points listed in the implementation plan, each marked `// HMI:` for rebase visibility. |
| HMI-MNT-3 | M | The fork shall rebase onto each upstream draw.io release within one sprint. Automated tests shall detect hook breakage. |
| HMI-MNT-4 | S | Code shall have unit tests for the tag store, condition evaluation, expression language, transforms, payload mapping and simulator (≥ 85% line coverage for these modules), and end-to-end tests for runtime flows. |

### 4.6 Portability (HMI-PRT)

| ID | Pri | Requirement |
|---|---|---|
| HMI-PRT-1 | M | The feature shall work in the web app, the self-hosted Docker image, and the Electron desktop build of the fork. Desktop requires a relaxed CSP for configured endpoints. |
| HMI-PRT-2 | S | Runtime mode shall be usable on tablets (touch events map to click; long press maps to context menu). |

---

## 5. System architecture overview (informative)

### 5.1 Components

```
┌──────────────────────── draw.io App (EditorUi) ─────────────────────────┐
│  Editor-time UI                             Runtime                     │
│  ┌──────────────┐ ┌───────────────┐        ┌─────────────────────────┐  │
│  │ HMI Format   │ │ Data Sources  │        │ HmiRuntime              │  │
│  │ tab (bind/   │ │ dialog, Tag   │        │  ├ SourceManager ──────►│──┼─► MQTT/WS/HTTP/SSE
│  │ events/anim) │ │ Browser, Sim  │        │  │   (Mqtt/Ws/Http/Sse)  │  │
│  └──────┬───────┘ └──────┬────────┘        │  ├ TagStore (values,Q,T) │  │
│         │ JSON attrs     │ root `hmi` attr │  ├ BindingEngine         │  │
│         ▼                ▼                 │  ├ TriggerEngine         │  │
│  ┌──────────────────────────────────┐      │  ├ EventDispatcher       │  │
│  │ mxGraphModel (persisted XML)     │◄─────┤  ├ ActionExecutor ──► Graph.executeCustomActions
│  └──────────────────────────────────┘ read │  ├ Animator (rAF)        │  │
│                                            │  ├ OverlayRenderer ─────►│──┼─► transient cell-state styles / SVG
│  Widgets: mxgraph.hmi.* shapes (Shapes)    │  └ Diagnostics / Alarms  │  │
│  Sidebar-HMI palette                       └─────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Key design principle: overlay, not mutation

Runtime values are held in the `TagStore` and the per-cell **runtime overlay**, a map from cell id to a partial style, a label or a widget property set. The overlay is merged into the cell's computed state at render time (a `Graph.postProcessCellStyle` hook and a `getLabel` hook), and only the affected cell states are invalidated. The mxGraph model is never changed by runtime data. This satisfies HMI-BND-7, HMI-EVT-7, C-5 and HMI-PERF-3.

---

## 6. Other requirements

### 6.1 Persistence format (informative example)

```xml
<mxGraphModel>
  <root>
    <object id="0" hmi='{"version":1,"sources":[{"id":"s1","name":"Broker","type":"mqtt","url":"wss://broker.local:8884/mqtt","topics":[{"filter":"plant/#","qos":0}],"format":{"kind":"topic","template":"plant/{tag}"}}],"tags":[{"name":"T101/Level","type":"number","unit":"%","min":0,"max":100,"sim":{"kind":"sine","min":10,"max":90,"period":30000}}],"sim":"off"}'/>
    <mxCell id="1" parent="0"/>
    <object id="tank1" label="%tag:T101/Level|0.0% %" placeholders="1"
            hmiBindings='[{"tag":"T101/Level","target":"style:hmiLevel"}]'
            hmiTriggers='[{"states":[{"name":"high","conditions":[{"tag":"T101/Level","operator":">=","value":90}],"actions":[{"type":"setProps","style":{"strokeColor":"#d00"}},{"type":"startAnimation","name":"blink"}]},{"name":"normal","conditions":[],"actions":[{"type":"stopAnimation","name":"blink"}]}]}]'>
      <mxCell style="shape=mxgraph.hmi.tank;hmiLevelColor=#3a8ee6;" vertex="1" parent="1">
        <mxGeometry x="100" y="80" width="80" height="160" as="geometry"/>
      </mxCell>
    </object>
  </root>
</mxGraphModel>
```

### 6.2 Internationalisation

All UI strings go through `mxResources`. Tag names, units and alarm messages are user data and are not translated.

### 6.3 Documentation

The feature shall ship with:
- a user guide (designer and operator)
- a gateway integration guide (Node-RED, Mosquitto examples)
- a JSON schema for `hmi`, `hmiBindings`, `hmiEvents`, `hmiTriggers` and `hmiAnimations`
- a security hardening guide (CSP, allow-list, script policy, broker ACLs)

### 6.4 Safety disclaimer

draw.io HMI is a supervisory visualisation tool. It is not intended for safety-critical or real-time control functions. The user documentation and the first-run dialog shall say this. Write actions must be protected by broker or gateway authorisation and interlocks in the control system.

---

## 7. Verification (acceptance criteria summary)

| Area | Acceptance test |
|---|---|
| Sources | Integration tests against a Mosquitto container (ws), a Node WebSocket echo server, an HTTP JSON endpoint and an SSE endpoint. Covers connect, receive, reconnect after a server restart, and write/publish. |
| Bindings | Unit tests per transform and target. E2E test: a tank level follows a tag, the label shows a formatted value, and bad quality shows the indication. |
| Isolation | E2E test: run for 60 s with updates, stop, and confirm that the file is unmodified, the undo stack is empty, the saved XML is byte-identical, and a visual snapshot equals the pre-run snapshot. |
| Triggers | Table-driven tests of all operators, and a state machine that fires entry actions only once per transition. |
| Events | E2E test: a click on a switch with confirm causes an MQTT publish with the correct payload. `navigate` switches pages and re-binds. |
| Animation | Visual regression: blink, spin, flow type variants and level fill. The animation stops on the hidden-tab event. |
| Performance | Automated benchmark screens (500 / 2,000 cells) with a synthetic source. Asserts latency and frame budget (HMI-PERF-1/4). 24-hour soak test with heap sampling. |
| Security | A script with policy `off` does not run. A script in the sandbox cannot access `window.parent`. A disallowed endpoint is refused. Credentials are absent from diagnostics and exports. |
| Compatibility | An HMI file opened in stock draw.io 31.5.2 loads without errors. Existing `flowAnimation`, custom links and `plugins/update.js` behave unchanged. |

---

## Appendix A. meta2d feature coverage matrix

| meta2d feature | Coverage | Requirement |
|---|---|---|
| `networks` MQTT / WebSocket / HTTP / SSE | Full | HMI-SRC-2..5 |
| `networks` iot / sql / ADIIOT (JetLinks) | Not covered (vendor-specific) | none |
| `socketCbJs`, `preJs` | Full | HMI-SRC-9/10 |
| `realTimes` + `bind` | Full | HMI-BND-1..3 |
| `form[].dataIds` (legacy binding) | Via importer only | HMI-IMP-1 |
| `setValue` by id / tag / dataId | Full, via the embed and JS API | HMI-EMB-1/3 |
| `events` + 19 `EventAction`s | 16 of 19 (no Visio-style media on all shapes; `GlobalFn` → `script`) | HMI-EVT-5 |
| `triggers` / `status` state machine | Full, plus hysteresis | HMI-TRG |
| `frames`, `animations`, `nextAnimate` | Full | HMI-ANI-1/7 |
| `lineAnimateType` Normal / Beads / Dot / Arrow / WaterDrop | Full; Custom via script (C) | HMI-ANI-3 |
| `progress` fill | Full (`hmiLevel`) | HMI-ANI-4 |
| form-diagram switch / slider / checkbox / radio / table | Full | HMI-WGT |
| le5le-charts gauge / line / bar / pie | Full; heatmap not covered | HMI-WGT-2/11/12 |
| ECharts / Highcharts / LightningCharts | ECharts only (C) | HMI-WGT-20 |
| mock data | Full | HMI-SIM |
| `roles` | Full (presentation level) | HMI-SEC-5 |
| `LockState` levels | Runtime pan/zoom options | HMI-RUN-2 |
| `fits`, big-screen scaling | Partial | HMI-RUN-5 |
| themes | Dark mode + ISA-101 theme | HMI-USA-3 |
| Alarms (not in meta2d core) | Added | HMI-ALM |
