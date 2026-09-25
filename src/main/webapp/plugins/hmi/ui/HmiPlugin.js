/**
 * HMI plugin installation: hooks, actions, menus, panels and runtime mode.
 */
(function()
{
	var root = (typeof globalThis !== 'undefined') ? globalThis : window;
	var Hmi = root.Hmi = root.Hmi || {};

	var Plugin = {};

	/**
	 * Installs the plugin into the given EditorUi.
	 */
	Plugin.install = function(ui)
	{
		if (ui.hmi != null)
		{
			return;
		}

		var graph = ui.editor.graph;

		// Last installed UI (for the JS API, tests and debugging)
		Hmi.ui = ui;

		if (Hmi.Resources != null)
		{
			Hmi.Resources.install();
		}

		// Core hooks
		Hmi.Overlay.install();
		Hmi.LevelFill.install();
		Hmi.Flow.install();
		Graph.customActionHandler = Hmi.Actions.handleCustomAction;

		graph.hmiOverlay = new Hmi.Overlay(graph);
		Plugin.installDesignResolver(ui);
		ui.hmi = new Hmi.Api(ui);

		// Repaints shapes with hmiLevel or new flow types after installation
		graph.refresh();

		if (urlParams['hmi'] == 'run' || ui.editor.isChromelessView())
		{
			Plugin.installRuntimeMode(ui);
		}
		else
		{
			Plugin.installEditor(ui);
		}

		if (Hmi.Import != null && Hmi.Import.install != null)
		{
			Hmi.Import.install(ui);
		}
	};

	/**
	 * Resolves %tag:Name% at design time to initial values of the catalogue.
	 */
	Plugin.installDesignResolver = function(ui)
	{
		var graph = ui.editor.graph;
		var cache = null;

		graph.model.addListener(mxEvent.CHANGE, function()
		{
			cache = null;
		});

		ui.editor.addListener('pageSelected', function()
		{
			cache = null;
		});

		graph.hmiOverlay.tagDefResolver = function(name)
		{
			if (cache == null)
			{
				cache = {};

				try
				{
					var cfg = Hmi.Model.getEffectiveConfig(ui);

					for (var i = 0; i < cfg.tags.length; i++)
					{
						cache[cfg.tags[i].name] = cfg.tags[i];
					}
				}
				catch (e)
				{
					// ignore
				}
			}

			return cache[name] || null;
		};

		// Restores the design resolver when a runtime stops
		ui.hmiDesignResolver = graph.hmiOverlay.tagDefResolver;
	};

	/**
	 * Returns true if the current page (or file) has HMI content.
	 */
	Plugin.hasHmiContent = function(ui)
	{
		var roots = Hmi.Model.getPageRoots(ui);

		for (var i = 0; i < roots.length; i++)
		{
			if (Hmi.Model.hasDocConfig(roots[i]))
			{
				return true;
			}
		}

		return Object.keys(Hmi.Model.scan(ui.editor.graph).cells).length > 0;
	};

	/**
	 * Shows the safety notice once per browser before the first run (SRS
	 * §6.4), then invokes fn.
	 */
	Plugin.confirmSafety = function(ui, fn)
	{
		var key = '.hmi-safety-ack';
		var acked = false;

		try
		{
			acked = localStorage.getItem(key) == '1';
		}
		catch (e)
		{
			// ignore
		}

		if (acked || Hmi.Runtime.getGlobalConfig().hideSafetyNotice)
		{
			fn();
		}
		else
		{
			ui.confirm(mxResources.get('hmiSafetyNotice'), function()
			{
				try
				{
					localStorage.setItem(key, '1');
				}
				catch (e)
				{
					// ignore
				}

				fn();
			}, null, mxResources.get('ok'), mxResources.get('cancel'));
		}
	};

	/**
	 * HMI-SEC-7: with DRAWIO_CONFIG.hmi.trustedFiles (URL prefixes), runtime
	 * mode starts automatically only for files loaded from those locations
	 * (#U<url>); any other file asks the user before connecting.
	 */
	Plugin.checkTrustedRun = function(ui, fn)
	{
		var trusted = Hmi.Runtime.getGlobalConfig().trustedFiles;

		if (trusted == null)
		{
			fn();

			return;
		}

		var file = ui.getCurrentFile();
		var hash = (file != null && file.getHash != null) ? file.getHash() : '';
		var url = (hash != null && hash.charAt(0) == 'U') ? decodeURIComponent(hash.substring(1)) : null;

		for (var i = 0; url != null && i < trusted.length; i++)
		{
			if (url.substring(0, trusted[i].length) == trusted[i])
			{
				fn();

				return;
			}
		}

		ui.confirm(mxResources.get('hmiUntrustedRun'), fn, null,
			mxResources.get('hmiRun'), mxResources.get('cancel'));
	};

	/**
	 * Returns the URL that opens the current diagram in runtime mode.
	 */
	Plugin.getRunUrl = function(ui)
	{
		var params = ['hmi=run'];
		var keep = ['dev', 'p', 'hmi-connect-src', 'hmi-sim', 'hmi-role', 'lang', 'dark', 'ui'];

		for (var i = 0; i < keep.length; i++)
		{
			if (urlParams[keep[i]] != null)
			{
				params.push(keep[i] + '=' + encodeURIComponent(urlParams[keep[i]]));
			}
		}

		if (ui.currentPage != null)
		{
			params.push('page-id=' + encodeURIComponent(ui.currentPage.getId()));
		}

		var file = ui.getCurrentFile();

		if (file != null && file.getTitle() != null)
		{
			params.push('title=' + encodeURIComponent(file.getTitle()));
		}

		var data = ui.getFileData(true, null, null, null, null, null, null, true, null, false);

		return window.location.pathname + '?' + params.join('&') +
			'#R' + encodeURIComponent(data);
	};

	/**
	 * Editor: actions, menu, format panel, live preview.
	 */
	Plugin.installEditor = function(ui)
	{
		var graph = ui.editor.graph;
		var api = ui.hmi;

		ui.actions.addAction('hmiRun', function()
		{
			// Opens the window synchronously (popup blockers), then confirms
			var url = Plugin.getRunUrl(ui);

			Plugin.confirmSafety(ui, function()
			{
				var wnd = window.open(url, '_blank');

				if (wnd == null)
				{
					ui.showError(mxResources.get('error'), mxResources.get('hmiPopupBlocked'),
						mxResources.get('ok'));
				}
			});
		}, null, null, Editor.ctrlKey + '+Shift+F5');

		var preview = ui.actions.addAction('hmiLivePreview', function()
		{
			if (api.isRunning())
			{
				api.stop();
			}
			else
			{
				Plugin.confirmSafety(ui, function()
				{
					api.run({mode: 'preview', interactive: Plugin.interactivePreview});
					ui.fireEvent(new mxEventObject('hmiPreviewChanged'));
				});
			}

			ui.fireEvent(new mxEventObject('hmiPreviewChanged'));
		}, null, null, 'F5');
		preview.setToggleAction(true);
		preview.setSelectedCallback(function()
		{
			return api.isRunning();
		});

		var interactive = ui.actions.addAction('hmiInteractive', function()
		{
			Plugin.interactivePreview = !Plugin.interactivePreview;
			var rt = api.getRuntime();

			if (rt != null)
			{
				rt.interactive = Plugin.interactivePreview;
			}
		});
		interactive.setToggleAction(true);
		interactive.setSelectedCallback(function()
		{
			return !!Plugin.interactivePreview;
		});

		var simulate = ui.actions.addAction('hmiSimulate', function()
		{
			Plugin.simulatePreview = !Plugin.simulatePreview;

			if (api.isRunning())
			{
				api.run({mode: 'preview', interactive: Plugin.interactivePreview,
					sim: Plugin.simulatePreview ? 'only' : null});
			}
		});
		simulate.setToggleAction(true);
		simulate.setSelectedCallback(function()
		{
			return !!Plugin.simulatePreview;
		});

		api.onStart(function(rt)
		{
			if (rt.mode == 'preview' && Plugin.simulatePreview)
			{
				rt.forceSim = 'only';
			}
		});

		var optional = [
			['hmiSources', 'SourcesDialog'],
			['hmiTags', 'TagsDialog'],
			['hmiTagBrowser', 'TagBrowser'],
			['hmiDiagnostics', 'Diagnostics'],
			['hmiValidate', 'Validator']
		];

		for (var i = 0; i < optional.length; i++)
		{
			(function(name, cls)
			{
				ui.actions.addAction(name + '...', function()
				{
					if (Hmi[cls] != null)
					{
						Hmi[cls].show(ui);
					}
				});
			})(optional[i][0], optional[i][1]);
		}

		ui.actions.addAction('hmiDocs', function()
		{
			ui.openLink('https://github.com/softalink/drawio/blob/claude/confident-gates-rqzs24/docs/hmi/USER_GUIDE.md');
		});

		ui.menus.put('hmi', new Menu(function(menu, parent)
		{
			ui.menus.addMenuItems(menu, ['hmiLivePreview', 'hmiInteractive', 'hmiSimulate',
				'hmiRun', '-', 'hmiSources...', 'hmiTags...', 'hmiTagBrowser...',
				'hmiDiagnostics...', 'hmiValidate...'], parent);

			if (ui.actions.get('hmiImportMeta2d...') != null)
			{
				ui.menus.addMenuItems(menu, ['-', 'hmiImportMeta2d...', 'hmiExportHtml...'], parent);
			}

			ui.menus.addMenuItems(menu, ['-', 'hmiDocs'], parent);
		}));

		var extrasMenu = ui.menus.get('extras');

		if (extrasMenu != null)
		{
			var extrasFunct = extrasMenu.funct;

			extrasMenu.funct = function(menu, parent)
			{
				extrasFunct.apply(this, arguments);
				menu.addSeparator(parent);
				ui.menus.addSubmenu('hmi', menu, parent, mxResources.get('hmi'));
			};
		}

		// Stops live preview when the file changes
		ui.addListener('fileDescriptorChanged', function()
		{
			// ignore
		});

		ui.editor.addListener('resetGraphView', function()
		{
			if (api.isRunning() && api.getRuntime().mode == 'preview')
			{
				api.stop();
			}
		});

		if (Hmi.FormatPanel != null)
		{
			Hmi.FormatPanel.install(ui);
		}

		if (Hmi.TagBrowser != null && Hmi.TagBrowser.installDrop != null)
		{
			Hmi.TagBrowser.installDrop(ui);
		}
	};

	/**
	 * Runtime mode (?hmi=run or lightbox with HMI content).
	 */
	Plugin.installRuntimeMode = function(ui)
	{
		var started = false;

		var start = function()
		{
			if (!started && ui.getCurrentFile() != null)
			{
				if (urlParams['hmi'] != 'run' && !Plugin.hasHmiContent(ui))
				{
					return;
				}

				started = true;

				Plugin.checkTrustedRun(ui, function()
				{
					var rt = ui.hmi.run({mode: 'run', interactive: true});

					if (Hmi.RunChrome != null)
					{
						Hmi.RunChrome.install(ui, rt);
					}
				});

				// Restarts runtime state on file reload (e.g. hmi-reload)
				ui.hmi.onStart(function(rt)
				{
					if (Hmi.RunChrome != null)
					{
						Hmi.RunChrome.attach(ui, rt);
					}
				});
			}
		};

		ui.editor.addListener('fileLoaded', start);

		// File may already be loaded when the plugin is installed
		window.setTimeout(start, 0);

		var reload = parseFloat(urlParams['hmi-reload']);

		if (!isNaN(reload) && reload > 0)
		{
			window.setTimeout(function()
			{
				window.location.reload();
			}, reload * 60000);
		}
	};

	Hmi.Plugin = Plugin;
})();
