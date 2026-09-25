/**
 * Hmi.WsSource: plain WebSocket source (SRS HMI-SRC-3). DOM-free: uses only
 * the global WebSocket, available in browsers and in Node 22.
 */
(function()
{
	var Hmi = (typeof globalThis !== 'undefined' ? globalThis : window).Hmi =
		(typeof globalThis !== 'undefined' ? globalThis : window).Hmi || {};

	function WsSource(def, mgr)
	{
		this.def = def;
		this.mgr = mgr;
		this.ws = null;
		this.closed = false;
		this.heartbeatTimer = null;
	};

	WsSource.prototype.onStatus = function(state, err) {};

	WsSource.prototype.connect = function()
	{
		var self = this;
		var def = this.def;
		var ws;

		try
		{
			ws = (def.protocols != null && def.protocols.length > 0) ?
				new WebSocket(def.url, def.protocols) : new WebSocket(def.url);
		}
		catch (e)
		{
			this.onStatus('error', e);

			return;
		}

		this.ws = ws;

		ws.onopen = function()
		{
			if (self.closed)
			{
				return;
			}

			if (def.initMessage != null && def.initMessage !== '')
			{
				try
				{
					ws.send(def.initMessage);
				}
				catch (e)
				{
					// Ignore; onerror/onclose will follow if the socket is bad.
				}
			}

			if (def.heartbeat != null && def.heartbeat.interval > 0)
			{
				self.heartbeatTimer = setInterval(function()
				{
					try
					{
						ws.send(def.heartbeat.message != null ? def.heartbeat.message : '');
					}
					catch (e)
					{
						// Ignore; a broken socket will trigger onclose.
					}
				}, def.heartbeat.interval);
			}

			self.onStatus('connected');
		};

		ws.onmessage = function(e)
		{
			if (self.closed)
			{
				return;
			}

			self.mgr.receive(def, e.data, {source: def});
		};

		ws.onerror = function(e)
		{
			self.onStatus('error', new Error('WebSocket error'));
		};

		ws.onclose = function()
		{
			if (!self.closed)
			{
				self.onStatus('disconnected');
			}
		};
	};

	WsSource.prototype.disconnect = function()
	{
		this.closed = true;

		if (this.heartbeatTimer != null)
		{
			clearInterval(this.heartbeatTimer);
			this.heartbeatTimer = null;
		}

		if (this.ws != null)
		{
			try
			{
				this.ws.onopen = null;
				this.ws.onmessage = null;
				this.ws.onerror = null;
				this.ws.onclose = null;
				this.ws.close();
			}
			catch (e)
			{
				// Ignore.
			}

			this.ws = null;
		}
	};

	WsSource.prototype.write = function(req)
	{
		var self = this;

		return new Promise(function(resolve, reject)
		{
			if (self.ws == null || self.ws.readyState !== 1 /* OPEN */)
			{
				reject(new Error('WebSocket source not connected'));

				return;
			}

			try
			{
				self.ws.send(req.message != null ? req.message : req.payload);
				resolve();
			}
			catch (e)
			{
				reject(e);
			}
		});
	};

	Hmi.WsSource = WsSource;
	Hmi.SourceManager.types['ws'] = WsSource;
})();
