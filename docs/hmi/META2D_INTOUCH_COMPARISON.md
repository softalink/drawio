# meta2d vs. InTouch animation links: comparison and combined design

This document compares the HMI/SCADA functions of **meta2d** (`meta2d.js`: `packages/core` pens, events, triggers and animations; `form-diagram`; `le5le-charts`; `chart-diagram`) with the **InTouch animation links** (*AVEVA InTouch HMI Visualization Guide*, chapter 4; implemented per `src/main/webapp/plugins/hmi/INTOUCH_LINKS.md` §1–§10).

Every meta2d function that InTouch lacks has been added as an **extension link** in the InTouch structure (`INTOUCH_LINKS.md` §11). The result is one combined set of links, configured in the InTouch-style Animation Links dialog, organised in four bands:
- **Display**
- **Animation**
- **Touch**
- **Scripts**

## 1. Functions both have

| Function | meta2d | InTouch link |
|---|---|---|
| Show a value, formatted | `text` + `keepDecimal`, `realTimes` → `text` | Value Display: Discrete / Analog / String, masks, advanced formatting |
| Move an object | `realTimes` → `x`, `y` | Location: Horizontal / Vertical |
| Rotate an object | `rotate` | Orientation (with centre offset) |
| Resize an object | `realTimes` → `width`, `height` | Object Size: Height / Width (with anchors) |
| Colour by value | `color`, `background`, `textColor`; triggers | Line / Fill / Text Colour: Discrete, Analog (10 breakpoints) |
| Level / progress fill | `progress`, `progressColor`, `verticalProgress`, `reverseProgress` | Percent Fill: Vertical / Horizontal |
| Show / hide | `visible` | Visibility |
| Disable input | `disabled`, `locked` | Disable |
| Tooltip | `title`, `titleFnJs` | Tooltip (static or expression) |
| Blink | `animateType` blink | Blink (synchronised, 3 speeds, invisible or colour) |
| Click actions, scripts | `events` (click, dblclick, mousedown/up, enter/leave, contextmenu) + `JS` | Action pushbutton (QuickScript on Left/Right Down/Up/Double, Mouse Over/Leave, While …) |
| Write a value on press | `SetProps` / `SendPropData` on a tag | Discrete Value pushbutton (direct, reverse, toggle, set, reset) |
| Numeric / text input | `input`, `inputDom` | User Inputs: Analog / String (keypad, limits, password echo) |
| Slider | form `slider` | Sliders: Horizontal / Vertical |
| Navigate to a page, popup | `Navigator`, `Dialog` | Show Window / Hide Window (replace, overlay, popup windows) |

## 2. InTouch functions meta2d lacks

These are kept, and are new to meta2d users:
- **Alarm colour links:** discrete alarm; value alarm with 5 colours; deviation alarm with 3; rate of change with 2.
- **Synchronised blink** with global speeds.
- **Key equivalents** (Ctrl/Shift + key).
- **On-screen keypad and keyboard**, with `DialogValueEntry` / `DialogStringEntry` result codes.
- **Text masks** and the advanced formatting modes: fixed, exponential, hex and binary bits, fixed width.
- **`$ObjHor` / `$ObjVer`** and `ShowAt` / `ShowTopLeftAt`.
- **Tag dotfields** such as `.MaxEU`, `.Alarm` and `.Quality`; **Substitute Tags**; **Define Missing Tags**.

## 3. meta2d functions added to the InTouch links

| meta2d function | meta2d source | New link (band → group) | Notes |
|---|---|---|---|
| Opacity | `globalAlpha` | Display → Miscellaneous → **Opacity** | analog value → 0–100 % |
| State machines, image and colour switching | `triggers` (status with conditions), `realTimes[].triggers`, image swap | Display → States and Properties → **Multi-State** | ordered states with value, range and list matching; colours, label (with mask), image, opacity, visibility and blink per state |
| Binding to any property | `realTimes[]` (any pen property), `SetProps` | Display → States and Properties → **Properties** | targets `style:`, `prop:`, `attr:`, `label`, `tooltip`, `visible`; includes `flipH` / `flipV` |
| Chart and widget data | `le5le-charts` (gauge, line, bar, pie), `chart-diagram` ECharts, form `table` | Display → States and Properties → **Widget Data** | value for gauges, tanks and tables; tag series for trend charts |
| Keyframe and preset animations | `frames`, `animations`, `animateCycle`, `nextAnimate`, `autoPlay`, rotate, `animateShadow` | Animation → **Animation** | spin (RPM), pulse, shake, fade, blink, colour cycle, bounce (up/down), sway (left/right), glow (shadow), or a named custom keyframe animation; run condition, rate and reverse |
| Line (pipe) flow animation | `lineAnimateType` (normal/water, beads, dot, arrow, water drop), `animateSpan`, `animateReverse`, `animateColor` | Animation → **Flow** | run condition, type, speed, direction, colour and width |
| Video / audio control | `StartVideo`, `PauseVideo`, `StopVideo`, `video`, `audio` pens | Animation → **Media** (by condition); Touch → Actions → **Animation/Media Control** (on click) | |
| Select / radio / dropdown input | form `radio`, `checkbox`, `dropdownList` | Touch → User Inputs → **Choice** | option list, writes the chosen value |
| Write any value, step values | `SetProps`, `SendPropData`, `SendVarData`, `SendData` | Touch → Pushbuttons → **Analog/String Value** | set, add, subtract (clamped) or expression |
| Open a link or an iframe dialog | `Link`, `Dialog` with URL | Touch → Actions → **Open URL** | new tab, same window, or sandboxed dialog |
| Messages to the page or the host | `Emit`, `PostMessage`, `PostMessageToParent` | Touch → Actions → **Send Message** | page `message` events and/or `postMessage` to the embedding page |
| Start / pause / stop animations | `StartAnimate`, `PauseAnimate`, `StopAnimate` | Touch → Actions → **Animation/Media Control** | targets by id, `Me` or draw.io tag |
| Confirmation before acting, roles | `popconfirm`, `roles` | Touch → Actions → **Touch Options** | confirmation text and title, required roles, delay |
| Value change events | `valueUpdate` event | Scripts → Object Scripts → **Data Change** | QuickScript on change, with deadband |
| Trigger actions on conditions | `triggers` actions | Scripts → Object Scripts → **Condition** | QuickScript on true, on false, while true and while false |
| Toast messages, JS actions in scripts | `Message`, `JS`, `GlobalFn` | QuickScript functions | `ShowMessage`, `OpenURL`, `SendMessage`, `PostToHost`, `Start/Pause/StopAnimation`, `Play/Pause/StopMedia`, `SetProperty`, `Navigate` |
| Hover and active highlight | `hoverColor`, `hoverBackground`, `activeColor`, `mouseDownColor` | Hover Halo (page and per object) | glow or outline (rectangle or object shape), with a pressed effect |

## 4. meta2d functions covered elsewhere in the plugin

These meta2d functions are not object animation links. The plugin already provides them:

| meta2d | Plugin |
|---|---|
| Data sources: MQTT, WebSocket, HTTP polling, SSE, `preJs`, `socketCbJs` | Data Sources dialog (`HmiSources`) |
| Global variables, `mockValue` simulation | Tag catalogue, screen variables, simulator |
| Widgets: gauge, line/bar/pie chart, table, switch, slider, input, dropdown, time, iframe, video | `mxgraph.hmi.*` widget library |
| meta2d JSON files | Import meta2d (`HmiImport`) |
| Real-time line chart buffers | Overlay series and the trend chart widget |

The following have no link equivalent:
- Particle effects (meta2d `particle`) are out of scope. Use animated GIF images, or the Animation link on images, for similar effects.
- meta2d `map` geographic views can be embedded with an iframe widget.
