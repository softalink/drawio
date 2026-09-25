/**
 * Evaluates cell bindings into the runtime overlay (SRS §3.4).
 */
(function()
{
	var root = (typeof globalThis !== 'undefined') ? globalThis : window;
	var Hmi = root.Hmi = root.Hmi || {};

	var LAYER = 'binding';

	function BindingEngine(rt)
	{
		this.rt = rt;
		this.index = null;
	};

	BindingEngine.prototype.build = function(index)
	{
		this.index = index;
	};

	/**
	 * Converts runtime values to booleans (strings 'false', '0', 'off' and
	 * empty strings are false).
	 */
	BindingEngine.toBool = function(value)
	{
		if (typeof value === 'string')
		{
			var v = value.toLowerCase();

			return !(v === '' || v === 'false' || v === '0' || v === 'off' || v === 'no');
		}

		return !!value;
	};

	/**
	 * Returns the expression environment for a cell.
	 */
	BindingEngine.prototype.createEnv = function(cell, value)
	{
		var rt = this.rt;

		return {
			value: value,
			tag: function(name)
			{
				return rt.tags.getValue(name);
			},
			prop: function(name)
			{
				return (cell != null && cell.value != null && typeof cell.value === 'object') ?
					cell.value.getAttribute(name) : null;
			},
			vars: rt.getVars(),
			runScript: function(code, args)
			{
				return rt.runScript(code, args, cell);
			}
		};
	};

	/**
	 * Updates all cells affected by the given changed tag names.
	 */
	BindingEngine.prototype.update = function(names)
	{
		if (this.index == null)
		{
			return;
		}

		var changed = {};
		var ids = {};

		for (var i = 0; i < names.length; i++)
		{
			changed[names[i]] = true;
			var list = this.index.tagToCells[names[i]];

			if (list != null)
			{
				for (var j = 0; j < list.length; j++)
				{
					ids[list[j]] = true;
				}
			}
		}

		for (var id in ids)
		{
			this.updateCell(id, changed);
		}
	};

	/**
	 * Evaluates every binding in the index.
	 */
	BindingEngine.prototype.updateAll = function()
	{
		if (this.index == null)
		{
			return;
		}

		for (var id in this.index.cells)
		{
			this.updateCell(id, null);
		}

		if (this.index.placeholderCells != null)
		{
			for (var id in this.index.placeholderCells)
			{
				this.rt.overlay.markDirty(id);
			}
		}
	};

	/**
	 * Evaluates all bindings of one cell. changed is a map of changed tag
	 * names or null for all.
	 */
	BindingEngine.prototype.updateCell = function(id, changed)
	{
		var rt = this.rt;
		var overlay = rt.overlay;
		var cfg = this.index.cells[id];

		if (cfg == null)
		{
			// Placeholder-only cell
			overlay.markDirty(id);

			return;
		}

		var cell = cfg.cell;
		var geo = null;
		var worst = 'good';
		var rank = {good: 0, uncertain: 1, stale: 2, bad: 3};

		for (var i = 0; i < cfg.bindings.length; i++)
		{
			var b = cfg.bindings[i];

			try
			{
				var entry = (b.tag != null && b.tag !== '') ? rt.tags.get(b.tag) : null;

				if (entry != null && rank[entry.quality] > rank[worst])
				{
					worst = entry.quality;
				}

				// Series bindings only append on their own tag changes
				if (b.target == 'prop:series')
				{
					if (entry != null && (changed == null || changed[b.tag]) &&
						entry.value != null && !isNaN(parseFloat(entry.value)))
					{
						overlay.pushSeries(id, entry.ts || Date.now(), parseFloat(entry.value),
							b.maxPoints || 600, b.name || b.tag);
					}

					continue;
				}

				var value;

				if (b.expr != null && b.expr !== '')
				{
					value = Hmi.Expr.evaluate(b.expr, this.createEnv(cell,
						(entry != null) ? entry.value : undefined));
				}
				else if (entry != null)
				{
					value = entry.value;
				}
				else
				{
					continue;
				}

				if (b.transform != null && b.transform.kind != null)
				{
					value = Hmi.Transform.apply(b.transform, value, this.createEnv(cell, value));
				}

				if (value != null && typeof value.then === 'function')
				{
					(function(self, b, cell)
					{
						value.then(function(result)
						{
							self.applyTarget(cell, b, result, null);
							rt.requestFlush();
						}, function(e)
						{
							rt.log('warn', 'binding', 'Script transform failed on ' +
								cell.id + ': ' + e.message);
						});
					})(this, b, cell);
				}
				else if (b.targetCells != null)
				{
					// Group-level binding applied to descendants (HMI-BND-10)
					var targets = this.resolveTargetCells(cell, b.targetCells);

					for (var j = 0; j < targets.length; j++)
					{
						var g = this.applyTarget(targets[j], b, value, null);

						if (g != null)
						{
							overlay.setGeo(targets[j].id, g, LAYER);
						}
					}
				}
				else
				{
					geo = this.applyTarget(cell, b, value, geo);
				}
			}
			catch (e)
			{
				rt.log('warn', 'binding', 'Binding ' + (b.tag || b.expr) + ' → ' +
					b.target + ' failed on ' + id + ': ' + e.message);
			}
		}

		if (geo != null)
		{
			overlay.setGeo(id, geo, LAYER);
		}

		overlay.setQuality(id, worst);
	};

	/**
	 * Resolves targetCells = {cells: [ids], tags: [cellTags], path: 'i/j'}
	 * relative to the bound cell (tags and paths are searched among the
	 * cell's descendants).
	 */
	BindingEngine.prototype.resolveTargetCells = function(cell, spec)
	{
		var rt = this.rt;
		var model = rt.graph.model;
		var result = [];
		var i;

		if (spec.cells != null)
		{
			for (i = 0; i < spec.cells.length; i++)
			{
				var c = rt.getCell(spec.cells[i]);

				if (c != null)
				{
					result.push(c);
				}
			}
		}

		if (spec.path != null)
		{
			var current = cell;
			var parts = String(spec.path).split('/');

			for (i = 0; i < parts.length && current != null; i++)
			{
				current = model.getChildAt(current, parseInt(parts[i]));
			}

			if (current != null)
			{
				result.push(current);
			}
		}

		if (spec.tags != null && rt.graph.getTagsForCell != null)
		{
			var descendants = model.getDescendants(cell);

			for (i = 0; i < descendants.length; i++)
			{
				var cellTags = rt.graph.getTagsForCell(descendants[i]).split(' ');

				for (var j = 0; j < spec.tags.length; j++)
				{
					if (descendants[i] != cell && cellTags.indexOf(spec.tags[j]) >= 0)
					{
						result.push(descendants[i]);
						break;
					}
				}
			}
		}

		return result;
	};

	/**
	 * Applies a value to the binding target. Returns the geometry offset
	 * accumulator.
	 */
	BindingEngine.prototype.applyTarget = function(cell, b, value, geo)
	{
		var rt = this.rt;
		var overlay = rt.overlay;
		var target = b.target || 'label';
		var id = cell.id;
		var def = (b.tag != null) ? rt.tags.getDef(b.tag) : null;

		if (target == 'label' || target == 'tooltip')
		{
			var text = (b.format != null || typeof value === 'number') ?
				Hmi.Format.format(value, b.format || {}, def) :
				((value == null) ? '' : ((typeof value === 'object') ?
				JSON.stringify(value) : String(value)));

			if (target == 'label')
			{
				overlay.setLabel(id, text, LAYER);
			}
			else
			{
				overlay.setTooltip(id, text, LAYER);
			}
		}
		else if (target == 'visible')
		{
			overlay.setVisible(id, BindingEngine.toBool(value), LAYER);
		}
		else if (target.substring(0, 5) == 'attr:')
		{
			var str = (b.format != null) ? Hmi.Format.format(value, b.format, def) :
				((value == null) ? '' : String(value));
			overlay.setAttribute(id, target.substring(5), str, LAYER);
		}
		else if (target.substring(0, 6) == 'style:')
		{
			overlay.setStyle(id, target.substring(6), BindingEngine.styleValue(value), LAYER);
		}
		else if (target.substring(0, 5) == 'prop:')
		{
			var name = target.substring(5);
			overlay.setStyle(id, 'hmi' + name.charAt(0).toUpperCase() +
				name.substring(1), BindingEngine.styleValue(value), LAYER);
		}
		else if (target.substring(0, 4) == 'geo:')
		{
			var num = parseFloat(value);

			if (!isNaN(num))
			{
				geo = geo || {dx: 0, dy: 0, dw: 0, dh: 0};
				var key = target.substring(4);

				if (key == 'x')
				{
					geo.dx = num;
				}
				else if (key == 'y')
				{
					geo.dy = num;
				}
				else if (key == 'width')
				{
					geo.dw = num;
				}
				else if (key == 'height')
				{
					geo.dh = num;
				}
			}
		}
		else
		{
			rt.log('warn', 'binding', 'Unknown binding target ' + target + ' on ' + id);
		}

		return geo;
	};

	/**
	 * Converts a runtime value for use in a style string.
	 */
	BindingEngine.styleValue = function(value)
	{
		if (value === true)
		{
			return '1';
		}
		else if (value === false)
		{
			return '0';
		}
		else if (value == null)
		{
			return null;
		}
		else if (typeof value === 'object')
		{
			return JSON.stringify(value).replace(/;/g, ',');
		}

		// Semicolons and equals signs would break style strings on export
		return String(value).replace(/[;=]/g, ' ');
	};

	Hmi.BindingEngine = BindingEngine;
})();
