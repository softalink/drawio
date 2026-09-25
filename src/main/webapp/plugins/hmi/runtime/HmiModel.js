/**
 * HMI configuration access on the draw.io model (see ARCHITECTURE.md §2).
 *
 * Reads and writes the JSON attributes stored on user objects and builds
 * the runtime index. Writes are ordinary undoable model edits (design time).
 */
(function()
{
	var root = (typeof globalThis !== 'undefined') ? globalThis : window;
	var Hmi = root.Hmi = root.Hmi || {};

	var Model = {};

	/**
	 * Attribute name → schema kind for per-cell configuration.
	 */
	Model.CELL_ATTRS = {
		hmiBindings: 'bindings',
		hmiEvents: 'events',
		hmiTriggers: 'triggers',
		hmiAnimations: 'animations'
	};

	/**
	 * Short keys used in the index.
	 */
	Model.CELL_KEYS = {
		hmiBindings: 'bindings',
		hmiEvents: 'events',
		hmiTriggers: 'triggers',
		hmiAnimations: 'animations'
	};

	/**
	 * Name of the document config attribute on the model root cell.
	 */
	Model.DOC_ATTR = 'hmi';

	function getAttr(cell, name)
	{
		return (cell != null && cell.value != null && typeof cell.value === 'object' &&
			cell.value.getAttribute != null) ? cell.value.getAttribute(name) : null;
	};

	function parse(json, kind)
	{
		if (json == null || json === '')
		{
			return null;
		}

		if (Hmi.Schema != null && Hmi.Schema.parse != null)
		{
			return Hmi.Schema.parse(json, kind);
		}

		try
		{
			return JSON.parse(json);
		}
		catch (e)
		{
			return null;
		}
	};

	/**
	 * Returns the defaulted document config stored on the given root cell.
	 */
	Model.getDocConfigForRoot = function(rootCell)
	{
		var cfg = parse(getAttr(rootCell, Model.DOC_ATTR), 'doc');

		return (Hmi.Schema != null && Hmi.Schema.defaults != null) ?
			Hmi.Schema.defaults('doc', cfg || {}) : (cfg || {version: 1,
				sources: [], tags: [], triggers: [], sim: 'off', runtime: {}});
	};

	/**
	 * Returns true if the given root cell has a document config.
	 */
	Model.hasDocConfig = function(rootCell)
	{
		var value = getAttr(rootCell, Model.DOC_ATTR);

		return value != null && value !== '';
	};

	/**
	 * Returns the document config of the current page.
	 */
	Model.getDocConfig = function(graph)
	{
		return Model.getDocConfigForRoot(graph.model.getRoot());
	};

	/**
	 * Stores the document config on the current page (undoable).
	 */
	Model.setDocConfig = function(graph, cfg)
	{
		var model = graph.model;

		model.beginUpdate();
		try
		{
			graph.setAttributeForCell(model.getRoot(), Model.DOC_ATTR,
				(cfg != null) ? JSON.stringify(cfg) : null);
		}
		finally
		{
			model.endUpdate();
		}
	};

	/**
	 * Returns {bindings, events, triggers, animations, roles} for the cell.
	 * Missing entries are empty arrays.
	 */
	Model.getCellConfig = function(cell)
	{
		var result = {bindings: [], events: [], triggers: [], animations: [], roles: []};

		for (var attr in Model.CELL_ATTRS)
		{
			var value = parse(getAttr(cell, attr), Model.CELL_ATTRS[attr]);

			if (value != null && value.length != null)
			{
				result[Model.CELL_KEYS[attr]] = value;
			}
		}

		var roles = getAttr(cell, 'hmiRoles');

		if (roles != null && roles !== '')
		{
			result.roles = String(roles).split(/\s*,\s*/).filter(function(r)
			{
				return r.length > 0;
			});
		}

		return result;
	};

	/**
	 * Returns true if the cell has any HMI configuration.
	 */
	Model.hasCellConfig = function(cell)
	{
		for (var attr in Model.CELL_ATTRS)
		{
			var value = getAttr(cell, attr);

			if (value != null && value !== '' && value !== '[]')
			{
				return true;
			}
		}

		return false;
	};

	/**
	 * Sets one per-cell configuration list (undoable). Empty lists remove
	 * the attribute. key is one of bindings, events, triggers, animations
	 * or roles (array of strings).
	 */
	Model.setCellConfig = function(graph, cells, key, value)
	{
		var attr = (key == 'roles') ? 'hmiRoles' : 'hmi' +
			key.charAt(0).toUpperCase() + key.substring(1);
		var str = null;

		if (value != null && value.length > 0)
		{
			str = (key == 'roles') ? value.join(',') : JSON.stringify(value);
		}

		cells = (cells != null && cells.length != null) ? cells : [cells];
		graph.model.beginUpdate();
		try
		{
			for (var i = 0; i < cells.length; i++)
			{
				graph.setAttributeForCell(cells[i], attr, str);
			}
		}
		finally
		{
			graph.model.endUpdate();
		}
	};

	/**
	 * Returns the root cells of all pages (current page first).
	 */
	Model.getPageRoots = function(ui)
	{
		var roots = [ui.editor.graph.model.getRoot()];

		if (ui.pages != null)
		{
			for (var i = 0; i < ui.pages.length; i++)
			{
				var page = ui.pages[i];

				if (page != ui.currentPage)
				{
					try
					{
						if (page.root == null && ui.updatePageRoot != null)
						{
							ui.updatePageRoot(page);
						}
					}
					catch (e)
					{
						// ignore broken pages
					}

					if (page.root != null)
					{
						roots.push(page.root);
					}
				}
			}
		}

		return roots;
	};

	/**
	 * Returns the effective config for the current page: all page configs
	 * merged. File-scope sources and all tag definitions are collected from
	 * every page (current page wins on name/id clashes); page-scope sources
	 * and document triggers come from the current page only.
	 */
	Model.getEffectiveConfig = function(ui)
	{
		var roots = Model.getPageRoots(ui);
		var cfg = Model.getDocConfigForRoot(roots[0]);
		var sourceIds = {};
		var tagNames = {};
		var i, j;

		for (i = 0; i < cfg.sources.length; i++)
		{
			sourceIds[cfg.sources[i].id] = true;
		}

		for (i = 0; i < cfg.tags.length; i++)
		{
			tagNames[cfg.tags[i].name] = true;
		}

		for (i = 1; i < roots.length; i++)
		{
			if (Model.hasDocConfig(roots[i]))
			{
				var other = Model.getDocConfigForRoot(roots[i]);

				for (j = 0; j < other.sources.length; j++)
				{
					var src = other.sources[j];

					if (src.scope != 'page' && !sourceIds[src.id])
					{
						sourceIds[src.id] = true;
						cfg.sources.push(src);
					}
				}

				for (j = 0; j < other.tags.length; j++)
				{
					if (!tagNames[other.tags[j].name])
					{
						tagNames[other.tags[j].name] = true;
						cfg.tags.push(other.tags[j]);
					}
				}

				// First page with a config defines sim mode and runtime
				// options when the current page has no config
				if (!Model.hasDocConfig(roots[0]) && !cfg.inherited)
				{
					cfg.sim = other.sim;
					cfg.runtime = other.runtime;
					cfg.scripts = other.scripts;
					cfg.inherited = true;
				}
			}
		}

		return cfg;
	};

	/**
	 * Recursively replaces %placeholders% in tag references of the given
	 * configuration object using the cell's (and ancestors') attributes.
	 */
	Model.resolveTagPlaceholders = function(graph, cell, obj)
	{
		if (obj == null || typeof obj !== 'object')
		{
			return obj;
		}

		var result = (obj.length != null) ? [] : {};

		for (var key in obj)
		{
			if (Object.prototype.hasOwnProperty.call(obj, key))
			{
				var value = obj[key];

				if (typeof value === 'string' && value.indexOf('%') >= 0 &&
					(key == 'tag' || key == 'valueTag' || key == 'expr' ||
					key == 'rpmTag' || key == 'source'))
				{
					value = Model.replaceAttrPlaceholders(graph, cell, value);
				}
				else if (value != null && typeof value === 'object')
				{
					value = Model.resolveTagPlaceholders(graph, cell, value);
				}

				result[key] = value;
			}
		}

		return result;
	};

	/**
	 * Replaces %name% with attribute values of the cell or its ancestors.
	 * Unknown names are left unchanged.
	 */
	Model.replaceAttrPlaceholders = function(graph, cell, str)
	{
		return str.replace(/%([^%{}"'=;|]+)%/g, function(match, name)
		{
			if (name == 'id')
			{
				return cell.id;
			}

			var current = cell;

			while (current != null)
			{
				var value = getAttr(current, name);

				if (value != null)
				{
					return value;
				}

				current = graph.model.getParent(current);
			}

			return match;
		});
	};

	/**
	 * Collects the tag names referenced by an expression.
	 */
	function exprRefs(expr)
	{
		if (Hmi.Expr != null && expr != null && expr !== '')
		{
			try
			{
				return Hmi.Expr.compile(expr).refs || [];
			}
			catch (e)
			{
				return [];
			}
		}

		return [];
	};

	/**
	 * Builds the runtime index for the current page of the graph.
	 *
	 * index = {cells: {id: {cell, bindings, events, triggers, animations,
	 *   roles}}, tagToCells: {tag: [ids]}, tags: {tag: true}, errors: []}
	 */
	Model.scan = function(graph)
	{
		var model = graph.model;
		var index = {cells: {}, tagToCells: {}, tags: {}, errors: []};

		function addTag(tag, id)
		{
			if (tag != null && tag !== '')
			{
				index.tags[tag] = true;

				if (id != null)
				{
					var list = index.tagToCells[tag];

					if (list == null)
					{
						list = [];
						index.tagToCells[tag] = list;
					}

					if (list[list.length - 1] != id)
					{
						list.push(id);
					}
				}
			}
		};

		function visit(cell)
		{
			if (Model.hasCellConfig(cell) || getAttr(cell, 'hmiRoles') != null)
			{
				var cfg = Model.resolveTagPlaceholders(graph, cell,
					Model.getCellConfig(cell));
				cfg.cell = cell;
				index.cells[cell.id] = cfg;

				for (var i = 0; i < cfg.bindings.length; i++)
				{
					var b = cfg.bindings[i];
					addTag(b.tag, cell.id);

					var refs = exprRefs(b.expr);

					for (var j = 0; j < refs.length; j++)
					{
						addTag(refs[j], cell.id);
					}

					if (b.transform != null && b.transform.kind == 'expr')
					{
						refs = exprRefs(b.transform.expr);

						for (var j = 0; j < refs.length; j++)
						{
							addTag(refs[j], cell.id);
						}
					}
				}

				for (var i = 0; i < cfg.animations.length; i++)
				{
					var params = cfg.animations[i].params;

					if (params != null && params.rpmTag != null)
					{
						addTag(params.rpmTag, cell.id);
					}
				}
			}

			// Cells with %tag:Name% placeholders in label or tooltip
			if (getAttr(cell, 'placeholders') == '1')
			{
				var text = (getAttr(cell, 'label') || '') + ' ' + (getAttr(cell, 'tooltip') || '');
				var re = /%tag:([^%|]+)(\|[^%]*)?%/g;
				var match = null;

				while ((match = re.exec(text)) != null)
				{
					var tag = Model.replaceAttrPlaceholders(graph, cell, match[1]);
					addTag(tag, cell.id);
					index.placeholderCells = index.placeholderCells || {};
					index.placeholderCells[cell.id] = true;
				}
			}

			var count = model.getChildCount(cell);

			for (var i = 0; i < count; i++)
			{
				visit(model.getChildAt(cell, i));
			}
		};

		visit(model.getRoot());

		return index;
	};

	Hmi.Model = Model;
})();
