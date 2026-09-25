/**
 * DOM overlay widgets for the HMI runtime (see ARCHITECTURE.md and
 * docs/hmi/SRS.md 3.9 HMI-WGT-13, HMI-WGT-19, HMI-WGT-20).
 *
 * The corresponding shapes (shapes/hmi/mxHmiTable.js) are DOM-free and only
 * paint a design-time/export placeholder for the iframe, video and ECharts
 * widgets. This module is the runtime counterpart: while the runtime is
 * running (both 'run' and 'preview' modes) it overlays real DOM elements
 * -- an <iframe>, a <video> or an ECharts canvas -- absolutely positioned
 * on top of their cell, exactly as HmiEventDispatcher.openEditor positions
 * its <input>/<select> editors (state.x/y/width/height in graph.container
 * coordinates). It also drives the mxgraph.hmi.table widget's auto-scroll,
 * which has no DOM element of its own: it just nudges an overlay style key
 * that the canvas-painted table shape reads.
 *
 * Security (HMI-SEC-4): iframe src is resolved through Runtime.resolveVars
 * and Graph.sanitizeLink, and only http(s) URLs (or the literal
 * 'about:blank') are ever assigned; 'allow-same-origin' is always stripped
 * from the sandbox attribute, whatever the designer configured, so a
 * sandboxed frame can never both run scripts and claim the parent's
 * origin.
 *
 * Hmi.Runtime.start() constructs this as `this.dom = new Hmi.DomWidgets(this)`
 * and calls `install()`; `buildPage()` calls `refresh()` after each page
 * (re)build; `stop()` calls `uninstall()`. Never edits the model
 * (ARCHITECTURE.md 4) -- it only ever touches its own DOM elements and the
 * overlay's 'anim' layer (for the table's scroll offset).
 */
(function()
{
	var root = (typeof globalThis !== 'undefined') ? globalThis : window;
	var Hmi = root.Hmi = root.Hmi || {};

	var TABLE_SHAPE = 'mxgraph.hmi.table';
	var IFRAME_SHAPE = 'mxgraph.hmi.iframe';
	var VIDEO_SHAPE = 'mxgraph.hmi.video';
	var ECHARTS_SHAPE = 'mxgraph.hmi.echarts';

	var DATA_THROTTLE_MS = 250; // 4 Hz, per HMI-PERF-* rendering budget

	var echartsPromise = null;

	/**
	 * Resolves once the global `echarts` is available. Loads it exactly
	 * once, lazily (HMI-PERF-6). Overridable (e.g. by tests) via
	 * Hmi.DomWidgets.loadEcharts.
	 */
	function defaultLoadEcharts()
	{
		if (typeof root.echarts !== 'undefined')
		{
			return Promise.resolve(root.echarts);
		}

		if (echartsPromise != null)
		{
			return echartsPromise;
		}

		if (typeof document === 'undefined' || typeof document.createElement !== 'function')
		{
			return Promise.reject(new Error('No DOM available to load echarts.min.js'));
		}

		echartsPromise = new Promise(function(resolve, reject)
		{
			var script = document.createElement('script');
			script.setAttribute('type', 'text/javascript');
			script.setAttribute('src', Hmi.basePath + 'lib/echarts.min.js');

			script.onload = function()
			{
				if (typeof root.echarts !== 'undefined')
				{
					resolve(root.echarts);
				}
				else
				{
					reject(new Error('echarts.min.js loaded but did not define window.echarts'));
				}
			};

			script.onerror = function()
			{
				reject(new Error('Failed to load ' + script.src));
			};

			document.getElementsByTagName('head')[0].appendChild(script);
		});

		return echartsPromise;
	};

	/**
	 * True for http(s) URLs and the literal 'about:blank' -- never
	 * 'javascript:', 'data:' or another scheme (HMI-SEC-4).
	 */
	function isSafeFrameUrl(url)
	{
		return url != null && url !== '' && (url === 'about:blank' || /^https?:\/\//i.test(url));
	}

	/**
	 * Resolves ${var}, sanitizes and restricts a widget URL to http(s) (or
	 * 'about:blank'). Returns '' if the result is not safe to load.
	 */
	function resolveWidgetUrl(rt, cell, raw)
	{
		var resolved = rt.resolveVars(raw, cell);
		var safe = (resolved != null && resolved !== '') ? Graph.sanitizeLink(resolved) : null;

		return isSafeFrameUrl(safe) ? safe : '';
	}

	function bool(style, key, def)
	{
		var v = mxUtils.getValue(style, key, def);

		return v == '1' || v === 1 || v === true || v == 'true';
	}

	function num(style, key, def)
	{
		var v = parseFloat(mxUtils.getValue(style, key, def));

		return isNaN(v) ? def : v;
	}

	function DomWidgets(rt)
	{
		this.rt = rt;
		this.widgets = {};
		this.installed = false;
	};

	/**
	 * Overridable hook, mainly for tests / CSP-restricted embeds.
	 */
	DomWidgets.prototype.loadEcharts = defaultLoadEcharts;

	//======================================================================
	// Lifecycle
	//======================================================================

	DomWidgets.prototype.install = function()
	{
		if (this.installed)
		{
			return;
		}

		this.installed = true;

		var self = this;
		var graph = this.rt.graph;

		this.positionListener = function()
		{
			self.updatePositions();
		};
		graph.view.addListener(mxEvent.SCALE, this.positionListener);
		graph.view.addListener(mxEvent.TRANSLATE, this.positionListener);
		graph.view.addListener(mxEvent.SCALE_AND_TRANSLATE, this.positionListener);

		if (graph.container != null)
		{
			this.scrollListener = this.positionListener;
			mxEvent.addListener(graph.container, 'scroll', this.scrollListener);

			if (typeof ResizeObserver !== 'undefined')
			{
				try
				{
					this.resizeObserver = new ResizeObserver(this.positionListener);
					this.resizeObserver.observe(graph.container);
				}
				catch (e)
				{
					this.resizeObserver = null;
				}
			}
		}

		this.tagsListener = function()
		{
			self.onTags();
		};
		this.rt.on('tags', this.tagsListener);

		this.refresh();
	};

	DomWidgets.prototype.uninstall = function()
	{
		if (!this.installed)
		{
			return;
		}

		this.installed = false;

		var graph = this.rt.graph;
		graph.view.removeListener(this.positionListener);

		if (graph.container != null && this.scrollListener != null)
		{
			mxEvent.removeListener(graph.container, 'scroll', this.scrollListener);
		}

		if (this.resizeObserver != null)
		{
			try
			{
				this.resizeObserver.disconnect();
			}
			catch (e)
			{
				// ignore
			}

			this.resizeObserver = null;
		}

		this.rt.off('tags', this.tagsListener);

		if (this.dataTimer != null)
		{
			clearTimeout(this.dataTimer);
			this.dataTimer = null;
		}

		for (var id in this.widgets)
		{
			this.destroy(id);
		}

		this.widgets = {};
	};

	/**
	 * Rebuilds the widget set for the current page. Called after every
	 * buildPage() (initial build and every page switch).
	 */
	DomWidgets.prototype.refresh = function()
	{
		if (!this.installed)
		{
			return;
		}

		var wanted = this.scan();
		var id;

		for (id in this.widgets)
		{
			if (wanted[id] == null || wanted[id].type != this.widgets[id].type)
			{
				this.destroy(id);
			}
		}

		for (id in wanted)
		{
			if (this.widgets[id] == null)
			{
				this.create(id, wanted[id]);
			}
			else
			{
				this.widgets[id].cell = wanted[id].cell;
			}
		}

		this.updatePositions();
		this.updateData();
	};

	//======================================================================
	// Cell discovery
	//======================================================================

	/**
	 * Finds every cell of the current page (i.e. currently rendered, per
	 * the view's own state cache) whose shape is one of the widgets this
	 * module handles.
	 */
	DomWidgets.prototype.scan = function()
	{
		var result = {};
		var states = this.rt.graph.view.states;

		if (states == null)
		{
			return result;
		}

		// mxDictionary keys by object identity, not by cell.id (see
		// mxObjectIdentity), so the real cell id -- the key the overlay,
		// bindings and every other HMI module use -- has to come from
		// state.cell.id, not from the visitor's own key argument.
		states.visit(function(objectId, state)
		{
			if (state == null || state.cell == null || state.style == null)
			{
				return;
			}

			var shape = state.style[mxConstants.STYLE_SHAPE];

			if (shape == IFRAME_SHAPE || shape == VIDEO_SHAPE || shape == ECHARTS_SHAPE || shape == TABLE_SHAPE)
			{
				result[state.cell.id] = {cell: state.cell, type: shape.substring('mxgraph.hmi.'.length)};
			}
		});

		return result;
	};

	//======================================================================
	// Create / destroy
	//======================================================================

	DomWidgets.prototype.create = function(id, info)
	{
		var rec = {id: id, type: info.type, cell: info.cell};
		this.widgets[id] = rec;

		if (info.type == 'table')
		{
			rec.offset = 0;
			this.armTableTimer(rec);

			return;
		}

		var el;

		if (info.type == 'iframe')
		{
			el = document.createElement('iframe');
			el.setAttribute('frameborder', '0');
		}
		else if (info.type == 'video')
		{
			el = document.createElement('video');
			el.setAttribute('playsinline', '');
			el.controls = true;
		}
		else // echarts
		{
			el = document.createElement('div');
		}

		el.className = 'geHmiDomWidget geHmiDomWidget-' + info.type;
		el.setAttribute('data-hmi-cell', id);
		el.style.cssText = 'position:absolute;box-sizing:border-box;overflow:hidden;z-index:2;';

		if (info.type == 'echarts')
		{
			// Opaque background so the shape's own canvas-painted
			// placeholder (still there underneath, in the SVG) never
			// shows through a transparent chart background.
			var st = this.rt.graph.view.getState(info.cell);
			el.style.background = mxUtils.getValue(st != null ? st.style : {},
				mxConstants.STYLE_FILLCOLOR, '#ffffff');
		}

		this.rt.graph.container.appendChild(el);
		rec.el = el;

		if (info.type == 'echarts')
		{
			this.initEcharts(rec);
		}
	};

	DomWidgets.prototype.destroy = function(id)
	{
		var rec = this.widgets[id];

		if (rec == null)
		{
			return;
		}

		delete this.widgets[id];

		if (rec.scrollTimer != null)
		{
			clearInterval(rec.scrollTimer);
			rec.scrollTimer = null;
		}

		if (rec.refreshTimer != null)
		{
			clearInterval(rec.refreshTimer);
			rec.refreshTimer = null;
		}

		if (rec.chart != null)
		{
			try
			{
				rec.chart.dispose();
			}
			catch (e)
			{
				// ignore
			}

			rec.chart = null;
		}

		if (rec.el != null && rec.el.parentNode != null)
		{
			rec.el.parentNode.removeChild(rec.el);
		}
	};

	//======================================================================
	// Table auto-scroll (HMI-WGT-13)
	//======================================================================

	DomWidgets.prototype.armTableTimer = function(rec)
	{
		var state = this.rt.graph.view.getState(rec.cell);
		var enabled = state != null && bool(state.style, 'hmiAutoScroll', '0');

		if (!enabled)
		{
			if (rec.scrollTimer != null)
			{
				clearInterval(rec.scrollTimer);
				rec.scrollTimer = null;
			}

			rec.scrollInterval = null;

			return;
		}

		var interval = Math.max(100, num(state.style, 'hmiScrollInterval', 1500));

		if (rec.scrollTimer != null && rec.scrollInterval === interval)
		{
			return; // already running at the right rate
		}

		if (rec.scrollTimer != null)
		{
			clearInterval(rec.scrollTimer);
			rec.scrollTimer = null;
		}

		rec.scrollInterval = interval;

		var self = this;
		var id = rec.id;

		rec.scrollTimer = setInterval(function()
		{
			var w = self.widgets[id];

			if (w == null)
			{
				return;
			}

			w.offset = (w.offset || 0) + 1;
			self.rt.overlay.setStyle(id, 'hmiScrollOffset', w.offset, 'anim');
			self.rt.requestFlush();
		}, interval);
	};

	//======================================================================
	// Positioning
	//======================================================================

	DomWidgets.prototype.updatePositions = function()
	{
		var rt = this.rt;
		var graph = rt.graph;

		for (var id in this.widgets)
		{
			var rec = this.widgets[id];

			if (rec.el == null)
			{
				// Table: no DOM element to position, but the scroll timer
				// may need re-arming if hmiAutoScroll/hmiScrollInterval
				// changed via a binding.
				this.armTableTimer(rec);
				continue;
			}

			var state = graph.view.getState(rec.cell);
			var visible = state != null && rt.overlay.getVisible(rec.cell) !== false;

			if (!visible)
			{
				rec.el.style.display = 'none';
				continue;
			}

			rec.el.style.display = '';
			rec.el.style.left = state.x + 'px';
			rec.el.style.top = state.y + 'px';
			rec.el.style.width = Math.max(0, state.width) + 'px';
			rec.el.style.height = Math.max(0, state.height) + 'px';
			rec.el.style.pointerEvents = rt.interactive ? 'auto' : 'none';

			if (rec.chart != null)
			{
				try
				{
					rec.chart.resize();
				}
				catch (e)
				{
					// ignore -- chart may be mid-dispose
				}
			}
		}
	};

	//======================================================================
	// Data refresh (throttled to DATA_THROTTLE_MS)
	//======================================================================

	DomWidgets.prototype.onTags = function()
	{
		var self = this;
		var now = Date.now();

		if (this.lastDataUpdate == null || now - this.lastDataUpdate >= DATA_THROTTLE_MS)
		{
			this.lastDataUpdate = now;
			this.updateData();
		}
		else if (this.dataTimer == null)
		{
			this.dataTimer = setTimeout(function()
			{
				self.dataTimer = null;
				self.lastDataUpdate = Date.now();
				self.updateData();
			}, DATA_THROTTLE_MS - (now - this.lastDataUpdate));
		}
	};

	DomWidgets.prototype.updateData = function()
	{
		var graph = this.rt.graph;

		for (var id in this.widgets)
		{
			var rec = this.widgets[id];
			var state = graph.view.getState(rec.cell);

			if (state == null)
			{
				continue;
			}

			if (rec.type == 'iframe')
			{
				this.updateIframe(rec, state);
			}
			else if (rec.type == 'video')
			{
				this.updateVideo(rec, state);
			}
			else if (rec.type == 'echarts')
			{
				this.updateEcharts(rec, state);
			}
			else if (rec.type == 'table')
			{
				this.armTableTimer(rec);
			}
		}
	};

	//======================================================================
	// iframe  (HMI-WGT-19)
	//======================================================================

	DomWidgets.prototype.updateIframe = function(rec, state)
	{
		var rt = this.rt;
		var style = state.style;
		var url = resolveWidgetUrl(rt, rec.cell, mxUtils.getValue(style, 'hmiUrl', ''));

		if (url !== rec.lastUrl)
		{
			rec.lastUrl = url;
			rec.el.src = url || 'about:blank';
		}

		var tokens = String(mxUtils.getValue(style, 'hmiSandbox', 'allow-scripts allow-forms')).
			split(/\s+/).filter(function(t)
			{
				return t !== '' && t.toLowerCase() !== 'allow-same-origin';
			}).join(' ');

		if (tokens !== rec.lastSandbox)
		{
			rec.lastSandbox = tokens;
			rec.el.setAttribute('sandbox', tokens);
		}

		var refreshSec = Math.max(0, Math.round(num(style, 'hmiRefresh', 0)));

		if (refreshSec !== rec.refreshSec)
		{
			rec.refreshSec = refreshSec;

			if (rec.refreshTimer != null)
			{
				clearInterval(rec.refreshTimer);
				rec.refreshTimer = null;
			}

			if (refreshSec > 0)
			{
				rec.el.setAttribute('data-hmi-refresh', String(refreshSec));

				rec.refreshTimer = setInterval(mxUtils.bind(this, function()
				{
					if (rec.lastUrl)
					{
						rec.el.src = rec.lastUrl;
					}
				}), refreshSec * 1000);
			}
		}
	};

	//======================================================================
	// video  (HMI-WGT-19)
	//======================================================================

	DomWidgets.prototype.updateVideo = function(rec, state)
	{
		var rt = this.rt;
		var style = state.style;
		var url = resolveWidgetUrl(rt, rec.cell, mxUtils.getValue(style, 'hmiUrl', ''));
		var muted = bool(style, 'hmiMuted', '1');
		var loop = bool(style, 'hmiLoop', '1');
		var autoplay = bool(style, 'hmiAutoplay', '1') && muted;

		if (url !== rec.lastUrl)
		{
			rec.lastUrl = url;
			rec.el.src = url;
		}

		rec.el.muted = muted;
		rec.el.loop = loop;
		rec.el.autoplay = autoplay;

		if (autoplay && rec.el.paused && url)
		{
			var p = rec.el.play();

			if (p != null && p['catch'] != null)
			{
				p['catch'](function()
				{
					// Autoplay rejected by the browser -- controls remain
					// so the operator can start it manually.
				});
			}
		}
	};

	//======================================================================
	// ECharts  (HMI-WGT-20)
	//======================================================================

	DomWidgets.prototype.initEcharts = function(rec)
	{
		var self = this;

		this.loadEcharts().then(function(echarts)
		{
			if (self.widgets[rec.id] !== rec || rec.el.parentNode == null)
			{
				return; // torn down while loading
			}

			try
			{
				rec.chart = echarts.init(rec.el);
				self.applyEchartsOption(rec, true);
			}
			catch (e)
			{
				self.rt.log('warn', 'widget', 'ECharts init failed on ' + rec.id + ': ' + e.message);
			}
		}, function(e)
		{
			self.rt.log('warn', 'widget', 'Failed to load ECharts library: ' + e.message);
		});
	};

	DomWidgets.prototype.applyEchartsOption = function(rec, notMerge)
	{
		var state = this.rt.graph.view.getState(rec.cell);

		if (state == null || rec.chart == null)
		{
			return;
		}

		var raw = mxUtils.getValue(state.style, 'hmiOption', '{}');

		if (!notMerge && raw === rec.lastOption)
		{
			return;
		}

		rec.lastOption = raw;

		try
		{
			var option = JSON.parse(raw);
			rec.chart.setOption(option, !!notMerge);
		}
		catch (e)
		{
			this.rt.log('warn', 'widget', 'Invalid hmiOption JSON on ' + rec.id + ': ' + e.message);
		}
	};

	/**
	 * Shallow-copies a plain object (ECharts series entries), one level
	 * deep, so a mutated copy can be handed back to setOption without
	 * aliasing the chart's own last-applied option object.
	 */
	function shallowCopy(obj)
	{
		var copy = {};

		for (var key in obj)
		{
			copy[key] = obj[key];
		}

		return copy;
	}

	/**
	 * Caps a [[ts, value], ...] series to the last maxPoints entries.
	 */
	function capPoints(pts, maxPoints)
	{
		if (pts == null || pts.length <= maxPoints)
		{
			return pts || [];
		}

		return pts.slice(pts.length - maxPoints);
	}

	DomWidgets.prototype.updateEcharts = function(rec, state)
	{
		if (rec.chart == null)
		{
			return; // still loading the library
		}

		// A 'prop:option' binding re-applies the whole option (merged).
		this.applyEchartsOption(rec, false);

		var raw = this.rt.overlay.getSeries(rec.id);

		if (raw === undefined)
		{
			return;
		}

		var maxPoints = Math.max(1, Math.round(num(state.style, 'hmiMaxPoints', 300)));
		var option;

		try
		{
			option = rec.chart.getOption();
		}
		catch (e)
		{
			return;
		}

		var series = (option != null && option.series != null) ? option.series : [];

		if (series.length == 0)
		{
			return;
		}

		var changed = false;

		if (raw.length != null && (raw.length == 0 || raw[0] instanceof Array || (raw[0] && raw[0].length == 2)))
		{
			// Single series: [[ts, v], ...].
			series[0] = shallowCopy(series[0]);
			series[0].data = capPoints(raw, maxPoints);
			changed = true;
		}
		else
		{
			// Multi series: {name: [[ts, v], ...], ...} -- match by name,
			// appending a new line series for an unmatched name so nothing
			// bound is silently dropped.
			for (var name in raw)
			{
				var idx = -1;

				for (var i = 0; i < series.length; i++)
				{
					if (series[i].name == name)
					{
						idx = i;
						break;
					}
				}

				if (idx < 0)
				{
					series.push({name: name, type: 'line', data: []});
					idx = series.length - 1;
				}

				series[idx] = shallowCopy(series[idx]);
				series[idx].data = capPoints(raw[name], maxPoints);
				changed = true;
			}
		}

		if (changed)
		{
			try
			{
				rec.chart.setOption({series: series}, false);
			}
			catch (e)
			{
				this.rt.log('warn', 'widget', 'ECharts setOption failed on ' + rec.id + ': ' + e.message);
			}
		}
	};

	Hmi.DomWidgets = DomWidgets;
})();
