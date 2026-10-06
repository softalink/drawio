/**
 * Hover halo of interactive objects at runtime, shown on the object under
 * the mouse and on the keyboard-focused object, stronger while pressed.
 * Styles:
 * - glow: a soft CSS drop-shadow that follows the object's shape
 * - outline: a crisp outline, either a rectangle around the object's bounds
 *   (SVG overlay, outlineShape 'rect') or a ring that follows the object's
 *   shape (SVG feMorphology filter, outlineShape 'shape')
 * - glowOutline: both
 * Only rendered nodes and the view's overlay pane are touched; the model
 * and the HMI overlay are not changed.
 *
 * Configuration (later wins): DRAWIO_CONFIG.hmi.hoverHalo, then the
 * document's runtime.hoverHalo. Either is false (off) or an object:
 *   {preset, style, outlineShape, color, size, intensity, width, padding,
 *    radius, dashed, press, pressColor, pressSize}
 * where preset is a key of Hmi.Halo.PRESETS whose values apply first.
 * Per cell: hmiHalo=0 (off), hmiHaloStyle=glow|outline|glowOutline,
 * hmiHaloColor=#RRGGBB, hmiHaloOutline=rect|shape.
 */
(function()
{
	var root = (typeof globalThis !== 'undefined') ? globalThis : window;
	var Hmi = root.Hmi = root.Hmi || {};

	var DEFAULTS = {style: 'glow', outlineShape: 'rect', color: '#1E88E5', size: 6,
		intensity: 100, width: 2,
		padding: 3, radius: 4, dashed: false, press: true, pressColor: null, pressSize: null};

	var STYLES = {glow: 1, outline: 1, glowOutline: 1};

	var OUTLINE_SHAPES = {rect: 1, shape: 1};

	var filterSeq = 0;

	function Halo(rt)
	{
		this.rt = rt;
		this.cell = null;
		this.focusCell = null;
		this.pressed = false;
		this.nodes = [];
		this.rects = [];
		this.filters = [];
		this.config = Halo.getConfig(rt);
	};

	/**
	 * Ready-made looks (the halo settings dialog offers them as presets).
	 */
	Halo.PRESETS = {
		softGlow: {style: 'glow', size: 6, intensity: 100},
		subtleGlow: {style: 'glow', size: 4, intensity: 45},
		strongGlow: {style: 'glow', size: 12, intensity: 100},
		crispOutline: {style: 'outline', outlineShape: 'rect', width: 2, padding: 3, radius: 4,
			dashed: false},
		shapeOutline: {style: 'outline', outlineShape: 'shape', width: 2, padding: 2},
		dashedOutline: {style: 'outline', outlineShape: 'rect', width: 2, padding: 4, radius: 0,
			dashed: true},
		glowOutline: {style: 'glowOutline', outlineShape: 'rect', size: 5, intensity: 70, width: 1,
			padding: 3, radius: 4}
	};

	Halo.DEFAULTS = DEFAULTS;

	function clamp(v, min, max, def)
	{
		v = parseFloat(v);

		return isNaN(v) ? def : Math.max(min, Math.min(max, v));
	};

	/**
	 * Merges halo settings objects (later wins) onto the defaults and
	 * validates them. Returns null if any of them is false.
	 */
	Halo.normalize = function(list)
	{
		var result = {};
		var key;

		for (key in DEFAULTS)
		{
			result[key] = DEFAULTS[key];
		}

		for (var i = 0; i < list.length; i++)
		{
			var src = list[i];

			if (src === false)
			{
				return null;
			}
			else if (src != null && typeof src === 'object')
			{
				var preset = (src.preset != null) ? Halo.PRESETS[src.preset] : null;

				for (key in preset)
				{
					result[key] = preset[key];
				}

				for (key in src)
				{
					if (src[key] != null && key != 'preset')
					{
						result[key] = src[key];
					}
				}
			}
		}

		result.style = STYLES[result.style] ? result.style : 'glow';
		result.outlineShape = OUTLINE_SHAPES[result.outlineShape] ? result.outlineShape : 'rect';
		result.size = clamp(result.size, 1, 40, DEFAULTS.size);
		result.intensity = clamp(result.intensity, 10, 100, DEFAULTS.intensity);
		result.width = clamp(result.width, 1, 8, DEFAULTS.width);
		result.padding = clamp(result.padding, 0, 20, DEFAULTS.padding);
		result.radius = clamp(result.radius, 0, 20, DEFAULTS.radius);
		result.dashed = result.dashed === true || result.dashed == '1';

		return result;
	};

	/**
	 * Returns the effective halo configuration or null when disabled.
	 */
	Halo.getConfig = function(rt)
	{
		var gcfg = (root.DRAWIO_CONFIG != null && root.DRAWIO_CONFIG.hmi != null) ?
			root.DRAWIO_CONFIG.hmi.hoverHalo : undefined;
		var dcfg = (rt.config != null && rt.config.runtime != null) ?
			rt.config.runtime.hoverHalo : undefined;

		return Halo.normalize([gcfg, dcfg]);
	};

	/**
	 * Converts #RGB/#RRGGBB and an opacity (0..1) to rgba().
	 */
	Halo.rgba = function(color, alpha)
	{
		var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(color || ''));

		if (m == null)
		{
			return color;
		}

		var hex = m[1];

		if (hex.length == 3)
		{
			hex = hex.charAt(0) + hex.charAt(0) + hex.charAt(1) + hex.charAt(1) +
				hex.charAt(2) + hex.charAt(2);
		}

		return 'rgba(' + parseInt(hex.substring(0, 2), 16) + ',' + parseInt(hex.substring(2, 4), 16) +
			',' + parseInt(hex.substring(4, 6), 16) + ',' + Math.round(alpha * 100) / 100 + ')';
	};

	/**
	 * Returns the colour for the given settings and pressed state.
	 */
	Halo.colorFor = function(cfg, pressed)
	{
		return (pressed && cfg.pressColor) ? cfg.pressColor : cfg.color;
	};

	/**
	 * Returns the CSS drop-shadow filter of the glow.
	 */
	Halo.filterFor = function(cfg, pressed)
	{
		var size = (pressed && cfg.pressSize) ? clamp(cfg.pressSize, 1, 60, cfg.size) :
			(pressed ? cfg.size * 1.6 : cfg.size);
		var alpha = cfg.intensity / 100;
		var color = Halo.rgba(Halo.colorFor(cfg, pressed), pressed ? Math.min(1, alpha * 1.25) : alpha);

		// Two stacked shadows give a soft but visible glow
		return 'drop-shadow(0 0 ' + Math.max(1, Math.round(size / 2)) + 'px ' + color + ') ' +
			'drop-shadow(0 0 ' + Math.round(size) + 'px ' + color + ')';
	};

	/**
	 * Creates an SVG filter that draws the source graphic plus a crisp ring
	 * following its shape: the alpha grown by padding + width minus the
	 * alpha grown by padding, flooded with the colour. region is the
	 * filter region {x, y, width, height} in the user space of the element
	 * that uses it. Returns the filter element (its id is unique).
	 */
	Halo.createShapeOutlineFilter = function(doc, cfg, pressed, region)
	{
		var ns = mxConstants.NS_SVG;
		var width = cfg.width + (pressed ? 1 : 0);
		var outer = cfg.padding + width;
		var filter = doc.createElementNS(ns, 'filter');
		filter.setAttribute('id', 'geHmiHaloOutline' + (filterSeq++));
		filter.setAttribute('filterUnits', 'userSpaceOnUse');
		filter.setAttribute('x', region.x - outer - 4);
		filter.setAttribute('y', region.y - outer - 4);
		filter.setAttribute('width', region.width + 2 * outer + 8);
		filter.setAttribute('height', region.height + 2 * outer + 8);
		filter.setAttribute('color-interpolation-filters', 'sRGB');

		var add = function(tag, attrs)
		{
			var e = doc.createElementNS(ns, tag);

			for (var key in attrs)
			{
				e.setAttribute(key, attrs[key]);
			}

			filter.appendChild(e);

			return e;
		};

		// Rounded dilation by d: blur the alpha with sigma d/2 and keep what
		// is above the level a straight edge reaches at distance d
		// (0.5 * erfc(sqrt(2)) = 0.0228). Corners and curves stay round,
		// unlike feMorphology, which dilates with a square.
		var t = 0.0228;

		var dilate = function(d, result)
		{
			add('feGaussianBlur', {'in': 'SourceAlpha', stdDeviation: d / 2, result: result + 'b'});
			var ct = add('feComponentTransfer', {'in': result + 'b', result: result});
			var fa = doc.createElementNS(ns, 'feFuncA');
			fa.setAttribute('type', 'linear');
			fa.setAttribute('slope', String(1 / t));
			fa.setAttribute('intercept', '-0.5');
			ct.appendChild(fa);
		};

		dilate(outer, 'outer');

		if (cfg.padding > 0)
		{
			dilate(cfg.padding, 'inner');
			add('feComposite', {'in': 'outer', in2: 'inner', operator: 'out', result: 'ring'});
		}
		else
		{
			add('feComposite', {'in': 'outer', in2: 'SourceAlpha', operator: 'out', result: 'ring'});
		}

		add('feFlood', {'flood-color': Halo.colorFor(cfg, pressed), result: 'color'});
		add('feComposite', {'in': 'color', in2: 'ring', operator: 'in', result: 'line'});
		var merge = add('feMerge', {});
		var n1 = doc.createElementNS(ns, 'feMergeNode');
		n1.setAttribute('in', 'line');
		merge.appendChild(n1);
		var n2 = doc.createElementNS(ns, 'feMergeNode');
		n2.setAttribute('in', 'SourceGraphic');
		merge.appendChild(n2);

		return filter;
	};

	/**
	 * Returns the settings for a cell: per-cell style overrides applied.
	 */
	Halo.prototype.getCellConfig = function(style)
	{
		var cfg = this.config;
		var hs = mxUtils.getValue(style, 'hmiHaloStyle', null);
		var hc = mxUtils.getValue(style, 'hmiHaloColor', null);
		var ho = mxUtils.getValue(style, 'hmiHaloOutline', null);

		if ((hs != null && STYLES[hs]) || (hc != null && hc != '' && hc != 'none') ||
			(ho != null && OUTLINE_SHAPES[ho]))
		{
			var copy = {};

			for (var key in cfg)
			{
				copy[key] = cfg[key];
			}

			if (hs != null && STYLES[hs])
			{
				copy.style = hs;
			}

			if (hc != null && hc != '' && hc != 'none')
			{
				copy.color = hc;
			}

			if (ho != null && OUTLINE_SHAPES[ho])
			{
				copy.outlineShape = ho;
			}

			return copy;
		}

		return cfg;
	};

	Halo.prototype.install = function()
	{
		if (this.config == null || this.installed)
		{
			return;
		}

		this.installed = true;
		Halo.installStyle();

		var self = this;
		var graph = this.rt.graph;

		// Re-applies the glow after the overlay redraws a cell
		var overlay = this.rt.overlay;
		var afterRedraw = overlay.afterRedraw;
		this.previousAfterRedraw = afterRedraw;
		overlay.afterRedraw = function(state)
		{
			if (afterRedraw != null)
			{
				afterRedraw.apply(this, arguments);
			}

			if (self.isAffected(state.cell))
			{
				self.apply();
			}
		};
		this.wrappedAfterRedraw = overlay.afterRedraw;

		// View changes (zoom, page change) recreate nodes
		this.viewListener = function()
		{
			self.apply();
		};
		graph.view.addListener(mxEvent.SCALE_AND_TRANSLATE, this.viewListener);
		graph.view.addListener(mxEvent.SCALE, this.viewListener);
		graph.view.addListener(mxEvent.TRANSLATE, this.viewListener);

		// Keyboard focus glows like hover
		if (graph.container != null)
		{
			this.focusListener = function(evt)
			{
				var id = (evt.target != null && evt.target.getAttribute != null) ?
					evt.target.getAttribute('data-hmi-cell') : null;
				// Only keyboard focus (focus-visible) shows the halo; a click
				// also focuses the object, which must not keep it lit
				var visible = true;

				try
				{
					visible = evt.target.matches(':focus-visible');
				}
				catch (e)
				{
					// ignore (older browsers)
				}

				self.focusCell = (evt.type == 'focusin' && id != null && visible) ?
					self.rt.getCell(id) : null;
				self.apply();
			};
			mxEvent.addListener(graph.container, 'focusin', this.focusListener);
			mxEvent.addListener(graph.container, 'focusout', this.focusListener);
		}
	};

	Halo.prototype.uninstall = function()
	{
		if (!this.installed)
		{
			return;
		}

		this.installed = false;
		this.cell = null;
		this.focusCell = null;
		this.pressed = false;
		this.clear();

		var graph = this.rt.graph;
		var overlay = this.rt.overlay;

		if (overlay.afterRedraw == this.wrappedAfterRedraw)
		{
			overlay.afterRedraw = this.previousAfterRedraw;
		}

		graph.view.removeListener(this.viewListener);

		if (graph.container != null)
		{
			mxEvent.removeListener(graph.container, 'focusin', this.focusListener);
			mxEvent.removeListener(graph.container, 'focusout', this.focusListener);
		}
	};

	/**
	 * Returns true if the cell is a glowing cell or one of its descendants.
	 */
	Halo.prototype.isAffected = function(cell)
	{
		var model = this.rt.graph.model;
		var targets = [this.cell, this.focusCell];

		for (var i = 0; i < targets.length; i++)
		{
			if (targets[i] != null && (cell == targets[i] || model.isAncestor(targets[i], cell)))
			{
				return true;
			}
		}

		return false;
	};

	/**
	 * Sets the hovered interactive cell (or null).
	 */
	Halo.prototype.hover = function(cell)
	{
		if (cell != this.cell)
		{
			this.cell = cell;
			this.pressed = false;
			this.apply();
		}
	};

	/**
	 * Sets the pressed state of the hovered cell.
	 */
	Halo.prototype.press = function(pressed)
	{
		if (this.config != null && this.config.press !== false && pressed != this.pressed)
		{
			this.pressed = pressed;
			this.apply();
		}
	};

	/**
	 * Removes the glow from all nodes.
	 */
	Halo.prototype.clear = function()
	{
		for (var i = 0; i < this.nodes.length; i++)
		{
			var node = this.nodes[i];
			node.style.filter = node.hmiHaloFilter || '';
			node.removeAttribute('data-hmi-halo');
			delete node.hmiHaloFilter;
		}

		this.nodes = [];

		for (var i = 0; i < this.rects.length; i++)
		{
			if (this.rects[i].parentNode != null)
			{
				this.rects[i].parentNode.removeChild(this.rects[i]);
			}
		}

		this.rects = [];

		for (var i = 0; i < this.filters.length; i++)
		{
			if (this.filters[i].parentNode != null)
			{
				this.filters[i].parentNode.removeChild(this.filters[i]);
			}
		}

		this.filters = [];
	};

	/**
	 * Applies the glow to the hovered and focused cells.
	 */
	Halo.prototype.apply = function()
	{
		this.clear();

		if (this.config == null || !this.installed)
		{
			return;
		}

		var targets = [this.cell];

		if (this.focusCell != null && this.focusCell != this.cell)
		{
			targets.push(this.focusCell);
		}

		for (var i = 0; i < targets.length; i++)
		{
			if (targets[i] != null)
			{
				this.glow(targets[i], targets[i] == this.cell && this.pressed);
			}
		}
	};

	/**
	 * Adds the halo of a cell (glow on its nodes and those of its
	 * descendants, and/or an outline around their bounds).
	 */
	Halo.prototype.glow = function(cell, pressed)
	{
		var graph = this.rt.graph;
		var view = graph.view;
		var state = view.getState(cell);

		if (state == null || mxUtils.getValue(state.style, 'hmiHalo', '1') == '0')
		{
			return;
		}

		var cfg = this.getCellConfig(state.style);
		var shapeOutline = cfg.style != 'glow' && cfg.outlineShape == 'shape';
		var bounds = null;
		var nodes = [];

		(function visit(c)
		{
			var s = view.getState(c);

			if (s != null)
			{
				// The label gets the halo only for text-only cells (a glow
				// behind the characters of a label on a shape blurs the text)
				var fill = mxUtils.getValue(s.style, mxConstants.STYLE_FILLCOLOR, 'none');
				var stroke = mxUtils.getValue(s.style, mxConstants.STYLE_STROKECOLOR, 'none');
				var textOnly = s.shape == null || (fill == 'none' && stroke == 'none') ||
					mxUtils.getValue(s.style, mxConstants.STYLE_SHAPE, '') == 'text';
				var list = [(s.shape != null && !textOnly) ? s.shape.node : null,
					(s.text != null && textOnly) ? s.text.node : null];

				for (var i = 0; i < list.length; i++)
				{
					if (list[i] != null && list[i].style != null &&
						list[i].getAttribute('data-hmi-halo') == null)
					{
						nodes.push(list[i]);
					}
				}

				// Bounds for the outline (text bounds for text-only cells)
				var b = (textOnly && s.text != null && s.text.boundingBox != null) ?
					s.text.boundingBox : ((s.width > 0 || s.height > 0) ? s : null);

				if (b != null && (s.shape != null || s.text != null))
				{
					var r = new mxRectangle(b.x, b.y, b.width, b.height);

					if (bounds == null)
					{
						bounds = r;
					}
					else
					{
						bounds.add(r);
					}
				}
			}

			for (var j = 0; j < graph.model.getChildCount(c); j++)
			{
				visit(graph.model.getChildAt(c, j));
			}
		})(cell);

		// CSS filter: shape outline first (so the glow does not thicken it),
		// then the glow
		var parts = [];

		if (shapeOutline && bounds != null)
		{
			var url = this.addShapeOutlineFilter(cfg, pressed, bounds);

			if (url != null)
			{
				parts.push(url);
			}
		}

		if (cfg.style != 'outline')
		{
			parts.push(Halo.filterFor(cfg, pressed));
		}

		if (parts.length > 0)
		{
			var filter = parts.join(' ');

			for (var i = 0; i < nodes.length; i++)
			{
				// Keeps an existing CSS filter (e.g. the shape's shadow)
				var node = nodes[i];
				node.hmiHaloFilter = node.style.filter || '';
				node.style.filter = ((node.hmiHaloFilter != '') ?
					node.hmiHaloFilter + ' ' : '') + filter;
				node.setAttribute('data-hmi-halo', pressed ? 'pressed' : 'hover');
				this.nodes.push(node);
			}
		}

		if (cfg.style != 'glow' && !shapeOutline && bounds != null)
		{
			this.outline(state, bounds, cfg, pressed);
		}
	};

	/**
	 * Adds a shape outline filter to the graph's SVG and returns its CSS
	 * url() reference, or null.
	 */
	Halo.prototype.addShapeOutlineFilter = function(cfg, pressed, bounds)
	{
		var view = this.rt.graph.view;
		var pane = (view.getDrawPane != null) ? view.getDrawPane() : null;
		var svg = (pane != null) ? pane.ownerSVGElement : null;

		if (svg == null)
		{
			return null;
		}

		var defs = svg.querySelector('defs');

		if (defs == null)
		{
			defs = svg.ownerDocument.createElementNS(mxConstants.NS_SVG, 'defs');
			svg.insertBefore(defs, svg.firstChild);
		}

		// Shapes are drawn in view coordinates inside the draw pane
		var filter = Halo.createShapeOutlineFilter(svg.ownerDocument, cfg, pressed,
			{x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height});
		defs.appendChild(filter);
		this.filters.push(filter);

		return 'url(#' + filter.getAttribute('id') + ')';
	};

	/**
	 * Draws a crisp rectangle around the bounds in the view's overlay pane.
	 */
	Halo.prototype.outline = function(state, bounds, cfg, pressed)
	{
		var view = this.rt.graph.view;
		var pane = (view.getOverlayPane != null) ? view.getOverlayPane() : null;

		if (pane == null || pane.ownerDocument == null)
		{
			return;
		}

		var pad = cfg.padding * view.scale;
		var width = cfg.width + (pressed ? 1 : 0);
		var rect = pane.ownerDocument.createElementNS(mxConstants.NS_SVG, 'rect');
		rect.setAttribute('x', Math.round(bounds.x - pad) + 0.5);
		rect.setAttribute('y', Math.round(bounds.y - pad) + 0.5);
		rect.setAttribute('width', Math.max(1, Math.round(bounds.width + 2 * pad)));
		rect.setAttribute('height', Math.max(1, Math.round(bounds.height + 2 * pad)));
		rect.setAttribute('rx', cfg.radius);
		rect.setAttribute('ry', cfg.radius);
		rect.setAttribute('fill', 'none');
		rect.setAttribute('stroke', Halo.colorFor(cfg, pressed));
		rect.setAttribute('stroke-width', width);
		rect.setAttribute('shape-rendering', (cfg.radius > 0) ? 'auto' : 'crispEdges');
		rect.setAttribute('pointer-events', 'none');
		rect.setAttribute('data-hmi-halo-outline', pressed ? 'pressed' : 'hover');

		if (cfg.dashed)
		{
			rect.setAttribute('stroke-dasharray', (width * 3) + ' ' + (width * 2));
		}

		// Follows the rotation of the hovered cell
		var rot = parseFloat(mxUtils.getValue(state.style, mxConstants.STYLE_ROTATION, 0)) || 0;

		if (rot != 0)
		{
			rect.setAttribute('transform', 'rotate(' + rot + ',' + state.getCenterX() + ',' +
				state.getCenterY() + ')');
		}

		pane.appendChild(rect);
		this.rects.push(rect);
	};

	/**
	 * Smooth fade of the glow. The focus frame is replaced by the glow.
	 */
	Halo.installStyle = function()
	{
		if (typeof document !== 'undefined' && document.getElementById('geHmiHaloStyle') == null)
		{
			var style = document.createElement('style');
			style.id = 'geHmiHaloStyle';
			style.textContent = '[data-hmi-cell],[data-hmi-halo]{transition:filter 120ms ease-out;}' +
				'[data-hmi-cell][tabindex]:focus{outline:none;}' +
				'@media (prefers-reduced-motion: reduce){[data-hmi-cell],[data-hmi-halo]{transition:none;}}';
			document.head.appendChild(style);
		}
	};

	Hmi.Halo = Halo;
})();
