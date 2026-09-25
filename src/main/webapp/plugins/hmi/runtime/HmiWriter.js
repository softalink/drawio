/**
 * Hmi.Writer: validated tag writes with audit logging (SRS HMI-WRT-1..4).
 * DOM-light: receives `rt` (ARCHITECTURE.md §3.6) and never touches the DOM
 * itself.
 */
(function()
{
	var Hmi = (typeof globalThis !== 'undefined' ? globalThis : window).Hmi =
		(typeof globalThis !== 'undefined' ? globalThis : window).Hmi || {};

	var AUDIT_LIMIT = 500;
	var DEFAULT_TIMEOUT = 5000;

	function Writer(rt)
	{
		this.rt = rt;
		this.auditLog = [];
		this.pending = {}; // tag -> [{resolve, timer, expectValue, mode, previous}]
	};

	Writer.prototype.audit = function(entry)
	{
		entry.ts = entry.ts != null ? entry.ts : Date.now();
		this.auditLog.push(entry);

		if (this.auditLog.length > AUDIT_LIMIT)
		{
			this.auditLog.shift();
		}

		var rt = this.rt;

		if (rt != null && typeof rt.log === 'function')
		{
			rt.log(entry.outcome === 'error' ? 'warn' : 'info', 'write',
				'tag ' + entry.tag + ' -> ' + safeDescribeValue(entry.value) + ' (' + entry.outcome + ')',
				{ tag: entry.tag, cellId: entry.cellId, outcome: entry.outcome });
		}
	};

	function safeDescribeValue(v)
	{
		// Values themselves are fine to log (SRS: never log CREDENTIALS).
		if (v == null)
		{
			return String(v);
		}

		if (typeof v === 'object')
		{
			try
			{
				return JSON.stringify(v);
			}
			catch (e)
			{
				return '[object]';
			}
		}

		return String(v);
	};

	/**
	 * Substitutes ${value} etc. into a template. When the template is JSON
	 * text with ${value} unquoted (e.g. '{"value":${value}}'), the value is
	 * JSON-encoded so the result stays valid JSON; otherwise plain strings
	 * are used.
	 */
	function substituteTemplate(template, tag, value, ts)
	{
		if (template == null)
		{
			return template;
		}

		return template.replace(/\$\{(value|tag|ts)\}/g, function(m, name)
		{
			if (name === 'tag')
			{
				return tag;
			}

			if (name === 'ts')
			{
				return String(ts);
			}

			// value
			if (typeof value === 'string')
			{
				// Detect whether ${value} sits inside quotes already (a JSON
				// string field) by checking the char right before the match.
				var idx = template.indexOf(m);
				var before = template.charAt(idx - 1);

				if (before === '"')
				{
					return value;
				}

				return JSON.stringify(value);
			}

			if (typeof value === 'object')
			{
				return JSON.stringify(value);
			}

			return String(value);
		});
	};

	function typeMatches(type, value)
	{
		if (type == null)
		{
			return true;
		}

		switch (type)
		{
			case 'number':
			case 'integer':
				return typeof value === 'number' && !isNaN(value);

			case 'boolean':
				return typeof value === 'boolean';

			case 'string':
				return typeof value === 'string';

			default:
				return true;
		}
	};

	/**
	 * write(tag, value, opts) -> Promise
	 * opts: {cell, confirm}
	 */
	Writer.prototype.write = function(tag, value, opts)
	{
		opts = opts || {};
		var rt = this.rt;
		var self = this;
		var def = (rt.tags != null && typeof rt.tags.getDef === 'function') ? rt.tags.getDef(tag) : null;
		var cellId = opts.cell != null ? (opts.cell.id != null ? opts.cell.id : opts.cell) : undefined;

		function refuse(reason)
		{
			self.audit({ tag: tag, value: value, cellId: cellId, outcome: 'refused', error: reason });

			return Promise.reject(new Error(reason));
		};

		if (rt.mode === 'view')
		{
			return refuse('runtime is in view-only mode');
		}

		var allowUndeclared = rt.config != null && rt.config.runtime != null && rt.config.runtime.allowUndeclaredWrites;

		if (def == null)
		{
			if (!allowUndeclared)
			{
				return refuse('tag \'' + tag + '\' is not declared');
			}
		}
		else
		{
			if (def.access !== 'rw' && !def.local)
			{
				return refuse('tag \'' + tag + '\' is read-only');
			}

			if (def.roles != null && def.roles.length > 0 &&
				typeof rt.hasRoles === 'function' && !rt.hasRoles(def.roles))
			{
				return refuse('missing required role to write \'' + tag + '\'');
			}
		}

		var coerced = value;

		if (def != null && def.type != null)
		{
			var result = Hmi.Format.coerce(value, def.type);

			if (!result.ok)
			{
				return refuse('value fails type validation for \'' + tag + '\'');
			}

			coerced = result.value;
		}

		if (def != null && typeof coerced === 'number')
		{
			if (def.min != null && coerced < def.min)
			{
				return refuse('value below minimum for \'' + tag + '\'');
			}

			if (def.max != null && coerced > def.max)
			{
				return refuse('value above maximum for \'' + tag + '\'');
			}
		}

		var isLocalOrSim = (def != null && def.local) ||
			(rt.config != null && (rt.config.sim === 'only' || rt.config.sim === 'on') &&
				def != null && def.sim != null && def.write == null);

		if (def == null || isLocalOrSim || def.write == null)
		{
			// Local / undeclared / simulated tag: apply immediately.
			rt.tags.set(tag, coerced, { quality: 'good', source: 'write' });

			if (def != null && def.sim != null && rt.simulator != null && typeof rt.simulator.write === 'function')
			{
				rt.simulator.write(tag, coerced);
			}

			self.audit({ tag: tag, value: coerced, cellId: cellId, outcome: 'ok' });

			if (typeof rt.fire === 'function')
			{
				rt.fire('write', { tag: tag, value: coerced, state: 'confirmed' });
			}

			return Promise.resolve(coerced);
		}

		return this.writeRemote(tag, coerced, def, cellId);
	};

	Writer.prototype.writeRemote = function(tag, value, def, cellId)
	{
		var rt = this.rt;
		var self = this;
		var w = def.write;
		var mode = w.mode || 'confirmed';
		var timeout = w.timeout != null ? w.timeout : DEFAULT_TIMEOUT;
		var ts = Date.now();

		var req = {};

		if (w.topic != null) req.topic = substituteTemplate(w.topic, tag, value, ts);
		if (w.payload != null) req.payload = substituteTemplate(w.payload, tag, value, ts);
		if (w.qos != null) req.qos = w.qos;
		if (w.retain != null) req.retain = w.retain;
		if (w.method != null) req.method = w.method;
		if (w.url != null) req.url = substituteTemplate(w.url, tag, value, ts);
		if (w.headers != null) req.headers = w.headers;
		if (w.body != null) req.body = substituteTemplate(w.body, tag, value, ts);
		if (w.message != null) req.message = substituteTemplate(w.message, tag, value, ts);

		var previous = (rt.tags != null && typeof rt.tags.getValue === 'function') ? rt.tags.getValue(tag) : undefined;

		if (mode === 'optimistic')
		{
			rt.tags.set(tag, value, { quality: 'good', source: 'write-optimistic' });
		}

		if (typeof rt.fire === 'function')
		{
			rt.fire('write', { tag: tag, value: value, state: 'pending' });
		}

		var sendPromise = (rt.sources != null && typeof rt.sources.write === 'function') ?
			rt.sources.write(w.source, req) : Promise.resolve();

		return sendPromise.then(function()
		{
			return self.confirmOrTimeout(tag, value, mode, timeout, previous, cellId);
		}, function(err)
		{
			self.audit({ tag: tag, value: value, cellId: cellId, outcome: 'error', error: String(err) });

			if (mode === 'optimistic')
			{
				rt.tags.set(tag, previous, { quality: 'good', source: 'write-revert' });
			}

			throw err;
		});
	};

	Writer.prototype.confirmOrTimeout = function(tag, value, mode, timeout, previous, cellId)
	{
		var rt = this.rt;
		var self = this;

		if (mode === 'optimistic')
		{
			// Value is already applied locally (writeRemote did that before
			// sending). Resolve now; watch in the background and revert to
			// the previous value if no confirming update arrives in time.
			self.audit({ tag: tag, value: value, cellId: cellId, outcome: 'ok' });

			if (typeof rt.fire === 'function')
			{
				rt.fire('write', { tag: tag, value: value, state: 'confirmed' });
			}

			self.watchConfirmation(tag, value, timeout, function(confirmed)
			{
				if (!confirmed)
				{
					rt.tags.set(tag, previous, { quality: 'good', source: 'write-revert' });

					if (typeof rt.log === 'function')
					{
						rt.log('warn', 'write', 'optimistic write to \'' + tag + '\' not confirmed, reverted', { tag: tag });
					}
				}
			});

			return Promise.resolve(value);
		}

		return new Promise(function(resolve)
		{
			self.watchConfirmation(tag, value, timeout, function(confirmed)
			{
				self.audit({ tag: tag, value: value, cellId: cellId, outcome: confirmed ? 'ok' : 'unconfirmed' });

				if (!confirmed && typeof rt.log === 'function')
				{
					rt.log('warn', 'write', 'write to \'' + tag + '\' not confirmed within timeout', { tag: tag });
				}

				if (typeof rt.fire === 'function')
				{
					rt.fire('write', { tag: tag, value: value, state: confirmed ? 'confirmed' : 'unconfirmed' });
				}

				// Confirmed mode still resolves on timeout (per contract),
				// just marked 'unconfirmed'.
				resolve(value);
			});
		});
	};

	/**
	 * watchConfirmation(tag, value, timeout, done) -> calls done(true) if a
	 * matching value arrives on `tag` before `timeout` ms, else done(false).
	 */
	Writer.prototype.watchConfirmation = function(tag, value, timeout, done)
	{
		var rt = this.rt;
		var settled = false;

		function onChange(name, entry)
		{
			if (name !== tag || settled || !looseValueEq(entry.value, value))
			{
				return;
			}

			settled = true;
			clearTimeout(timer);

			if (rt.tags != null && typeof rt.tags.offChange === 'function')
			{
				rt.tags.offChange(onChange);
			}

			done(true);
		};

		var timer = setTimeout(function()
		{
			if (settled)
			{
				return;
			}

			settled = true;

			if (rt.tags != null && typeof rt.tags.offChange === 'function')
			{
				rt.tags.offChange(onChange);
			}

			done(false);
		}, timeout);

		if (rt.tags != null && typeof rt.tags.onChange === 'function')
		{
			rt.tags.onChange(onChange);
		}
	};

	function looseValueEq(a, b)
	{
		if (a === b)
		{
			return true;
		}

		var an = typeof a === 'number' || (typeof a === 'string' && a !== '' && !isNaN(a));
		var bn = typeof b === 'number' || (typeof b === 'string' && b !== '' && !isNaN(b));

		if (an && bn)
		{
			return Number(a) === Number(b);
		}

		return false;
	};

	/**
	 * pulse(tag, value, reset, ms) -> write value, then write reset after ms.
	 */
	Writer.prototype.pulse = function(tag, value, reset, ms)
	{
		var self = this;

		return this.write(tag, value).then(function(result)
		{
			setTimeout(function()
			{
				self.write(tag, reset);
			}, ms > 0 ? ms : 0);

			return result;
		});
	};

	/**
	 * toggle(tag) -> reads the current boolean value and writes the inverse.
	 */
	Writer.prototype.toggle = function(tag)
	{
		var rt = this.rt;
		var current = (rt.tags != null && typeof rt.tags.getValue === 'function') ? rt.tags.getValue(tag) : undefined;

		return this.write(tag, !current);
	};

	Hmi.Writer = Writer;
})();
