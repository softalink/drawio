/**
 * HMI/SCADA plugin for draw.io. See plugins/hmi/ARCHITECTURE.md and docs/hmi/.
 *
 * Development: loads the module files below in order. Production: the
 * build concatenates the same list into plugins/hmi.min.js, which defines
 * Hmi.bundled before this entry code runs.
 */
(function()
{
	var root = (typeof globalThis !== 'undefined') ? globalThis : window;
	var Hmi = root.Hmi = root.Hmi || {};

	/**
	 * Module load order (relative to plugins/hmi/). Keep in sync with the
	 * hmi target in etc/build/build.xml.
	 */
	Hmi.FILES = [
		'core/HmiExpr.js',
		'core/HmiFormat.js',
		'core/HmiCondition.js',
		'core/HmiTransform.js',
		'core/HmiTagStore.js',
		'core/HmiSimulator.js',
		'core/HmiSchema.js',
		'core/HmiLinks.js',
		'core/HmiQuickScript.js',
		'sources/HmiPayload.js',
		'sources/HmiSourceManager.js',
		'sources/HmiMqttSource.js',
		'sources/HmiWsSource.js',
		'sources/HmiHttpSource.js',
		'sources/HmiSseSource.js',
		'sources/HmiHostSource.js',
		'runtime/HmiScriptHost.js',
		'runtime/HmiModel.js',
		'runtime/HmiOverlay.js',
		'runtime/HmiLevelFill.js',
		'runtime/HmiFlow.js',
		'runtime/HmiBindingEngine.js',
		'runtime/HmiWriter.js',
		'runtime/HmiAlarms.js',
		'runtime/HmiTriggerEngine.js',
		'runtime/HmiActions.js',
		'runtime/HmiAnimator.js',
		'runtime/HmiEventDispatcher.js',
		'runtime/HmiSystem.js',
		'runtime/HmiDomWidgets.js',
		'runtime/HmiKeypad.js',
		'runtime/HmiLinkEngine.js',
		'runtime/HmiRuntime.js',
		'runtime/HmiEmbed.js',
		'ui/HmiResources.js',
		'ui/HmiEditors.js',
		'ui/HmiSourcesDialog.js',
		'ui/HmiTagsDialog.js',
		'ui/HmiTagBrowser.js',
		'ui/HmiDiagnostics.js',
		'ui/HmiFormatPanel.js',
		'ui/HmiRunChrome.js',
		'ui/HmiValidator.js',
		'ui/HmiFaceplate.js',
		'ui/HmiImport.js',
		'ui/HmiLinksDialog.js',
		'ui/HmiSubstituteTags.js',
		'ui/HmiPlugin.js'
	];

	/**
	 * Base path of the plugin files.
	 */
	Hmi.basePath = (typeof PLUGINS_BASE_PATH !== 'undefined' && PLUGINS_BASE_PATH != '' ?
		PLUGINS_BASE_PATH + '/' : '') + 'plugins/hmi/';

	/**
	 * Modules of the lightweight runtime (hmi-run.html and the standalone
	 * viewer): everything except the editor UI. Keep in sync with
	 * VIEWER_EXCLUDE in etc/hmi/update-build-lists.py.
	 */
	Hmi.getViewerFiles = function()
	{
		var files = [];

		for (var i = 0; i < Hmi.FILES.length; i++)
		{
			if (Hmi.FILES[i].substring(0, 3) != 'ui/' ||
				Hmi.VIEWER_UI_FILES.indexOf(Hmi.FILES[i]) >= 0)
			{
				files.push(Hmi.FILES[i]);
			}
		}

		files.push('viewer/HmiViewer.js');

		return files;
	};

	/**
	 * UI modules used by the runtime (status bar, diagnostics, faceplates).
	 */
	Hmi.VIEWER_UI_FILES = ['ui/HmiResources.js', 'ui/HmiDiagnostics.js',
		'ui/HmiRunChrome.js', 'ui/HmiFaceplate.js'];

	/**
	 * Loads the given files (relative to Hmi.basePath) in order.
	 */
	Hmi.loadFiles = function(files, done)
	{
		loadSequential(files, done);
	};

	function loadSequential(files, done)
	{
		var i = 0;

		function next()
		{
			if (i >= files.length)
			{
				done();
			}
			else
			{
				var script = document.createElement('script');
				script.setAttribute('type', 'text/javascript');
				script.setAttribute('src', Hmi.basePath + files[i++] +
					((typeof urlParams !== 'undefined' && urlParams['dev'] == '1') ?
					'?t=' + Date.now() : ''));
				script.onload = next;
				script.onerror = function()
				{
					if (root.console != null)
					{
						console.error('HMI: failed to load ' + script.src);
					}

					next();
				};
				document.getElementsByTagName('head')[0].appendChild(script);
			}
		};

		next();
	};

	// The lightweight runtime (hmi-run.html) loads this file without the app
	if (typeof Draw === 'undefined')
	{
		return;
	}

	Draw.loadPlugin(function(ui)
	{
		function install()
		{
			if (Hmi.Plugin != null)
			{
				Hmi.Plugin.install(ui);
			}
		};

		if (Hmi.bundled)
		{
			install();
		}
		else
		{
			loadSequential(Hmi.FILES, install);
		}
	});
})();
