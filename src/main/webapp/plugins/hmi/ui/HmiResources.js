/**
 * Default English resources for the HMI plugin. The same keys are listed in
 * resources/dia.txt for translation; mxResources.parse does not overwrite
 * keys that were already loaded from a translated bundle.
 */
(function()
{
	var root = (typeof globalThis !== 'undefined') ? globalThis : window;
	var Hmi = root.Hmi = root.Hmi || {};

	var Resources = {};

	Resources.DEFAULTS = {
		hmi: 'HMI / SCADA',
		hmiRun: 'Run Screen',
		hmiLivePreview: 'Live Preview',
		hmiInteractive: 'Interactive Preview',
		hmiSimulate: 'Simulate Data',
		hmiSources: 'Data Sources',
		hmiTags: 'Tags',
		hmiTagBrowser: 'Tag Browser',
		hmiDiagnostics: 'Diagnostics',
		hmiValidate: 'Validate',
		hmiDocs: 'HMI Help',
		hmiAllowScripts: 'Allow Scripts',
		hmiScriptsPrompt: 'This diagram contains scripts. Allow them to run?',
		hmiEnterValue: 'Enter value',
		hmiConfirmAction: 'Are you sure?',
		hmiConfirmWrite: 'Write {2} to {1}?',
		hmiPopupBlocked: 'The runtime window was blocked. Please allow popups for this site.',
		hmiConnected: 'Connected',
		hmiConnecting: 'Connecting',
		hmiDisconnected: 'Disconnected',
		hmiError: 'Error',
		hmiAlarms: 'Alarms',
		hmiAcknowledge: 'Acknowledge',
		hmiAcknowledgeAll: 'Acknowledge All',
		hmiFullscreen: 'Fullscreen',
		hmiSafetyNotice: 'HMI screens are for supervisory visualization only and must not be used for safety-critical control.',
		hmiNoSources: 'No data sources'
	};

	Resources.install = function()
	{
		var lines = [];

		for (var key in Resources.DEFAULTS)
		{
			if (mxResources.resources[key] == null)
			{
				lines.push(key + '=' + Resources.DEFAULTS[key]);
			}
		}

		mxResources.parse(lines.join('\n'));
	};

	Hmi.Resources = Resources;
})();
