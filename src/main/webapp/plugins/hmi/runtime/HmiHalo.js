/**
 * Hover halo of interactive objects at runtime: a soft glow that follows
 * the shape of the object under the mouse (and of the keyboard-focused
 * object), with a stronger glow while pressed. Uses a CSS drop-shadow filter
 * on the rendered nodes only; the model and the overlay are not changed.
 *
 * Configuration (later wins): DRAWIO_CONFIG.hmi.hoverHalo, then the
 * document's runtime.hoverHalo. Either is false (off) or
 * {color, size, pressColor, pressSize, press: bool}. A cell with the style
 * hmiHalo=0 never glows.
 */
(function()
{
	var root = (typeof globalThis !== 'undefined') ? globalThis : window;
	var Hmi = root.Hmi = root.Hmi || {};

	var DEFAULTS = {color: '#1E88E5', size: 6, pressColor: null, pressSize: null, press: true};

	function Halo(rt)
	{
		this.rt = rt;
		this.cell = null;
		this.focusCell = null;
		this.pressed = false;
		this.nodes = [];
		this.config = Halo.getConfig(rt);
	};

	/**
	 * Returns the effective halo configuration or null when disabled.
	 */
	Halo.getConfig = function(rt)
	{
		var result = {};
		var key;

		for (key in DEFAULTS)
		{
			result[key] = DEFAULTS[key];
		}

		var gcfg = (root.DRAWIO_CONFIG != null && root.DRAWIO_CONFIG.hmi != null) ?
			root.DRAWIO_CONFIG.hmi.hoverHalo : undefined;
		var dcfg = (rt.config != null && rt.config.runtime != null) ?
			rt.config.runtime.hoverHalo : undefined;
		var sources = [gcfg, dcfg];

		for (var i = 0; i < sources.length; i++)
		{
			if (sources[i] === false)
			{
				return null;
			}
			else if (sources[i] != null && typeof sources[i] === 'object')
			{
				for (key in sources[i])
				{
					if (sources[i][key] != null)
					{
						result[key] = sources[i][key];
					}
				}
			}
		}

		result.size = Math.max(1, Math.min(40, parseFloat(result.size) || DEFAULTS.size));

		return result;
	};

	/**
	 * Returns the CSS filter for the given state.
	 */
	Halo.prototype.getFilter = function(pressed)
	{
		var cfg = this.config;
		var color = (pressed && cfg.pressColor) ? cfg.pressColor : cfg.color;
		var size = (pressed && cfg.pressSize) ? parseFloat(cfg.pressSize) :
			(pressed ? cfg.size * 1.6 : cfg.size);

		// Two stacked shadows give a soft but visible glow
		return 'drop-shadow(0 0 ' + Math.round(size / 2) + 'px ' + color + ') ' +
			'drop-shadow(0 0 ' + Math.round(size) + 'px ' + color + ')';
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
				self.focusCell = (evt.type == 'focusin' && id != null) ? self.rt.getCell(id) : null;
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
	 * Adds the glow to the nodes of a cell and its descendants (groups).
	 */
	Halo.prototype.glow = function(cell, pressed)
	{
		var graph = this.rt.graph;
		var view = graph.view;
		var filter = this.getFilter(pressed);
		var self = this;

		var state = view.getState(cell);

		if (state == null || mxUtils.getValue(state.style, 'hmiHalo', '1') == '0')
		{
			return;
		}

		(function visit(c)
		{
			var s = view.getState(c);

			if (s != null)
			{
				// The label glows only for text-only cells (a glow behind the
				// characters of a label on a shape blurs the text)
				var fill = mxUtils.getValue(s.style, mxConstants.STYLE_FILLCOLOR, 'none');
				var stroke = mxUtils.getValue(s.style, mxConstants.STYLE_STROKECOLOR, 'none');
				var textOnly = s.shape == null || (fill == 'none' && stroke == 'none') ||
					mxUtils.getValue(s.style, mxConstants.STYLE_SHAPE, '') == 'text';
				var nodes = [(s.shape != null && !textOnly) ? s.shape.node : null,
					(s.text != null && textOnly) ? s.text.node : null];

				for (var i = 0; i < nodes.length; i++)
				{
					var node = nodes[i];

					if (node != null && node.style != null && node.getAttribute('data-hmi-halo') == null)
					{
						// Keeps an existing CSS filter (e.g. the shape's shadow)
						node.hmiHaloFilter = node.style.filter || '';
						node.style.filter = ((node.hmiHaloFilter != '') ?
							node.hmiHaloFilter + ' ' : '') + filter;
						node.setAttribute('data-hmi-halo', pressed ? 'pressed' : 'hover');
						self.nodes.push(node);
					}
				}
			}

			for (var j = 0; j < graph.model.getChildCount(c); j++)
			{
				visit(graph.model.getChildAt(c, j));
			}
		})(cell);
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
