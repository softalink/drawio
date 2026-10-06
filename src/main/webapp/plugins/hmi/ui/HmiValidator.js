/**
 * Hmi.Validator: static checks over the current page's HMI configuration
 * (HMI-DIA-2). Hmi.Validator.validate(ui) is exported for tests/headless use
 * and returns [{level, cellId, message}]; Hmi.Validator.show(ui) renders the
 * results in an mxWindow and selects the cell on click.
 */
(function()
{
	var root = (typeof globalThis !== 'undefined') ? globalThis : window;
	var Hmi = root.Hmi = root.Hmi || {};

	var Validator = {};

	function pushAll(list, items, level, cellId, prefix)
	{
		for (var i = 0; i < items.length; i++)
		{
			list.push({level: level, cellId: cellId, message: prefix + ': ' + items[i]});
		}
	};

	function checkExpr(list, cellId, label, expr)
	{
		if (expr == null || expr === '')
		{
			return;
		}

		try
		{
			Hmi.Expr.compile(expr);
		}
		catch (e)
		{
			list.push({level: 'error', cellId: cellId, message: label + ': ' + e.message});
		}
	};

	function checkTagRefs(list, cellId, label, tagName, knownTags)
	{
		if (tagName != null && tagName !== '' && !knownTags[tagName])
		{
			list.push({level: 'warning', cellId: cellId,
				message: label + ': undeclared tag "' + tagName + '"'});
		}
	};

	function checkConditions(list, cellId, conditions, knownTags)
	{
		if (conditions == null)
		{
			return;
		}

		for (var i = 0; i < conditions.length; i++)
		{
			var c = conditions[i];
			checkTagRefs(list, cellId, 'condition', c.tag, knownTags);
			checkTagRefs(list, cellId, 'condition value tag', c.valueTag, knownTags);
			checkExpr(list, cellId, 'condition expr', c.expr);
		}
	};

	function checkActions(list, cellId, actions, ctx)
	{
		if (actions == null)
		{
			return;
		}

		for (var i = 0; i < actions.length; i++)
		{
			var a = actions[i];

			if ((a.type == 'writeTag' || a.type == 'toggleTag' || a.type == 'pulseTag') && a.tag)
			{
				checkTagRefs(list, cellId, 'action ' + a.type, a.tag, ctx.knownTags);
				var def = ctx.tagDefs[a.tag];

				if (def != null && def.access != 'rw' && !def.local)
				{
					list.push({level: 'error', cellId: cellId, message: 'action ' + a.type +
						': tag "' + a.tag + '" is not writable (access=' + (def.access || 'r') + ')'});
				}
			}

			if (a.expr != null)
			{
				checkExpr(list, cellId, 'action ' + a.type + ' expr', a.expr);
			}

			if (a.type == 'navigate' && a.page != null)
			{
				if (Hmi.Actions.findPage(ctx.ui, a.page) == null)
				{
					list.push({level: 'error', cellId: cellId,
						message: 'action navigate: page "' + a.page + '" not found'});
				}
			}

			if (a.type == 'dialog' && a.page != null)
			{
				if (Hmi.Actions.findPage(ctx.ui, a.page) == null)
				{
					list.push({level: 'error', cellId: cellId,
						message: 'action dialog: page "' + a.page + '" not found'});
				}
			}

			if (a.target != null && typeof a.target === 'object' && a.target.cells != null)
			{
				for (var j = 0; j < a.target.cells.length; j++)
				{
					if (ctx.graph.model.getCell(a.target.cells[j]) == null)
					{
						list.push({level: 'error', cellId: cellId, message: 'action ' + a.type +
							': target cell "' + a.target.cells[j] + '" not found'});
					}
				}
			}

			if (a.type == 'script' || (a.code != null && a.code !== ''))
			{
				checkScriptPolicy(list, cellId, ctx);
			}
		}
	};

	function checkScriptPolicy(list, cellId, ctx)
	{
		var globalOff = (root.DRAWIO_CONFIG != null && root.DRAWIO_CONFIG.hmi != null &&
			root.DRAWIO_CONFIG.hmi.scripts == 'off');
		var docOff = ctx.docCfg.scripts == 'off';

		if (globalOff || docOff)
		{
			list.push({level: 'warning', cellId: cellId,
				message: 'script present while scripts are disabled (' +
				(globalOff ? 'global config' : 'document setting') + ')'});
		}
	};

	// ---------------------------------------------------------------
	// Animation links (INTOUCH_LINKS.md §10)
	// ---------------------------------------------------------------

	function checkIntouchExpr(list, cellId, label, src)
	{
		if (src == null || src === '' || Hmi.Expr == null)
		{
			return;
		}

		try
		{
			Hmi.Expr.compile(src, {intouch: true});
		}
		catch (e)
		{
			list.push({level: 'error', cellId: cellId, message: label + ': ' + e.message});
		}
	};

	function walkLinkExprs(list, cellId, prefix, obj)
	{
		if (obj == null || typeof obj !== 'object')
		{
			return;
		}

		for (var key in obj)
		{
			if (key == 'expr' && typeof obj[key] === 'string')
			{
				checkIntouchExpr(list, cellId, prefix + ' expression', obj[key]);
			}
			else if (/Expr$/.test(key) && typeof obj[key] === 'string')
			{
				checkIntouchExpr(list, cellId, prefix + ' ' + key, obj[key]);
			}
			else if (obj[key] != null && typeof obj[key] === 'object' && key != 'scripts' &&
				key != 'key')
			{
				walkLinkExprs(list, cellId, prefix, obj[key]);
			}
		}
	};

	var SCRIPT_FIELDS = {dataChange: ['script'],
		condition: ['onTrue', 'onFalse', 'whileTrue', 'whileFalse']};

	function numeric(v)
	{
		return typeof v === 'number' || (typeof v === 'string' && v !== '' && !isNaN(Number(v)));
	};

	function hasObject(ctx, id)
	{
		if (id == null || id === '' || id === 'Me')
		{
			return true;
		}

		if (id.indexOf('tag:') == 0)
		{
			var tag = id.substring(4);
			var found = false;
			var cells = ctx.graph.model.cells;

			for (var cid in cells)
			{
				var v = cells[cid].value;
				var t = (v != null && typeof v === 'object' && v.getAttribute != null) ?
					v.getAttribute('tags') : null;

				found = found || (t != null && (' ' + t + ' ').indexOf(' ' + tag + ' ') >= 0);
			}

			return found;
		}

		return ctx.graph.model.getCell(id) != null;
	};

	/**
	 * Checks of the extension links (INTOUCH_LINKS.md §11): choice options,
	 * push value operands, URLs, control objects and object scripts.
	 */
	function checkExtensionLink(list, cellId, type, l, prefix, ctx)
	{
		if (type == 'inputChoice' && (!Array.isArray(l.options) || l.options.length == 0))
		{
			list.push({level: 'error', cellId: cellId, message: prefix + ': no options defined'});
		}

		if (type == 'pushValue' && (l.action == 'add' || l.action == 'subtract') &&
			!numeric(l.value))
		{
			list.push({level: 'error', cellId: cellId, message: prefix + ': action ' + l.action +
				' needs a numeric value'});
		}

		if (type == 'pushValue' && l.action == 'expression' && (l.expr == null || l.expr === ''))
		{
			list.push({level: 'error', cellId: cellId, message: prefix + ': expression is empty'});
		}

		if (type == 'openUrl' && Hmi.LinksDialog != null)
		{
			var key = Hmi.LinksDialog.urlError(l.url);

			if (key == 'hmiLnkRequired')
			{
				list.push({level: 'error', cellId: cellId, message: prefix + ': url is empty'});
			}
			else if (key != null)
			{
				list.push({level: 'error', cellId: cellId, message: prefix + ': url "' + l.url +
					'" is not allowed (only http, https and relative URLs)'});
			}
		}

		if (type == 'control' && Array.isArray(l.commands))
		{
			for (var c = 0; c < l.commands.length; c++)
			{
				var cmd = l.commands[c] || {};

				if (!hasObject(ctx, cmd.object))
				{
					list.push({level: 'error', cellId: cellId, message: prefix + ': command ' +
						(c + 1) + ': object "' + cmd.object + '" not found'});
				}
			}
		}

		if (SCRIPT_FIELDS[type] != null && Hmi.QuickScript != null && Hmi.QuickScript.compile != null)
		{
			SCRIPT_FIELDS[type].forEach(function(k)
			{
				if (typeof l[k] === 'string' && l[k] !== '')
				{
					try
					{
						Hmi.QuickScript.compile(l[k]);
					}
					catch (e)
					{
						list.push({level: 'error', cellId: cellId, message: prefix + ' ' + k +
							' script: ' + e.message});
					}
				}
			});
		}
	};

	function checkLinks(list, cellId, links, ctx)
	{
		if (links == null || typeof links !== 'object')
		{
			return;
		}

		var L = Hmi.LinksDialog;

		if (L != null && L.schemaSupportsLinks())
		{
			pushAll(list, Hmi.Schema.validate('links', links), 'error', cellId, 'link');
		}

		for (var type in links)
		{
			var l = links[type];

			if (l == null || typeof l !== 'object')
			{
				continue;
			}

			var prefix = 'link ' + type;
			walkLinkExprs(list, cellId, prefix, l);

			if (type == 'inputAnalog' && typeof l.min === 'number' && typeof l.max === 'number' &&
				l.max <= l.min)
			{
				list.push({level: 'error', cellId: cellId, message: prefix +
					': maximum (' + l.max + ') must be greater than minimum (' + l.min + ')'});
			}

			if (l.breakpoints != null)
			{
				if (l.breakpoints.length > 10)
				{
					list.push({level: 'error', cellId: cellId, message: prefix +
						': more than 10 break points'});
				}

				for (var b = 1; b < l.breakpoints.length; b++)
				{
					if (!(l.breakpoints[b].value > l.breakpoints[b - 1].value))
					{
						list.push({level: 'error', cellId: cellId, message: prefix +
							': break points must be in ascending order'});
						break;
					}
				}
			}

			if (type == 'tooltip' && l.mode == 'static' && l.text != null && l.text.length > 131)
			{
				list.push({level: 'error', cellId: cellId, message: prefix +
					': tooltip text is longer than 131 characters'});
			}

			if (type == 'pushAction' && l.scripts != null && Hmi.QuickScript != null &&
				Hmi.QuickScript.compile != null)
			{
				for (var s = 0; s < l.scripts.length; s++)
				{
					try
					{
						Hmi.QuickScript.compile(l.scripts[s].script || '');
					}
					catch (e)
					{
						list.push({level: 'error', cellId: cellId, message: prefix + ' script ' +
							(s + 1) + ': ' + e.message});
					}
				}
			}

			checkExtensionLink(list, cellId, type, l, prefix, ctx);

			if ((type == 'showWindow' || type == 'hideWindow') && l.windows != null &&
				Hmi.Actions != null && Hmi.Actions.findPage != null)
			{
				for (var w = 0; w < l.windows.length; w++)
				{
					if (Hmi.Actions.findPage(ctx.ui, l.windows[w]) == null)
					{
						list.push({level: 'error', cellId: cellId, message: prefix +
							': window "' + l.windows[w] + '" not found'});
					}
				}
			}

			if (l.key != null && l.key.key != null && L != null)
			{
				var sig = L.keyOf(l);
				ctx.keys[sig] = ctx.keys[sig] || [];
				ctx.keys[sig].push({cellId: cellId, type: type});
			}
		}

		if (L != null)
		{
			var seen = {};

			var all = L.linkRefs(links, ctx.knownTags);

			if (Hmi.Links != null && Hmi.Links.refs != null)
			{
				try
				{
					L.cleanRefs(Hmi.Links.refs(links) || []).forEach(function(n)
					{
						all.push({name: n});
					});
				}
				catch (e)
				{
					// ignore
				}
			}

			all.forEach(function(r)
			{
				if (!seen[r.name])
				{
					seen[r.name] = true;
					checkTagRefs(list, cellId, 'link', r.name.charAt(0) == '$' ? '' : r.name, ctx.knownTags);
				}
			});
		}
	};

	function checkDuplicateKeys(list, ctx)
	{
		for (var sig in ctx.keys)
		{
			var uses = ctx.keys[sig];

			for (var i = 1; i < uses.length; i++)
			{
				list.push({level: 'warning', cellId: uses[i].cellId, message: 'link ' +
					uses[i].type + ': key equivalent ' + sig + ' is also used by ' +
					uses[0].type + ' of cell ' + uses[0].cellId + ' on this page'});
			}
		}
	};

	// ---------------------------------------------------------------
	// Main validate()
	// ---------------------------------------------------------------

	Validator.validate = function(ui)
	{
		var list = [];
		var graph = ui.editor.graph;
		var docCfg = Hmi.Model.getEffectiveConfig(ui);
		var knownTags = {};
		var tagDefs = {};

		for (var i = 0; i < docCfg.tags.length; i++)
		{
			knownTags[docCfg.tags[i].name] = true;
			tagDefs[docCfg.tags[i].name] = docCfg.tags[i];

			var terr = Hmi.Schema.validate('tag', docCfg.tags[i]);
			pushAll(list, terr, 'error', null, 'tag "' + docCfg.tags[i].name + '"');
		}

		for (var s = 0; s < docCfg.sources.length; s++)
		{
			var src = docCfg.sources[s];
			var serr = Hmi.Schema.validate('source', src);
			pushAll(list, serr, 'error', null, 'source "' + (src.name || src.id) + '"');

			if (src.type == 'mqtt' && (src.topics == null || src.topics.length == 0))
			{
				list.push({level: 'warning', cellId: null,
					message: 'source "' + (src.name || src.id) + '": mqtt source has no topics'});
			}

			if (src.type == 'http' && (src.url == null || src.url === ''))
			{
				list.push({level: 'error', cellId: null,
					message: 'source "' + (src.name || src.id) + '": http source has no url'});
			}
		}

		var ctx = {ui: ui, graph: graph, knownTags: knownTags, tagDefs: tagDefs, docCfg: docCfg, keys: {}};
		var index = Hmi.Model.scan(graph);

		for (var id in index.cells)
		{
			var cfg = index.cells[id];

			checkLinks(list, id, cfg.links, ctx);

			for (var b = 0; b < cfg.bindings.length; b++)
			{
				var binding = cfg.bindings[b];
				var berr = Hmi.Schema.validate('bindings', [binding]);
				pushAll(list, berr, 'error', id, 'binding');
				checkTagRefs(list, id, 'binding', binding.tag, knownTags);
				checkExpr(list, id, 'binding expr', binding.expr);

				if (binding.transform != null && binding.transform.kind == 'expr')
				{
					checkExpr(list, id, 'binding transform expr', binding.transform.expr);
				}
			}

			for (var e = 0; e < cfg.events.length; e++)
			{
				var ev = cfg.events[e];
				var eerr = Hmi.Schema.validate('events', [ev]);
				pushAll(list, eerr, 'error', id, 'event');
				checkConditions(list, id, ev.conditions, knownTags);
				checkActions(list, id, ev.actions, ctx);
			}

			for (var t = 0; t < cfg.triggers.length; t++)
			{
				var trg = cfg.triggers[t];
				var trerr = Hmi.Schema.validate('triggers', [trg]);
				pushAll(list, trerr, 'error', id, 'trigger "' + (trg.name || '') + '"');

				if (trg.states != null)
				{
					for (var st = 0; st < trg.states.length; st++)
					{
						checkConditions(list, id, trg.states[st].conditions, knownTags);
						checkActions(list, id, trg.states[st].actions, ctx);
					}
				}
				else
				{
					checkConditions(list, id, trg.conditions, knownTags);
					checkActions(list, id, trg.actions, ctx);
					checkActions(list, id, trg.elseActions, ctx);
				}
			}

			for (var a = 0; a < cfg.animations.length; a++)
			{
				var anim = cfg.animations[a];
				var aerr = Hmi.Schema.validate('animations', [anim]);
				pushAll(list, aerr, 'error', id, 'animation "' + (anim.name || '') + '"');

				if (anim.params != null && anim.params.rpmTag != null)
				{
					checkTagRefs(list, id, 'animation rpmTag', anim.params.rpmTag, knownTags);
				}
			}
		}

		checkDuplicateKeys(list, ctx);

		for (var dt = 0; dt < docCfg.triggers.length; dt++)
		{
			var docTrg = docCfg.triggers[dt];
			checkConditions(list, null, docTrg.conditions, knownTags);
			checkActions(list, null, docTrg.actions, ctx);
			checkActions(list, null, docTrg.elseActions, ctx);
		}

		return list;
	};

	// ---------------------------------------------------------------
	// UI
	// ---------------------------------------------------------------

	Validator.show = function(ui)
	{
		var graph = ui.editor.graph;
		var results = Validator.validate(ui);

		var div = document.createElement('div');
		div.style.cssText = 'padding:6px;box-sizing:border-box;';

		var summary = document.createElement('div');
		summary.className = 'geDialogHint';
		var errCount = results.filter(function(r) { return r.level == 'error'; }).length;
		var warnCount = results.filter(function(r) { return r.level == 'warning'; }).length;
		mxUtils.write(summary, errCount + ' ' + mxResources.get('hmiErrors') + ', ' +
			warnCount + ' ' + mxResources.get('hmiWarnings'));
		Hmi.Editors.help(summary, 'validator.summary');
		Hmi.Editors.help(summary, 'validator.list');
		div.appendChild(summary);

		var list = document.createElement('div');
		list.style.cssText = 'margin-top:6px;max-height:320px;overflow-y:auto;';
		div.appendChild(list);

		if (results.length == 0)
		{
			var ok = document.createElement('div');
			ok.className = 'geDialogHint';
			mxUtils.write(ok, mxResources.get('hmiValidateOk'));
			list.appendChild(ok);
		}

		for (var i = 0; i < results.length; i++)
		{
			(function(r)
			{
				var row = document.createElement('div');
				row.style.cssText = 'display:flex;gap:6px;padding:3px 0;font-size:12px;' +
					'border-bottom:1px solid var(--border-color, #eee);' +
					(r.cellId != null ? 'cursor:pointer;' : '');

				var badge = document.createElement('span');
				badge.style.cssText = 'min-width:56px;text-align:center;border-radius:3px;' +
					'font-size:10px;font-weight:bold;color:#fff;padding:1px 4px;background:' +
					(r.level == 'error' ? '#C62828' : '#EF6C00') + ';';
				mxUtils.write(badge, r.level.toUpperCase());
				row.appendChild(badge);

				var text = document.createElement('span');
				text.style.flex = '1';
				mxUtils.write(text, r.message);
				row.appendChild(text);

				if (r.cellId != null)
				{
					mxEvent.addListener(row, 'click', function()
					{
						var cell = graph.model.getCell(r.cellId);

						if (cell != null)
						{
							graph.setSelectionCell(cell);
							graph.scrollCellToVisible(cell);
						}
					});
				}

				list.appendChild(row);
			})(results[i]);
		}

		var x = Math.max(0, (document.body.offsetWidth - 460) / 2);
		var wnd = new mxWindow(mxResources.get('hmiValidate'), div, x, 80, 460, 380, true, true);
		wnd.setMaximizable(true);
		wnd.setResizable(true);
		wnd.setClosable(true);
		wnd.setVisible(true);
		Hmi.Editors.windowHelp(wnd, 'validator.window');
	};

	Hmi.Validator = Validator;
})();
