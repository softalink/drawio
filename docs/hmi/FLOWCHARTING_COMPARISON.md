# grafana-flowcharting vs. the HMI plugin

**grafana-flowcharting** (`softalink/grafana-flowcharting`, a Grafana panel plugin that also uses draw.io diagrams) colours and animates draw.io shapes from Grafana metrics with rules. This document compares its functions with the HMI plugin and lists the ones that were adopted. Their contract is `src/main/webapp/plugins/hmi/INTOUCH_LINKS.md` §13.

## 1. Adopted

| grafana-flowcharting | Source | HMI plugin |
|---|---|---|
| Animated changes: colours fade (chroma.js steps), numbers step to the new value | `XGraph.setAnimColorCell`, `setAnimStyleCell`, option `animation` | **Smooth Changes** link and Screen Settings → Runtime → Smooth changes (`runtime.smoothMs`). Also covers position and size. |
| Gradient thresholds: colour between thresholds | rule option `gradient` | **Blend between break points** of analog colour links (`blend`) |
| Warning icon on shapes in warning / critical state | rule option `overlayIcon`, `XCell.addOverlay` | **Alarm Marker** link and Screen Settings → Runtime → Alarm markers on objects (`runtime.alarmMarkers`): coloured by severity, blinking until acknowledged |
| Tooltip with a line or bar graph of the metric | `tooltipHandler.ts` (`tpGraph`, size, scale) | **Show trend** in the Tooltip link (`trend`, `trendTag`, `trendSeconds`) |
| Date thresholds (colour by the age of a timestamp) | `DateTH` (`-5m`, `-1d`) | **Stale after** and **Stale colour** of colour links, `stale` state of Multi-State (`staleSeconds`, `staleColor`) |
| String thresholds with regular expressions (`/.*warning.*/`) | `StringTH` | Regular expression matches in Multi-State (`/pattern/flags`) |

## 2. Already in the HMI plugin

| grafana-flowcharting | HMI plugin |
|---|---|
| Colour of stroke, fill, gradient, label font, label background and border, image background and border | Colour links; Properties link (`style:` targets) |
| Change shape, arrow markers, gradient direction, flip, collapse, image URL, font size, text opacity | Properties link (`style:` targets); Multi-State image |
| Rotate, resize, width, height, opacity, visibility | Orientation, Object Size, Opacity, Visibility links |
| Blink (period in ms) | Blink link with synchronised speeds and `runtime.blink` |
| Position in bar / gauge shapes | Percent Fill links, Widget Data link |
| Edge flow animation | Flow link |
| Replace label text, value maps and range maps | Value Display links, Multi-State |
| Tooltip text and metadata | Tooltip link (static or expression) |
| Links (URL on click) with variables | Open URL link |
| Number, string and date formats, decimals | Value Display formats, masks and QuickScript functions |
| Inspect panel (states of all shapes) | Diagnostics |
| Lock, center, scale, zoom, grid, background | Runtime fit modes, pan and zoom, theme |

## 3. Not adopted

- **Rules that map many shapes by regular expression** (on id, label or metadata). The HMI plugin configures each object, and reuses graphics with Substitute Tags and placeholders. A page-level "link templates by pattern" feature would be a larger structural change.
- **Aggregations over a time range** (avg, min, max, delta, range, count of a Grafana series). An HMI shows live values. Moving averages can be computed with derived tags or QuickScript.
- **Double-click to zoom to a shape and wheel zoom at the pointer.** The Run Screen has pan and zoom; these are interaction details.
- **Anonymize diagrams, diagrams loaded from a URL or CSV.** These are specific to a Grafana panel.
