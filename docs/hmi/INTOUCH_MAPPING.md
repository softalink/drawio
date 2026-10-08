# InTouch animation links: coverage matrix

This matrix maps every item of **Chapter 4 "Animating Objects"** of the *AVEVA InTouch HMI Visualization Guide* (`reference/ITVisualization.pdf`, pages 55–88) to its implementation in the draw.io HMI plugin.

- **Design stage** is the editor: the Animation Links dialog, tag pickers and the validator.
- **Runtime stage** is the Run Screen: `hmi-run.html`, the full-app runtime, or live preview.
- The binding contract is `src/main/webapp/plugins/hmi/INTOUCH_LINKS.md`.
- The template **InTouch Animation Links** (`templates/hmi/intouch_links_demo.xml`) shows every link. Its cell ids are listed in the Demo column.

| Guide section (page) | `hmiLinks` key / feature | Design stage | Runtime stage | Demo |
|---|---|---|---|---|
| Value Display: Discrete (56) | `valueDiscrete` {expr, onMessage, offMessage} | Links dialog, discrete page | `HmiLinkEngine.updateCell` → label | `itd-value-discrete` |
| Value Display: Analog (57) | `valueAnalog` {expr, format} | Links dialog, mask from field text, advanced format | `Hmi.Format.applyMask` / `advanced` | `itd-value-analog`, `itd-format-*` |
| Value Display: String (58) | `valueString` {expr} | Links dialog | label = string expression | `itd-value-string` |
| Location: Horizontal (58) | `locationH` | Links dialog | overlay geometry `dx` | `itd-location-h` |
| Location: Vertical (59) | `locationV` | Links dialog | overlay geometry `dy` | `itd-location-v` |
| Orientation (59–60) | `orientation` with centre offset | Links dialog | style `rotation` + offset correction | `itd-orientation` |
| Object Size: Height / Width (60–61) | `sizeHeight`, `sizeWidth` with anchors, or an anchor at an X / Y offset from the centre | Links dialog | overlay geometry `dh`/`dy`, `dw`/`dx` | `itd-size-height`, `itd-size-width`, `itd-size-*-offset` |
| Object Size: Scale (extension) | `sizeScale`: width and height together, anchor centre, edge, corner or offset | Links dialog | overlay geometry `dw`, `dh`, `dx`, `dy` | `itd-size-scale`, `itd-size-scale-offset` |
| Line / Fill / Text Colour: Discrete (61–62) | `lineColor`/`fillColor`/`textColor` `kind: discrete` | Links dialog with colour pickers | `strokeColor` / `fillColor` / `fontColor` | `itd-color-discrete` |
| Colour: Analog, 10 breakpoints (62) | `kind: analog` | Breakpoint table (max 10) | `Hmi.Links.color` | `itd-color-analog` |
| Colour: Discrete Alarm (62) | `kind: discreteAlarm` | Links dialog | `Hmi.Alarms.stateOf` | `itd-color-discrete-alarm` |
| Colour: Analog Alarm, Value (63) | `kind: analogAlarm, alarmType: value` (5 colours) | Links dialog | LoLo/Lo/Hi/HiHi levels | `itd-color-value-alarm` |
| Colour: Analog Alarm, Deviation (63) | `alarmType: deviation` (3 colours) | Links dialog; tag `alarms.target/minorDev/majorDev` | deviation alarms in `HmiAlarms` | `itd-color-deviation` |
| Colour: Analog Alarm, ROC (63) | `alarmType: roc` (2 colours) | Links dialog; tag `alarms.roc` | rate-of-change alarms in `HmiAlarms` | `itd-color-roc` |
| Percent Fill: Vertical / Horizontal (64–65) | `fillVertical`, `fillHorizontal` with background colour | Links dialog | `hmiLevel*` styles, `HmiLevelFill` (both directions combined) | `itd-fill-*` |
| Blink (65–66) | `blink` invisible / visible colours, slow / medium / fast | Links dialog | layer `blink`, synchronised timers, `DRAWIO_CONFIG.hmi.blink` / `runtime.blink` | `itd-blink-*` |
| Visibility (66) | `visibility` {visibleState} | Links dialog | overlay visibility; hidden cells get no input | `itd-visibility` |
| Disable (66) | `disable` {disabledState} | Links dialog | touch links, HMI events and keys ignored, `not-allowed` cursor | `itd-disable` |
| Tooltip (67) | `tooltip` static (131 chars) / expression | Links dialog | overlay tooltip, re-evaluated on change | `itd-tooltip-*` |
| Positioning windows, `$ObjHor`/`$ObjVer` (67–68) | system tags + `ShowAt` / `ShowTopLeftAt` | QuickScript editor | set before every touch action; design to screen conversion | `itd-showat` |
| User Inputs: Discrete (69–70) | `inputDiscrete` | Links dialog incl. key equivalent | `Hmi.Keypad.choice` Set/Reset; on/off label | `itd-input-discrete` |
| User Inputs: Analog (70–72) | `inputAnalog` with keypad, min/max values or tags | Links dialog; validator `max > min` | `Hmi.Keypad.numeric` or inline editor; `Hmi.Links.inputLimits` fallbacks | `itd-input-analog`, `itd-input-keypad` |
| User Inputs: String (72–73) | `inputString` echo yes/no/password, password char, encrypt | Links dialog | keyboard or inline; SHA-256 for encrypt; masked label | `itd-input-string`, `itd-input-password` |
| Sliders: Horizontal / Vertical (73–74) | `sliderH`, `sliderV` with reference point | Links dialog | drag writes the tag; position follows the tag | `itd-slider-*` |
| Touch Pushbuttons: Discrete Value (74) | `pushDiscrete` direct/reverse/toggle/reset/set | Links dialog | writes on mouse down / up | `itd-push-*` |
| Touch Pushbuttons: Action (75) | `pushAction` scripts per condition (On/While Left/Right Down/Up/Double, Mouse Over/Leave) | Script editor per condition, while-period | `Hmi.QuickScript` + `HmiLinkEngine.runScripts` / `startWhile` | `itd-action-*` |
| Show Window / Hide Window (76) | `showWindow`, `hideWindow` | Window list from the document pages | pages as replace / overlay / popup windows | `itd-show-*`, `itd-hide-overlay` |
| On-screen keyboards (76–79) | `Hmi.Keypad` standard / system / resizable | `DRAWIO_CONFIG.hmi.keyboard` | keypad modal; DialogValueEntry / DialogStringEntry result codes | `itd-dialog-entry` |
| Selecting a tag, dotfields, wildcard filters (80–81) | Tag Browser select mode | `*` and `?` filters, list / details view | dotfields `.Value .Name .Quality .MinEU .MaxEU .Alarm .Ack ...` in expressions | — |
| Keyboard shortcuts / key equivalents (82) | `key` {key, ctrl, shift} on touch links | Key field; validator flags duplicates per page | document key listener, topmost visible enabled object wins | Ctrl+D, F2, Ctrl+T, Shift+F3, F4 |
| Substituting tags (83) | Substitute Tags… | Extras → HMI / SCADA and context menu; one undoable edit | — | — |
| Placeholder tags (84) | Define Missing Tags… | type inferred from link usage | — | — |
| Advanced formatting (84–86) | `format` {mode, precision, bitsFrom, bitsTo, fixedWidth} | Format editor | `Hmi.Format.advanced` | `itd-format-*` |
| Number formatting masks (86–87) | `#`, `0`, `,`, `.` in the field text | Field text is the cell label | `Hmi.Format.applyMask` | `itd-value-analog` |
| Expressions in links (all) | InTouch operators (`AND OR NOT MOD <> =`), functions, `{}` comments | Syntax check in the dialog and validator | `Hmi.Expr` `{intouch: true}` | all |

## Differences from InTouch

- **Windows are pages.** A page becomes an overlay or popup window when its document config has `window.type`. Popup windows are modal through a backdrop. Replace windows navigate and close the open overlay windows.
- **Coordinates.** Location, size and slider offsets are in design pixels and scale with the view zoom.
- **Encrypted strings** are stored as SHA-256 hex digests, a one-way hash, because the runtime has no secure key store.
- **QuickScript** is a subset: assignments, `IF/ELSEIF/ELSE/ENDIF`, bounded `FOR/NEXT`, `DIM` locals, `RETURN` and the functions listed in `INTOUCH_LINKS.md` §6.
- **Tag names** may contain dots (for example `Motor1.Cmd`). A dotted name is read as a tag first, then as a dotfield of its prefix.

## Extension links from meta2d

The combined design adds the meta2d functions that InTouch lacks as further links in the same dialog: Opacity, Multi-State, Properties, Widget Data, Animation, Flow, Media, Choice, Analog/String Value, Open URL, Send Message, Animation/Media Control, Touch Options, Data Change and Condition. See `META2D_INTOUCH_COMPARISON.md` and `INTOUCH_LINKS.md` §11. The template page **meta2d Extensions** (cell ids `itd-m2d-*`) demonstrates them.

## Features from grafana-flowcharting

Smooth changes, blended analog colours, alarm markers on objects, tooltip trends, data age (stale colours and states) and regular expressions in Multi-State come from the Grafana plugin grafana-flowcharting. See `FLOWCHARTING_COMPARISON.md` and `INTOUCH_LINKS.md` §13. The template page **Flowcharting Features** (cell ids `itd-fc-*`) demonstrates them, and the end-to-end test `etc/hmi/e2e/links-flowcharting.e2e.js` covers them.

## Object features

Bindings, keyframes, event handlers, security, hover halo, object triggers, object state machines and media are links of the same dialog (`INTOUCH_LINKS.md` §12.1). Page triggers and page state machines are on the Page Triggers tab of Screen Settings. The template page **Object Features** (cell ids `itd-of-*`) has a tile for each, with one page trigger and one page state machine, and the end-to-end test `etc/hmi/e2e/object-features.e2e.js` covers them. That test also covers the options shown on the other pages: the offset anchors of Object Size, every animation preset and flow type, and the right button and double-click script conditions.
