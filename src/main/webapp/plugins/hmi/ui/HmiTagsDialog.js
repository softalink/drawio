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

	TagsDialog.show = function(ui)
	{
		var graph = ui.editor.graph;
		var cfg = Hmi.Model.getDocConfig(graph);

		var div = document.createElement('div');
		var hd = document.createElement('h3');
		mxUtils.write(hd, mxResources.get('hmiTags'));
		div.appendChild(hd);

		// Doc settings
		var settings = document.createElement('div');
		settings.className = 'geDialogSection';
		div.appendChild(settings);

		var r1 = Hmi.Editors.inlineFields(settings);
		var simSelect = Hmi.Editors.select(['off', 'on', 'only'], cfg.sim || 'off');
		Hmi.Editors.inlineField(r1, mxResources.get('hmiSimMode') + ':', simSelect);
		var scriptsSelect = Hmi.Editors.select(['inherit', 'off'], cfg.scripts || 'inherit');
		Hmi.Editors.inlineField(r1, mxResources.get('hmiScripts') + ':', scriptsSelect);

		var r2 = Hmi.Editors.inlineFields(settings);
		var fitSelect = Hmi.Editors.select(['none', 'page', 'width', 'stretch'],
			cfg.runtime.fit || 'page');
		Hmi.Editors.inlineField(r2, mxResources.get('hmiFit') + ':', fitSelect);
		var navSelect = Hmi.Editors.select(['tabs', 'none'], cfg.runtime.nav || 'tabs');
		Hmi.Editors.inlineField(r2, mxResources.get('hmiNav') + ':', navSelect);

		var r3 = Hmi.Editors.inlineFields(settings);
		var maxRate = Hmi.Editors.numberInput(cfg.runtime.maxRate || 30);
		Hmi.Editors.inlineField(r3, mxResources.get('hmiMaxRate') + ' (Hz):', maxRate);
		var quality = Hmi.Editors.select(['outline', 'none'], cfg.runtime.quality || 'outline');
		Hmi.Editors.inlineField(r3, mxResources.get('hmiQuality') + ':', quality);

		var r4 = Hmi.Editors.inlineFields(settings);
		var panZoom = Hmi.Editors.checkbox(mxResources.get('hmiPanZoom'), cfg.runtime.panZoom !== false);
		r4.appendChild(panZoom);
		var w = Hmi.Editors.numberInput(cfg.runtime.width || '');
		Hmi.Editors.inlineField(r4, mxResources.get('width') + ':', w);
		var h = Hmi.Editors.numberInput(cfg.runtime.height || '');
		Hmi.Editors.inlineField(r4, mxResources.get('height') + ':', h);

		// Toolbar: add / import / export
		var toolbar = document.createElement('div');
		toolbar.style.margin = '10px 0 4px 0';
		div.appendChild(toolbar);

		var addBtn = Hmi.Editors.button(mxResources.get('hmiAddTag'), function()
		{
			editTag(null);
		});
		toolbar.appendChild(addBtn);

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

		// Table
		var tableWrap = document.createElement('div');
		tableWrap.style.cssText = 'max-height:280px;overflow-y:auto;margin-top:4px;';
		div.appendChild(tableWrap);

		var table = document.createElement('table');
		table.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px;';
		tableWrap.appendChild(table);

		var render = function()
		{
			table.innerHTML = '';
			var head = document.createElement('tr');

			['name', 'type', 'unit', 'access', ''].forEach(function(col)
			{
				var th = document.createElement('th');
				th.style.cssText = 'text-align:left;padding:3px 6px;border-bottom:1px solid ' +
					'var(--border-color, #ccc);';
				mxUtils.write(th, col == '' ? '' : mxResources.get(col == 'name' ? 'name' :
					(col == 'type' ? 'hmiTagType' : (col == 'unit' ? 'hmiUnit' : 'hmiAccess'))));
				head.appendChild(th);
			});
			table.appendChild(head);

			for (var i = 0; i < cfg.tags.length; i++)
			{
				(function(index)
				{
					var tag = cfg.tags[index];
					var tr = document.createElement('tr');

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
					delTd.style.padding = '3px 6px';
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

		var errorsDiv = document.createElement('div');
		errorsDiv.className = 'geDialogHint';
		errorsDiv.style.color = '#C62828';
		div.appendChild(errorsDiv);

		var dlg = new CustomDialog(ui, div, function()
		{
			cfg.sim = simSelect.value;
			cfg.scripts = scriptsSelect.value;
			cfg.runtime.fit = fitSelect.value;
			cfg.runtime.nav = navSelect.value;
			cfg.runtime.maxRate = parseInt(maxRate.value, 10) || 30;
			cfg.runtime.quality = quality.value;
			cfg.runtime.panZoom = panZoom.input.checked;
			cfg.runtime.width = w.value ? parseInt(w.value, 10) : undefined;
			cfg.runtime.height = h.value ? parseInt(h.value, 10) : undefined;

			var errors = Hmi.Schema.validate('doc', cfg);

			if (errors.length > 0)
			{
				errorsDiv.textContent = errors.join('; ');

				return;
			}

			ui.hideDialog();
			Hmi.Model.setDocConfig(graph, cfg);
		}, null, mxResources.get('ok'), null, null, null, null, true);
		ui.showDialog(dlg.container, 620, null, true, true);
	};

	// ---------------------------------------------------------------
	// Single tag editor
	// ---------------------------------------------------------------

	TagsDialog.showTagEditor = function(ui, tag, onSave)
	{
		var t = Hmi.Schema.defaults('tag', JSON.parse(JSON.stringify(tag)));

		var div = document.createElement('div');
		var hd = document.createElement('h3');
		mxUtils.write(hd, mxResources.get('hmiEditTag'));
		div.appendChild(hd);

		var section = document.createElement('div');
		section.className = 'geDialogSection';
		div.appendChild(section);

		var r1 = Hmi.Editors.inlineFields(section);
		var nameInput = Hmi.Editors.textInput(t.name);
		Hmi.Editors.inlineField(r1, mxResources.get('name') + ':', nameInput);
		var typeSelect = Hmi.Editors.select(['number', 'integer', 'boolean', 'string', 'object'], t.type);
		Hmi.Editors.inlineField(r1, mxResources.get('hmiTagType') + ':', typeSelect);

		var r2 = Hmi.Editors.inlineFields(section);
		var unitInput = Hmi.Editors.textInput(t.unit);
		Hmi.Editors.inlineField(r2, mxResources.get('hmiUnit') + ':', unitInput);
		var accessSelect = Hmi.Editors.select(['r', 'rw'], t.access);
		Hmi.Editors.inlineField(r2, mxResources.get('hmiAccess') + ':', accessSelect);

		var r3 = Hmi.Editors.inlineFields(section);
		var minInput = Hmi.Editors.numberInput(t.min);
		Hmi.Editors.inlineField(r3, mxResources.get('hmiMin') + ':', minInput);
		var maxInput = Hmi.Editors.numberInput(t.max);
		Hmi.Editors.inlineField(r3, mxResources.get('hmiMax') + ':', maxInput);
		var decimalsInput = Hmi.Editors.numberInput(t.decimals);
		Hmi.Editors.inlineField(r3, mxResources.get('hmiDecimals') + ':', decimalsInput);

		var r4 = Hmi.Editors.inlineFields(section);
		var initialInput = Hmi.Editors.textInput(t.initial);
		Hmi.Editors.inlineField(r4, mxResources.get('hmiInitial') + ':', initialInput);
		var staleInput = Hmi.Editors.numberInput(t.staleMs);
		Hmi.Editors.inlineField(r4, mxResources.get('hmiStaleMs') + ':', staleInput);
		var localCb = Hmi.Editors.checkbox(mxResources.get('hmiLocal'), !!t.local);
		r4.appendChild(localCb);

		var exprRow = Hmi.Editors.row(section, mxResources.get('hmiExpr') + ':');
		var exprInput = Hmi.Editors.textInput(t.expr);
		exprRow.appendChild(exprInput);

		// Simulation
		var simSection = document.createElement('div');
		simSection.className = 'geDialogSection';
		simSection.style.marginTop = '10px';
		div.appendChild(simSection);
		mxUtils.write(simSection, mxResources.get('hmiSimulation') + ':');
		var simRow = Hmi.Editors.inlineFields(simSection);
		var simKind = Hmi.Editors.select(['', 'random', 'sine', 'ramp', 'list', 'toggle',
			'constant', 'script'], (t.sim && t.sim.kind) || '');
		Hmi.Editors.inlineField(simRow, mxResources.get('hmiSimKind') + ':', simKind);
		var simMin = Hmi.Editors.numberInput(t.sim && t.sim.min);
		Hmi.Editors.inlineField(simRow, mxResources.get('hmiMin') + ':', simMin);
		var simMax = Hmi.Editors.numberInput(t.sim && t.sim.max);
		Hmi.Editors.inlineField(simRow, mxResources.get('hmiMax') + ':', simMax);
		var simRow2 = Hmi.Editors.inlineFields(simSection);
		var simPeriod = Hmi.Editors.numberInput(t.sim && t.sim.period);
		Hmi.Editors.inlineField(simRow2, mxResources.get('hmiSimPeriod') + ' (ms):', simPeriod);
		var simValues = Hmi.Editors.textInput((t.sim && t.sim.values) ? t.sim.values.join(',') : '');
		Hmi.Editors.inlineField(simRow2, mxResources.get('hmiSimValues') + ':', simValues);

		// Write target
		var writeSection = document.createElement('div');
		writeSection.className = 'geDialogSection';
		writeSection.style.marginTop = '10px';
		div.appendChild(writeSection);
		mxUtils.write(writeSection, mxResources.get('hmiWriteTarget') + ':');
		var wRow1 = Hmi.Editors.inlineFields(writeSection);
		var wSource = Hmi.Editors.textInput(t.write && t.write.source);
		Hmi.Editors.inlineField(wRow1, mxResources.get('hmiSourceId') + ':', wSource);
		var wTopic = Hmi.Editors.textInput(t.write && t.write.topic);
		Hmi.Editors.inlineField(wRow1, mxResources.get('hmiTopic') + ':', wTopic);
		var wRow2 = Hmi.Editors.inlineFields(writeSection);
		var wPayload = Hmi.Editors.textInput((t.write && t.write.payload) || '{"value":${value}}');
		Hmi.Editors.inlineField(wRow2, mxResources.get('hmiPayload') + ':', wPayload);
		var wMode = Hmi.Editors.select(['confirmed', 'optimistic'], (t.write && t.write.mode) || 'confirmed');
		Hmi.Editors.inlineField(wRow2, mxResources.get('hmiWriteMode') + ':', wMode);

		// Alarms
		var alarmSection = document.createElement('div');
		alarmSection.className = 'geDialogSection';
		alarmSection.style.marginTop = '10px';
		div.appendChild(alarmSection);
		mxUtils.write(alarmSection, mxResources.get('hmiAlarms') + ':');
		var aRow1 = Hmi.Editors.inlineFields(alarmSection);
		var aHihi = Hmi.Editors.numberInput(t.alarms && t.alarms.hihi);
		Hmi.Editors.inlineField(aRow1, 'HIHI:', aHihi);
		var aHi = Hmi.Editors.numberInput(t.alarms && t.alarms.hi);
		Hmi.Editors.inlineField(aRow1, 'HI:', aHi);
		var aRow2 = Hmi.Editors.inlineFields(alarmSection);
		var aLo = Hmi.Editors.numberInput(t.alarms && t.alarms.lo);
		Hmi.Editors.inlineField(aRow2, 'LO:', aLo);
		var aLolo = Hmi.Editors.numberInput(t.alarms && t.alarms.lolo);
		Hmi.Editors.inlineField(aRow2, 'LOLO:', aLolo);

		var errorsDiv = document.createElement('div');
		errorsDiv.className = 'geDialogHint';
		errorsDiv.style.color = '#C62828';
		div.appendChild(errorsDiv);

		function collect()
		{
			var result = {name: nameInput.value, type: typeSelect.value, unit: unitInput.value,
				access: accessSelect.value, local: localCb.input.checked};

			if (minInput.value !== '') result.min = parseFloat(minInput.value);
			if (maxInput.value !== '') result.max = parseFloat(maxInput.value);
			if (decimalsInput.value !== '') result.decimals = parseInt(decimalsInput.value, 10);
			if (initialInput.value !== '') result.initial = initialInput.value;
			if (staleInput.value !== '') result.staleMs = parseInt(staleInput.value, 10);
			if (exprInput.value !== '') result.expr = exprInput.value;

			if (simKind.value !== '')
			{
				result.sim = {kind: simKind.value};

				if (simMin.value !== '') result.sim.min = parseFloat(simMin.value);
				if (simMax.value !== '') result.sim.max = parseFloat(simMax.value);
				if (simPeriod.value !== '') result.sim.period = parseFloat(simPeriod.value);

				if (simValues.value !== '')
				{
					result.sim.values = simValues.value.split(',').map(function(s)
					{
						return s.replace(/^\s+|\s+$/g, '');
					});
				}
			}

			if (wSource.value !== '' || wTopic.value !== '')
			{
				result.write = {source: wSource.value, topic: wTopic.value,
					payload: wPayload.value, mode: wMode.value};
			}

			var alarms = {};
			var hasAlarm = false;

			['hihi', 'hi', 'lo', 'lolo'].forEach(function(k)
			{
				var input = {hihi: aHihi, hi: aHi, lo: aLo, lolo: aLolo}[k];

				if (input.value !== '')
				{
					alarms[k] = parseFloat(input.value);
					hasAlarm = true;
				}
			});

			if (hasAlarm)
			{
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
		ui.showDialog(dlg.container, 460, null, true, true);
	};

	Hmi.TagsDialog = TagsDialog;
})();
