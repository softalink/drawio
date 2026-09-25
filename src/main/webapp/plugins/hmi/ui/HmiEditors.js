/**
 * Hmi.Editors: shared DOM widgets used by the HMI Format panel and dialogs
 * to build bindings, conditions, actions, transforms and their JSON
 * fallback. Follows docs/dialog-style-guide.md (geDialogFormRow etc.).
 *
 * These helpers are DOM-bound (touch document/mxUtils) and are not part of
 * the DOM-free module set in ARCHITECTURE.md §1.
 */
(function()
{
	var root = (typeof globalThis !== 'undefined') ? globalThis : window;
	var Hmi = root.Hmi = root.Hmi || {};

	var Editors = {};

	// ---------------------------------------------------------------
	// Generic row / field helpers
	// ---------------------------------------------------------------

	Editors.row = function(parent, labelText)
	{
		var row = document.createElement('div');
		row.className = 'geDialogFormRow';

		if (labelText != null)
		{
			var lbl = document.createElement('span');
			lbl.className = 'geDialogFormLabel';
			mxUtils.write(lbl, labelText);
			row.appendChild(lbl);
		}

		if (parent != null)
		{
			parent.appendChild(row);
		}

		return row;
	};

	Editors.inlineFields = function(parent)
	{
		var row = document.createElement('div');
		row.className = 'geDialogInlineFields';

		if (parent != null)
		{
			parent.appendChild(row);
		}

		return row;
	};

	Editors.inlineField = function(parent, labelText, input)
	{
		var field = document.createElement('div');
		field.className = 'geDialogInlineField';

		if (labelText != null)
		{
			// Field labels use the regular label style (hints are for
			// explanatory text only, see docs/dialog-style-guide.md)
			var lbl = document.createElement('span');
			lbl.className = 'geDialogFormLabel';
			lbl.style.minWidth = '0';
			lbl.style.marginRight = '6px';
			mxUtils.write(lbl, labelText);
			field.appendChild(lbl);
		}

		if (input != null)
		{
			field.appendChild(input);
		}

		if (parent != null)
		{
			parent.appendChild(field);
		}

		return field;
	};

	Editors.textInput = function(value, placeholder)
	{
		var input = document.createElement('input');
		input.setAttribute('type', 'text');
		input.value = (value != null) ? value : '';

		if (placeholder != null)
		{
			input.setAttribute('placeholder', placeholder);
		}

		return input;
	};

	Editors.numberInput = function(value, placeholder)
	{
		var input = document.createElement('input');
		input.setAttribute('type', 'number');
		input.value = (value != null) ? value : '';

		if (placeholder != null)
		{
			input.setAttribute('placeholder', placeholder);
		}

		return input;
	};

	Editors.select = function(options, value)
	{
		var sel = document.createElement('select');

		for (var i = 0; i < options.length; i++)
		{
			var opt = (typeof options[i] === 'string') ?
				{value: options[i], label: options[i]} : options[i];
			var el = document.createElement('option');
			el.setAttribute('value', opt.value);
			mxUtils.write(el, opt.label);

			if (opt.value == value)
			{
				el.setAttribute('selected', 'selected');
			}

			sel.appendChild(el);
		}

		return sel;
	};

	Editors.checkbox = function(labelText, checked)
	{
		var row = document.createElement('div');
		row.className = 'geDialogCheckRow';

		var cb = document.createElement('input');
		cb.setAttribute('type', 'checkbox');

		if (checked)
		{
			cb.setAttribute('checked', 'checked');
		}

		row.appendChild(cb);

		var lbl = document.createElement('label');
		mxUtils.write(lbl, labelText);
		row.appendChild(lbl);
		row.input = cb;

		return row;
	};

	Editors.button = function(label, fn, primary)
	{
		var btn = mxUtils.button(label, fn);
		btn.className = 'geBtn' + (primary ? ' gePrimaryBtn' : '');

		return btn;
	};

	// ---------------------------------------------------------------
	// Tag picker with autocomplete
	// ---------------------------------------------------------------

	var datalistSeq = 0;

	/**
	 * Returns the union of catalogue tag names and runtime-seen tag names.
	 */
	Editors.getKnownTags = function(ui)
	{
		var names = {};

		try
		{
			var cfg = Hmi.Model.getEffectiveConfig(ui);

			for (var i = 0; i < cfg.tags.length; i++)
			{
				names[cfg.tags[i].name] = true;
			}
		}
		catch (e)
		{
			// ignore
		}

		try
		{
			var rt = ui.hmi != null ? ui.hmi.getRuntime() : null;

			if (rt != null)
			{
				var seen = rt.tags.names();

				for (var j = 0; j < seen.length; j++)
				{
					names[seen[j]] = true;
				}
			}
		}
		catch (e2)
		{
			// ignore
		}

		return Object.keys(names).sort();
	};

	/**
	 * Returns a text input bound to a <datalist> of known tag names.
	 */
	Editors.tagInput = function(ui, value)
	{
		var input = Editors.textInput(value, mxResources.get('hmiTagName'));
		var id = 'hmiTagList' + (datalistSeq++);
		input.setAttribute('list', id);
		input.setAttribute('autocomplete', 'off');

		var list = document.createElement('datalist');
		list.setAttribute('id', id);
		var names = Editors.getKnownTags(ui);

		for (var i = 0; i < names.length; i++)
		{
			var opt = document.createElement('option');
			opt.setAttribute('value', names[i]);
			list.appendChild(opt);
		}

		var wrap = document.createElement('span');
		wrap.style.display = 'contents';
		wrap.appendChild(input);
		wrap.appendChild(list);
		wrap.getValue = function()
		{
			return input.value;
		};
		wrap.input = input;

		return wrap;
	};

	// ---------------------------------------------------------------
	// Target spec editor: self | {cells, tags, layers, self}
	// ---------------------------------------------------------------

	Editors.targetSpecEditor = function(ui, value)
	{
		var container = document.createElement('div');
		var kind = (value == null || value == 'self') ? 'self' :
			(typeof value === 'string') ? 'cells' : 'spec';

		var modeRow = Editors.row(container, mxResources.get('hmiTarget') + ':');
		var mode = Editors.select([
			{value: 'self', label: mxResources.get('hmiTargetSelf')},
			{value: 'cells', label: mxResources.get('hmiTargetCells')},
			{value: 'tags', label: mxResources.get('hmiTargetTags')},
			{value: 'layers', label: mxResources.get('hmiTargetLayers')}
		], (kind == 'spec') ? 'cells' : kind);
		modeRow.appendChild(mode);

		var cellsVal = '';
		var tagsVal = '';
		var layersVal = '';
		var selfAlso = false;

		if (kind == 'spec')
		{
			cellsVal = (value.cells || []).join(',');
			tagsVal = (value.tags || []).join(',');
			layersVal = (value.layers || []).join(',');
			selfAlso = !!value.self;

			if (cellsVal !== '')
			{
				mode.value = 'cells';
			}
			else if (tagsVal !== '')
			{
				mode.value = 'tags';
			}
			else if (layersVal !== '')
			{
				mode.value = 'layers';
			}
		}

		var detail = Editors.row(container, mxResources.get('hmiTargetValue') + ':');
		var detailInput = Editors.textInput(cellsVal, mxResources.get('hmiTargetCellsHint'));
		detail.appendChild(detailInput);

		var syncDetail = function()
		{
			if (mode.value == 'self')
			{
				detail.style.display = 'none';
			}
			else
			{
				detail.style.display = '';
				detailInput.setAttribute('placeholder', mode.value == 'cells' ?
					mxResources.get('hmiTargetCellsHint') : mode.value == 'tags' ?
					mxResources.get('hmiTargetTagsHint') : mxResources.get('hmiTargetLayersHint'));
			}
		};

		mxEvent.addListener(mode, 'change', syncDetail);
		syncDetail();

		if (mode.value == 'tags')
		{
			detailInput.value = tagsVal;
		}
		else if (mode.value == 'layers')
		{
			detailInput.value = layersVal;
		}

		container.getValue = function()
		{
			if (mode.value == 'self')
			{
				return 'self';
			}

			var parts = detailInput.value.split(',').map(function(s)
			{
				return s.replace(/^\s+|\s+$/g, '');
			}).filter(function(s)
			{
				return s.length > 0;
			});
			var spec = {};

			if (mode.value == 'cells')
			{
				spec.cells = parts;
			}
			else if (mode.value == 'tags')
			{
				spec.tags = parts;
			}
			else if (mode.value == 'layers')
			{
				spec.layers = parts;
			}

			return spec;
		};

		return container;
	};

	// ---------------------------------------------------------------
	// Condition editor: {tag|expr, operator, value, valueTag}
	// ---------------------------------------------------------------

	var OPERATORS = ['==', '!=', '>', '<', '>=', '<=', 'range', '!range',
		'in', '!in', 'changed', 'isBad', 'true'];

	Editors.conditionEditor = function(ui, value)
	{
		value = value || {};
		var container = document.createElement('div');
		container.className = 'geDialogSection';

		var srcRow = Editors.inlineFields(container);
		var useExpr = value.expr != null && value.expr !== '';
		var tagField = Editors.tagInput(ui, useExpr ? '' : (value.tag || ''));
		Editors.inlineField(srcRow, mxResources.get('hmiTag') + ':', tagField);

		var exprInput = Editors.textInput(value.expr || '', 'tag("a")>0');
		Editors.inlineField(srcRow, mxResources.get('hmiExpr') + ':', exprInput);

		var opRow = Editors.inlineFields(container);
		var opSelect = Editors.select(OPERATORS, value.operator || '==');
		Editors.inlineField(opRow, mxResources.get('hmiOperator') + ':', opSelect);

		var valInput = Editors.textInput((value.value != null) ?
			(Array.isArray(value.value) ? value.value.join(',') : value.value) : '');
		Editors.inlineField(opRow, mxResources.get('hmiValue') + ':', valInput);

		var syncOpVisibility = function()
		{
			valInput.parentNode.style.display = (opSelect.value == 'true' ||
				opSelect.value == 'changed' || opSelect.value == 'isBad') ? 'none' : '';
		};
		mxEvent.addListener(opSelect, 'change', syncOpVisibility);
		syncOpVisibility();

		container.getValue = function()
		{
			var cond = {operator: opSelect.value};

			if (exprInput.value !== '')
			{
				cond.expr = exprInput.value;
			}
			else
			{
				cond.tag = tagField.getValue();
			}

			if (valInput.value !== '')
			{
				cond.value = valInput.value;
			}

			return cond;
		};

		return container;
	};

	// ---------------------------------------------------------------
	// Transform editor: scale | map | invert | expr | script
	// ---------------------------------------------------------------

	Editors.transformEditor = function(ui, value)
	{
		var container = document.createElement('div');
		var kindRow = Editors.row(container, mxResources.get('hmiTransform') + ':');
		var kind = Editors.select([
			{value: '', label: mxResources.get('none')},
			{value: 'scale', label: mxResources.get('hmiScale')},
			{value: 'map', label: mxResources.get('hmiMap')},
			{value: 'invert', label: mxResources.get('hmiInvert')},
			{value: 'expr', label: mxResources.get('hmiExpr')},
			{value: 'script', label: mxResources.get('hmiScript')}
		], (value != null) ? value.kind : '');
		kindRow.appendChild(kind);

		var body = document.createElement('div');
		container.appendChild(body);

		var scaleIn = null, scaleOut = null, mapEntries = null, mapDefault = null,
			exprInput = null, scriptArea = null;

		function render()
		{
			body.innerHTML = '';

			if (kind.value == 'scale')
			{
				var r1 = Editors.inlineFields(body);
				scaleIn = [Editors.numberInput((value && value.inMin) || 0),
					Editors.numberInput((value && value.inMax) || 100)];
				Editors.inlineField(r1, mxResources.get('hmiInRange') + ':', scaleIn[0]);
				body.appendChild(scaleIn[1]);
				var r2 = Editors.inlineFields(body);
				scaleOut = [Editors.numberInput((value && value.outMin) || 0),
					Editors.numberInput((value && value.outMax) || 100)];
				Editors.inlineField(r2, mxResources.get('hmiOutRange') + ':', scaleOut[0]);
				body.appendChild(scaleOut[1]);
			}
			else if (kind.value == 'map')
			{
				mapEntries = Editors.textInput(((value && value.entries) || []).map(function(e)
				{
					return e.operator + ':' + e.value + '=' + e.output;
				}).join(';'), '==:1=Running;==:0=Stopped');
				var r = Editors.row(body, mxResources.get('hmiMapEntries') + ':');
				r.appendChild(mapEntries);
				mapDefault = Editors.textInput((value && value.default) || '');
				var r2 = Editors.row(body, mxResources.get('hmiDefault') + ':');
				r2.appendChild(mapDefault);
			}
			else if (kind.value == 'expr')
			{
				exprInput = Editors.textInput((value && value.expr) || '', 'value*1.8+32');
				var r = Editors.row(body, mxResources.get('hmiExpr') + ':');
				r.appendChild(exprInput);
			}
			else if (kind.value == 'script')
			{
				scriptArea = document.createElement('textarea');
				scriptArea.setAttribute('rows', '4');
				scriptArea.value = (value && value.code) || '';
				var r = Editors.row(body, mxResources.get('hmiScript') + ':');
				r.appendChild(scriptArea);
			}
		};

		mxEvent.addListener(kind, 'change', render);
		render();

		container.getValue = function()
		{
			if (kind.value == '')
			{
				return null;
			}

			if (kind.value == 'scale')
			{
				return {kind: 'scale', inMin: parseFloat(scaleIn[0].value) || 0,
					inMax: parseFloat(scaleIn[1].value) || 100,
					outMin: parseFloat(scaleOut[0].value) || 0,
					outMax: parseFloat(scaleOut[1].value) || 100, clamp: true};
			}

			if (kind.value == 'map')
			{
				var entries = mapEntries.value.split(';').map(function(s)
				{
					var m = /^(.*?):(.*)=(.*)$/.exec(s.replace(/^\s+|\s+$/g, ''));

					return (m != null) ? {operator: m[1], value: m[2], output: m[3]} : null;
				}).filter(function(e)
				{
					return e != null;
				});

				return {kind: 'map', entries: entries, 'default': mapDefault.value};
			}

			if (kind.value == 'invert')
			{
				return {kind: 'invert'};
			}

			if (kind.value == 'expr')
			{
				return {kind: 'expr', expr: exprInput.value};
			}

			if (kind.value == 'script')
			{
				return {kind: 'script', code: scriptArea.value};
			}

			return null;
		};

		return container;
	};

	// ---------------------------------------------------------------
	// Action editor: type-specific fields + JSON fallback for advanced use
	// ---------------------------------------------------------------

	var ACTION_TYPES = ['setProps', 'writeTag', 'toggleTag', 'pulseTag', 'navigate',
		'openUrl', 'dialog', 'startAnimation', 'pauseAnimation', 'stopAnimation',
		'emit', 'send', 'notify', 'postMessage', 'script', 'drawioAction',
		'ackAlarms', 'playMedia'];

	Editors.actionEditor = function(ui, value)
	{
		value = value || {type: 'writeTag'};
		var container = document.createElement('div');

		var typeRow = Editors.row(container, mxResources.get('hmiActionType') + ':');
		var type = Editors.select(ACTION_TYPES.map(function(t)
		{
			return {value: t, label: mxResources.get('hmiAction_' + t) || t};
		}), value.type);
		typeRow.appendChild(type);

		var delayInput = Editors.numberInput(value.delay || 0);
		Editors.inlineField(typeRow, mxResources.get('hmiDelay') + ' (ms):', delayInput);

		var body = document.createElement('div');
		container.appendChild(body);
		var fields = {};

		function field(labelKey, input)
		{
			var r = Editors.row(body, mxResources.get(labelKey) + ':');
			r.appendChild(input);

			return input;
		};

		function render()
		{
			body.innerHTML = '';
			fields = {};
			var t = type.value;

			if (t == 'writeTag' || t == 'toggleTag')
			{
				fields.tag = field('hmiTag', Editors.tagInput(ui, value.tag).input);
			}

			if (t == 'writeTag')
			{
				fields.value = field('hmiValue', Editors.textInput(value.value));
				fields.expr = field('hmiExpr', Editors.textInput(value.expr));
			}

			if (t == 'pulseTag')
			{
				fields.tag = field('hmiTag', Editors.tagInput(ui, value.tag).input);
				fields.value = field('hmiValue', Editors.textInput((value.value != null) ? value.value : 1));
				fields.reset = field('hmiReset', Editors.textInput((value.reset != null) ? value.reset : 0));
				fields.ms = field('hmiDuration', Editors.numberInput(value.ms || 500));
			}

			if (t == 'navigate' || t == 'openUrl' || t == 'dialog')
			{
				fields.page = field('hmiPage', Editors.textInput(value.page));
				fields.url = field('hmiUrl', Editors.textInput(value.url));
			}

			if (t == 'dialog')
			{
				fields.title = field('hmiDialogTitle', Editors.textInput(value.title));
				var wh = Editors.inlineFields(body);
				fields.width = Editors.numberInput(value.width || 480);
				fields.height = Editors.numberInput(value.height || 360);
				Editors.inlineField(wh, mxResources.get('width') + ':', fields.width);
				Editors.inlineField(wh, mxResources.get('height') + ':', fields.height);
			}

			if (t == 'startAnimation' || t == 'pauseAnimation' || t == 'stopAnimation')
			{
				var tgt = Editors.targetSpecEditor(ui, value.target);
				body.appendChild(tgt);
				fields.targetEditor = tgt;
				fields.name = field('hmiAnimationName', Editors.textInput(value.name));
			}

			if (t == 'setProps' || t == 'playMedia')
			{
				var tgt2 = Editors.targetSpecEditor(ui, value.target);
				body.appendChild(tgt2);
				fields.targetEditor = tgt2;
			}

			if (t == 'setProps')
			{
				fields.label = field('hmiLabel', Editors.textInput(value.label));
				fields.style = field('hmiStyleJson',
					Editors.textInput(value.style ? JSON.stringify(value.style) : ''));
			}

			if (t == 'playMedia')
			{
				fields.command = field('hmiCommand', Editors.select(['play', 'pause', 'stop'],
					value.command || 'play'));
			}

			if (t == 'emit')
			{
				fields.name = field('hmiEventName', Editors.textInput(value.name));
				fields.payload = field('hmiPayload', Editors.textInput(value.payload));
			}

			if (t == 'send')
			{
				fields.source = field('hmiSourceId', Editors.textInput(value.source));
				fields.topic = field('hmiTopic', Editors.textInput(value.topic));
				fields.payload = field('hmiPayload', Editors.textInput(value.payload));
			}

			if (t == 'notify')
			{
				fields.text = field('hmiText', Editors.textInput(value.text));
				fields.level = field('hmiLevel', Editors.select(['info', 'warn', 'error'], value.level || 'info'));
			}

			if (t == 'postMessage')
			{
				fields.to = field('hmiPostTo', Editors.textInput(value.to || 'parent'));
				fields.data = field('hmiPayload', Editors.textInput(value.data));
			}

			if (t == 'script')
			{
				var area = document.createElement('textarea');
				area.setAttribute('rows', '4');
				area.value = value.code || '';
				var r = Editors.row(body, mxResources.get('hmiScript') + ':');
				r.appendChild(area);
				fields.code = area;
			}

			if (t == 'drawioAction')
			{
				var area2 = document.createElement('textarea');
				area2.setAttribute('rows', '3');
				area2.value = value.action ? JSON.stringify(value.action) : '';
				var r2 = Editors.row(body, mxResources.get('hmiDrawioAction') + ':');
				r2.appendChild(area2);
				fields.action = area2;
			}

			if (t == 'ackAlarms')
			{
				fields.tag = field('hmiTag', Editors.tagInput(ui, value.tag).input);
			}
		};

		mxEvent.addListener(type, 'change', render);
		render();

		container.getValue = function()
		{
			var t = type.value;
			var result = {type: t};
			var delay = parseInt(delayInput.value, 10);

			if (delay > 0)
			{
				result.delay = delay;
			}

			if (fields.targetEditor != null)
			{
				result.target = fields.targetEditor.getValue();
			}

			if (fields.tag != null)
			{
				result.tag = fields.tag.value;
			}

			if (fields.value != null && fields.value.value !== '')
			{
				var v = fields.value.value;
				result.value = (v == 'true') ? true : (v == 'false') ? false :
					(!isNaN(v) && v !== '') ? parseFloat(v) : v;
			}

			if (fields.expr != null && fields.expr.value !== '')
			{
				result.expr = fields.expr.value;
			}

			if (fields.reset != null)
			{
				result.reset = fields.reset.value;
			}

			if (fields.ms != null)
			{
				result.ms = parseInt(fields.ms.value, 10) || 500;
			}

			if (fields.page != null && fields.page.value !== '')
			{
				result.page = fields.page.value;
			}

			if (fields.url != null && fields.url.value !== '')
			{
				result.url = fields.url.value;
			}

			if (fields.title != null && fields.title.value !== '')
			{
				result.title = fields.title.value;
			}

			if (fields.width != null)
			{
				result.width = parseInt(fields.width.value, 10) || undefined;
			}

			if (fields.height != null)
			{
				result.height = parseInt(fields.height.value, 10) || undefined;
			}

			if (fields.name != null)
			{
				result.name = fields.name.value;
			}

			if (fields.label != null && fields.label.value !== '')
			{
				result.label = fields.label.value;
			}

			if (fields.style != null && fields.style.value !== '')
			{
				try
				{
					result.style = JSON.parse(fields.style.value);
				}
				catch (e)
				{
					// ignore invalid JSON, keep the field text only
				}
			}

			if (fields.command != null)
			{
				result.command = fields.command.value;
			}

			if (fields.source != null)
			{
				result.source = fields.source.value;
			}

			if (fields.topic != null)
			{
				result.topic = fields.topic.value;
			}

			if (fields.payload != null)
			{
				result.payload = fields.payload.value;
			}

			if (fields.text != null)
			{
				result.text = fields.text.value;
			}

			if (fields.level != null)
			{
				result.level = fields.level.value;
			}

			if (fields.to != null)
			{
				result.to = fields.to.value;
			}

			if (fields.data != null)
			{
				result.data = fields.data.value;
			}

			if (fields.code != null)
			{
				result.code = fields.code.value;
			}

			if (fields.action != null && fields.action.value !== '')
			{
				try
				{
					result.action = JSON.parse(fields.action.value);
				}
				catch (e)
				{
					// ignore
				}
			}

			return result;
		};

		return container;
	};

	// ---------------------------------------------------------------
	// JSON fallback editor (validated against Hmi.Schema)
	// ---------------------------------------------------------------

	/**
	 * Returns {el, getValue(), errorsEl}. kind is a Hmi.Schema kind (e.g.
	 * 'bindings', 'events', 'triggers', 'animations', 'tag', 'source').
	 */
	Editors.jsonFallback = function(ui, kind, value)
	{
		var container = document.createElement('div');
		var hint = document.createElement('div');
		hint.className = 'geDialogHint';
		mxUtils.write(hint, mxResources.get('hmiJsonFallbackHint'));
		container.appendChild(hint);

		var area = document.createElement('textarea');
		area.setAttribute('rows', '8');
		area.style.width = '100%';
		area.style.boxSizing = 'border-box';
		area.style.fontFamily = 'monospace';
		area.value = JSON.stringify(value, null, 2);
		container.appendChild(area);

		var errors = document.createElement('div');
		errors.className = 'geDialogHint';
		errors.style.color = '#C62828';
		container.appendChild(errors);

		container.validate = function()
		{
			var parsed;

			try
			{
				parsed = JSON.parse(area.value);
			}
			catch (e)
			{
				errors.textContent = mxResources.get('hmiInvalidJson') + ': ' + e.message;

				return null;
			}

			var errs = (Hmi.Schema != null) ? Hmi.Schema.validate(kind, parsed) : [];

			if (errs.length > 0)
			{
				errors.textContent = errs.join('; ');

				return null;
			}

			errors.textContent = '';

			return parsed;
		};

		container.getValue = function()
		{
			return container.validate();
		};

		return container;
	};

	// ---------------------------------------------------------------
	// Generic item dialog: one editor() instance + JSON fallback toggle
	// ---------------------------------------------------------------

	/**
	 * Shows a CustomDialog with a type-specific editor and an "advanced
	 * JSON" toggle backed by Hmi.Schema. opts = {ui, title, kind, value,
	 * buildEditor(ui, value) -> el with getValue(), onSave(value)}.
	 */
	Editors.showItemDialog = function(opts)
	{
		var ui = opts.ui;
		var div = document.createElement('div');

		var hd = document.createElement('h3');
		mxUtils.write(hd, opts.title);
		div.appendChild(hd);

		var section = document.createElement('div');
		section.className = 'geDialogSection';
		div.appendChild(section);

		var editorEl = opts.buildEditor(ui, opts.value);
		section.appendChild(editorEl);

		var advToggle = document.createElement('a');
		advToggle.className = 'geDialogHint';
		advToggle.style.cursor = 'pointer';
		advToggle.style.display = 'inline-block';
		advToggle.style.marginTop = '10px';
		mxUtils.write(advToggle, mxResources.get('hmiShowJson'));
		div.appendChild(advToggle);

		var jsonWrap = document.createElement('div');
		jsonWrap.style.display = 'none';
		jsonWrap.style.marginTop = '8px';
		div.appendChild(jsonWrap);

		var jsonEditor = null;
		var jsonVisible = false;

		mxEvent.addListener(advToggle, 'click', function()
		{
			jsonVisible = !jsonVisible;

			if (jsonVisible)
			{
				var current = editorEl.getValue != null ? editorEl.getValue() : opts.value;
				jsonEditor = Editors.jsonFallback(ui, opts.kind, current || {});
				jsonWrap.innerHTML = '';
				jsonWrap.appendChild(jsonEditor);
				jsonWrap.style.display = '';
				advToggle.textContent = mxResources.get('hmiHideJson');
			}
			else
			{
				jsonWrap.style.display = 'none';
				jsonWrap.innerHTML = '';
				jsonEditor = null;
				advToggle.textContent = mxResources.get('hmiShowJson');
			}
		});

		var dlg = new CustomDialog(ui, div, function()
		{
			var value;

			if (jsonEditor != null)
			{
				value = jsonEditor.getValue();

				if (value == null)
				{
					return mxResources.get('hmiInvalidJson');
				}
			}
			else
			{
				value = editorEl.getValue != null ? editorEl.getValue() : opts.value;
			}

			opts.onSave(value);
		}, null, mxResources.get('ok'), null, null, null, null, null, null, null);

		ui.showDialog(dlg.container, 420, null, true, true);
	};

	/**
	 * Renders a compact, reorderable list of items with add/edit/delete.
	 * opts = {ui, container, items, itemLabel(item), kind, buildEditor,
	 * emptyText, onChange(items)}.
	 */
	Editors.renderItemList = function(opts)
	{
		var container = opts.container;
		container.innerHTML = '';
		var items = opts.items;

		if (items.length == 0)
		{
			var empty = document.createElement('div');
			empty.className = 'geDialogHint';
			mxUtils.write(empty, opts.emptyText);
			container.appendChild(empty);
		}

		for (var i = 0; i < items.length; i++)
		{
			(function(index)
			{
				var row = document.createElement('div');
				row.className = 'geHmiItemRow';
				row.style.cssText = 'display:flex;align-items:center;gap:4px;' +
					'padding:3px 0;border-bottom:1px solid var(--border-color, #e0e0e0);';

				var label = document.createElement('span');
				label.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;' +
					'white-space:nowrap;cursor:pointer;';
				mxUtils.write(label, opts.itemLabel(items[index]));
				mxEvent.addListener(label, 'click', function()
				{
					edit(index);
				});
				row.appendChild(label);

				function iconBtn(title, glyph, fn)
				{
					var btn = document.createElement('a');
					btn.className = 'geButton';
					btn.style.cssText = 'cursor:pointer;padding:0 4px;';
					btn.setAttribute('title', title);
					mxUtils.write(btn, glyph);
					mxEvent.addListener(btn, 'click', fn);
					row.appendChild(btn);

					return btn;
				};

				if (index > 0)
				{
					iconBtn(mxResources.get('hmiMoveUp'), '↑', function()
					{
						var t = items[index - 1];
						items[index - 1] = items[index];
						items[index] = t;
						opts.onChange(items);
					});
				}

				if (index < items.length - 1)
				{
					iconBtn(mxResources.get('hmiMoveDown'), '↓', function()
					{
						var t = items[index + 1];
						items[index + 1] = items[index];
						items[index] = t;
						opts.onChange(items);
					});
				}

				iconBtn(mxResources.get('edit'), '✎', function()
				{
					edit(index);
				});

				iconBtn(mxResources.get('delete'), '✕', function()
				{
					items.splice(index, 1);
					opts.onChange(items);
				});

				container.appendChild(row);

				function edit(idx)
				{
					Editors.showItemDialog({
						ui: opts.ui,
						title: opts.editTitle || mxResources.get('edit'),
						kind: opts.kind,
						value: items[idx],
						buildEditor: opts.buildEditor,
						onSave: function(value)
						{
							items[idx] = value;
							opts.onChange(items);
						}
					});
				};
			})(i);
		}

		var addBtn = Editors.button(mxResources.get('hmiAddItem'), function()
		{
			Editors.showItemDialog({
				ui: opts.ui,
				title: opts.addTitle || mxResources.get('hmiAddItem'),
				kind: opts.kind,
				value: opts.newItem ? opts.newItem() : {},
				buildEditor: opts.buildEditor,
				onSave: function(value)
				{
					items.push(value);
					opts.onChange(items);
				}
			});
		});
		addBtn.style.marginTop = '6px';
		container.appendChild(addBtn);
	};

	Hmi.Editors = Editors;
})();
