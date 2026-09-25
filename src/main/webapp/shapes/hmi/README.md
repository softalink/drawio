# HMI/SCADA widget shape library

Three DOM-free shape files, loaded lazily by `mxStencilRegistry.libraries['hmi']`
(see `js/diagramly/Editor.js`) the first time any `shape=mxgraph.hmi.*` style is
rendered:

- `mxHmiWidgets.js` — value/operator widgets (HMI-WGT-1..10, 14, 17, 18).
- `mxHmiTable.js` — data table (HMI-WGT-13) and the design-time/export
  placeholders for the runtime-only iframe, video and ECharts widgets
  (HMI-WGT-19, 20); loads after `mxHmiWidgets.js`.
- `mxHmiCharts.js` — trend/bar/pie charts (HMI-WGT-11, 12).
- `mxHmiEquipment.js` — state-aware equipment symbols and pipe fittings (HMI-WGT-15, 16).

All shapes paint exclusively through the `mxAbstractCanvas2D` API (see
`plugins/hmi/ARCHITECTURE.md` §1), so they render identically at design time,
in Live preview, in the runtime, and in SVG/PNG/PDF export. **No shape uses
canvas path clipping** (`mxAbstractCanvas2D` has no `clip()`); level fills
(tank, gauges) are built as explicit closed paths that reuse the vessel's own
outline instead.

## Runtime binding convention

Every widget that shows a live value reads it from the style key **`hmiValue`**,
via `mxUtils.getValue(this.style, 'hmiValue', <design default>)` — the same
code path serves the static design-time value (whatever a designer types into
the style, e.g. in the Edit Style dialog or a custom property) and the live
value written by the HMI runtime overlay (`Hmi.Overlay.setStyle(cellId,
'hmiValue', ...)`, never a model edit — see ARCHITECTURE.md §4). Per
ARCHITECTURE.md §2.2, a binding with `target: 'prop:<name>'` is shorthand for
`target: 'style:hmi<Name>'` (first letter upper-cased), so e.g. `prop:decimals`
on a numeric display binds to style key `hmiDecimals`.

Every widget also exposes its design options as `customProperties`
(`name`, `dispName`, `type`, `defVal`, …) in the `mxShapeMockupGauge` pattern,
so they show up in the Format panel's "Edit Style"/shape properties the same
way other draw.io custom shapes do.

## Common conventions

- **Quality.** Widgets that show a scalar value accept `hmiQuality` =
  `good` (default) | `bad` | `stale`. Non-good quality draws a dashed border
  plus a small `?` badge (top-right) — never colour alone (HMI-USA-2).
- **State maps.** Equipment and the lamp accept a `hmi<X>States` /
  `hmiStates` map string of the form `"key:value,key:value,..."`
  (e.g. `hmiStates="0:#555,1:#2ecc71,2:#e74c3c"` or
  `hmiOptions="0:Off,1:Auto,2:Manual"`), parsed by the shared
  `Hmi.ShapeUtil.parseMap` helper.
- **Bands.** Gauges accept `hmiBands="min:max:color,min:max:color,..."`,
  parsed by `Hmi.ShapeUtil.parseBands`.
- **Colours.** All fill/stroke/font colours fall back to the shape's own
  `fillColor`/`strokeColor`/`fontColor` style (so palette entries can set
  light/dark-mode-aware defaults) before falling back to a widget-specific
  default; component colours (bands, liquid, needle, etc.) are independent
  `hmi*Color` keys so a designer can override them without fighting
  draw.io's automatic dark-mode colour inversion.
- **Shared helpers.** `mxHmiWidgets.js` exposes `Hmi.ShapeUtil` (number/bool/
  string coercion, band/map parsing, quality badge painter) and
  `Hmi.ShapeHmiBase` (a small `mxShape` subclass that all HMI shapes extend)
  on the global `Hmi` namespace, for reuse by `mxHmiCharts.js` and
  `mxHmiEquipment.js`, which must load after it (see library file order
  below).

## mxHmiWidgets.js

### `mxgraph.hmi.numDisplay` — Numeric display / value label (HMI-WGT-1)

| Style key | Type | Default | Meaning |
|---|---|---|---|
| `hmiValue` | float | `42.5` | value shown |
| `hmiDecimals` | int | `1` | decimal places |
| `hmiUnit` | string | `°C` | unit suffix |
| `hmiPrefix` | string | `''` | text before the value |
| `hmiAlign` | enum `left\|center\|right` | `center` | text alignment |
| `hmiLcd` | bool | `0` | dark LCD/7-seg look (monospace, green-on-black default) |
| `hmiQuality` | enum `good\|bad\|stale` | `good` | quality indication |

### `mxgraph.hmi.radialGauge` — Radial gauge (HMI-WGT-2)

Ported in spirit from meta2d.js `le5le-charts/gauge.ts` (MIT), redrawn with
the canvas API.

| Style key | Type | Default |
|---|---|---|
| `hmiValue` | float | `65` |
| `hmiMin` / `hmiMax` | float | `0` / `100` |
| `hmiStartAngle` / `hmiEndAngle` | float, degrees, 0°=3 o'clock, clockwise | `135` / `405` |
| `hmiMajorTicks` | int | `5` |
| `hmiMinorTicks` | int (per major interval) | `4` |
| `hmiBands` | `"min:max:color,..."` | `0:60:#2ecc71,60:85:#f1c40f,85:100:#e74c3c` |
| `hmiNeedleColor` | color | `#37474f` |
| `hmiUnit` | string | `%` |
| `hmiShowValue` | bool | `1` |
| `hmiDecimals` | int | `0` |
| `hmiQuality` | enum | `good` |

Cell label (if any) is drawn at the top as the gauge title.

### `mxgraph.hmi.linearGauge` — Linear gauge / bar (HMI-WGT-3)

| Style key | Type | Default |
|---|---|---|
| `hmiValue`, `hmiMin`, `hmiMax` | float | `65`, `0`, `100` |
| `hmiOrientation` | `horizontal\|vertical` | `vertical` |
| `hmiBands` | band string | `''` |
| `hmiTicks` | int | `5` |
| `hmiFillColor` | color | `#2e86de` |
| `hmiUnit` | string | `%` |
| `hmiDecimals` | int | `0` |
| `hmiShowValue` | bool | `1` |
| `hmiQuality` | enum | `good` |

### `mxgraph.hmi.tank` — Tank / vessel (HMI-WGT-4)

| Style key | Type | Default |
|---|---|---|
| `hmiValue`, `hmiMin`, `hmiMax` | float | `60`, `0`, `100` |
| `tankType` | `vertical\|horizontal\|coneBottom\|sphere` | `vertical` |
| `hmiLiquidColor` | color | `#3a8ee6` |
| `hmiShowScale` | bool | `1` |
| `hmiShowValue` | bool | `1` |
| `hmiUnit` | string | `%` |
| `hmiQuality` | enum | `good` |

### `mxgraph.hmi.lamp` — Indicator lamp / LED (HMI-WGT-5)

| Style key | Type | Default |
|---|---|---|
| `hmiValue` | string (bool/number/enum) | `1` |
| `hmiOnColor` / `hmiOffColor` / `hmiFaultColor` | color | `#2ecc71` / `#546e7a` / `#e74c3c` |
| `hmiStates` | map string, optional; overrides on/off/fault heuristics | `''` |
| `hmiShape` | `round\|square` | `round` |
| `hmiQuality` | enum | `good` |

Lit state draws a soft glow behind the lamp. Blink animation is a runtime
concern (style overlay toggling `hmiValue`/opacity), not painted here.

### `mxgraph.hmi.switch` — Toggle switch (HMI-WGT-6)

Ported in spirit from meta2d.js `form-diagram/switch.ts` (MIT).

| Style key | Type | Default |
|---|---|---|
| `hmiValue` | bool | `1` (checked) |
| `hmiOnColor` / `hmiOffColor` | color | `#2ecc71` / `#b0bec5` |
| `hmiDisabled` | bool | `0` |
| `hmiOnLabel` / `hmiOffLabel` | string | `ON` / `OFF` |

Clicking performs `toggleTag` at runtime (with optional confirmation), per
ARCHITECTURE.md — not painted here.

### `mxgraph.hmi.button` — Push button (HMI-WGT-7)

| Style key | Type | Default |
|---|---|---|
| `hmiMode` | `momentary\|latched` | `momentary` |
| `hmiValue` | bool, latched active state | `0` |
| `hmiPressed` | bool, momentary pressed-look preview | `0` |
| `hmiOnColor` / `hmiOffColor` | color, active vs idle | `#2ecc71` / `#3f8ae0` |
| `hmiDisabled` | bool | `0` |

The cell label is the button caption (falls back to `PUSH`/`ON`/`OFF`).

### `mxgraph.hmi.slider` — Slider / set-point (HMI-WGT-8)

Ported in spirit from meta2d.js `form-diagram/slider.ts` (MIT).

| Style key | Type | Default |
|---|---|---|
| `hmiValue`, `hmiMin`, `hmiMax`, `hmiStep` | float | `50`, `0`, `100`, `1` |
| `hmiUnit` | string | `''` |
| `hmiOrientation` | `horizontal\|vertical` | `horizontal` |
| `hmiTrackColor` / `hmiThumbColor` | color | `#cfd8dc` / `#1976d2` |
| `hmiShowValue` | bool | `1` |

Writes on release (or continuously, rate-limited) is a runtime concern.

### `mxgraph.hmi.numInput` — Numeric / text input (HMI-WGT-9)

Design-time look only; **the runtime overlays a real `<input>` element for
keyboard entry** — this shape is not responsible for that.

| Style key | Type | Default |
|---|---|---|
| `hmiValue` | float | `0` |
| `hmiUnit` | string | `''` |
| `hmiEditable` | bool | `1` |
| `hmiDecimals` | int | `1` |

### `mxgraph.hmi.dropdown` — Dropdown / multi-state selector (HMI-WGT-10)

| Style key | Type | Default |
|---|---|---|
| `hmiValue` | string, current option key | `1` |
| `hmiOptions` | `"value:label,value:label,..."` | `0:Off,1:Auto,2:Manual` |

### `mxgraph.hmi.clock` — Clock / date-time display (HMI-WGT-17)

Ported in spirit from meta2d.js `form-diagram/time.ts` (MIT).

| Style key | Type | Default |
|---|---|---|
| `hmiValue` | string, ms timestamp or date string; empty = `new Date()` at paint time | `''` |
| `hmiFormat` | string, tokens `HH mm ss YYYY MM DD` | `HH:mm:ss` |
| `hmiAnalog` | bool, analog clock face instead of digital text | `0` |

Because it reads `new Date()` at paint time when `hmiValue` is empty, this
widget only updates live when the runtime periodically invalidates it (e.g.
via `rt.requestFlush()` on a 1 Hz tick) — at design time it simply shows
"now" once.

### `mxgraph.hmi.statusIndicator` — Connection status indicator (HMI-WGT-18)

| Style key | Type | Default |
|---|---|---|
| `hmiValue` | enum `connected\|connecting\|error\|disconnected` | `connected` |

### `mxgraph.hmi.alarmBanner` — Alarm banner (HMI-WGT-14, text rendering only)

| Style key | Type | Default |
|---|---|---|
| `hmiValue` | string: JSON array of `{severity, message, state}`, or plain text | sample JSON, see shape source |

`severity` drives the colour strip (`critical/high/hihi/lolo` red,
`warning/hi/lo/medium` amber, `info/low` blue — falls back to blue).
`state` of `active-ack` or `cleared-unack` dims the row and shows an `ACK`
tag. **Blinking of unacknowledged alarms is a runtime style-overlay concern**,
not painted here.

## mxHmiTable.js

### `mxgraph.hmi.table` — Data table (HMI-WGT-13)

Reads rows from `hmiValue` (JSON): either an array of objects (columns come
from `hmiColumns`, or are inferred from the keys of the first row, in
insertion order) or an array of arrays (columns come from `hmiColumns`, or
default to `Col 1, Col 2, ...`). Falls back to a 5-row design-time sample
when `hmiValue` is empty or fails to parse.

| Style key | Type | Default | Meaning |
|---|---|---|---|
| `hmiValue` | string, JSON rows | sample data, see shape source | |
| `hmiColumns` | `"key:Header:width:format,..."` | `''` (inferred) | `width` (px) and `format` (a decimals pattern, e.g. `0.1`) are optional |
| `hmiHeader` | bool | `1` | show a header row |
| `hmiStripe` | bool | `1` | alternate row background |
| `stripeColor` | color | `#f5f7f8` | |
| `headerColor` | color | `#eceff1` | |
| `fontSize` | int | `12` | falls back to the shape's own font size style |
| `rowHeight` | int | `~1.8x fontSize` | |
| `hmiMaxRows` | int | `8` | rows visible at once (the rest scroll in) |
| `hmiAutoScroll` | bool | `0` | see below |
| `hmiScrollInterval` | int, ms | `1500` | how often the runtime advances one row when `hmiAutoScroll` is on |

**Auto-scroll.** When `hmiAutoScroll=1`, `Hmi.DomWidgets` (see
`plugins/hmi/runtime/HmiDomWidgets.js`) advances the style key
`hmiScrollOffset` (an integer row index, wrapped modulo the row count) every
`hmiScrollInterval` ms via the overlay's `anim` layer, and the shape simply
starts painting from that row -- it has no timer of its own, so it also
scrolls correctly when driven manually (e.g. from a trigger action writing
`style:hmiScrollOffset`).

No column truncation uses canvas clipping (`mxAbstractCanvas2D` has none,
see above); long cell text is truncated to its column width with an
ellipsis instead.

## Runtime-only widgets (HMI-WGT-19, HMI-WGT-20)

`mxgraph.hmi.iframe`, `mxgraph.hmi.video` and `mxgraph.hmi.echarts` are only
live inside the HMI runtime: `plugins/hmi/runtime/HmiDomWidgets.js` overlays
a real `<iframe>`, `<video>` or ECharts canvas on top of the cell while the
runtime is running (see that file's own doc comment for the binding and
security rules -- sandboxing, URL sanitising, lazy-loading ECharts). Outside
the runtime (design time, Live preview off, and SVG/PNG/PDF export) these
three shapes below paint a plain placeholder -- a frame, a small icon and
the configured URL/caption -- so the screen still looks meaningful and never
embeds live third-party content into an export.

### `mxgraph.hmi.iframe`

| Style key | Type | Default | Meaning |
|---|---|---|---|
| `hmiUrl` | string, `${}` allowed | `https://www.example.com/` | only `http:`/`https:` are ever loaded |
| `hmiRefresh` | int, seconds, `0` = never | `0` | periodic reload |
| `hmiSandbox` | string, `<iframe sandbox>` tokens | `allow-scripts allow-forms` | `allow-same-origin` is always stripped by the runtime |

### `mxgraph.hmi.video`

| Style key | Type | Default |
|---|---|---|
| `hmiUrl` | string, `${}` allowed | `''` |
| `hmiAutoplay` | bool | `1` (requires `hmiMuted=1` per browser autoplay policy) |
| `hmiMuted` | bool | `1` |
| `hmiLoop` | bool | `1` |

### `mxgraph.hmi.echarts`

| Style key | Type | Default | Meaning |
|---|---|---|---|
| `hmiOption` | string, ECharts option JSON | a minimal time/value line option, see shape source | edited via Edit Style; also bindable via `target: 'prop:option'` |
| `hmiMaxPoints` | int | `300` | cap on points kept per series when a `target: 'prop:series'` binding streams data in |

## mxHmiCharts.js

### `mxgraph.hmi.trendChart` — Trend chart / line (HMI-WGT-11)

Ported in spirit from meta2d.js `le5le-charts/lineChart.ts` (MIT).

Reads series from
`state.view.graph.hmiOverlay.getSeries(state.cell.id)` when available (a
runtime object, out of scope here); accepts either a plain `[[ts, v], ...]`
array (rendered as a single "Value" series) or a `{seriesName: [[ts, v], ...],
...}` object (multi-series, each line auto-coloured from a fixed palette).
When no overlay is attached (design time / stock draw.io), a deterministic
sine-wave sample series is drawn so the chart is never blank, labelled from
the cell's own label.

| Style key | Type | Default |
|---|---|---|
| `hmiTimeWindow` | int, ms | `300000` (5 min) |
| `hmiYMin` / `hmiYMax` | string, blank = auto-scaled from visible data (+10% margin) | `''` |
| `hmiLineColor` | color, used only for a single series | `#1976d2` |
| `hmiGridColor` | color | `#e0e0e0` |
| `hmiShowLegend` | bool | `1` |
| `hmiFillArea` | bool | `0` |

### `mxgraph.hmi.barChart` / `mxgraph.hmi.pieChart` — Bar / pie chart (HMI-WGT-12)

| Style key | Type | Default |
|---|---|---|
| `hmiValue` | string: JSON array of numbers (labelled `S1, S2, ...` or weekday names) or JSON object `{label: value}` | sample JSON |
| `hmiBarColor` (bar only) | color | `#1976d2` |
| `hmiOrientation` (bar only) | `vertical\|horizontal` | `vertical` |
| `hmiShowLegend` (pie only) | bool | `1` |
| `hmiDonut` (pie only) | bool | `1` |

## mxHmiEquipment.js

Every equipment symbol shares the same state convention:

| Style key | Type | Default | Meaning |
|---|---|---|---|
| `hmiValue` (alias `hmiState`) | string | `1` | `0` stopped/grey, `1` running/green, `2` fault/red, `3` transit-warn/amber (valve: `0` closed, `1` open) |
| `hmiStates` | map string | `0:#9e9e9e,1:#2ecc71,2:#e74c3c,3:#f1c40f` | overrides the state→colour mapping |

### `mxgraph.hmi.pump` (centrifugal)

Casing is state-coloured; the impeller is painted as a visually distinct
inner layer. Rotation ("spin") animation is applied by the runtime Animator
to the **whole cell** via a `rotation` style overlay (per
ARCHITECTURE.md §2.2 `Animation`/`preset: 'spin'`), not by this shape —
shapes stay DOM-free and cannot host a separately-animatable nested node.
Extra property: `hmiSpin` (bool) is a placeholder for a future design-time
preview and currently has no visual effect.

### `mxgraph.hmi.fan`, `mxgraph.hmi.motor`, `mxgraph.hmi.agitator`

Same state convention; `motor` shows an `M` glyph and cooling fins; `agitator`
draws a motor, shaft and two paddle levels.

### `mxgraph.hmi.valve`

| Style key | Type | Default |
|---|---|---|
| `hmiValue` | string, `0` closed / `1` open / `2` fault / `3` transit | `1` |
| `hmiStates` | map string | see above |
| `valveType` | `gate\|butterfly\|ball` | `gate` |
| `hmiOpenFraction` | string float `0..1`, optional; overrides the open/closed look with a partial-open position | `''` |

Body is the standard P&ID "bowtie" flow-path symbol; the disc/ball/wedge is
state-coloured; stem + handwheel are always drawn.

### `mxgraph.hmi.conveyor`

`hmiValue` truthy ("running") draws motion chevrons on the belt; the state
colour is shown as a strip along the belt top.

### `mxgraph.hmi.heatExchanger`

Simple shell-and-tube symbol with a state-coloured band and a zig-zag tube
bundle.

### `mxgraph.hmi.pipeTee`, `mxgraph.hmi.pipeElbow`

Vertex pipe fittings (for junctions that aren't naturally edges).

| Style key | Type | Default |
|---|---|---|
| `hmiPipeColor` | color | `#90a4ae` |
| `hmiPipeWidth` | float fraction of `min(w,h)` | `0.4` |

For straight pipe runs, edges (not vertices) are used — flow animation and
3D shading are existing core edge style keys (`shape=pipe`, `flowAnimation`,
`flowAnimationType`, etc.), see `js/diagramly/sidebar/Sidebar-HMI.js`'s
`hmiPipes` palette and ARCHITECTURE.md §2.3.

## Attribution

The trend chart, gauge, switch, slider and clock widgets are ported **in
spirit** (redesigned against draw.io's `mxAbstractCanvas2D` vector API, not
copied) from **meta2d.js** (https://github.com/le5le-com/meta2d.js), MIT
licensed:

- `packages/le5le-charts/src/gauge.ts`, `lineChart.ts`
- `packages/form-diagram/src/switch.ts`, `slider.ts`, `time.ts`

No source code from meta2d.js is reproduced verbatim; only the widget
concepts (rolling time-windowed buffer, gauge band/needle geometry, switch
track/thumb layout, slider track/thumb layout, digital/analog clock) carried
over.
