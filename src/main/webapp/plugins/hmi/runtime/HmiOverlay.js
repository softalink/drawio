/**
 * Transient runtime overlay (see ARCHITECTURE.md §3.4 and §4).
 *
 * Holds per-cell runtime styles, labels, tooltips, visibility, geometry
 * offsets and attribute overrides in layers. Values are merged into the
 * computed cell style (hook in Graph.postProcessCellStyle) and label (hook in
 * Graph.getLabel / replacePlaceholders). The model is never changed.
 */
(function()
{
	var root = (typeof globalThis !== 'undefined') ? globalThis : window;
	var Hmi = root.Hmi = root.Hmi || {};

	/**
	 * Layer precedence, low to high.
	 */
	var LAYERS = ['binding', 'trigger', 'action', 'anim'];

	function Overlay(graph)
	{
		this.graph = graph;
		this.cells = {};
		this.series = {};
		this.dirty = {};
		this.dirtyCount = 0;
		this.geoDirty = false;
		this.suspended = {};

		/**
		 * Function(name) → {value, quality} | null used for %tag:Name%.
		 */
		this.tagResolver = null;

		/**
		 * Function(name) → TagDef | null.
		 */
		this.tagDefResolver = null;

		/**
		 * Quality indication mode: 'outline' or 'none'.
		 */
		this.qualityMode = 'outline';
	};

	Overlay.LAYERS = LAYERS;

	Overlay.prototype.getEntry = function(cellId, create)
	{
		var entry = this.cells[cellId];

		if (entry == null && create)
		{
			entry = {layers: {}, quality: 'good'};
			this.cells[cellId] = entry;
		}

		return entry;
	};

	Overlay.prototype.getLayer = function(cellId, layer)
	{
		var entry = this.getEntry(cellId, true);
		var data = entry.layers[layer];

		if (data == null)
		{
			data = {};
			entry.layers[layer] = data;
		}

		return data;
	};

	Overlay.prototype.markDirty = function(cellId)
	{
		if (!this.dirty[cellId])
		{
			this.dirty[cellId] = true;
			this.dirtyCount++;
		}
	};

	Overlay.prototype.setStyle = function(cellId, key, value, layer)
	{
		var data = this.getLayer(cellId, layer || 'binding');
		data.style = data.style || {};

		if (value == null)
		{
			if (data.style[key] === undefined)
			{
				return;
			}

			delete data.style[key];
		}
		else
		{
			value = String(value);

			if (data.style[key] === value)
			{
				return;
			}

			data.style[key] = value;
		}

		this.markDirty(cellId);
	};

	Overlay.prototype.setStyles = function(cellId, obj, layer)
	{
		for (var key in obj)
		{
			this.setStyle(cellId, key, obj[key], layer);
		}
	};

	Overlay.prototype.setField = function(cellId, field, value, layer)
	{
		var data = this.getLayer(cellId, layer || 'binding');

		if (data[field] !== value)
		{
			if (value == null)
			{
				delete data[field];
			}
			else
			{
				data[field] = value;
			}

			this.markDirty(cellId);
		}
	};

	Overlay.prototype.setLabel = function(cellId, text, layer)
	{
		this.setField(cellId, 'label', (text != null) ? String(text) : null, layer);
	};

	Overlay.prototype.setTooltip = function(cellId, text, layer)
	{
		this.setField(cellId, 'tooltip', (text != null) ? String(text) : null, layer);
	};

	Overlay.prototype.setVisible = function(cellId, visible, layer)
	{
		var before = this.dirtyCount;
		this.setField(cellId, 'visible', (visible != null) ? !!visible : null, layer);

		if (this.dirtyCount != before)
		{
			this.markDescendants(cellId);
		}
	};

	/**
	 * Marks all descendants of the given cell dirty.
	 */
	Overlay.prototype.markDescendants = function(cellId)
	{
		var model = this.graph.model;
		var cell = model.getCell(cellId);
		var self = this;

		if (cell != null)
		{
			(function visit(c)
			{
				var count = model.getChildCount(c);

				for (var i = 0; i < count; i++)
				{
					var child = model.getChildAt(c, i);
					self.markDirty(child.id);
					visit(child);
				}
			})(cell);
		}
	};

	Overlay.prototype.setAttribute = function(cellId, name, value, layer)
	{
		var data = this.getLayer(cellId, layer || 'binding');
		data.attrs = data.attrs || {};

		if (data.attrs[name] !== value)
		{
			if (value == null)
			{
				delete data.attrs[name];
			}
			else
			{
				data.attrs[name] = String(value);
			}

			this.markDirty(cellId);
			this.markPlaceholderDescendants(cellId);
		}
	};

	/**
	 * Marks descendants dirty as their placeholders may use the attribute.
	 */
	Overlay.prototype.markPlaceholderDescendants = function(cellId)
	{
		var cell = this.graph.model.getCell(cellId);

		if (cell != null)
		{
			var model = this.graph.model;
			var self = this;

			(function visit(c)
			{
				var count = model.getChildCount(c);

				for (var i = 0; i < count; i++)
				{
					var child = model.getChildAt(c, i);

					if (self.graph.isReplacePlaceholders(child))
					{
						self.markDirty(child.id);
					}

					visit(child);
				}
			})(cell);
		}
	};

	Overlay.prototype.setGeo = function(cellId, geo, layer)
	{
		var data = this.getLayer(cellId, layer || 'binding');
		var old = data.geo;

		if (geo == null && old == null)
		{
			return;
		}

		if (geo != null && old != null && old.dx == geo.dx && old.dy == geo.dy &&
			old.dw == geo.dw && old.dh == geo.dh)
		{
			return;
		}

		if (geo == null)
		{
			delete data.geo;
		}
		else
		{
			data.geo = {dx: geo.dx || 0, dy: geo.dy || 0, dw: geo.dw || 0, dh: geo.dh || 0};
		}

		this.geoDirty = true;
		this.markDirty(cellId);
	};

	Overlay.prototype.setQuality = function(cellId, quality)
	{
		var entry = this.getEntry(cellId, quality != 'good');

		if (entry != null && entry.quality != quality)
		{
			entry.quality = quality;
			this.markDirty(cellId);
		}
	};

	Overlay.prototype.pushSeries = function(cellId, ts, value, maxPoints, name)
	{
		var buffers = this.series[cellId];

		if (buffers == null)
		{
			buffers = {};
			this.series[cellId] = buffers;
		}

		name = name || 'default';
		var buffer = buffers[name];

		if (buffer == null)
		{
			buffer = [];
			buffers[name] = buffer;
		}

		buffer.push([ts, value]);
		maxPoints = maxPoints || 600;

		if (buffer.length > maxPoints)
		{
			buffer.splice(0, buffer.length - maxPoints);
		}

		this.markDirty(cellId);
	};

	/**
	 * Returns the series buffer: an array of [ts, value] for single-series
	 * cells, or {name: [[ts, value]...]} for multi-series cells.
	 */
	Overlay.prototype.getSeries = function(cellId)
	{
		var buffers = this.series[cellId];

		if (buffers != null)
		{
			var names = Object.keys(buffers);

			if (names.length == 1 && names[0] == 'default')
			{
				return buffers['default'];
			}

			return buffers;
		}

		return undefined;
	};

	Overlay.prototype.clearLayer = function(layer, cellId)
	{
		var ids = (cellId != null) ? [cellId] : Object.keys(this.cells);

		for (var i = 0; i < ids.length; i++)
		{
			var entry = this.cells[ids[i]];

			if (entry != null && entry.layers[layer] != null)
			{
				if (entry.layers[layer].geo != null)
				{
					this.geoDirty = true;
				}

				delete entry.layers[layer];
				this.markDirty(ids[i]);
			}
		}
	};

	/**
	 * Removes all runtime state and marks affected cells dirty.
	 */
	Overlay.prototype.clear = function()
	{
		for (var id in this.cells)
		{
			for (var layer in this.cells[id].layers)
			{
				if (this.cells[id].layers[layer].geo != null)
				{
					this.geoDirty = true;
				}
			}

			this.markDirty(id);
		}

		for (var id in this.series)
		{
			this.markDirty(id);
		}

		this.cells = {};
		this.series = {};
	};

	/**
	 * Returns the merged value of a field over all layers (highest wins).
	 */
	Overlay.prototype.getMerged = function(cellId, field)
	{
		var entry = this.cells[cellId];

		if (entry != null && !this.suspended[cellId])
		{
			for (var i = LAYERS.length - 1; i >= 0; i--)
			{
				var data = entry.layers[LAYERS[i]];

				if (data != null && data[field] != null)
				{
					return data[field];
				}
			}
		}

		return null;
	};

	/**
	 * Returns the merged geometry offset for the cell or null.
	 */
	Overlay.prototype.getGeo = function(cellId)
	{
		var entry = this.cells[cellId];
		var result = null;

		if (entry != null && !this.suspended[cellId])
		{
			for (var i = 0; i < LAYERS.length; i++)
			{
				var data = entry.layers[LAYERS[i]];

				if (data != null && data.geo != null)
				{
					result = result || {dx: 0, dy: 0, dw: 0, dh: 0};
					result.dx += data.geo.dx;
					result.dy += data.geo.dy;
					result.dw += data.geo.dw;
					result.dh += data.geo.dh;
				}
			}
		}

		return result;
	};

	/**
	 * Hook for Graph.postProcessCellStyle.
	 */
	Overlay.prototype.applyStyle = function(cell, style)
	{
		var entry = (cell != null) ? this.cells[cell.id] : null;

		if (entry != null && !this.suspended[cell.id])
		{
			for (var i = 0; i < LAYERS.length; i++)
			{
				var data = entry.layers[LAYERS[i]];

				if (data != null && data.style != null)
				{
					for (var key in data.style)
					{
						style[key] = data.style[key];
					}
				}
			}

			if (entry.quality != null && entry.quality != 'good')
			{
				style.hmiQuality = entry.quality;

				if (this.qualityMode == 'outline')
				{
					style[mxConstants.STYLE_DASHED] = '1';
					style[mxConstants.STYLE_DASH_PATTERN] = '4 3';
					style[mxConstants.STYLE_STROKECOLOR] = '#9E9E9E';
					style[mxConstants.STYLE_OPACITY] = Math.min(Number(
						style[mxConstants.STYLE_OPACITY] || 100), 60);
				}
			}
		}

		return style;
	};

	/**
	 * Hook for Graph.getLabel. Returns undefined/null if no runtime label.
	 */
	Overlay.prototype.getLabel = function(cell)
	{
		var label = (cell != null) ? this.getMerged(cell.id, 'label') : null;

		if (label != null && this.graph.isHtmlLabel(cell))
		{
			label = mxUtils.htmlEntities(label, false).replace(/\n/g, '<br>');
		}

		return label;
	};

	/**
	 * Returns the runtime tooltip or null.
	 */
	Overlay.prototype.getTooltip = function(cell)
	{
		return (cell != null) ? this.getMerged(cell.id, 'tooltip') : null;
	};

	/**
	 * Returns the runtime visibility or null.
	 */
	Overlay.prototype.getVisible = function(cell)
	{
		var current = cell;

		// Hidden ancestors hide descendants
		while (current != null)
		{
			var visible = this.getMerged(current.id, 'visible');

			if (visible === false || current == cell && visible != null)
			{
				return visible;
			}

			current = this.graph.model.getParent(current);
		}

		return null;
	};

	/**
	 * Hook for Graph.replacePlaceholders. Returns null if not handled.
	 */
	Overlay.prototype.resolvePlaceholder = function(cell, name)
	{
		if (name.substring(0, 4) == 'tag:')
		{
			return this.formatTag(cell, name.substring(4));
		}

		// Runtime attribute overrides on the cell or its ancestors
		var current = cell;

		while (current != null)
		{
			var entry = this.cells[current.id];

			if (entry != null && !this.suspended[current.id])
			{
				for (var i = LAYERS.length - 1; i >= 0; i--)
				{
					var data = entry.layers[LAYERS[i]];

					if (data != null && data.attrs != null && data.attrs[name] != null)
					{
						return data.attrs[name];
					}
				}
			}

			current = this.graph.model.getParent(current);
		}

		return null;
	};

	/**
	 * Formats a tag value for a 'Name|format' spec.
	 */
	Overlay.prototype.formatTag = function(cell, spec)
	{
		var sep = spec.indexOf('|');
		var name = (sep >= 0) ? spec.substring(0, sep) : spec;
		var pattern = (sep >= 0) ? spec.substring(sep + 1) : null;

		if (name.indexOf('%') >= 0 && Hmi.Model != null)
		{
			name = Hmi.Model.replaceAttrPlaceholders(this.graph, cell, name);
		}

		var entry = (this.tagResolver != null) ? this.tagResolver(name) : null;
		var def = (this.tagDefResolver != null) ? this.tagDefResolver(name) : null;
		var value = (entry != null) ? entry.value : ((def != null) ? def.initial : null);
		var fmt = null;

		if (pattern != null && pattern !== '')
		{
			fmt = (/^\d+$/.test(pattern)) ? {decimals: parseInt(pattern)} : {pattern: pattern};
		}

		if (Hmi.Format != null)
		{
			return Hmi.Format.format(value, fmt || {}, def);
		}

		return (value != null) ? String(value) : '--';
	};

	/**
	 * Suspends the overlay for a cell (e.g. while it is being edited).
	 */
	Overlay.prototype.setSuspended = function(cellId, suspended)
	{
		if (!!this.suspended[cellId] != !!suspended)
		{
			if (suspended)
			{
				this.suspended[cellId] = true;
			}
			else
			{
				delete this.suspended[cellId];
			}

			if (this.cells[cellId] != null && this.getGeo(cellId) != null)
			{
				this.geoDirty = true;
			}

			this.markDirty(cellId);
		}
	};

	Overlay.prototype.isDirty = function()
	{
		return this.dirtyCount > 0;
	};

	/**
	 * Re-renders all dirty cells. Returns the number of cells processed.
	 */
	Overlay.prototype.flush = function(viewportOnly)
	{
		if (this.dirtyCount == 0)
		{
			return 0;
		}

		var graph = this.graph;
		var view = graph.view;
		var model = graph.model;
		var ids = Object.keys(this.dirty);
		var count = 0;
		var deferred = {};
		var deferredCount = 0;
		var visible = (viewportOnly) ? this.getVisibleRect() : null;

		if (this.geoDirty)
		{
			this.geoDirty = false;

			for (var i = 0; i < ids.length; i++)
			{
				var cell = model.getCell(ids[i]);

				if (cell != null)
				{
					view.invalidate(cell, true, true);
				}
			}

			view.validate();
		}

		for (var i = 0; i < ids.length; i++)
		{
			var cell = model.getCell(ids[i]);
			var state = (cell != null) ? view.getState(cell) : null;

			if (state != null)
			{
				if (visible != null && !mxUtils.intersects(visible, state) &&
					!mxUtils.intersects(visible, state.text != null &&
					state.text.boundingBox != null ? state.text.boundingBox : state))
				{
					deferred[ids[i]] = true;
					deferredCount++;
					continue;
				}

				this.redrawState(state);
				count++;
			}
		}

		this.dirty = deferred;
		this.dirtyCount = deferredCount;

		return count;
	};

	/**
	 * Returns the visible rectangle of the graph container in view coordinates.
	 */
	Overlay.prototype.getVisibleRect = function()
	{
		var container = this.graph.container;

		if (container == null)
		{
			return null;
		}

		return new mxRectangle(container.scrollLeft, container.scrollTop,
			container.clientWidth, container.clientHeight);
	};

	/**
	 * Redraws one cell state with the current overlay values.
	 */
	Overlay.prototype.redrawState = function(state)
	{
		var graph = this.graph;
		state.style = graph.getCellStyle(state.cell);
		graph.cellRenderer.redraw(state, false);

		// Label value may change without a style change
		if (state.text != null || graph.getLabel(state.cell) != null)
		{
			graph.cellRenderer.redrawLabel(state, false);
		}

		var visible = this.getVisible(state.cell);
		var display = (visible === false) ? 'none' : '';

		if (state.shape != null && state.shape.node != null)
		{
			state.shape.node.style.display = display;
		}

		if (state.text != null && state.text.node != null)
		{
			state.text.node.style.display = display;
		}

		if (state.control != null && state.control.node != null)
		{
			state.control.node.style.display = display;
		}

		if (this.afterRedraw != null)
		{
			this.afterRedraw(state);
		}
	};

	/**
	 * Installs the prototype hooks that are not part of the core (geometry
	 * offsets and tooltips). Safe to call more than once.
	 */
	Overlay.install = function()
	{
		if (Overlay.installed)
		{
			return;
		}

		Overlay.installed = true;

		var viewUpdateCellState = mxGraphView.prototype.updateCellState;

		mxGraphView.prototype.updateCellState = function(state)
		{
			viewUpdateCellState.apply(this, arguments);

			var overlay = this.graph.hmiOverlay;

			if (overlay != null && overlay.cells[state.cell.id] != null &&
				this.graph.model.isVertex(state.cell))
			{
				var geo = overlay.getGeo(state.cell.id);

				if (geo != null)
				{
					var s = this.scale;
					state.x += geo.dx * s;
					state.y += geo.dy * s;
					state.width = Math.max(0, state.width + geo.dw * s);
					state.height = Math.max(0, state.height + geo.dh * s);
					state.updateCachedBounds();
				}
			}
		};

		var graphGetTooltipForCell = Graph.prototype.getTooltipForCell;

		Graph.prototype.getTooltipForCell = function(cell)
		{
			var tip = (this.hmiOverlay != null) ? this.hmiOverlay.getTooltip(cell) : null;

			return (tip != null) ? mxUtils.htmlEntities(tip) :
				graphGetTooltipForCell.apply(this, arguments);
		};
	};

	Hmi.Overlay = Overlay;
})();
