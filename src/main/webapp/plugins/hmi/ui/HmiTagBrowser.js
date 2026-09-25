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

	TagBrowser.show = function(ui)
	{
		if (ui.hmiTagBrowserWindow != null)
		{
			ui.hmiTagBrowserWindow.window.setVisible(true);

			return;
		}

		var div = document.createElement('div');
		div.style.cssText = 'overflow:hidden;padding:6px;box-sizing:border-box;';

		var search = document.createElement('input');
		search.setAttribute('type', 'text');
		search.setAttribute('placeholder', mxResources.get('search') || 'Search');
		search.style.cssText = 'width:100%;box-sizing:border-box;margin-bottom:6px;';
		div.appendChild(search);

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
			var filter = search.value.toLowerCase();
			var list = getRows();
			var rt = ui.hmi != null ? ui.hmi.getRuntime() : null;

			var head = document.createElement('tr');

			[mxResources.get('name'), mxResources.get('hmiValue'), mxResources.get('hmiQuality'),
				''].forEach(function(t)
			{
				var th = document.createElement('th');
				th.style.cssText = 'text-align:left;padding:2px 6px;border-bottom:1px solid ' +
					'var(--border-color, #ccc);';
				mxUtils.write(th, t);
				head.appendChild(th);
			});
			table.appendChild(head);

			for (var i = 0; i < list.length; i++)
			{
				var item = list[i];

				if (filter !== '' && item.name.toLowerCase().indexOf(filter) < 0)
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
