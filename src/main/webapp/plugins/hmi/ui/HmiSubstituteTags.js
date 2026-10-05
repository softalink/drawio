/**
 * Hmi.SubstituteTags: "Substitute Tags" (InTouch page 83) and "Define
 * Missing Tags" (placeholder tag conversion, page 84).
 *
 * Substitute Tags lists every tag referenced by the selected cells (animation
 * links, bindings, events, triggers, animations) and rewrites the chosen
 * names in one undoable model edit. Define Missing Tags adds the referenced
 * but undeclared tags to the tag catalogue of the current page.
 *
 * DOM-bound; not part of the DOM-free module set (ARCHITECTURE.md §1).
 */
(function()
{
	var root = (typeof globalThis !== 'undefined') ? globalThis : window;
	var Hmi = root.Hmi = root.Hmi || {};

	var SubstituteTags = {};

	function T(key)
	{
		var value = mxResources.get(key);

		return (value != null && value !== '') ? value : key;
	};

	var ATTRS = ['hmiLinks', 'hmiBindings', 'hmiEvents', 'hmiTriggers', 'hmiAnimations'];
	var EXACT_KEYS = {tag: true, valueTag: true, rpmTag: true};
	var TYPE_RANK = {any: 0, boolean: 1, number: 2, string: 3};
	var DOTFIELDS = 'Value|Name|Quality|MinEU|MaxEU|MinRaw|MaxRaw|Alarm|Ack|TimeLastModified';
	var ID_CHARS = 'A-Za-z0-9_!@#$%&\\\\/';

	function getAttr(cell, name)
	{
		return (cell != null && cell.value != null && typeof cell.value === 'object' &&
			cell.value.getAttribute != null) ? cell.value.getAttribute(name) : null;
	};

	function escapeRe(s)
	{
		return s.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
	};

	// ---------------------------------------------------------------
	// Text rewriting
	// ---------------------------------------------------------------

	/**
	 * Replaces tag names in expression or script text in a single pass (so
	 * that swaps A to B and B to A work). A name matches only as a whole
	 * identifier (tag names may contain / \ . and similar characters); a
	 * following dotfield (.Value, .Name, ...) is kept. String literals are
	 * left alone, except the argument of tag("Name") calls; noLiterals disables
	 * that.
	 */
	SubstituteTags.rewriteExpr = function(text, map, noLiterals)
	{
		var names = Object.keys(map).filter(function(n)
		{
			return n !== '';
		}).sort(function(a, b)
		{
			return b.length - a.length;
		});

		if (names.length == 0 || typeof text !== 'string' || text === '')
		{
			return text;
		}

		var re = new RegExp('(^|[^' + ID_CHARS + '.])(' + names.map(escapeRe).join('|') +
			')(?![' + ID_CHARS + ']|\\.(?!(?:' + DOTFIELDS + ')(?![' + ID_CHARS + '])))', 'g');
		var parts = text.split(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/);

		for (var i = 0; i < parts.length; i++)
		{
			if (i % 2 == 1)
			{
				var inner = parts[i].substring(1, parts[i].length - 1);

				if (!noLiterals && Object.prototype.hasOwnProperty.call(map, inner) &&
					/\btag\s*\(\s*$/i.test(parts[i - 1]))
				{
					var q = parts[i].charAt(0);
					parts[i] = q + map[inner] + q;
				}
			}
			else
			{
				parts[i] = parts[i].replace(re, function(m, pre, name)
				{
					return pre + map[name];
				});
			}
		}

		return parts.join('');
	};

	/**
	 * Rewrites the tag references inside a parsed attribute value in place.
	 * Returns true if something changed.
	 */
	SubstituteTags.rewriteConfig = function(obj, map, inLinks)
	{
		var changed = false;

		if (obj == null || typeof obj !== 'object')
		{
			return false;
		}

		for (var key in obj)
		{
			var v = obj[key];

			if (typeof v === 'string')
			{
				var nv = v;

				if (EXACT_KEYS[key] || (inLinks && (key == 'min' || key == 'max')))
				{
					if (Object.prototype.hasOwnProperty.call(map, v))
					{
						nv = map[v];
					}
				}
				else if (key == 'expr')
				{
					nv = SubstituteTags.rewriteExpr(v, map, false);
				}
				else if (inLinks && key == 'script')
				{
					nv = SubstituteTags.rewriteExpr(v, map, true);
				}

				if (nv !== v)
				{
					obj[key] = nv;
					changed = true;
				}
			}
			else if (v != null && typeof v === 'object')
			{
				changed = SubstituteTags.rewriteConfig(v, map, inLinks) || changed;
			}
		}

		return changed;
	};

	/**
	 * Applies the replacements {old: new} to the given cells as one undoable
	 * edit. Returns the number of attributes changed.
	 */
	SubstituteTags.apply = function(ui, cells, map)
	{
		var graph = ui.editor.graph;
		var count = 0;

		graph.model.beginUpdate();
		try
		{
			for (var i = 0; i < cells.length; i++)
			{
				for (var a = 0; a < ATTRS.length; a++)
				{
					var raw = getAttr(cells[i], ATTRS[a]);

					if (raw == null || raw === '')
					{
						continue;
					}

					var obj = null;

					try
					{
						obj = JSON.parse(raw);
					}
					catch (e)
					{
						continue;
					}

					if (SubstituteTags.rewriteConfig(obj, map, ATTRS[a] == 'hmiLinks'))
					{
						graph.setAttributeForCell(cells[i], ATTRS[a], JSON.stringify(obj));
						count++;
					}
				}
			}
		}
		finally
		{
			graph.model.endUpdate();
		}

		return count;
	};

	// ---------------------------------------------------------------
	// Reference collection
	// ---------------------------------------------------------------

	function exprRefs(src)
	{
		if (src == null || src === '' || Hmi.Expr == null)
		{
			return [];
		}

		var clean = function(names)
		{
			return (Hmi.LinksDialog != null) ? Hmi.LinksDialog.cleanRefs(names) : names;
		};

		try
		{
			return clean(Hmi.Expr.compile(src, {intouch: true}).refs || []);
		}
		catch (e)
		{
			try
			{
				return clean(Hmi.Expr.compile(src).refs || []);
			}
			catch (e2)
			{
				return [];
			}
		}
	};

	function walk(obj, out, inLinks)
	{
		if (obj == null || typeof obj !== 'object')
		{
			return;
		}

		if (Array.isArray(obj))
		{
			for (var i = 0; i < obj.length; i++)
			{
				walk(obj[i], out, inLinks);
			}

			return;
		}

		var write = (obj.type == 'writeTag' || obj.type == 'toggleTag' || obj.type == 'pulseTag');

		for (var key in obj)
		{
			var v = obj[key];

			if (typeof v === 'string')
			{
				if (EXACT_KEYS[key])
				{
					var type = (key == 'rpmTag') ? 'number' : (obj.type == 'toggleTag' ||
						obj.type == 'pulseTag' || obj.target == 'visible') ? 'boolean' : 'any';
					out.push({name: v, type: type, write: write});
				}
				else if (key == 'expr' && !inLinks)
				{
					var names = exprRefs(v);

					for (var j = 0; j < names.length; j++)
					{
						out.push({name: names[j], type: 'any', write: false});
					}
				}
			}
			else if (v != null && typeof v === 'object')
			{
				walk(v, out, inLinks);
			}
		}
	};

	/**
	 * Returns [{name, type, write}] (with duplicates) for one cell.
	 */
	SubstituteTags.refsOfCell = function(cell, known)
	{
		var out = [];

		for (var a = 0; a < ATTRS.length; a++)
		{
			var raw = getAttr(cell, ATTRS[a]);

			if (raw == null || raw === '')
			{
				continue;
			}

			var obj = null;

			try
			{
				obj = JSON.parse(raw);
			}
			catch (e)
			{
				continue;
			}

			if (ATTRS[a] == 'hmiLinks')
			{
				if (Hmi.LinksDialog != null)
				{
					out = out.concat(Hmi.LinksDialog.linkRefs(obj, known));
				}

				if (Hmi.Links != null && Hmi.Links.refs != null)
				{
					try
					{
						(Hmi.Links.refs(obj) || []).forEach(function(n)
						{
							out.push({name: n, type: 'any', write: false});
						});
					}
					catch (e2)
					{
						// ignore
					}
				}
			}
			else
			{
				walk(obj, out, false);
			}
		}

		return out;
	};

	function allCells(ui)
	{
		var model = ui.editor.graph.model;
		var list = [];

		(function visit(cell)
		{
			if (cell != model.getRoot() && (model.isVertex(cell) || model.isEdge(cell)))
			{
				list.push(cell);
			}

			for (var i = 0; i < model.getChildCount(cell); i++)
			{
				visit(model.getChildAt(cell, i));
			}
		})(model.getRoot());

		return list;
	};

	function catalogueNames(ui)
	{
		var names = {};

		try
		{
			var cfg = Hmi.Model.getEffectiveConfig(ui);

			for (var i = 0; i < cfg.tags.length; i++)
			{
				names[cfg.tags[i].name] = true;
			}
		}
		catch (e)
		{
			// ignore
		}

		return names;
	};

	/**
	 * Aggregates the references of the cells: [{name, count, type, write}]
	 * in order of first use. extra: optional list of additional
	 * {name,type,write} entries (e.g. page triggers).
	 */
	SubstituteTags.collect = function(ui, cells, extra)
	{
		var known = catalogueNames(ui);
		var byName = {};
		var order = [];

		function add(r)
		{
			if (r.name == null || r.name === '')
			{
				return;
			}

			var e = byName[r.name];

			if (e == null)
			{
				e = byName[r.name] = {name: r.name, count: 0, type: 'any', write: false};
				order.push(e);
			}

			e.count++;
			e.write = e.write || r.write;

			if (TYPE_RANK[r.type] > TYPE_RANK[e.type])
			{
				e.type = r.type;
			}
		};

		cells.forEach(function(cell)
		{
			SubstituteTags.refsOfCell(cell, known).forEach(add);
		});

		(extra || []).forEach(add);

		// "A.Value" next to "A" is one tag with a dotfield
		if (Hmi.LinksDialog != null)
		{
			var keep = Hmi.LinksDialog.cleanRefs(order.map(function(e)
			{
				return e.name;
			}));
			order = order.filter(function(e)
			{
				return keep.indexOf(e.name) >= 0;
			});
		}

		order.forEach(function(e)
		{
			if (e.type == 'any')
			{
				e.type = 'number';
			}
		});

		return order;
	};

	// ---------------------------------------------------------------
	// Substitute Tags dialog
	// ---------------------------------------------------------------

	/**
	 * Shows the Substitute Tags dialog for the cells (default: selection,
	 * or all cells of the page when nothing is selected).
	 */
	SubstituteTags.show = function(ui, cells)
	{
		var graph = ui.editor.graph;
		Hmi.Editors.installStyle();
		cells = cells || graph.getSelectionCells();
		var whole = false;

		if (cells == null || cells.length == 0)
		{
			cells = allCells(ui);
			whole = true;
		}

		var refs = SubstituteTags.collect(ui, cells);
		var div = document.createElement('div');
		div.setAttribute('data-dialog', 'substitute-tags');
		var hd = document.createElement('h3');
		mxUtils.write(hd, T('hmiSubstituteTags'));
		div.appendChild(hd);

		var hint = document.createElement('div');
		hint.className = 'geDialogHint';
		hint.style.cssText = 'margin:-8px 0 10px 0;line-height:normal;';
		hint.textContent = T(whole ? 'hmiSubstituteHintPage' : 'hmiSubstituteHint').replace('{1}', cells.length);
		div.appendChild(hint);

		var section = document.createElement('div');
		section.className = 'geDialogSection';
		div.appendChild(section);
		var inputs = [];

		if (refs.length == 0)
		{
			var empty = document.createElement('div');
			empty.className = 'geDialogHint';
			mxUtils.write(empty, T('hmiSubstituteNone'));
			section.appendChild(empty);
		}
		else
		{
			var wrap = document.createElement('div');
			wrap.style.cssText = 'max-height:320px;overflow-y:auto;';
			var table = document.createElement('table');
			table.className = 'geHmiTable';
			var head = document.createElement('tr');

			[T('hmiSubstituteOld'), T('hmiSubstituteNew')].forEach(function(t, i)
			{
				var th = document.createElement('th');
				th.style.width = '45%';
				mxUtils.write(th, t);
				head.appendChild(th);
			});

			table.appendChild(head);

			refs.forEach(function(r)
			{
				var tr = document.createElement('tr');
				tr.setAttribute('data-tag', r.name);
				var td1 = document.createElement('td');
				td1.style.cssText = 'word-break:break-all;';
				mxUtils.write(td1, r.name);
				var cnt = document.createElement('span');
				cnt.className = 'geDialogHint';
				cnt.textContent = '  ×' + r.count;
				td1.appendChild(cnt);
				var td2 = document.createElement('td');
				var pk = Hmi.Editors.tagPicker(ui, '', {placeholder: T('hmiSubstituteNewHint')});
				pk.input.setAttribute('data-field', 'newName');
				pk.input.setAttribute('data-old', r.name);
				td2.appendChild(pk);
				tr.appendChild(td1);
				tr.appendChild(td2);
				table.appendChild(tr);
				inputs.push({old: r.name, input: pk.input});
			});

			wrap.appendChild(table);
			section.appendChild(wrap);
		}

		var dlg = new CustomDialog(ui, div, function()
		{
			var map = {};

			for (var i = 0; i < inputs.length; i++)
			{
				var nv = inputs[i].input.value.replace(/^\s+|\s+$/g, '');

				if (nv !== '' && nv !== inputs[i].old)
				{
					if (/[\s"'{}()]/.test(nv))
					{
						return T('hmiSubstituteInvalid').replace('{1}', nv);
					}

					map[inputs[i].old] = nv;
				}
			}

			if (Object.keys(map).length > 0)
			{
				SubstituteTags.apply(ui, cells, map);
			}
		}, null, mxResources.get('ok'), null, null, false, null, true);

		ui.showDialog(dlg.container, 520, null, true, true);

		return dlg;
	};

	// ---------------------------------------------------------------
	// Define Missing Tags
	// ---------------------------------------------------------------

	/**
	 * Returns [{name, type, write}] for all tags referenced on the current
	 * page (cells and page triggers) that are not in the effective tag
	 * catalogue. System tags ($...) are ignored.
	 */
	SubstituteTags.findMissing = function(ui)
	{
		var known = catalogueNames(ui);
		var extra = [];

		try
		{
			var triggers = Hmi.Model.getDocConfig(ui.editor.graph).triggers || [];
			walk(triggers, extra, false);
		}
		catch (e)
		{
			// ignore
		}

		return SubstituteTags.collect(ui, allCells(ui), extra).filter(function(r)
		{
			return !known[r.name] && r.name.charAt(0) != '$';
		});
	};

	/**
	 * Adds the given [{name, type, write}] to the tag catalogue of the
	 * current page (one undoable edit).
	 */
	SubstituteTags.addTags = function(ui, list)
	{
		var graph = ui.editor.graph;
		var cfg = Hmi.Model.getDocConfig(graph);
		var have = {};

		cfg.tags.forEach(function(t)
		{
			have[t.name] = true;
		});

		list.forEach(function(r)
		{
			if (!have[r.name])
			{
				have[r.name] = true;
				var def = {name: r.name, type: r.type};

				if (r.write)
				{
					def.access = 'rw';
				}

				cfg.tags.push(def);
			}
		});

		Hmi.Model.setDocConfig(graph, cfg);
	};

	/**
	 * Shows the confirmation list of undeclared tags and defines them.
	 */
	SubstituteTags.defineMissing = function(ui)
	{
		Hmi.Editors.installStyle();
		var missing = SubstituteTags.findMissing(ui);

		if (missing.length == 0)
		{
			ui.showError(T('hmiDefineMissingTags'), T('hmiNoMissingTags'), mxResources.get('ok'));

			return null;
		}

		var div = document.createElement('div');
		div.setAttribute('data-dialog', 'define-missing-tags');
		var hd = document.createElement('h3');
		mxUtils.write(hd, T('hmiDefineMissingTags'));
		div.appendChild(hd);

		var hint = document.createElement('div');
		hint.className = 'geDialogHint';
		hint.style.cssText = 'margin:-8px 0 10px 0;line-height:normal;';
		hint.textContent = T('hmiDefineMissingHint').replace('{1}', missing.length);
		div.appendChild(hint);

		var section = document.createElement('div');
		section.className = 'geDialogSection';
		div.appendChild(section);
		var wrap = document.createElement('div');
		wrap.style.cssText = 'max-height:320px;overflow-y:auto;';
		var table = document.createElement('table');
		table.className = 'geHmiTable';
		var head = document.createElement('tr');

		['', T('name'), T('hmiType')].forEach(function(t)
		{
			var th = document.createElement('th');
			mxUtils.write(th, t);
			head.appendChild(th);
		});

		head.firstChild.style.width = '28px';
		table.appendChild(head);
		var rows = [];

		missing.forEach(function(r)
		{
			var tr = document.createElement('tr');
			tr.setAttribute('data-tag', r.name);
			var td0 = document.createElement('td');
			var cb = document.createElement('input');
			cb.setAttribute('type', 'checkbox');
			cb.checked = true;
			cb.setAttribute('data-field', 'define');
			td0.appendChild(cb);
			var td1 = document.createElement('td');
			td1.style.cssText = 'word-break:break-all;';
			mxUtils.write(td1, r.name);
			var td2 = document.createElement('td');
			var type = Hmi.Editors.select(['number', 'boolean', 'string', 'integer', 'object'], r.type);
			type.setAttribute('data-field', 'type');
			td2.appendChild(type);
			tr.appendChild(td0);
			tr.appendChild(td1);
			tr.appendChild(td2);
			table.appendChild(tr);
			rows.push({r: r, cb: cb, type: type});
		});

		wrap.appendChild(table);
		section.appendChild(wrap);

		var dlg = new CustomDialog(ui, div, function()
		{
			var list = [];

			rows.forEach(function(x)
			{
				if (x.cb.checked)
				{
					list.push({name: x.r.name, type: x.type.value, write: x.r.write});
				}
			});

			if (list.length > 0)
			{
				SubstituteTags.addTags(ui, list);
			}
		}, null, mxResources.get('ok'));

		ui.showDialog(dlg.container, 460, null, true, true);

		return dlg;
	};

	Hmi.SubstituteTags = SubstituteTags;
})();
