/**
 * Hmi.SourceManager: owns the data-source connections (SRS HMI-SRC), the
 * per-source recent-message ring buffer (HMI-DIA-1) and the message ->
 * Hmi.TagStore pipeline (parser script -> Hmi.Payload.map -> prefix ->
 * tags.setMany). DOM-free (ARCHITECTURE.md §1).
 */
(function()
{
	var Hmi = (typeof globalThis !== 'undefined' ? globalThis : window).Hmi =
		(typeof globalThis !== 'undefined' ? globalThis : window).Hmi || {};

	var RECENT_LIMIT = 100;
	var TRUNCATE_BYTES = 2048;
	var MAX_BACKOFF_MS = 30000;
	var BASE_BACKOFF_MS = 1000;

	// Field names that must never appear in logged/recorded text.
	var REDACT_KEYS = /"?(password|passwd|pwd|token|secret|authorization|apikey|api_key)"?\s*[:=]\s*"?[^",}\s]*/gi;

	function defaultLog(level, category, message, data)
	{
		if (typeof console !== 'undefined' && console[level])
		{
			console[level]('[' + category + '] ' + message, data || '');
		}
	};

	function noop() {};

	function alwaysAllow()
	{
		return true;
	};

	function identityResolve(s)
	{
		return s;
	};

	function noCredentials()
	{
		return Promise.resolve({});
	};

	/**
	 * Redacts anything that looks like a credential field from a string,
	 * and truncates it to `TRUNCATE_BYTES` (bytes, approximated as UTF-16
	 * code units, which is adequate for a diagnostics preview).
	 */
	function redactAndTruncate(text)
	{
		if (text == null)
		{
			return text;
		}

		var str = (typeof text === 'string') ? text : safeStringify(text);
		str = str.replace(REDACT_KEYS, function(m, key)
		{
			return '"' + key + '":"***"';
		});

		if (str.length > TRUNCATE_BYTES)
		{
			str = str.substring(0, TRUNCATE_BYTES) + '…';
		}

		return str;
	};

	function safeStringify(v)
	{
		try
		{
			return JSON.stringify(v);
		}
		catch (e)
		{
			return String(v);
		}
	};

	function stripCredentialsFromUrl(url)
	{
		if (url == null)
		{
			return url;
		}

		try
		{
			return String(url).replace(/\/\/[^@\/]*@/, '//***@');
		}
		catch (e)
		{
			return url;
		}
	};

	function shallowCopy(obj)
	{
		var out = {};

		for (var k in obj)
		{
			if (Object.prototype.hasOwnProperty.call(obj, k))
			{
				out[k] = obj[k];
			}
		}

		return out;
	};

	/**
	 * new SourceManager({tags, log, allow(url) -> bool, resolve(str) -> str,
	 *                     scripts, credentials(source) -> Promise})
	 */
	function SourceManager(opts)
	{
		opts = opts || {};
		this.tags = opts.tags;
		this.log = opts.log || defaultLog;
		this.allow = opts.allow || alwaysAllow;
		this.resolve = opts.resolve || identityResolve;
		this.scripts = opts.scripts || null;
		this.credentialsFn = opts.credentials || noCredentials;

		this.sources = {};       // id -> def
		this.instances = {};     // id -> {instance, def, state, received, errors, lastTs, lastError, attempts, timer}
		this.recentBuf = {};     // id -> [{ts, dir, topic, payload}]
		this.recvQueues = {};    // id -> Promise chain, to preserve per-source message order
		this.listeners = {status: [], updates: [], error: []};
		this.running = false;
	};

	SourceManager.types = {};

	SourceManager.prototype.on = function(event, fn)
	{
		if (this.listeners[event] == null)
		{
			this.listeners[event] = [];
		}

		this.listeners[event].push(fn);
	};

	SourceManager.prototype.off = function(event, fn)
	{
		var arr = this.listeners[event];

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

	SourceManager.prototype.emit = function(event, payload)
	{
		var arr = this.listeners[event];

		if (arr == null)
		{
			return;
		}

		// Copy in case a listener adds/removes listeners during dispatch.
		var list = arr.slice();

		for (var i = 0; i < list.length; i++)
		{
			try
			{
				list[i](payload);
			}
			catch (e)
			{
				this.log('error', 'hmi-src', 'listener for "' + event + '" threw', e);
			}
		}
	};

	/**
	 * configure(sources): replaces the source definitions. If running,
	 * restarts sources that changed and stops ones that were removed.
	 */
	SourceManager.prototype.configure = function(sources)
	{
		var newDefs = {};
		var i;

		for (i = 0; i < (sources || []).length; i++)
		{
			var def = sources[i];

			if (def != null && def.id != null)
			{
				newDefs[def.id] = def;
			}
		}

		if (this.running)
		{
			for (var oldId in this.sources)
			{
				if (Object.prototype.hasOwnProperty.call(this.sources, oldId) && newDefs[oldId] == null)
				{
					this.stopOne(oldId);
				}
			}
		}

		this.sources = newDefs;

		if (this.running)
		{
			for (var id in this.sources)
			{
				if (!Object.prototype.hasOwnProperty.call(this.sources, id))
				{
					continue;
				}

				var d = this.sources[id];
				var existing = this.instances[id];

				if (existing == null)
				{
					if (d.enabled !== false)
					{
						this.startOne(d);
					}
				}
				else if (JSON.stringify(existing.def) !== JSON.stringify(d))
				{
					this.stopOne(id);

					if (d.enabled !== false)
					{
						this.startOne(d);
					}
				}
			}
		}
	};

	SourceManager.prototype.start = function()
	{
		this.running = true;

		for (var id in this.sources)
		{
			if (Object.prototype.hasOwnProperty.call(this.sources, id) && this.sources[id].enabled !== false)
			{
				this.startOne(this.sources[id]);
			}
		}
	};

	SourceManager.prototype.stop = function()
	{
		this.running = false;

		for (var id in this.instances)
		{
			if (Object.prototype.hasOwnProperty.call(this.instances, id))
			{
				this.stopOne(id);
			}
		}
	};

	SourceManager.prototype.restart = function(id)
	{
		var def = this.sources[id];

		if (def == null)
		{
			return;
		}

		this.stopOne(id);

		if (this.running && def.enabled !== false)
		{
			this.startOne(def);
		}
	};

	SourceManager.prototype.stopOne = function(id)
	{
		var entry = this.instances[id];

		if (entry == null)
		{
			return;
		}

		if (entry.timer != null)
		{
			clearTimeout(entry.timer);
			entry.timer = null;
		}

		entry.stopped = true;

		try
		{
			if (entry.instance != null && typeof entry.instance.disconnect === 'function')
			{
				entry.instance.disconnect();
			}
		}
		catch (e)
		{
			this.log('error', 'hmi-src', 'disconnect threw for source ' + id, e);
		}

		delete this.instances[id];
	};

	function backoffDelay(attempt)
	{
		var raw = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * Math.pow(2, attempt));
		var jitter = raw * 0.2;

		return Math.max(0, raw - jitter + Math.random() * 2 * jitter);
	};

	SourceManager.prototype.applyPreConnect = function(def)
	{
		var self = this;

		if (def.preConnect == null || def.preConnect === '' || this.scripts == null)
		{
			return Promise.resolve(def);
		}

		return this.scripts.run(def.preConnect, {source: shallowCopy(def)}, {}).then(function(result)
		{
			if (result && typeof result === 'object')
			{
				var merged = shallowCopy(def);

				if (result.url != null) merged.url = result.url;
				if (result.headers != null) merged.headers = result.headers;
				if (result.username != null) merged.username = result.username;
				if (result.password != null) merged.password = result.password;
				if (result.token != null) merged.token = result.token;

				return merged;
			}

			return def;
		}, function(err)
		{
			self.log('warn', 'hmi-src', 'preConnect script failed for source ' + def.id, String(err));

			return def;
		});
	};

	SourceManager.prototype.resolveDef = function(def)
	{
		var out = shallowCopy(def);
		var self = this;

		if (out.url != null)
		{
			out.url = self.resolve(out.url);
		}

		if (out.headers != null)
		{
			var headers = {};

			for (var k in out.headers)
			{
				if (Object.prototype.hasOwnProperty.call(out.headers, k))
				{
					headers[k] = self.resolve(String(out.headers[k]));
				}
			}

			out.headers = headers;
		}

		if (out.body != null && typeof out.body === 'string')
		{
			out.body = self.resolve(out.body);
		}

		if (out.topics != null)
		{
			var topics = [];

			for (var i = 0; i < out.topics.length; i++)
			{
				var t = out.topics[i];
				topics.push({filter: self.resolve(t.filter), qos: t.qos});
			}

			out.topics = topics;
		}

		return out;
	};

	SourceManager.prototype.setState = function(entry, state, extra)
	{
		entry.state = state;

		if (extra)
		{
			if (extra.lastError !== undefined) entry.lastError = extra.lastError;
		}

		this.emit('status', this.statusEntry(entry));
	};

	SourceManager.prototype.statusEntry = function(entry)
	{
		return {
			id: entry.def.id,
			name: entry.def.name,
			type: entry.def.type,
			state: entry.state,
			received: entry.received,
			errors: entry.errors,
			lastTs: entry.lastTs,
			lastError: entry.lastError
		};
	};

	SourceManager.prototype.startOne = function(def)
	{
		var self = this;
		var entry = {
			def: def,
			state: 'disconnected',
			received: 0,
			errors: 0,
			lastTs: null,
			lastError: null,
			attempts: 0,
			timer: null,
			instance: null,
			stopped: false
		};

		this.instances[def.id] = entry;
		this.recentBuf[def.id] = this.recentBuf[def.id] || [];

		this.connectOne(entry);
	};

	SourceManager.prototype.connectOne = function(entry)
	{
		var self = this;
		var def = entry.def;

		if (entry.stopped)
		{
			return;
		}

		var resolved = this.resolveDef(def);

		if (!this.allow(resolved.url))
		{
			entry.errors++;
			this.setState(entry, 'error', {lastError: 'Endpoint not allowed: ' + stripCredentialsFromUrl(resolved.url)});
			this.emit('error', {source: def, error: 'Endpoint not allowed'});

			return;
		}

		this.setState(entry, 'connecting');

		this.applyPreConnect(resolved).then(function(afterPreConnect)
		{
			if (entry.stopped)
			{
				return;
			}

			var resolvedAgain = self.resolveDef(afterPreConnect);

			if (!self.allow(resolvedAgain.url))
			{
				entry.errors++;
				self.setState(entry, 'error', {lastError: 'Endpoint not allowed: ' + stripCredentialsFromUrl(resolvedAgain.url)});
				self.emit('error', {source: def, error: 'Endpoint not allowed'});

				return;
			}

			return self.credentialsFn(resolvedAgain).then(function(creds)
			{
				if (entry.stopped)
				{
					return;
				}

				creds = creds || {};

				if (creds.username != null) resolvedAgain.username = creds.username;
				if (creds.password != null) resolvedAgain.password = creds.password;
				if (creds.token != null) resolvedAgain.token = creds.token;

				var Ctor = SourceManager.types[def.type];

				if (Ctor == null)
				{
					entry.errors++;
					self.setState(entry, 'error', {lastError: 'Unknown source type: ' + def.type});

					return;
				}

				entry.resolvedDef = resolvedAgain;
				var instance = new Ctor(resolvedAgain, self);
				entry.instance = instance;

				instance.onStatus = function(state, err)
				{
					self.handleInstanceStatus(entry, state, err);
				};

				try
				{
					instance.connect();
				}
				catch (e)
				{
					self.handleInstanceStatus(entry, 'error', e);
				}
			});
		})['catch'](function(err)
		{
			if (entry.stopped)
			{
				return;
			}

			entry.errors++;
			self.setState(entry, 'error', {lastError: String(err && err.message || err)});
			self.scheduleReconnect(entry);
		});
	};

	SourceManager.prototype.handleInstanceStatus = function(entry, state, err)
	{
		if (entry.stopped)
		{
			return;
		}

		if (state === 'connected')
		{
			entry.attempts = 0;
			this.setState(entry, 'connected');
		}
		else if (state === 'error' || state === 'disconnected')
		{
			if (err != null)
			{
				entry.errors++;
				entry.lastError = String(err && err.message || err);
			}

			this.setState(entry, 'error', {lastError: entry.lastError});

			try
			{
				if (entry.instance != null && typeof entry.instance.disconnect === 'function')
				{
					entry.instance.disconnect();
				}
			}
			catch (e)
			{
				// Ignore.
			}

			this.scheduleReconnect(entry);
		}
		else
		{
			this.setState(entry, state);
		}
	};

	SourceManager.prototype.scheduleReconnect = function(entry)
	{
		var self = this;

		if (entry.stopped)
		{
			return;
		}

		var maxAttempts = (entry.def.reconnect && entry.def.reconnect.maxAttempts) || 0;

		entry.attempts++;

		if (maxAttempts > 0 && entry.attempts > maxAttempts)
		{
			this.log('warn', 'hmi-src', 'source ' + entry.def.id + ' giving up after ' + entry.attempts + ' attempts');

			return;
		}

		var delay = backoffDelay(entry.attempts - 1);

		entry.timer = setTimeout(function()
		{
			entry.timer = null;
			self.connectOne(entry);
		}, delay);
	};

	SourceManager.prototype.status = function()
	{
		var out = [];

		for (var id in this.instances)
		{
			if (Object.prototype.hasOwnProperty.call(this.instances, id))
			{
				out.push(this.statusEntry(this.instances[id]));
			}
		}

		return out;
	};

	SourceManager.prototype.recent = function(id)
	{
		return (this.recentBuf[id] || []).slice();
	};

	SourceManager.prototype.recordRecent = function(id, dir, topic, payload)
	{
		var buf = this.recentBuf[id];

		if (buf == null)
		{
			buf = this.recentBuf[id] = [];
		}

		buf.push({
			ts: Date.now(),
			dir: dir,
			topic: topic,
			payload: redactAndTruncate(payload)
		});

		if (buf.length > RECENT_LIMIT)
		{
			buf.splice(0, buf.length - RECENT_LIMIT);
		}
	};

	SourceManager.prototype.write = function(sourceId, req)
	{
		var entry = this.instances[sourceId];

		if (entry == null || entry.instance == null)
		{
			return Promise.reject(new Error('Source not connected: ' + sourceId));
		}

		this.recordRecent(sourceId, 'out', req.topic || req.url, req.payload || req.body || req.message);

		return entry.instance.write(req);
	};

	/**
	 * Called by source instances: mgr.receive(source, message, ctx)
	 * source: the resolved def this instance was created with
	 * ctx: {topic, url, source}
	 *
	 * Runs the parser script (if any) then Hmi.Payload.map, applies the
	 * prefix and calls tags.setMany. Per-source ordering is preserved with
	 * a promise queue even though the parser may be async.
	 */
	SourceManager.prototype.receive = function(source, message, ctx)
	{
		var self = this;
		var entry = this.findEntryByDef(source);
		ctx = ctx || {};

		if (entry != null)
		{
			entry.received++;
			entry.lastTs = Date.now();
			this.recordRecent(source.id, 'in', ctx.topic, message);
		}

		var prevQueue = this.recvQueues[source.id] || Promise.resolve();

		var nextQueue = prevQueue['catch'](noop).then(function()
		{
			return self.processMessage(source, message, ctx, entry);
		});

		this.recvQueues[source.id] = nextQueue;

		return nextQueue;
	};

	SourceManager.prototype.findEntryByDef = function(def)
	{
		return this.instances[def.id];
	};

	SourceManager.prototype.processMessage = function(source, message, ctx, entry)
	{
		var self = this;

		return this.applyParser(source, message, ctx).then(function(mapped)
		{
			if (mapped === false)
			{
				return;
			}

			var updates = mapped;

			if (source.prefix)
			{
				updates = updates.map(function(u)
				{
					return {tag: source.prefix + u.tag, value: u.value, ts: u.ts, quality: u.quality, source: source.id};
				});
			}
			else
			{
				updates = updates.map(function(u)
				{
					return {tag: u.tag, value: u.value, ts: u.ts, quality: u.quality, source: source.id};
				});
			}

			if (self.tags != null && updates.length > 0)
			{
				self.tags.setMany(updates);
			}

			self.emit('updates', updates);

			return updates;
		})['catch'](function(err)
		{
			if (entry != null)
			{
				entry.errors++;
				entry.lastError = String(err && err.message || err);
			}

			self.log('error', 'hmi-src', 'message handling failed for source ' + source.id, String(err));
			self.emit('error', {source: source, error: err});
		});
	};

	/**
	 * Runs the parser script (if configured) and normalises its result, or
	 * falls back to Hmi.Payload.map.
	 * Returns a Promise<[{tag, value, ts, quality}] | false>.
	 */
	SourceManager.prototype.applyParser = function(source, message, ctx)
	{
		var self = this;

		if (source.parser != null && source.parser !== '' && this.scripts != null)
		{
			return this.scripts.run(source.parser, {message: message, context: ctx}, {}).then(function(result)
			{
				if (result === false)
				{
					return [];
				}

				if (result == null)
				{
					return Hmi.Payload.map(message, source.format, ctx);
				}

				if (Array.isArray(result) && result.length > 0 && result[0] != null &&
					typeof result[0] === 'object' && ('tag' in result[0]))
				{
					return result;
				}

				// Otherwise treat the script's result as a replacement message
				// and re-map it through the configured payload format.
				return Hmi.Payload.map(result, source.format, ctx);
			});
		}

		try
		{
			return Promise.resolve(Hmi.Payload.map(message, source.format, ctx));
		}
		catch (e)
		{
			return Promise.reject(e);
		}
	};

	Hmi.SourceManager = SourceManager;
	Hmi.SourceManager._redactAndTruncate = redactAndTruncate; // exposed for tests
	Hmi.SourceManager._backoffDelay = backoffDelay; // exposed for tests
})();
