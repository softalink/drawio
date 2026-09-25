# HMI Gateway Integration Guide

draw.io HMI runs in the browser. Browsers cannot speak field protocols such as Modbus, OPC UA, S7, BACnet or EtherNet/IP. Plant data therefore reaches a screen through a **gateway** that exposes one of the protocols the HMI supports (SRS §2.4):

| HMI source type | What the gateway must provide |
|---|---|
| `mqtt` | An MQTT broker with a **WebSocket listener** (`ws://` or `wss://`) |
| `ws` | A WebSocket endpoint that sends JSON messages |
| `http` | A REST endpoint returning JSON (polled) |
| `sse` | A Server-Sent Events endpoint streaming JSON |
| `host` | Your own web page that embeds draw.io and pushes values over `postMessage` |

```
PLC / RTU / sensors ──(Modbus, OPC UA, S7…)──► Gateway ──(MQTT/WS/HTTP/SSE)──► Browser (draw.io HMI)
```

## 1. Payload formats

Each source sets `format.kind` in its configuration (Data Sources dialog → *Format*):

| Kind | Example message | Resulting tag updates |
|---|---|---|
| `flat` | `{"Tank1/Level": 42.1, "Pump1/Run": true}` | Each key is a tag |
| `array` | `[{"tag": "Tank1/Level", "value": 42.1, "ts": 1700000000000, "quality": "good"}]` | One update per item (`id` and `dataId` are accepted as aliases of `tag`) |
| `topic` | Topic `plant/Tank1/Level`, payload `42.1` or `{"value": 42.1}` | With template `plant/{tag}`, the tag is `Tank1/Level` |
| `jsonpath` | `{"data": {"t": 42}}` with paths `[{"tag": "Temp", "path": "$.data.t"}]` | One update per path |
| `auto` (default) | Any of the above | The format is detected from the message shape |
| `drawio-update-xml` | `<updates><update id="cell1" value="…"/></updates>` | Compatibility with `plugins/update.js` |

Two more options affect how updates are produced:
- **Tag prefix.** A source may set `prefix` (for example `site1/`), which is prepended to every tag it produces.
- **Parser script.** For binary or unusual payloads, a *parser script* can transform each message. This requires the deployment script policy to allow scripts; see [HARDENING.md](HARDENING.md).

## 2. Writing values back

A tag with `access: "rw"` and a `write` target sends operator commands:

```json
{"name": "Pump1/Run", "type": "boolean", "access": "rw",
 "write": {"source": "broker", "topic": "plant/Pump1/Run/set", "payload": "${value}", "qos": 1}}
```

- **Templates.** `${value}`, `${tag}` and `${ts}` are substituted in the payload, topic, URL and body.
- **Confirmation modes.**
  - `confirmed` (the default): the widget shows a pending state until the gateway echoes the new value back on the read path.
  - `optimistic`: the value updates immediately and reverts if no confirmation arrives in time.
- **The gateway must enforce authorization and interlocks.** The HMI checks roles only at presentation level (SRS HMI-SEC-5).

## 3. Recipes

### 3.1 Mosquitto (MQTT over WebSockets)

`mosquitto.conf`:

```
listener 1883
listener 9001
protocol websockets
allow_anonymous false
password_file /mosquitto/config/passwords
acl_file /mosquitto/config/acl
```

The ACL gives operators read access to plant data and write access to set-points only:

```
user operator
topic read plant/#
topic write plant/+/+/set
```

HMI source:

```json
{"id": "broker", "name": "Plant broker", "type": "mqtt", "url": "wss://broker.example.com:9001/mqtt",
 "topics": [{"filter": "plant/#", "qos": 0}],
 "format": {"kind": "topic", "template": "plant/{tag}"},
 "credentials": {"mode": "prompt"}}
```

Use `wss://` with a valid certificate in production. Browsers block `ws://` from `https://` pages.

### 3.2 Node-RED

Node-RED can bridge almost any protocol, for example with `node-red-contrib-modbus` or `node-red-contrib-opcua`.

1. Read the PLC with the protocol node, for example *Modbus Read* every 500 ms.
2. Map registers to named values in a *function* node:
   ```js
   msg.payload = {"Tank1/Level": msg.payload[0] / 10, "Pump1/Run": msg.payload[1] == 1};
   return msg;
   ```
3. Publish to the HMI, choosing one of:
   - **MQTT:** an *mqtt out* node to the broker, topic `plant/values`. Set the HMI source format to `flat`.
   - **WebSocket:** a *websocket out* node (*Listen on* `/ws/plant`). Set the HMI source type to `ws` and format to `flat`.
   - **HTTP:** an *http in* (`GET /api/tags`) → *function* returning the latest values → *http response* chain. Use an HMI `http` source with `interval: 1000`.
4. For writes, add an *mqtt in* node on `plant/+/+/set` → *function* (validate range, check interlocks) → *Modbus Write*. Echo the written value back to `plant/<area>/<tag>` so the HMI confirms it.

### 3.3 OPC UA servers with MQTT publishing

Many OPC UA servers and edge products publish JSON over MQTT. Examples are Kepware IoT Gateway, Ignition MQTT Transmission, and Siemens Industrial Edge. Configure them for **JSON payloads**, not Sparkplug B protobuf.

For Sparkplug B, add a parser script, or a Node-RED flow that decodes Sparkplug into flat JSON.

### 3.4 Telegraf / InfluxDB setups

If data already flows through Telegraf, add an `outputs.mqtt` plugin with `data_format = "json"`. Then map the fields with a `jsonpath` format.

### 3.5 Host page integration (`host` source)

Embed draw.io with `?embed=1&proto=json&hmi=run` and push values from your application:

```js
iframe.contentWindow.postMessage(JSON.stringify({action: 'hmiSetValues',
	values: {'Tank1/Level': 42.1}}), '*');

window.addEventListener('message', function(evt)
{
	var msg = JSON.parse(evt.data);

	if (msg.event == 'hmiWrite')
	{
		// Validate and forward msg.tag / msg.value to your backend
	}
});
```

**Host → draw.io** messages:
- `hmiSetValues`
- `hmiRun` (`{mode, interactive, sim}`)
- `hmiStop`
- `hmiNavigate` (`{page}`)
- `hmiGetTags`
- `hmiSetRoles` (`{roles: [...]}`)
- `hmiWrite` (`{tag, value}`)

**draw.io → host** events:
- `hmiWrite` (sent when a write targets a `host` source, or for every write when `DRAWIO_CONFIG.hmi.forwardWrites` is true)
- `hmiEvent` (from `emit` actions)
- `hmiStatus`
- `hmiTags`
- `hmiStarted` / `hmiStopped`
- `hmiError`
- `hmiPostMessage`

## 4. Local development servers

`etc/hmi/dev/server.js` starts, without Docker:
- an MQTT broker (TCP 1883 and WebSocket 9001)
- a JSON WebSocket server (9002)
- HTTP and SSE endpoints (9003)
- a plant simulator publishing `plant/Tank1/Level`, `plant/Pump1/Run` and other signals

See `etc/hmi/dev/README.md`.

```sh
cd etc/hmi/dev && npm install && node server.js
```

Then open `index.html?dev=1&p=hmi` and add an MQTT source `ws://localhost:9001/mqtt` with topic filter `plant/#` and format `topic` / `plant/{tag}`.

## 5. Checklist

- The broker or endpoint is reachable from operator browsers, is TLS-protected, and has its origin in `DRAWIO_CONFIG.hmi.allowedEndpoints` and in the CSP `connect-src` (see [HARDENING.md](HARDENING.md)).
- Credentials use `prompt` or `param` mode, not `save`.
- Topic and endpoint ACLs restrict writes to set-point topics.
- The gateway validates ranges and interlocks for every write, and echoes written values back.
- Stale detection (`staleMs`) is set for critical tags, so the operator sees when data stops flowing.
