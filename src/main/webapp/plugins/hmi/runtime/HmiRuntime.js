/**
 * HMI runtime orchestrator (see ARCHITECTURE.md §3.5).
 *
 * Owns the tag store, data sources, simulator, script host, engines and the
 * frame loop that applies runtime values to the overlay. Never changes the
 * model (ARCHITECTURE.md §4).
 */
(function()
{
	var root = (typeof globalThis !== 'undefined') ? globalThis : window;
	var Hmi = root.Hmi = root.Hmi || {};

	/**
	 * Maximum entries kept in the diagnostics log.
	 */
	var LOG_SIZE = 500;

	function Runtime(ui, options)
	{
		options = options || {};
		this.ui = ui;
		this.graph = ui.editor.graph;
		this.mode = options.mode || 'run';
		this.interactive = (options.interactive != null) ? options.interactive : this.mode == 'run';
		this.running = false;
		this.listeners = {};
		this.diag = {log: [], counters: {frames: 0, updates: 0, flushed: 0}};
		this.roles = Runtime.getConfiguredRoles(ui);
		this.vars = {};
		this.fileKey = Runtime.getFileKey(ui);
	};

	/**
	 * Global HMI configuration from DRAWIO_CONFIG.hmi.
	 */
	Runtime.getGlobalConfig = function()
	{
		return (root.DRAWIO_CONFIG != null && root.DRAWIO_CONFIG.hmi != null) ?
			root.DRAWIO_CONFIG.hmi : {};
	};

	/**
	 * Returns the roles of the runtime user (config, URL, embed API).
	 */
	Runtime.getConfiguredRoles = function(ui)
	{
		var roles = [];
		var cfg = Runtime.getGlobalConfig();

		if (cfg.roles != null)
		{
			roles = roles.concat(cfg.roles);
		}

		if (typeof urlParams !== 'undefined' && urlParams['hmi-role'] != null &&
			cfg.allowUrlRoles !== false)
		{
			roles = roles.concat(decodeURIComponent(urlParams['hmi-role']).split(','));
		}

		if (ui.hmiRoles != null)
		{
			roles = roles.concat(ui.hmiRoles);
		}

		return roles;
	};

	/**
	 * Returns a key identifying the current file for script trust.
	 */
	Runtime.getFileKey = function(ui)
	{
		var file = (ui.getCurrentFile != null) ? ui.getCurrentFile() : null;

		if (file != null)
		{
			var id = (file.getHash != null) ? file.getHash() : null;

			return (id != null && id !== '') ? id : ((file.getTitle != null) ?
				file.getTitle() : 'untitled');
		}

		return 'untitled';
	};

	Runtime.prototype.isRunning = function()
	{
		return this.running;
	};

	Runtime.prototype.on = function(name, fn)
	{
		(this.listeners[name] = this.listeners[name] || []).push(fn);
	};

	Runtime.prototype.off = function(name, fn)
	{
		var list = this.listeners[name];

		if (list != null)
		{
			var idx = list.indexOf(fn);

			if (idx >= 0)
			{
				list.splice(idx, 1);
			}
		}
	};

	Runtime.prototype.fire = function(name, payload)
	{
		var list = this.listeners[name];

		if (list != null)
		{
			list = list.slice();

			for (var i = 0; i < list.length; i++)
			{
				try
				{
					list[i](payload);
				}
				catch (e)
				{
					this.log('error', 'runtime', 'Listener for ' + name + ' failed: ' + e.message);
				}
			}
		}
	};

	/**
	 * Adds a diagnostics log entry.
	 */
	Runtime.prototype.log = function(level, category, message, data)
	{
		var entry = {ts: Date.now(), level: level, category: category,
			message: message, data: data};
		this.diag.log.push(entry);

		if (this.diag.log.length > LOG_SIZE)
		{
			this.diag.log.splice(0, this.diag.log.length - LOG_SIZE);
		}

		if ((level == 'error' || level == 'warn') && root.console != null &&
			typeof urlParams !== 'undefined' && urlParams['dev'] == '1')
		{
			console.log('HMI ' + level + ' [' + category + '] ' + message);
		}

		this.fire('log', entry);
	};

	/**
	 * Returns true if the given endpoint URL may be connected to.
	 */
	Runtime.prototype.isEndpointAllowed = function(url)
	{
		var list = Runtime.getGlobalConfig().allowedEndpoints;

		if (list == null)
		{
			return true;
		}

		for (var i = 0; i < list.length; i++)
		{
			var pattern = String(list[i]);

			if (pattern.charAt(0) == '/' && pattern.lastIndexOf('/') > 0)
			{
				try
				{
					if (new RegExp(pattern.substring(1, pattern.lastIndexOf('/'))).test(url))
					{
						return true;
					}
				}
				catch (e)
				{
					// ignore invalid patterns
				}
			}
			else if (url.substring(0, pattern.length) == pattern)
			{
				return true;
			}
		}

		return false;
	};

	/**
	 * Returns the effective script policy.
	 */
	Runtime.prototype.getScriptPolicy = function()
	{
		var policy = Runtime.getGlobalConfig().scripts || 'prompt';

		if (this.config != null && this.config.scripts == 'off')
		{
			policy = 'off';
		}

		return policy;
	};

	/**
	 * Screen variables and tag values for ${var} and expressions.
	 */
	Runtime.prototype.getVars = function()
	{
		return this.vars;
	};

	/**
	 * Resolves ${name} placeholders: cell attributes (and ancestors), tag
	 * values, URL parameters, localStorage, DRAWIO_CONFIG.hmi.params.
	 * Port of meta2d getDynamicParam lookup order (MIT, le5le).
	 */
	Runtime.prototype.resolveVars = function(str, cell)
	{
		if (str == null || typeof str !== 'string' || str.indexOf('${') < 0)
		{
			return str;
		}

		var self = this;

		return str.replace(/\$\{([^}]+)\}/g, function(match, name)
		{
			var value = self.lookupVar(name, cell);

			return (value != null) ? ((typeof value === 'object') ?
				JSON.stringify(value) : String(value)) : '';
		});
	};

	Runtime.prototype.lookupVar = function(name, cell)
	{
		var model = this.graph.model;
		var current = cell;

		while (current != null)
		{
			if (current.value != null && typeof current.value === 'object' &&
				current.value.hasAttribute != null && current.value.hasAttribute(name))
			{
				return current.value.getAttribute(name);
			}

			current = model.getParent(current);
		}

		if (this.tags != null)
		{
			var entry = this.tags.get(name);

			if (entry != null)
			{
				return entry.value;
			}
		}

		if (typeof urlParams !== 'undefined' && urlParams[name] != null)
		{
			return decodeURIComponent(urlParams[name]);
		}

		try
		{
			var stored = localStorage.getItem(name);

			if (stored != null)
			{
				return stored;
			}
		}
		catch (e)
		{
			// ignore
		}

		var params = Runtime.getGlobalConfig().params;

		return (params != null && params[name] != null) ? params[name] : null;
	};

	/**
	 * Returns true if the runtime user has all given roles.
	 */
	Runtime.prototype.hasRoles = function(required)
	{
		if (required == null || required.length == 0)
		{
			return true;
		}

		for (var i = 0; i < required.length; i++)
		{
			if (this.roles.indexOf(required[i]) < 0)
			{
				return false;
			}
		}

		return true;
	};

	Runtime.prototype.getCell = function(id)
	{
		return this.graph.model.getCell(id);
	};

	/**
	 * Resolves a TargetSpec to cells.
	 */
	Runtime.prototype.resolveTargets = function(spec, cell)
	{
		var result = [];

		if (spec == null || spec == 'self')
		{
			return (cell != null) ? [cell] : [];
		}

		if (typeof spec === 'string')
		{
			var c = this.getCell(spec);

			return (c != null) ? [c] : [];
		}

		var seen = {};
		var add = function(c)
		{
			if (c != null && !seen[c.id])
			{
				seen[c.id] = true;
				result.push(c);
			}
		};

		if (spec.self && cell != null)
		{
			add(cell);
		}

		var i;

		if (spec.cells != null)
		{
			for (i = 0; i < spec.cells.length; i++)
			{
				add(this.getCell(spec.cells[i]));
			}
		}

		if (spec.tags != null && this.graph.getCellsForTags != null)
		{
			var cells = this.graph.getCellsForTags(spec.tags, null, null, true) || [];

			for (i = 0; i < cells.length; i++)
			{
				add(cells[i]);
			}
		}

		if (spec.layers != null)
		{
			for (i = 0; i < spec.layers.length; i++)
			{
				add(this.getCell(spec.layers[i]));
			}
		}

		return result;
	};

	/**
	 * Runs a user script in the sandbox. args are copied; the api exposes
	 * setProps, writeTag, emit, log and notify to the script.
	 */
	Runtime.prototype.runScript = function(code, args, cell)
	{
		var self = this;
		var snapshot = {};

		if (this.tags != null)
		{
			var names = this.tags.names();

			for (var i = 0; i < names.length; i++)
			{
				snapshot[names[i]] = this.tags.getValue(names[i]);
			}
		}

		args = args || {};
		args.tags = snapshot;
		args.cellId = (cell != null) ? cell.id : null;

		return this.scripts.run(code, args, {
			setProps: function(target, props)
			{
				self.actions.run([{type: 'setProps', target: target || 'self',
					style: props.style, label: props.label, visible: props.visible,
					attrs: props.attrs}], {cell: cell});
			},
			writeTag: function(tag, value)
			{
				return self.writer.write(tag, value, {cell: cell});
			},
			emit: function(name, payload)
			{
				self.actions.run([{type: 'emit', name: name, payload: payload}], {cell: cell});
			},
			notify: function(text, level)
			{
				self.actions.run([{type: 'notify', text: text, level: level}], {cell: cell});
			},
			log: function(message)
			{
				self.log('info', 'script', String(message));
			}
		});
	};

	/**
	 * Requests an overlay flush on the next frame.
	 */
	Runtime.prototype.requestFlush = function()
	{
		this.flushRequested = true;
		this.scheduleFrame();
	};

	Runtime.prototype.scheduleFrame = function()
	{
		if (this.running && this.frameHandle == null)
		{
			var self = this;
			this.scheduledAt = Date.now();
			var raf = root.requestAnimationFrame || function(fn)
			{
				return setTimeout(function()
				{
					fn(Date.now());
				}, 16);
			};

			this.frameHandle = raf(function()
			{
				self.frameHandle = null;
				self.frame();
			});
		}
	};

	/**
	 * Processes tag changes, animations and renders dirty cells. Throttled
	 * to config.runtime.maxRate.
	 */
	Runtime.prototype.frame = function()
	{
		if (!this.running)
		{
			return;
		}

		var now = Date.now();
		var maxRate = Math.max(1, Math.min(120, this.maxRate || 30));
		var rate = Math.min(maxRate, this.dynamicRate || maxRate);
		var minInterval = 1000 / rate;

		if (this.lastFrame != null && now - this.lastFrame < minInterval - 2)
		{
			this.scheduleFrame();

			return;
		}

		// Adaptive rate (like meta2d autoFPS): a late frame means the previous
		// frame's rendering blocked the main thread, so fewer, larger batches
		// keep the page responsive. Recovers slowly when frames are on time.
		if (this.lastFrame != null && this.lastWork != null)
		{
			// Delay of the animation frame beyond one display refresh
			var late = (this.scheduledAt != null) ? now - this.scheduledAt - 17 : 0;
			var load = (this.lastWork + Math.max(0, late)) / minInterval;

			if (load > 0.6 && rate > 2)
			{
				this.dynamicRate = Math.max(2, rate * 0.75);
			}
			else if (load < 0.3 && rate < maxRate)
			{
				this.dynamicRate = Math.min(maxRate, rate + 0.5);
			}

			this.diag.counters.rate = Math.round(this.dynamicRate || rate);
		}

		this.lastFrame = now;
		var workStart = Date.now();
		this.diag.counters.frames++;

		try
		{
			var names = this.tags.takeDirty();
			var stale = this.tags.checkStale(now);

			if (stale != null && stale.length > 0)
			{
				names = names.concat(stale);
			}

			// Tags written while processing (system tags, writes by actions)
			// are handled in further passes of the same frame
			for (var pass = 0; pass < 3 && names.length > 0; pass++)
			{
				if (pass > 0)
				{
					names = this.tags.takeDirty();

					if (names.length == 0)
					{
						break;
					}
				}

				this.diag.counters.updates += names.length;
				this.bindings.update(names);

				if (this.alarms != null)
				{
					this.alarms.evaluate(names);
				}

				this.animator.tagsChanged(names);

				if (this.initialized)
				{
					this.triggers.evaluate(names);
					this.events.valueChanged(names);
				}

				this.fire('tags', names);

				// Initial evaluation once data arrived from every connected source
				if (!this.initialized && this.isDataReady())
				{
					this.initialize();
				}
			}

			if (this.animator != null)
			{
				this.animator.step(now);
			}

			this.diag.counters.flushed += this.overlay.flush(true);
		}
		catch (e)
		{
			this.log('error', 'runtime', 'Frame failed: ' + e.message);
		}

		this.flushRequested = false;
		this.lastWork = Date.now() - workStart;

		if (this.overlay.isDirty() || (this.animator != null && this.animator.isAnimating()))
		{
			this.scheduleFrame();
		}
	};

	/**
	 * Starts the runtime.
	 */
	Runtime.prototype.start = function()
	{
		if (this.running)
		{
			return;
		}

		var self = this;
		var graph = this.graph;
		var gcfg = Runtime.getGlobalConfig();

		this.config = Hmi.Model.getEffectiveConfig(this.ui);
		this.maxRate = (gcfg.maxRate != null) ? gcfg.maxRate : this.config.runtime.maxRate;
		this.running = true;
		this.initialized = false;

		// Tag store
		this.tags = new Hmi.TagStore({log: mxUtils.bind(this, this.log)});
		this.tags.define(this.config.tags);
		this.tagsListener = function()
		{
			self.scheduleFrame();
		};
		this.tags.onChange(this.tagsListener);

		// Overlay
		this.overlay = graph.hmiOverlay;
		this.overlay.clear();
		this.overlay.flush(false);
		this.overlay.qualityMode = this.config.runtime.quality || 'outline';
		this.renderErrors = {};
		this.overlay.onError = function(cell, e)
		{
			// Logs each failing cell once
			if (!self.renderErrors[cell.id])
			{
				self.renderErrors[cell.id] = true;
				self.log('error', 'render', 'Rendering ' + cell.id + ' failed: ' + e.message);
			}
		};
		this.overlay.tagResolver = function(name)
		{
			return self.tags.get(name);
		};
		this.overlay.tagDefResolver = function(name)
		{
			return self.tags.getDef(name);
		};

		// Scripts
		this.scripts = new Hmi.ScriptHost({
			policy: this.getScriptPolicy(),
			timeout: gcfg.scriptTimeout || 50,
			log: mxUtils.bind(this, this.log),
			fileKey: this.fileKey,
			confirm: function(message)
			{
				return new Promise(function(resolve)
				{
					self.ui.confirm(message, function()
					{
						resolve(true);
					}, function()
					{
						resolve(false);
					}, mxResources.get('hmiAllowScripts'), mxResources.get('cancel'));
				});
			}
		});

		// Engines
		this.writer = new Hmi.Writer(this);
		this.alarms = new Hmi.Alarms(this);
		this.alarms.configure(this.config.tags);
		this.actions = new Hmi.Actions(this);
		this.triggers = new Hmi.TriggerEngine(this);
		this.animator = new Hmi.Animator(this);
		this.events = new Hmi.EventDispatcher(this);
		this.bindings = new Hmi.BindingEngine(this);

		// Sources and simulator
		var sim = (typeof urlParams !== 'undefined' && urlParams['hmi-sim'] != null) ?
			urlParams['hmi-sim'] : this.config.sim;

		if (this.mode == 'preview' && this.forceSim != null)
		{
			sim = this.forceSim;
		}

		this.sim = sim;
		this.sources = new Hmi.SourceManager({
			tags: this.tags,
			log: mxUtils.bind(this, this.log),
			allow: mxUtils.bind(this, this.isEndpointAllowed),
			resolve: function(str)
			{
				return self.resolveVars(str, null);
			},
			scripts: this.scripts,
			credentials: mxUtils.bind(this, this.getCredentials)
		});
		this.sources.on('status', function(status)
		{
			self.fire('status', self.sources.status());
		});
		this.sources.on('updates', function(updates)
		{
			for (var i = 0; i < updates.length; i++)
			{
				if (updates[i].xml)
				{
					self.applyUpdateXml(updates[i]);
				}
			}
		});
		this.sources.on('hostWrite', function(req)
		{
			self.fire('hostWrite', req);
		});

		if (sim != 'only')
		{
			this.sources.configure(this.config.sources);
			this.sources.start();
		}

		this.simulator = new Hmi.Simulator(this.tags, {
			log: mxUtils.bind(this, this.log),
			runScript: function(code, args)
			{
				return self.runScript(code, args, null);
			}
		});

		if (sim == 'on' || sim == 'only')
		{
			this.simulator.configure(this.config.tags);
			this.simulator.start(250);
		}

		this.applyTheme();
		this.buildPage();
		this.events.install();
		this.installListeners();
		this.system = new Hmi.System(this);
		this.system.install();

		// DOM overlay widgets (iframe, video, ECharts)
		if (Hmi.DomWidgets != null)
		{
			this.dom = new Hmi.DomWidgets(this);
			this.dom.install();
		}

		// Initial trigger evaluation after first data or timeout (HMI-TRG-5)
		var initTimeout = (gcfg.initialTimeout != null) ? gcfg.initialTimeout : 1000;
		this.initTimer = setTimeout(function()
		{
			self.initTimer = null;
			self.initialize();
		}, initTimeout);

		this.log('info', 'runtime', 'Runtime started (' + this.mode + ', sim=' + sim + ')');
		this.fire('start', this);
		this.fire('status', this.sources.status());
		this.requestFlush();
	};

	/**
	 * ISA-101 high-performance theme (HMI-USA-3): neutral grey background for
	 * the runtime view. Colour is reserved for abnormal states.
	 */
	Runtime.THEMES = {isa101: {background: '#D4D4D4'}};

	Runtime.prototype.applyTheme = function()
	{
		var theme = Runtime.THEMES[this.config.runtime.theme];
		var container = this.graph.container;

		if (theme != null && container != null && this.mode == 'run')
		{
			this.themeBackup = container.style.backgroundColor;
			container.style.backgroundColor = theme.background;
		}
	};

	Runtime.prototype.restoreTheme = function()
	{
		if (this.themeBackup != null && this.graph.container != null)
		{
			this.graph.container.style.backgroundColor = this.themeBackup;
			this.themeBackup = null;
		}
	};

	/**
	 * Applies a plugins/update.js style <update id value style/> transiently
	 * (HMI-IMP-2): attributes of the value XML become runtime attributes (the
	 * label attribute becomes the label) and style entries are overlaid.
	 */
	Runtime.prototype.applyUpdateXml = function(update)
	{
		var cell = this.getCell(update.tag);
		var attrs = update.attrs || {};

		if (cell == null)
		{
			return;
		}

		if (attrs.value != null && attrs.value !== '')
		{
			try
			{
				var node = mxUtils.parseXml(attrs.value).documentElement;

				for (var i = 0; node != null && i < node.attributes.length; i++)
				{
					var name = node.attributes[i].nodeName;
					var value = node.attributes[i].nodeValue;

					if (name == 'label')
					{
						this.overlay.setLabel(cell.id, value, 'binding');
					}
					else if (name != 'replace-value')
					{
						this.overlay.setAttribute(cell.id, name, value, 'binding');
					}
				}
			}
			catch (e)
			{
				this.log('warn', 'source', 'Invalid update value for ' + cell.id + ': ' + e.message);
			}
		}

		if (attrs.style != null)
		{
			var pairs = attrs.style.split(';');

			for (var i = 0; i < pairs.length; i++)
			{
				var eq = pairs[i].indexOf('=');

				if (eq > 0)
				{
					this.overlay.setStyle(cell.id, pairs[i].substring(0, eq),
						pairs[i].substring(eq + 1), 'binding');
				}
			}
		}

		this.requestFlush();
	};

	/**
	 * Returns true if no enabled source is still connecting.
	 */
	Runtime.prototype.isDataReady = function()
	{
		if (this.sim == 'only')
		{
			return true;
		}

		var status = this.sources.status();

		for (var i = 0; i < status.length; i++)
		{
			if (status[i].state == 'connecting' || (status[i].state == 'connected' &&
				!(status[i].received > 0)))
			{
				return false;
			}
		}

		return true;
	};

	/**
	 * Runs the initial evaluation and page open handlers.
	 */
	Runtime.prototype.initialize = function()
	{
		if (this.running && !this.initialized)
		{
			this.initialized = true;
			this.triggers.evaluateAll();
			this.events.firePage('pageOpen');
			this.animator.autoPlay();
			this.requestFlush();
		}
	};

	/**
	 * Builds the index and engines for the current page.
	 */
	Runtime.prototype.buildPage = function()
	{
		var index = Hmi.Model.scan(this.graph);

		// Document triggers from the current page only
		var docCfg = Hmi.Model.getDocConfig(this.graph);
		this.index = index;
		this.bindings.build(index);
		this.triggers.build(index, docCfg.triggers || []);
		this.applyRoles();
		this.bindings.updateAll();

		if (this.system != null)
		{
			this.system.alarmsChanged(null);
		}

		if (this.dom != null)
		{
			this.dom.refresh();
		}

		this.overlay.flush(false);
		this.events.decorate();
		this.requestFlush();
	};

	/**
	 * Hides cells whose hmiRoles the user lacks (HMI-SEC-5).
	 */
	Runtime.prototype.applyRoles = function()
	{
		var mode = Runtime.getGlobalConfig().unauthorized || 'hide';

		for (var id in this.index.cells)
		{
			var cfg = this.index.cells[id];

			if (cfg.roles != null && cfg.roles.length > 0 && !this.hasRoles(cfg.roles))
			{
				if (mode == 'disable')
				{
					this.overlay.setStyle(id, 'opacity', 40, 'action');
					cfg.disabled = true;
				}
				else
				{
					this.overlay.setVisible(id, false, 'action');
					cfg.disabled = true;
				}
			}
		}
	};

	/**
	 * Tears down page-specific state (on page change).
	 */
	Runtime.prototype.teardownPage = function()
	{
		this.animator.stopAll();
		this.triggers.reset();
		this.overlay.clear();
		this.overlay.flush(false);
	};

	Runtime.prototype.installListeners = function()
	{
		var self = this;
		var ui = this.ui;
		var graph = this.graph;

		this.pageListener = function()
		{
			if (self.running)
			{
				self.events.firePage('pageClose');
				self.teardownPage();

				// Reconnects page-scope sources
				var cfg = Hmi.Model.getEffectiveConfig(ui);
				self.config.sources = cfg.sources;
				self.tags.define(cfg.tags);

				if (self.sim != 'only')
				{
					self.sources.configure(cfg.sources);
				}

				self.buildPage();
				self.initialized = false;
				self.initialize();
				self.fire('page', ui.currentPage);
			}
		};
		ui.editor.addListener('pageSelected', this.pageListener);

		// Live preview: rescan on model changes (debounced)
		this.modelListener = function(sender, evt)
		{
			if (self.running && self.mode == 'preview')
			{
				if (self.rescanTimer != null)
				{
					clearTimeout(self.rescanTimer);
				}

				self.rescanTimer = setTimeout(function()
				{
					self.rescanTimer = null;

					if (self.running)
					{
						var cfg = Hmi.Model.getEffectiveConfig(ui);
						self.tags.define(cfg.tags);
						self.overlay.clear();
						self.buildPage();
					}
				}, 300);
			}
		};
		graph.model.addListener(mxEvent.CHANGE, this.modelListener);

		// Live preview: selected and edited cells show their design state
		this.selectionListener = function()
		{
			if (self.mode == 'preview')
			{
				var cells = graph.getSelectionCells();
				var ids = {};

				for (var i = 0; i < cells.length; i++)
				{
					ids[cells[i].id] = true;
				}

				for (var id in self.overlay.suspended)
				{
					if (!ids[id])
					{
						self.overlay.setSuspended(id, false);
					}
				}

				for (var id in ids)
				{
					self.overlay.setSuspended(id, true);
				}

				self.requestFlush();
			}
		};
		graph.getSelectionModel().addListener(mxEvent.CHANGE, this.selectionListener);

		this.scaleListener = function()
		{
			self.animator.reapplyCss();
			self.requestFlush();
		};
		graph.view.addListener(mxEvent.SCALE_AND_TRANSLATE, this.scaleListener);
		graph.view.addListener(mxEvent.SCALE, this.scaleListener);
		graph.view.addListener(mxEvent.TRANSLATE, this.scaleListener);

		if (graph.container != null)
		{
			this.scrollListener = this.scaleListener;
			mxEvent.addListener(graph.container, 'scroll', this.scrollListener);
		}

		this.visibilityListener = function()
		{
			if (self.animator != null)
			{
				self.animator.setPaused(document.hidden);
			}

			if (!document.hidden)
			{
				self.requestFlush();
			}
		};
		mxEvent.addListener(document, 'visibilitychange', this.visibilityListener);

		this.unloadListener = function()
		{
			self.stop();
		};
		mxEvent.addListener(window, 'beforeunload', this.unloadListener);
	};

	Runtime.prototype.removeListeners = function()
	{
		var graph = this.graph;
		this.ui.editor.removeListener(this.pageListener);
		graph.model.removeListener(this.modelListener);
		graph.getSelectionModel().removeListener(this.selectionListener);
		graph.view.removeListener(this.scaleListener);

		if (graph.container != null && this.scrollListener != null)
		{
			mxEvent.removeListener(graph.container, 'scroll', this.scrollListener);
		}

		mxEvent.removeListener(document, 'visibilitychange', this.visibilityListener);
		mxEvent.removeListener(window, 'beforeunload', this.unloadListener);

		if (this.rescanTimer != null)
		{
			clearTimeout(this.rescanTimer);
			this.rescanTimer = null;
		}
	};

	/**
	 * Returns credentials for a source (HMI-DOC-5).
	 */
	Runtime.prototype.getCredentials = function(source)
	{
		var cred = source.credentials || {};
		var self = this;

		if (cred.mode == 'param')
		{
			var value = this.lookupVar(cred.param || (source.id + '.password'), null);
			var token = this.lookupVar(cred.param || (source.id + '.token'), null);

			return Promise.resolve({username: cred.username || source.username,
				password: value, token: token});
		}
		else if (cred.mode == 'prompt')
		{
			this.promptedCredentials = this.promptedCredentials || {};

			if (this.promptedCredentials[source.id] != null)
			{
				return Promise.resolve(this.promptedCredentials[source.id]);
			}

			return new Promise(function(resolve)
			{
				if (Hmi.CredentialsDialog != null)
				{
					Hmi.CredentialsDialog.show(self.ui, source, function(result)
					{
						if (result != null)
						{
							self.promptedCredentials[source.id] = result;
						}

						resolve(result || {});
					});
				}
				else
				{
					resolve({});
				}
			});
		}
		else if (cred.mode == 'save')
		{
			return Promise.resolve({username: cred.username || source.username,
				password: cred.password || source.password, token: cred.token});
		}

		return Promise.resolve({username: source.username, password: source.password});
	};

	/**
	 * Stops the runtime and restores the design state.
	 */
	Runtime.prototype.stop = function()
	{
		if (!this.running)
		{
			return;
		}

		this.running = false;

		if (this.initTimer != null)
		{
			clearTimeout(this.initTimer);
			this.initTimer = null;
		}

		try
		{
			this.events.firePage('pageClose');
		}
		catch (e)
		{
			// ignore
		}

		this.removeListeners();
		this.system.uninstall();

		if (this.dom != null)
		{
			this.dom.uninstall();
			this.dom = null;
		}
		this.events.uninstall();
		this.sources.stop();
		this.simulator.stop();
		this.animator.stopAll();
		this.triggers.reset();
		this.scripts.terminate();
		this.tags.offChange(this.tagsListener);

		if (this.writer.dispose != null)
		{
			this.writer.dispose();
		}

		this.restoreTheme();
		this.overlay.clear();
		this.overlay.suspended = {};
		this.overlay.tagResolver = null;
		this.overlay.tagDefResolver = this.ui.hmiDesignResolver || null;
		this.overlay.flush(false);

		this.log('info', 'runtime', 'Runtime stopped');
		this.fire('stop', this);
	};

	/**
	 * Pushes values from the host (embed API / JS API).
	 */
	Runtime.prototype.setValues = function(values, source)
	{
		var updates = [];

		if (values != null && values.length != null)
		{
			for (var i = 0; i < values.length; i++)
			{
				var v = values[i];
				updates.push({tag: v.tag || v.id || v.dataId, value: v.value,
					ts: v.ts, quality: v.quality, source: source || 'host'});
			}
		}
		else if (values != null)
		{
			for (var key in values)
			{
				updates.push({tag: key, value: values[key], source: source || 'host'});
			}
		}

		this.tags.setMany(updates);
		this.scheduleFrame();

		return updates.length;
	};

	Hmi.Runtime = Runtime;
})();
