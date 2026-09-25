/**
 * Runtime chrome (SRS HMI-RUN-2/3/5/8): status bar with connection state,
 * alarm summary, fullscreen and diagnostics, plus fit modes and kiosk
 * options.
 */
(function()
{
	var root = (typeof globalThis !== 'undefined') ? globalThis : window;
	var Hmi = root.Hmi = root.Hmi || {};

	var RunChrome = {};

	var COLORS = {
		connected: '#2E7D32',
		connecting: '#F9A825',
		disconnected: '#757575',
		error: '#C62828'
	};

	var SEVERITY_COLORS = {1: '#C62828', 2: '#EF6C00', 3: '#F9A825', 4: '#1565C0'};

	RunChrome.install = function(ui, rt)
	{
		if (ui.hmiRunChrome == null)
		{
			ui.hmiRunChrome = RunChrome.create(ui);
		}

		RunChrome.applyOptions(ui, rt);
		RunChrome.attach(ui, rt);
	};

	/**
	 * Creates the status bar.
	 */
	RunChrome.create = function(ui)
	{
		var bar = document.createElement('div');
		bar.className = 'geHmiStatusBar';
		bar.setAttribute('role', 'status');
		bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:28px;z-index:2;' +
			'display:flex;align-items:center;gap:12px;padding:0 10px;box-sizing:border-box;' +
			'font:12px -apple-system,Segoe UI,Helvetica,Arial,sans-serif;' +
			'background:rgba(38,50,56,0.92);color:#ECEFF1;user-select:none;';

		var sources = document.createElement('div');
		sources.style.cssText = 'display:flex;gap:10px;align-items:center;overflow:hidden;' +
			'white-space:nowrap;flex:0 1 auto;';
		bar.appendChild(sources);

		var alarms = document.createElement('div');
		alarms.style.cssText = 'flex:1 1 auto;overflow:hidden;white-space:nowrap;' +
			'text-overflow:ellipsis;cursor:pointer;';
		alarms.setAttribute('title', mxResources.get('hmiAlarms'));
		bar.appendChild(alarms);

		var clock = document.createElement('div');
		clock.style.cssText = 'flex:0 0 auto;opacity:0.8;';
		bar.appendChild(clock);

		function button(label, fn)
		{
			var btn = document.createElement('button');
			btn.setAttribute('type', 'button');
			btn.style.cssText = 'background:transparent;border:1px solid rgba(255,255,255,0.35);' +
				'color:inherit;border-radius:3px;padding:2px 8px;font:inherit;cursor:pointer;';
			mxUtils.write(btn, label);
			mxEvent.addListener(btn, 'click', fn);
			bar.appendChild(btn);

			return btn;
		};

		button(mxResources.get('hmiFullscreen'), function()
		{
			if (document.fullscreenElement != null)
			{
				document.exitFullscreen();
			}
			else if (document.documentElement.requestFullscreen != null)
			{
				document.documentElement.requestFullscreen();
			}
		});

		button(mxResources.get('hmiDiagnostics'), function()
		{
			if (Hmi.Diagnostics != null)
			{
				Hmi.Diagnostics.show(ui);
			}
		});

		if (urlParams['hmi-hide-status'] == '1')
		{
			bar.style.display = 'none';
		}

		document.body.appendChild(bar);

		mxEvent.addListener(alarms, 'click', function()
		{
			if (Hmi.AlarmList != null)
			{
				Hmi.AlarmList.show(ui);
			}
			else if (ui.hmi.getRuntime() != null)
			{
				ui.hmi.getRuntime().alarms.ack();
			}
		});

		// Ctrl+Shift+D opens diagnostics (HMI-RUN-3)
		mxEvent.addListener(document, 'keydown', function(evt)
		{
			if (evt.shiftKey && (evt.ctrlKey || evt.metaKey) && evt.keyCode == 68 &&
				Hmi.Diagnostics != null)
			{
				Hmi.Diagnostics.show(ui);
				mxEvent.consume(evt);
			}
		});

		window.setInterval(function()
		{
			clock.textContent = new Date().toLocaleTimeString();
		}, 1000);

		return {bar: bar, sources: sources, alarms: alarms, clock: clock};
	};

	/**
	 * Updates the chrome from runtime events.
	 */
	RunChrome.attach = function(ui, rt)
	{
		var chrome = ui.hmiRunChrome;

		if (chrome == null)
		{
			return;
		}

		var renderStatus = function(status)
		{
			chrome.sources.innerHTML = '';

			if (status == null || status.length == 0)
			{
				var span = document.createElement('span');
				span.style.opacity = '0.7';
				mxUtils.write(span, (rt.sim == 'only' || rt.sim == 'on') ?
					mxResources.get('hmiSimulate') : mxResources.get('hmiNoSources'));
				chrome.sources.appendChild(span);

				return;
			}

			for (var i = 0; i < status.length; i++)
			{
				var s = status[i];
				var item = document.createElement('span');
				item.style.cssText = 'display:inline-flex;align-items:center;gap:4px;';
				var dot = document.createElement('span');
				dot.style.cssText = 'width:9px;height:9px;border-radius:50%;display:inline-block;' +
					'background:' + (COLORS[s.state] || COLORS.disconnected) + ';';

				// Shape as well as colour (HMI-USA-2)
				if (s.state == 'error')
				{
					dot.style.borderRadius = '1px';
				}

				item.appendChild(dot);
				mxUtils.write(item, s.name + ' ' + mxResources.get('hmi' +
					s.state.charAt(0).toUpperCase() + s.state.substring(1)));
				item.setAttribute('title', (s.lastError != null) ? s.lastError : '');
				chrome.sources.appendChild(item);
			}
		};

		var renderAlarms = function()
		{
			var list = (rt.alarms != null) ? rt.alarms.list() : [];
			chrome.alarms.innerHTML = '';

			if (list.length == 0)
			{
				chrome.bar.style.background = 'rgba(38,50,56,0.92)';

				return;
			}

			var unack = 0;
			var top = null;

			for (var i = 0; i < list.length; i++)
			{
				if (list[i].state != 'active-ack')
				{
					unack++;
				}

				if (top == null || list[i].severity < top.severity)
				{
					top = list[i];
				}
			}

			var badge = document.createElement('span');
			badge.style.cssText = 'display:inline-block;padding:1px 6px;border-radius:3px;' +
				'margin-right:6px;font-weight:bold;background:' +
				(SEVERITY_COLORS[top.severity] || '#C62828') + ';';
			mxUtils.write(badge, '⚠ ' + list.length + ((unack > 0) ? ' (' + unack + ')' : ''));
			chrome.alarms.appendChild(badge);
			mxUtils.write(chrome.alarms, top.message || (top.tag + ' ' + top.level));
		};

		rt.on('status', renderStatus);
		rt.on('alarm', renderAlarms);
		renderStatus(rt.sources.status());
		renderAlarms();
	};

	/**
	 * Applies fit and navigation options (HMI-RUN-5/8).
	 */
	RunChrome.applyOptions = function(ui, rt)
	{
		var graph = ui.editor.graph;
		var fit = urlParams['hmi-fit'] || rt.config.runtime.fit || 'page';
		var nav = (urlParams['hmi-hide-nav'] == '1') ? 'none' : (rt.config.runtime.nav || 'tabs');

		if (nav == 'none' && ui.chromelessToolbar != null)
		{
			ui.chromelessToolbar.style.display = 'none';
		}

		if (rt.config.runtime.panZoom === false)
		{
			graph.panningHandler.useLeftButtonForPanning = false;
			graph.setPanning(false);
			graph.isZoomWheelEvent = function()
			{
				return false;
			};
		}

		var doFit = function()
		{
			var bounds = graph.getGraphBounds();
			var container = graph.container;

			if (bounds.width == 0 || bounds.height == 0 || container == null)
			{
				return;
			}

			var cw = container.clientWidth;
			var ch = container.clientHeight - 28;
			var s = graph.view.scale;
			var bw = bounds.width / s;
			var bh = bounds.height / s;

			if (rt.config.runtime.width > 0 && rt.config.runtime.height > 0)
			{
				bw = rt.config.runtime.width;
				bh = rt.config.runtime.height;
			}

			if (fit == 'none')
			{
				return;
			}
			else if (fit == 'width')
			{
				graph.zoomTo(Math.max(0.05, cw / bw));
			}
			else
			{
				graph.zoomTo(Math.max(0.05, Math.min(cw / bw, ch / bh)));
			}
		};

		if (fit != 'none')
		{
			var fitThread = null;
			mxEvent.addListener(window, 'resize', function()
			{
				if (fitThread != null)
				{
					window.clearTimeout(fitThread);
				}

				fitThread = window.setTimeout(doFit, 150);
			});

			rt.on('page', function()
			{
				window.setTimeout(doFit, 0);
			});
		}
	};

	Hmi.RunChrome = RunChrome;
})();
