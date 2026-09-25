/**
 * Hmi.MqttSource: MQTT over WebSocket source (SRS HMI-SRC-2), using the
 * global `mqtt` (MQTT.js). Registered as SourceManager.types['mqtt'].
 *
 * Not in the DOM-free module list (ARCHITECTURE.md §1): in the browser it
 * lazy-loads lib/mqtt.min.js via a <script> tag. In Node, `mqtt` is instead
 * required lazily (tests may override Hmi.MqttSource.loadLibrary).
 */
(function()
{
	var Hmi = (typeof globalThis !== 'undefined' ? globalThis : window).Hmi =
		(typeof globalThis !== 'undefined' ? globalThis : window).Hmi || {};

	var root = (typeof globalThis !== 'undefined') ? globalThis : window;

	var libPromise = null;

	function isBrowser()
	{
		return typeof document !== 'undefined' && typeof document.createElement === 'function';
	};

	/**
	 * Resolves once the global `mqtt` is available. Loads it exactly once.
	 * Overridable (e.g. by Node tests) via Hmi.MqttSource.loadLibrary.
	 */
	function defaultLoadLibrary()
	{
		if (typeof root.mqtt !== 'undefined')
		{
			return Promise.resolve(root.mqtt);
		}

		if (libPromise != null)
		{
			return libPromise;
		}

		if (isBrowser())
		{
			libPromise = new Promise(function(resolve, reject)
			{
				var script = document.createElement('script');
				script.setAttribute('type', 'text/javascript');
				script.setAttribute('src', Hmi.basePath + 'lib/mqtt.min.js');

				script.onload = function()
				{
					if (typeof root.mqtt !== 'undefined')
					{
						resolve(root.mqtt);
					}
					else
					{
						reject(new Error('mqtt.min.js loaded but did not define window.mqtt'));
					}
				};

				script.onerror = function()
				{
					reject(new Error('Failed to load ' + script.src));
				};

				document.getElementsByTagName('head')[0].appendChild(script);
			});
		}
		else
		{
			// Node: require the real mqtt package (used by tests, which have
			// it available via etc/hmi/dev/node_modules).
			try
			{
				var mqttMod = require('mqtt');
				root.mqtt = mqttMod;
				libPromise = Promise.resolve(mqttMod);
			}
			catch (e)
			{
				libPromise = Promise.reject(new Error('mqtt module not available: ' + e.message));
			}
		}

		return libPromise;
	};

	function randomClientId()
	{
		return 'hmi_' + Math.random().toString(16).substring(2, 10);
	};

	function MqttSource(def, mgr)
	{
		this.def = def;
		this.mgr = mgr;
		this.client = null;
		this.closed = false;
	};

	MqttSource.prototype.connect = function()
	{
		var self = this;
		var def = this.def;

		Hmi.MqttSource.loadLibrary().then(function(mqttLib)
		{
			if (self.closed)
			{
				return;
			}

			var options = {
				clientId: def.clientId || randomClientId(),
				username: def.username,
				password: def.password,
				clean: def.cleanSession !== false,
				keepalive: def.keepalive != null ? def.keepalive : 30,
				protocolVersion: def.protocolVersion || 4,
				reconnectPeriod: 0 // the SourceManager owns reconnect/backoff
			};

			var client;

			try
			{
				client = mqttLib.connect(def.url, options);
			}
			catch (e)
			{
				self.onStatus('error', e);

				return;
			}

			self.client = client;

			client.on('connect', function()
			{
				if (self.closed)
				{
					return;
				}

				var topics = def.topics || [];

				for (var i = 0; i < topics.length; i++)
				{
					var t = topics[i];
					client.subscribe(t.filter, {qos: t.qos != null ? t.qos : 0});
				}

				self.onStatus('connected');
			});

			client.on('message', function(topic, payloadBuf)
			{
				if (self.closed)
				{
					return;
				}

				var payload;

				try
				{
					payload = payloadBuf.toString('utf8');
				}
				catch (e)
				{
					payload = String(payloadBuf);
				}

				self.mgr.receive(def, payload, {topic: topic, source: def});
			});

			client.on('error', function(err)
			{
				self.onStatus('error', err);
			});

			client.on('close', function()
			{
				if (!self.closed)
				{
					self.onStatus('disconnected');
				}
			});
		}, function(err)
		{
			self.onStatus('error', err);
		});
	};

	// Default no-op; SourceManager overwrites this per instance right after
	// construction, before connect() is called.
	MqttSource.prototype.onStatus = function(state, err) {};

	MqttSource.prototype.disconnect = function()
	{
		this.closed = true;

		if (this.client != null)
		{
			try
			{
				this.client.end(true);
			}
			catch (e)
			{
				// Ignore.
			}

			this.client = null;
		}
	};

	MqttSource.prototype.write = function(req)
	{
		var self = this;

		return new Promise(function(resolve, reject)
		{
			if (self.client == null)
			{
				reject(new Error('MQTT source not connected'));

				return;
			}

			var payload = (req.payload != null) ? req.payload : '';

			self.client.publish(req.topic, payload, {qos: req.qos != null ? req.qos : 0, retain: !!req.retain},
				function(err)
				{
					if (err)
					{
						reject(err);
					}
					else
					{
						resolve();
					}
				});
		});
	};

	Hmi.MqttSource = MqttSource;
	Hmi.MqttSource.loadLibrary = defaultLoadLibrary;

	Hmi.SourceManager.types['mqtt'] = MqttSource;
})();
