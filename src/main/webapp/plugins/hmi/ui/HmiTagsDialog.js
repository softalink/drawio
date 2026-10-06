/**
 * Hmi.TagsDialog: tag catalogue editor (ARCHITECTURE.md §2.1 TagDef), CSV/
 * JSON import-export (HMI-TAG-6), simulation mode and runtime options.
 *
 * CSV columns (HMI-TAG-6): name,type,unit,min,max,decimals,access,initial,
 * staleMs,simKind,simMin,simMax,simPeriod
 */
(function()
{
	var root = (typeof globalThis !== 'undefined') ? globalThis : window;
	var Hmi = root.Hmi = root.Hmi || {};

	var TagsDialog = {};

	// The settings of a tag that the tag editor has fields for
	var MANAGED = ['name', 'type', 'unit', 'description', 'access', 'local', 'min', 'max',
		'decimals', 'format', 'initial', 'staleMs', 'expr', 'roles', 'sim', 'write', 'alarms'];

	var CSV_COLUMNS = ['name', 'type', 'unit', 'min', 'max', 'decimals', 'access',
		'initial', 'staleMs', 'simKind', 'simMin', 'simMax', 'simPeriod'];

	function tagToCsvRow(tag)
	{
		var sim = tag.sim || {};

		return [tag.name || '', tag.type || 'number', tag.unit || '', tag.min,
			tag.max, tag.decimals, tag.access || 'r', tag.initial, tag.staleMs,
			sim.kind || '', sim.min, sim.max, sim.period].map(function(v)
		{
			var s = (v == null) ? '' : String(v);

			return (s.indexOf(',') >= 0 || s.indexOf('"') >= 0) ?
				'"' + s.replace(/"/g, '""') + '"' : s;
		}).join(',');
	};

	function parseCsv(text)
	{
		var lines = text.split(/\r?\n/).filter(function(l)
		{
			return l.length > 0;
		});
		var rows = [];

		for (var i = 0; i < lines.length; i++)
		{
			var line = lines[i];
			var fields = [];
			var cur = '';
			var inQuotes = false;

			for (var j = 0; j < line.length; j++)
			{
				var ch = line.charAt(j);

				if (inQuotes)
				{
					if (ch == '"')
					{
						if (line.charAt(j + 1) == '"')
						{
							cur += '"';
							j++;
						}
						else
						{
							inQuotes = false;
						}
					}
					else
					{
						cur += ch;
					}
				}
				else if (ch == '"')
				{
					inQuotes = true;
				}
				else if (ch == ',')
				{
					fields.push(cur);
					cur = '';
				}
				else
				{
					cur += ch;
				}
			}

			fields.push(cur);
			rows.push(fields);
		}

		return rows;
	};

	function csvToTags(text)
	{
		var rows = parseCsv(text);

		if (rows.length == 0)
		{
			return [];
		}

		var header = rows[0].map(function(h)
		{
			return h.replace(/^\s+|\s+$/g, '');
		});
		var tags = [];

		for (var i = 1; i < rows.length; i++)
		{
			var row = rows[i];
			var obj = {};

			for (var j = 0; j < header.length; j++)
			{
				obj[header[j]] = row[j];
			}

			if (!obj.name)
			{
				continue;
			}

			var tag = {name: obj.name, type: obj.type || 'number', unit: obj.unit || undefined,
				access: obj.access || 'r'};

			if (obj.min !== '' && obj.min != null) tag.min = parseFloat(obj.min);
			if (obj.max !== '' && obj.max != null) tag.max = parseFloat(obj.max);
			if (obj.decimals !== '' && obj.decimals != null) tag.decimals = parseInt(obj.decimals, 10);
			if (obj.initial !== '' && obj.initial != null) tag.initial = obj.initial;
			if (obj.staleMs !== '' && obj.staleMs != null) tag.staleMs = parseInt(obj.staleMs, 10);

			if (obj.simKind)
			{
				tag.sim = {kind: obj.simKind};

				if (obj.simMin !== '' && obj.simMin != null) tag.sim.min = parseFloat(obj.simMin);
				if (obj.simMax !== '' && obj.simMax != null) tag.sim.max = parseFloat(obj.simMax);
				if (obj.simPeriod !== '' && obj.simPeriod != null) tag.sim.period = parseFloat(obj.simPeriod);
			}

			tags.push(tag);
		}

		return tags;
	};

	function download(filename, text, mime)
	{
		var blob = new Blob([text], {type: mime || 'text/plain'});
		var url = URL.createObjectURL(blob);
		var a = document.createElement('a');
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		window.setTimeout(function()
		{
			URL.revokeObjectURL(url);
		}, 1000);
	};

	function pickFile(accept, onLoad)
	{
		var input = document.createElement('input');
		input.setAttribute('type', 'file');
		input.setAttribute('accept', accept);
		input.style.display = 'none';
		document.body.appendChild(input);

		mxEvent.addListener(input, 'change', function()
		{
			var file = input.files[0];

			if (file != null)
			{
				var reader = new FileReader();

				reader.onload = function()
				{
					onLoad(reader.result);
				};
				reader.readAsText(file);
			}

			document.body.removeChild(input);
		});

		input.click();
	};

	// ---------------------------------------------------------------
	// Main dialog
	// ---------------------------------------------------------------

	/**
	 * Renders the tag catalogue (toolbar, import/export, table) into the
	 * container. The tags are edited in state.cfg.tags (the working copy of
	 * the Screen Settings dialog); state.changed() is called after every
	 * change. Returns {commit, dispose}.
	 */
	TagsDialog.render = function(ui, container, state)
	{
		var cfg = state.cfg;
		var div = container;

		var hint = document.createElement('div');
		hint.className = 'geDialogHint';
		hint.style.marginBottom = '6px';
		mxUtils.write(hint, mxResources.get('hmiScrTagsHint'));
		Hmi.Editors.help(hint, 'tags.dialog');
		div.appendChild(hint);

		// Toolbar: add / import / export
		var toolbar = document.createElement('div');
		toolbar.style.margin = '10px 0 4px 0';
		div.appendChild(toolbar);

		var addBtn = Hmi.Editors.button(mxResources.get('hmiAddTag'), function()
		{
			editTag(null);
		});
		toolbar.appendChild(addBtn);
		Hmi.Editors.help(toolbar, 'tags.add');

		var importCsvBtn = Hmi.Editors.button(mxResources.get('hmiImportCsv'), function()
		{
			pickFile('.csv,text/csv', function(text)
			{
				cfg.tags = cfg.tags.concat(csvToTags(text));
				render();
			});
		});
		toolbar.appendChild(importCsvBtn);

		var exportCsvBtn = Hmi.Editors.button(mxResources.get('hmiExportCsv'), function()
		{
			var lines = [CSV_COLUMNS.join(',')];

			for (var i = 0; i < cfg.tags.length; i++)
			{
				lines.push(tagToCsvRow(cfg.tags[i]));
			}

			download('tags.csv', lines.join('\n'), 'text/csv');
		});
		toolbar.appendChild(exportCsvBtn);

		var importJsonBtn = Hmi.Editors.button(mxResources.get('hmiImportJson'), function()
		{
			pickFile('.json,application/json', function(text)
			{
				try
				{
					var tags = JSON.parse(text);

					if (tags.length != null)
					{
						cfg.tags = cfg.tags.concat(tags);
						render();
					}
				}
				catch (e)
				{
					ui.showError(mxResources.get('error'), e.message);
				}
			});
		});
		toolbar.appendChild(importJsonBtn);

		var exportJsonBtn = Hmi.Editors.button(mxResources.get('hmiExportJson'), function()
		{
			download('tags.json', JSON.stringify(cfg.tags, null, 2), 'application/json');
		});
		toolbar.appendChild(exportJsonBtn);
		Hmi.Editors.help(toolbar, 'tags.exchange');

		// Table
		var listHead = document.createElement('div');
		listHead.className = 'geDialogHint';
		var listCount = document.createElement('span');
		listHead.appendChild(listCount);
		Hmi.Editors.help(listHead, 'tags.list');
		div.appendChild(listHead);

		var tableWrap = document.createElement('div');
		tableWrap.style.cssText = 'max-height:320px;overflow-y:auto;margin-top:4px;';
		div.appendChild(tableWrap);

		var table = document.createElement('table');
		table.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px;';
		tableWrap.appendChild(table);

		var render = function()
		{
			table.innerHTML = '';
			listCount.textContent = mxResources.get('hmiTags') + ': ' + cfg.tags.length;
			var head = document.createElement('tr');

			['name', 'type', 'unit', 'access', ''].forEach(function(col)
			{
				var th = document.createElement('th');
				th.style.cssText = 'text-align:left;padding:3px 6px;border-bottom:1px solid ' +
					'var(--border-color, #ccc);';
				mxUtils.write(th, col == '' ? '' : mxResources.get(col == 'name' ? 'name' :
					(col == 'type' ? 'hmiTagType' : (col == 'unit' ? 'hmiUnit' : 'hmiAccess'))));
				Hmi.Editors.help(th, (col == '') ? null : 'tags.col.' + col);
				head.appendChild(th);
			});
			table.appendChild(head);

			for (var i = 0; i < cfg.tags.length; i++)
			{
				(function(index)
				{
					var tag = cfg.tags[index];
					var tr = document.createElement('tr');
					tr.setAttribute('data-tag', tag.name);

					function td(text)
					{
						var el = document.createElement('td');
						el.style.cssText = 'padding:3px 6px;border-bottom:1px solid ' +
							'var(--border-color, #eee);cursor:pointer;';
						mxUtils.write(el, text || '');
						mxEvent.addListener(el, 'click', function()
						{
							editTag(index);
						});
						tr.appendChild(el);

						return el;
					};

					td(tag.name);
					td(tag.type);
					td(tag.unit);
					td(tag.access);

					var delTd = document.createElement('td');
					delTd.style.cssText = 'padding:3px 6px;border-bottom:1px solid var(--border-color, #eee);';
					var delBtn = Hmi.Editors.button(mxResources.get('delete'), function()
					{
						cfg.tags.splice(index, 1);
						render();
					});
					delTd.appendChild(delBtn);
					tr.appendChild(delTd);

					table.appendChild(tr);
				})(i);
			}

			state.changed();
		};

		var editTag = function(index)
		{
			var tag = (index != null) ? cfg.tags[index] : {name: '', type: 'number', access: 'r'};
			TagsDialog.showTagEditor(ui, tag, function(updated)
			{
				if (index != null)
				{
					cfg.tags[index] = updated;
				}
				else
				{
					cfg.tags.push(updated);
				}

				render();
			});
		};

		render();

		return {commit: function()
		{
			return [];
		}, dispose: function() {}};
	};

	/**
	 * Opens the Screen Settings dialog on the Tags tab.
	 */
	TagsDialog.show = function(ui)
	{
		return Hmi.ScreenSettings.show(ui, {tab: 'tags'});
	};

	// ---------------------------------------------------------------
	// Single tag editor
	// ---------------------------------------------------------------

	TagsDialog.showTagEditor = function(ui, tag, onSave)
	{
		var t = Hmi.Schema.defaults('tag', JSON.parse(JSON.stringify(tag)));
		var E = Hmi.Editors;
		E.installStyle();

		var div = document.createElement('div');
		div.setAttribute('data-dialog', 'tag-editor');
		var hd = document.createElement('h3');
		mxUtils.write(hd, mxResources.get('hmiEditTag'));
		E.help(hd, 'tag.dialog');
		div.appendChild(hd);

		var section = document.createElement('div');
		section.className = 'geDialogSection';
		div.appendChild(section);

		var r1 = E.inlineFields(section);
		var nameInput = E.textInput(t.name);
		E.inlineField(r1, mxResources.get('name') + ':', nameInput, 'tag.name');
		var typeSelect = E.select(['number', 'integer', 'boolean', 'string', 'object'], t.type);
		E.inlineField(r1, mxResources.get('hmiTagType') + ':', typeSelect, 'tag.type');

		var r2 = E.inlineFields(section);
		var unitInput = E.textInput(t.unit);
		E.inlineField(r2, mxResources.get('hmiUnit') + ':', unitInput, 'tag.unit');
		var accessSelect = E.select(['r', 'rw'], t.access);
		E.inlineField(r2, mxResources.get('hmiAccess') + ':', accessSelect, 'tag.access');

		var descRow = E.row(section, mxResources.get('hmiDescription') + ':', 'tag.description');
		var descInput = E.textInput(t.description);
		descRow.appendChild(descInput);

		var r3 = E.inlineFields(section);
		var minInput = E.numberInput(t.min);
		E.inlineField(r3, mxResources.get('hmiMin') + ':', minInput, 'tag.min');
		var maxInput = E.numberInput(t.max);
		E.inlineField(r3, mxResources.get('hmiMax') + ':', maxInput, 'tag.max');

		var r3b = E.inlineFields(section);
		var decimalsInput = E.numberInput(t.decimals);
		E.inlineField(r3b, mxResources.get('hmiDecimals') + ':', decimalsInput, 'tag.decimals');
		var formatInput = E.textInput(t.format, '0.0');
		E.inlineField(r3b, mxResources.get('hmiFormat') + ':', formatInput, 'tag.format');

		var r4 = E.inlineFields(section);
		var initialInput = E.textInput(t.initial);
		E.inlineField(r4, mxResources.get('hmiInitial') + ':', initialInput, 'tag.initial');
		var staleInput = E.numberInput(t.staleMs);
		E.inlineField(r4, mxResources.get('hmiStaleMs') + ':', staleInput, 'tag.staleMs');
		var localCb = E.checkbox(mxResources.get('hmiLocal'), !!t.local, 'tag.local');
		section.appendChild(localCb);

		var exprRow = E.row(section, mxResources.get('hmiExpr') + ':', 'tag.expr');
		var exprInput = E.textInput(t.expr, '(T1 + T2) / 2');
		exprRow.appendChild(exprInput);

		var rolesRow = E.row(section, mxResources.get('hmiRoles') + ':', 'tag.roles');
		var rolesInput = E.textInput((t.roles || []).join(','), 'op,eng');
		rolesRow.appendChild(rolesInput);

		// Simulation: the fields depend on the kind
		var simSection = document.createElement('div');
		simSection.className = 'geDialogSection';
		simSection.style.marginTop = '10px';
		div.appendChild(simSection);
		E.head(simSection, mxResources.get('hmiSimulation') + ':', 'tag.sim');
		var sim = t.sim || {};
		var simRow = E.inlineFields(simSection);
		var simKind = E.select(['', 'random', 'sine', 'ramp', 'list', 'toggle',
			'constant', 'script'], sim.kind || '');
		simKind.style.minWidth = '0';
		E.inlineField(simRow, mxResources.get('hmiSimKind') + ':', simKind, 'tag.sim.kind');
		var simMin = E.numberInput(sim.min);
		var simMinField = E.inlineField(simRow, mxResources.get('hmiMin') + ':', simMin, 'tag.sim.min');
		var simMax = E.numberInput(sim.max);
		var simMaxField = E.inlineField(simRow, mxResources.get('hmiMax') + ':', simMax, 'tag.sim.max');
		var simRow2 = E.inlineFields(simSection);
		var simPeriod = E.numberInput(sim.period);
		var simPeriodField = E.inlineField(simRow2, mxResources.get('hmiSimPeriod') + ' (ms):', simPeriod, 'tag.sim.period');
		var simStep = E.numberInput(sim.step);
		var simStepField = E.inlineField(simRow2, mxResources.get('hmiSimStep') + ':', simStep, 'tag.sim.step');
		var simInterval = E.numberInput(sim.interval);
		var simIntervalField = E.inlineField(simRow2, mxResources.get('hmiSimInterval') + ' (ms):', simInterval, 'tag.sim.interval');
		var simRow3 = E.inlineFields(simSection);
		var simValues = E.textInput((sim.values != null) ? sim.values.join(',') : '', '1,2,3');
		var simValuesField = E.inlineField(simRow3, mxResources.get('hmiSimValues') + ':', simValues, 'tag.sim.values');
		var simInteger = E.checkbox(mxResources.get('hmiSimInteger'), !!sim.integer, 'tag.sim.integer');
		simRow3.appendChild(simInteger);
		var simCodeRow = E.row(simSection, mxResources.get('hmiSimCode') + ':', 'tag.sim.code');
		var simCode = document.createElement('textarea');
		simCode.setAttribute('rows', '3');
		simCode.value = sim.code || '';
		simCodeRow.appendChild(simCode);

		// Fields that apply to each kind
		var SIM_FIELDS = {random: ['min', 'max', 'interval', 'integer'],
			sine: ['min', 'max', 'period', 'interval'], ramp: ['min', 'max', 'step', 'interval'],
			list: ['values', 'interval'], toggle: ['interval'], constant: ['values'],
			script: ['code', 'interval']};

		function syncSim()
		{
			var used = SIM_FIELDS[simKind.value] || [];

			function show(el, name)
			{
				el.style.display = (used.indexOf(name) >= 0) ? '' : 'none';
			};

			show(simMinField, 'min');
			show(simMaxField, 'max');
			show(simPeriodField, 'period');
			show(simStepField, 'step');
			show(simIntervalField, 'interval');
			show(simValuesField, 'values');
			show(simInteger, 'integer');
			show(simCodeRow, 'code');
			simRow2.style.display = (used.indexOf('period') >= 0 || used.indexOf('step') >= 0 ||
				used.indexOf('interval') >= 0) ? '' : 'none';
			simRow3.style.display = (used.indexOf('values') >= 0 || used.indexOf('integer') >= 0) ? '' : 'none';
			E.fitDialog(div);
		};

		mxEvent.addListener(simKind, 'change', syncSim);

		// Write target
		var writeSection = document.createElement('div');
		writeSection.className = 'geDialogSection';
		writeSection.style.marginTop = '10px';
		div.appendChild(writeSection);
		E.head(writeSection, mxResources.get('hmiWriteTarget') + ':', 'tag.write');
		var wRow1 = E.inlineFields(writeSection);
		var wSource = E.textInput(t.write && t.write.source);
		E.inlineField(wRow1, mxResources.get('hmiSourceId') + ':', wSource, 'tag.write.source');
		var wTopic = E.textInput(t.write && t.write.topic);
		E.inlineField(wRow1, mxResources.get('hmiTopic') + ':', wTopic, 'tag.write.topic');
		var wRow2 = E.inlineFields(writeSection);
		var wPayload = E.textInput((t.write && t.write.payload) || '{"value":${value}}');
		E.inlineField(wRow2, mxResources.get('hmiPayload') + ':', wPayload, 'tag.write.payload');
		var wMode = E.select(['confirmed', 'optimistic'], (t.write && t.write.mode) || 'confirmed');
		E.inlineField(wRow2, mxResources.get('hmiWriteMode') + ':', wMode, 'tag.write.mode');

		// Alarms
		var alarmSection = document.createElement('div');
		alarmSection.className = 'geDialogSection';
		alarmSection.style.marginTop = '10px';
		div.appendChild(alarmSection);
		E.head(alarmSection, mxResources.get('hmiAlarms') + ':', 'tag.alarms');
		var al = t.alarms || {};
		var dev = (al.deviation != null && typeof al.deviation === 'object') ? al.deviation : al;
		var aRow1 = E.inlineFields(alarmSection);
		var aHihi = E.numberInput(al.hihi);
		E.inlineField(aRow1, 'HIHI:', aHihi, 'tag.alarms.hihi');
		var aHi = E.numberInput(al.hi);
		E.inlineField(aRow1, 'HI:', aHi, 'tag.alarms.hi');
		var aRow2 = E.inlineFields(alarmSection);
		var aLo = E.numberInput(al.lo);
		E.inlineField(aRow2, 'LO:', aLo, 'tag.alarms.lo');
		var aLolo = E.numberInput(al.lolo);
		E.inlineField(aRow2, 'LOLO:', aLolo, 'tag.alarms.lolo');
		var aRow3 = E.inlineFields(alarmSection);
		var aDeadband = E.numberInput(al.deadband || '');
		E.inlineField(aRow3, mxResources.get('hmiAlarmDeadband') + ':', aDeadband, 'tag.alarms.deadband');
		var aBool = E.select([{value: '', label: mxResources.get('none')},
			{value: 'true', label: 'true'}, {value: 'false', label: 'false'}],
			(typeof al.bool === 'boolean') ? String(al.bool) : '');
		E.inlineField(aRow3, mxResources.get('hmiAlarmBool') + ':', aBool, 'tag.alarms.bool');
		var aRow4 = E.inlineFields(alarmSection);
		var aTarget = E.textInput((dev.target != null) ? dev.target : '', '50 / Setpoint');
		E.inlineField(aRow4, mxResources.get('hmiAlarmTarget') + ':', aTarget, 'tag.alarms.target');
		var aMinor = E.numberInput(dev.minorDev);
		E.inlineField(aRow4, mxResources.get('hmiAlarmMinorDev') + ':', aMinor, 'tag.alarms.minorDev');
		var aMajor = E.numberInput(dev.majorDev);
		E.inlineField(aRow4, mxResources.get('hmiAlarmMajorDev') + ':', aMajor, 'tag.alarms.majorDev');
		var aRow5 = E.inlineFields(alarmSection);
		var rocLimit = (al.roc != null && typeof al.roc === 'object') ? al.roc.limit : al.roc;
		var aRoc = E.numberInput(rocLimit);
		E.inlineField(aRow5, mxResources.get('hmiAlarmRoc') + ':', aRoc, 'tag.alarms.roc');

		var errorsDiv = document.createElement('div');
		errorsDiv.className = 'geDialogHint';
		errorsDiv.style.color = '#C62828';
		div.appendChild(errorsDiv);

		function collect()
		{
			// Settings that have no field here (severity, messages, write
			// headers, ...) stay as they are
			var result = {};

			for (var key in t)
			{
				if (MANAGED.indexOf(key) < 0)
				{
					result[key] = t[key];
				}
			}

			result.name = nameInput.value;
			result.type = typeSelect.value;
			result.unit = unitInput.value;
			result.access = accessSelect.value;
			result.local = localCb.input.checked;

			if (descInput.value !== '') result.description = descInput.value;
			if (minInput.value !== '') result.min = parseFloat(minInput.value);
			if (maxInput.value !== '') result.max = parseFloat(maxInput.value);
			if (decimalsInput.value !== '') result.decimals = parseInt(decimalsInput.value, 10);
			if (formatInput.value !== '') result.format = formatInput.value;
			if (initialInput.value !== '') result.initial = initialInput.value;
			if (staleInput.value !== '') result.staleMs = parseInt(staleInput.value, 10);
			if (exprInput.value !== '') result.expr = exprInput.value;

			result.roles = rolesInput.value.split(',').map(function(s)
			{
				return s.replace(/^\s+|\s+$/g, '');
			}).filter(function(s)
			{
				return s.length > 0;
			});

			if (simKind.value !== '')
			{
				var used = SIM_FIELDS[simKind.value] || [];
				result.sim = {kind: simKind.value};

				if (used.indexOf('min') >= 0 && simMin.value !== '') result.sim.min = parseFloat(simMin.value);
				if (used.indexOf('max') >= 0 && simMax.value !== '') result.sim.max = parseFloat(simMax.value);
				if (used.indexOf('period') >= 0 && simPeriod.value !== '') result.sim.period = parseFloat(simPeriod.value);
				if (used.indexOf('step') >= 0 && simStep.value !== '') result.sim.step = parseFloat(simStep.value);
				if (used.indexOf('interval') >= 0 && simInterval.value !== '') result.sim.interval = parseFloat(simInterval.value);
				if (used.indexOf('integer') >= 0 && simInteger.input.checked) result.sim.integer = true;
				if (used.indexOf('code') >= 0 && simCode.value !== '') result.sim.code = simCode.value;

				if (used.indexOf('values') >= 0 && simValues.value !== '')
				{
					result.sim.values = simValues.value.split(',').map(function(s)
					{
						s = s.replace(/^\s+|\s+$/g, '');

						// Numbers stay numbers, true and false stay booleans
						return (s !== '' && !isNaN(Number(s))) ? Number(s) :
							(s == 'true') ? true : (s == 'false') ? false : s;
					});
				}
			}

			if (wSource.value !== '' || wTopic.value !== '')
			{
				result.write = {};

				for (var wk in (t.write || {}))
				{
					result.write[wk] = t.write[wk];
				}

				result.write.source = wSource.value;
				result.write.topic = wTopic.value;
				result.write.payload = wPayload.value;
				result.write.mode = wMode.value;
			}

			var alarms = {};
			var hasAlarm = false;
			var limits = {hihi: aHihi, hi: aHi, lo: aLo, lolo: aLolo, roc: aRoc,
				minorDev: aMinor, majorDev: aMajor};

			for (var lk in limits)
			{
				if (limits[lk].value !== '')
				{
					alarms[lk] = parseFloat(limits[lk].value);
					hasAlarm = true;
				}
			}

			if (aBool.value !== '')
			{
				alarms.bool = (aBool.value == 'true');
				hasAlarm = true;
			}

			if (aTarget.value !== '' && (alarms.minorDev != null || alarms.majorDev != null))
			{
				alarms.target = (aTarget.value.replace(/\s+/g, '') !== '' && !isNaN(Number(aTarget.value))) ?
					Number(aTarget.value) : aTarget.value;
			}
			else
			{
				delete alarms.minorDev;
				delete alarms.majorDev;
			}

			if (hasAlarm)
			{
				if (aDeadband.value !== '')
				{
					alarms.deadband = parseFloat(aDeadband.value);
				}

				if (al.severity != null)
				{
					alarms.severity = al.severity;
				}

				if (al.messages != null)
				{
					alarms.messages = al.messages;
				}

				result.alarms = alarms;
			}

			return result;
		};

		var dlg = new CustomDialog(ui, div, function()
		{
			var result = collect();
			var errors = Hmi.Schema.validate('tag', result);

			if (errors.length > 0)
			{
				errorsDiv.textContent = errors.join('; ');

				return;
			}

			ui.hideDialog();
			onSave(result);
		}, null, mxResources.get('ok'), null, null, null, null, true);
		syncSim();
		ui.showDialog(dlg.container, 520, null, true, true);
	};

	Hmi.TagsDialog = TagsDialog;
})();
