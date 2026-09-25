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
		'ui/HmiPlugin.js'
	];

	/**
	 * Base path of the plugin files.
	 */
	Hmi.basePath = (typeof PLUGINS_BASE_PATH !== 'undefined' && PLUGINS_BASE_PATH != '' ?
		PLUGINS_BASE_PATH + '/' : '') + 'plugins/hmi/';

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
					((urlParams != null && urlParams['dev'] == '1') ?
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
