# InTouch animation links: implementation contract

This file maps **Chapter 4 "Animating Objects"** of the *AVEVA InTouch HMI Visualization Guide* (`docs/hmi/reference/ITVisualization.pdf`, pages 55–88) onto the HMI plugin. It is binding for every module that implements links. The conventions in `ARCHITECTURE.md` §1 apply (ES5, tabs, Allman braces, namespace wrapper, DOM-free core modules).

InTouch attaches **animation links** to an object: display links and touch links. Several links can be combined on one object. Here a link set is stored per cell in the user-object attribute **`hmiLinks`**: a JSON object keyed by link type, holding at most one link of each type, as in InTouch. Links coexist with the generic `hmiBindings`, `hmiEvents`, `hmiTriggers` and `hmiAnimations`.

All runtime effects go through the overlay (`ARCHITECTURE.md` §4). The model is never changed.

## 1. Expressions (InTouch compatible)

Every `expr` field is an expression in `Hmi.Expr` **InTouch mode**:
- `Hmi.Expr.compile(src, {intouch: true})`
- `Hmi.Expr.evaluate(src, env, {intouch: true})`

InTouch mode extends the normal language as follows.

**Tag names.** A bare identifier that is not `value` and not a key of `env.vars` reads a tag.
- `TankLevel >= 75` and `Tank_CV*0.06` work as written.
- Identifier characters are `A-Z a-z 0-9 _ ! @ # $ % &`, plus `\` and `/` inside identifiers (for example `Pump1/Run`).
- A leading `$` is allowed, for system tags such as `$ObjHor`.
- `refs` contains these tags, so dependency tracking works.

**Dots inside names.** For `A.B.C`, the evaluator first tries the whole dotted name as a tag (tag names here may contain dots, such as `Motor1.Cmd`). If no such tag exists and the last segment is a dotfield, it reads that dotfield of the prefix. Dotfields:

| Dotfield | Returns |
|---|---|
| `.Value` | the value |
| `.Name` | the name string |
| `.Quality` | 192 when good, 0 otherwise |
| `.MinEU`, `.MaxEU`, `.MinRaw`, `.MaxRaw` | the tag definition's `min` / `max` |
| `.Alarm` | 1 when any alarm is active |
| `.Ack` | 1 when acknowledged or no alarm |
| `.TimeLastModified` | the timestamp |

`env.tagEntry(name)` → `{value, quality, ts}`, `env.tagDef(name)` → TagDef and `env.alarmOf(name)` → alarm entry provide this data, and may be absent.

**Operators.**
- `AND`, `OR`, `NOT` (case-insensitive) are aliases of `&&`, `||`, `!`.
- `<>` is an alias of `!=`.
- `=` in expression context means `==` (assignment exists only in QuickScript).
- `+` with a string operand concatenates.
- `MOD` is the remainder operator.
- `{ ... }` is a comment.

**Functions.** Case-insensitive names, in addition to the existing built-ins:

| Group | Functions |
|---|---|
| Text conversion | `Text(number, format)` (InTouch mask, §3), `StringFromIntg(n, base)`, `StringFromReal(r, precision, type)` (type `"f"` fixed, `"e"` exponential, `"g"`) |
| String handling | `StrLen(s)`, `StrUpper(s)`, `StrLower(s)`, `StrLeft(s, n)`, `StrRight(s, n)`, `StrMid(s, start, len)` (1-based), `StrTrim(s)`, `StrFromValue` (alias of `Text`), `StringToIntg(s)`, `StringToReal(s)` |
| Numeric | `Int(x)`, `Round(x, n)`, `Abs(x)`, `Sqrt(x)`, `Exp(x)`, `Log(x)`, `Log10(x)`, `Trunc(x)`, `Sgn(x)` |
| Trigonometry | `Sin`, `Cos`, `Tan`, `ArcSin`, `ArcCos`, `ArcTan`, in degrees as InTouch uses |
| Logic and time | `PI()`, `Min`, `Max`, `IF(c, a, b)`, `Now()` (ms) |

**Discrete truthiness.** A value is false if it is `0`, `false`, `''`, `"false"`, `"off"`, `"no"` or `"0"`. Everything else is true. This is `Hmi.Links.isTrue(value)`.

## 2. Link schema: attribute `hmiLinks`

```js
{
  // ---------- Display links (pages 55-69) ----------
  valueDiscrete: {expr, onMessage: 'On', offMessage: 'Off'},
  valueAnalog:   {expr, format: Format},
  valueString:   {expr},
  locationH:     {expr, atLeft: 0, atRight: 100, toLeft: 0, toRight: 100},     // pixels
  locationV:     {expr, atTop: 100, atBottom: 0, up: 100, down: 0},           // pixels
  orientation:   {expr, valueAtMaxCCW: 0, valueAtMaxCW: 100, ccwRotation: 0, cwRotation: 360,
                  offsetX: 0, offsetY: 0},                                    // degrees, pixels
  sizeHeight:    {expr, valueAtMin: 0, valueAtMax: 100, minPercent: 0, maxPercent: 100,
                  anchor: 'top'|'middle'|'bottom'},                           // default 'bottom'
  sizeWidth:     {expr, valueAtMin: 0, valueAtMax: 100, minPercent: 0, maxPercent: 100,
                  anchor: 'left'|'center'|'right'},                           // default 'left'
  lineColor:     ColorLink,
  fillColor:     ColorLink,
  textColor:     ColorLink,
  fillVertical:  {expr, valueAtMin: 0, valueAtMax: 100, minPercent: 0, maxPercent: 100,
                  direction: 'up'|'down', backgroundColor: '#FFFFFF'},         // default 'up'
  fillHorizontal:{expr, valueAtMin: 0, valueAtMax: 100, minPercent: 0, maxPercent: 100,
                  direction: 'right'|'left', backgroundColor: '#FFFFFF'},      // default 'right' (fills from left)
  blink:         {expr, mode: 'invisible'|'visible', textColor, lineColor, fillColor,
                  speed: 'slow'|'medium'|'fast'},
  visibility:    {expr, visibleState: 'on'|'off'},                            // 'on': visible while true
  disable:       {expr, disabledState: 'on'|'off'},                           // 'on': touch disabled while true
  tooltip:       {mode: 'static'|'expression', text, expr},                   // static text: max 131 chars

  // ---------- Touch links (pages 69-79) ----------
  inputDiscrete: {tag, key: Key, message, setPrompt: 'On', resetPrompt: 'Off',
                  onMessage: 'On', offMessage: 'Off', inputOnly: false},
  inputAnalog:   {tag, key: Key, keypad: false, message, min: 1, max: 100,   // number or tag name
                  inputOnly: false, format: Format},
  inputString:   {tag, key: Key, keypad: false, message, echo: 'yes'|'no'|'password',
                  passwordChar: '*', encrypt: false, inputOnly: false},
  sliderH:       {tag, atLeft: 0, atRight: 100, toLeft: 0, toRight: 100, reference: 'left'|'center'|'right'},
  sliderV:       {tag, atTop: 100, atBottom: 0, up: 100, down: 0, reference: 'top'|'middle'|'bottom'},
  pushDiscrete:  {tag, key: Key, action: 'direct'|'reverse'|'toggle'|'reset'|'set'},
  pushAction:    {key: Key, scripts: [{condition: Condition, period: 500, script: '<QuickScript>'}]},
  showWindow:    {key: Key, windows: ['<page id or name>', ...]},
  hideWindow:    {key: Key, windows: ['<page id or name>', ...]}
}
```

**`ColorLink`** has four forms:
- `{kind: 'discrete', expr, offColor, onColor}`
- `{kind: 'analog', expr, breakpoints: [{value, color}]}`: up to 10 entries in ascending order. The colour is that of the last breakpoint whose value is ≤ the expression value, or the first breakpoint's colour below the first value.
- `{kind: 'discreteAlarm', tag, normalColor, alarmColor}`
- `{kind: 'analogAlarm', tag, alarmType: 'value'|'deviation'|'roc', colors}`, where `colors` is:
  - for `value`: `{normal, lolo, lo, hi, hihi}` (five colours)
  - for `deviation`: `{normal, minor, major}` (three colours)
  - for `roc`: `{normal, roc}` (two colours)

**`Key`** is `{key: 'F1'..'F16' | single character | 'Enter'|'Space'|'Escape'|..., ctrl: false, shift: false}` or `null`.

**`Condition`** is `onLeftDown`, `whileLeftDown`, `onLeftUp`, `onLeftDouble`, `onRightDown`, `whileRightDown`, `onRightUp`, `onRightDouble`, `onMouseOver`, `whileMouseOver` or `onMouseLeave`. The `while*` conditions repeat every `period` ms (default 500) while held or hovered.

**`Format`** (advanced formatting, pages 84–86) is `{mode: 'text'|'real'|'fixed'|'integer'|'exponential'|'hex'|'binary', precision: 0..8, bitsFrom: 0..31, bitsTo: 0..31, fixedWidth: false}`. The default mode is `'text'`.

## 3. Text formatting (pages 84–87)

`Hmi.Format.applyMask(text, value)` implements InTouch numeric text masks. It replaces the **first** run of mask characters `[#0,.]+` that contains at least one `#` or `0` in `text` with the formatted value. Other text is kept, for example `Temp = #.# C` gives `Temp = 123.5 C`.

Mask rules:
- Decimal places are the number of mask characters after `.`.
- The minimum number of integer digits is the number of `0` characters before `.`, with leading zeros.
- A `,` in the integer part enables thousands grouping. Zero padding counts digits only.
- Rounding is half away from zero.

Test cases, for value 123.45 (from the guide):

| Mask | Result |
|---|---|
| `#` | `123` |
| `#.#` | `123.5` |
| `00000` | `00123` |
| `000.0` | `123.5` |
| `00.00` | `123.45` |
| `0,000.#` | `0,123.5` |

Note the guide prints `124` for `#`, which is a typo; round half away from zero gives 123. If the text has no mask run, the result is the plain value.

`Hmi.Format.advanced(value, format, fieldText)` implements the advanced formatting modes:

| Mode | Output |
|---|---|
| `text` | `applyMask(fieldText, value)` |
| `real` | shortest natural representation, with up to 6 significant decimals (the "global precision") |
| `fixed` | real values get `precision` decimals. Integers are right-padded with spaces where the decimals would be (`precision` + 1 spaces). Discrete values give `0` or `1`, padded the same way. |
| `integer` | rounded integer |
| `exponential` | `toExponential(precision)`, uppercase `E` |
| `hex` | bits `bitsFrom..bitsTo` (either order; a single bit when equal) as uppercase hex |
| `binary` | the same bits as a binary string |

With `fixedWidth` and a non-empty `fieldText`, an output longer than `fieldText.length` is replaced by `fieldText.length` copies of `*` (the "Fixed Field Width Too Large Character", configurable with `opts.tooLargeChar`). An empty `fieldText` with `fixedWidth` returns `''`.

## 4. Link evaluation (pure functions in `core/HmiLinks.js`)

Display-link results are computed by DOM-free functions. The runtime turns results into overlay changes. Each function returns `null` for an invalid or unknown value (bad expression or `undefined`), and the runtime then keeps the design state.

| Function | Semantics |
|---|---|
| `Hmi.Links.isTrue(v)` | Discrete truthiness (§1). |
| `Hmi.Links.lerp(v, v0, v1, o0, o1)` | Linear map of `v` from `[v0,v1]` to `[o0,o1]`, **clamped** to the output range. If `v0 == v1`, returns `o0`. |
| `Hmi.Links.locationH(link, v)` | `{dx}` = lerp(v, atLeft, atRight, -toLeft, +toRight), in design-pixel units. |
| `Hmi.Links.locationV(link, v)` | `{dy}` = lerp(v, atBottom, atTop, +down, -up). Up is negative y. |
| `Hmi.Links.orientation(link, v, w, h)` | `{rotation, dx, dy}`. `angle` = lerp(v, valueAtMaxCCW, valueAtMaxCW, -ccwRotation, +cwRotation), with clockwise positive as in draw.io. The rotation centre is the cell centre plus `(offsetX, offsetY)`. The returned `dx, dy` move the cell so that rotating about its own centre equals rotating about the offset point: d = R(-P) + P − P', where P is the offset and R the rotation. |
| `Hmi.Links.size(link, v, isWidth, w, h)` | `{dw, dx}` or `{dh, dy}`. The percentage is lerp(v, valueAtMin, valueAtMax, minPercent, maxPercent). The new size is design size × percentage / 100. Anchor `top`/`left` keeps that edge; `middle`/`center` keeps the centre; `bottom`/`right` keeps that edge. |
| `Hmi.Links.color(link, v, alarm)` | The colour, or `null`. For alarm kinds, `alarm` = `{active: bool, level: 'lolo'|'lo'|'hi'|'hihi'|'minor'|'major'|'roc'|null, acked}` is taken from `Hmi.Alarms.stateOf(tag)`. |
| `Hmi.Links.fill(link, v)` | `{percent: 0..100, direction}`. The percentage is lerp(v, valueAtMin, valueAtMax, minPercent, maxPercent). |
| `Hmi.Links.visible(link, v)` | `'on'`: visible when true. `'off'`: invisible when true. |
| `Hmi.Links.disabled(link, v)` | `'on'`: disabled when true. `'off'`: disabled when false. |
| `Hmi.Links.valueText(linkType, link, v, fieldText)` | Text for the three value-display links: on/off message, `Format.advanced`, or `String(v)`. |
| `Hmi.Links.sliderValue(link, offsetPx, isVertical)` | The inverse of the location mapping: a drag offset in design pixels from the start position gives the tag value, clamped. |
| `Hmi.Links.pushValues(action, current)` | `{down: value | undefined, up: value | undefined}`: direct is 1 then 0, reverse is 0 then 1, toggle is `!current` on down, set is 1 on down, reset is 0 on down. |
| `Hmi.Links.refs(links)` | All tags referenced by expressions and `tag` fields, for dependency tracking. |
| `Hmi.Links.inputLimits(link, getValue, getDef)` | `{min, max}`. `min` and `max` may be numbers or tag names. A bad or undefined reference falls back to the tag definition's `min`/`max`, else 1/100 (pages 71–72). |

## 5. Alarms (page 63)

`Hmi.Alarms` gains two alarm kinds in `TagDef.alarms`:
- **Deviation:** `{target: number | tagName, minorDev, majorDev}`. An absolute deviation from the target ≥ `majorDev` gives level `major`; ≥ `minorDev` gives `minor`.
- **Rate of change:** `{roc: unitsPerSecond}`. The rate is computed between consecutive updates. An absolute rate above the limit gives level `roc`. It clears on the next update below the limit.

The new method `stateOf(tag)` returns `{active, level, acked, severity}` or `{active: false}`. For value alarms, `level` is `hihi`/`hi`/`lo`/`lolo`; for discrete (`bool`) alarms it is `'alarm'`.

## 6. QuickScript subset (`core/HmiQuickScript.js`, page 75)

`Hmi.QuickScript.compile(src)` returns `{run(api, env)}`. It throws `Hmi.QuickScript.Error` with a line number.

Grammar:
- Statements are separated by `;` or newlines. Keywords are case-insensitive.
- `Tag = expr;` assigns: it calls `api.write(tag, value)`, which returns a Promise. The run waits for each write before continuing.
- `IF cond THEN ... [ELSEIF cond THEN ...] [ELSE ...] ENDIF;`
- `FOR i = a TO b [STEP s] ... NEXT;`. Loops are bounded to 10,000 iterations in total.
- `RETURN;`
- Function calls as statements, for example `Show("Win");`.
- Comments `{ ... }`.

Expressions use the InTouch mode of §1. The local variables of the `DIM x AS INTEGER|REAL|DISCRETE|MESSAGE;` form become `env.vars`.

Built-in statement functions call the `api`:

| Function | Calls |
|---|---|
| `Show(name)` / `Hide(name)` / `HideSelf()` | `api.show`, `api.hide`, `api.hideSelf` |
| `ShowAt(name, x, y)` / `ShowTopLeftAt(name, x, y)` | `api.showAt(name, x, y, 'center' \| 'topleft')` |
| `DialogValueEntry(tagName, lo, hi, prompt)` / `DialogStringEntry(tagName, prompt)` | `api.dialogValueEntry` / `api.dialogStringEntry`. These return Promises of the InTouch result codes (page 78). |
| `LogMessage(text)` | `api.log` |
| `PlaySound(...)` | ignored, with a log message |
| `Ack(tag)` / `AlarmAck(tag)` | `api.ack` |
| `SetTagValue(name, v)` / `GetTagValue(name)` | indirect access by name |

`$ObjHor` and `$ObjVer` are system tags. They are read through the expression environment like other tags.

## 7. Runtime semantics (`runtime/HmiLinkEngine.js`)

**Overlay layers.** A new top layer `blink` is added above `anim` in `Hmi.Overlay.LAYERS`. Display links write to layer `link`, which sits between `binding` and `trigger`. The full order is `binding < link < trigger < action < anim < blink`.

**Value display.** The value text replaces the label. Number masks come from the cell's **design label** (the "field text"). The font, size, colour and alignment of the cell are kept.

**Location, size and orientation.** These are overlay geometry offsets in design pixels, with rotation added to the style `rotation` (cumulative with the drawn rotation).

**Colours.**
- `fillColor` sets the style `fillColor`, `lineColor` sets `strokeColor`, and `textColor` sets `fontColor`.
- On mxgraph.hmi widgets they also set `hmiFillColor`, `hmiStrokeColor` and `hmiFontColor` where those keys exist.

**Percent fill.** InTouch fills with the object's drawn fill colour and paints the unfilled part with the background colour. So for percent fill:
- `hmiLevelColor` is set to the object's design fill colour, or `#3A8EE6` when it has none.
- `fillColor` is set to `backgroundColor`.
- `hmiLevel` (vertical percent, 100 when only horizontal) and `hmiLevelH` (horizontal percent, only when a horizontal link exists) are set, with `hmiLevelMin=0` and `hmiLevelMax=100`.
- `hmiLevelDirection` is `up` or `down`, and `hmiLevelHDirection` is `right` or `left`.
- `HmiLevelFill` fills the rectangle that is the intersection of the vertical and horizontal fractions. With both links, the background colour of the last-defined one wins (horizontal).

**Blink.** Blinking is synchronised: one timer per speed toggles a global phase, and every blinking cell follows its speed's phase.
- Periods come from `DRAWIO_CONFIG.hmi.blink = {slow: 1000, medium: 500, fast: 250}` (half-period of visible/invisible in ms), overridable per document with `runtime.blink`.
- Invisible mode alternates the cell's visibility in layer `blink`.
- Visible mode alternates `fontColor`/`strokeColor`/`fillColor` with the blink colours. Colour fields left empty are not changed.

**Visibility and tooltips.**
- Visibility uses layer `link`.
- An invisible cell gets no touch events, and its key equivalents are inactive.
- `tooltip` sets the overlay tooltip. Expression tooltips are re-evaluated whenever their tags change.

**Disable.** A cell is disabled while its `disable` link says so. Disabled cells, and their descendants, ignore all touch links, HMI events and key equivalents, and the cursor shows `not-allowed`.

**Touch links** run only when the runtime is interactive. When the cell or an ancestor has HMI events (`hmiEvents`), the touch links run first and the events still fire.

| Link | Behaviour |
|---|---|
| `inputDiscrete` | A click opens a small modal with `message` and two buttons, `setPrompt` (writes 1) and `resetPrompt` (writes 0). Unless `inputOnly`, the cell's label shows `onMessage`/`offMessage` for the tag. |
| `inputAnalog` | A click opens an input. With `keypad`, this is the on-screen numeric keypad with `message`. Without it, an inline editor is placed over the cell, like the existing `numInput`. The value is validated against `inputLimits`, then written. Unless `inputOnly`, the label shows the formatted value. |
| `inputString` | Like `inputAnalog`, with the on-screen keyboard when `keypad`. `echo` is `yes` (plain text), `no` (input shows nothing) or `password` (masked with `passwordChar`). `encrypt` stores a SHA-256 hex digest instead of the text. Unless `inputOnly`, the label shows the value (masked for passwords). |
| `sliderH` / `sliderV` | The cell's position follows the tag (like a location link), and the cell can be dragged within `[-toLeft, +toRight]` / `[-up, +down]`. Dragging writes the value. `reference` is the grab point; the cursor offset is kept relative to it. |
| `pushDiscrete` | Writes `pushValues` on mouse down and mouse up. |
| `pushAction` | Runs `Hmi.QuickScript` scripts on their conditions. `$ObjHor`/`$ObjVer` are set to the cell centre (in design pixels) before every touch action. |
| `showWindow` / `hideWindow` | Pages act as windows (§8). |
| Key equivalents | Pressing the key (with Ctrl/Shift) activates the link as a click, for `inputDiscrete`, `inputAnalog`, `inputString`, `pushDiscrete` (down plus up), `pushAction` (`onLeftDown`, then `onLeftUp`), `showWindow` and `hideWindow`. Only links of visible, enabled cells on the current page are active. When several cells use the same key, the topmost (last in z-order) wins. Keys are handled before HMI events and draw.io shortcuts in runtime mode. |
| Focus frame | Touch-link cells are focusable (tab order left to right, then top to bottom) and show a focus frame. Enter activates the focused cell. |

## 8. Windows (pages 67–68 and 76)

InTouch windows map to **pages**. A page's document config can declare `hmi.window = {type: 'replace'|'overlay'|'popup', x, y, width, height, title}`. The default is `replace`.

| Call | Effect |
|---|---|
| `Show(name)` | A `replace` window navigates to the page. An `overlay` or `popup` window opens as a faceplate (`Hmi.Faceplate.showPage`), at `x, y` if given. |
| `ShowAt` / `ShowTopLeftAt` | The window is placed with its centre or top-left corner at the given **screen** position. `$ObjHor`/`$ObjVer` values are converted from design pixels with the view scale and translate. |
| `Hide(name)` | Closes the faceplate showing that page. For the current replace page, it navigates back to the previous page if there is one. |
| `HideSelf()` | Closes the faceplate the script runs in. |
| `showWindow` / `hideWindow` links | Call `Show` / `Hide` for each listed window. |

## 9. On-screen keyboards (pages 76–79)

`Hmi.Keypad` (runtime/HmiKeypad.js, DOM) provides:
- `Hmi.Keypad.numeric(opts)` and `Hmi.Keypad.keyboard(opts)`, both returning `Promise<{ok, value}>`. `opts` = `{title, value, min, max, echo, passwordChar}`.
- The types `standard`, `system` (focused native input only) and `resizable`, chosen with `DRAWIO_CONFIG.hmi.keyboard` (default `standard`). It also works in `hmi-run.html`.

`DialogValueEntry` and `DialogStringEntry` use it and return the InTouch result codes:
- `1` OK
- `0` Cancel
- `-1` high limit ≤ low limit
- `-3` tag not defined
- `-4` wrong type
- `-5` write failed

## 10. Editor (design stage)

- **Animation Links dialog.** `Hmi.LinksDialog.show(ui, cells)` mirrors InTouch's dialog: the Display and Touch groups, with a checkbox per link and a configure (…) button that opens that link's settings dialog. It is opened from:
  - the cell context menu ("Animation Links…")
  - the HMI tab ("Animation Links…" button and a summary list)
  - a double-click on a cell with Alt
- **Multi-selection.** Links apply to all selected cells.
- **Tag fields.** Every tag field has a tag picker. Double-clicking it opens the Tag Browser in select mode, which supports wildcard filters (`*`, `?`, page 81) and list and details views.
- **Substitute Tags…** (Extras → HMI / SCADA, and the context menu) lists every tag referenced by the selected cells (links, bindings, events, triggers, animations) with a New Name column, and applies the replacements as one undoable edit (page 83).
- **Define Missing Tags…** turns undeclared referenced tags (placeholder tags, page 84) into catalogue entries. The type is inferred from usage: discrete links give boolean, analog links give number, string links give string.
- **Validator.** It checks `hmiLinks`: expression syntax, undeclared tags, `max > min` for analog input (page 71), duplicate key equivalents on the same page, and windows that do not exist.
- **Design-time display.** Cells with links show their design appearance. A small link badge (a chain icon in the cell's top-right corner) appears only while the HMI tab or the Animation Links dialog is open (`Hmi.LinksDialog.decorate(ui, on)`).

## 11. Extension links from meta2d

These links add the HMI/SCADA functions of meta2d that InTouch's animation links do not have (comparison in `docs/hmi/META2D_INTOUCH_COMPARISON.md`). They follow the same rules as §2–§9:
- one link of each type per object, stored in `hmiLinks`
- expressions in InTouch mode (§1)
- results in overlay layer `link`
- key equivalents (`key`) on every touch link

### 11.1 Schema

```js
{
  // ---------- Display links ----------
  opacity:    {expr, valueAtMin: 0, valueAtMax: 100, minPercent: 0, maxPercent: 100},  // alpha in %
  states:     {expr, states: [State, ...]},           // multi-state appearance, first match wins
  properties: {items: [{target, expr}]},              // any property, like meta2d realTimes
  widgetData: {expr, series: [{tag, name, maxPoints: 600}]},  // mxgraph.hmi widgets and charts

  // ---------- Animation links ----------
  animation:  {expr, preset: 'spin'|'pulse'|'shake'|'fadeInOut'|'blink'|'colorCycle'|'bounce'|'sway'|'glow'|'custom',
               name, rateExpr, reverseExpr, color},
  flow:       {expr, type: 'dash'|'dots'|'beads'|'arrows'|'liquid', reverseExpr, speedExpr, color, width},
  media:      {expr, mode: 'play'|'pause'},          // video/audio widget plays while true

  // ---------- Touch links ----------
  inputChoice: {tag, key: Key, message, options: [{label, value}]},
  pushValue:   {tag, key: Key, action: 'set'|'add'|'subtract'|'expression', value, expr, min, max},
  openUrl:     {key: Key, url, target: 'blank'|'self'|'dialog', title, width: 640, height: 480},
  sendMessage: {key: Key, name, payloadExpr, to: 'page'|'host'|'both'},
  control:     {key: Key, commands: [{object, command, animation}]},
  touchOptions:{confirm, confirmTitle, roles: [], delay: 0},

  // ---------- Object scripts ----------
  dataChange: {expr, deadband: 0, script},
  condition:  {expr, onTrue, onFalse, whileTrue, whileFalse, period: 1000}
}
```

`State` is `{match, fillColor, lineColor, textColor, label, image, opacity, visible, blink}`.
- Every field except `match` is optional. Empty fields keep the design value.
- `match` is one of:
  - a single value, compared as a number when both sides are numeric and as a string otherwise (case-insensitive)
  - a range `a..b`, meaning a ≤ v < b (either end may be empty)
  - a comma list of values and ranges
  - `*`, the default
- `label` may contain `#` masks, which are formatted with the value as in §3.
- `image` is an image URL. It is set as the style `image` on image shapes and as `hmiImage` otherwise.

`properties.items[].target` uses the binding target syntax: `style:<key>`, `attr:<name>`, `prop:<name>` (sets `hmi<Name>`), `label`, `tooltip` or `visible`. Two style keys are shortcuts for mirroring:
- `style:flipH` mirrors the object horizontally.
- `style:flipV` mirrors it vertically.

`widgetData` fields:
- `expr` sets `hmiValue`. Array or object results are stored as JSON, for table, bar and pie widgets.
- Each entry in `series` appends samples of its tag to the overlay series used by trend charts.

`animation` fields:
- It runs while `expr` is true. An empty `expr` means it always runs.
- `preset` selects a built-in animation:
  - `spin`, `pulse`, `shake`, `fadeInOut`, `blink` and `colorCycle` are the existing presets.
  - `bounce` moves up and down.
  - `sway` moves left and right.
  - `glow` is a pulsing drop-shadow in `color`, like meta2d's success, warning and error shadows.
  - `custom` runs the object's named animation `name` from `hmiAnimations`.
- `rateExpr` (optional) sets the speed:
  - for `spin`, revolutions per minute
  - for the other presets, cycles per minute
  - a rate ≤ 0 pauses the animation
- `reverseExpr` (optional) reverses the spin direction while true.

`flow` (for edges and pipes) maps to the `flowAnimation*` styles:
- It runs while `expr` is true.
- `speedExpr` sets the relative speed: 1 is normal and 2 is twice as fast (the duration is divided by it). A speed ≤ 0 stops the flow.
- `reverseExpr` reverses the direction while true.
- `type`, `color` and `width` set the look.

`pushValue` writes on click:
- `set` writes `value`.
- `add` and `subtract` change the current value by `value`, clamped to `min`/`max`.
- `expression` writes the result of `expr`.

`openUrl` fields:
- `url` may contain `${var}` placeholders.
- `target` is `blank` (new tab), `self` or `dialog`. `dialog` opens a sandboxed iframe in a floating window (`Hmi.Faceplate.showUrl`).
- Only `http:`, `https:` and relative URLs are allowed (`Graph.sanitizeLink`).

`sendMessage` emits the named message:
- `page`: to the HMI `message` events of the page, like the `emit` action.
- `host`: to the embedding page through `postMessage` (`{event: 'hmiMessage', name, payload}`).
- `payloadExpr` is evaluated at click time.

`control.commands[]` fields:
- `object` is `''` or `'Me'` for the object itself, a cell id, or `tag:<cell tag>` for every cell carrying that draw.io tag.
- `command` is one of `startAnimation`, `pauseAnimation`, `stopAnimation`, `playMedia`, `pauseMedia` or `stopMedia`.
- `animation` names the animation for the animation commands. Empty means the target's `animation` link preset, or its first named animation.

`touchOptions` applies to every touch link of the object:
- A non-empty `confirm` shows a confirmation, with `confirmTitle`, before the link acts. This applies to clicks and key equivalents. Pushbuttons ask on press, and when refused nothing is written.
- `roles` limits the touch links to users with any of the roles. Other users see the object as disabled.
- `delay` (ms) delays the action after confirmation.
- Sliders honour `roles` but ask for no confirmation, because they write while dragging.

Object scripts run QuickScript (§6):
- `dataChange` runs `script` whenever the value of `expr` changes, by more than `deadband` for numbers, including the first evaluation after the page opens. This corresponds to meta2d `valueUpdate` events and triggers.
- `condition` runs `onTrue` when `expr` becomes true and `onFalse` when it becomes false. `whileTrue` and `whileFalse` repeat every `period` ms while it holds. This is like InTouch condition scripts, attached to the object.

### 11.2 QuickScript additions

| Function | Calls |
|---|---|
| `OpenURL(url [, target])` | `api.openUrl(url, target)` |
| `ShowMessage(text [, level])` | `api.message(text, level)`; level is `info`, `warn` or `error` (a toast) |
| `SendMessage(name [, payload])` | `api.emit(name, payload)` (page `message` events) |
| `PostToHost(name [, payload])` | `api.postToHost(name, payload)` |
| `StartAnimation(object [, name])`, `PauseAnimation`, `StopAnimation` | `api.animation(object, 'start'\|'pause'\|'stop', name)` |
| `PlayMedia(object)`, `PauseMedia`, `StopMedia` | `api.media(object, 'play'\|'pause'\|'stop')` |
| `SetProperty(object, target, value)` | `api.setProperty(object, target, value)`: a transient `properties`-style target |
| `Navigate(page)` | `api.show(page)` with `replace` semantics |

`object` follows the `control` rules: `"Me"` or `""` means the object running the script.

### 11.3 Pure functions (`core/HmiLinks.js`)

| Function | Semantics |
|---|---|
| `Hmi.Links.opacity(link, v)` | Opacity 0..100 = lerp(v, valueAtMin, valueAtMax, minPercent, maxPercent), or `null`. |
| `Hmi.Links.matchState(match, v)` | `true` if `v` matches the State `match` (rules above). |
| `Hmi.Links.state(link, v)` | The first matching State, or `null`. |
| `Hmi.Links.animationDuration(preset, rate)` | ms per cycle: `60000 / rate` for a positive rate, `null` for a rate ≤ 0 (paused), and `undefined` when there is no rate (the preset default). |
| `Hmi.Links.pushValue(link, current, evalExpr)` | The value to write (number or string) or `undefined`. `evalExpr()` evaluates `link.expr`. |
| `Hmi.Links.changed(prev, next, deadband)` | `true` if a data change script should run. |

`Hmi.Links.refs` also returns:
- the tags of `states`, `properties`, `widgetData` (including `series` tags), `animation` (including `rateExpr` and `reverseExpr`), `flow`, `media`, `inputChoice`, `pushValue`, `sendMessage.payloadExpr`, `dataChange.expr` and `condition.expr`
- the tags read and written by the object scripts

### 11.4 Editor

The Animation Links dialog keeps the InTouch layout and adds:

| Band | Groups and links |
|---|---|
| **Display** | Miscellaneous gains **Opacity**. A new group, **States and Properties**, has **Multi-State**, **Properties** and **Widget Data**. |
| **Animation** (new band) | Group **Animation**: **Animation**, **Flow** and **Media** |
| **Touch** | User Inputs gains **Choice**. Touch Pushbuttons gains **Analog/String Value**. A new group, **Actions**, has **Open URL**, **Send Message**, **Animation/Media Control** and **Touch Options**. |
| **Scripts** (new band) | Group **Object Scripts**: **Data Change** and **Condition** |

Each new link has a settings dialog like the existing ones:
- tag pickers on tag fields and expression syntax checks
- list editors for states, property items, series, choice options and control commands
- QuickScript editors for the scripts

The validator, Substitute Tags and Define Missing Tags cover the new links.

## 12. Unified editor

Two dialogs configure every HMI/SCADA feature:
- the **Animation Links** dialog configures an object
- the **Screen Settings** dialog configures the page and the document

The HMI tab of the format panel only summarises and launches.

### 12.1 Animation Links dialog: object-level features stored outside `hmiLinks`

The features of the generic HMI model (ARCHITECTURE.md §2) appear as links in the dialog. Each is edited in place in its existing storage, so no data is converted and the runtime is unchanged.

| Tab → group | Link id | Storage | Editor |
|---|---|---|---|
| Display → States and Properties | `bindings` | `hmiBindings` (tag/expression → any target, with transforms and formats) | list of bindings; each row opens the binding editor |
| Animation → Animation | `keyframes` | `hmiAnimations` (named animations: presets or keyframes, autoPlay, cycles, next) | list of named animations |
| Touch → Actions | `events` | `hmiEvents` (click, dblclick, mousedown, mouseup, enter, leave, contextmenu, longpress, change, valueChange, message, pageOpen, pageClose → action lists, conditions, confirm, delay) | list of event handlers |
| Touch → Actions | `security` | `hmiRoles` (comma list) and the attribute `hmiRolesMode` (`hide`/`disable`) | `roles`, `mode` |
| Touch → Actions | `hoverHalo` | styles `hmiHalo`, `hmiHaloStyle`, `hmiHaloOutline`, `hmiHaloColor` | page default / glow / outline / glow and outline / off; outline shape; colour |
| Scripts → Triggers (new group), label **Object Triggers** | `triggers` | `hmiTriggers` entries without `states` | conditions with and/or, actions, else actions, deadband, on/off delay |
| Scripts → Triggers, label **Object State Machines** | `stateMachines` | `hmiTriggers` entries with `states` | named states, each with conditions, and/or and actions |

A link is "on" while its storage is non-empty. Unchecking clears the storage. All changes are written with the hmiLinks changes as one undoable edit when OK is pressed.

The `security` link writes `hmiRoles` and `hmiRolesMode`:
- `hide` (the default) hides the object from users without the roles.
- `disable` disables it.

`Touch Options.roles` still gates only the touch links.

### 12.2 Dialog API

`Hmi.LinksDialog.show(ui, cells, opts)` accepts these options:
- `opts.tab`: `display`, `animation`, `touch` or `scripts`.
- `opts.link`: a link id. The dialog opens on that link's tab and opens its settings dialog.

`Hmi.LinksDialog.objectSummary(cell)` returns one entry `[{id, tab, text}]` per configured link, covering both `hmiLinks` and the storages in §12.1.

### 12.3 Screen Settings dialog

`Hmi.ScreenSettings.show(ui, opts)` (ui/HmiScreenSettings.js) is a tabbed dialog for the current page/document. Its tabs, in order (`opts.tab` selects one):

| Tab | Content |
|---|---|
| `sources` | the Data Sources list and editor (previously the Data Sources dialog) |
| `tags` | the tag catalogue and tag editor (previously the Tags dialog list) |
| `pageTriggers` | the document-level triggers and state machines of the page (**Add Page Trigger**, **Add Page State Machine**). They belong to the page; the object triggers and state machines of §12.1 travel with their object. |
| `runtime` | simulation mode, scripts, fit, navigation, max rate, quality, pan/zoom, design width/height, theme, blink half-periods |
| `hoverHalo` | the page hover halo settings (previously the Hover Halo dialog) |
| `window` | the InTouch window type of this page (replace / overlay / popup, x, y, width, height, title; §8) |

One OK button saves all tabs as a single undoable edit. The old menu actions (Data Sources…, Tags…, Hover Halo…) open Screen Settings on the matching tab.

### 12.4 HMI tab

- **Object selected:** the tab shows a compact list of the object's configured links (`objectSummary`). Clicking a line opens the Animation Links dialog on that link. Below the list are the **Animation Links…** button and the Tag Browser.
- **No selection:** the tab shows a page summary (sources, tags, objects with links, page triggers) and these buttons: **Screen Settings…**, Tag Browser, Substitute Tags, Define Missing Tags, Validate, Live Preview and Run Screen.
