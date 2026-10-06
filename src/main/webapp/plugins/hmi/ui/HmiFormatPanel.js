/**
 * Hmi.FormatPanel: adds an "HMI" tab to the Format panel (see
 * js/grapheditor/Format.js Format.prototype.immediateRefresh). The tab is
 * appended after the existing tabs are built, without touching Format.js.
 *
 * Nothing selected: page summary (sources, tags, objects with links, page
 * triggers) and the buttons of the page features (Screen Settings, Tag
 * Browser, Substitute Tags, Define Missing Tags, Validate, Live Preview, Run
 * Screen). Objects selected: the configured links of the object (a click
 * opens the Animation Links dialog on that link) and the Animation Links and
 * Tag Browser buttons (INTOUCH_LINKS.md §12.4).
 *
 * The item editors (binding, event, trigger, animation) stay here: the
 * Animation Links dialog reuses them. Edits of an object go through
 * Hmi.Model.setCellConfig (undoable model edits, see ARCHITECTURE.md §4).
 */
(function()
{
	var root = (typeof globalThis !== 'undefined') ? globalThis : window;
	var Hmi = root.Hmi = root.Hmi || {};

	var FormatPanel = {};

	// ---------------------------------------------------------------
	// {name} template substitution for multi-cell quick-add (HMI-BND-9)
	// ---------------------------------------------------------------

	function getCellAttr(cell, name)
	{
		return (cell != null && cell.value != null && typeof cell.value === 'object' &&
			cell.value.getAttribute != null) ? cell.value.getAttribute(name) : null;
	};

	/**
	 * Replaces {attrName} in a string with the cell's attribute value
	 * (falls back to leaving the token as-is when the attribute is unset).
	 */
	FormatPanel.substitute = function(cell, str)
	{
		if (typeof str !== 'string' || str.indexOf('{') < 0)
		{
			return str;
		}

		return str.replace(/\{([^{}]+)\}/g, function(match, name)
		{
			var value = (name == 'id') ? cell.id : getCellAttr(cell, name);

			return (value != null) ? value : match;
		});
	};

	function deepSubstitute(cell, obj)
	{
		if (obj == null)
		{
			return obj;
		}

		if (typeof obj === 'string')
		{
			return FormatPanel.substitute(cell, obj);
		}

		if (Array.isArray(obj))
		{
			var out = [];

			for (var i = 0; i < obj.length; i++)
			{
				out.push(deepSubstitute(cell, obj[i]));
			}

			return out;
		}

		if (typeof obj === 'object')
		{
			var result = {};

			for (var key in obj)
			{
				result[key] = deepSubstitute(cell, obj[key]);
			}

			return result;
		}

		return obj;
	};

	/**
	 * Applies one config list (bindings/events/triggers/animations/roles) to
	 * every selected cell, resolving {attr} templates per cell.
	 */
	FormatPanel.applyToCells = function(graph, cells, key, items)
	{
		graph.model.beginUpdate();

		try
		{
			for (var i = 0; i < cells.length; i++)
			{
				var resolved = (key == 'roles') ? items : deepSubstitute(cells[i], items);
				Hmi.Model.setCellConfig(graph, cells[i], key, resolved);
			}
		}
		finally
		{
			graph.model.endUpdate();
		}
	};

	// ---------------------------------------------------------------
	// HmiFormatPanel: BaseFormatPanel subclass
	// ---------------------------------------------------------------

	function HmiFormatPanel(format, editorUi, container)
	{
		BaseFormatPanel.call(this, format, editorUi, container);
		this.init();
	};

	mxUtils.extend(HmiFormatPanel, BaseFormatPanel);

	HmiFormatPanel.prototype.init = function()
	{
		var ui = this.editorUi;
		var graph = ui.editor.graph;
		var cells = graph.getSelectionCells();

		if (cells == null || cells.length == 0)
		{
			this.renderDocSummary();
		}
		else
		{
			this.renderCellConfig(cells);
		}
	};

	/**
	 * Style of the clickable summary lines (light/dark via the theme
	 * variables of grapheditor.css).
	 */
	function installStyle()
	{
		Hmi.Editors.installStyle();

		if (document.getElementById('geHmiTabStyle') != null)
		{
			return;
		}

		var style = document.createElement('style');
		style.id = 'geHmiTabStyle';
		style.textContent =
			'.geHmiSumLine{display:flex;align-items:baseline;gap:6px;cursor:pointer;border-radius:4px;' +
				'padding:2px 4px;margin:0 -4px;}' +
			'.geHmiSumLine:hover,.geHmiSumLine:focus-visible{' +
				'background:light-dark(var(--soft-hover-color),var(--dark-soft-hover-color));outline:none;}' +
			'.geHmiSumLine .geHmiSumVal{margin-left:auto;font-variant-numeric:tabular-nums;}' +
			'div.geHmiSummary>.geHmiSumLine{display:flex;overflow:hidden;white-space:nowrap;}' +
			'.geHmiSumLine .geHmiSumText{overflow:hidden;text-overflow:ellipsis;}';
		document.head.appendChild(style);
	};

	/**
	 * Adds a full-width button with the help icon to the panel.
	 */
	HmiFormatPanel.prototype.addButton = function(div, label, helpKey, role, fn)
	{
		var btn = mxUtils.button(label, fn);
		btn.className = 'geFullWidthElement';
		btn.style.display = 'block';
		btn.style.marginTop = '4px';
		btn.setAttribute('data-role', role);
		div.appendChild(Hmi.Editors.helpButton(btn, helpKey));

		return btn;
	};

	/**
	 * Adds a clickable line (keyboard operable) to the summary list.
	 */
	function addLine(list, text, title, fn, valueText)
	{
		var line = document.createElement('div');
		line.className = 'geHmiSumLine';
		line.setAttribute('role', 'button');
		line.setAttribute('tabindex', '0');
		line.setAttribute('title', title || text);
		var t = document.createElement('span');
		t.className = 'geHmiSumText';
		mxUtils.write(t, text);
		line.appendChild(t);

		if (valueText != null)
		{
			var v = document.createElement('span');
			v.className = 'geHmiSumVal';
			mxUtils.write(v, valueText);
			line.appendChild(v);
		}

		mxEvent.addListener(line, 'click', fn);
		mxEvent.addListener(line, 'keydown', function(evt)
		{
			if (evt.key == 'Enter' || evt.key == ' ')
			{
				mxEvent.consume(evt);
				fn();
			}
		});
		list.appendChild(line);

		return line;
	};

	/**
	 * Nothing selected: summary of the page and the buttons of the page
	 * level features (INTOUCH_LINKS.md §12.4).
	 */
	HmiFormatPanel.prototype.renderDocSummary = function()
	{
		var ui = this.editorUi;
		var graph = ui.editor.graph;
		installStyle();
		var div = this.createPanel();
		var docTitle = this.createTitle(mxResources.get('hmi'));
		Hmi.Editors.help(docTitle, 'hmiTab.document');
		div.appendChild(docTitle);

		var cfg = null;

		try
		{
			cfg = Hmi.Model.getEffectiveConfig(ui);
		}
		catch (e)
		{
			cfg = {sources: [], tags: []};
		}

		// Objects of the page that have links or other HMI settings
		var objects = 0;
		var cells = graph.model.cells;

		for (var id in cells)
		{
			var cell = cells[id];

			if (cell != graph.model.getRoot() && !graph.model.isLayer(cell) &&
				(graph.model.isVertex(cell) || graph.model.isEdge(cell)))
			{
				objects += ((Hmi.LinksDialog != null && Hmi.LinksDialog.objectSummary != null) ?
					Hmi.LinksDialog.objectSummary(cell).length > 0 : Hmi.Model.hasCellConfig(cell)) ? 1 : 0;
			}
		}

		var triggers = (Hmi.Model.getDocConfig(graph).triggers || []).length;
		Hmi.Editors.head(div, mxResources.get('hmiScrSummary'), 'hmiTab.summary').style.marginBottom = '2px';
		var summary = document.createElement('div');
		summary.className = 'geHmiSummary';
		summary.setAttribute('data-role', 'page-summary');

		var open = function(tab)
		{
			return function()
			{
				Hmi.ScreenSettings.show(ui, {tab: tab});
			};
		};

		var rows = [['sources', mxResources.get('hmiSources'), cfg.sources.length],
			['tags', mxResources.get('hmiTags'), cfg.tags.length],
			[null, mxResources.get('hmiScrObjectsWithLinks'), objects],
			['pageTriggers', mxResources.get('hmiDocTriggers'), triggers]];

		for (var i = 0; i < rows.length; i++)
		{
			var line = addLine(summary, rows[i][1], null, (rows[i][0] != null) ?
				open(rows[i][0]) : function() {}, String(rows[i][2]));
			line.setAttribute('data-summary', rows[i][0] || 'objects');

			if (rows[i][0] == null)
			{
				line.style.cursor = 'default';
				line.removeAttribute('role');
				line.removeAttribute('tabindex');
			}
		}

		div.appendChild(summary);

		this.addButton(div, mxResources.get('hmiScreenSettings') + '...', 'hmiTab.screenSettings',
			'screen-settings', function()
		{
			Hmi.ScreenSettings.show(ui);
		}).style.marginTop = '0';

		this.addButton(div, mxResources.get('hmiTagBrowser') + '...', 'hmiTab.tagBrowser',
			'tag-browser', function()
		{
			if (Hmi.TagBrowser != null)
			{
				Hmi.TagBrowser.show(ui);
			}
		});

		var sub = this.addButton(div, mxResources.get('hmiSubstituteTags') + '...', 'hmiTab.substitute',
			'substitute-tags', function()
		{
			if (Hmi.SubstituteTags != null)
			{
				Hmi.SubstituteTags.show(ui, []);
			}
		});
		sub.setAttribute('title', mxResources.get('hmiSubstituteHintPage').replace('{1}', ''));

		this.addButton(div, mxResources.get('hmiDefineMissingTags') + '...', 'hmiTab.defineMissing',
			'define-missing', function()
		{
			if (Hmi.SubstituteTags != null)
			{
				Hmi.SubstituteTags.defineMissing(ui);
			}
		});

		this.addButton(div, mxResources.get('hmiValidate') + '...', 'hmiTab.validate',
			'validate', function()
		{
			if (Hmi.Validator != null)
			{
				Hmi.Validator.show(ui);
			}
		});

		var previewAction = ui.actions.get('hmiLivePreview');

		if (previewAction != null)
		{
			this.addButton(div, mxResources.get('hmiLivePreview'), 'hmiTab.livePreview',
				'live-preview', function()
			{
				previewAction.funct();
			}).style.marginTop = '10px';
		}

		var runAction = ui.actions.get('hmiRun');

		if (runAction != null)
		{
			this.addButton(div, mxResources.get('hmiRun'), 'hmiTab.runScreen', 'run-screen', function()
			{
				runAction.funct();
			});
		}

		this.container.appendChild(div);
	};

	/**
	 * Objects selected: the configured links of the first object (one line
	 * each, a click opens the Animation Links dialog on that link) and the
	 * buttons Animation Links and Tag Browser.
	 */
	HmiFormatPanel.prototype.renderCellConfig = function(cells)
	{
		var ui = this.editorUi;
		installStyle();
		var div = this.createPanel();
		var cellTitle = this.createTitle(mxResources.get('hmi') +
			(cells.length > 1 ? ' (' + cells.length + ')' : ''));
		Hmi.Editors.help(cellTitle, 'hmiTab.object');
		div.appendChild(cellTitle);

		Hmi.Editors.head(div, mxResources.get('hmiScrLinks'), 'hmiTab.links').style.marginBottom = '2px';
		var list = document.createElement('div');
		list.className = 'geHmiSummary';
		list.setAttribute('data-role', 'links-summary');
		var entries = [];

		if (Hmi.LinksDialog != null)
		{
			if (Hmi.LinksDialog.objectSummary != null)
			{
				entries = Hmi.LinksDialog.objectSummary(cells[0]);
			}
			else
			{
				entries = Hmi.LinksDialog.summary(Hmi.Model.getCellConfig(cells[0]).links).map(function(t)
				{
					return {id: null, text: t};
				});
			}
		}

		if (entries.length == 0)
		{
			var none = document.createElement('div');
			none.className = 'geDialogHint';
			none.setAttribute('data-role', 'no-links');
			mxUtils.write(none, mxResources.get('hmiScrNoLinks'));
			list.appendChild(none);
		}

		for (var i = 0; i < entries.length; i++)
		{
			(function(entry)
			{
				var line = addLine(list, entry.text, null, function()
				{
					Hmi.LinksDialog.show(ui, cells, (entry.id != null) ? {link: entry.id} : null);
				});

				if (entry.id != null)
				{
					line.setAttribute('data-link', entry.id);
				}
			})(entries[i]);
		}

		div.appendChild(list);

		if (Hmi.LinksDialog != null)
		{
			this.addButton(div, mxResources.get('hmiAnimationLinks') + '...', 'hmiTab.linksButton',
				'links-button', function()
			{
				Hmi.LinksDialog.show(ui, cells);
			}).style.marginTop = '0';
		}

		this.addButton(div, mxResources.get('hmiTagBrowser') + '...', 'hmiTab.tagBrowser',
			'tag-browser', function()
		{
			if (Hmi.TagBrowser != null)
			{
				Hmi.TagBrowser.show(ui);
			}
		});

		this.container.appendChild(div);
	};

	// ---------------------------------------------------------------
	// Item editors (binding / event / trigger / animation)
	// ---------------------------------------------------------------

	FormatPanel.buildBindingEditor = function(ui, value)
	{
		value = value || {};
		var container = document.createElement('div');

		var src = Hmi.Editors.inlineFields(container);
		var tagField = Hmi.Editors.tagInput(ui, value.tag);
		Hmi.Editors.inlineField(src, mxResources.get('hmiTag') + ':', tagField, 'binding.tag');
		var exprInput = Hmi.Editors.textInput(value.expr);
		Hmi.Editors.inlineField(src, mxResources.get('hmiExpr') + ':', exprInput, 'binding.expr');

		var targetRow = Hmi.Editors.row(container, mxResources.get('hmiTarget') + ':', 'binding.target');
		var targetSelect = Hmi.Editors.select(['label', 'tooltip', 'visible', 'attr:', 'style:',
			'geo:x', 'geo:y', 'geo:width', 'geo:height', 'prop:'],
			/^(label|tooltip|visible|geo:x|geo:y|geo:width|geo:height)$/.test(value.target) ?
			value.target : (value.target || 'label').replace(/^(attr|style|prop):.*/, '$1:'));
		targetRow.appendChild(targetSelect);
		var targetKeyInput = Hmi.Editors.textInput(
			/^(attr|style|prop):(.*)/.test(value.target || '') ? RegExp.$2 : '',
			mxResources.get('hmiTargetKeyHint'));
		targetRow.appendChild(targetKeyInput);

		var syncKey = function()
		{
			targetKeyInput.style.display = /:$/.test(targetSelect.value) ? '' : 'none';
		};
		mxEvent.addListener(targetSelect, 'change', syncKey);
		syncKey();

		var transform = Hmi.Editors.transformEditor(ui, value.transform);
		container.appendChild(transform);

		var fmtRow = Hmi.Editors.inlineFields(container);
		var decimals = Hmi.Editors.numberInput((value.format && value.format.decimals != null) ?
			value.format.decimals : '');
		Hmi.Editors.inlineField(fmtRow, mxResources.get('hmiDecimals') + ':', decimals, 'binding.decimals');
		var unit = Hmi.Editors.checkbox(mxResources.get('hmiShowUnit'),
			value.format && value.format.unit, 'binding.unit');
		fmtRow.appendChild(unit);

		container.getValue = function()
		{
			var result = {};

			if (exprInput.value !== '')
			{
				result.expr = exprInput.value;
			}
			else
			{
				result.tag = tagField.getValue();
			}

			result.target = /:$/.test(targetSelect.value) ?
				targetSelect.value + targetKeyInput.value : targetSelect.value;
			var t = transform.getValue();

			if (t != null)
			{
				result.transform = t;
			}

			if (decimals.value !== '' || unit.input.checked)
			{
				result.format = {};

				if (decimals.value !== '')
				{
					result.format.decimals = parseInt(decimals.value, 10);
				}

				if (unit.input.checked)
				{
					result.format.unit = true;
				}
			}

			return result;
		};

		return container;
	};

	FormatPanel.buildActionsListEditor = function(ui, actions)
	{
		var container = document.createElement('div');
		var listDiv = document.createElement('div');
		container.appendChild(listDiv);
		var current = (actions || []).slice();

		var render = function()
		{
			Hmi.Editors.renderItemList({
				ui: ui, container: listDiv, items: current, kind: 'events',
				helpKey: 'action.dialog',
				itemLabel: function(a)
				{
					return a.type;
				},
				buildEditor: function(ui2, value)
				{
					return Hmi.Editors.actionEditor(ui2, value);
				},
				newItem: function()
				{
					return {type: 'notify', text: ''};
				},
				emptyText: mxResources.get('hmiNoItems'),
				addTitle: mxResources.get('hmiAddItem'),
				editTitle: mxResources.get('edit'),
				onChange: function(items)
				{
					current = items;
					render();
				}
			});
		};

		render();
		container.getValue = function()
		{
			return current;
		};

		return container;
	};

	FormatPanel.buildEventEditor = function(ui, value)
	{
		value = value || {};
		var container = document.createElement('div');

		var onRow = Hmi.Editors.row(container, mxResources.get('hmiOn') + ':', 'event.on');
		var onSelect = Hmi.Editors.select(['click', 'dblclick', 'mousedown', 'mouseup',
			'enter', 'leave', 'valueChange', 'pageOpen', 'pageClose', 'message', 'change',
			'contextmenu', 'longpress'], value.on || 'click');
		onRow.appendChild(onSelect);

		var msgRow = Hmi.Editors.row(container, mxResources.get('hmiMessageName') + ':', 'event.message');
		var msgInput = Hmi.Editors.textInput(value.message);
		msgRow.appendChild(msgInput);

		var syncMsg = function()
		{
			msgRow.style.display = (onSelect.value == 'message') ? '' : 'none';
		};
		mxEvent.addListener(onSelect, 'change', syncMsg);
		syncMsg();

		var confirmRow = Hmi.Editors.checkbox(mxResources.get('hmiConfirm'), !!value.confirm, 'event.confirm');
		container.appendChild(confirmRow);

		var lbl = document.createElement('div');
		lbl.className = 'geDialogHint';
		lbl.style.marginTop = '6px';
		mxUtils.write(lbl, mxResources.get('hmiActions') + ':');
		Hmi.Editors.help(lbl, 'event.actions');
		container.appendChild(lbl);

		var actionsEditor = FormatPanel.buildActionsListEditor(ui, value.actions);
		container.appendChild(actionsEditor);

		container.getValue = function()
		{
			var result = {on: onSelect.value, actions: actionsEditor.getValue()};

			if (onSelect.value == 'message')
			{
				result.message = msgInput.value;
			}

			if (confirmRow.input.checked)
			{
				result.confirm = true;
			}

			return result;
		};

		return container;
	};

	FormatPanel.buildTriggerEditor = function(ui, value)
	{
		value = value || {};
		var container = document.createElement('div');

		var nameRow = Hmi.Editors.row(container, mxResources.get('hmiName') + ':', 'trigger.name');
		var nameInput = Hmi.Editors.textInput(value.name);
		nameRow.appendChild(nameInput);

		var condTypeRow = Hmi.Editors.row(container, mxResources.get('hmiConditionType') + ':', 'trigger.conditionType');
		var condType = Hmi.Editors.select(['and', 'or'], value.conditionType || 'and');
		condTypeRow.appendChild(condType);

		var timing = Hmi.Editors.inlineFields(container);
		var deadband = Hmi.Editors.numberInput(value.deadband || '');
		Hmi.Editors.inlineField(timing, mxResources.get('hmiScrDeadband') + ':', deadband, 'trigger.deadband');
		var onDelay = Hmi.Editors.numberInput(value.onDelay || '');
		Hmi.Editors.inlineField(timing, mxResources.get('hmiScrOnDelay') + ' (ms):', onDelay, 'trigger.onDelay');
		var offDelay = Hmi.Editors.numberInput(value.offDelay || '');
		Hmi.Editors.inlineField(timing, mxResources.get('hmiScrOffDelay') + ' (ms):', offDelay, 'trigger.offDelay');

		var condLbl = document.createElement('div');
		condLbl.className = 'geDialogHint';
		mxUtils.write(condLbl, mxResources.get('hmiConditions') + ':');
		Hmi.Editors.help(condLbl, 'trigger.conditions');
		container.appendChild(condLbl);

		var condListDiv = document.createElement('div');
		container.appendChild(condListDiv);
		var conditions = (value.conditions || []).slice();

		var renderConds = function()
		{
			Hmi.Editors.renderItemList({
				ui: ui, container: condListDiv, items: conditions, kind: 'triggers',
				helpKey: 'condition.dialog',
				itemLabel: function(c)
				{
					return (c.tag || c.expr || '?') + ' ' + (c.operator || '==') +
						(c.value != null ? ' ' + c.value : '');
				},
				buildEditor: function(ui2, v)
				{
					return Hmi.Editors.conditionEditor(ui2, v);
				},
				newItem: function()
				{
					return {tag: '', operator: '=='};
				},
				emptyText: mxResources.get('hmiNoItems'),
				addTitle: mxResources.get('hmiAddItem'),
				editTitle: mxResources.get('edit'),
				onChange: function(items)
				{
					conditions = items;
					renderConds();
				}
			});
		};
		renderConds();

		var actLbl = document.createElement('div');
		actLbl.className = 'geDialogHint';
		actLbl.style.marginTop = '6px';
		mxUtils.write(actLbl, mxResources.get('hmiActions') + ':');
		Hmi.Editors.help(actLbl, 'trigger.actions');
		container.appendChild(actLbl);
		var actionsEditor = FormatPanel.buildActionsListEditor(ui, value.actions);
		container.appendChild(actionsEditor);

		var elseLbl = document.createElement('div');
		elseLbl.className = 'geDialogHint';
		elseLbl.style.marginTop = '6px';
		mxUtils.write(elseLbl, mxResources.get('hmiElseActions') + ':');
		Hmi.Editors.help(elseLbl, 'trigger.elseActions');
		container.appendChild(elseLbl);
		var elseEditor = FormatPanel.buildActionsListEditor(ui, value.elseActions);
		container.appendChild(elseEditor);

		container.getValue = function()
		{
			// Settings that have no field here stay as they are
			var out = JSON.parse(JSON.stringify(value));
			delete out.deadband;
			delete out.onDelay;
			delete out.offDelay;
			out.name = nameInput.value;
			out.conditionType = condType.value;
			out.conditions = conditions;
			out.actions = actionsEditor.getValue();
			out.elseActions = elseEditor.getValue();

			// Timing: only the settings that are used are stored
			var timings = {deadband: deadband, onDelay: onDelay, offDelay: offDelay};

			for (var key in timings)
			{
				if (timings[key].value !== '' && !isNaN(Number(timings[key].value)) &&
					Number(timings[key].value) > 0)
				{
					out[key] = Number(timings[key].value);
				}
			}

			return out;
		};

		return container;
	};

	FormatPanel.buildAnimationEditor = function(ui, value)
	{
		value = value || {};
		var container = document.createElement('div');

		var row1 = Hmi.Editors.inlineFields(container);
		var nameInput = Hmi.Editors.textInput(value.name);
		Hmi.Editors.inlineField(row1, mxResources.get('hmiName') + ':', nameInput, 'animation.name');
		var preset = Hmi.Editors.select(['blink', 'pulse', 'spin', 'shake', 'colorCycle',
			'fadeInOut'], value.preset || 'blink');
		Hmi.Editors.inlineField(row1, mxResources.get('hmiPreset') + ':', preset, 'animation.preset');

		var row2 = Hmi.Editors.inlineFields(container);
		var duration = Hmi.Editors.numberInput(value.duration || 1000);
		Hmi.Editors.inlineField(row2, mxResources.get('hmiDuration') + ':', duration, 'animation.duration');
		var autoPlay = Hmi.Editors.checkbox(mxResources.get('hmiAutoPlay'), !!value.autoPlay, 'animation.autoPlay');
		row2.appendChild(autoPlay);

		var paramsRow = Hmi.Editors.row(container, mxResources.get('hmiRpm') + ':', 'animation.rpm');
		var rpm = Hmi.Editors.numberInput((value.params && value.params.rpm) || '');
		paramsRow.appendChild(rpm);

		var rpmTagRow = Hmi.Editors.row(container, mxResources.get('hmiRpmTag') + ':', 'animation.rpmTag');
		var rpmTag = Hmi.Editors.tagInput(ui, value.params && value.params.rpmTag);
		rpmTagRow.appendChild(rpmTag);

		container.getValue = function()
		{
			var params = {};

			if (rpm.value !== '')
			{
				params.rpm = parseFloat(rpm.value);
			}

			if (rpmTag.getValue() !== '')
			{
				params.rpmTag = rpmTag.getValue();
			}

			return {name: nameInput.value || preset.value, preset: preset.value,
				params: params, duration: parseInt(duration.value, 10) || 1000,
				autoPlay: autoPlay.input.checked};
		};

		return container;
	};

	// ---------------------------------------------------------------
	// Tab injection into Format.prototype.immediateRefresh
	// ---------------------------------------------------------------

	FormatPanel.injectTab = function(format)
	{
		var ui = format.editorUi;
		var container = format.container;
		var titleContainer = container.firstChild;

		if (titleContainer == null)
		{
			return;
		}

		if (format.editorUi.editor.graph.isEditing())
		{
			// Text editing: no HMI tab (matches core's own omission there)
			return;
		}

		var label = document.createElement('div');
		label.className = 'geFormatTitle';
		label.setAttribute('title', mxResources.get('hmi'));
		mxUtils.write(label, mxResources.get('hmiTab'));
		titleContainer.appendChild(label);

		var panel = document.createElement('div');
		panel.className = 'geFormatContent';
		panel.style.display = 'none';
		container.appendChild(panel);

		new HmiFormatPanel(format, ui, panel);

		// Delegated, positional show/hide for every tab (original and HMI):
		// label index i in titleContainer maps to panel index i+1 in
		// container. This also keeps the original tabs correct after the
		// HMI tab (whose activation isn't known to Format's own closure
		// state) has been shown once.
		var activateByLabel = function(target)
		{
			var labels = titleContainer.children;
			var panels = container.children;
			var index = Array.prototype.indexOf.call(labels, target);

			if (index < 0)
			{
				return;
			}

			for (var i = 0; i < labels.length; i++)
			{
				labels[i].classList.remove('geActiveFormatTitle');
			}

			target.classList.add('geActiveFormatTitle');

			for (var j = 1; j < panels.length; j++)
			{
				panels[j].style.display = (j == index + 1) ? '' : 'none';
			}

			format.hmiTabActive = (target == label);

			if (Hmi.LinksDialog != null)
			{
				Hmi.LinksDialog.decorate(ui, format.hmiTabActive);
			}
		};

		mxEvent.addListener(titleContainer, 'click', function(evt)
		{
			var target = mxEvent.getSource(evt);

			while (target != null && target.parentNode != titleContainer)
			{
				target = target.parentNode;
			}

			if (target != null && target.parentNode == titleContainer)
			{
				activateByLabel(target);
			}
		});

		if (format.hmiTabActive)
		{
			activateByLabel(label);
		}
	};

	FormatPanel.install = function(ui)
	{
		var format = ui.format;

		if (format == null || format.hmiPanelInstalled)
		{
			return;
		}

		format.hmiPanelInstalled = true;
		var original = Format.prototype.immediateRefresh;

		Format.prototype.immediateRefresh = function()
		{
			original.apply(this, arguments);

			try
			{
				FormatPanel.injectTab(this);
			}
			catch (e)
			{
				if (root.console != null)
				{
					console.error('HMI: format panel tab failed: ' + e.message);
				}
			}
		};

		// Clears the "HMI tab was active" memory when the selection changes
		// away from a state that no longer applies (best-effort; harmless
		// if it stays set, the tab simply re-activates on next refresh).
		ui.editor.graph.getSelectionModel().addListener(mxEvent.CHANGE, function()
		{
			// keep hmiTabActive as-is; immediateRefresh re-renders the tab
		});

		FormatPanel.installEditDataFilter(ui);

		// Re-render the panel now (format may already have been built once)
		format.refresh();
	};

	// ---------------------------------------------------------------
	// Hide hmi* attributes from EditDataDialog (no core edits, item 10)
	// ---------------------------------------------------------------

	var HIDDEN_ATTRS = {hmiBindings: true, hmiEvents: true, hmiTriggers: true,
		hmiAnimations: true, hmiRoles: true, hmiLinks: true, hmi: true};

	FormatPanel.installEditDataFilter = function(ui)
	{
		if (root.EditDataDialog == null || root.EditDataDialog.hmiWrapped)
		{
			return;
		}

		var Original = root.EditDataDialog;

		var Wrapped = function(dialogUi, cell, optionalGraph)
		{
			Original.call(this, dialogUi, cell, optionalGraph);

			try
			{
				var rows = this.container.querySelectorAll('.geDialogFormRow');

				for (var i = 0; i < rows.length; i++)
				{
					var lbl = rows[i].querySelector('.geDialogFormLabel');

					if (lbl != null)
					{
						var name = lbl.textContent.replace(/:\s*$/, '');

						if (HIDDEN_ATTRS[name])
						{
							rows[i].style.display = 'none';
						}
					}
				}
			}
			catch (e)
			{
				// best-effort only; never block the dialog from opening
			}
		};

		Wrapped.prototype = Original.prototype;

		for (var key in Original)
		{
			if (Object.prototype.hasOwnProperty.call(Original, key))
			{
				Wrapped[key] = Original[key];
			}
		}

		Wrapped.hmiWrapped = true;
		root.EditDataDialog = Wrapped;
	};

	Hmi.FormatPanel = FormatPanel;
})();
