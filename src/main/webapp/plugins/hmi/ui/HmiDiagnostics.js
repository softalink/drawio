/**
 * Hmi.Diagnostics: mxWindow with tabs (Sources, Rate, Log, Writes). Also
 * Hmi.AlarmList: mxWindow listing active alarms with ack buttons. Both work
 * in runtime (lightbox) mode, where ui.showDialog-based CustomDialogs are
 * avoided in favor of mxWindow (which renders fine in chromeless mode too).
 */
(function()
{
	var root = (typeof globalThis !== 'undefined') ? globalThis : window;
	var Hmi = root.Hmi = root.Hmi || {};

	var Diagnostics = {};

	var SEVERITY_COLORS = {1: '#C62828', 2: '#EF6C00', 3: '#F9A825', 4: '#1565C0'};
	var SEVERITY_TEXT = {1: 'CRIT', 2: 'HIGH', 3: 'WARN', 4: 'INFO'};

	function tabbed(names)
	{
		var wrap = document.createElement('div');
		var tabBar = document.createElement('div');
		tabBar.style.cssText = 'display:flex;gap:2px;border-bottom:1px solid ' +
			'var(--border-color, #ccc);margin-bottom:6px;';
		wrap.appendChild(tabBar);

		var body = document.createElement('div');
		wrap.appendChild(body);

		var panels = {};
		var buttons = {};

		function activate(name)
		{
			for (var n in panels)
			{
				panels[n].style.display = (n == name) ? '' : 'none';
				buttons[n].style.fontWeight = (n == name) ? 'bold' : 'normal';
				buttons[n].style.borderBottom = (n == name) ? '2px solid ' +
					'var(--focus-color, #1a73e8)' : '2px solid transparent';
			}
		};

		for (var i = 0; i < names.length; i++)
		{
			(function(name)
			{
				var btn = document.createElement('a');
				btn.style.cssText = 'cursor:pointer;padding:4px 8px;font-size:12px;';
				mxUtils.write(btn, name);
				mxEvent.addListener(btn, 'click', function()
				{
					activate(name);
				});
				tabBar.appendChild(btn);
				buttons[name] = btn;

				var panel = document.createElement('div');
				panel.style.display = 'none';
				body.appendChild(panel);
				panels[name] = panel;
			})(names[i]);
		}

		activate(names[0]);
		wrap.panels = panels;
		wrap.activate = activate;

		return wrap;
	};

	// ---------------------------------------------------------------
	// Sources tab
	// ---------------------------------------------------------------

	function buildSourcesTab(ui, rt, panel)
	{
		var table = document.createElement('table');
		table.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px;';
		panel.appendChild(table);

		var recent = document.createElement('div');
		recent.style.cssText = 'font-family:monospace;font-size:11px;max-height:140px;' +
			'overflow-y:auto;margin-top:8px;white-space:pre-wrap;display:none;';
		panel.appendChild(recent);

		function render()
		{
			table.innerHTML = '';
			var head = document.createElement('tr');

			[mxResources.get('name'), mxResources.get('hmiSourceType'), mxResources.get('hmiState'),
				mxResources.get('hmiReceived'), mxResources.get('hmiErrors'),
				mxResources.get('hmiLastMessage'), mxResources.get('hmiLastError')].forEach(function(t)
			{
				var th = document.createElement('th');
				th.style.cssText = 'text-align:left;padding:2px 6px;border-bottom:1px solid ' +
					'var(--border-color, #ccc);';
				mxUtils.write(th, t);
				head.appendChild(th);
			});
			table.appendChild(head);

			var status = rt.sources.status();

			for (var i = 0; i < status.length; i++)
			{
				(function(s)
				{
					var tr = document.createElement('tr');
					tr.style.cursor = 'pointer';

					function td(text)
					{
						var el = document.createElement('td');
						el.style.cssText = 'padding:2px 6px;';
						mxUtils.write(el, (text == null) ? '' : String(text));
						tr.appendChild(el);
					};

					td(s.name);
					td(s.type);
					td(s.state);
					td(s.received);
					td(s.errors);
					td(s.lastTs ? new Date(s.lastTs).toLocaleTimeString() : '');
					td(s.lastError || '');

					mxEvent.addListener(tr, 'click', function()
					{
						var msgs = rt.sources.recent(s.id) || [];
						recent.style.display = '';
						recent.innerHTML = '';

						for (var j = 0; j < msgs.length; j++)
						{
							var line = document.createElement('div');
							mxUtils.write(line, '[' + new Date(msgs[j].ts).toLocaleTimeString() +
								' ' + msgs[j].dir + '] ' + (msgs[j].topic || '') + ' ' +
								(msgs[j].payload || ''));
							recent.appendChild(line);
						}
					});

					table.appendChild(tr);
				})(status[i]);
			}
		};

		render();
		rt.on('status', render);
	};

	// ---------------------------------------------------------------
	// Rate tab
	// ---------------------------------------------------------------

	function buildRateTab(ui, rt, panel)
	{
		var div = document.createElement('div');
		div.style.fontSize = '12px';
		panel.appendChild(div);

		function render()
		{
			var c = rt.diag.counters;
			div.innerHTML = '';
			[['hmiFrames', c.frames], ['hmiUpdates', c.updates], ['hmiFlushed', c.flushed]]
				.forEach(function(pair)
				{
					var line = document.createElement('div');
					mxUtils.write(line, mxResources.get(pair[0]) + ': ' + pair[1]);
					div.appendChild(line);
				});
		};

		render();
		var timer = window.setInterval(render, 1000);
		panel.hmiCleanup = function()
		{
			window.clearInterval(timer);
		};
	};

	// ---------------------------------------------------------------
	// Log tab
	// ---------------------------------------------------------------

	function buildLogTab(ui, rt, panel)
	{
		var controls = document.createElement('div');
		controls.style.marginBottom = '4px';
		panel.appendChild(controls);

		var levelSelect = Hmi.Editors.select(['all', 'debug', 'info', 'warn', 'error'], 'all');
		controls.appendChild(levelSelect);

		var catInput = Hmi.Editors.textInput('');
		catInput.setAttribute('placeholder', mxResources.get('hmiCategory'));
		catInput.style.marginLeft = '6px';
		controls.appendChild(catInput);

		var list = document.createElement('div');
		list.style.cssText = 'font-family:monospace;font-size:11px;height:220px;' +
			'overflow-y:auto;white-space:pre-wrap;';
		panel.appendChild(list);

		function matches(entry)
		{
			return (levelSelect.value == 'all' || entry.level == levelSelect.value) &&
				(catInput.value == '' || entry.category.indexOf(catInput.value) >= 0);
		};

		function append(entry)
		{
			if (!matches(entry))
			{
				return;
			}

			var line = document.createElement('div');
			line.style.color = (entry.level == 'error') ? '#C62828' :
				(entry.level == 'warn') ? '#EF6C00' : '';
			mxUtils.write(line, '[' + new Date(entry.ts).toLocaleTimeString() + '] ' +
				entry.level + ' [' + entry.category + '] ' + entry.message);
			list.appendChild(line);
			list.scrollTop = list.scrollHeight;
		};

		function renderAll()
		{
			list.innerHTML = '';

			for (var i = 0; i < rt.diag.log.length; i++)
			{
				append(rt.diag.log[i]);
			}
		};

		renderAll();
		mxEvent.addListener(levelSelect, 'change', renderAll);
		mxEvent.addListener(catInput, 'input', renderAll);
		rt.on('log', append);
	};

	// ---------------------------------------------------------------
	// Writes tab
	// ---------------------------------------------------------------

	function buildWritesTab(ui, rt, panel)
	{
		var list = document.createElement('div');
		list.style.cssText = 'font-family:monospace;font-size:11px;height:220px;' +
			'overflow-y:auto;white-space:pre-wrap;';
		panel.appendChild(list);

		function render()
		{
			list.innerHTML = '';
			var audit = (rt.writer != null) ? rt.writer.auditLog || [] : [];

			for (var i = 0; i < audit.length; i++)
			{
				var e = audit[i];
				var line = document.createElement('div');
				mxUtils.write(line, '[' + new Date(e.ts).toLocaleTimeString() + '] ' +
					e.tag + ' = ' + e.value + ' (' + (e.state || '') + ')');
				list.appendChild(line);
			}

			list.scrollTop = list.scrollHeight;
		};

		render();
		rt.on('write', render);
	};

	// ---------------------------------------------------------------
	// Main window
	// ---------------------------------------------------------------

	Diagnostics.show = function(ui)
	{
		var rt = (ui.hmi != null) ? ui.hmi.getRuntime() : null;

		if (rt == null)
		{
			ui.showError(mxResources.get('error'), mxResources.get('hmiNoRuntime'), mxResources.get('ok'));

			return;
		}

		if (ui.hmiDiagnosticsWindow != null)
		{
			ui.hmiDiagnosticsWindow.setVisible(true);

			return;
		}

		var content = tabbed([mxResources.get('hmiSourcesTab'), mxResources.get('hmiRateTab'),
			mxResources.get('hmiLogTab'), mxResources.get('hmiWritesTab')]);
		content.style.cssText = 'padding:8px;box-sizing:border-box;overflow:hidden;';

		buildSourcesTab(ui, rt, content.panels[mxResources.get('hmiSourcesTab')]);
		buildRateTab(ui, rt, content.panels[mxResources.get('hmiRateTab')]);
		buildLogTab(ui, rt, content.panels[mxResources.get('hmiLogTab')]);
		buildWritesTab(ui, rt, content.panels[mxResources.get('hmiWritesTab')]);

		var x = Math.max(0, (document.body.offsetWidth - 480) / 2);
		var wnd = new mxWindow(mxResources.get('hmiDiagnostics'), content, x, 80, 480, 380, true, true);
		wnd.setMaximizable(true);
		wnd.setResizable(true);
		wnd.setClosable(true);
		wnd.setVisible(true);

		wnd.addListener('close', function()
		{
			ui.hmiDiagnosticsWindow = null;
		});

		ui.hmiDiagnosticsWindow = wnd;
	};

	// ---------------------------------------------------------------
	// Hmi.AlarmList
	// ---------------------------------------------------------------

	var AlarmList = {};

	AlarmList.show = function(ui)
	{
		var rt = (ui.hmi != null) ? ui.hmi.getRuntime() : null;

		if (rt == null)
		{
			return;
		}

		if (ui.hmiAlarmListWindow != null)
		{
			ui.hmiAlarmListWindow.setVisible(true);
			ui.hmiAlarmListWindow.hmiRefresh();

			return;
		}

		var div = document.createElement('div');
		div.style.cssText = 'padding:6px;box-sizing:border-box;';

		var ackAllBtn = Hmi.Editors.button(mxResources.get('hmiAcknowledgeAll'), function()
		{
			rt.alarms.ack();
			render();
		});
		div.appendChild(ackAllBtn);

		var list = document.createElement('div');
		list.style.marginTop = '6px';
		div.appendChild(list);

		function render()
		{
			list.innerHTML = '';
			var alarms = rt.alarms.list();

			if (alarms.length == 0)
			{
				var empty = document.createElement('div');
				empty.className = 'geDialogHint';
				mxUtils.write(empty, mxResources.get('hmiNoAlarms'));
				list.appendChild(empty);

				return;
			}

			for (var i = 0; i < alarms.length; i++)
			{
				(function(a)
				{
					var row = document.createElement('div');
					row.style.cssText = 'display:flex;align-items:center;gap:6px;' +
						'padding:3px 0;border-bottom:1px solid var(--border-color, #eee);' +
						'font-size:12px;';

					var badge = document.createElement('span');
					badge.style.cssText = 'display:inline-block;min-width:34px;text-align:center;' +
						'padding:1px 4px;border-radius:3px;color:#fff;font-size:10px;font-weight:bold;' +
						'background:' + (SEVERITY_COLORS[a.severity] || '#C62828') + ';';
					mxUtils.write(badge, SEVERITY_TEXT[a.severity] || 'ALM');
					row.appendChild(badge);

					var text = document.createElement('span');
					text.style.flex = '1';
					mxUtils.write(text, (a.message || a.tag) + ' (' + a.state + ')');
					row.appendChild(text);

					if (a.state != 'active-ack')
					{
						var ackBtn = Hmi.Editors.button(mxResources.get('hmiAcknowledge'), function()
						{
							rt.alarms.ack(a.tag);
							render();
						});
						row.appendChild(ackBtn);
					}

					list.appendChild(row);
				})(alarms[i]);
			}
		};

		render();
		rt.on('alarm', render);

		var x = Math.max(0, document.body.offsetWidth - 380);
		var wnd = new mxWindow(mxResources.get('hmiAlarms'), div, x, 460, 340, 260, true, true);
		wnd.setMaximizable(false);
		wnd.setResizable(true);
		wnd.setClosable(true);
		wnd.setVisible(true);
		wnd.hmiRefresh = render;

		wnd.addListener('close', function()
		{
			ui.hmiAlarmListWindow = null;
		});

		ui.hmiAlarmListWindow = wnd;
	};

	Hmi.Diagnostics = Diagnostics;
	Hmi.AlarmList = AlarmList;
})();
