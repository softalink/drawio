/**
 * Hmi.SourcesDialog: list/add/edit/delete/enable data sources of the current
 * page's document config (ARCHITECTURE.md §2.1 Source). Also
 * Hmi.CredentialsDialog for the 'prompt' credentials mode (runtime).
 */
(function()
{
	var root = (typeof globalThis !== 'undefined') ? globalThis : window;
	var Hmi = root.Hmi = root.Hmi || {};

	var SourcesDialog = {};

	// The settings that the source editor has fields for
	var MANAGED = ['id', 'name', 'type', 'enabled', 'scope', 'prefix', 'url', 'format', 'parser',
		'preConnect', 'credentials', 'clientId', 'keepalive', 'cleanSession', 'topics',
		'initMessage', 'method', 'interval', 'body', 'events'];

	function newId(prefix)
	{
		return prefix + Math.random().toString(36).substring(2, 8);
	};

	// ---------------------------------------------------------------
	// Main list dialog
	// ---------------------------------------------------------------

	/**
	 * Renders the list of the data sources into the container. The sources
	 * are edited in state.cfg.sources (the working copy of the Screen
	 * Settings dialog); state.changed() is called after every change.
	 * Returns {commit, dispose}.
	 */
	SourcesDialog.render = function(ui, container, state)
	{
		var cfg = state.cfg;
		var E = Hmi.Editors;

		var hint = document.createElement('div');
		hint.className = 'geDialogHint';
		hint.style.marginBottom = '6px';
		mxUtils.write(hint, mxResources.get('hmiScrSourcesHint'));
		E.help(hint, 'sources.dialog');
		container.appendChild(hint);

		var section = document.createElement('div');
		section.className = 'geDialogSection';
		section.setAttribute('data-role', 'sources-list');
		container.appendChild(section);

		var listHead = document.createElement('div');
		listHead.className = 'geDialogHint';
		var listCount = document.createElement('span');
		listHead.appendChild(listCount);
		E.help(listHead, 'sources.list');
		section.appendChild(listHead);

		var listDiv = document.createElement('div');
		section.appendChild(listDiv);

		var render = function()
		{
			listDiv.innerHTML = '';
			listCount.textContent = mxResources.get('hmiSources') + ': ' + cfg.sources.length;

			if (cfg.sources.length == 0)
			{
				var empty = document.createElement('div');
				empty.className = 'geDialogHint';
				mxUtils.write(empty, mxResources.get('hmiNoSources'));
				listDiv.appendChild(empty);
			}
			else
			{
				var head = document.createElement('div');
				head.className = 'geDialogCheckRow geHmiColHead';
				head.style.justifyContent = 'space-between';
				var c1 = document.createElement('span');
				c1.style.cssText = 'width:64px;flex:0 0 64px;';
				mxUtils.write(c1, mxResources.get('hmiScrColEnabled'));
				E.help(c1, 'sources.col.enabled');
				head.appendChild(c1);
				var c2 = document.createElement('span');
				c2.style.cssText = 'flex:1;';
				mxUtils.write(c2, mxResources.get('hmiScrColSource'));
				E.help(c2, 'sources.col.source');
				head.appendChild(c2);
				listDiv.appendChild(head);
			}

			for (var i = 0; i < cfg.sources.length; i++)
			{
				(function(index)
				{
					var src = cfg.sources[index];
					var row = document.createElement('div');
					row.className = 'geDialogCheckRow';
					row.style.justifyContent = 'space-between';
					row.setAttribute('data-source', src.id);

					var enabled = document.createElement('input');
					enabled.setAttribute('type', 'checkbox');

					if (src.enabled !== false)
					{
						enabled.setAttribute('checked', 'checked');
					}

					mxEvent.addListener(enabled, 'change', function()
					{
						src.enabled = enabled.checked;
					});
					var enabledCell = document.createElement('span');
					enabledCell.style.cssText = 'width:64px;flex:0 0 64px;';
					enabledCell.appendChild(enabled);
					row.appendChild(enabledCell);

					var label = document.createElement('span');
					label.style.cssText = 'flex:1;cursor:pointer;';
					mxUtils.write(label, (src.name || src.id) + '  ·  ' + src.type +
						(src.url ? '  ·  ' + src.url : ''));
					mxEvent.addListener(label, 'click', function()
					{
						editSource(index);
					});
					row.appendChild(label);

					var testBtn = E.button(mxResources.get('hmiTestConnection'), function()
					{
						SourcesDialog.testConnection(ui, src);
					});
					testBtn.style.marginLeft = '4px';
					row.appendChild(testBtn);

					var delBtn = E.button(mxResources.get('delete'), function()
					{
						cfg.sources.splice(index, 1);
						render();
					});
					delBtn.style.marginLeft = '4px';
					row.appendChild(delBtn);

					listDiv.appendChild(row);
				})(i);
			}

			state.changed();
		};

		var editSource = function(index)
		{
			SourcesDialog.showEditor(ui, cfg.sources[index], function(updated)
			{
				cfg.sources[index] = updated;
				render();
			});
		};

		var addBtn = E.button(mxResources.get('hmiAddSource'), function()
		{
			SourcesDialog.showEditor(ui, {id: newId('src'), type: 'mqtt', enabled: true}, function(src)
			{
				cfg.sources.push(src);
				render();
			});
		});
		addBtn.style.marginTop = '6px';
		addBtn.setAttribute('data-role', 'add-source');
		var addRow = document.createElement('div');
		addRow.appendChild(addBtn);
		E.help(addRow, 'sources.add');
		section.appendChild(addRow);

		render();

		return {commit: function()
		{
			return [];
		}, dispose: function() {}};
	};

	/**
	 * Opens the Screen Settings dialog on the Data Sources tab.
	 */
	SourcesDialog.show = function(ui)
	{
		return Hmi.ScreenSettings.show(ui, {tab: 'sources'});
	};

	// ---------------------------------------------------------------
	// Add/edit one source
	// ---------------------------------------------------------------

	SourcesDialog.showEditor = function(ui, source, onSave)
	{
		var src = JSON.parse(JSON.stringify(source));
		src = Hmi.Schema.defaults('source', src);

		var div = document.createElement('div');
		var hd = document.createElement('h3');
		mxUtils.write(hd, mxResources.get('hmiEditSource'));
		Hmi.Editors.help(hd, 'source.dialog');
		div.appendChild(hd);

		var section = document.createElement('div');
		section.className = 'geDialogSection';
		div.appendChild(section);

		var r1 = Hmi.Editors.inlineFields(section);
		var nameInput = Hmi.Editors.textInput(src.name || src.id);
		Hmi.Editors.inlineField(r1, mxResources.get('name') + ':', nameInput, 'source.name');
		var typeSelect = Hmi.Editors.select(['mqtt', 'ws', 'http', 'sse', 'host'], src.type);
		Hmi.Editors.inlineField(r1, mxResources.get('hmiSourceType') + ':', typeSelect, 'source.type');

		var r2 = Hmi.Editors.inlineFields(section);
		var scopeSelect = Hmi.Editors.select(['file', 'page'], src.scope || 'file');
		Hmi.Editors.inlineField(r2, mxResources.get('hmiScope') + ':', scopeSelect, 'source.scope');
		var prefixInput = Hmi.Editors.textInput(src.prefix || '');
		Hmi.Editors.inlineField(r2, mxResources.get('hmiPrefix') + ':', prefixInput, 'source.prefix');

		var urlRow = Hmi.Editors.row(section, mxResources.get('hmiUrl') + ':');
		var urlLabel = urlRow.querySelector('.geDialogFormLabel');
		var urlInput = Hmi.Editors.textInput(src.url || '');
		urlRow.appendChild(urlInput);

		var typeBody = document.createElement('div');
		section.appendChild(typeBody);
		var typeFields = {};

		function renderType()
		{
			typeBody.innerHTML = '';
			typeFields = {};
			var t = typeSelect.value;
			urlRow.style.display = (t == 'host') ? 'none' : '';

			// The URL help depends on the protocol
			var oldIcon = urlLabel.querySelector('.geHmiHelp');

			if (oldIcon != null)
			{
				urlLabel.removeChild(oldIcon);
			}

			Hmi.Editors.help(urlLabel, ['source.url.' + t, 'source.url']);
			urlLabel.className = 'geDialogFormLabel geHmiHelpLabel';

			if (t == 'mqtt')
			{
				var r = Hmi.Editors.inlineFields(typeBody);
				typeFields.clientId = Hmi.Editors.textInput(src.clientId || '');
				Hmi.Editors.inlineField(r, mxResources.get('hmiClientId') + ':', typeFields.clientId, 'source.mqtt.clientId');
				typeFields.keepalive = Hmi.Editors.numberInput(src.keepalive || 30);
				Hmi.Editors.inlineField(r, mxResources.get('hmiKeepalive') + ':', typeFields.keepalive, 'source.mqtt.keepalive');

				var topicsRow = Hmi.Editors.row(typeBody, mxResources.get('hmiTopics') + ':', 'source.mqtt.topics');
				typeFields.topics = Hmi.Editors.textInput((src.topics || []).map(function(t2)
				{
					return t2.filter;
				}).join(','), 'plant/+/temp,plant/#');
				topicsRow.appendChild(typeFields.topics);

				var cleanRow = Hmi.Editors.checkbox(mxResources.get('hmiCleanSession'),
					src.cleanSession !== false, 'source.mqtt.cleanSession');
				typeBody.appendChild(cleanRow);
				typeFields.cleanSession = cleanRow.input;
			}
			else if (t == 'ws')
			{
				var r3 = Hmi.Editors.row(typeBody, mxResources.get('hmiInitMessage') + ':', 'source.ws.initMessage');
				typeFields.initMessage = Hmi.Editors.textInput(src.initMessage || '');
				r3.appendChild(typeFields.initMessage);
			}
			else if (t == 'http')
			{
				var r4 = Hmi.Editors.inlineFields(typeBody);
				typeFields.method = Hmi.Editors.select(['GET', 'POST', 'PUT'], src.method || 'GET');
				Hmi.Editors.inlineField(r4, mxResources.get('hmiMethod') + ':', typeFields.method, 'source.http.method');
				typeFields.interval = Hmi.Editors.numberInput(src.interval || 1000);
				Hmi.Editors.inlineField(r4, mxResources.get('hmiPollInterval') + ' (ms):', typeFields.interval, 'source.http.interval');

				var r5 = Hmi.Editors.row(typeBody, mxResources.get('hmiBody') + ':', 'source.http.body');
				typeFields.body = document.createElement('textarea');
				typeFields.body.setAttribute('rows', '2');
				typeFields.body.value = src.body || '';
				r5.appendChild(typeFields.body);
			}
			else if (t == 'sse')
			{
				var r6 = Hmi.Editors.row(typeBody, mxResources.get('hmiEvents') + ':', 'source.sse.events');
				typeFields.events = Hmi.Editors.textInput((src.events || ['message']).join(','));
				r6.appendChild(typeFields.events);
			}
		};

		mxEvent.addListener(typeSelect, 'change', renderType);
		renderType();

		// Format settings
		var fmtSection = document.createElement('div');
		fmtSection.className = 'geDialogSection';
		fmtSection.style.marginTop = '10px';
		div.appendChild(fmtSection);
		Hmi.Editors.head(fmtSection, mxResources.get('hmiFormat') + ':', 'source.format');
		var fmtRow = Hmi.Editors.row(fmtSection);
		var fmtKind = Hmi.Editors.select(['auto', 'flat', 'array', 'topic', 'jsonpath',
			'drawio-update-xml'], (src.format && src.format.kind) || 'auto');
		fmtRow.appendChild(fmtKind);
		var tmplRow = Hmi.Editors.row(fmtSection, mxResources.get('hmiTemplate') + ':', 'source.format.template');
		var tmplInput = Hmi.Editors.textInput((src.format && src.format.template) || '',
			'plant/{tag}');
		tmplRow.appendChild(tmplInput);

		// Parser / preConnect scripts
		var scriptsSection = document.createElement('div');
		scriptsSection.className = 'geDialogSection';
		scriptsSection.style.marginTop = '10px';
		div.appendChild(scriptsSection);
		var scriptsHint = document.createElement('div');
		scriptsHint.className = 'geDialogHint';
		mxUtils.write(scriptsHint, mxResources.get('hmiScriptPolicyHint'));
		Hmi.Editors.help(scriptsHint, 'source.scripts');
		scriptsSection.appendChild(scriptsHint);
		var parserRow = Hmi.Editors.row(scriptsSection, mxResources.get('hmiParserScript') + ':', 'source.parser');
		parserRow.firstChild.style.minWidth = '140px';
		var parserArea = document.createElement('textarea');
		parserArea.setAttribute('rows', '3');
		parserArea.value = src.parser || '';
		parserRow.appendChild(parserArea);
		var preConnectRow = Hmi.Editors.row(scriptsSection, mxResources.get('hmiPreConnectScript') + ':', 'source.preConnect');
		preConnectRow.firstChild.style.minWidth = '140px';
		var preConnectArea = document.createElement('textarea');
		preConnectArea.setAttribute('rows', '3');
		preConnectArea.value = src.preConnect || '';
		preConnectRow.appendChild(preConnectArea);

		// Credentials
		var credSection = document.createElement('div');
		credSection.className = 'geDialogSection';
		credSection.style.marginTop = '10px';
		div.appendChild(credSection);
		var credRow = Hmi.Editors.row(credSection, mxResources.get('hmiCredentialsMode') + ':', 'source.credentials');
		var credMode = Hmi.Editors.select(['none', 'save', 'prompt', 'param'],
			(src.credentials && src.credentials.mode) || 'none');
		credRow.appendChild(credMode);

		var credWarning = document.createElement('div');
		credWarning.className = 'geDialogHint';
		credWarning.style.color = '#C62828';
		mxUtils.write(credWarning, mxResources.get('hmiSaveCredentialsWarning'));
		credSection.appendChild(credWarning);

		var credFieldsDiv = document.createElement('div');
		credSection.appendChild(credFieldsDiv);
		var credFields = {};

		function renderCred()
		{
			credWarning.style.display = (credMode.value == 'save') ? '' : 'none';
			credFieldsDiv.innerHTML = '';
			credFields = {};

			if (credMode.value == 'save')
			{
				var r = Hmi.Editors.inlineFields(credFieldsDiv);
				credFields.username = Hmi.Editors.textInput(
					(src.credentials && src.credentials.username) || '');
				Hmi.Editors.inlineField(r, mxResources.get('hmiUsername') + ':', credFields.username, 'source.credentials.username');
				credFields.password = document.createElement('input');
				credFields.password.setAttribute('type', 'password');
				credFields.password.value = (src.credentials && src.credentials.password) || '';
				credFields.password.style.cssText = 'flex:1;min-width:0;';
				Hmi.Editors.inlineField(r, mxResources.get('hmiPassword') + ':', credFields.password, 'source.credentials.password');
			}
			else if (credMode.value == 'param')
			{
				var r2 = Hmi.Editors.row(credFieldsDiv, mxResources.get('hmiParamName') + ':', 'source.credentials.param');
				credFields.param = Hmi.Editors.textInput(
					(src.credentials && src.credentials.param) || '');
				r2.appendChild(credFields.param);
			}
		};

		mxEvent.addListener(credMode, 'change', renderCred);
		renderCred();

		var errorsDiv = document.createElement('div');
		errorsDiv.className = 'geDialogHint';
		errorsDiv.style.color = '#C62828';
		div.appendChild(errorsDiv);

		function collect()
		{
			// Settings the dialog has no field for (headers, reconnect, protocol
			// version, JSON paths, ...) stay as they are
			var result = {};

			for (var key in src)
			{
				if (MANAGED.indexOf(key) < 0)
				{
					result[key] = src[key];
				}
			}

			result.id = src.id;
			result.name = nameInput.value;
			result.type = typeSelect.value;
			result.enabled = src.enabled !== false;
			result.scope = scopeSelect.value;
			result.prefix = prefixInput.value;
			result.url = urlInput.value;
			result.format = {kind: fmtKind.value, template: tmplInput.value};

			if (src.format != null && src.format.paths != null)
			{
				result.format.paths = src.format.paths;
			}

			result.parser = parserArea.value;
			result.preConnect = preConnectArea.value;
			result.credentials = {mode: credMode.value};

			if (credMode.value == 'save')
			{
				result.credentials.username = credFields.username.value;
				result.credentials.password = credFields.password.value;
			}
			else if (credMode.value == 'param')
			{
				result.credentials.param = credFields.param.value;
			}

			var t = typeSelect.value;

			if (t == 'mqtt')
			{
				result.clientId = typeFields.clientId.value;
				result.keepalive = parseInt(typeFields.keepalive.value, 10) || 30;
				result.cleanSession = typeFields.cleanSession.checked;
				result.topics = typeFields.topics.value.split(',').map(function(s)
				{
					var filter = s.replace(/^\s+|\s+$/g, '');
					var topic = {filter: filter};

					// Keeps the QoS of a topic that was already there
					for (var q = 0; q < (src.topics || []).length; q++)
					{
						if (src.topics[q].filter == filter && src.topics[q].qos != null)
						{
							topic.qos = src.topics[q].qos;
						}
					}

					return topic;
				}).filter(function(t2)
				{
					return t2.filter.length > 0;
				});
			}
			else if (t == 'ws')
			{
				result.initMessage = typeFields.initMessage.value;
			}
			else if (t == 'http')
			{
				result.method = typeFields.method.value;
				result.interval = parseInt(typeFields.interval.value, 10) || 1000;
				result.body = typeFields.body.value;
			}
			else if (t == 'sse')
			{
				result.events = typeFields.events.value.split(',').map(function(s)
				{
					return s.replace(/^\s+|\s+$/g, '');
				}).filter(function(s)
				{
					return s.length > 0;
				});
			}

			return result;
		};

		var dlg = new CustomDialog(ui, div, function()
		{
			var result = collect();
			var errors = Hmi.Schema.validate('source', result);

			if (errors.length > 0)
			{
				errorsDiv.textContent = errors.join('; ');

				return;
			}

			ui.hideDialog();
			onSave(result);
		}, null, mxResources.get('ok'), null, null, null, null, true);
		ui.showDialog(dlg.container, 460, null, true, true);
	};

	// ---------------------------------------------------------------
	// Test connection: temporary SourceManager + TagStore for 5s
	// ---------------------------------------------------------------

	SourcesDialog.testConnection = function(ui, source)
	{
		var div = document.createElement('div');
		var hd = document.createElement('h3');
		mxUtils.write(hd, mxResources.get('hmiTestConnection'));
		Hmi.Editors.help(hd, 'source.test');
		div.appendChild(hd);

		var statusRow = document.createElement('div');
		statusRow.className = 'geDialogHint';
		var status = document.createElement('span');
		mxUtils.write(status, mxResources.get('hmiConnecting'));
		statusRow.appendChild(status);
		Hmi.Editors.help(statusRow, 'source.test.status');
		div.appendChild(statusRow);

		var log = document.createElement('div');
		log.style.cssText = 'font-family:monospace;font-size:11px;max-height:180px;' +
			'overflow-y:auto;margin-top:8px;white-space:pre-wrap;';
		div.appendChild(log);

		var tags = new Hmi.TagStore({log: function() {}});
		var mgr = new Hmi.SourceManager({
			tags: tags,
			log: function(level, category, message)
			{
				var line = document.createElement('div');
				mxUtils.write(line, '[' + level + '] ' + message);
				log.appendChild(line);
			},
			allow: function()
			{
				return true;
			},
			resolve: function(s)
			{
				return s;
			},
			credentials: function()
			{
				return Promise.resolve({});
			}
		});

		mgr.on('status', function(list)
		{
			var s = mgr.status()[0];

			if (s != null)
			{
				status.textContent = mxResources.get('hmi' +
					s.state.charAt(0).toUpperCase() + s.state.substring(1)) +
					' · ' + mxResources.get('hmiReceived') + ': ' + s.received +
					' · ' + mxResources.get('hmiErrors') + ': ' + s.errors;
			}
		});

		var closed = false;

		try
		{
			mgr.configure([source]);
			mgr.start();
		}
		catch (e)
		{
			status.textContent = mxResources.get('hmiError') + ': ' + e.message;
		}

		window.setTimeout(function()
		{
			if (!closed)
			{
				mgr.stop();
			}
		}, 5000);

		var dlg = new CustomDialog(ui, div, null, function()
		{
			closed = true;
			mgr.stop();
		}, mxResources.get('close'), null, null, true);
		ui.showDialog(dlg.container, 420, null, true, true);
	};

	Hmi.SourcesDialog = SourcesDialog;

	// ---------------------------------------------------------------
	// Credentials prompt (runtime, credentials.mode == 'prompt')
	// ---------------------------------------------------------------

	var CredentialsDialog = {};

	CredentialsDialog.show = function(ui, source, callback)
	{
		var div = document.createElement('div');
		var hd = document.createElement('h3');
		mxUtils.write(hd, mxResources.get('hmiCredentialsFor') + ' ' + (source.name || source.id));
		Hmi.Editors.help(hd, 'credentials.dialog');
		div.appendChild(hd);

		var section = document.createElement('div');
		section.className = 'geDialogSection';
		div.appendChild(section);

		var userRow = Hmi.Editors.row(section, mxResources.get('hmiUsername') + ':', 'credentials.username');
		var userInput = Hmi.Editors.textInput('');
		userRow.appendChild(userInput);

		var passRow = Hmi.Editors.row(section, mxResources.get('hmiPassword') + ':', 'credentials.password');
		var passInput = document.createElement('input');
		passInput.setAttribute('type', 'password');
		passRow.appendChild(passInput);

		var tokenRow = Hmi.Editors.row(section, mxResources.get('hmiToken') + ':', 'credentials.token');
		var tokenInput = document.createElement('input');
		tokenInput.setAttribute('type', 'password');
		tokenRow.appendChild(tokenInput);

		var cancelled = true;

		var dlg = new CustomDialog(ui, div, function()
		{
			cancelled = false;
			callback({username: userInput.value, password: passInput.value,
				token: tokenInput.value});
		}, function()
		{
			if (cancelled)
			{
				callback(null);
			}
		}, mxResources.get('ok'));
		ui.showDialog(dlg.container, 340, null, true, true);
		userInput.focus();
	};

	Hmi.CredentialsDialog = CredentialsDialog;
})();
