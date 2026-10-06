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

	/**
	 * Appends the quick-help icon of the key (a key or an array of keys, the
	 * first one with a text wins) to the parent (ui/HmiHelp.js). Nothing is
	 * added when no key is given, when the help is not loaded (viewer) or
	 * when the key has no text. Returns the icon or null.
	 */
	Editors.help = function(parent, keys, title)
	{
		return (keys != null && parent != null && Hmi.Help != null) ?
			Hmi.Help.attach(parent, keys, title) : null;
	};

	/**
	 * Section heading (plain text line with an optional help icon) for the
	 * cards of a dialog.
	 */
	Editors.head = function(parent, text, helpKey)
	{
		Editors.installStyle();
		var head = document.createElement('div');
		head.className = 'geHmiSectionHead';
		mxUtils.write(head, text);
		Editors.help(head, helpKey);

		if (parent != null)
		{
			parent.appendChild(head);
		}

		return head;
	};

	/**
	 * Adds the help icon to the title (h3) of a dialog or the title of a
	 * collapsible section of the Format panel ({wrapper, contentDiv}).
	 */
	Editors.titleHelp = function(title, keys)
	{
		if (title != null && title.wrapper != null)
		{
			title = title.wrapper.firstChild;
		}

		return Editors.help(title, keys);
	};

	/**
	 * Wraps a button into a block with the help icon at its right end
	 * (inside the button, so that the button keeps its size). The margins of
	 * the button move to the wrapper. Returns the wrapper.
	 */
	Editors.helpButton = function(btn, helpKey)
	{
		Editors.installStyle();
		var wrap = document.createElement('div');
		wrap.className = 'geHmiBtnWrap';
		wrap.style.marginTop = btn.style.marginTop;
		wrap.style.marginBottom = btn.style.marginBottom;
		btn.style.marginTop = '';
		btn.style.marginBottom = '';
		wrap.appendChild(btn);
		Editors.help(wrap, helpKey);

		return wrap;
	};

	/**
	 * Adds the help icon to the title bar of an mxWindow.
	 */
	Editors.windowHelp = function(wnd, keys)
	{
		var icon = (wnd != null && wnd.title != null) ? Editors.help(wnd.title, keys) : null;

		if (icon != null)
		{
			// The title bar moves the window: the icon only opens the help
			mxEvent.addListener(icon, 'mousedown', function(evt)
			{
				mxEvent.consume(evt);
			});
			icon.style.verticalAlign = 'middle';
		}

		return icon;
	};

	Editors.row = function(parent, labelText, helpKey)
	{
		var row = document.createElement('div');
		row.className = 'geDialogFormRow';

		if (labelText != null)
		{
			var lbl = document.createElement('span');
			lbl.className = 'geDialogFormLabel';
			mxUtils.write(lbl, labelText);

			if (Editors.help(lbl, helpKey) != null)
			{
				// Keeps the fields of the rows aligned: the label and the icon
				lbl.className += ' geHmiHelpLabel';
			}

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

	Editors.inlineField = function(parent, labelText, input, helpKey)
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
			Editors.help(lbl, helpKey);
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

	Editors.checkbox = function(labelText, checked, helpKey)
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
		Editors.help(row, helpKey);
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

		var modeRow = Editors.row(container, mxResources.get('hmiTarget') + ':', 'target.kind');
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

		var detail = Editors.row(container, mxResources.get('hmiTargetValue') + ':', 'target.value');
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
		Editors.inlineField(srcRow, mxResources.get('hmiTag') + ':', tagField, 'condition.tag');

		var exprInput = Editors.textInput(value.expr || '', 'tag("a")>0');
		Editors.inlineField(srcRow, mxResources.get('hmiExpr') + ':', exprInput, 'condition.expr');

		var opRow = Editors.inlineFields(container);
		var opSelect = Editors.select(OPERATORS, value.operator || '==');
		Editors.inlineField(opRow, mxResources.get('hmiOperator') + ':', opSelect, 'condition.operator');

		var valInput = Editors.textInput((value.value != null) ?
			(Array.isArray(value.value) ? value.value.join(',') : value.value) : '');
		Editors.inlineField(opRow, mxResources.get('hmiValue') + ':', valInput, 'condition.value');

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
		var kindRow = Editors.row(container, mxResources.get('hmiTransform') + ':', 'transform.kind');
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
				Editors.inlineField(r1, mxResources.get('hmiInRange') + ':', scaleIn[0], 'transform.in');
				body.appendChild(scaleIn[1]);
				var r2 = Editors.inlineFields(body);
				scaleOut = [Editors.numberInput((value && value.outMin) || 0),
					Editors.numberInput((value && value.outMax) || 100)];
				Editors.inlineField(r2, mxResources.get('hmiOutRange') + ':', scaleOut[0], 'transform.out');
				body.appendChild(scaleOut[1]);
			}
			else if (kind.value == 'map')
			{
				mapEntries = Editors.textInput(((value && value.entries) || []).map(function(e)
				{
					return e.operator + ':' + e.value + '=' + e.output;
				}).join(';'), '==:1=Running;==:0=Stopped');
				var r = Editors.row(body, mxResources.get('hmiMapEntries') + ':', 'transform.entries');
				r.appendChild(mapEntries);
				mapDefault = Editors.textInput((value && value.default) || '');
				var r2 = Editors.row(body, mxResources.get('hmiDefault') + ':', 'transform.default');
				r2.appendChild(mapDefault);
			}
			else if (kind.value == 'expr')
			{
				exprInput = Editors.textInput((value && value.expr) || '', 'value*1.8+32');
				var r = Editors.row(body, mxResources.get('hmiExpr') + ':', 'transform.expr');
				r.appendChild(exprInput);
			}
			else if (kind.value == 'script')
			{
				scriptArea = document.createElement('textarea');
				scriptArea.setAttribute('rows', '4');
				scriptArea.value = (value && value.code) || '';
				var r = Editors.row(body, mxResources.get('hmiScript') + ':', 'transform.script');
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

		var typeRow = Editors.row(container, mxResources.get('hmiActionType') + ':', 'action.type');
		var type = Editors.select(ACTION_TYPES.map(function(t)
		{
			return {value: t, label: mxResources.get('hmiAction_' + t) || t};
		}), value.type);
		typeRow.appendChild(type);

		var delayInput = Editors.numberInput(value.delay || 0);
		Editors.inlineField(typeRow, mxResources.get('hmiDelay') + ' (ms):', delayInput, 'action.delay');

		var body = document.createElement('div');
		container.appendChild(body);
		var fields = {};

		function field(labelKey, input, helpKey)
		{
			var r = Editors.row(body, mxResources.get(labelKey) + ':', helpKey || ('action.' + labelKey.replace(/^hmi(.)/, function(m, c)
			{
				return c.toLowerCase();
			})));
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
				Editors.inlineField(wh, mxResources.get('width') + ':', fields.width, 'action.width');
				Editors.inlineField(wh, mxResources.get('height') + ':', fields.height, 'action.height');
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
				fields.data = field('hmiPayload', Editors.textInput(value.data), 'action.data');
			}

			if (t == 'script')
			{
				var area = document.createElement('textarea');
				area.setAttribute('rows', '4');
				area.value = value.code || '';
				var r = Editors.row(body, mxResources.get('hmiScript') + ':', 'action.script');
				r.appendChild(area);
				fields.code = area;
			}

			if (t == 'drawioAction')
			{
				var area2 = document.createElement('textarea');
				area2.setAttribute('rows', '3');
				area2.value = value.action ? JSON.stringify(value.action) : '';
				var r2 = Editors.row(body, mxResources.get('hmiDrawioAction') + ':', 'action.drawioAction');
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

		if (opts.dialogId != null)
		{
			div.setAttribute('data-dialog', opts.dialogId);
		}

		var hd = document.createElement('h3');
		mxUtils.write(hd, opts.title);
		Editors.help(hd, opts.helpKey);
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
		Editors.help(div, 'item.json');

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
				var invalid = (editorEl.validate != null) ? editorEl.validate() : null;

				if (invalid != null)
				{
					return invalid;
				}

				value = editorEl.getValue != null ? editorEl.getValue() : opts.value;
			}

			opts.onSave(value);
		}, null, mxResources.get('ok'), null, null, null, null, null, null, null);

		ui.showDialog(dlg.container, opts.width || 420, null, true, true);
		Editors.autoFit(div);
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
				row.setAttribute('data-role', 'item');
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

				function iconBtn(title, glyph, fn, role)
				{
					var btn = document.createElement('a');
					btn.setAttribute('data-role', role);
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
					}, 'up');
				}

				if (index < items.length - 1)
				{
					iconBtn(mxResources.get('hmiMoveDown'), '↓', function()
					{
						var t = items[index + 1];
						items[index + 1] = items[index];
						items[index] = t;
						opts.onChange(items);
					}, 'down');
				}

				iconBtn(mxResources.get('edit'), '✎', function()
				{
					edit(index);
				}, 'edit');

				iconBtn(mxResources.get('delete'), '✕', function()
				{
					items.splice(index, 1);
					opts.onChange(items);
				}, 'delete');

				container.appendChild(row);

				function edit(idx)
				{
					Editors.showItemDialog({
						ui: opts.ui,
						title: opts.editTitle || mxResources.get('edit'),
						helpKey: opts.helpKey,
						width: opts.width,
						dialogId: opts.dialogId,
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
				helpKey: opts.helpKey,
				width: opts.width,
				dialogId: opts.dialogId,
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
		addBtn.setAttribute('data-role', 'add');
		container.appendChild(addBtn);
	};

	// ---------------------------------------------------------------
	// Shared style for the animation link dialogs (light/dark via the
	// theme variables of grapheditor.css)
	// ---------------------------------------------------------------

	Editors.installStyle = function()
	{
		if (document.getElementById('geHmiLinksStyle') != null)
		{
			return;
		}

		var style = document.createElement('style');
		style.setAttribute('id', 'geHmiLinksStyle');
		style.textContent =
			// Tabs of the Animation Links dialog
			'.geHmiTabs{display:flex;flex-wrap:wrap;column-gap:6px;margin:0 0 12px 0;' +
				'border-bottom:1px solid light-dark(var(--field-border-color),var(--dark-field-border-color));}' +
			'.geHmiTabWrap{display:flex;align-items:center;margin-bottom:-1px;padding-right:8px;' +
				'border-bottom:2px solid transparent;}' +
			'.geHmiTabWrap.geHmiSel{border-bottom-color:light-dark(var(--focus-color),var(--dark-focus-color));}' +
			'.geHmiTab{display:inline-flex;align-items:baseline;column-gap:5px;margin:0;' +
				'padding:8px 2px 8px 10px;border:0;border-radius:6px 6px 0 0;background:transparent;' +
				'font-size:14px;line-height:normal;cursor:pointer;' +
				'color:light-dark(var(--secondary-text-color),var(--dark-secondary-text-color));}' +
			'.geHmiTab.geHmiTab:hover{background-color:light-dark(var(--soft-hover-color),var(--dark-soft-hover-color));}' +
			'.geHmiTab:focus-visible{outline:2px solid light-dark(var(--focus-color),var(--dark-focus-color));' +
				'outline-offset:-2px;}' +
			'.geHmiTab[aria-selected="true"]{color:light-dark(var(--strong-text-color),var(--dark-strong-text-color));}' +
			'.geHmiTabCount{font-variant-numeric:tabular-nums;' +
				'color:light-dark(var(--faint-text-color),var(--dark-faint-text-color));}' +
			'.geHmiTabCount.geHmiHas{color:light-dark(var(--focus-color),var(--dark-focus-color));}' +
			// Masonry: the column gap equals the vertical gap between the cards
			'.geHmiMasonry{column-width:215px;column-gap:10px;}' +
			'.geHmiMasonry>.geDialogSection{display:block;box-sizing:border-box;width:100%;' +
				'break-inside:avoid;margin:0 0 10px 0;}' +
			'.geHmiLegend{margin-left:12px;}' +
			'.geHmiCard .geDialogInlineField select,.geHmiItemForm .geDialogInlineField select' +
				'{flex:1;min-width:0;max-width:100%;}' +
			'.geHmiItemForm>.geDialogFormRow,.geHmiItemForm>.geDialogInlineFields,' +
				'.geHmiItemForm>.geDialogCheckRow{margin-top:6px;}' +
			'.geHmiItemForm>:first-child{margin-top:0;}' +
			'.geHmiItemForm .geHmiTagWrap input{min-width:80px;}' +
			'.geHmiSectionHead{line-height:normal;}' +
			'.geDialogFormLabel.geHmiHelpLabel{min-width:121px;}' +
			'.geHmiBtnWrap{position:relative;width:fit-content;max-width:100%;}' +
			'.geHmiBtnWrap>.geHmiHelp{position:absolute;right:8px;top:50%;margin:-8px 0 0 0;}' +
			'.geHmiGroupTitle{font-size:13px;font-weight:600;margin-bottom:4px;' +
				'color:light-dark(var(--strong-text-color),var(--dark-strong-text-color));}' +
			'.geHmiSubHead{margin:10px 0 4px 0;line-height:normal;}' +
			'.geDialogSection>.geHmiSubHead:first-child{margin-top:0;}' +
			'.geHmiCard{border:1px solid light-dark(var(--field-border-color),var(--dark-field-border-color));' +
				'background:light-dark(var(--field-color),var(--dark-field-color));border-radius:6px;' +
				'padding:8px;margin-top:6px;}' +
			'.geHmiLinkRow{display:flex;align-items:center;min-height:28px;}' +
			'.geHmiLinkRow label{flex:1;min-width:0;line-height:normal;overflow-wrap:anywhere;}' +
			'.geHmiLinkRow .geBtn{margin:0;padding:0 8px;min-width:30px;height:24px;flex:0 0 auto;}' +
			'.geHmiLinkRow.geHmiOff .geBtn{opacity:0.45;}' +
			'.geHmiLinkRow .geHmiHelp{margin:0 6px 0 4px;}' +
			'.geHmiPick{border:1px solid light-dark(var(--field-border-color),var(--dark-field-border-color));' +
				'background:light-dark(var(--field-color),var(--dark-field-color));border-radius:6px;' +
				'overflow:auto;margin-top:6px;}' +
			'.geHmiPickList{column-width:150px;padding:4px;}' +
			'.geHmiPickRow{cursor:pointer;padding:3px 6px;border-radius:4px;line-height:normal;' +
				'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
			'.geHmiPickRow:hover{background:light-dark(var(--soft-hover-color),var(--dark-soft-hover-color));}' +
			'.geHmiPickRow.geHmiSel{background:light-dark(var(--selected-color),' +
				'color-mix(in srgb,var(--dark-focus-color) 35%,transparent));}' +
			'.geHmiPickTable{width:100%;border-collapse:collapse;font-size:13px;}' +
			'.geHmiPickTable th{text-align:left;padding:4px 6px;position:sticky;top:0;font-weight:600;' +
				'background:light-dark(var(--field-color),var(--dark-field-color));' +
				'border-bottom:1px solid light-dark(var(--field-border-color),var(--dark-field-border-color));}' +
			'.geHmiPickTable td{padding:3px 6px;line-height:normal;}' +
			'.geHmiTable{width:100%;border-collapse:collapse;}' +
			'.geHmiTable th{text-align:left;padding:4px 6px;font-weight:600;' +
				'border-bottom:1px solid light-dark(var(--field-border-color),var(--dark-field-border-color));}' +
			'.geHmiTable td{padding:3px 6px;line-height:normal;vertical-align:middle;}' +
			'.geHmiTable input[type="text"]{width:100%;box-sizing:border-box;}' +
			'.geHmiPickerBtn{flex:0 0 auto;margin:0 !important;padding:0 8px;min-width:30px;height:26px;}' +
			'.geHmiTagWrap{display:flex;flex:1;min-width:0;column-gap:4px;align-items:center;}' +
			'.geHmiTagWrap input{flex:1;min-width:0;}' +
			'.geHmiSwatch{width:26px;height:26px;flex:0 0 auto;box-sizing:border-box;cursor:pointer;' +
				'border-radius:4px;border:1px solid light-dark(var(--strong-border-color),var(--dark-strong-border-color));}' +
			'.geHmiColorWrap{display:flex;flex:1;min-width:0;column-gap:6px;align-items:center;}' +
			'.geHmiColorWrap input[type="text"]{flex:1;min-width:0;}' +
			'.geHmiMono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace !important;' +
				'font-size:12px !important;line-height:1.4 !important;}' +
			'.geHmiError{font-size:12px;color:var(--error-color);}' +
			'.geHmiSummary{display:flex;flex-direction:column;gap:2px;padding:2px 0 6px 0;}' +
			'.geHmiSummary div{font-size:12px;line-height:normal;overflow:hidden;text-overflow:ellipsis;' +
				'white-space:nowrap;color:light-dark(var(--strong-text-color),var(--dark-strong-text-color));}';
		document.getElementsByTagName('head')[0].appendChild(style);
	};

	/**
	 * Re-computes the height of the enclosing dialog after the content grew
	 * or shrank (Dialog measures the height once when it opens, see
	 * EditorUi.addAdvancedSection).
	 */
	Editors.fitDialog = function(el)
	{
		var dlg = (el != null && el.closest != null) ? el.closest('.geDialog') : null;

		if (dlg != null && dlg.firstElementChild != null)
		{
			dlg.style.height = '';
			dlg.style.height = (dlg.firstElementChild.scrollHeight + 48) + 'px';
		}
	};

	/**
	 * Keeps the enclosing dialog as high as the content of el while the
	 * content grows or shrinks (list editors that add rows).
	 */
	Editors.autoFit = function(el)
	{
		if (typeof ResizeObserver !== 'undefined' && el != null)
		{
			var pending = false;
			new ResizeObserver(function()
			{
				if (!pending)
				{
					pending = true;
					window.setTimeout(function()
					{
						pending = false;
						Editors.fitDialog(el);
					}, 0);
				}
			}).observe(el);
		}
	};

	// ---------------------------------------------------------------
	// Tag picker field: text input + "..." button (Tag Browser select
	// mode, double-click on the field does the same)
	// ---------------------------------------------------------------

	/**
	 * Returns a <span class="geHmiTagWrap"> with .input and getValue().
	 * opts.expression inserts the picked tag at the cursor instead of
	 * replacing the text.
	 */
	Editors.tagPicker = function(ui, value, opts)
	{
		opts = opts || {};
		Editors.installStyle();
		var wrap = document.createElement('span');
		wrap.className = 'geHmiTagWrap';
		var tag = Editors.tagInput(ui, value);
		var input = tag.input;

		if (opts.placeholder != null)
		{
			input.setAttribute('placeholder', opts.placeholder);
		}

		wrap.appendChild(tag);

		var open = function()
		{
			if (Hmi.TagBrowser == null || Hmi.TagBrowser.select == null)
			{
				return;
			}

			Hmi.TagBrowser.select(ui, function(name)
			{
				if (opts.expression)
				{
					var start = (input.selectionStart != null) ? input.selectionStart : input.value.length;
					var end = (input.selectionEnd != null) ? input.selectionEnd : start;
					input.value = input.value.substring(0, start) + name + input.value.substring(end);
				}
				else
				{
					input.value = name;
				}

				input.dispatchEvent(new Event('input', {bubbles: true}));
				input.dispatchEvent(new Event('change', {bubbles: true}));
			}, {selected: opts.expression ? null : input.value});
		};

		var btn = Editors.button('…', open);
		btn.className = 'geBtn geHmiPickerBtn';
		btn.setAttribute('title', mxResources.get('hmiSelectTag'));
		wrap.appendChild(btn);
		mxEvent.addListener(input, 'dblclick', open);

		wrap.input = input;
		wrap.getValue = function()
		{
			return input.value;
		};
		wrap.openPicker = open;

		return wrap;
	};

	/**
	 * Returns a <span> with a colour swatch (opens the draw.io colour
	 * dialog) and a hex text field. getValue() returns '#RRGGBB' or ''.
	 */
	Editors.colorInput = function(ui, value)
	{
		Editors.installStyle();
		var wrap = document.createElement('span');
		wrap.className = 'geHmiColorWrap';
		var swatch = document.createElement('div');
		swatch.className = 'geHmiSwatch';
		swatch.setAttribute('title', mxResources.get('hmiPickColor'));
		wrap.appendChild(swatch);
		var input = Editors.textInput(value || '', '#RRGGBB');
		wrap.appendChild(input);

		function normalize(v)
		{
			v = (v == null) ? '' : String(v).replace(/^\s+|\s+$/g, '');

			if (/^[0-9a-f]{6}$/i.test(v))
			{
				v = '#' + v;
			}

			return (/^#[0-9a-f]{6}$/i.test(v)) ? v.toUpperCase() : (v == 'none' ? '' : v);
		};

		function sync()
		{
			var v = normalize(input.value);
			swatch.style.background = (/^#[0-9a-f]{6}$/i.test(v)) ? v :
				'repeating-conic-gradient(#bbb 0% 25%, #fff 0% 50%) 50% / 10px 10px';
		};

		mxEvent.addListener(input, 'input', sync);
		mxEvent.addListener(input, 'change', function()
		{
			input.value = normalize(input.value);
			sync();
		});
		mxEvent.addListener(swatch, 'click', function()
		{
			ui.pickColor(normalize(input.value) || null, function(color)
			{
				input.value = normalize(color);
				sync();
			});
		});

		input.value = normalize(value);
		sync();
		wrap.input = input;
		wrap.getValue = function()
		{
			return normalize(input.value);
		};
		wrap.setValue = function(v)
		{
			input.value = normalize(v);
			sync();
		};

		return wrap;
	};

	Hmi.Editors = Editors;
})();
