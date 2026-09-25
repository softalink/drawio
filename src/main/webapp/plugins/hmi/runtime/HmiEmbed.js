/**
 * Public JS API (ui.hmi) and embed postMessage protocol (SRS §3.13).
 *
 * Host → draw.io (proto=json): hmiSetValues, hmiRun, hmiStop, hmiNavigate,
 * hmiGetTags, hmiSetRoles.
 * draw.io → host: hmiWrite, hmiEvent, hmiStatus, hmiTags, hmiStarted,
 * hmiStopped (credentials are never included).
 */
(function()
{
	var root = (typeof globalThis !== 'undefined') ? globalThis : window;
	var Hmi = root.Hmi = root.Hmi || {};

	function Api(ui)
	{
		this.ui = ui;
		this.runtime = null;
		this.subscribers = [];
		this.startListeners = [];
	};

	/**
	 * Returns the active runtime or null.
	 */
	Api.prototype.getRuntime = function()
	{
		return (this.runtime != null && this.runtime.running) ? this.runtime : null;
	};

	/**
	 * Starts the runtime. mode is 'run' or 'preview'.
	 */
	Api.prototype.run = function(options)
	{
		options = options || {};
		this.stop();

		var graph = this.ui.editor.graph;
		var rt = new Hmi.Runtime(this.ui, options);

		if (options.sim != null)
		{
			rt.forceSim = options.sim;
		}

		this.runtime = rt;
		graph.hmiRuntime = rt;
		this.attach(rt);
		rt.start();

		for (var i = 0; i < this.startListeners.length; i++)
		{
			this.startListeners[i](rt);
		}

		return rt;
	};

	/**
	 * Adds a listener invoked with each started runtime.
	 */
	Api.prototype.onStart = function(fn)
	{
		this.startListeners.push(fn);
	};

	Api.prototype.stop = function()
	{
		if (this.runtime != null)
		{
			var rt = this.runtime;
			this.runtime = null;
			rt.stop();

			if (this.ui.editor.graph.hmiRuntime == rt)
			{
				this.ui.editor.graph.hmiRuntime = null;
			}
		}
	};

	Api.prototype.isRunning = function()
	{
		return this.getRuntime() != null;
	};

	/**
	 * Pushes tag values: {tag: value} or [{tag, value, ts, quality}].
	 */
	Api.prototype.setValues = function(values)
	{
		var rt = this.getRuntime();

		return (rt != null) ? rt.setValues(values, 'host') : 0;
	};

	Api.prototype.getValue = function(tag)
	{
		var rt = this.getRuntime();
		var entry = (rt != null) ? rt.tags.get(tag) : null;

		return (entry != null) ? entry.value : undefined;
	};

	/**
	 * Returns a snapshot of all tags.
	 */
	Api.prototype.getTags = function()
	{
		var rt = this.getRuntime();
		var result = {};

		if (rt != null)
		{
			var names = rt.tags.names();

			for (var i = 0; i < names.length; i++)
			{
				var e = rt.tags.get(names[i]);

				if (e != null)
				{
					result[names[i]] = {value: e.value, quality: e.quality, ts: e.ts};
				}
			}
		}

		return result;
	};

	/**
	 * Writes a tag through the runtime writer (validation, audit).
	 */
	Api.prototype.write = function(tag, value)
	{
		var rt = this.getRuntime();

		return (rt != null) ? rt.writer.write(tag, value, {}) :
			Promise.reject(new Error('HMI runtime is not running'));
	};

	/**
	 * Subscribes to tag changes: fn(changedNames, api). Returns unsubscribe.
	 */
	Api.prototype.subscribe = function(fn)
	{
		var subs = this.subscribers;
		subs.push(fn);

		return function()
		{
			var idx = subs.indexOf(fn);

			if (idx >= 0)
			{
				subs.splice(idx, 1);
			}
		};
	};

	/**
	 * Wires runtime events to subscribers and the embedding host.
	 */
	Api.prototype.attach = function(rt)
	{
		var self = this;
		var embedded = urlParams['embed'] == '1' && urlParams['proto'] == 'json';
		var cfg = Hmi.Runtime.getGlobalConfig();

		rt.on('tags', function(names)
		{
			for (var i = 0; i < self.subscribers.length; i++)
			{
				try
				{
					self.subscribers[i](names, self);
				}
				catch (e)
				{
					rt.log('error', 'api', 'Subscriber failed: ' + e.message);
				}
			}
		});

		if (embedded)
		{
			rt.on('hostWrite', function(req)
			{
				self.post({event: 'hmiWrite', tag: req.tag, value: req.value,
					topic: req.topic, cellId: req.cellId});
			});

			rt.on('write', function(info)
			{
				if (cfg.forwardWrites && info.state == 'pending')
				{
					self.post({event: 'hmiWrite', tag: info.tag, value: info.value,
						cellId: info.cellId});
				}
			});

			rt.on('message', function(msg)
			{
				self.post({event: 'hmiEvent', name: msg.name, payload: msg.payload,
					cellId: msg.cellId});
			});

			rt.on('status', function(status)
			{
				self.post({event: 'hmiStatus', sources: status});
			});

			rt.on('start', function()
			{
				self.post({event: 'hmiStarted'});
			});

			rt.on('stop', function()
			{
				self.post({event: 'hmiStopped'});
			});
		}
	};

	/**
	 * Posts a message to the embedding host.
	 */
	Api.prototype.post = function(msg)
	{
		var target = this.ui.embedMessageSource || window.opener || window.parent;

		if (target != null && target != window)
		{
			target.postMessage(JSON.stringify(msg), '*');
		}
	};

	/**
	 * Handles hmi* embed messages (hook H8). Returns true if handled.
	 */
	Api.prototype.handleMessage = function(data)
	{
		var action = data.action;

		if (action == 'hmiSetValues')
		{
			this.setValues(data.values);
		}
		else if (action == 'hmiRun')
		{
			this.run({mode: data.mode || 'run', interactive: data.interactive,
				sim: data.sim});
		}
		else if (action == 'hmiStop')
		{
			this.stop();
		}
		else if (action == 'hmiNavigate')
		{
			var page = Hmi.Actions.findPage(this.ui, data.page);

			if (page != null)
			{
				this.ui.selectPage(page);
			}
		}
		else if (action == 'hmiGetTags')
		{
			this.post({event: 'hmiTags', tags: this.getTags()});
		}
		else if (action == 'hmiSetRoles')
		{
			this.ui.hmiRoles = (data.roles != null) ? data.roles : [];

			if (this.runtime != null)
			{
				this.runtime.roles = Hmi.Runtime.getConfiguredRoles(this.ui);
			}
		}
		else if (action == 'hmiWrite')
		{
			var self = this;
			this.write(data.tag, data.value).then(null, function(e)
			{
				self.post({event: 'hmiError', message: e.message});
			});
		}
		else
		{
			return false;
		}

		return true;
	};

	Hmi.Api = Api;
})();
