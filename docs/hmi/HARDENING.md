# HMI Security Hardening Guide

This guide covers deploying draw.io HMI (the `plugins/hmi` plugin) safely. It maps to SRS §4.3 (HMI-SEC-1..7) and §6.4.

> **Safety notice:** HMI screens are for supervisory visualization only. Do not use them for safety-critical or real-time control. Interlocks, authorization and range checks belong in the control system and the gateway, never only in the screen.

## 1. Deployment configuration (`DRAWIO_CONFIG.hmi`)

Set these in `js/PreConfig.js`, or through the Docker image's configuration mechanism:

```js
window.DRAWIO_CONFIG = {
	hmi: {
		// Only these endpoints may be connected (prefixes, or /regex/)
		allowedEndpoints: ['wss://broker.plant.example.com/', 'https://gateway.plant.example.com/api/'],
		// Content-Security-Policy connect-src additions (dev and desktop builds)
		connectSrc: 'wss://broker.plant.example.com https://gateway.plant.example.com',
		// User scripts: 'off' (recommended), 'prompt' (default) or 'on'
		scripts: 'off',
		scriptTimeout: 50,
		// Runtime user roles (or use the embed API / hmi-role URL parameter)
		roles: ['operator'],
		allowUrlRoles: false,
		// Cells the user lacks roles for: 'hide' (default) or 'disable'
		unauthorized: 'hide',
		// Values for ${name} placeholders (tokens should come from your SSO)
		params: {},
		maxRate: 30,
		forwardWrites: false
	}
};
```

| Setting | Requirement | Notes |
|---|---|---|
| `allowedEndpoints` | HMI-SEC-1 | Every connect attempt is checked, including URLs rewritten by pre-connect scripts. A refused connection shows *Endpoint not allowed*, with credentials stripped from the message. |
| `scripts` | HMI-SEC-2 | See §3. A document can restrict this further with `"scripts": "off"`, but can never enable scripts. |
| `roles`, `allowUrlRoles` | HMI-SEC-5 | Set `allowUrlRoles: false` in production. URL roles are only a convenience for kiosks. |

## 2. Content-Security-Policy

The HMI connects from the browser, so the page CSP must allow the endpoints:

- **Self-hosted web app.** Serve a `Content-Security-Policy` header whose `connect-src` includes your broker and gateway origins. If scripts are enabled, add `worker-src blob:` (or `child-src blob:`) for the script sandbox.
- **Development (`?dev=1`).** `js/diagramly/Devel.js` adds `DRAWIO_CONFIG.hmi.connectSrc`, or localhost when unset, and `blob:` workers when the HMI plugin is requested.
- **Desktop (Electron).** `js/bootstrap.js` appends `DRAWIO_CONFIG.hmi.connectSrc` to the Electron meta CSP. The desktop main process (a separate repository) must load the same configuration.
- app.diagrams.net is not a supported target for live data.

## 3. Scripts

Parser scripts, pre-connect scripts, script transforms and `script` actions run in a **dedicated Web Worker** (`runtime/HmiScriptHost.js`), under these restrictions:

- They have no access to the draw.io DOM, the diagram model, cookies of the draw.io origin, or source credentials.
- They talk to the page only through a message API: `setProps`, `writeTag`, `emit`, `notify`, `log`, and `getTag`, which reads from a snapshot.
- Each call has a watchdog (default 50 ms). A script that overruns has its worker terminated and recreated.
- Under the `prompt` policy, the user is asked once per file. The decision is remembered, as a hash, in `localStorage['.hmi-script-trust']`.

Binding and condition **expressions** (`value * 1.8 + 32`) are not scripts. They are interpreted by a purpose-built parser (`core/HmiExpr.js`) that has no `eval`, no global access, and no prototype access, and are always allowed (HMI-SEC-3).

Recommendation: keep `scripts: 'off'`. Do protocol translation in the gateway (see [GATEWAY_GUIDE.md](GATEWAY_GUIDE.md)).

## 4. Credentials

The per-source `credentials.mode` setting chooses how credentials are obtained:

| Mode | Behaviour | Use |
|---|---|---|
| `none` | No credentials | Anonymous read-only brokers |
| `prompt` | Asked at runtime and kept in memory for the session | Operator workstations |
| `param` | Read from `${param}`: URL parameter, localStorage, or `DRAWIO_CONFIG.hmi.params` | SSO integration, kiosks |
| `save` | Stored **in the diagram file** | Avoid; the UI shows a warning |

Credentials are never written to diagnostics logs, exports, or postMessage events (HMI-SEC-6). The raw-message ring buffer redacts fields that look like passwords, tokens, secrets or API keys.

## 5. Untrusted files

- Opening a file in the **editor** never connects to its sources. Connections start only through *Live Preview* or *Run Screen* (HMI-SEC-7).
- `?hmi=run` runs a file immediately. Only publish runtime URLs for files from trusted locations. Combine this with `allowedEndpoints` so a malicious file cannot reach arbitrary hosts.
- Label values from tags are escaped. HTML labels are sanitized with DOMPurify (`Graph.sanitizeHtml`), and URLs from actions pass `Graph.sanitizeLink`. Faceplate URLs are shown in sandboxed iframes without `allow-same-origin`.

## 6. Broker and gateway side (mandatory)

- **TLS.** Use `wss://` / `https://` with valid certificates.
- **Authentication.** Use per-user or per-role credentials. Avoid one shared account for all operators.
- **ACLs.** Operators may subscribe to plant data and publish only to set-point topics. Viewers must not publish at all.
- **Validation.** The gateway validates value types, ranges, rate limits and interlocks for every write.
- **Audit.** Log writes on the gateway. The HMI's own audit log (Diagnostics → Writes) is session-local only.

## 7. Operational

- For kiosks, use `hmi-reload=<minutes>` to recover from long-running browser degradation.
- For critical tags, set `staleMs` so loss of data is visible (dashed outline, `?` badge).
- Confirmations are enabled by default for control widgets (`hmiConfirm=1`). Keep them on for equipment commands.
