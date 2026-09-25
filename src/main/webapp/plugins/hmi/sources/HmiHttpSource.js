/**
 * Hmi.HttpSource: HTTP polling source (SRS HMI-SRC-4). DOM-free: uses only
 * the global fetch/AbortController, available in browsers and in Node 22.
 */
(function()
{
	var Hmi = (typeof globalThis !== 'undefined' ? globalThis : window).Hmi =
		(typeof globalThis !== 'undefined' ? globalThis : window).Hmi || {};

	var MIN_INTERVAL = 250;

	function HttpSource(def, mgr)
	{
		this.def = def;
		this.mgr = mgr;
		this.closed = false;
		this.timer = null;
		this.inFlight = false;
		this.firstPoll = true;
		this.connectedFired = false;
	};

	HttpSource.prototype.onStatus = function(state, err) {};

	HttpSource.prototype.connect = function()
	{
		this.closed = false;
		this.onStatus('connected'); // HTTP has no persistent connection; "connected" means polling started
		this.connectedFired = true;
		this.scheduleNext(0);
	};

	HttpSource.prototype.scheduleNext = function(delay)
	{
		var self = this;

		if (this.closed)
		{
			return;
		}

		this.timer = setTimeout(function()
		{
			self.timer = null;
			self.poll();
		}, delay);
	};

	HttpSource.prototype.poll = function()
	{
		var self = this;
		var def = this.def;

		if (this.closed || this.inFlight)
		{
			return;
		}

		if (this.firstPoll && def.skipFirst)
		{
			this.firstPoll = false;
			this.afterPoll();

			return;
		}

		this.firstPoll = false;
		this.inFlight = true;

		var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
		var timeoutId = null;

		if (controller != null && def.timeout > 0)
		{
			timeoutId = setTimeout(function() { controller.abort(); }, def.timeout);
		}

		var fetchOpts = {
			method: def.method || 'GET',
			headers: def.headers || undefined,
			body: (def.method && def.method.toUpperCase() !== 'GET') ? (def.body || undefined) : undefined,
			credentials: def.withCredentials ? 'include' : 'same-origin'
		};

		if (controller != null)
		{
			fetchOpts.signal = controller.signal;
		}

		fetch(def.url, fetchOpts).then(function(resp)
		{
			if (timeoutId != null) clearTimeout(timeoutId);

			return resp.text().then(function(text)
			{
				return {resp: resp, text: text};
			});
		}).then(function(r)
		{
			if (self.closed)
			{
				return;
			}

			var body = parseBody(r.resp, r.text);
			self.mgr.receive(def, body, {source: def, url: def.url, status: r.resp.status});
			self.inFlight = false;
			self.afterPoll();
		})['catch'](function(err)
		{
			if (timeoutId != null) clearTimeout(timeoutId);
			self.inFlight = false;

			if (self.closed)
			{
				return;
			}

			self.onStatus('error', err);
		});
	};

	function parseBody(resp, text)
	{
		var contentType = '';

		try
		{
			contentType = (resp.headers && resp.headers.get) ? (resp.headers.get('content-type') || '') : '';
		}
		catch (e)
		{
			// Ignore.
		}

		if (contentType.indexOf('json') >= 0)
		{
			try
			{
				return JSON.parse(text);
			}
			catch (e)
			{
				return text;
			}
		}

		try
		{
			return JSON.parse(text);
		}
		catch (e)
		{
			return text;
		}
	};

	HttpSource.prototype.afterPoll = function()
	{
		var def = this.def;

		if (this.closed)
		{
			return;
		}

		if (def.once)
		{
			return;
		}

		this.scheduleNext(Math.max(MIN_INTERVAL, def.interval || 1000));
	};

	HttpSource.prototype.disconnect = function()
	{
		this.closed = true;

		if (this.timer != null)
		{
			clearTimeout(this.timer);
			this.timer = null;
		}
	};

	HttpSource.prototype.write = function(req)
	{
		var def = this.def;
		var url = req.url || def.url;
		var method = req.method || 'POST';
		var headers = req.headers || def.headers || undefined;
		var body = (req.body !== undefined) ? req.body : (req.payload !== undefined ? req.payload : undefined);

		return fetch(url, {
			method: method,
			headers: headers,
			body: body,
			credentials: def.withCredentials ? 'include' : 'same-origin'
		}).then(function(resp)
		{
			return resp.text().then(function(text)
			{
				return parseBody(resp, text);
			});
		});
	};

	Hmi.HttpSource = HttpSource;
	Hmi.SourceManager.types['http'] = HttpSource;
})();
