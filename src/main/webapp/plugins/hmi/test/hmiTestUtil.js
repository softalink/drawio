// Shared helpers for the HmiSourceManager / source adapter tests
// (sources.*.test.js). Not itself a test file (registers no node:test
// cases), so it produces zero tests when node's runner picks it up.
var path = require('path');
var http = require('http');

var load = require('./load.js');

var SOURCE_FILES = [
	'core/HmiExpr.js',
	'core/HmiFormat.js',
	'core/HmiCondition.js',
	'core/HmiTransform.js',
	'core/HmiTagStore.js',
	'core/HmiSimulator.js',
	'core/HmiSchema.js',
	'sources/HmiPayload.js',
	'sources/HmiSourceManager.js',
	'sources/HmiMqttSource.js',
	'sources/HmiWsSource.js',
	'sources/HmiHttpSource.js',
	'sources/HmiSseSource.js',
	'sources/HmiHostSource.js',
	'runtime/HmiScriptHost.js'
];

function loadHmi()
{
	var Hmi = load(SOURCE_FILES);

	// Node has no node_modules reachable from src/main/webapp/plugins/hmi/
	// (the plugin ships no dependencies of its own); tests instead use the
	// `mqtt` package installed in etc/hmi/dev/node_modules (see
	// ARCHITECTURE.md / the HMI test brief).
	if (Hmi.MqttSource != null)
	{
		Hmi.MqttSource.loadLibrary = function()
		{
			var mqttPath = path.join(__dirname, '..', '..', '..', '..', '..', '..', 'etc', 'hmi', 'dev', 'node_modules', 'mqtt');
			var mqttLib = require(mqttPath);
			var root = (typeof globalThis !== 'undefined') ? globalThis : global;
			root.mqtt = mqttLib;

			return Promise.resolve(mqttLib);
		};
	}

	return Hmi;
};

function devServerModule()
{
	// etc/hmi/dev/server.js is outside src/main/webapp; resolve from the
	// repo root rather than assuming a relative layout.
	return require(path.join(__dirname, '..', '..', '..', '..', '..', '..', 'etc', 'hmi', 'dev', 'server.js'));
};

/**
 * Starts the dev server on random free ports (0 = any) and returns
 * {srv, ports}. Caller must call srv.stop() when done.
 */
function startDevServer(overrides)
{
	var dev = devServerModule();
	var srv = dev.createServer(Object.assign({
		mqttWsPort: 0,
		mqttTcpPort: 0,
		wsPort: 0,
		httpPort: 0
	}, overrides || {}));

	return srv.start().then(function(ports)
	{
		return {srv: srv, ports: ports};
	});
};

function waitFor(predicate, timeoutMs, intervalMs)
{
	timeoutMs = timeoutMs || 5000;
	intervalMs = intervalMs || 20;
	var start = Date.now();

	return new Promise(function(resolve, reject)
	{
		function check()
		{
			var result;

			try
			{
				result = predicate();
			}
			catch (e)
			{
				reject(e);

				return;
			}

			if (result)
			{
				resolve(result);
			}
			else if (Date.now() - start > timeoutMs)
			{
				reject(new Error('waitFor timed out after ' + timeoutMs + 'ms'));
			}
			else
			{
				setTimeout(check, intervalMs);
			}
		};

		check();
	});
};

function delay(ms)
{
	return new Promise(function(resolve) { setTimeout(resolve, ms); });
};

/**
 * A minimal EventSource polyfill over plain http, for Node test runs where
 * the global EventSource is unavailable without --experimental-eventsource
 * (SRS test note in ARCHITECTURE / task brief). Supports only what
 * HmiSseSource.js uses: addEventListener/removeEventListener, onopen,
 * onerror, close().
 */
function EventSourcePolyfill(url, opts)
{
	var self = this;
	this.url = url;
	this.readyState = 0;
	this._listeners = {};
	this.onopen = null;
	this.onerror = null;

	var req = http.get(url, {headers: {Accept: 'text/event-stream'}}, function(res)
	{
		self.readyState = 1;
		var buf = '';
		res.setEncoding('utf8');

		if (typeof self.onopen === 'function')
		{
			self.onopen({});
		}

		res.on('data', function(chunk)
		{
			buf += chunk;
			var parts = buf.split('\n\n');
			buf = parts.pop();

			for (var i = 0; i < parts.length; i++)
			{
				var eventName = 'message';
				var dataLines = [];
				var lines = parts[i].split('\n');

				for (var j = 0; j < lines.length; j++)
				{
					var line = lines[j];

					if (line.indexOf('event:') === 0)
					{
						eventName = line.substring(6).trim();
					}
					else if (line.indexOf('data:') === 0)
					{
						dataLines.push(line.substring(5).trim());
					}
				}

				if (dataLines.length > 0)
				{
					var evt = {data: dataLines.join('\n')};
					var list = self._listeners[eventName] || [];

					for (var k = 0; k < list.length; k++)
					{
						list[k](evt);
					}
				}
			}
		});

		res.on('error', function(e)
		{
			if (typeof self.onerror === 'function')
			{
				self.onerror(e);
			}
		});

		res.on('end', function()
		{
			self.readyState = 2;

			if (typeof self.onerror === 'function')
			{
				self.onerror(new Error('SSE stream ended'));
			}
		});
	});

	req.on('error', function(e)
	{
		self.readyState = 2;

		if (typeof self.onerror === 'function')
		{
			self.onerror(e);
		}
	});

	this._req = req;
};

EventSourcePolyfill.prototype.addEventListener = function(name, fn)
{
	this._listeners[name] = this._listeners[name] || [];
	this._listeners[name].push(fn);
};

EventSourcePolyfill.prototype.removeEventListener = function(name, fn)
{
	var arr = this._listeners[name];

	if (arr == null)
	{
		return;
	}

	var idx = arr.indexOf(fn);

	if (idx >= 0)
	{
		arr.splice(idx, 1);
	}
};

EventSourcePolyfill.prototype.close = function()
{
	this.readyState = 2;

	try
	{
		this._req.destroy();
	}
	catch (e)
	{
		// Ignore.
	}
};

module.exports = {
	loadHmi: loadHmi,
	startDevServer: startDevServer,
	waitFor: waitFor,
	delay: delay,
	EventSourcePolyfill: EventSourcePolyfill
};
