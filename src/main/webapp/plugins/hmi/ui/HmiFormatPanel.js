/**
 * Hmi.FormatPanel: adds an "HMI" tab to the Format panel (see
 * js/grapheditor/Format.js Format.prototype.immediateRefresh). The tab is
 * appended after the existing tabs are built, without touching Format.js.
 *
 * Selection empty: document config summary + Sources/Tags/Live Preview.
 * Cell(s) selected: collapsible sections for Bindings, Events, Triggers,
 * Animations and Roles, each editable via Hmi.Editors. Edits go through
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

	HmiFormatPanel.prototype.renderDocSummary = function()
	{
		var ui = this.editorUi;
		var div = this.createPanel();
		div.appendChild(this.createTitle(mxResources.get('hmi')));

		var cfg = null;

		try
		{
			cfg = Hmi.Model.getEffectiveConfig(ui);
		}
		catch (e)
		{
			cfg = {sources: [], tags: []};
		}

		var summary = document.createElement('div');
		summary.className = 'geDialogHint';
		summary.style.padding = '0 0 8px 0';
		mxUtils.write(summary, mxResources.get('hmiSources') + ': ' + cfg.sources.length +
			'  ·  ' + mxResources.get('hmiTags') + ': ' + cfg.tags.length);
		div.appendChild(summary);

		var btn1 = mxUtils.button(mxResources.get('hmiSources') + '...', function()
		{
			if (Hmi.SourcesDialog != null)
			{
				Hmi.SourcesDialog.show(ui);
			}
		});
		btn1.className = 'geFullWidthElement';
		btn1.style.display = 'block';
		div.appendChild(btn1);

		var btn2 = mxUtils.button(mxResources.get('hmiTags') + '...', function()
		{
			if (Hmi.TagsDialog != null)
			{
				Hmi.TagsDialog.show(ui);
			}
		});
		btn2.className = 'geFullWidthElement';
		btn2.style.display = 'block';
		btn2.style.marginTop = '4px';
		div.appendChild(btn2);

		var btn3 = mxUtils.button(mxResources.get('hmiTagBrowser') + '...', function()
		{
			if (Hmi.TagBrowser != null)
			{
				Hmi.TagBrowser.show(ui);
			}
		});
		btn3.className = 'geFullWidthElement';
		btn3.style.display = 'block';
		btn3.style.marginTop = '4px';
		div.appendChild(btn3);

		var previewAction = ui.actions.get('hmiLivePreview');

		if (previewAction != null)
		{
			var btn4 = mxUtils.button(mxResources.get('hmiLivePreview'), function()
			{
				previewAction.funct();
			});
			btn4.className = 'geFullWidthElement';
			btn4.style.display = 'block';
			btn4.style.marginTop = '10px';
			div.appendChild(btn4);
		}

		this.container.appendChild(div);
	};

	HmiFormatPanel.prototype.renderCellConfig = function(cells)
	{
		var ui = this.editorUi;
		var graph = ui.editor.graph;
		var cell = cells[0];
		var div = this.createPanel();
		div.appendChild(this.createTitle(mxResources.get('hmi') +
			(cells.length > 1 ? ' (' + cells.length + ')' : '')));

		this.container.appendChild(div);

		this.addQuickAdd(div, cells);
		this.addListSection(div, cells, 'bindings', mxResources.get('hmiBindings'),
			function(b)
			{
				return (b.tag || b.expr || '?') + ' → ' + (b.target || '');
			},
			function(ui2, value)
			{
				return FormatPanel.buildBindingEditor(ui2, value);
			}, function()
			{
				return {tag: '', target: 'label'};
			});

		this.addListSection(div, cells, 'events', mxResources.get('hmiEvents'),
			function(e)
			{
				return e.on + ' (' + (e.actions || []).length + ' ' +
					mxResources.get('hmiActions') + ')';
			},
			function(ui2, value)
			{
				return FormatPanel.buildEventEditor(ui2, value);
			}, function()
			{
				return {on: 'click', actions: []};
			});

		this.addListSection(div, cells, 'triggers', mxResources.get('hmiTriggers'),
			function(t)
			{
				return t.name || mxResources.get('hmiTriggers');
			},
			function(ui2, value)
			{
				return FormatPanel.buildTriggerEditor(ui2, value);
			}, function()
			{
				return {name: '', conditions: [], conditionType: 'and', actions: []};
			});

		this.addListSection(div, cells, 'animations', mxResources.get('hmiAnimations'),
			function(a)
			{
				return (a.name || '?') + (a.preset ? ' (' + a.preset + ')' : '');
			},
			function(ui2, value)
			{
				return FormatPanel.buildAnimationEditor(ui2, value);
			}, function()
			{
				return {name: 'anim', preset: 'blink', params: {}};
			});

		this.addRolesSection(div, cells);

		if (cell.getEdge != null || graph.model.isEdge(cell))
		{
			this.addFlowSection(div, cells);
		}
	};

	/**
	 * Quick-add buttons for common bindings/animations (HMI-BND, spec item 2).
	 */
	HmiFormatPanel.prototype.addQuickAdd = function(div, cells)
	{
		var ui = this.editorUi;
		var graph = ui.editor.graph;
		var section = this.createCollapsibleSection(mxResources.get('hmiQuickAdd'), false);
		div.appendChild(section.wrapper);
		var content = section.contentDiv;
		content.style.padding = '6px 0';

		function addBinding(binding)
		{
			for (var i = 0; i < cells.length; i++)
			{
				var cfg = Hmi.Model.getCellConfig(cells[i]);
				cfg.bindings.push(binding);
				FormatPanel.applyToCells(graph, [cells[i]], 'bindings', cfg.bindings);
			}
		};

		function quickBtn(label, fn)
		{
			var btn = mxUtils.button(label, fn);
			btn.className = 'geFullWidthElement';
			btn.style.display = 'block';
			btn.style.marginBottom = '2px';
			content.appendChild(btn);
		};

		quickBtn(mxResources.get('hmiQuickLevel'), function()
		{
			addBinding({tag: 'Tag{id}', target: 'style:hmiLevel'});
		});

		quickBtn(mxResources.get('hmiQuickValue'), function()
		{
			addBinding({tag: 'Tag{id}', target: 'prop:value'});
		});

		quickBtn(mxResources.get('hmiQuickLabel'), function()
		{
			addBinding({tag: 'Tag{id}', target: 'label'});
		});

		quickBtn(mxResources.get('hmiQuickColor'), function()
		{
			addBinding({tag: 'Tag{id}', target: 'style:fillColor', transform:
				{kind: 'map', entries: [{operator: '==', value: 1, output: '#4CAF50'}],
				'default': '#B0BEC5'}});
		});

		quickBtn(mxResources.get('hmiQuickVisible'), function()
		{
			addBinding({tag: 'Tag{id}', target: 'visible'});
		});

		var presetSelect = Hmi.Editors.select([
			{value: 'blink', label: 'Blink'},
			{value: 'spin', label: 'Spin'},
			{value: 'pulse', label: 'Pulse'},
			{value: 'shake', label: 'Shake'},
			{value: 'fadeInOut', label: 'Fade in/out'},
			{value: 'colorCycle', label: 'Color cycle'}
		], 'blink');
		presetSelect.style.display = 'block';
		presetSelect.style.position = 'static';
		presetSelect.style.width = '212px';
		presetSelect.style.marginTop = '4px';
		content.appendChild(presetSelect);

		quickBtn(mxResources.get('hmiQuickAnimation'), function()
		{
			var preset = presetSelect.value;
			var params = {};

			if (preset == 'spin')
			{
				params.rpm = 10;
			}

			for (var i = 0; i < cells.length; i++)
			{
				var cfg = Hmi.Model.getCellConfig(cells[i]);
				cfg.animations.push({name: preset, preset: preset, params: params,
					autoPlay: true, duration: 1000});
				FormatPanel.applyToCells(graph, [cells[i]], 'animations', cfg.animations);
			}
		});
	};

	/**
	 * Edge-only: Flow ← tag quick binding and flow type select (model style,
	 * via graph.setCellStyles — an undoable editor-time edit).
	 */
	HmiFormatPanel.prototype.addFlowSection = function(div, cells)
	{
		var ui = this.editorUi;
		var graph = ui.editor.graph;
		var section = this.createCollapsibleSection(mxResources.get('hmiFlow'), true);
		div.appendChild(section.wrapper);
		var content = section.contentDiv;
		content.style.padding = '6px 0';

		var btn = mxUtils.button(mxResources.get('hmiQuickFlow'), function()
		{
			for (var i = 0; i < cells.length; i++)
			{
				var cfg = Hmi.Model.getCellConfig(cells[i]);
				cfg.bindings.push({tag: 'Tag{id}', target: 'style:flowAnimation'});
				FormatPanel.applyToCells(graph, [cells[i]], 'bindings', cfg.bindings);
			}

			graph.setCellStyles('flowAnimation', '1', cells);
		});
		btn.className = 'geFullWidthElement';
		content.appendChild(btn);

		var typeRow = Hmi.Editors.row(content, mxResources.get('hmiFlowType') + ':');
		var style = graph.getCurrentCellStyle(cells[0]) || {};
		var typeSelect = Hmi.Editors.select(['dash', 'dots', 'beads', 'arrows', 'liquid'],
			style.flowAnimationType || 'dash');
		typeSelect.style.position = 'static';
		typeSelect.style.marginLeft = '6px';
		typeRow.appendChild(typeSelect);

		mxEvent.addListener(typeSelect, 'change', function()
		{
			graph.setCellStyles('flowAnimationType', typeSelect.value, cells);
		});
	};

	/**
	 * A collapsible section listing one config key's items.
	 */
	HmiFormatPanel.prototype.addListSection = function(div, cells, key, title,
		itemLabel, buildEditor, newItem)
	{
		var ui = this.editorUi;
		var graph = ui.editor.graph;
		var section = this.createCollapsibleSection(title, key != 'bindings');
		div.appendChild(section.wrapper);
		var listDiv = document.createElement('div');
		section.contentDiv.appendChild(listDiv);

		var cfg = Hmi.Model.getCellConfig(cells[0]);
		var items = (cfg[key] || []).slice();

		var renderList = function()
		{
			Hmi.Editors.renderItemList({
				ui: ui, container: listDiv, items: items, kind: key,
				itemLabel: itemLabel, buildEditor: buildEditor, newItem: newItem,
				emptyText: mxResources.get('hmiNoItems'),
				addTitle: mxResources.get('hmiAddItem'), editTitle: mxResources.get('edit'),
				onChange: function(newItems)
				{
					FormatPanel.applyToCells(graph, cells, key, newItems);
					items = newItems;
					renderList();
				}
			});
		};

		renderList();
	};

	HmiFormatPanel.prototype.addRolesSection = function(div, cells)
	{
		var ui = this.editorUi;
		var graph = ui.editor.graph;
		var section = this.createCollapsibleSection(mxResources.get('hmiRoles'), true);
		div.appendChild(section.wrapper);
		var cfg = Hmi.Model.getCellConfig(cells[0]);
		var input = Hmi.Editors.textInput((cfg.roles || []).join(','), 'op,eng');
		var row = document.createElement('div');
		row.style.padding = '6px 0';
		row.appendChild(input);
		section.contentDiv.appendChild(row);

		mxEvent.addListener(input, 'change', function()
		{
			var roles = input.value.split(',').map(function(s)
			{
				return s.replace(/^\s+|\s+$/g, '');
			}).filter(function(s)
			{
				return s.length > 0;
			});
			FormatPanel.applyToCells(graph, cells, 'roles', roles);
		});
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
		Hmi.Editors.inlineField(src, mxResources.get('hmiTag') + ':', tagField);
		var exprInput = Hmi.Editors.textInput(value.expr);
		Hmi.Editors.inlineField(src, mxResources.get('hmiExpr') + ':', exprInput);

		var targetRow = Hmi.Editors.row(container, mxResources.get('hmiTarget') + ':');
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
		Hmi.Editors.inlineField(fmtRow, mxResources.get('hmiDecimals') + ':', decimals);
		var unit = Hmi.Editors.checkbox(mxResources.get('hmiShowUnit'),
			value.format && value.format.unit);
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

		var onRow = Hmi.Editors.row(container, mxResources.get('hmiOn') + ':');
		var onSelect = Hmi.Editors.select(['click', 'dblclick', 'mousedown', 'mouseup',
			'enter', 'leave', 'valueChange', 'pageOpen', 'pageClose', 'message', 'change',
			'contextmenu', 'longpress'], value.on || 'click');
		onRow.appendChild(onSelect);

		var msgRow = Hmi.Editors.row(container, mxResources.get('hmiMessageName') + ':');
		var msgInput = Hmi.Editors.textInput(value.message);
		msgRow.appendChild(msgInput);

		var syncMsg = function()
		{
			msgRow.style.display = (onSelect.value == 'message') ? '' : 'none';
		};
		mxEvent.addListener(onSelect, 'change', syncMsg);
		syncMsg();

		var confirmRow = Hmi.Editors.checkbox(mxResources.get('hmiConfirm'), !!value.confirm);
		container.appendChild(confirmRow);

		var lbl = document.createElement('div');
		lbl.className = 'geDialogHint';
		lbl.style.marginTop = '6px';
		mxUtils.write(lbl, mxResources.get('hmiActions') + ':');
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

		var nameRow = Hmi.Editors.row(container, mxResources.get('hmiName') + ':');
		var nameInput = Hmi.Editors.textInput(value.name);
		nameRow.appendChild(nameInput);

		var condTypeRow = Hmi.Editors.row(container, mxResources.get('hmiConditionType') + ':');
		var condType = Hmi.Editors.select(['and', 'or'], value.conditionType || 'and');
		condTypeRow.appendChild(condType);

		var condLbl = document.createElement('div');
		condLbl.className = 'geDialogHint';
		mxUtils.write(condLbl, mxResources.get('hmiConditions') + ':');
		container.appendChild(condLbl);

		var condListDiv = document.createElement('div');
		container.appendChild(condListDiv);
		var conditions = (value.conditions || []).slice();

		var renderConds = function()
		{
			Hmi.Editors.renderItemList({
				ui: ui, container: condListDiv, items: conditions, kind: 'triggers',
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
		container.appendChild(actLbl);
		var actionsEditor = FormatPanel.buildActionsListEditor(ui, value.actions);
		container.appendChild(actionsEditor);

		var elseLbl = document.createElement('div');
		elseLbl.className = 'geDialogHint';
		elseLbl.style.marginTop = '6px';
		mxUtils.write(elseLbl, mxResources.get('hmiElseActions') + ':');
		container.appendChild(elseLbl);
		var elseEditor = FormatPanel.buildActionsListEditor(ui, value.elseActions);
		container.appendChild(elseEditor);

		container.getValue = function()
		{
			return {name: nameInput.value, conditionType: condType.value,
				conditions: conditions, actions: actionsEditor.getValue(),
				elseActions: elseEditor.getValue()};
		};

		return container;
	};

	FormatPanel.buildAnimationEditor = function(ui, value)
	{
		value = value || {};
		var container = document.createElement('div');

		var row1 = Hmi.Editors.inlineFields(container);
		var nameInput = Hmi.Editors.textInput(value.name);
		Hmi.Editors.inlineField(row1, mxResources.get('hmiName') + ':', nameInput);
		var preset = Hmi.Editors.select(['blink', 'pulse', 'spin', 'shake', 'colorCycle',
			'fadeInOut'], value.preset || 'blink');
		Hmi.Editors.inlineField(row1, mxResources.get('hmiPreset') + ':', preset);

		var row2 = Hmi.Editors.inlineFields(container);
		var duration = Hmi.Editors.numberInput(value.duration || 1000);
		Hmi.Editors.inlineField(row2, mxResources.get('hmiDuration') + ':', duration);
		var autoPlay = Hmi.Editors.checkbox(mxResources.get('hmiAutoPlay'), !!value.autoPlay);
		row2.appendChild(autoPlay);

		var paramsRow = Hmi.Editors.row(container, mxResources.get('hmiRpm') + ':');
		var rpm = Hmi.Editors.numberInput((value.params && value.params.rpm) || '');
		paramsRow.appendChild(rpm);

		var rpmTagRow = Hmi.Editors.row(container, mxResources.get('hmiRpmTag') + ':');
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
		hmiAnimations: true, hmiRoles: true, hmi: true};

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
