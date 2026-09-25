# HMI plugin: internal architecture contract

This file is the binding contract between the HMI modules. The requirements are in `docs/hmi/SRS.md` and the milestones in `docs/hmi/IMPLEMENTATION_PLAN.md`. If you change an interface here, update every caller.

## 1. Conventions

- **Language:** ES5 in the draw.io idiom: `var`, prototype classes, `function` expressions. No `class`, arrow functions, `let`/`const`, template literals, spread, `async`/`await`, optional chaining or modules. `Promise` is allowed. Tab indentation and Allman braces (opening `{` on its own line), as in the rest of draw.io.
- **Namespace:** every file begins with

  ```js
  (function()
  {
  	var Hmi = (typeof globalThis !== 'undefined' ? globalThis : window).Hmi =
  		(typeof globalThis !== 'undefined' ? globalThis : window).Hmi || {};
  	...
  	Hmi.TagStore = TagStore;
  })();
  ```

- **DOM-free modules.** These must not touch `window`, `document`, `mxUtils`, `mxGraph` or any draw.io global, so they can be unit tested in Node by `require`-ing them in load order:
  - `core/*`
  - `sources/HmiPayload.js`
  - `sources/HmiSourceManager.js`
  - `sources/HmiWsSource.js` / `HmiHttpSource.js` (they use the global `WebSocket` and `fetch`, both available in Node 22)
  - `runtime/HmiTriggerEngine.js`
  - `runtime/HmiAlarms.js`
  - `runtime/HmiWriter.js`
- **Load order** is the `Hmi.FILES` list in `plugins/hmi/hmi.js`. Production concatenates the same list into `plugins/hmi.min.js`.
- **Tests:** `plugins/hmi/test/*.test.js`, run with `node --test src/main/webapp/plugins/hmi/test/`. `test/load.js` exports `load(names)`, which requires the modules into `globalThis.Hmi`.
- **Logging:** modules receive a `log(level, category, message, data)` function (level: `'debug'|'info'|'warn'|'error'`). Never `console.log` directly, except as the fallback when no log function is given. **Never log credentials.**
- **Resources:** UI strings use `mxResources.get('hmiXyz')`. The keys are added to `resources/dia.txt` (English) and parsed at plugin start with `mxResources.parse(...)` defaults in `ui/HmiResources.js`.

## 2. Persisted schemas (JSON stored in XML attributes)

### 2.1 Document config: attribute `hmi` on the model root cell (id `0`) of each page

```js
{
  version: 1,
  sources: [Source],
  tags: [TagDef],
  triggers: [Trigger],              // document-level triggers
  sim: 'off' | 'on' | 'only',       // default 'off'
  runtime: {
    fit: 'none'|'page'|'width'|'stretch',   // default 'page'
    panZoom: true|false,                   // default true
    nav: 'tabs'|'none',                    // default 'tabs'
    maxRate: 30,                           // Hz
    quality: 'outline'|'none',             // bad/stale indication
    theme: 'default'|'isa101',
    width: 1920, height: 1080              // optional design resolution
  },
  scripts: 'inherit' | 'off'        // a doc can only restrict, never allow
}
```

`Source`:

```js
{ id, name, type: 'mqtt'|'ws'|'http'|'sse'|'host', enabled: true,
  scope: 'file'|'page', url, prefix: '',
  format: { kind: 'auto'|'flat'|'array'|'topic'|'jsonpath'|'drawio-update-xml',
            template: 'plant/{tag}', paths: [{tag, path}] },
  parser: '<script source or empty>', preConnect: '<script or empty>',
  credentials: { mode: 'none'|'save'|'prompt'|'param', username, password, token, param },
  reconnect: { maxAttempts: 0 /* 0 = unlimited */ },
  // mqtt
  clientId, cleanSession: true, keepalive: 30, protocolVersion: 4|5, topics: [{filter, qos}],
  // ws
  protocols: [], initMessage: '', heartbeat: { message, interval },
  // http
  method: 'GET', headers: {}, body: '', interval: 1000, withCredentials: false,
  once: false, skipFirst: false, timeout: 10000,
  // sse
  events: ['message'], }
```

`TagDef`:

```js
{ name, type: 'number'|'integer'|'boolean'|'string'|'object', unit, description,
  min, max, decimals, format /* e.g. '0.0' */, access: 'r'|'rw', initial, staleMs,
  local: false,              // screen variable: no source; writes stay local
  expr: '',                  // derived tag expression (HmiExpr)
  write: { source, topic, payload /* template, default '{"value":${value}}' */, qos, retain,
           method, url, headers, body, message, mode: 'confirmed'|'optimistic', timeout },
  sim: { kind: 'random'|'sine'|'ramp'|'list'|'toggle'|'constant'|'script',
         min, max, period, step, values: [], interval, integer: false, code },
  alarms: { hihi, hi, lo, lolo, bool /* true|false alarm value */, deadband, severity: {hihi:1,hi:2,lo:2,lolo:1,bool:1},
            messages: {hihi:'…',…} },
  roles: [] /* roles required to write */ }
```

### 2.2 Cell attributes (on the cell's `<object>` user object)

| Attribute | JSON |
|---|---|
| `hmiBindings` | `[Binding]` |
| `hmiEvents` | `[EventHandler]` |
| `hmiTriggers` | `[Trigger]` |
| `hmiAnimations` | `[Animation]` |
| `hmiRoles` | plain string `"op,eng"` (roles required to see or use the cell) |

`Binding`:

```js
{ tag: 'T1' /* or */, expr: 'tag("a")+tag("b")',
  target: 'label'|'tooltip'|'visible'|'attr:<name>'|'style:<key>'|'geo:x|y|width|height'|'prop:<name>',
  transform: Transform /* optional */, format: { decimals, pattern, unit: true|false } }
```

- `prop:value` is shorthand for `style:hmiValue`.
- In general, `prop:<name>` is `style:hmi<Name>`, with the first letter upper-cased.
- `prop:series` appends `(ts, value)` to the overlay series buffer of that cell (used by the trend chart).

Optional `targetCells: {cells: [ids], tags: [cellTags], path: 'i/j'}` applies a group's binding to other cells. Tags and paths are resolved among the bound cell's descendants (HMI-BND-10). `maxPoints` and `name` apply to `prop:series`.

`Transform`:

```js
{ kind: 'scale', inMin, inMax, outMin, outMax, clamp: true }
{ kind: 'map', entries: [{ operator: '=='|…, value, output }], default }   // first match wins
{ kind: 'invert' }
{ kind: 'expr', expr: 'value*1.8+32' }
{ kind: 'script', code: '…' }   // async via ScriptHost; returns value
```

`Condition`:

```js
{ tag | expr, operator, value, valueTag }
```

Operators:
- `==`, `!=`, `>`, `<`, `>=`, `<=`
- `range` (in `[a,b)`, where `value` is `[a,b]` or `"a,b"`) and `!range`
- `in` (set membership, where `value` is an array or a comma string, and items may be `a..b` ranges) and `!in`
- `changed`
- `isBad` (quality not `good`)
- `true` (always true, used for "else" states)

`Trigger`:

```js
{ name, conditions: [Condition], conditionType: 'and'|'or', actions: [Action], elseActions: [Action],
  deadband: 0, onDelay: 0, offDelay: 0 }
// or a state machine:
{ name, states: [{ name, conditions, conditionType, actions }] }
```

- A simple trigger fires `actions` on the false→true edge and `elseActions` on the true→false edge.
- A state machine enters the first matching state and runs its actions only on entry.
- An empty `conditions` array means always true.
- Initial evaluation happens at start, and the edge is taken from the "unknown" state.

`EventHandler`:

```js
{ on: 'click'|'dblclick'|'mousedown'|'mouseup'|'enter'|'leave'|'valueChange'|'pageOpen'|'pageClose'|'message'|'change'|'contextmenu'|'longpress',
  message: '<name for on=message>', conditions, conditionType, actions: [Action],
  confirm: true | { title, text }, delay: 0, stopOnError: false }
```

`Action`: `{ type, delay?, ... }`. Every `target` field is a `TargetSpec`:

```js
'self' | { cells: [ids], tags: [cellTags], layers: [layerIds], self: true }
```

| type | fields |
|---|---|
| `setProps` | `target, style: {k:v}, attrs: {k:v}, label, visible` (values may contain `${var}`) |
| `writeTag` | `tag, value \| expr \| prompt: {title} \| fromWidget: true` |
| `toggleTag` | `tag` |
| `pulseTag` | `tag, value, reset, ms` |
| `navigate` | `page` (id or name) \| `url` |
| `openUrl` | `url, target: '_blank'` |
| `dialog` | `page` \| `url`, `title, width, height` |
| `startAnimation` / `pauseAnimation` / `stopAnimation` | `target, name` |
| `emit` | `name, payload` |
| `send` | `source, topic, payload, method, url` |
| `notify` | `text, level: 'info'\|'warn'\|'error'` |
| `postMessage` | `to: 'parent' \| <cellId>`, `data` |
| `script` | `code` |
| `drawioAction` | `action` (one draw.io custom-link action object, e.g. `{toggle:{cells:['x']}}`) |
| `ackAlarms` | `tag` (optional; all when omitted) |
| `playMedia` | `target, command: 'play'\|'pause'\|'stop'` |

`Animation`:

```js
{ name, preset: 'blink'|'pulse'|'spin'|'shake'|'colorCycle'|'fadeInOut'|null,
  params: { rate, rpm, rpmTag, colors: [], … },
  autoPlay: false, cycles: 0 /*0=inf*/, duration: 1000, easing: 'linear'|'ease-in'|'ease-out'|'ease-in-out',
  keepState: false, next: { target, name },
  frames: [{ duration, props: { rotation, opacity, fillColor, strokeColor, fontColor, dx, dy, scale, visible, hmiLevel } }] }
```

### 2.3 Style keys introduced

These work on any shape:

| Key | Meaning |
|---|---|
| `hmiLevel` | level fill value |
| `hmiLevelMin` / `hmiLevelMax` | range of the level value; default 0 / 100 |
| `hmiLevelColor` | fill colour of the level |
| `hmiLevelDirection` | `up`/`down`/`left`/`right` |
| `hmiLevelOpacity` | opacity of the level fill |
| `hmiAlarmIndicator=1` | show the alarm indication on this cell |

Edges:

| Key | Meaning |
|---|---|
| `flowAnimation=1` | enable flow animation (existing key) |
| `flowAnimationType` | `dash`/`dots`/`arrows`/`liquid` |
| `flowAnimationReverse=1` | reverse the flow direction |
| `flowAnimationDuration` | existing key, in ms |
| `flowAnimationColor` | colour of the flow |
| `flowAnimationWidth` | width of the flow |

Widgets (`shape=mxgraph.hmi.*`) read `hmiValue`, plus their own keys (see `shapes/hmi/README.md`).

## 3. Runtime objects

### 3.1 `Hmi.TagStore` (core/HmiTagStore.js)

```
new TagStore({log})
define(tagDefs)                         // catalogue: types, initial values, staleMs
set(name, value, {quality, ts, source}) → bool changed   // coerces to the declared type; a bad coercion sets quality 'bad' and keeps the value
setMany([{tag, value, quality, ts, source}]) → [changedNames]
get(name) → {value, quality, ts, source, prev} | null
getValue(name) → value | undefined
getDef(name) → TagDef | null
names() → [..]       // declared ∪ seen
takeDirty() → [names changed since the last call]
onChange(fn(name, entry)) / offChange(fn)
checkStale(now) → [names that became stale]
clear()
```

### 3.2 `Hmi.Expr`, `Hmi.Condition`, `Hmi.Transform`, `Hmi.Format`, `Hmi.Simulator`, `Hmi.Schema`, `Hmi.Payload`

```
Hmi.Expr.compile(src) → {evaluate(env), refs: [tag names referenced via tag("…")]}   // throws Hmi.Expr.Error with a position
   env = {value, tag(name) → value, prop(name) → value, vars: {name: value}}
   functions: min max abs round(x[,n]) floor ceil clamp(x,a,b) fmt(x,n) str num bool len now() if(c,a,b)
Hmi.Expr.evaluate(src, env)                      // cached compile
Hmi.Condition.test(cond, ctx) → bool
   ctx = {value(tag), quality(tag), changed(tag), env /* for expr */, deadbandState? }
Hmi.Condition.testAll(conds, conditionType, ctx) → bool
Hmi.Condition.refs(conds) → [tags]
Hmi.Transform.apply(transform, value, env) → value     // 'script' kind → returns a Promise
Hmi.Format.format(value, fmt, tagDef) → string   // decimals/pattern/thousands/unit; null/undefined → '--'
Hmi.Format.coerce(value, type) → {ok, value}
Hmi.Simulator: new Simulator(tagStore, {log}); configure(tagDefs); start(ms) / stop(); step(now); write(tag, value)
Hmi.Simulator.mockValue(spec)   // meta2d syntax: 'a-b' range, 'a,b,c' list, 'true'/'false', '[n]' random string
Hmi.Schema.defaults(kind, obj); Hmi.Schema.validate(kind, obj) → [errors]; Hmi.Schema.parse(json, kind) → value|null
   kind ∈ 'doc','source','tag','bindings','events','triggers','animations'
Hmi.Payload.map(message, format, ctx) → [{tag, value, ts, quality}]      // ctx = {topic, source}
```

### 3.3 `Hmi.SourceManager` (sources/)

```
new SourceManager({tags, log, allow(url) → bool, resolve(str) → str /* ${var} */, scripts /* ScriptHost|null */, credentials(source) → Promise<{username,password,token}>})
configure(sources); start(); stop(); restart(id)
status() → [{id, name, type, state: 'disconnected'|'connecting'|'connected'|'error', received, errors, lastTs, lastError}]
recent(id) → [{ts, dir: 'in'|'out', topic, payload /* truncated to 2 KB */}]
write(sourceId, {topic, payload, qos, retain, method, url, headers, body, message}) → Promise
on(event, fn) / off     // events: 'status' (statusEntry), 'updates' ([updates]), 'error' ({source, error})
SourceManager.types[type] = Ctor   // Ctor(def, mgr); proto: connect(), disconnect(), write(req) → Promise
```

Source instances call `mgr.receive(source, message, ctx)`. This runs the parser script (if any), then `Hmi.Payload.map`, then adds the prefix, then `tags.setMany`.

### 3.4 `Hmi.Overlay` (runtime/HmiOverlay.js, DOM-bound; owned by the runtime)

The overlay is layered. Precedence from low to high: `binding` < `trigger` < `action` < `anim`.

```
setStyle(cellId, key, value, layer)       // value null → remove
setStyles(cellId, obj, layer)
setLabel(cellId, text | null, layer)
setTooltip(cellId, text | null, layer)
setVisible(cellId, bool | null, layer)
setGeo(cellId, {dx, dy, dw, dh} | null, layer)
setQuality(cellId, 'good'|'bad'|'stale')
pushSeries(cellId, ts, value, maxPoints); getSeries(cellId) → [[ts, v], …]
clearLayer(layer, cellId?)
clear()
isDirty(); flush()      // re-renders dirty cells: done in the rAF loop by the runtime
applyStyle(cell, style) → style           // called from Graph.postProcessCellStyle (hook H3)
getLabel(cell) → string | undefined       // hook H4
formatTag(cell, spec) → string            // spec 'Name|0.0'  (hook H4)
```

### 3.5 `Hmi.Runtime` (runtime/HmiRuntime.js)

```
new Runtime(ui, {mode: 'run'|'preview', interactive: bool})
start(); stop(); isRunning()
ui, graph, config (doc config), tags, sources, overlay, simulator, scripts, writer, alarms, triggers, animator, actions, events
index  // from Hmi.Model.scan: {cells: {id: {cell, bindings, events, triggers, animations, roles}}, tagToCells: {tag: [ids]}, tagToTriggers: {tag: [{cellId|null, trigger}]}}
log(level, category, msg, data); diag      // ring buffers for the diagnostics window
getCell(id); resolveTargets(targetSpec, cell) → [cells]
resolveVars(str, cell) → str   // ${name}: cell attrs → screen variables/tags → URL params → localStorage → DRAWIO_CONFIG.hmi.params
hasRoles(requiredRolesArray) → bool; roles
on(name, fn) / off / fire(name, payload)     // 'tags' ([names]), 'status', 'write', 'alarm', 'page', 'stop', 'message'
requestFlush()
```

### 3.6 Engines (DOM-light; they receive `rt`)

```
Hmi.TriggerEngine(rt):  build(index, docTriggers); evaluate(changedTags); evaluateAll(); reset()
Hmi.Actions(rt):        run(actions, ctx) → Promise;  ctx = {cell, event, value, handler}
                        Hmi.Actions.types[type] = function(rt, action, ctx) → Promise|void
Hmi.EventDispatcher(rt): install(); uninstall(); fire(cell, name, extra)   // bubbling to ancestors
Hmi.Animator(rt):       start(cellId, name) / pause / stop / stopAll; step(now); isAnimating()
Hmi.Writer(rt):         write(tag, value, {cell, confirm}) → Promise; auditLog
Hmi.Alarms(rt):         evaluate(changedTags); list() → [{tag, level, severity, message, state: 'active-unack'|'active-ack'|'cleared-unack', ts}]; ack(tag?)
Hmi.ScriptHost({policy: 'off'|'prompt'|'on', timeout: 50}): run(code, args, api) → Promise<result>; terminate()
```

### 3.7 System tags, alarms presentation, DOM widgets, viewer

- **`Hmi.System(rt)`** (runtime/HmiSystem.js) publishes read-only system tags:
  - `$alarms` (alarm list)
  - `$alarmCount`
  - `$alarmUnack`
  - `$status/<sourceId>`

  It also:
  - applies `hmiAlarmIndicator=1` styling (severity colour, blinking while unacknowledged)
  - plays the optional alarm sound (`runtime.alarmSound` or `DRAWIO_CONFIG.hmi.alarmSound`: `true` or a maximum severity number)
  - publishes acknowledgements to `runtime.ackTarget = {source, topic, payload, url, method}`
- **`Hmi.DomWidgets(rt)`** (runtime/HmiDomWidgets.js) positions runtime-only DOM elements over `mxgraph.hmi.iframe|video|echarts` cells. Its lifecycle is `install()`, `refresh()` (after each page build) and `uninstall()`.
- **`Hmi.Viewer`** (viewer/HmiViewer.js, only in `js/hmi-viewer.min.js`) adapts a `GraphViewer` to the runtime. It supplies `ViewerUi`, which provides the subset of `EditorUi` the runtime uses:
  - `editor.graph`, `editor.addListener`
  - `pages`, `currentPage`, `selectPage`, `updatePageRoot`
  - `confirm`, `getCurrentFile`

  It starts for `data-mxgraph` configs that contain `"hmi"`.
- **Adaptive frame rate.** `Runtime.frame` lowers the effective rate (down to 2 Hz) when frames are late or work takes more than 60% of the frame budget, and recovers gradually. `rt.diag.counters.rate` reports the current rate.

## 4. Isolation rules (SRS HMI-BND-7, C-5)

- **No runtime path may call `model.setValue`, `setStyle`, `setGeometry`, `setCellStyles`, `beginUpdate`/`endUpdate`, or anything else that produces an undoable edit.** Visual changes go through `rt.overlay` only.
- Editor-side configuration changes (the HMI tab, the Sources dialog) *are* model edits and go through `graph.setAttributeForCell` or `Hmi.Model.setDocConfig` inside `model.beginUpdate`/`endUpdate`.
