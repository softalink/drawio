# Vendored libraries

## mqtt.min.js

- Package: `mqtt` (MQTT.js) version **5.16.0**
- Source: `npm pack mqtt@5` (upstream: https://github.com/mqttjs/MQTT.js)
- File used: `dist/mqtt.min.js` from the npm package, copied unmodified.
- License: MIT (see `mqtt.LICENSE.md`, copied unmodified from the package).
- Loaded lazily by `sources/HmiMqttSource.js` (`Hmi.MqttSource.loadLibrary`), only when a
  document has an enabled MQTT source, from `Hmi.basePath + 'lib/mqtt.min.js'`. This keeps
  it out of the plugin's initial load budget (HMI-PERF-6).
- Exposes the global `mqtt` (`mqtt.connect(url, options)`, `mqtt.Client`, …) when loaded via
  a `<script>` tag, which is how `HmiMqttSource` uses it in the browser.

To update: re-run `npm pack mqtt@<version>` in a scratch directory, copy
`dist/mqtt.min.js` and `LICENSE.md` over the files in this directory, and update the
version number above.

## echarts.min.js

- Package: `echarts` version **5.6.0**
- Source: `npm pack echarts@5` (upstream: https://github.com/apache/echarts)
- File used: `dist/echarts.min.js` from the npm package, copied unmodified.
- License: Apache-2.0 (see `echarts.LICENSE`, copied unmodified from the package's
  `LICENSE`; `echarts.NOTICE` is the package's `NOTICE` file, also copied unmodified).
- Loaded lazily by `runtime/HmiDomWidgets.js` (`Hmi.DomWidgets.prototype.loadEcharts`),
  only when the current page has a visible `mxgraph.hmi.echarts` cell in the runtime,
  from `Hmi.basePath + 'lib/echarts.min.js'`. This keeps it out of the plugin's initial
  load budget (HMI-PERF-6).
- Exposes the global `echarts` (`echarts.init(dom)`, …) when loaded via a `<script>` tag,
  which is how `HmiDomWidgets` uses it in the browser.

To update: re-run `npm pack echarts@<version>` in a scratch directory, copy
`dist/echarts.min.js`, `LICENSE` (as `echarts.LICENSE`) and `NOTICE` (as
`echarts.NOTICE`) over the files in this directory, and update the version number
above.
