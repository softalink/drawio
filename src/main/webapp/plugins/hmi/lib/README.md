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
