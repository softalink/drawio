/**
 * Hmi.ScreenSettings: the tabbed "Screen Settings" dialog of the current
 * page and document (INTOUCH_LINKS.md §12.3). The tabs hold the data sources,
 * the tag catalogue, the page triggers, the run settings, the hover halo and
 * the InTouch window type of the page. All tabs edit one working copy of the
 * document config; OK writes it with one undoable Hmi.Model.setDocConfig,
 * Cancel discards it.
 *
 * The tab content of the sources, tags and hover halo is rendered by
 * Hmi.SourcesDialog.render, Hmi.TagsDialog.render and Hmi.HaloDialog.render
 * (the old dialogs open this dialog on their tab).
 */
(function()
{
	var root = (typeof globalThis !== 'undefined') ? globalThis : window;
	var Hmi = root.Hmi = root.Hmi || {};

	var ScreenSettings = {};

	// Tab opened when the dialog is opened without a tab
	var lastTab = 'sources';

	ScreenSettings.TABS = ['sources', 'tags', 'pageTriggers', 'runtime', 'hoverHalo', 'window'];

	var BLINK_DEFAULTS = {slow: 1000, medium: 500, fast: 250};

	function T(key)
	{
		return mxResources.get(key);
	};

	function clone(obj)
	{
		return (obj == null) ? obj : JSON.parse(JSON.stringify(obj));
	};

	function el(tag, className, text)
	{
		var e = document.createElement(tag);

		if (className != null)
		{
			e.className = className;
		}

		if (text != null)
		{
			mxUtils.write(e, text);
		}

		return e;
	};

	function section(parent, title, helpKey)
	{
		var s = el('div', 'geDialogSection');
		s.style.marginBottom = '10px';
		Hmi.Editors.head(s, title, helpKey).style.marginBottom = '6px';
		parent.appendChild(s);

		return s;
	};

	/**
	 * Parses an optional number field: '' gives undefined, text that is not
	 * a number gives NaN.
	 */
	function optNumber(input)
	{
		return (input.value === '') ? undefined : Number(input.value);
	};

	function isNum(v)
	{
		return v === undefined || (typeof v === 'number' && isFinite(v));
	};

	// ---------------------------------------------------------------
	// Style (tab bar, errors); the tab look is the one of Animation Links
	// ---------------------------------------------------------------

	ScreenSettings.installStyle = function()
	{
		Hmi.Editors.installStyle();

		if (document.getElementById('geHmiScreenStyle') != null)
		{
			return;
		}

		var style = document.createElement('style');
		style.id = 'geHmiScreenStyle';
		style.textContent =
			'.geHmiScreen .geHmiTabPanels{overflow-y:auto;overflow-x:hidden;padding-right:2px;}' +
			'.geHmiScreen .geHmiTabWrap.geHmiTabErr .geHmiTabLabel{color:#C62828;}' +
			'.geHmiScreen .geHmiTabWrap.geHmiTabErr .geHmiTabCount{color:#C62828;}' +
			'.geHmiScreenErr{color:#C62828;margin-top:6px;white-space:pre-wrap;}' +
			'.geHmiScreen .geHmiColHead{font-weight:600;font-size:12px;min-height:22px;}' +
			'.geHmiScreen .geHmiColHead>span{display:inline-flex;align-items:center;}';
		document.head.appendChild(style);
	};

	// ---------------------------------------------------------------
	// Tab: page triggers
	// ---------------------------------------------------------------

	function renderTriggers(ui, container, state)
	{
		var E = Hmi.Editors;
		var cfg = state.cfg;

		var hint = el('div', 'geDialogHint', T('hmiScrTriggersHint'));
		hint.style.marginBottom = '6px';
		E.help(hint, 'hmiTab.docTriggers');
		container.appendChild(hint);

		var box = el('div', 'geDialogSection');
		box.setAttribute('data-role', 'page-triggers');
		container.appendChild(box);
		var head = el('div', 'geDialogHint');
		var count = el('span');
		head.appendChild(count);
		E.help(head, 'screen.triggers.list');
		box.appendChild(head);
		var listDiv = el('div');
		box.appendChild(listDiv);

		// Same editors as the Triggers and State Machines links of the
		// Animation Links dialog (JSON / HMI tab editor when not loaded)
		function buildEditor(ui2, value)
		{
			var L = Hmi.LinksDialog;

			if (value != null && value.states != null)
			{
				return (L != null && L.buildStateMachine != null) ? L.buildStateMachine(ui2, value) :
					E.jsonFallback(ui2, 'triggers', value);
			}

			return (L != null && L.buildSimpleTrigger != null) ? L.buildSimpleTrigger(ui2, value) :
				Hmi.FormatPanel.buildTriggerEditor(ui2, value);
		};

		var render = function()
		{
			var items = cfg.triggers;
			count.textContent = T('hmiDocTriggers') + ': ' + items.length;

			E.renderItemList({
				ui: ui, container: listDiv, items: items, kind: 'triggers',
				helpKey: 'trigger.dialog', width: 740, dialogId: 'page-trigger',
				itemLabel: function(t)
				{
					var n = (t.states != null) ? t.states.length + ' ' + T('hmiScrStates') :
						(t.conditions || []).length + ' ' + T('hmiConditions') + ', ' +
						(t.actions || []).length + ' ' + T('hmiActions') +
						((t.elseActions || []).length > 0 ? ', ' + (t.elseActions || []).length + ' ' +
						T('hmiElseActions') : '');

					return (t.name || T('hmiTriggers')) + '  ·  ' + n.toLowerCase();
				},
				buildEditor: buildEditor,
				newItem: function()
				{
					return {name: '', conditions: [], conditionType: 'and', actions: []};
				},
				emptyText: T('hmiNoItems'),
				addTitle: T('hmiAddItem'), editTitle: T('edit'),
				onChange: function(newItems)
				{
					cfg.triggers = newItems;
					render();
				}
			});

			// Second add button: a state machine (named states, each with
			// conditions and actions)
			var addSm = E.button(T('hmiScrAddStateMachine'), function()
			{
				E.showItemDialog({
					ui: ui, title: T('hmiScrAddStateMachine'), helpKey: 'screen.triggers.stateMachine',
					width: 740, dialogId: 'page-state-machine', kind: 'triggers',
					value: {name: '', states: []},
					buildEditor: buildEditor,
					onSave: function(value)
					{
						cfg.triggers.push(value);
						render();
					}
				});
			});
			addSm.setAttribute('data-role', 'add-state-machine');
			addSm.style.marginTop = '6px';
			addSm.style.marginLeft = '6px';
			var addBtn = listDiv.querySelector('[data-role="add"]');

			if (addBtn != null && addBtn.parentNode != null)
			{
				addBtn.parentNode.insertBefore(addSm, addBtn.nextSibling);
				E.help(addSm.parentNode, 'screen.triggers.stateMachine');
			}
			else
			{
				listDiv.appendChild(addSm);
			}

			state.changed();
		};

		render();

		return {commit: function()
		{
			return [];
		}, dispose: function() {}};
	};

	// ---------------------------------------------------------------
	// Tab: run settings
	// ---------------------------------------------------------------

	function renderRuntime(ui, container, state)
	{
		var E = Hmi.Editors;
		var cfg = state.cfg;
		var rt = cfg.runtime;
		var blink = rt.blink || {};

		var hint = el('div', 'geDialogHint', T('hmiScrRuntimeHint'));
		hint.style.marginBottom = '6px';
		E.help(hint, 'screen.runtime.dialog');
		container.appendChild(hint);

		var run = section(container, T('hmiScrRunSection'), 'screen.runtime.run');
		var r1 = E.inlineFields(run);
		var simSelect = E.select(['off', 'on', 'only'], cfg.sim || 'off');
		E.inlineField(r1, T('hmiSimMode') + ':', simSelect, 'tags.sim');
		var scriptsSelect = E.select(['inherit', 'off'], cfg.scripts || 'inherit');
		E.inlineField(r1, T('hmiScripts') + ':', scriptsSelect, 'tags.scripts');
		var r1b = E.inlineFields(run);
		var maxRate = E.numberInput(rt.maxRate || 30);
		E.inlineField(r1b, T('hmiMaxRate') + ' (Hz):', maxRate, 'tags.maxRate');
		var quality = E.select(['outline', 'none'], rt.quality || 'outline');
		E.inlineField(r1b, T('hmiQuality') + ':', quality, 'tags.quality');

		var disp = section(container, T('hmiScrDisplaySection'), 'screen.runtime.display');
		var r2 = E.inlineFields(disp);
		var fitSelect = E.select(['none', 'page', 'width', 'stretch'], rt.fit || 'page');
		E.inlineField(r2, T('hmiFit') + ':', fitSelect, 'tags.fit');
		var navSelect = E.select(['tabs', 'none'], rt.nav || 'tabs');
		E.inlineField(r2, T('hmiNav') + ':', navSelect, 'tags.nav');
		var r3 = E.inlineFields(disp);
		var theme = E.select([{value: 'default', label: T('hmiScrThemeDefault')},
			{value: 'isa101', label: 'ISA-101'}], rt.theme || 'default');
		E.inlineField(r3, T('hmiScrTheme') + ':', theme, 'runtime.theme');
		var panZoom = E.checkbox(T('hmiPanZoom'), rt.panZoom !== false, 'tags.panZoom');
		r3.appendChild(panZoom);
		var r4 = E.inlineFields(disp);
		var w = E.numberInput(rt.width || '');
		E.inlineField(r4, T('width') + ':', w, 'tags.width');
		var h = E.numberInput(rt.height || '');
		E.inlineField(r4, T('height') + ':', h, 'tags.height');

		var bl = section(container, T('hmiScrBlinkSection'), 'runtime.blink');
		var r5 = E.inlineFields(bl);
		var slow = E.numberInput(blink.slow != null ? blink.slow : BLINK_DEFAULTS.slow);
		E.inlineField(r5, T('hmiScrBlinkSlow') + ' (ms):', slow, 'runtime.blink.slow');
		var medium = E.numberInput(blink.medium != null ? blink.medium : BLINK_DEFAULTS.medium);
		E.inlineField(r5, T('hmiScrBlinkMedium') + ' (ms):', medium, 'runtime.blink.medium');
		var fast = E.numberInput(blink.fast != null ? blink.fast : BLINK_DEFAULTS.fast);
		E.inlineField(r5, T('hmiScrBlinkFast') + ' (ms):', fast, 'runtime.blink.fast');

		simSelect.setAttribute('data-field', 'sim');
		scriptsSelect.setAttribute('data-field', 'scripts');
		maxRate.setAttribute('data-field', 'maxRate');
		quality.setAttribute('data-field', 'quality');
		fitSelect.setAttribute('data-field', 'fit');
		navSelect.setAttribute('data-field', 'nav');
		theme.setAttribute('data-field', 'theme');
		panZoom.input.setAttribute('data-field', 'panZoom');
		w.setAttribute('data-field', 'designWidth');
		h.setAttribute('data-field', 'designHeight');
		slow.setAttribute('data-field', 'blinkSlow');
		medium.setAttribute('data-field', 'blinkMedium');
		fast.setAttribute('data-field', 'blinkFast');

		return {commit: function()
		{
			var errors = [];
			var rate = parseInt(maxRate.value, 10);
			var bw = optNumber(w);
			var bh = optNumber(h);

			if (!(rate > 0))
			{
				errors.push(T('hmiMaxRate') + ': ' + T('hmiScrPositive'));
			}

			if (!isNum(bw) || !isNum(bh) || bw <= 0 || bh <= 0)
			{
				errors.push(T('width') + ' / ' + T('height') + ': ' + T('hmiScrPositive'));
			}

			var times = {slow: Number(slow.value), medium: Number(medium.value), fast: Number(fast.value)};

			for (var k in times)
			{
				if (!(times[k] > 0))
				{
					errors.push(T('hmiScrBlink' + k.charAt(0).toUpperCase() + k.substring(1)) +
						': ' + T('hmiScrPositive'));
				}
			}

			if (errors.length > 0)
			{
				return errors;
			}

			cfg.sim = simSelect.value;
			cfg.scripts = scriptsSelect.value;
			rt.fit = fitSelect.value;
			rt.nav = navSelect.value;
			rt.maxRate = rate;
			rt.quality = quality.value;
			rt.panZoom = panZoom.input.checked;
			rt.theme = theme.value;
			rt.width = (bw != null) ? Math.round(bw) : undefined;
			rt.height = (bh != null) ? Math.round(bh) : undefined;

			// Only the half-periods that differ from the defaults are stored
			var out = clone(rt.blink) || {};

			for (var key in times)
			{
				if (times[key] != BLINK_DEFAULTS[key] || out[key] != null)
				{
					out[key] = times[key];
				}
			}

			if (Object.keys(out).length > 0)
			{
				rt.blink = out;
			}
			else
			{
				delete rt.blink;
			}

			return errors;
		}, dispose: function() {}};
	};

	// ---------------------------------------------------------------
	// Tab: window (hmi.window of the page, INTOUCH_LINKS.md §8)
	// ---------------------------------------------------------------

	function renderWindow(ui, container, state)
	{
		var E = Hmi.Editors;
		var cfg = state.cfg;
		var win = cfg.window || {};

		var hint = el('div', 'geDialogHint', T('hmiScrWindowHint'));
		hint.style.marginBottom = '6px';
		E.help(hint, 'window.dialog');
		container.appendChild(hint);

		var type = section(container, T('hmiScrWindow'), 'window.section.type');
		var r0 = E.row(type, T('hmiLnkWindowType') + ':', 'window.type');
		var typeSelect = E.select([{value: 'replace', label: T('hmiLnkWin_replace')},
			{value: 'overlay', label: T('hmiLnkWin_overlay')},
			{value: 'popup', label: T('hmiLnkWin_popup')}], win.type || 'replace');
		typeSelect.setAttribute('data-field', 'type');
		r0.appendChild(typeSelect);
		var titleRow = E.row(type, T('hmiLnkWindowTitle') + ':', 'window.title');
		var titleInput = E.textInput(win.title || '');
		titleInput.setAttribute('data-field', 'title');
		titleRow.appendChild(titleInput);

		var geo = section(container, T('hmiScrWindowGeometry'), 'window.section.geometry');
		var r1 = E.inlineFields(geo);
		var xInput = E.numberInput(win.x);
		xInput.setAttribute('data-field', 'x');
		E.inlineField(r1, 'X:', xInput, 'window.x');
		var yInput = E.numberInput(win.y);
		yInput.setAttribute('data-field', 'y');
		E.inlineField(r1, 'Y:', yInput, 'window.y');
		var r2 = E.inlineFields(geo);
		var wInput = E.numberInput(win.width);
		wInput.setAttribute('data-field', 'width');
		E.inlineField(r2, T('width') + ':', wInput, 'window.width');
		var hInput = E.numberInput(win.height);
		hInput.setAttribute('data-field', 'height');
		E.inlineField(r2, T('height') + ':', hInput, 'window.height');

		var note = el('div', 'geDialogHint', T('hmiLnkWindowOtherPages'));
		container.appendChild(note);

		var update = function()
		{
			var on = typeSelect.value != 'replace';
			geo.style.opacity = on ? '' : '0.6';
		};

		mxEvent.addListener(typeSelect, 'change', update);
		update();

		return {commit: function()
		{
			var x = optNumber(xInput);
			var y = optNumber(yInput);
			var w = optNumber(wInput);
			var h = optNumber(hInput);

			if (!isNum(x) || !isNum(y) || !isNum(w) || !isNum(h) || (w != null && w <= 0) ||
				(h != null && h <= 0))
			{
				return [T('hmiScrWindowInvalid')];
			}

			var out = clone(cfg.window) || {};
			out.type = typeSelect.value;

			var values = {x: x, y: y, width: w, height: h, title: (titleInput.value !== '') ?
				titleInput.value : undefined};

			for (var key in values)
			{
				if (values[key] === undefined)
				{
					delete out[key];
				}
				else
				{
					out[key] = values[key];
				}
			}

			// The default window (replace, nothing else set) is not stored
			if (out.type == 'replace' && Object.keys(out).length == 1)
			{
				delete cfg.window;
			}
			else
			{
				cfg.window = out;
			}

			return [];
		}, dispose: function() {}};
	};

	// ---------------------------------------------------------------
	// Dialog
	// ---------------------------------------------------------------

	/**
	 * Opens the dialog; opts.tab is one of ScreenSettings.TABS. Returns the
	 * dialog, or null when the document cannot be edited.
	 */
	ScreenSettings.show = function(ui, opts)
	{
		opts = opts || {};
		var graph = ui.editor.graph;
		ScreenSettings.installStyle();
		var E = Hmi.Editors;

		var cfg = Hmi.Model.getDocConfig(graph);
		cfg.sources = cfg.sources || [];
		cfg.tags = cfg.tags || [];
		cfg.triggers = cfg.triggers || [];
		cfg.runtime = cfg.runtime || {};
		var state = {cfg: cfg, changed: function()
		{
			refreshCounts();
		}};

		var div = el('div', 'geHmiScreen');
		div.setAttribute('data-dialog', 'screen-settings');
		var hd = el('h3', null, T('hmiScreenSettings'));
		E.help(hd, 'screen.dialog');
		div.appendChild(hd);

		var tablist = el('div', 'geHmiTabs');
		tablist.setAttribute('role', 'tablist');
		tablist.setAttribute('aria-label', T('hmiScrTabs'));
		var panels = el('div', 'geHmiTabPanels');
		var tabs = [];
		var selected = null;

		var defs = [
			['sources', T('hmiSources'), Hmi.SourcesDialog.render, function()
			{
				return cfg.sources.length;
			}],
			['tags', T('hmiTags'), Hmi.TagsDialog.render, function()
			{
				return cfg.tags.length;
			}],
			['pageTriggers', T('hmiDocTriggers'), renderTriggers, function()
			{
				return cfg.triggers.length;
			}],
			['runtime', T('hmiScrRuntime'), renderRuntime, null],
			['hoverHalo', T('hmiHoverHalo'), Hmi.HaloDialog.render, null],
			['window', T('hmiScrWindow'), renderWindow, null]
		];

		function refreshCounts()
		{
			for (var i = 0; i < tabs.length; i++)
			{
				if (tabs[i].count != null)
				{
					var n = tabs[i].count();
					tabs[i].countEl.textContent = '(' + n + ')';
					tabs[i].countEl.className = 'geHmiTabCount' + (n > 0 ? ' geHmiHas' : '');
					tabs[i].button.setAttribute('data-count', String(n));
				}
			}
		};

		function selectTab(tab, focus)
		{
			selected = tab;
			lastTab = tab.id;

			for (var i = 0; i < tabs.length; i++)
			{
				var on = (tabs[i] == tab);
				tabs[i].button.setAttribute('aria-selected', on ? 'true' : 'false');
				tabs[i].button.setAttribute('tabindex', on ? '0' : '-1');
				tabs[i].wrap.className = 'geHmiTabWrap' + (on ? ' geHmiSel' : '') +
					(tabs[i].error ? ' geHmiTabErr' : '');
				tabs[i].panel.hidden = !on;
			}

			if (focus)
			{
				tab.button.focus();
			}
		};

		function markError(tab, on)
		{
			tab.error = on;
			tab.wrap.className = tab.wrap.className.replace(/ geHmiTabErr/, '') +
				(on ? ' geHmiTabErr' : '');
			tab.button.setAttribute('data-error', on ? 'true' : 'false');
		};

		defs.forEach(function(d)
		{
			var tab = {id: d[0], count: d[3], error: false};
			tab.wrap = el('div', 'geHmiTabWrap');
			tab.wrap.setAttribute('role', 'presentation');
			tab.button = el('button', 'geHmiTab');
			tab.button.setAttribute('type', 'button');
			tab.button.setAttribute('role', 'tab');
			tab.button.setAttribute('id', 'hmiScrTab_' + d[0]);
			tab.button.setAttribute('aria-controls', 'hmiScrPanel_' + d[0]);
			tab.button.setAttribute('data-tab', d[0]);
			var label = el('span', 'geHmiTabLabel', d[1]);
			tab.button.appendChild(label);
			tab.countEl = el('span', 'geHmiTabCount');
			tab.button.appendChild(tab.countEl);
			tab.wrap.appendChild(tab.button);
			E.help(tab.wrap, 'screen.tab.' + d[0], d[1]);
			tablist.appendChild(tab.wrap);

			tab.panel = el('div', 'geHmiTabPanel');
			tab.panel.setAttribute('role', 'tabpanel');
			tab.panel.setAttribute('id', 'hmiScrPanel_' + d[0]);
			tab.panel.setAttribute('aria-labelledby', tab.button.id);
			tab.panel.setAttribute('data-panel', d[0]);
			tab.panel.hidden = true;
			panels.appendChild(tab.panel);
			tabs.push(tab);
			tab.view = d[2](ui, tab.panel, state);

			mxEvent.addListener(tab.button, 'click', function()
			{
				selectTab(tab, false);
			});
			mxEvent.addListener(tab.button, 'keydown', function(evt)
			{
				var i = tabs.indexOf(tab);
				var key = evt.key;
				var next = (key == 'ArrowRight' || key == 'ArrowDown') ? (i + 1) % tabs.length :
					((key == 'ArrowLeft' || key == 'ArrowUp') ? (i + tabs.length - 1) % tabs.length :
					((key == 'Home') ? 0 : ((key == 'End') ? tabs.length - 1 : -1)));

				if (next >= 0)
				{
					mxEvent.consume(evt);
					selectTab(tabs[next], true);
				}
			});
		});

		div.appendChild(tablist);
		div.appendChild(panels);

		var errorsDiv = el('div', 'geDialogHint geHmiScreenErr');
		errorsDiv.setAttribute('role', 'alert');
		errorsDiv.setAttribute('data-role', 'screen-errors');
		div.appendChild(errorsDiv);

		refreshCounts();
		var initial = tabs[0];
		var want = (opts.tab != null) ? opts.tab : lastTab;

		for (var i = 0; i < tabs.length; i++)
		{
			if (tabs[i].id == want)
			{
				initial = tabs[i];
			}
		}

		selectTab(initial, false);

		function dispose()
		{
			for (var j = 0; j < tabs.length; j++)
			{
				if (tabs[j].view != null && tabs[j].view.dispose != null)
				{
					tabs[j].view.dispose();
				}
			}
		};

		function tabOfError(message)
		{
			var m = /^(sources|tags|triggers|sim|scripts|runtime|window)\b/.exec(message);
			var map = {sources: 'sources', tags: 'tags', triggers: 'pageTriggers', sim: 'runtime',
				scripts: 'runtime', runtime: 'runtime', window: 'window'};

			return (m != null) ? map[m[1]] : null;
		};

		// Reads every tab into the working copy, then checks the document
		function apply()
		{
			var problems = [];
			errorsDiv.textContent = '';

			for (var j = 0; j < tabs.length; j++)
			{
				markError(tabs[j], false);
			}

			for (var k = 0; k < tabs.length; k++)
			{
				var errs = tabs[k].view.commit();

				for (var e = 0; e < errs.length; e++)
				{
					problems.push({tab: tabs[k], text: errs[e]});
				}
			}

			if (problems.length == 0)
			{
				var schemaErrors = Hmi.Schema.validate('doc', cfg);

				for (var s = 0; s < schemaErrors.length; s++)
				{
					var id = tabOfError(schemaErrors[s]);
					var target = tabs[0];

					for (var t = 0; t < tabs.length; t++)
					{
						if (tabs[t].id == id)
						{
							target = tabs[t];
						}
					}

					problems.push({tab: target, text: schemaErrors[s]});
				}
			}

			if (problems.length > 0)
			{
				var lines = [];

				for (var p = 0; p < problems.length; p++)
				{
					markError(problems[p].tab, true);
					lines.push(problems[p].tab.button.querySelector('.geHmiTabLabel').textContent +
						': ' + problems[p].text);
				}

				errorsDiv.textContent = lines.join('\n');
				selectTab(problems[0].tab, false);

				return false;
			}

			return true;
		};

		var dlg = new CustomDialog(ui, div, null, dispose, T('ok'), null, null, null, null, true);

		// OK keeps the dialog open while there are errors
		var okBtn = dlg.container.querySelector('.gePrimaryBtn');

		if (okBtn != null)
		{
			var fresh = okBtn.cloneNode(true);
			okBtn.parentNode.replaceChild(fresh, okBtn);
			fresh.setAttribute('data-role', 'screen-ok');

			mxEvent.addListener(fresh, 'click', function()
			{
				if (apply())
				{
					ui.hideDialog();
					dispose();
					Hmi.Model.setDocConfig(graph, cfg);
				}
			});
		}

		ui.showDialog(dlg.container, 780, null, true, true);

		// Fixed size: the panel area gets the height of the tallest tab (the
		// content scrolls when the window is smaller)
		var tallest = 0;

		for (var tn = 0; tn < tabs.length; tn++)
		{
			for (var to = 0; to < tabs.length; to++)
			{
				tabs[to].panel.hidden = (to != tn);
			}

			tallest = Math.max(tallest, panels.scrollHeight);
		}

		for (var tp = 0; tp < tabs.length; tp++)
		{
			tabs[tp].panel.hidden = (tabs[tp] != selected);
		}

		var room = Math.max(240, (root.innerHeight || 800) - 270);
		panels.style.height = Math.min(tallest, room) + 'px';
		E.fitDialog(div);

		return dlg;
	};

	Hmi.ScreenSettings = ScreenSettings;
})();
