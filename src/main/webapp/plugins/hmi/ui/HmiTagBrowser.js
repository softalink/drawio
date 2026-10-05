/**
 * Hmi.TagBrowser: mxWindow listing catalogue tags union runtime tags, with
 * live value/quality/timestamp while the runtime is running, a search
 * filter, manual override (HMI-SIM-3) and drag-and-drop onto cells to
 * create a default binding.
 */
(function()
{
	var root = (typeof globalThis !== 'undefined') ? globalThis : window;
	var Hmi = root.Hmi = root.Hmi || {};

	var TagBrowser = {};
	var REFRESH_MS = 250; // 4 Hz

	function qualityColor(q)
	{
		return (q == 'bad') ? '#C62828' : (q == 'stale') ? '#F9A825' : '#2E7D32';
	};

	/**
	 * Returns true if the name matches the filter. A filter without
	 * wildcards is a case-insensitive substring match; with the InTouch
	 * wildcards * (any run of characters) and ? (one character) it has to
	 * match the whole name (page 81).
	 */
	TagBrowser.matches = function(name, filter)
	{
		if (filter == null || filter === '')
		{
			return true;
		}

		if (filter.indexOf('*') < 0 && filter.indexOf('?') < 0)
		{
			return name.toLowerCase().indexOf(filter.toLowerCase()) >= 0;
		}

		var re = '^' + filter.replace(/[\\^$.+()|{}\[\]]/g, '\\$&').replace(/\*/g, '.*').
			replace(/\?/g, '.') + '$';

		try
		{
			return new RegExp(re, 'i').test(name);
		}
		catch (e)
		{
			return false;
		}
	};

	/**
	 * Fills the container with the (filtered) tags of the catalogue as a
	 * list (names only) or details (name, type, unit, description) view.
	 * opts = {filter, view: 'list'|'details', selected, onSelect(name),
	 * onPick(name)}. Returns the number of matching tags.
	 */
	TagBrowser.renderPicker = function(ui, container, opts)
	{
		container.innerHTML = '';
		var defs = {};

		try
		{
			var cfg = Hmi.Model.getEffectiveConfig(ui);

			for (var i = 0; i < cfg.tags.length; i++)
			{
				defs[cfg.tags[i].name] = cfg.tags[i];
			}
		}
		catch (e)
		{
			// ignore
		}

		var names = Hmi.Editors.getKnownTags(ui).filter(function(n)
		{
			return TagBrowser.matches(n, opts.filter);
		});
		var rowEls = {};
		var parent = container;

		if (opts.view == 'details')
		{
			var table = document.createElement('table');
			table.className = 'geHmiPickTable';
			var head = document.createElement('tr');

			[mxResources.get('name'), mxResources.get('hmiType'), mxResources.get('hmiUnit'),
				mxResources.get('hmiDescription')].forEach(function(t)
			{
				var th = document.createElement('th');
				mxUtils.write(th, t);
				head.appendChild(th);
			});

			table.appendChild(head);
			container.appendChild(table);
			parent = table;
		}
		else
		{
			parent = document.createElement('div');
			parent.className = 'geHmiPickList';
			container.appendChild(parent);
		}

		function select(name)
		{
			for (var key in rowEls)
			{
				rowEls[key].className = rowEls[key].className.replace(/ ?geHmiSel/, '');
			}

			if (rowEls[name] != null)
			{
				rowEls[name].className += ' geHmiSel';
			}

			opts.selected = name;

			if (opts.onSelect != null)
			{
				opts.onSelect(name);
			}
		};

		names.forEach(function(name)
		{
			var def = defs[name] || {};
			var el = document.createElement(opts.view == 'details' ? 'tr' : 'div');
			el.className = 'geHmiPickRow';

			if (opts.view == 'details')
			{
				[name, def.type || '', def.unit || '', def.description || ''].forEach(function(t)
				{
					var td = document.createElement('td');
					mxUtils.write(td, t);
					el.appendChild(td);
				});
			}
			else
			{
				mxUtils.write(el, name);
			}

			mxEvent.addListener(el, 'click', function()
			{
				select(name);
			});

			mxEvent.addListener(el, 'dblclick', function()
			{
				select(name);

				if (opts.onPick != null)
				{
					opts.onPick(name);
				}
			});

			rowEls[name] = el;
			parent.appendChild(el);
		});

		if (names.length == 0)
		{
			var empty = document.createElement('div');
			empty.className = 'geDialogHint';
			empty.style.padding = '8px';
			mxUtils.write(empty, mxResources.get('hmiNoItems'));
			container.appendChild(empty);
		}

		if (opts.selected != null)
		{
			select(opts.selected);
		}

		return names.length;
	};

	/**
	 * Select mode: shows a modal dialog with a wildcard filter (* and ?)
	 * and list/details views, and calls callback(name) with the chosen tag
	 * name. opts = {filter, selected, title}.
	 */
	TagBrowser.select = function(ui, callback, opts)
	{
		opts = opts || {};
		Hmi.Editors.installStyle();
		var div = document.createElement('div');
		var hd = document.createElement('h3');
		mxUtils.write(hd, opts.title || mxResources.get('hmiSelectTag'));
		div.appendChild(hd);

		var section = document.createElement('div');
		section.className = 'geDialogSection';
		div.appendChild(section);

		var filterRow = Hmi.Editors.row(section, mxResources.get('hmiFilter') + ':');
		var filter = Hmi.Editors.textInput(opts.filter || '', mxResources.get('hmiFilterHint'));
		filterRow.appendChild(filter);

		var viewRow = Hmi.Editors.row(section, mxResources.get('hmiView') + ':');
		var view = Hmi.Editors.select([{value: 'list', label: mxResources.get('hmiViewList')},
			{value: 'details', label: mxResources.get('hmiViewDetails')}], 'details');
		viewRow.appendChild(view);

		var listWrap = document.createElement('div');
		listWrap.className = 'geHmiPick';
		listWrap.style.height = '240px';
		section.appendChild(listWrap);

		var chosen = opts.selected || null;
		var dlg = null;

		function render()
		{
			TagBrowser.renderPicker(ui, listWrap, {filter: filter.value, view: view.value,
				selected: chosen, onSelect: function(name)
				{
					chosen = name;
				}, onPick: function(name)
				{
					chosen = name;
					dlg.okButton.click();
				}});
		};

		mxEvent.addListener(filter, 'input', render);
		mxEvent.addListener(view, 'change', render);
		render();

		dlg = new CustomDialog(ui, div, function()
		{
			if (chosen != null)
			{
				callback(chosen);
			}
		}, null, mxResources.get('ok'));
		ui.showDialog(dlg.container, 460, null, true, true);
		filter.focus();

		return dlg;
	};

	TagBrowser.show = function(ui)
	{
		if (ui.hmiTagBrowserWindow != null)
		{
			ui.hmiTagBrowserWindow.window.setVisible(true);

			return;
		}

		var div = document.createElement('div');
		div.style.cssText = 'overflow:hidden;padding:6px;box-sizing:border-box;';

		var searchRow = document.createElement('div');
		searchRow.style.cssText = 'display:flex;gap:6px;margin-bottom:6px;';
		div.appendChild(searchRow);

		var search = document.createElement('input');
		search.setAttribute('type', 'text');
		search.setAttribute('placeholder', mxResources.get('hmiFilterHint'));
		search.style.cssText = 'flex:1;min-width:0;box-sizing:border-box;';
		searchRow.appendChild(search);

		var viewSelect = Hmi.Editors.select([
			{value: 'details', label: mxResources.get('hmiViewDetails')},
			{value: 'list', label: mxResources.get('hmiViewList')}], 'details');
		viewSelect.style.cssText = 'flex:0 0 auto;';
		searchRow.appendChild(viewSelect);

		var tableWrap = document.createElement('div');
		tableWrap.style.cssText = 'overflow-y:auto;height:280px;';
		div.appendChild(tableWrap);

		var table = document.createElement('table');
		table.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px;';
		tableWrap.appendChild(table);

		var rows = {};

		function getRows()
		{
			var cfg = null;

			try
			{
				cfg = Hmi.Model.getEffectiveConfig(ui);
			}
			catch (e)
			{
				cfg = {tags: []};
			}

			var names = {};
			var list = [];

			for (var i = 0; i < cfg.tags.length; i++)
			{
				names[cfg.tags[i].name] = true;
				list.push({name: cfg.tags[i].name, def: cfg.tags[i]});
			}

			var rt = ui.hmi != null ? ui.hmi.getRuntime() : null;

			if (rt != null)
			{
				var seen = rt.tags.names();

				for (var j = 0; j < seen.length; j++)
				{
					if (!names[seen[j]])
					{
						names[seen[j]] = true;
						list.push({name: seen[j], def: rt.tags.getDef(seen[j])});
					}
				}
			}

			list.sort(function(a, b)
			{
				return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);
			});

			return list;
		};

		function render()
		{
			table.innerHTML = '';
			rows = {};
			var filter = search.value;
			var list = getRows();
			var rt = ui.hmi != null ? ui.hmi.getRuntime() : null;
			var listView = (viewSelect.value == 'list');

			var head = document.createElement('tr');

			[mxResources.get('name'), mxResources.get('hmiValue'), mxResources.get('hmiValueQuality'),
				''].forEach(function(t)
			{
				var th = document.createElement('th');
				th.style.cssText = 'text-align:left;padding:2px 6px;border-bottom:1px solid ' +
					'var(--border-color, #ccc);';
				mxUtils.write(th, t);
				head.appendChild(th);
			});

			if (!listView)
			{
				table.appendChild(head);
			}

			for (var i = 0; i < list.length; i++)
			{
				var item = list[i];

				if (!TagBrowser.matches(item.name, filter))
				{
					continue;
				}

				var tr = document.createElement('tr');
				tr.setAttribute('draggable', 'true');
				tr.className = 'geHmiTagRow';
				tr.style.cursor = 'grab';

				mxEvent.addListener(tr, 'dragstart', (function(name)
				{
					return function(evt)
					{
						evt.dataTransfer.setData('text/hmi-tag', name);
						evt.dataTransfer.setData('text/plain', name);
						evt.dataTransfer.effectAllowed = 'copy';
					};
				})(item.name));

				var nameTd = document.createElement('td');
				nameTd.style.cssText = 'padding:2px 6px;';
				mxUtils.write(nameTd, item.name);
				tr.appendChild(nameTd);

				if (listView)
				{
					nameTd.style.display = 'inline-block';
					nameTd.style.width = '130px';
					tr.style.display = 'inline-block';
					table.appendChild(tr);
					continue;
				}

				var valueTd = document.createElement('td');
				valueTd.style.cssText = 'padding:2px 6px;cursor:pointer;';
				valueTd.setAttribute('title', mxResources.get('hmiOverrideHint'));
				tr.appendChild(valueTd);

				var qTd = document.createElement('td');
				qTd.style.cssText = 'padding:2px 6px;';
				tr.appendChild(qTd);

				var writeTd = document.createElement('td');
				writeTd.style.cssText = 'padding:2px 6px;';

				if (rt != null)
				{
					var writeBtn = document.createElement('a');
					writeBtn.className = 'geButton';
					writeBtn.style.cursor = 'pointer';
					mxUtils.write(writeBtn, '✎');
					writeBtn.setAttribute('title', mxResources.get('hmiOverride'));
					mxEvent.addListener(writeBtn, 'click', (function(name)
					{
						return function()
						{
							TagBrowser.promptOverride(ui, rt, name);
						};
					})(item.name));
					writeTd.appendChild(writeBtn);
				}

				tr.appendChild(writeTd);
				table.appendChild(tr);
				rows[item.name] = {valueTd: valueTd, qTd: qTd};
			}

			update();
		};

		function update()
		{
			var rt = ui.hmi != null ? ui.hmi.getRuntime() : null;

			for (var name in rows)
			{
				var entry = (rt != null) ? rt.tags.get(name) : null;
				var r = rows[name];

				if (entry != null)
				{
					r.valueTd.textContent = (entry.value == null) ? '--' : String(entry.value);
					r.qTd.textContent = entry.quality || 'good';
					r.qTd.style.color = qualityColor(entry.quality);
				}
				else
				{
					r.valueTd.textContent = '--';
					r.qTd.textContent = '';
				}
			}
		};

		mxEvent.addListener(search, 'input', render);
		mxEvent.addListener(viewSelect, 'change', render);
		render();

		var lastRefresh = 0;
		var tagsListener = function()
		{
			var now = Date.now();

			if (now - lastRefresh >= REFRESH_MS)
			{
				lastRefresh = now;
				update();
			}
		};

		var startListener = function(rt)
		{
			rt.on('tags', tagsListener);
			render();
		};

		if (ui.hmi != null)
		{
			ui.hmi.onStart(startListener);
			var current = ui.hmi.getRuntime();

			if (current != null)
			{
				current.on('tags', tagsListener);
			}
		}

		var x = Math.max(0, document.body.offsetWidth - 380);
		var wnd = new mxWindow(mxResources.get('hmiTagBrowser'), div, x, 120, 340, 360, true, true);
		wnd.setMaximizable(false);
		wnd.setResizable(true);
		wnd.setClosable(true);
		wnd.setVisible(true);

		wnd.addListener('resize', function()
		{
			tableWrap.style.height = (wnd.div.offsetHeight - 90) + 'px';
		});

		ui.hmiTagBrowserWindow = {window: wnd, refresh: render};

		if (ui.editor.graph.model.addListener != null)
		{
			var modelListener = function()
			{
				render();
			};
			ui.editor.graph.model.addListener(mxEvent.CHANGE, modelListener);
		}
	};

	/**
	 * Prompts for a value and writes it as a manual override (HMI-SIM-3).
	 */
	TagBrowser.promptOverride = function(ui, rt, name)
	{
		var current = rt.tags.getValue(name);
		var dlg = new FilenameDialog(ui, (current != null) ? String(current) : '',
			mxResources.get('ok'), function(value)
			{
				if (value != null)
				{
					rt.tags.set(name, value, {source: 'override'});

					if (rt.simulator != null && rt.simulator.write != null)
					{
						rt.simulator.write(name, value);
					}

					rt.requestFlush();
				}
			}, mxUtils.htmlEntities(mxResources.get('hmiOverrideValue') + ' ' + name));
		ui.showDialog(dlg.container, 300, 80, true, true);
		dlg.init();
	};

	// ---------------------------------------------------------------
	// Drop handling: default binding depends on the target shape
	// ---------------------------------------------------------------

	TagBrowser.defaultBindingFor = function(cell, graph)
	{
		var style = graph.getCurrentCellStyle(cell) || {};
		var shape = style.shape || '';

		if (graph.model.isEdge(cell))
		{
			return {target: 'style:flowAnimation'};
		}

		if (shape.indexOf('mxgraph.hmi.') == 0)
		{
			return {target: 'prop:value'};
		}

		if (style.hmiLevel != null || shape.indexOf('cylinder') >= 0)
		{
			return {target: 'style:hmiLevel'};
		}

		return {target: 'label'};
	};

	TagBrowser.installDrop = function(ui)
	{
		var graph = ui.editor.graph;

		if (graph.hmiTagDropInstalled)
		{
			return;
		}

		graph.hmiTagDropInstalled = true;
		var container = graph.container;

		mxEvent.addListener(container, 'dragover', function(evt)
		{
			if (evt.dataTransfer != null && Array.prototype.indexOf.call(
				evt.dataTransfer.types || [], 'text/hmi-tag') >= 0)
			{
				evt.preventDefault();
				evt.dataTransfer.dropEffect = 'copy';
			}
		});

		mxEvent.addListener(container, 'drop', function(evt)
		{
			if (evt.dataTransfer == null)
			{
				return;
			}

			var tag = evt.dataTransfer.getData('text/hmi-tag');

			if (tag == null || tag === '')
			{
				return;
			}

			var pt = mxUtils.convertPoint(container, mxEvent.getClientX(evt), mxEvent.getClientY(evt));
			var cell = graph.getCellAt(pt.x, pt.y);

			if (cell == null)
			{
				return;
			}

			evt.preventDefault();
			var binding = TagBrowser.defaultBindingFor(cell, graph);
			binding.tag = tag;

			var cfg = Hmi.Model.getCellConfig(cell);
			cfg.bindings.push(binding);
			Hmi.Model.setCellConfig(graph, cell, 'bindings', cfg.bindings);
			graph.setSelectionCell(cell);
		});
	};

	Hmi.TagBrowser = TagBrowser;
})();
