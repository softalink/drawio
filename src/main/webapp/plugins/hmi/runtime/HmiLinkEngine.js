/**
 * InTouch animation links at runtime (INTOUCH_LINKS.md §7-§8).
 *
 * Evaluates the display links of cells with an hmiLinks attribute into the
 * overlay layer 'link' (synchronised blinking in layer 'blink'), runs the
 * touch links from Hmi.EventDispatcher, handles key equivalents and maps
 * InTouch windows onto pages and faceplates. The model is never changed.
 */
(function()
{
	var root = (typeof globalThis !== 'undefined') ? globalThis : window;
	var Hmi = root.Hmi = root.Hmi || {};

	var LAYER = 'link';
	var BLINK = 'blink';
	var DEFAULT_LEVEL_COLOR = '#3A8EE6';
	var DEFAULT_PERIOD = 500;

	/**
	 * Link types that react to clicks, presses or keys.
	 */
	var TOUCH = ['inputDiscrete', 'inputAnalog', 'inputString', 'inputChoice', 'sliderH',
		'sliderV', 'pushDiscrete', 'pushValue', 'pushAction', 'showWindow', 'hideWindow',
		'openUrl', 'sendMessage', 'control'];

	/**
	 * Link types that can have a key equivalent.
	 */
	var KEYED = ['inputDiscrete', 'inputAnalog', 'inputString', 'inputChoice', 'pushDiscrete',
		'pushValue', 'pushAction', 'showWindow', 'hideWindow', 'openUrl', 'sendMessage', 'control'];

	/**
	 * Default blink of a multi-state entry with blink set.
	 */
	var STATE_BLINK = {mode: 'invisible', speed: 'medium'};

	/**
	 * Colour links and the style keys they set.
	 */
	var COLORS = {
		lineColor: ['strokeColor', 'hmiStrokeColor'],
		fillColor: ['fillColor', 'hmiFillColor'],
		textColor: ['fontColor', 'hmiFontColor']
	};

	/**
	 * Style keys that smooth changes interpolate (numbers and colours).
	 */
	var TWEEN_KEYS = {fillColor: true, strokeColor: true, fontColor: true, gradientColor: true,
		labelBackgroundColor: true, labelBorderColor: true, hmiFillColor: true, hmiStrokeColor: true,
		hmiFontColor: true, hmiLevelColor: true, opacity: true, fillOpacity: true, strokeOpacity: true,
		textOpacity: true, rotation: true, hmiLevel: true, hmiLevelH: true, fontSize: true, strokeWidth: true};
	var GEO_KEYS = ['dx', 'dy', 'dw', 'dh'];

	function LinkEngine(rt)
	{
		this.rt = rt;
		this.cells = {};
		this.count = 0;
		this.errors = {};
		this.timers = [];
		this.blinkTimers = {};
		this.blinkPhase = {};
		this.tweens = {};
		this.ageTimer = null;
		this.markers = (Hmi.AlarmMarkers != null && rt != null && rt.graph != null) ?
			new Hmi.AlarmMarkers(rt) : null;
	};

	/**
	 * All installed engines (main runtime and faceplates), newest last. Key
	 * equivalents go to the newest engine with a matching link.
	 */
	LinkEngine.engines = [];

	LinkEngine.TOUCH = TOUCH;

	/**
	 * Returns true if no roles are required or the user has any of them.
	 */
	LinkEngine.hasAnyRole = function(userRoles, required)
	{
		if (required == null || required.length == 0)
		{
			return true;
		}

		for (var i = 0; i < required.length; i++)
		{
			if (userRoles != null && mxUtils.indexOf(userRoles, required[i]) >= 0)
			{
				return true;
			}
		}

		return false;
	};

	/**
	 * Returns true if the touch options of the links ask for a confirmation.
	 */
	LinkEngine.needsConfirm = function(links)
	{
		return links != null && links.touchOptions != null && links.touchOptions.confirm != null &&
			String(links.touchOptions.confirm).trim() !== '';
	};

	/**
	 * Returns true if the links object has at least one link.
	 */
	LinkEngine.hasLinks = function(links)
	{
		if (links != null && typeof links === 'object')
		{
			for (var key in links)
			{
				if (links[key] != null)
				{
					return true;
				}
			}
		}

		return false;
	};

	/**
	 * Returns the blink half-periods {slow, medium, fast} in ms.
	 */
	LinkEngine.prototype.getBlinkPeriods = function()
	{
		var result = {slow: 1000, medium: 500, fast: 250};
		var gcfg = (root.DRAWIO_CONFIG != null && root.DRAWIO_CONFIG.hmi != null) ?
			root.DRAWIO_CONFIG.hmi.blink : null;
		var dcfg = (this.rt.config != null && this.rt.config.runtime != null) ?
			this.rt.config.runtime.blink : null;
		var sources = [gcfg, dcfg];

		for (var i = 0; i < sources.length; i++)
		{
			if (sources[i] != null)
			{
				for (var key in result)
				{
					var v = parseFloat(sources[i][key]);

					if (!isNaN(v) && v >= 50)
					{
						result[key] = v;
					}
				}
			}
		}

		return result;
	};

	/**
	 * Expression environment for a cell (INTOUCH_LINKS.md §1).
	 */
	LinkEngine.prototype.createEnv = function(cell, vars)
	{
		var rt = this.rt;

		return {
			tag: function(name)
			{
				return rt.tags.getValue(name);
			},
			tagEntry: function(name)
			{
				return rt.tags.get(name);
			},
			tagDef: function(name)
			{
				return rt.tags.getDef(name);
			},
			alarmOf: function(name)
			{
				return (rt.alarms != null && rt.alarms.stateOf != null) ?
					rt.alarms.stateOf(name) : null;
			},
			prop: function(name)
			{
				return (cell != null && cell.value != null && typeof cell.value === 'object') ?
					cell.value.getAttribute(name) : null;
			},
			vars: vars || ((rt.getVars != null) ? rt.getVars() : {})
		};
	};

	/**
	 * Evaluates an InTouch expression. Returns undefined on errors, which are
	 * logged once per cell and expression.
	 */
	LinkEngine.prototype.evaluate = function(rec, src, env)
	{
		if (src == null || String(src).trim() === '')
		{
			return undefined;
		}

		try
		{
			return Hmi.Expr.compile(String(src), {intouch: true}).evaluate(env ||
				this.createEnv(rec.cell));
		}
		catch (e)
		{
			var key = rec.id + ':' + src;

			if (!this.errors[key])
			{
				this.errors[key] = true;
				this.rt.log('warn', 'links', 'Expression error in ' + rec.id + ' (' + src +
					'): ' + e.message);
			}

			return undefined;
		}
	};

	/**
	 * Returns the field text of a cell: its design label as plain text.
	 */
	LinkEngine.prototype.getFieldText = function(cell)
	{
		var graph = this.rt.graph;
		var label = (cell.value != null && typeof cell.value === 'object') ?
			cell.value.getAttribute('label') : cell.value;
		label = (label != null) ? String(label) : '';

		if (graph.isHtmlLabel(cell) && (label.indexOf('<') >= 0 || label.indexOf('&') >= 0))
		{
			if (typeof document !== 'undefined')
			{
				var div = document.createElement('div');
				div.innerHTML = Graph.sanitizeHtml(label.replace(/<br\s*\/?>/gi, '\n'));
				label = div.textContent || '';
			}
			else
			{
				label = label.replace(/<[^>]*>/g, '');
			}
		}

		return label;
	};

	/**
	 * Returns the computed design style of a cell (without overlay values).
	 */
	LinkEngine.prototype.getDesignStyle = function(cell)
	{
		var graph = this.rt.graph;
		var overlay = this.rt.overlay;
		var suspended = overlay.suspended[cell.id];
		overlay.suspended[cell.id] = true;

		try
		{
			return graph.getCellStyle(cell);
		}
		catch (e)
		{
			return {};
		}
		finally
		{
			if (suspended)
			{
				overlay.suspended[cell.id] = suspended;
			}
			else
			{
				delete overlay.suspended[cell.id];
			}
		}
	};

	/**
	 * Builds the link records for the index of the current page.
	 */
	LinkEngine.prototype.build = function(index)
	{
		this.reset();
		this.index = index;
		this.cells = {};
		this.count = 0;

		if (index == null)
		{
			return;
		}

		var model = this.rt.graph.model;
		var order = {};
		var n = 0;

		// Z-order for key equivalents (topmost wins)
		(function visit(cell)
		{
			order[cell.id] = n++;

			for (var i = 0; i < model.getChildCount(cell); i++)
			{
				visit(model.getChildAt(cell, i));
			}
		})(model.getRoot());

		for (var id in index.cells)
		{
			var cfg = index.cells[id];

			if (LinkEngine.hasLinks(cfg.links))
			{
				var cell = cfg.cell;
				var geo = model.getGeometry(cell);

				this.cells[id] = {
					id: id,
					cell: cell,
					links: cfg.links,
					cfg: cfg,
					order: order[id] || 0,
					fieldText: this.getFieldText(cell),
					style: this.getDesignStyle(cell),
					width: (geo != null) ? geo.width : 0,
					height: (geo != null) ? geo.height : 0,
					prevStyles: {},
					prevAttrs: {}
				};
				var roles = (cfg.links.touchOptions != null) ? cfg.links.touchOptions.roles : null;
				this.cells[id].roleBlocked = !LinkEngine.hasAnyRole(this.rt.roles, roles);
				this.count++;
			}
		}

		if (this.count > 0)
		{
			this.updateAll();
		}

		this.startAgeTimer();
		this.rt.overlay.tooltipNode = mxUtils.bind(this, this.tooltipNode);

		if (this.markers != null)
		{
			this.markers.build(index);
		}
	};

	/**
	 * Re-evaluates cells with data-age settings once a second, so that they
	 * turn stale without a tag update and back when updates resume.
	 */
	LinkEngine.prototype.startAgeTimer = function()
	{
		var watched = [];

		for (var id in this.cells)
		{
			if (LinkEngine.watchesAge(this.cells[id].links))
			{
				watched.push(this.cells[id]);
			}
		}

		if (watched.length > 0 && this.ageTimer == null)
		{
			var self = this;

			this.ageTimer = setInterval(function()
			{
				for (var i = 0; i < watched.length; i++)
				{
					self.updateCell(watched[i]);
				}

				self.rt.requestFlush();
			}, 1000);
		}
	};

	/**
	 * True when a colour or Multi-State link of the set has staleSeconds.
	 */
	LinkEngine.watchesAge = function(links)
	{
		var types = ['lineColor', 'fillColor', 'textColor', 'states'];

		for (var i = 0; i < types.length; i++)
		{
			var l = (links != null) ? links[types[i]] : null;

			if (l != null && parseFloat(l.staleSeconds) > 0)
			{
				return true;
			}
		}

		return false;
	};

	/**
	 * Age in ms of the oldest tag a link reads (null when unknown).
	 */
	LinkEngine.prototype.dataAge = function(link)
	{
		if (link == null || !(parseFloat(link.staleSeconds) > 0))
		{
			return null;
		}

		var names = Hmi.Links.refs({link: link});
		var now = Date.now();
		var age = null;

		for (var i = 0; i < names.length; i++)
		{
			var entry = this.rt.tags.get(names[i]);

			if (entry != null && entry.ts != null)
			{
				age = Math.max((age == null) ? 0 : age, now - entry.ts);
			}
		}

		return age;
	};

	/**
	 * Re-evaluates all link cells.
	 */
	LinkEngine.prototype.updateAll = function()
	{
		for (var id in this.cells)
		{
			this.updateCell(this.cells[id]);
		}

		this.rt.requestFlush();
	};

	/**
	 * Re-evaluates the link cells that reference the given tags.
	 */
	LinkEngine.prototype.update = function(names)
	{
		this.updateLinks(names);

		// After the links, so that markers see the new visibility
		if (this.markers != null && names != null)
		{
			this.markers.update(names);
		}
	};

	LinkEngine.prototype.updateLinks = function(names)
	{
		if (this.count == 0 || this.index == null || names == null)
		{
			return;
		}

		var done = {};
		var changed = {};

		for (var i = 0; i < names.length; i++)
		{
			changed[names[i]] = true;
		}

		for (var i = 0; i < names.length; i++)
		{
			var list = this.index.tagToCells[names[i]];

			for (var j = 0; list != null && j < list.length; j++)
			{
				var rec = this.cells[list[j]];

				if (rec != null && !done[rec.id])
				{
					done[rec.id] = true;
					this.updateCell(rec, changed);
				}
			}
		}
	};

	/**
	 * Returns the alarm state of a tag for colour links.
	 */
	LinkEngine.prototype.alarmState = function(tag)
	{
		var alarms = this.rt.alarms;

		if (alarms != null && alarms.stateOf != null)
		{
			return alarms.stateOf(tag) || {active: false};
		}

		return {active: false};
	};

	/**
	 * Returns the value of a link: its expression or its tag.
	 */
	LinkEngine.prototype.linkValue = function(rec, link, env)
	{
		if (link.expr != null && String(link.expr).trim() !== '')
		{
			return this.evaluate(rec, link.expr, env);
		}
		else if (link.tag != null && link.tag !== '')
		{
			return this.rt.tags.getValue(link.tag);
		}

		return undefined;
	};

	/**
	 * Applies all display links of a cell to the overlay.
	 */
	LinkEngine.prototype.updateCell = function(rec, changed)
	{
		var rt = this.rt;
		var overlay = rt.overlay;
		var links = rec.links;
		var L = Hmi.Links;
		var env = this.createEnv(rec.cell);
		var styles = {};
		var geo = {dx: 0, dy: 0, dw: 0, dh: 0};
		var label = null;
		var self = this;

		var value = function(link)
		{
			return self.linkValue(rec, link, env);
		};

		// Value displays and input link labels
		var valueTypes = ['valueDiscrete', 'valueAnalog', 'valueString'];

		for (var i = 0; i < valueTypes.length; i++)
		{
			var link = links[valueTypes[i]];

			if (link != null)
			{
				var text = L.valueText(valueTypes[i], link, value(link), rec.fieldText);

				if (text != null)
				{
					label = text;
				}
			}
		}

		if (label == null)
		{
			label = this.inputLabel(rec);
		}

		// Location, sliders, orientation and size
		var loc = null;

		if (links.locationH != null)
		{
			loc = L.locationH(links.locationH, value(links.locationH));
			geo.dx += (loc != null) ? loc.dx || 0 : 0;
		}

		if (links.locationV != null)
		{
			loc = L.locationV(links.locationV, value(links.locationV));
			geo.dy += (loc != null) ? loc.dy || 0 : 0;
		}

		var sliders = [['sliderH', 'dx', false], ['sliderV', 'dy', true]];

		for (var i = 0; i < sliders.length; i++)
		{
			var link = links[sliders[i][0]];

			if (link != null)
			{
				var offset = null;

				if (rec.drag != null && rec.drag.type == sliders[i][0])
				{
					offset = rec.drag.offset;
				}
				else
				{
					var v = parseFloat(rt.tags.getValue(link.tag));
					loc = isNaN(v) ? null : (sliders[i][2] ? L.locationV(link, v) : L.locationH(link, v));
					offset = (loc != null) ? loc[sliders[i][1]] : null;
				}

				geo[sliders[i][1]] += offset || 0;
			}
		}

		if (links.orientation != null)
		{
			var o = L.orientation(links.orientation, value(links.orientation),
				rec.width, rec.height);

			if (o != null)
			{
				var base = parseFloat(rec.style[mxConstants.STYLE_ROTATION]) || 0;
				styles[mxConstants.STYLE_ROTATION] = Math.round((base + o.rotation) * 1000) / 1000;
				geo.dx += o.dx || 0;
				geo.dy += o.dy || 0;
			}
		}

		if (links.sizeHeight != null)
		{
			var sz = L.size(links.sizeHeight, value(links.sizeHeight), false, rec.width, rec.height);

			if (sz != null)
			{
				geo.dh += sz.dh || 0;
				geo.dy += sz.dy || 0;
			}
		}

		if (links.sizeWidth != null)
		{
			var sz = L.size(links.sizeWidth, value(links.sizeWidth), true, rec.width, rec.height);

			if (sz != null)
			{
				geo.dw += sz.dw || 0;
				geo.dx += sz.dx || 0;
			}
		}

		// Scale: width and height together (adds to Height and Width links)
		if (links.sizeScale != null && L.scale != null)
		{
			var sc = L.scale(links.sizeScale, value(links.sizeScale), rec.width, rec.height);

			if (sc != null)
			{
				geo.dw += sc.dw;
				geo.dh += sc.dh;
				geo.dx += sc.dx;
				geo.dy += sc.dy;
			}
		}

		// Colours
		var fillLinkColor = null;

		for (var type in COLORS)
		{
			var link = links[type];

			if (link != null)
			{
				var alarm = (link.kind == 'discreteAlarm' || link.kind == 'analogAlarm') ?
					this.alarmState(link.tag) : null;
				var v = (alarm != null) ? rt.tags.getValue(link.tag) : value(link);
				var color = L.color(link, v, alarm, this.dataAge(link));

				if (color != null)
				{
					this.setColor(rec, styles, COLORS[type], color);

					if (type == 'fillColor')
					{
						fillLinkColor = color;
					}
				}
			}
		}

		// Percent fill (fills with the object's colour over the background)
		var fv = (links.fillVertical != null) ? L.fill(links.fillVertical,
			value(links.fillVertical)) : null;
		var fh = (links.fillHorizontal != null) ? L.fill(links.fillHorizontal,
			value(links.fillHorizontal)) : null;

		if (fv != null || fh != null)
		{
			var design = rec.style[mxConstants.STYLE_FILLCOLOR];
			var levelColor = fillLinkColor || ((design != null && design != 'none' &&
				design != 'default') ? design : DEFAULT_LEVEL_COLOR);
			var bg = ((fh != null) ? links.fillHorizontal.backgroundColor :
				links.fillVertical.backgroundColor) || '#FFFFFF';
			styles.hmiLevelColor = levelColor;
			styles[mxConstants.STYLE_FILLCOLOR] = bg;
			styles.hmiLevelMin = 0;
			styles.hmiLevelMax = 100;
			styles.hmiLevel = (fv != null) ? fv.percent : 100;
			styles.hmiLevelDirection = (fv != null) ? (fv.direction || 'up') : 'up';

			if (fh != null)
			{
				styles.hmiLevelH = fh.percent;
				styles.hmiLevelHDirection = fh.direction || 'right';
			}

			if (rec.style.hmiFillColor != null)
			{
				styles.hmiFillColor = bg;
			}
		}

		// Visibility, disable and tooltip
		var visible = true;

		if (links.visibility != null)
		{
			var vis = L.visible(links.visibility, value(links.visibility));
			visible = (vis !== false);
		}

		overlay.setVisible(rec.id, visible ? null : false, LAYER);
		rec.hidden = !visible;

		if (links.disable != null)
		{
			rec.disabled = L.disabled(links.disable, value(links.disable)) === true;
		}

		if (links.tooltip != null)
		{
			var tip = (links.tooltip.mode == 'expression') ?
				this.evaluate(rec, links.tooltip.expr, env) : links.tooltip.text;

			if (links.tooltip.trend === true)
			{
				var trendTag = this.recordTrend(rec, links.tooltip);

				// The trend needs a tooltip, even without text
				if ((tip == null || tip === '') && trendTag != null)
				{
					tip = trendTag;
				}
			}

			overlay.setTooltip(rec.id, (tip != null && tip !== '') ?
				String(tip).substring(0, (links.tooltip.mode == 'expression') ? 1024 : 131) : null, LAYER);
		}

		// Opacity (meta2d globalAlpha)
		if (links.opacity != null && L.opacity != null)
		{
			var op = L.opacity(links.opacity, value(links.opacity));

			if (op != null)
			{
				styles[mxConstants.STYLE_OPACITY] = Math.round(op);
			}
		}

		// Multi-state appearance (meta2d trigger states)
		var stateBlink = false;

		if (links.states != null && L.state != null)
		{
			var sv = value(links.states);
			var st = L.state(links.states, sv, this.dataAge(links.states));

			if (st != null)
			{
				for (var type in COLORS)
				{
					if (st[type] != null && st[type] !== '')
					{
						this.setColor(rec, styles, COLORS[type], st[type]);
					}
				}

				if (st.label != null && st.label !== '')
				{
					label = (String(st.label).indexOf('#') >= 0 && Hmi.Format.applyMask != null) ?
						Hmi.Format.applyMask(String(st.label), sv) : String(st.label);
				}

				if (st.image != null && st.image !== '')
				{
					styles[(rec.style.shape == 'image' || rec.style.image != null) ?
						'image' : 'hmiImage'] = st.image;
				}

				if (st.opacity != null && st.opacity !== '' && !isNaN(parseFloat(st.opacity)))
				{
					styles[mxConstants.STYLE_OPACITY] = Math.max(0, Math.min(100, parseFloat(st.opacity)));
				}

				if (st.visible === false)
				{
					visible = false;
					overlay.setVisible(rec.id, false, LAYER);
					rec.hidden = true;
				}

				stateBlink = st.blink === true;
			}
		}

		// Properties (meta2d realTimes on any property)
		if (links.properties != null && links.properties.items != null)
		{
			var attrs = {};

			for (var i = 0; i < links.properties.items.length; i++)
			{
				var item = links.properties.items[i];

				if (item != null && item.target)
				{
					var pv = this.evaluate(rec, item.expr, env);

					if (pv !== undefined)
					{
						var r = this.applyProperty(rec, item.target, pv, styles, attrs);

						if (r != null && r.label !== undefined)
						{
							label = r.label;
						}
					}
				}
			}

			for (var name in rec.prevAttrs)
			{
				if (attrs[name] === undefined)
				{
					overlay.setAttribute(rec.id, name, null, LAYER);
				}
			}

			rec.prevAttrs = attrs;
		}

		// Widget data (mxgraph.hmi widgets and charts)
		if (links.widgetData != null)
		{
			var wd = links.widgetData;

			if (wd.expr != null && String(wd.expr).trim() !== '')
			{
				var wv = this.evaluate(rec, wd.expr, env);

				if (wv !== undefined)
				{
					styles.hmiValue = (wv != null && typeof wv === 'object') ? JSON.stringify(wv) :
						Hmi.BindingEngine.styleValue(wv);
				}
			}

			for (var i = 0; wd.series != null && i < wd.series.length; i++)
			{
				var se = wd.series[i];
				var entry = (se != null && se.tag) ? rt.tags.get(se.tag) : null;

				if (entry != null && (changed == null || changed[se.tag]) && entry.value != null &&
					!isNaN(parseFloat(entry.value)))
				{
					overlay.pushSeries(rec.id, entry.ts || Date.now(), parseFloat(entry.value),
						se.maxPoints || 600, se.name || se.tag);
				}
			}
		}

		// Animation (meta2d animations and presets)
		if (links.animation != null && rt.animator != null && rt.animator.setLinkAnimation != null)
		{
			this.updateAnimation(rec, env);
		}

		// Flow (meta2d line animation)
		if (links.flow != null)
		{
			var fl = links.flow;
			var run = (fl.expr == null || String(fl.expr).trim() === '') ? true :
				L.isTrue(this.evaluate(rec, fl.expr, env));
			var speed = (fl.speedExpr != null && String(fl.speedExpr).trim() !== '') ?
				parseFloat(this.evaluate(rec, fl.speedExpr, env)) : 1;

			if (isNaN(speed))
			{
				speed = 1;
			}

			styles.flowAnimation = (run && speed > 0) ? '1' : '0';

			if (run && speed > 0)
			{
				var base = parseFloat(rec.style.flowAnimationDuration) || 500;
				styles.flowAnimationDuration = Math.max(20, Math.round(base / speed));
				styles.flowAnimationType = fl.type || 'dash';
				styles.flowAnimationReverse = (fl.reverseExpr != null &&
					String(fl.reverseExpr).trim() !== '' &&
					L.isTrue(this.evaluate(rec, fl.reverseExpr, env))) ? '1' : '0';

				if (fl.color)
				{
					styles.flowAnimationColor = fl.color;
				}

				if (fl.width != null && fl.width !== '')
				{
					styles.flowAnimationWidth = fl.width;
				}
			}
		}

		// Media (meta2d video/audio control)
		if (links.media != null)
		{
			var on = (links.media.expr == null || String(links.media.expr).trim() === '') ? true :
				L.isTrue(this.evaluate(rec, links.media.expr, env));
			var play = (links.media.mode == 'pause') ? !on : on;

			if (play !== rec.mediaPlaying)
			{
				rec.mediaPlaying = play;
				this.mediaCommand([rec.cell], play ? 'play' : 'pause');
			}
		}

		// Object scripts (run mode only)
		if (rt.interactive && rt.running)
		{
			this.updateScripts(rec, env);
		}

		// Blink condition (blink link or a blinking multi-state entry)
		var blinkLink = links.blink || (stateBlink ? STATE_BLINK : null);

		if (blinkLink != rec.blinkLink && rec.blinkLink != null)
		{
			// The blink definition changed: resets the blink layer
			rec.blinking = false;
			this.applyBlink(rec);
		}

		rec.blinkLink = blinkLink;

		if (blinkLink != null)
		{
			var on = (links.blink != null && L.isTrue(value(links.blink))) || stateBlink;

			if (on != !!rec.blinking)
			{
				rec.blinking = on;

				if (on)
				{
					this.startBlink(blinkLink.speed || 'medium');
				}
			}

			this.applyBlink(rec);
		}

		// Writes the changes
		overlay.setLabel(rec.id, label, LAYER);
		this.writeShown(rec, styles, geo);
		rec.prevStyles = styles;
	};

	/**
	 * Smooth-change duration of a cell in ms: its smooth link, else the
	 * page option runtime.smoothMs, else 0 (off).
	 */
	LinkEngine.prototype.smoothDuration = function(rec)
	{
		var link = rec.links.smooth;
		var ms = (link != null) ? parseFloat(link.duration) :
			parseFloat((this.rt.config != null && this.rt.config.runtime != null) ?
			this.rt.config.runtime.smoothMs : 0);

		return (isNaN(ms) || ms <= 0) ? 0 : Math.min(10000, ms);
	};

	/**
	 * Writes the styles and geometry offsets of a cell, interpolating
	 * numbers and colours over the smooth duration once the screen has its
	 * initial values (grafana-flowcharting animation).
	 */
	LinkEngine.prototype.writeShown = function(rec, styles, geo)
	{
		var overlay = this.rt.overlay;
		var L = Hmi.Links;
		var ms = this.smoothDuration(rec);
		var animate = ms > 0 && this.rt.initialized === true;
		var shown = rec.shown = rec.shown || {};
		var old = this.tweens[rec.id] || {items: {}, geo: null};
		var tw = {rec: rec, items: {}, geo: null};
		var now = Date.now();
		var count = 0;

		for (var key in rec.prevStyles)
		{
			if (styles[key] === undefined)
			{
				overlay.setStyle(rec.id, key, null, LAYER);
				delete shown[key];
			}
		}

		for (var key in styles)
		{
			var to = styles[key];
			var running = old.items[key];

			// A running change to the same value continues
			if (animate && running != null && String(running.to) === String(to))
			{
				tw.items[key] = running;
				count++;

				continue;
			}

			var from = (shown[key] !== undefined) ? shown[key] : rec.style[key];

			if (animate && TWEEN_KEYS[key] && to != null && from != null && String(from) !== String(to) &&
				L.tween(from, to, 0.5) !== undefined)
			{
				tw.items[key] = {from: from, to: to, start: now, ms: ms};
				count++;
			}
			else
			{
				overlay.setStyle(rec.id, key, to, LAYER);
				shown[key] = to;
			}
		}

		var geoTo = (geo.dx != 0 || geo.dy != 0 || geo.dw != 0 || geo.dh != 0) ? geo : null;

		if (animate && old.geo != null && LinkEngine.sameGeo(old.geo.to, geoTo))
		{
			tw.geo = old.geo;
			count++;
		}
		else if (animate && !LinkEngine.sameGeo(rec.shownGeo, geoTo))
		{
			tw.geo = {from: rec.shownGeo || {dx: 0, dy: 0, dw: 0, dh: 0}, to: geoTo, start: now, ms: ms};
			count++;
		}
		else
		{
			overlay.setGeo(rec.id, geoTo, LAYER);
			rec.shownGeo = geoTo;
		}

		if (count > 0)
		{
			this.tweens[rec.id] = tw;
			this.rt.requestFlush();
		}
		else
		{
			delete this.tweens[rec.id];
		}
	};

	LinkEngine.sameGeo = function(a, b)
	{
		for (var i = 0; i < GEO_KEYS.length; i++)
		{
			if (((a != null) ? a[GEO_KEYS[i]] || 0 : 0) != ((b != null) ? b[GEO_KEYS[i]] || 0 : 0))
			{
				return false;
			}
		}

		return true;
	};

	/**
	 * Ease in and out of a smooth change (t in 0..1).
	 */
	function ease(t)
	{
		return (t < 0.5) ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
	};

	/**
	 * Advances the smooth changes. Returns true while any is running.
	 */
	LinkEngine.prototype.tick = function(now)
	{
		var overlay = this.rt.overlay;
		var L = Hmi.Links;
		var running = false;

		for (var id in this.tweens)
		{
			var tw = this.tweens[id];
			var rec = tw.rec;
			var left = 0;

			for (var key in tw.items)
			{
				var it = tw.items[key];
				var t = Math.min(1, (now - it.start) / it.ms);
				var v = L.tween(it.from, it.to, ease(t));
				overlay.setStyle(id, key, v, LAYER);
				rec.shown[key] = v;

				if (t >= 1)
				{
					delete tw.items[key];
				}
				else
				{
					left++;
				}
			}

			if (tw.geo != null)
			{
				var g = tw.geo;
				var t = Math.min(1, (now - g.start) / g.ms);
				var to = g.to || {dx: 0, dy: 0, dw: 0, dh: 0};
				var cur = g.to;

				if (t < 1)
				{
					cur = {};

					for (var j = 0; j < GEO_KEYS.length; j++)
					{
						var k = GEO_KEYS[j];
						cur[k] = (g.from[k] || 0) + ((to[k] || 0) - (g.from[k] || 0)) * ease(t);
					}

					left++;
				}
				else
				{
					tw.geo = null;
				}

				overlay.setGeo(id, cur, LAYER);
				rec.shownGeo = cur;
			}

			if (left == 0)
			{
				delete this.tweens[id];
			}
			else
			{
				running = true;
			}
		}

		return running;
	};

	/**
	 * Records the tooltip trend of a cell: the values of the trend tag (or
	 * the first tag of the tooltip expression) over trendSeconds. Returns
	 * the tag name or null.
	 */
	LinkEngine.prototype.recordTrend = function(rec, link)
	{
		var tag = link.trendTag;

		if (!tag)
		{
			var names = Hmi.Links.refs({link: {expr: (link.mode == 'expression') ? link.expr : null}});
			tag = (names.length > 0) ? names[0] : null;
		}

		if (tag == null)
		{
			rec.trend = null;

			return null;
		}

		var span = Math.max(5, Math.min(3600, parseFloat(link.trendSeconds) || 60)) * 1000;
		var trend = rec.trend;

		if (trend == null || trend.tag != tag)
		{
			trend = rec.trend = {tag: tag, span: span, points: []};
		}

		trend.span = span;
		var entry = this.rt.tags.get(tag);
		var v = (entry != null) ? parseFloat(entry.value) : NaN;

		if (entry != null && !isNaN(v))
		{
			var ts = entry.ts || Date.now();
			var last = trend.points[trend.points.length - 1];

			if (last == null || last[0] != ts || last[1] != v)
			{
				trend.points.push([ts, v]);
			}
		}

		// Keeps the window (and one older point for the left edge)
		var cut = Date.now() - span;

		while (trend.points.length > 2 && trend.points[1][0] < cut)
		{
			trend.points.shift();
		}

		if (trend.points.length > 2000)
		{
			trend.points.splice(0, trend.points.length - 2000);
		}

		return tag;
	};

	/**
	 * Tooltip HTML with the text and a sparkline of the recorded trend, or
	 * null for a plain text tooltip.
	 */
	LinkEngine.prototype.tooltipNode = function(cell, text)
	{
		var rec = (cell != null) ? this.cells[cell.id] : null;

		if (rec == null || rec.trend == null || rec.links.tooltip == null || rec.links.tooltip.trend !== true)
		{
			return null;
		}

		return LinkEngine.sparkline(rec.trend, text, Date.now());
	};

	/**
	 * Builds the tooltip HTML: text lines, a 180x44 sparkline (SVG) of the
	 * points in [now - span, now] (or since the first point, while less is
	 * recorded) and min, max and last values.
	 */
	LinkEngine.sparkline = function(trend, text, now)
	{
		var div = document.createElement('div');
		div.setAttribute('data-hmi-trend', trend.tag);

		if (text != null && text !== '' && text != trend.tag)
		{
			var lines = String(text).split('\n');

			for (var i = 0; i < lines.length; i++)
			{
				var line = document.createElement('div');
				line.textContent = lines[i];
				div.appendChild(line);
			}
		}

		var W = 180, H = 44, P = 2;
		var pts = trend.points;
		// Until a full period is recorded, the chart spans the recorded time
		var start = (pts.length > 0) ? Math.min(Math.max(now - trend.span, pts[0][0]), now - 1000) :
			now - trend.span;
		var width = now - start;
		var min = Infinity, max = -Infinity;

		for (var i = 0; i < pts.length; i++)
		{
			min = Math.min(min, pts[i][1]);
			max = Math.max(max, pts[i][1]);
		}

		var ns = 'http://www.w3.org/2000/svg';
		var svg = document.createElementNS(ns, 'svg');
		svg.setAttribute('width', W);
		svg.setAttribute('height', H);
		svg.style.display = 'block';
		svg.style.margin = '4px 0 2px 0';
		var bg = document.createElementNS(ns, 'rect');
		bg.setAttribute('width', W);
		bg.setAttribute('height', H);
		bg.setAttribute('fill', 'rgba(127,127,127,0.12)');
		svg.appendChild(bg);

		if (pts.length > 0)
		{
			var range = (max - min) || 1;
			var x = function(ts) { return P + Math.max(0, (ts - start) / width) * (W - 2 * P); };
			var y = function(v) { return H - P - (v - min) / range * (H - 2 * P) - ((max == min) ? (H / 2 - P) : 0); };
			var d = '';

			// Step line: a value holds until the next one
			for (var i = 0; i < pts.length; i++)
			{
				var px = x(pts[i][0]);
				var py = y(pts[i][1]);
				d += (i == 0) ? 'M' + px + ' ' + py : ' L' + px + ' ' + y(pts[i - 1][1]) + ' L' + px + ' ' + py;
			}

			var endX = x(now);
			d += ' L' + endX + ' ' + y(pts[pts.length - 1][1]);
			var path = document.createElementNS(ns, 'path');
			path.setAttribute('d', d);
			path.setAttribute('fill', 'none');
			path.setAttribute('stroke', '#1E88E5');
			path.setAttribute('stroke-width', '1.5');
			path.setAttribute('stroke-linejoin', 'round');
			svg.appendChild(path);
		}

		div.appendChild(svg);
		var fmt = function(v) { return (Math.round(v * 100) / 100).toString(); };
		var info = document.createElement('div');
		info.style.fontSize = '10px';
		info.style.opacity = '0.8';
		info.textContent = trend.tag + (pts.length > 0 ? '  ' + mxResources.get('min', null, 'min') + ' ' + fmt(min) +
			'  ' + mxResources.get('max', null, 'max') + ' ' + fmt(max) +
			'  = ' + fmt(pts[pts.length - 1][1]) : '');
		div.appendChild(info);

		// HTML markup: mxTooltipHandler only shows strings
		return div.outerHTML;
	};

	/**
	 * Applies a properties-link (or SetProperty) target. Style and prop
	 * targets go into styles, attributes into attrs (both may be null to
	 * write directly to the overlay layer). Returns {label} for label
	 * targets.
	 */
	LinkEngine.prototype.applyProperty = function(rec, target, value, styles, attrs, layer)
	{
		var overlay = this.rt.overlay;
		var id = rec.id;
		layer = layer || LAYER;
		target = String(target);
		var str = (value != null && typeof value === 'object') ? JSON.stringify(value) :
			Hmi.BindingEngine.styleValue(value);

		if (target == 'label')
		{
			if (styles == null)
			{
				overlay.setLabel(id, (value == null) ? '' : String(value), layer);

				return null;
			}

			return {label: (value == null) ? '' : String(value)};
		}
		else if (target == 'tooltip')
		{
			overlay.setTooltip(id, (value == null || value === '') ? null : String(value), layer);
		}
		else if (target == 'visible')
		{
			overlay.setVisible(id, Hmi.Links.isTrue(value) ? null : false, layer);
		}
		else if (target.substring(0, 6) == 'style:' || target.substring(0, 5) == 'prop:')
		{
			var key = (target.charAt(0) == 's') ? target.substring(6) :
				'hmi' + target.charAt(5).toUpperCase() + target.substring(6);

			if (styles != null)
			{
				styles[key] = str;
			}
			else
			{
				overlay.setStyle(id, key, str, layer);
			}
		}
		else if (target.substring(0, 5) == 'attr:')
		{
			var name = target.substring(5);

			if (attrs != null)
			{
				attrs[name] = str;
			}

			overlay.setAttribute(id, name, (value == null) ? '' : String(value), layer);
		}
		else
		{
			this.rt.log('warn', 'links', 'Unknown property target ' + target + ' on ' + id);
		}

		return null;
	};

	/**
	 * Runs, pauses or stops the animation link of a cell.
	 */
	LinkEngine.prototype.updateAnimation = function(rec, env)
	{
		var L = Hmi.Links;
		var link = rec.links.animation;
		var animator = this.rt.animator;
		var run = (link.expr == null || String(link.expr).trim() === '') ? true :
			L.isTrue(this.evaluate(rec, link.expr, env));
		var preset = link.preset || 'spin';
		var rate = (link.rateExpr != null && String(link.rateExpr).trim() !== '') ?
			this.evaluate(rec, link.rateExpr, env) : undefined;
		var reverse = link.reverseExpr != null && String(link.reverseExpr).trim() !== '' &&
			L.isTrue(this.evaluate(rec, link.reverseExpr, env));

		if (preset == 'custom')
		{
			// Named animation of the object (hmiAnimations)
			var name = link.name || null;
			var active = rec.customAnimation;

			if (run && !active)
			{
				animator.start(rec.id, name);
				rec.customAnimation = true;
			}
			else if (!run && active)
			{
				animator.stop(rec.id, name);
				rec.customAnimation = false;
			}

			return;
		}

		var duration = (L.animationDuration != null) ? L.animationDuration(preset, rate) :
			undefined;
		var params = {};

		if (preset == 'spin')
		{
			if (rate !== undefined && !isNaN(parseFloat(rate)))
			{
				params.rpm = parseFloat(rate);
			}

			params.reverse = reverse;
		}

		if (preset == 'glow')
		{
			params.color = link.color || '#E53935';
		}

		var def = {name: 'hmiLinkAnimation', preset: preset, params: params,
			duration: (preset != 'spin' && duration != null) ? Math.round(duration) : undefined};
		animator.setLinkAnimation(rec.id, def, run, duration === null);
	};

	/**
	 * Plays, pauses or stops the video/audio of the given cells.
	 */
	LinkEngine.prototype.mediaCommand = function(cells, command)
	{
		var rt = this.rt;

		for (var i = 0; i < cells.length; i++)
		{
			try
			{
				Hmi.Actions.types.playMedia(rt, {target: cells[i].id, command: command},
					{cell: cells[i]});
			}
			catch (e)
			{
				rt.log('warn', 'links', 'Media ' + command + ' failed: ' + e.message);
			}
		}
	};

	/**
	 * Returns the cells for an object reference: '' or 'Me' (the object),
	 * a cell id or tag:<draw.io tag>.
	 */
	LinkEngine.prototype.resolveObjects = function(rec, object)
	{
		var rt = this.rt;
		object = (object == null) ? '' : String(object).trim();

		if (object === '' || object.toLowerCase() == 'me')
		{
			return (rec != null) ? [rec.cell] : [];
		}

		if (object.substring(0, 4) == 'tag:')
		{
			var tag = object.substring(4);
			var graph = rt.graph;
			var result = [];
			var cells = graph.model.getDescendants(graph.model.getRoot());

			for (var i = 0; i < cells.length; i++)
			{
				var tags = (graph.getTagsForCell != null) ? graph.getTagsForCell(cells[i]) : '';

				if (tags && (' ' + tags + ' ').indexOf(' ' + tag + ' ') >= 0)
				{
					result.push(cells[i]);
				}
			}

			return result;
		}

		var cell = rt.getCell(object);

		return (cell != null) ? [cell] : [];
	};

	/**
	 * Starts, pauses or stops animations of objects ('start', 'pause',
	 * 'stop'). An empty name runs the object's animation link or its first
	 * named animation.
	 */
	LinkEngine.prototype.animationCommand = function(rec, object, command, name)
	{
		var animator = this.rt.animator;
		var cells = this.resolveObjects(rec, object);

		for (var i = 0; i < cells.length; i++)
		{
			var target = this.cells[cells[i].id];
			var n = (name != null && name !== '') ? name : null;

			// Animation link of the target
			if (n == null && target != null && target.links.animation != null &&
				(target.links.animation.preset || 'spin') != 'custom')
			{
				var def = animator.linkDefs[cells[i].id];

				if (command == 'stop')
				{
					animator.setLinkAnimation(cells[i].id, null, false);
				}
				else if (def != null)
				{
					animator[(command == 'pause') ? 'pause' : 'start'](cells[i].id, def.name);
				}
				else if (command == 'start')
				{
					this.updateAnimation(target, this.createEnv(target.cell));
				}

				continue;
			}

			if (n == null && target != null && target.links.animation != null)
			{
				n = target.links.animation.name || null;
			}

			if (command == 'pause')
			{
				animator.pause(cells[i].id, n);
			}
			else if (command == 'stop')
			{
				animator.stop(cells[i].id, n);
			}
			else
			{
				animator.start(cells[i].id, n);
			}
		}

		this.rt.requestFlush();
	};

	/**
	 * Data change and condition scripts of an object.
	 */
	LinkEngine.prototype.updateScripts = function(rec, env)
	{
		var L = Hmi.Links;
		var links = rec.links;
		var self = this;

		if (links.dataChange != null && links.dataChange.script)
		{
			var v = this.evaluate(rec, links.dataChange.expr, env);
			var changed = (L.changed != null) ? L.changed(rec.dataPrev, v,
				parseFloat(links.dataChange.deadband) || 0) : v !== rec.dataPrev;

			if (changed)
			{
				rec.dataPrev = v;
				this.runQuickScript(rec, links.dataChange.script);
			}
		}

		if (links.condition != null)
		{
			var c = links.condition;
			var b = L.isTrue(this.evaluate(rec, c.expr, env));

			if (b !== rec.condPrev)
			{
				var first = rec.condPrev === undefined;
				rec.condPrev = b;

				if (rec.condTimer != null)
				{
					clearInterval(rec.condTimer);
					rec.condTimer = null;
				}

				if (b && c.onTrue)
				{
					this.runQuickScript(rec, c.onTrue);
				}
				else if (!b && !first && c.onFalse)
				{
					this.runQuickScript(rec, c.onFalse);
				}

				var repeat = b ? c.whileTrue : c.whileFalse;

				if (repeat)
				{
					rec.condTimer = setInterval(function()
					{
						if (!self.rt.running)
						{
							clearInterval(rec.condTimer);
							rec.condTimer = null;

							return;
						}

						self.runQuickScript(rec, repeat);
					}, Math.max(100, parseFloat(c.period) || 1000));
				}
			}
		}
	};

	/**
	 * Sets a colour in the given style keys. hmi* keys are only set for
	 * widgets that use them.
	 */
	LinkEngine.prototype.setColor = function(rec, styles, keys, color)
	{
		for (var i = 0; i < keys.length; i++)
		{
			if (i == 0 || rec.style[keys[i]] != null)
			{
				styles[keys[i]] = color;
			}
		}
	};

	/**
	 * Label of input links (the tag's value) unless inputOnly.
	 */
	LinkEngine.prototype.inputLabel = function(rec)
	{
		var links = rec.links;
		var tags = this.rt.tags;
		var L = Hmi.Links;
		var link = links.inputDiscrete;

		if (link != null && !link.inputOnly && link.tag)
		{
			var v = tags.getValue(link.tag);

			return (v === undefined) ? null : (L.isTrue(v) ? (link.onMessage || 'On') :
				(link.offMessage || 'Off'));
		}

		link = links.inputAnalog;

		if (link != null && !link.inputOnly && link.tag)
		{
			var v = tags.getValue(link.tag);

			return (v === undefined) ? null : L.valueText('valueAnalog', link, v, rec.fieldText);
		}

		link = links.inputString;

		if (link != null && !link.inputOnly && link.tag)
		{
			var v = tags.getValue(link.tag);

			if (v === undefined)
			{
				return null;
			}

			v = String(v);

			if (link.echo == 'no')
			{
				return '';
			}
			else if (link.echo == 'password')
			{
				return new Array(v.length + 1).join((link.passwordChar || '*').charAt(0));
			}

			return v;
		}

		return null;
	};

	// ------------------------------------------------------------------
	// Blink (synchronised per speed)
	// ------------------------------------------------------------------

	LinkEngine.prototype.startBlink = function(speed)
	{
		if (this.blinkTimers[speed] != null)
		{
			return;
		}

		var self = this;
		var periods = this.getBlinkPeriods();
		this.blinkPhase[speed] = false;

		this.blinkTimers[speed] = setInterval(function()
		{
			self.blinkPhase[speed] = !self.blinkPhase[speed];
			var any = false;

			for (var id in self.cells)
			{
				var rec = self.cells[id];

				if (rec.blinkLink != null && (rec.blinkLink.speed || 'medium') == speed)
				{
					self.applyBlink(rec);
					any = any || rec.blinking;
				}
			}

			if (!any)
			{
				clearInterval(self.blinkTimers[speed]);
				delete self.blinkTimers[speed];
			}

			self.rt.requestFlush();
		}, periods[speed] || DEFAULT_PERIOD);
	};

	/**
	 * Applies the blink phase of a cell to the blink layer.
	 */
	LinkEngine.prototype.applyBlink = function(rec)
	{
		var overlay = this.rt.overlay;
		var link = rec.blinkLink || rec.links.blink || STATE_BLINK;
		var off = rec.blinking && this.blinkPhase[link.speed || 'medium'] === true;

		if (rec.blinkOff == off)
		{
			return;
		}

		rec.blinkOff = off;

		if (link.mode == 'visible')
		{
			var styles = {};

			if (off)
			{
				for (var type in COLORS)
				{
					if (link[type] != null && link[type] !== '')
					{
						this.setColor(rec, styles, COLORS[type], link[type]);
					}
				}
			}

			var keys = ['strokeColor', 'hmiStrokeColor', 'fillColor', 'hmiFillColor',
				'fontColor', 'hmiFontColor'];

			for (var i = 0; i < keys.length; i++)
			{
				overlay.setStyle(rec.id, keys[i], styles[keys[i]], BLINK);
			}
		}
		else
		{
			overlay.setVisible(rec.id, off ? false : null, BLINK);
		}
	};

	LinkEngine.prototype.stopBlink = function()
	{
		for (var speed in this.blinkTimers)
		{
			clearInterval(this.blinkTimers[speed]);
		}

		this.blinkTimers = {};
		this.blinkPhase = {};
	};

	// ------------------------------------------------------------------
	// Touch links
	// ------------------------------------------------------------------

	/**
	 * Returns true if the links object has a touch link.
	 */
	LinkEngine.hasTouch = function(links)
	{
		for (var i = 0; links != null && i < TOUCH.length; i++)
		{
			if (links[TOUCH[i]] != null)
			{
				return true;
			}
		}

		return false;
	};

	/**
	 * Returns true if the cell or an ancestor is disabled by a disable link,
	 * Touch Options roles or the roles of the Security link.
	 */
	LinkEngine.prototype.isDisabled = function(cell)
	{
		var model = this.rt.graph.model;

		while (cell != null)
		{
			var rec = this.cells[cell.id];

			if (rec != null && (rec.disabled || rec.roleBlocked || (rec.cfg != null && rec.cfg.disabled)))
			{
				return true;
			}

			cell = model.getParent(cell);
		}

		return false;
	};

	/**
	 * Returns the record of the nearest ancestor-or-self with touch links or
	 * null. Disabled and hidden cells have no active touch links.
	 */
	LinkEngine.prototype.findTouch = function(cell)
	{
		if (this.count == 0 || cell == null || this.isDisabled(cell))
		{
			return null;
		}

		var model = this.rt.graph.model;

		while (cell != null)
		{
			var rec = this.cells[cell.id];

			if (rec != null && LinkEngine.hasTouch(rec.links))
			{
				return (rec.hidden) ? null : rec;
			}

			cell = model.getParent(cell);
		}

		return null;
	};

	/**
	 * Returns true if the cell or an ancestor has touch links, regardless of
	 * the disable link (for the not-allowed cursor).
	 */
	LinkEngine.prototype.findTouchIgnoreDisabled = function(cell)
	{
		var model = this.rt.graph.model;

		while (cell != null)
		{
			var rec = this.cells[cell.id];

			if (rec != null && LinkEngine.hasTouch(rec.links))
			{
				return true;
			}

			cell = model.getParent(cell);
		}

		return false;
	};

	/**
	 * Sets $ObjHor and $ObjVer to the centre of the cell in design pixels.
	 */
	LinkEngine.prototype.setObjPos = function(rec)
	{
		var rt = this.rt;
		var view = rt.graph.view;
		var state = view.getState(rec.cell);

		if (state != null)
		{
			var s = view.scale;
			var t = view.translate;
			rt.tags.setMany([
				{tag: '$ObjHor', value: Math.round(state.getCenterX() / s - t.x), source: 'system'},
				{tag: '$ObjVer', value: Math.round(state.getCenterY() / s - t.y), source: 'system'}
			]);
		}
	};

	/**
	 * Converts a value for writing to the tag's declared type.
	 */
	LinkEngine.prototype.coerce = function(tag, value)
	{
		var def = this.rt.tags.getDef(tag);

		if (def != null && (def.type == 'boolean' || def.type == 'bool'))
		{
			return Hmi.Links.isTrue(value);
		}

		return value;
	};

	/**
	 * Writes a tag and reports errors. Returns a Promise of true/false.
	 */
	LinkEngine.prototype.write = function(rec, tag, value)
	{
		var rt = this.rt;

		if (tag == null || tag === '')
		{
			return Promise.resolve(false);
		}

		return rt.writer.write(tag, this.coerce(tag, value), {cell: (rec != null) ? rec.cell : null}).then(
			function()
			{
				return true;
			}, function(e)
			{
				if (Hmi.Actions != null && Hmi.Actions.toast != null)
				{
					Hmi.Actions.toast(e.message, 'error');
				}

				rt.log('warn', 'links', 'Write ' + tag + ' failed: ' + e.message);

				return false;
			});
	};

	/**
	 * Mouse down on a cell. Returns true if a touch link handled it.
	 */
	LinkEngine.prototype.mouseDown = function(cell, me)
	{
		var rec = this.findTouch(cell);

		if (rec == null)
		{
			return false;
		}

		var links = rec.links;
		var evt = (me != null) ? me.getEvent() : null;
		var right = evt != null && mxEvent.isRightMouseButton(evt);
		this.setObjPos(rec);
		var confirm = LinkEngine.needsConfirm(links);
		this.pressed = {rec: rec, right: right, confirm: confirm};

		// With a confirmation, press links act once after it (in click)
		if (confirm)
		{
			return true;
		}

		if (!right)
		{
			if (links.pushDiscrete != null)
			{
				this.pushDown(rec);
			}

			var slider = (links.sliderH != null) ? 'sliderH' : ((links.sliderV != null) ? 'sliderV' : null);

			if (slider != null && me != null)
			{
				this.startDrag(rec, slider, me);
			}
		}

		this.runScripts(rec, right ? 'onRightDown' : 'onLeftDown');
		this.startWhile(rec, right ? 'whileRightDown' : 'whileLeftDown', 'press');

		// Double click (right double clicks are detected here, left ones by
		// the dispatcher's click detection)
		if (right)
		{
			var now = Date.now();

			if (this.lastRight == rec && now - this.lastRightTime < Hmi.EventDispatcher.DBLCLICK_DELAY)
			{
				this.runScripts(rec, 'onRightDouble');
				this.lastRight = null;
			}
			else
			{
				this.lastRight = rec;
				this.lastRightTime = now;
			}
		}

		return true;
	};

	/**
	 * Mouse up after a press. Returns true if a touch link handled it.
	 */
	LinkEngine.prototype.mouseUp = function(me)
	{
		var p = this.pressed;
		this.pressed = null;
		this.stopWhile('press');

		if (this.drag != null)
		{
			this.endDrag();
		}

		if (p == null)
		{
			return false;
		}

		if (p.confirm)
		{
			return true;
		}

		if (!p.right && p.rec.links.pushDiscrete != null)
		{
			this.pushUp(p.rec);
		}

		this.runScripts(p.rec, p.right ? 'onRightUp' : 'onLeftUp');

		return true;
	};

	LinkEngine.prototype.pushDown = function(rec)
	{
		var link = rec.links.pushDiscrete;
		var values = Hmi.Links.pushValues(link.action || 'direct', this.rt.tags.getValue(link.tag));

		if (values != null && values.down !== undefined)
		{
			this.write(rec, link.tag, values.down);
		}

		rec.pushUp = (values != null) ? values.up : undefined;
		this.rt.overlay.setStyle(rec.id, 'hmiPressed', '1', 'action');
		this.rt.requestFlush();
	};

	LinkEngine.prototype.pushUp = function(rec)
	{
		var link = rec.links.pushDiscrete;

		if (rec.pushUp !== undefined)
		{
			this.write(rec, link.tag, rec.pushUp);
			rec.pushUp = undefined;
		}

		this.rt.overlay.setStyle(rec.id, 'hmiPressed', null, 'action');
		this.rt.requestFlush();
	};

	/**
	 * Click on a cell (inputs and windows). Returns true if handled.
	 */
	LinkEngine.prototype.click = function(cell)
	{
		var rec = this.findTouch(cell);

		if (rec == null)
		{
			return false;
		}

		var self = this;
		var confirm = LinkEngine.needsConfirm(rec.links);
		this.guard(rec, function()
		{
			// Press links did not act on mouse down when a confirmation was due
			self.activate(rec, false, confirm);
		});

		return true;
	};

	/**
	 * Runs fn after the confirmation and delay of the touch options.
	 */
	LinkEngine.prototype.guard = function(rec, fn)
	{
		var opts = rec.links.touchOptions;
		var delay = (opts != null) ? parseFloat(opts.delay) || 0 : 0;
		var run = function()
		{
			if (delay > 0)
			{
				setTimeout(fn, delay);
			}
			else
			{
				fn();
			}
		};

		if (LinkEngine.needsConfirm(rec.links) && this.rt.events != null)
		{
			this.rt.events.confirm({title: opts.confirmTitle || null,
				text: this.rt.resolveVars(String(opts.confirm), rec.cell)}, run);
		}
		else
		{
			run();
		}
	};

	/**
	 * Double click on a cell.
	 */
	LinkEngine.prototype.dblClick = function(cell)
	{
		var rec = this.findTouch(cell);

		if (rec != null)
		{
			this.runScripts(rec, 'onLeftDouble');

			return true;
		}

		return false;
	};

	/**
	 * Runs the click behaviour of the touch links of a cell. With keyOnly,
	 * only links whose key equivalent is keySpec run, including press links.
	 */
	LinkEngine.prototype.activate = function(rec, keySpec, press)
	{
		var links = rec.links;
		var match = function(type)
		{
			return links[type] != null && (keySpec === false ||
				LinkEngine.keyEquals(links[type].key, keySpec));
		};

		this.setObjPos(rec);

		if (match('inputDiscrete'))
		{
			this.inputDiscrete(rec);
		}
		else if (match('inputAnalog'))
		{
			this.inputValue(rec, 'inputAnalog');
		}
		else if (match('inputString'))
		{
			this.inputValue(rec, 'inputString');
		}
		else if (match('inputChoice'))
		{
			this.inputChoice(rec);
		}

		if (match('pushValue'))
		{
			this.pushValueLink(rec);
		}

		if (match('openUrl'))
		{
			this.openUrl(rec);
		}

		if (match('sendMessage'))
		{
			this.sendMessage(rec);
		}

		if (match('control'))
		{
			var cmds = links.control.commands || [];

			for (var i = 0; i < cmds.length; i++)
			{
				if (cmds[i] != null)
				{
					this.controlCommand(rec, cmds[i]);
				}
			}
		}

		if (keySpec !== false || press)
		{
			if (match('pushDiscrete'))
			{
				this.pushDown(rec);
				this.pushUp(rec);
			}

			if (match('pushAction'))
			{
				this.runScripts(rec, 'onLeftDown');
				this.runScripts(rec, 'onLeftUp');
			}
		}

		var api = this.createApi(rec);

		if (match('showWindow'))
		{
			var list = links.showWindow.windows || [];

			for (var i = 0; i < list.length; i++)
			{
				api.show(list[i]);
			}
		}

		if (match('hideWindow'))
		{
			var list = links.hideWindow.windows || [];

			for (var i = 0; i < list.length; i++)
			{
				api.hide(list[i]);
			}
		}
	};

	/**
	 * Choice input: a list of options, writes the chosen value.
	 */
	LinkEngine.prototype.inputChoice = function(rec)
	{
		var link = rec.links.inputChoice;
		var options = link.options || [];
		var labels = [];
		var self = this;

		for (var i = 0; i < options.length; i++)
		{
			labels.push((options[i].label != null && options[i].label !== '') ?
				String(options[i].label) : String(options[i].value));
		}

		Hmi.Keypad.choice(link.message || link.tag, labels).then(function(index)
		{
			if (index >= 0 && options[index] != null)
			{
				var v = options[index].value;
				var def = self.rt.tags.getDef(link.tag);

				if (def != null && (def.type == 'number' || def.type == 'integer') &&
					!isNaN(parseFloat(v)))
				{
					v = parseFloat(v);
				}

				self.write(rec, link.tag, v);
			}
		});
	};

	/**
	 * Analog/string value pushbutton: set, add, subtract or expression.
	 */
	LinkEngine.prototype.pushValueLink = function(rec)
	{
		var link = rec.links.pushValue;
		var self = this;
		var v = Hmi.Links.pushValue(link, this.rt.tags.getValue(link.tag), function()
		{
			return self.evaluate(rec, link.expr);
		});

		if (v !== undefined)
		{
			this.write(rec, link.tag, v);
		}
	};

	/**
	 * Opens a URL in a new tab, the same window or a dialog.
	 */
	LinkEngine.prototype.openUrl = function(rec, url, target, opts)
	{
		var rt = this.rt;
		var link = rec.links.openUrl || {};
		url = Graph.sanitizeLink(rt.resolveVars(String((url != null) ? url : (link.url || '')),
			rec.cell));
		target = target || link.target || 'blank';

		if (url == null || url === '')
		{
			rt.log('warn', 'links', 'URL not allowed on ' + rec.id);

			return;
		}

		if (target == 'dialog' && Hmi.Faceplate != null)
		{
			opts = opts || link;
			Hmi.Faceplate.showUrl(rt.mainRuntime || rt, url, {title: opts.title || url,
				width: opts.width || 640, height: opts.height || 480});
		}
		else if (target == 'self')
		{
			window.location.href = url;
		}
		else
		{
			var wnd = window.open(url, '_blank');

			if (wnd != null)
			{
				wnd.opener = null;
			}
		}
	};

	/**
	 * Sends a named message to the page and/or the embedding host.
	 */
	LinkEngine.prototype.sendMessage = function(rec, name, payload, to)
	{
		var link = rec.links.sendMessage || {};
		name = (name != null) ? name : link.name;
		to = to || link.to || 'page';

		if (payload === undefined && link.payloadExpr != null && String(link.payloadExpr).trim() !== '')
		{
			payload = this.evaluate(rec, link.payloadExpr);
		}

		if (to == 'page' || to == 'both')
		{
			Hmi.Actions.types.emit(this.rt, {name: name, payload: payload}, {cell: rec.cell});
		}

		if (to == 'host' || to == 'both')
		{
			this.postToHost(rec, name, payload);
		}
	};

	LinkEngine.prototype.postToHost = function(rec, name, payload)
	{
		var target = window.opener || window.parent;

		if (target != null && target != window)
		{
			target.postMessage(JSON.stringify({event: 'hmiMessage', name: name, payload: payload,
				cellId: rec.id}), '*');
		}
	};

	/**
	 * Runs one animation/media control command.
	 */
	LinkEngine.prototype.controlCommand = function(rec, cmd)
	{
		var c = String(cmd.command || 'startAnimation');

		if (/Media$/.test(c))
		{
			this.mediaCommand(this.resolveObjects(rec, cmd.object),
				(c == 'playMedia') ? 'play' : ((c == 'pauseMedia') ? 'pause' : 'stop'));
		}
		else
		{
			this.animationCommand(rec, cmd.object, (c == 'pauseAnimation') ? 'pause' :
				((c == 'stopAnimation') ? 'stop' : 'start'), cmd.animation);
		}
	};

	/**
	 * Discrete user input: a message with set and reset buttons.
	 */
	LinkEngine.prototype.inputDiscrete = function(rec)
	{
		var link = rec.links.inputDiscrete;
		var self = this;

		Hmi.Keypad.choice(link.message || link.tag, [link.setPrompt || 'On',
			link.resetPrompt || 'Off']).then(function(index)
		{
			if (index >= 0)
			{
				self.write(rec, link.tag, (index == 0) ? 1 : 0);
			}
		});
	};

	/**
	 * Analog and string user input with the keypad or an inline editor.
	 */
	LinkEngine.prototype.inputValue = function(rec, type)
	{
		var link = rec.links[type];
		var rt = this.rt;
		var numeric = type == 'inputAnalog';
		var self = this;
		var limits = numeric ? Hmi.Links.inputLimits(link, function(name)
		{
			// Tag names and InTouch references such as Tag.MaxEU
			var v = rt.tags.getValue(name);

			return (v !== undefined) ? v : self.evaluate(rec, name);
		}, function(name)
		{
			return rt.tags.getDef(name);
		}) : {};
		var current = rt.tags.getValue(link.tag);
		var opts = {title: link.message || link.tag, min: limits.min, max: limits.max,
			echo: link.echo, passwordChar: link.passwordChar,
			value: (current != null && !(type == 'inputString' && link.echo != 'yes' &&
				link.echo != null)) ? current : ''};

		var commit = function(value)
		{
			if (!numeric && link.encrypt)
			{
				return LinkEngine.sha256(String(value)).then(function(hex)
				{
					return self.write(rec, link.tag, hex);
				});
			}

			return self.write(rec, link.tag, numeric ? parseFloat(value) : String(value));
		};

		if (link.keypad)
		{
			Hmi.Keypad[numeric ? 'numeric' : 'keyboard'](opts).then(function(result)
			{
				if (result.ok)
				{
					commit(result.value);
				}
			});
		}
		else
		{
			this.openInline(rec, opts, numeric, commit);
		}
	};

	/**
	 * Inline editor over the cell (like the numInput widget).
	 */
	LinkEngine.prototype.openInline = function(rec, opts, numeric, commit)
	{
		this.closeInline();

		var graph = this.rt.graph;
		var state = graph.view.getState(rec.cell);

		if (state == null || graph.container == null)
		{
			return;
		}

		var elt = document.createElement('input');
		elt.type = (opts.echo == 'password') ? 'password' : 'text';

		if (numeric)
		{
			elt.setAttribute('inputmode', 'decimal');
		}

		elt.value = (opts.value != null) ? String(opts.value) : '';
		elt.className = 'geHmiEditor geHmiLinkEditor';
		elt.setAttribute('aria-label', opts.title || '');
		elt.style.cssText = 'position:absolute;box-sizing:border-box;z-index:3;font-size:' +
			Math.max(11, Math.round(12 * graph.view.scale)) + 'px;' +
			'left:' + state.x + 'px;top:' + state.y + 'px;width:' + Math.max(60, state.width) +
			'px;height:' + Math.max(22, state.height) + 'px;' +
			((opts.echo == 'no') ? 'color:transparent;caret-color:#212121;' : '');

		if (numeric && (opts.min != null || opts.max != null))
		{
			elt.setAttribute('title', '[' + opts.min + ' .. ' + opts.max + ']');
		}

		graph.container.appendChild(elt);
		elt.focus();
		elt.select();

		var self = this;
		this.inline = elt;

		mxEvent.addListener(elt, 'keydown', function(evt)
		{
			if (evt.keyCode == 13)
			{
				var value = elt.value;

				if (numeric)
				{
					var num = parseFloat(value);

					if (value.trim() === '' || isNaN(num) || (opts.min != null && num < opts.min) ||
						(opts.max != null && num > opts.max))
					{
						elt.style.outline = '2px solid #C62828';

						if (Hmi.Actions != null && Hmi.Actions.toast != null)
						{
							Hmi.Actions.toast('Value must be between ' + opts.min + ' and ' +
								opts.max, 'warn');
						}

						mxEvent.consume(evt);

						return;
					}

					value = num;
				}

				self.closeInline();
				commit(value);
				mxEvent.consume(evt);
			}
			else if (evt.keyCode == 27)
			{
				self.closeInline();
				mxEvent.consume(evt);
			}
			else
			{
				evt.stopPropagation();
			}
		});

		mxEvent.addListener(elt, 'blur', function()
		{
			if (self.inline == elt)
			{
				self.closeInline();
			}
		});
	};

	LinkEngine.prototype.closeInline = function()
	{
		var elt = this.inline;
		this.inline = null;

		if (elt != null && elt.parentNode != null)
		{
			elt.parentNode.removeChild(elt);
		}
	};

	/**
	 * SHA-256 hex digest (encrypted string input).
	 */
	LinkEngine.sha256 = function(text)
	{
		if (root.crypto != null && root.crypto.subtle != null && typeof TextEncoder !== 'undefined')
		{
			return root.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(
				function(buf)
				{
					var bytes = new Uint8Array(buf);
					var hex = '';

					for (var i = 0; i < bytes.length; i++)
					{
						hex += ('0' + bytes[i].toString(16)).slice(-2);
					}

					return hex;
				});
		}

		return Promise.reject(new Error('SHA-256 not available'));
	};

	// Sliders

	LinkEngine.prototype.startDrag = function(rec, type, me)
	{
		var link = rec.links[type];
		var vertical = type == 'sliderV';
		var v = parseFloat(this.rt.tags.getValue(link.tag));
		var loc = isNaN(v) ? null : (vertical ? Hmi.Links.locationV(link, v) :
			Hmi.Links.locationH(link, v));
		var offset = (loc != null) ? (vertical ? loc.dy : loc.dx) || 0 : 0;

		this.drag = {rec: rec, type: type, vertical: vertical, link: link,
			start: vertical ? me.getGraphY() : me.getGraphX(), startOffset: offset};
		rec.drag = {type: type, offset: offset};
	};

	LinkEngine.prototype.dragMove = function(me)
	{
		var d = this.drag;

		if (d == null)
		{
			return false;
		}

		var s = this.rt.graph.view.scale;
		var pos = d.vertical ? me.getGraphY() : me.getGraphX();
		var offset = d.startOffset + (pos - d.start) / s;
		var link = d.link;

		// Clamps to the travel range
		var lo = d.vertical ? -(link.up != null ? link.up : 100) : -(link.toLeft || 0);
		var hi = d.vertical ? (link.down || 0) : (link.toRight != null ? link.toRight : 100);
		offset = Math.max(Math.min(lo, hi), Math.min(Math.max(lo, hi), offset));
		d.rec.drag.offset = offset;
		d.value = Hmi.Links.sliderValue(link, offset, d.vertical);
		this.updateCell(d.rec);
		this.rt.requestFlush();

		// Writes while dragging, at most every 100 ms
		var now = Date.now();

		if (d.value != null && d.value !== d.written && (d.lastWrite == null || now - d.lastWrite > 100))
		{
			d.lastWrite = now;
			d.written = d.value;
			this.write(d.rec, link.tag, d.value);
		}

		return true;
	};

	LinkEngine.prototype.endDrag = function()
	{
		var d = this.drag;
		this.drag = null;

		if (d != null)
		{
			var self = this;
			var done = function()
			{
				d.rec.drag = null;
				self.updateCell(d.rec);
				self.rt.requestFlush();
			};

			if (d.value != null && d.value !== d.written)
			{
				this.write(d.rec, d.link.tag, d.value).then(done);
			}
			else
			{
				done();
			}
		}
	};

	// Hover conditions

	LinkEngine.prototype.hover = function(cell)
	{
		var rec = (cell != null) ? this.findTouch(cell) : null;

		if (rec == this.hoverRec)
		{
			return;
		}

		if (this.hoverRec != null)
		{
			this.stopWhile('hover');
			this.runScripts(this.hoverRec, 'onMouseLeave');
		}

		this.hoverRec = rec;

		if (rec != null)
		{
			this.setObjPos(rec);
			this.runScripts(rec, 'onMouseOver');
			this.startWhile(rec, 'whileMouseOver', 'hover');
		}
	};

	// ------------------------------------------------------------------
	// Action scripts
	// ------------------------------------------------------------------

	/**
	 * Returns the scripts of the cell's pushAction link for a condition.
	 */
	LinkEngine.prototype.getScripts = function(rec, condition)
	{
		var link = rec.links.pushAction;
		var result = [];

		for (var i = 0; link != null && link.scripts != null && i < link.scripts.length; i++)
		{
			if (link.scripts[i] != null && link.scripts[i].condition == condition &&
				link.scripts[i].script)
			{
				result.push(link.scripts[i]);
			}
		}

		return result;
	};

	LinkEngine.prototype.runScripts = function(rec, condition)
	{
		var scripts = this.getScripts(rec, condition);

		for (var i = 0; i < scripts.length; i++)
		{
			this.runQuickScript(rec, scripts[i].script);
		}

		return scripts.length > 0;
	};

	/**
	 * Starts the repeating scripts of a while* condition.
	 */
	LinkEngine.prototype.startWhile = function(rec, condition, group)
	{
		var scripts = this.getScripts(rec, condition);
		var self = this;

		for (var i = 0; i < scripts.length; i++)
		{
			(function(script)
			{
				var period = Math.max(50, parseFloat(script.period) || DEFAULT_PERIOD);
				var timer = setInterval(function()
				{
					if (!self.rt.running || rec.disabled || rec.hidden)
					{
						self.stopWhile(group);

						return;
					}

					self.runQuickScript(rec, script.script);
				}, period);
				self.timers.push({group: group, timer: timer});
			})(scripts[i]);
		}
	};

	LinkEngine.prototype.stopWhile = function(group)
	{
		var keep = [];

		for (var i = 0; i < this.timers.length; i++)
		{
			if (group == null || this.timers[i].group == group)
			{
				clearInterval(this.timers[i].timer);
			}
			else
			{
				keep.push(this.timers[i]);
			}
		}

		this.timers = keep;
	};

	/**
	 * Runs a QuickScript. Returns a Promise.
	 */
	LinkEngine.prototype.runQuickScript = function(rec, src)
	{
		var rt = this.rt;
		var self = this;

		try
		{
			var compiled = Hmi.QuickScript.compile(src);
			var vars = {};
			var base = (rt.getVars != null) ? rt.getVars() : {};

			for (var key in base)
			{
				vars[key] = base[key];
			}

			return Promise.resolve(compiled.run(this.createApi(rec),
				this.createEnv(rec.cell, vars)))['catch'](function(e)
			{
				rt.log('warn', 'links', 'Script error in ' + rec.id + ': ' + e.message);
			});
		}
		catch (e)
		{
			var key = rec.id + ':script:' + src;

			if (!self.errors[key])
			{
				self.errors[key] = true;
				rt.log('warn', 'links', 'Script error in ' + rec.id + ': ' + e.message);
			}

			return Promise.resolve();
		}
	};

	/**
	 * QuickScript api (INTOUCH_LINKS.md §6).
	 */
	LinkEngine.prototype.createApi = function(rec)
	{
		var rt = this.rt;
		var self = this;

		return {
			write: function(tag, value)
			{
				return self.write(rec, tag, value);
			},
			read: function(tag)
			{
				return rt.tags.getValue(tag);
			},
			show: function(name, opts)
			{
				self.showWindow(name, null, opts != null && opts.replace);
			},
			showAt: function(name, x, y, anchor)
			{
				self.showWindow(name, self.toScreen(x, y, anchor));
			},
			hide: function(name)
			{
				self.hideWindow(name);
			},
			hideSelf: function()
			{
				if (rt.faceplateWindow != null)
				{
					rt.faceplateWindow.destroy();
				}
				else
				{
					self.goBack();
				}
			},
			dialogValueEntry: function(tag, lo, hi, prompt)
			{
				return self.dialogValueEntry(rec, tag, lo, hi, prompt);
			},
			dialogStringEntry: function(tag, prompt)
			{
				return self.dialogStringEntry(rec, tag, prompt);
			},
			log: function(text)
			{
				rt.log('info', 'script', String(text));
			},
			ack: function(tag)
			{
				if (rt.alarms != null)
				{
					rt.alarms.ack((tag != null && tag !== '') ? String(tag) : undefined);
				}
			},
			openUrl: function(url, target)
			{
				self.openUrl(rec, url, (target != null && target !== '') ? String(target) : 'blank', {});
			},
			message: function(text, level)
			{
				Hmi.Actions.toast(String(text), (level != null && level !== '') ? String(level) : 'info');
			},
			emit: function(name, payload)
			{
				self.sendMessage(rec, String(name), payload, 'page');
			},
			postToHost: function(name, payload)
			{
				self.postToHost(rec, String(name), payload);
			},
			animation: function(object, command, name)
			{
				self.animationCommand(rec, object, command, name);
			},
			media: function(object, command)
			{
				self.mediaCommand(self.resolveObjects(rec, object), command);
			},
			setProperty: function(object, target, value)
			{
				var cells = self.resolveObjects(rec, object);

				for (var i = 0; i < cells.length; i++)
				{
					self.applyProperty({id: cells[i].id, cell: cells[i]}, target, value, null, null,
						'action');
				}

				rt.requestFlush();
			}
		};
	};

	/**
	 * DialogValueEntry with the InTouch result codes (page 78).
	 */
	LinkEngine.prototype.dialogValueEntry = function(rec, tag, lo, hi, prompt)
	{
		var def = this.rt.tags.getDef(tag);
		var self = this;
		lo = parseFloat(lo);
		hi = parseFloat(hi);

		if (def == null)
		{
			return Promise.resolve(-3);
		}
		else if (def.type == 'string')
		{
			return Promise.resolve(-4);
		}
		else if (!isNaN(lo) && !isNaN(hi) && hi <= lo)
		{
			return Promise.resolve(-1);
		}

		return Hmi.Keypad.numeric({title: prompt || tag, value: this.rt.tags.getValue(tag),
			min: isNaN(lo) ? null : lo, max: isNaN(hi) ? null : hi}).then(function(result)
		{
			if (!result.ok)
			{
				return 0;
			}

			return self.write(rec, tag, result.value).then(function(ok)
			{
				return ok ? 1 : -5;
			});
		});
	};

	LinkEngine.prototype.dialogStringEntry = function(rec, tag, prompt)
	{
		var def = this.rt.tags.getDef(tag);
		var self = this;

		if (def == null)
		{
			return Promise.resolve(-3);
		}
		else if (def.type != null && def.type != 'string')
		{
			return Promise.resolve(-4);
		}

		return Hmi.Keypad.keyboard({title: prompt || tag, value: this.rt.tags.getValue(tag)}).then(
			function(result)
			{
				if (!result.ok)
				{
					return 0;
				}

				return self.write(rec, tag, String(result.value)).then(function(ok)
				{
					return ok ? 1 : -5;
				});
			});
	};

	// ------------------------------------------------------------------
	// Windows (pages, INTOUCH_LINKS.md §8)
	// ------------------------------------------------------------------

	/**
	 * Returns the window config of a page ({type, x, y, width, height, title}).
	 */
	LinkEngine.getWindowConfig = function(ui, page)
	{
		if (page.root == null && ui.updatePageRoot != null)
		{
			ui.updatePageRoot(page);
		}

		var value = (page.root != null && page.root.value != null &&
			typeof page.root.value === 'object') ? page.root.value.getAttribute('hmi') : null;

		if (value != null && value !== '')
		{
			try
			{
				var cfg = JSON.parse(value);

				if (cfg != null && cfg.window != null && typeof cfg.window === 'object')
				{
					return cfg.window;
				}
			}
			catch (e)
			{
				// ignore
			}
		}

		return {type: 'replace'};
	};

	/**
	 * Open faceplate windows of the editor/viewer UI: [{page, wnd}].
	 */
	LinkEngine.prototype.getOpenWindows = function()
	{
		var ui = this.rt.ui;
		ui.hmiWindows = ui.hmiWindows || [];

		return ui.hmiWindows;
	};

	/**
	 * Converts design coordinates to a screen position.
	 */
	LinkEngine.prototype.toScreen = function(x, y, anchor)
	{
		var graph = this.rt.graph;
		var view = graph.view;
		var c = graph.container;
		var rect = (c != null) ? c.getBoundingClientRect() : {left: 0, top: 0};
		x = parseFloat(x) || 0;
		y = parseFloat(y) || 0;

		// The draw pane's screen matrix includes CSS transforms of the viewer
		var pane = (view.getDrawPane != null) ? view.getDrawPane() : null;

		if (pane != null && pane.getScreenCTM != null && pane.ownerSVGElement != null)
		{
			var m = pane.getScreenCTM();

			if (m != null)
			{
				var pt = pane.ownerSVGElement.createSVGPoint();
				pt.x = (x + view.translate.x) * view.scale;
				pt.y = (y + view.translate.y) * view.scale;
				pt = pt.matrixTransform(m);

				return {x: pt.x, y: pt.y, anchor: anchor || 'center'};
			}
		}

		return {
			x: rect.left + (x + view.translate.x) * view.scale - ((c != null) ? c.scrollLeft : 0),
			y: rect.top + (y + view.translate.y) * view.scale - ((c != null) ? c.scrollTop : 0),
			anchor: anchor || 'center'
		};
	};

	LinkEngine.prototype.showWindow = function(name, pos, replace)
	{
		var rt = this.rt;
		var ui = rt.ui;
		var page = (Hmi.Actions != null) ? Hmi.Actions.findPage(ui, String(name)) : null;

		if (page == null)
		{
			rt.log('warn', 'links', 'Window not found: ' + name);

			return;
		}

		var wcfg = LinkEngine.getWindowConfig(ui, page);
		var type = replace ? 'replace' : (wcfg.type || 'replace');

		if (type == 'replace')
		{
			if (page != ui.currentPage)
			{
				this.closeAllWindows();
				this.getHistory().push(ui.currentPage);
				ui.selectPage(page);
			}

			return;
		}

		var open = this.getOpenWindows();

		for (var i = 0; i < open.length; i++)
		{
			if (open[i].page == page)
			{
				// Already open: brings it to front and moves it if a position is given
				if (pos != null)
				{
					this.placeWindow(open[i].wnd, pos);
				}

				open[i].wnd.activate();

				return;
			}
		}

		if (Hmi.Faceplate == null)
		{
			rt.log('warn', 'links', 'Windows are not available');

			return;
		}

		var action = {title: wcfg.title || page.getName(), width: wcfg.width, height: wcfg.height,
			x: wcfg.x, y: wcfg.y, windowType: type};

		if (pos != null)
		{
			action.screen = pos;
		}

		var mainRt = rt.mainRuntime || rt;
		var wnd = Hmi.Faceplate.showPage(mainRt, page, action);

		if (wnd != null)
		{
			var entry = {page: page, wnd: wnd};
			open.push(entry);

			wnd.addListener(mxEvent.DESTROY, function()
			{
				var idx = mxUtils.indexOf(open, entry);

				if (idx >= 0)
				{
					open.splice(idx, 1);
				}
			});
		}
	};

	LinkEngine.prototype.placeWindow = function(wnd, pos)
	{
		var w = wnd.div.offsetWidth;
		var h = wnd.div.offsetHeight;
		var x = (pos.anchor == 'topleft') ? pos.x : pos.x - w / 2;
		var y = (pos.anchor == 'topleft') ? pos.y : pos.y - h / 2;
		wnd.setLocation(Math.max(0, Math.round(x)), Math.max(0, Math.round(y)));
	};

	LinkEngine.prototype.hideWindow = function(name)
	{
		var rt = this.rt;
		var ui = rt.ui;
		var page = (Hmi.Actions != null) ? Hmi.Actions.findPage(ui, String(name)) : null;

		if (page == null)
		{
			return;
		}

		var open = this.getOpenWindows().slice();
		var found = false;

		for (var i = 0; i < open.length; i++)
		{
			if (open[i].page == page)
			{
				open[i].wnd.destroy();
				found = true;
			}
		}

		if (!found && page == ui.currentPage)
		{
			this.goBack();
		}
	};

	/**
	 * Page history of replace windows (shared by faceplates).
	 */
	LinkEngine.prototype.getHistory = function()
	{
		var ui = this.rt.ui;
		ui.hmiPageHistory = ui.hmiPageHistory || [];

		return ui.hmiPageHistory;
	};

	LinkEngine.prototype.goBack = function()
	{
		var ui = this.rt.ui;
		var history = this.getHistory();

		while (history.length > 0)
		{
			var page = history.pop();

			if (page != ui.currentPage && mxUtils.indexOf(ui.pages, page) >= 0)
			{
				this.closeAllWindows();
				ui.selectPage(page);

				return;
			}
		}
	};

	LinkEngine.prototype.closeAllWindows = function()
	{
		var open = this.getOpenWindows().slice();

		for (var i = 0; i < open.length; i++)
		{
			open[i].wnd.destroy();
		}
	};

	// ------------------------------------------------------------------
	// Key equivalents
	// ------------------------------------------------------------------

	var KEY_ALIASES = {space: ' ', spacebar: ' ', esc: 'escape', del: 'delete',
		return: 'enter', ins: 'insert', up: 'arrowup', down: 'arrowdown',
		left: 'arrowleft', right: 'arrowright'};

	function normKey(key)
	{
		key = String(key || '').toLowerCase();

		return (KEY_ALIASES[key] != null) ? KEY_ALIASES[key] : key;
	};

	/**
	 * Returns true if the link key spec matches the pressed key spec.
	 */
	LinkEngine.keyEquals = function(spec, pressed)
	{
		return spec != null && pressed != null && spec.key != null && spec.key !== '' &&
			normKey(spec.key) == normKey(pressed.key) && !!spec.ctrl == !!pressed.ctrl &&
			!!spec.shift == !!pressed.shift;
	};

	/**
	 * Returns the topmost active record with a link matching the key.
	 */
	LinkEngine.prototype.findKey = function(pressed)
	{
		var best = null;
		var overlay = this.rt.overlay;

		for (var id in this.cells)
		{
			var rec = this.cells[id];

			if (rec.hidden || this.isDisabled(rec.cell) || (overlay.getVisible != null &&
				overlay.getVisible(rec.cell) === false))
			{
				continue;
			}

			for (var i = 0; i < KEYED.length; i++)
			{
				var link = rec.links[KEYED[i]];

				if (link != null && LinkEngine.keyEquals(link.key, pressed))
				{
					if (best == null || rec.order > best.order)
					{
						best = rec;
					}

					break;
				}
			}
		}

		return best;
	};

	LinkEngine.keyListener = function(evt)
	{
		var target = evt.target;
		var tag = (target != null && target.nodeName != null) ? target.nodeName.toLowerCase() : '';

		if (tag == 'input' || tag == 'textarea' || tag == 'select' ||
			(target != null && target.isContentEditable) ||
			document.querySelector('.geHmiKeypad') != null)
		{
			return;
		}

		var key = evt.key;

		if (key == null || key == 'Control' || key == 'Shift' || key == 'Alt' || key == 'Meta')
		{
			return;
		}

		// Shift changes the character of printable keys
		if (key.length == 1 && evt.code != null && /^(Key|Digit)/.test(evt.code))
		{
			key = evt.code.replace(/^(Key|Digit)/, '');
		}

		var pressed = {key: key, ctrl: evt.ctrlKey || evt.metaKey, shift: evt.shiftKey};

		for (var i = LinkEngine.engines.length - 1; i >= 0; i--)
		{
			var engine = LinkEngine.engines[i];

			if (engine.rt.running && engine.rt.interactive)
			{
				var rec = engine.findKey(pressed);

				if (rec != null)
				{
					mxEvent.consume(evt);
					(function(engine, rec)
					{
						engine.guard(rec, function()
						{
							engine.activate(rec, pressed);
						});
					})(engine, rec);

					return;
				}
			}
		}
	};

	/**
	 * Registers the engine for key equivalents.
	 */
	LinkEngine.prototype.install = function()
	{
		if (mxUtils.indexOf(LinkEngine.engines, this) < 0)
		{
			LinkEngine.engines.push(this);
		}

		if (!LinkEngine.keysInstalled && typeof document !== 'undefined')
		{
			LinkEngine.keysInstalled = true;
			document.addEventListener('keydown', LinkEngine.keyListener, true);
		}
	};

	LinkEngine.prototype.uninstall = function()
	{
		this.reset();
		mxUtils.remove(this, LinkEngine.engines);

		if (LinkEngine.engines.length == 0 && LinkEngine.keysInstalled)
		{
			LinkEngine.keysInstalled = false;
			document.removeEventListener('keydown', LinkEngine.keyListener, true);
		}
	};

	/**
	 * Stops timers and editors (page change and stop).
	 */
	LinkEngine.prototype.reset = function()
	{
		for (var id in this.cells)
		{
			if (this.cells[id].condTimer != null)
			{
				clearInterval(this.cells[id].condTimer);
				this.cells[id].condTimer = null;
			}
		}

		this.stopBlink();
		this.stopWhile(null);
		this.closeInline();
		this.tweens = {};

		if (this.ageTimer != null)
		{
			clearInterval(this.ageTimer);
			this.ageTimer = null;
		}

		if (this.markers != null)
		{
			this.markers.clear();
		}

		this.drag = null;
		this.pressed = null;
		this.hoverRec = null;
	};

	/**
	 * Gives touch-link cells a tab order: left to right, then top to bottom.
	 */
	LinkEngine.prototype.decorate = function()
	{
		var view = this.rt.graph.view;
		var list = [];

		for (var id in this.cells)
		{
			var rec = this.cells[id];
			var state = view.getState(rec.cell);

			if (state != null && state.shape != null && state.shape.node != null &&
				LinkEngine.hasTouch(rec.links))
			{
				list.push(state);
			}
		}

		list.sort(function(a, b)
		{
			return (Math.abs(a.y - b.y) > 4) ? a.y - b.y : a.x - b.x;
		});

		for (var i = 0; i < list.length; i++)
		{
			list[i].shape.node.setAttribute('tabindex', String(i + 1));
			list[i].shape.node.setAttribute('data-hmi-cell', list[i].cell.id);
			list[i].shape.node.setAttribute('role', 'button');
		}

		LinkEngine.installFocusStyle();
	};

	/**
	 * Focus frame of touch-link cells.
	 */
	LinkEngine.installFocusStyle = function()
	{
		if (typeof document !== 'undefined' && document.getElementById('geHmiLinkFocus') == null)
		{
			var style = document.createElement('style');
			style.id = 'geHmiLinkFocus';
			style.textContent = '[data-hmi-cell]:focus{outline:2px dashed #1565C0;outline-offset:2px;}' +
				'[data-hmi-cell]:focus:not(:focus-visible){outline:none;}';
			document.head.appendChild(style);
		}
	};

	Hmi.LinkEngine = LinkEngine;
})();
