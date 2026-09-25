/**
 * Hmi.ScriptHost: runs user scripts (source parsers, pre-connect scripts,
 * binding transforms, action scripts) subject to the script policy
 * (HMI-SEC-2). Scripts execute in a dedicated Worker so they have no access
 * to the draw.io DOM, storage or credentials.
 *
 * Wire protocol with the worker bootstrap (see BOOTSTRAP_SRC below):
 *   main -> worker: {id, code, args}
 *     args is caller-supplied and may include `tags`, a plain snapshot
 *     {name: value, ...} of tag values. The worker never talks back to the
 *     main thread to read a tag: `api.getTag(name)` inside the script reads
 *     straight from that snapshot, so it is synchronous from the script's
 *     point of view.
 *   worker -> main: {id, call, params}   -- an api.* invocation (setProps,
 *     writeTag, emit, log, notify). These are fire-and-forget: the worker
 *     does not wait for a reply, and the main thread does not send one.
 *   worker -> main: {id, result} | {id, error}   -- the script's outcome.
 *     `result` may arrive after the script's returned Promise resolves.
 *
 * A watchdog timer per call enforces the timeout: if no {id, result|error}
 * arrives in time, the worker is terminated (so any infinite loop actually
 * stops) and lazily recreated on the next run().
 */
(function()
{
	var Hmi = (typeof globalThis !== 'undefined' ? globalThis : window).Hmi =
		(typeof globalThis !== 'undefined' ? globalThis : window).Hmi || {};

	var TRUST_KEY = '.hmi-script-trust';

	// Source of the worker bootstrap. Kept as a plain string (not a function
	// stringified) so it has no closure over anything in this file, and so
	// it is identical whether loaded via Blob URL (browser) or eval: true
	// (node worker_threads).
	var BOOTSTRAP_SRC = [
		'var __hmiCompiled = {};',
		'function __hmiToArray(a) { return Array.prototype.slice.call(a); }',
		'function __hmiOnMessage(data, post)',
		'{',
		'	var id = data.id;',
		'	var code = data.code;',
		'	var args = data.args || {};',
		'	var tags = args.tags || {};',
		'	var api = {',
		'		setProps: function() { post({id: id, call: "setProps", params: __hmiToArray(arguments)}); },',
		'		writeTag: function() { post({id: id, call: "writeTag", params: __hmiToArray(arguments)}); },',
		'		emit: function() { post({id: id, call: "emit", params: __hmiToArray(arguments)}); },',
		'		log: function() { post({id: id, call: "log", params: __hmiToArray(arguments)}); },',
		'		notify: function() { post({id: id, call: "notify", params: __hmiToArray(arguments)}); },',
		'		getTag: function(name) { return tags[name]; }',
		'	};',
		'	try',
		'	{',
		'		var fn = __hmiCompiled[code];',
		'		if (!fn)',
		'		{',
		'			fn = new Function("args", "api", code);',
		'			__hmiCompiled[code] = fn;',
		'		}',
		'		var result = fn(args, api);',
		'		Promise.resolve(result).then(function(r)',
		'		{',
		'			post({id: id, result: (r === undefined) ? null : r});',
		'		}, function(err)',
		'		{',
		'			post({id: id, error: (err && err.message) ? err.message : String(err)});',
		'		});',
		'	}',
		'	catch (err)',
		'	{',
		'		post({id: id, error: (err && err.message) ? err.message : String(err)});',
		'	}',
		'}',
		'if (typeof self !== "undefined" && typeof self.postMessage === "function" && typeof require !== "function")',
		'{',
		'	self.onmessage = function(e)',
		'	{',
		'		__hmiOnMessage(e.data, function(msg) { self.postMessage(msg); });',
		'	};',
		'}',
		'else',
		'{',
		'	var __hmiWt = require("worker_threads");',
		'	__hmiWt.parentPort.on("message", function(data)',
		'	{',
		'		__hmiOnMessage(data, function(msg) { __hmiWt.parentPort.postMessage(msg); });',
		'	});',
		'}'
	].join('\n');

	function fnv1a(str)
	{
		var hash = 0x811c9dc5;

		for (var i = 0; i < str.length; i++)
		{
			hash ^= str.charCodeAt(i);
			hash = (hash + (hash << 1) + (hash << 4) + (hash << 7) +
				(hash << 8) + (hash << 24)) >>> 0;
		}

		return hash.toString(16);
	};

	function loadTrustSet()
	{
		var set = {};

		try
		{
			if (typeof localStorage !== 'undefined')
			{
				var raw = localStorage.getItem(TRUST_KEY);

				if (raw)
				{
					var arr = JSON.parse(raw);

					for (var i = 0; i < arr.length; i++)
					{
						set[arr[i]] = true;
					}
				}
			}
		}
		catch (e)
		{
			// Storage unavailable or corrupt: fall back to in-memory only.
		}

		return set;
	};

	function saveTrust(hash, set)
	{
		set[hash] = true;

		try
		{
			if (typeof localStorage !== 'undefined')
			{
				var arr = [];

				for (var k in set)
				{
					arr.push(k);
				}

				localStorage.setItem(TRUST_KEY, JSON.stringify(arr));
			}
		}
		catch (e)
		{
			// Ignore: trust just won't survive a reload.
		}
	};

	function defaultLog(level, category, message, data)
	{
		if (typeof console !== 'undefined')
		{
			var fn = console[level] || console.log;
			fn.call(console, '[' + category + '] ' + message, data || '');
		}
	};

	function hasBrowserWorker()
	{
		return (typeof Worker !== 'undefined') && (typeof Blob !== 'undefined') &&
			(typeof URL !== 'undefined') && (typeof URL.createObjectURL === 'function');
	};

	/**
	 * @param opts {policy, timeout, log, confirm, fileKey}
	 */
	function ScriptHost(opts)
	{
		opts = opts || {};
		this.policy = opts.policy || 'off';
		this.timeout = (opts.timeout != null) ? opts.timeout : 50;
		this.log = opts.log || defaultLog;
		this.confirm = opts.confirm;
		this.fileKey = opts.fileKey;

		this.worker = null;
		this.pending = {};
		this.nextId = 1;
		this.trustSet = loadTrustSet();
		this.promptedThisSession = {};
	};

	ScriptHost.prototype.setPolicy = function(policy)
	{
		this.policy = policy;
	};

	ScriptHost.prototype.setFileKey = function(fileKey)
	{
		this.fileKey = fileKey;
	};

	ScriptHost.prototype.isTrusted = function()
	{
		var key = String(this.fileKey || '');
		var hash = fnv1a(key);

		return !!this.trustSet[hash] || !!this.promptedThisSession[key];
	};

	ScriptHost.prototype.trust = function()
	{
		var key = String(this.fileKey || '');
		var hash = fnv1a(key);

		this.promptedThisSession[key] = true;
		saveTrust(hash, this.trustSet);
	};

	ScriptHost.prototype.ensureWorker = function()
	{
		if (this.worker != null)
		{
			return this.worker;
		}

		var self = this;

		function dispatch(data)
		{
			var entry = self.pending[data.id];

			if (entry == null)
			{
				return;
			}

			if (data.call != null)
			{
				var fn = entry.api && entry.api[data.call];

				if (typeof fn === 'function')
				{
					try
					{
						fn.apply(entry.api, data.params || []);
					}
					catch (e)
					{
						self.log('error', 'hmi-script', 'api.' + data.call + ' threw', e);
					}
				}

				return;
			}

			clearTimeout(entry.timer);
			delete self.pending[data.id];

			if (data.error != null)
			{
				entry.reject(new Error(data.error));
			}
			else
			{
				entry.resolve(data.result);
			}
		};

		if (hasBrowserWorker())
		{
			var blob = new Blob([BOOTSTRAP_SRC], {type: 'application/javascript'});
			var url = URL.createObjectURL(blob);
			var worker = new Worker(url);

			worker.onmessage = function(e)
			{
				dispatch(e.data);
			};

			worker.onerror = function(e)
			{
				self.log('error', 'hmi-script', 'worker error', e && e.message);
			};

			this.worker = {
				post: function(msg) { worker.postMessage(msg); },
				terminate: function()
				{
					worker.terminate();
					try { URL.revokeObjectURL(url); } catch (e) {}
				}
			};
		}
		else
		{
			var wt = require('worker_threads');
			var nodeWorker = new wt.Worker(BOOTSTRAP_SRC, {eval: true});

			nodeWorker.on('message', function(data)
			{
				dispatch(data);
			});

			nodeWorker.on('error', function(e)
			{
				self.log('error', 'hmi-script', 'worker error', e && e.message);
			});

			this.worker = {
				post: function(msg) { nodeWorker.postMessage(msg); },
				terminate: function() { nodeWorker.terminate(); }
			};
		}

		return this.worker;
	};

	ScriptHost.prototype.terminate = function()
	{
		if (this.worker != null)
		{
			try
			{
				this.worker.terminate();
			}
			catch (e)
			{
				// Ignore.
			}

			this.worker = null;
		}

		for (var id in this.pending)
		{
			var entry = this.pending[id];
			clearTimeout(entry.timer);
			entry.reject(new Error('Script host terminated'));
		}

		this.pending = {};
	};

	/**
	 * @param code   script source, `function(args, api) { ... }` body
	 * @param args   plain object passed to the script; args.tags (if given)
	 *               is the snapshot api.getTag() reads from inside the worker
	 * @param api    host-side implementations of setProps/writeTag/emit/log/notify,
	 *               invoked fire-and-forget as the script calls them
	 * @return Promise<result>
	 */
	ScriptHost.prototype.run = function(code, args, api)
	{
		var self = this;

		if (this.policy === 'off')
		{
			return Promise.reject(new Error('Scripts are disabled'));
		}

		if (this.policy === 'prompt' && !this.isTrusted())
		{
			if (typeof this.confirm !== 'function')
			{
				return Promise.reject(new Error('Script execution declined'));
			}

			return this.confirm('This diagram wants to run a script. Allow it?').then(function(ok)
			{
				if (!ok)
				{
					throw new Error('Script execution declined');
				}

				self.trust();

				return self.exec(code, args, api);
			});
		}

		return this.exec(code, args, api);
	};

	ScriptHost.prototype.exec = function(code, args, api)
	{
		var self = this;
		var worker = this.ensureWorker();
		var id = this.nextId++;

		return new Promise(function(resolve, reject)
		{
			var timer = setTimeout(function()
			{
				delete self.pending[id];

				try
				{
					worker.terminate();
				}
				catch (e)
				{
					// Ignore.
				}

				self.worker = null;
				reject(new Error('Script timeout'));
			}, self.timeout);

			self.pending[id] = {resolve: resolve, reject: reject, timer: timer, api: api || {}};

			worker.post({id: id, code: code, args: args || {}});
		});
	};

	Hmi.ScriptHost = ScriptHost;
})();
