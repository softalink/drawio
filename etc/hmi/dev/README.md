# HMI plugin dev/test servers

Local MQTT / WebSocket / HTTP / SSE endpoints for developing and testing the
draw.io HMI plugin (`src/main/webapp/plugins/hmi`) without any real plant
equipment. Not part of the production build; only used for development and
the `node --test` suite under `src/main/webapp/plugins/hmi/test/`.

## Install

```sh
cd etc/hmi/dev
npm install
```

## Run (Docker-less)

```sh
node etc/hmi/dev/server.js
```

This starts, on localhost:

| Endpoint | Port | Notes |
|---|---|---|
| MQTT over WebSocket | 9001 | `ws://localhost:9001/mqtt` (also answers on `/`) |
| Plain MQTT (TCP) | 1883 | `mqtt://localhost:1883` |
| JSON WebSocket | 9002 | `ws://localhost:9002/` broadcasts `{"Sim/Ws1": n, "Sim/Ws2": n}` every 500ms and echoes back `{"echo": <your message>}` |
| HTTP JSON | 9003 | `GET /tags` returns the current tag values; `POST /write` with a JSON body merges it into those tags |
| SSE | 9003 | `GET /sse` streams the same tags as `POST /write` and the temperature generator update, as `data: {...}` events every 500ms |

It also runs an MQTT data generator that publishes, every 500ms, on:

- `plant/Tank1/Level` - sine wave, 10-90
- `plant/Pump1/Run` - toggles every ~15s
- `plant/Pump1/Speed` - sine around 1450 rpm while running, 0 while stopped
- `plant/Valve1/Open` - abs(sine), 5-95
- `plant/Boiler/Temp` - sine around 180
- `plant/Boiler/Pressure` - sine around 4

Publishing to `plant/<area>/<tag>/set` (any QoS) is echoed back on
`plant/<area>/<tag>`, so a write-then-read round trip has something to see.

Press Ctrl-C to stop.

### Pointing an HMI source at it

Example MQTT source config (`Source.url`, per `ARCHITECTURE.md` §2.1):

```json
{
  "id": "sim1", "type": "mqtt", "enabled": true,
  "url": "ws://localhost:9001/mqtt",
  "topics": [{"filter": "plant/#", "qos": 0}],
  "format": {"kind": "topic", "template": "plant/{tag}"}
}
```

## Run via Docker (mosquitto alternative)

For MQTT-only testing against a real broker instead of the bundled `aedes`
one:

```sh
docker compose -f etc/hmi/dev/docker-compose.yml up
```

This starts `eclipse-mosquitto` with plain MQTT on 1883 and MQTT-over-
WebSocket on 9001 (config: `mosquitto.conf`), anonymous access, for local
development only. It does **not** provide the JSON WebSocket, HTTP/SSE
endpoints or the `plant/*` data generator - run `node server.js` alongside
it (on the WebSocket/HTTP ports it needs) for those, or use it purely for
manual MQTT client testing. This compose file has not been exercised in the
sandbox this was authored in (no Docker available there); please verify it
locally.

## Programmatic use (tests)

`server.js` exports `createServer(opts)`:

```js
var dev = require('./server.js');
var srv = dev.createServer({mqttWsPort: 0, mqttTcpPort: 0, wsPort: 0, httpPort: 0}); // 0 = random free port
srv.start().then(function(ports) {
	// ports = {mqttWsPort, mqttTcpPort, wsPort, httpPort}, the ones actually bound
	...
	return srv.stop();
});
```

`src/main/webapp/plugins/hmi/test/hmiTestUtil.js` wraps this for the plugin's
own tests (`util.startDevServer(overrides)`), and points
`Hmi.MqttSource.loadLibrary` at the `mqtt` package installed here
(`etc/hmi/dev/node_modules/mqtt`), since the plugin itself ships no
`node_modules` of its own and loads MQTT.js from a `<script>` tag in the
browser instead (see `src/main/webapp/plugins/hmi/lib/README.md`).
