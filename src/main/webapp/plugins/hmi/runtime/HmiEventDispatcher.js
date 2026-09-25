/**
 * Runtime event dispatch (SRS §3.5) and default interaction of HMI control
 * widgets (switch, button, slider, input, dropdown; SRS HMI-WGT-6..10, 22).
 */
(function()
{
	var root = (typeof globalThis !== 'undefined') ? globalThis : window;
	var Hmi = root.Hmi = root.Hmi || {};

	var LONGPRESS_MS = 600;

	function EventDispatcher(rt)
	{
		this.rt = rt;
		this.installed = false;
		this.hoverPath = [];
	};

	/**
	 * Returns the widget name for a cell ('switch', 'button', ...) or null.
	 */
	EventDispatcher.getWidget = function(style)
	{
		var shape = (style != null) ? style[mxConstants.STYLE_SHAPE] : null;

		if (shape != null && shape.substring(0, 11) == 'mxgraph.hmi')
		{
			return shape.substring(12);
		}

		return null;
	};

	function num(style, keys, def)
	{
		for (var i = 0; i < keys.length; i++)
		{
			var v = parseFloat(style[keys[i]]);

			if (!isNaN(v))
			{
				return v;
			}
		}

		return def;
	};

	/**
	 * Returns the handlers of the cell for the given event name.
	 */
	EventDispatcher.prototype.getHandlers = function(cell, name)
	{
		var cfg = (cell != null && this.rt.index != null) ? this.rt.index.cells[cell.id] : null;
		var result = [];

		if (cfg != null && !cfg.disabled)
		{
			for (var i = 0; i < cfg.events.length; i++)
			{
				if (cfg.events[i].on == name)
				{
					result.push(cfg.events[i]);
				}
			}
		}

		return result;
	};

	/**
	 * Returns the tag of the first value binding of a cell.
	 */
	EventDispatcher.prototype.getValueTag = function(cell)
	{
		var cfg = (cell != null && this.rt.index != null) ? this.rt.index.cells[cell.id] : null;

		if (cfg != null)
		{
			for (var i = 0; i < cfg.bindings.length; i++)
			{
				var t = cfg.bindings[i].target;

				if ((t == 'prop:value' || t == 'style:hmiValue') && cfg.bindings[i].tag)
				{
					return cfg.bindings[i].tag;
				}
			}
		}

		return null;
	};

	/**
	 * Returns true if events should run.
	 */
	EventDispatcher.prototype.isEnabled = function()
	{
		return this.rt.running && this.rt.interactive;
	};

	/**
	 * Fires an event on the cell, bubbling to ancestors until handled.
	 * Returns true if a handler was found.
	 */
	EventDispatcher.prototype.fire = function(cell, name, extra)
	{
		var model = this.rt.graph.model;
		var current = cell;

		while (current != null && current != model.getRoot())
		{
			var handlers = this.getHandlers(current, name);

			if (handlers.length > 0)
			{
				for (var i = 0; i < handlers.length; i++)
				{
					this.runHandler(current, handlers[i], name, extra);
				}

				return true;
			}

			current = model.getParent(current);
		}

		return false;
	};

	/**
	 * Evaluates conditions, confirmation and delay, then runs actions.
	 */
	EventDispatcher.prototype.runHandler = function(cell, handler, name, extra)
	{
		var rt = this.rt;

		if (handler.conditions != null && handler.conditions.length > 0)
		{
			var env = new Hmi.BindingEngine(rt).createEnv(cell,
				(extra != null) ? extra.value : undefined);
			var ctx = {
				value: function(tag)
				{
					return rt.tags.getValue(tag);
				},
				quality: function(tag)
				{
					var entry = rt.tags.get(tag);

					return (entry != null) ? entry.quality : 'bad';
				},
				changed: function(tag)
				{
					return extra != null && extra.changed != null && extra.changed[tag] == true;
				},
				env: env
			};

			if (!Hmi.Condition.testAll(handler.conditions, handler.conditionType || 'and', ctx))
			{
				return;
			}
		}

		var run = function()
		{
			var go = function()
			{
				rt.actions.run(handler.actions || [], {cell: cell, event: name,
					value: (extra != null) ? extra.value : undefined, handler: handler});
			};

			if (handler.delay > 0)
			{
				setTimeout(go, handler.delay);
			}
			else
			{
				go();
			}
		};

		if (handler.confirm)
		{
			this.confirm(handler.confirm, run);
		}
		else
		{
			run();
		}
	};

	/**
	 * Shows a confirmation dialog (HMI-EVT-4).
	 */
	EventDispatcher.prototype.confirm = function(confirm, fn)
	{
		var text = (typeof confirm === 'object' && confirm.text != null) ? confirm.text :
			mxResources.get('hmiConfirmAction');
		var title = (typeof confirm === 'object' && confirm.title != null) ? confirm.title : null;
		this.rt.ui.confirm(((title != null) ? title + '\n\n' : '') + text, fn, null,
			mxResources.get('ok'), mxResources.get('cancel'));
	};

	/**
	 * Fires valueChange on cells whose bound tags changed.
	 */
	EventDispatcher.prototype.valueChanged = function(names)
	{
		if (!this.isEnabled() || this.rt.index == null)
		{
			return;
		}

		var changed = {};
		var ids = {};

		for (var i = 0; i < names.length; i++)
		{
			changed[names[i]] = true;
			var list = this.rt.index.tagToCells[names[i]];

			if (list != null)
			{
				for (var j = 0; j < list.length; j++)
				{
					ids[list[j]] = true;
				}
			}
		}

		for (var id in ids)
		{
			var cell = this.rt.getCell(id);
			var handlers = this.getHandlers(cell, 'valueChange');

			for (var i = 0; i < handlers.length; i++)
			{
				this.runHandler(cell, handlers[i], 'valueChange', {changed: changed});
			}
		}
	};

	/**
	 * Fires pageOpen/pageClose on all cells with such handlers.
	 */
	EventDispatcher.prototype.firePage = function(name)
	{
		if (!this.rt.running && name != 'pageClose' || this.rt.index == null ||
			!this.rt.interactive)
		{
			return;
		}

		for (var id in this.rt.index.cells)
		{
			var cfg = this.rt.index.cells[id];
			var handlers = this.getHandlers(cfg.cell, name);

			for (var i = 0; i < handlers.length; i++)
			{
				this.runHandler(cfg.cell, handlers[i], name, null);
			}
		}
	};

	/**
	 * Fires message handlers for a named message (emit action).
	 */
	EventDispatcher.prototype.fireMessage = function(message, payload)
	{
		if (!this.isEnabled() || this.rt.index == null)
		{
			return;
		}

		for (var id in this.rt.index.cells)
		{
			var cfg = this.rt.index.cells[id];
			var handlers = this.getHandlers(cfg.cell, 'message');

			for (var i = 0; i < handlers.length; i++)
			{
				if (handlers[i].message == null || handlers[i].message == message)
				{
					this.runHandler(cfg.cell, handlers[i], 'message', {value: payload});
				}
			}
		}
	};

	/**
	 * Returns the cell for a mouse event (the HMI-configured cell or ancestor).
	 */
	EventDispatcher.prototype.getEventCell = function(me)
	{
		var cell = (me.getState() != null) ? me.getState().cell : me.getCell();

		return cell;
	};

	/**
	 * Installs mouse and keyboard handling.
	 */
	EventDispatcher.prototype.install = function()
	{
		if (this.installed)
		{
			return;
		}

		this.installed = true;
		var self = this;
		var rt = this.rt;
		var graph = rt.graph;

		this.mouseListener = {
			mouseDown: function(sender, me)
			{
				if (!self.isEnabled())
				{
					return;
				}

				var cell = self.getEventCell(me);

				if (cell != null)
				{
					self.pressed = cell;
					self.pressStart = Date.now();
					self.fire(cell, 'mousedown');
					self.widgetMouseDown(cell, me);

					if (self.longTimer != null)
					{
						clearTimeout(self.longTimer);
					}

					self.longTimer = setTimeout(function()
					{
						self.longTimer = null;

						if (self.pressed == cell)
						{
							self.longPressed = self.fire(cell, 'longpress');
						}
					}, LONGPRESS_MS);

					if (self.isHandled(cell))
					{
						me.consume();
					}
				}
			},
			mouseMove: function(sender, me)
			{
				if (!self.isEnabled())
				{
					return;
				}

				self.updateHover(self.getEventCell(me));

				if (self.dragging != null)
				{
					self.widgetDrag(me);
					me.consume();
				}
			},
			mouseUp: function(sender, me)
			{
				if (!self.isEnabled())
				{
					return;
				}

				if (self.longTimer != null)
				{
					clearTimeout(self.longTimer);
					self.longTimer = null;
				}

				var cell = self.getEventCell(me);

				if (self.dragging != null)
				{
					self.widgetDragEnd(me);
					me.consume();
				}

				if (self.pressed != null)
				{
					self.widgetMouseUp(self.pressed);
				}

				if (cell != null)
				{
					self.fire(cell, 'mouseup');
				}

				self.pressed = null;
			}
		};
		graph.addMouseListener(this.mouseListener);

		this.clickListener = function(sender, evt)
		{
			var cell = evt.getProperty('cell');

			if (!self.isEnabled() || cell == null || self.longPressed)
			{
				self.longPressed = false;

				return;
			}

			var handled = self.fire(cell, 'click');

			if (!handled)
			{
				handled = self.widgetClick(cell);
			}

			if (handled)
			{
				evt.consume();
			}
		};
		graph.addListener(mxEvent.CLICK, this.clickListener);

		this.dblClickListener = function(sender, evt)
		{
			var cell = evt.getProperty('cell');

			if (self.isEnabled() && cell != null && self.fire(cell, 'dblclick'))
			{
				evt.consume();
			}
		};
		graph.addListener(mxEvent.DOUBLE_CLICK, this.dblClickListener);

		if (graph.container != null)
		{
			this.contextListener = function(evt)
			{
				if (!self.isEnabled())
				{
					return;
				}

				var pt = mxUtils.convertPoint(graph.container, mxEvent.getClientX(evt),
					mxEvent.getClientY(evt));
				var cell = graph.getCellAt(pt.x, pt.y);

				if (cell != null && self.fire(cell, 'contextmenu'))
				{
					mxEvent.consume(evt);
				}
			};
			mxEvent.addListener(graph.container, 'contextmenu', this.contextListener);

			this.keyListener = function(evt)
			{
				self.keyDown(evt);
			};
			mxEvent.addListener(graph.container, 'keydown', this.keyListener);
		}

		// Link clicks are handled by HMI events when present
		this.graphIsCustomLink = null;
	};

	EventDispatcher.prototype.uninstall = function()
	{
		if (!this.installed)
		{
			return;
		}

		var graph = this.rt.graph;
		graph.removeMouseListener(this.mouseListener);
		graph.removeListener(this.clickListener);
		graph.removeListener(this.dblClickListener);

		if (graph.container != null)
		{
			mxEvent.removeListener(graph.container, 'contextmenu', this.contextListener);
			mxEvent.removeListener(graph.container, 'keydown', this.keyListener);
		}

		this.updateHover(null);
		this.closeEditor(false);
		this.installed = false;
	};

	/**
	 * Returns true if the cell (or an ancestor) has events or is a control.
	 */
	EventDispatcher.prototype.isHandled = function(cell)
	{
		var model = this.rt.graph.model;
		var current = cell;

		while (current != null)
		{
			var cfg = (this.rt.index != null) ? this.rt.index.cells[current.id] : null;

			if (cfg != null && cfg.events.length > 0)
			{
				return true;
			}

			current = model.getParent(current);
		}

		return this.getControlWidget(cell) != null;
	};

	/**
	 * Fires enter/leave for the hover path.
	 */
	EventDispatcher.prototype.updateHover = function(cell)
	{
		if (cell == this.hoverCell)
		{
			return;
		}

		if (this.hoverCell != null)
		{
			this.fire(this.hoverCell, 'leave');
		}

		this.hoverCell = cell;

		if (cell != null)
		{
			this.fire(cell, 'enter');
		}

		// Pointer cursor for interactive cells
		var container = this.rt.graph.container;

		if (container != null)
		{
			container.style.cursor = (cell != null && this.isHandled(cell)) ? 'pointer' : '';
		}
	};

	/**
	 * Returns the control widget name if the cell is an interactive widget
	 * with a value binding, or null.
	 */
	EventDispatcher.prototype.getControlWidget = function(cell)
	{
		var state = (cell != null) ? this.rt.graph.view.getState(cell) : null;
		var widget = (state != null) ? EventDispatcher.getWidget(state.style) : null;

		if (widget == 'switch' || widget == 'button' || widget == 'slider' ||
			widget == 'numInput' || widget == 'dropdown')
		{
			var cfg = (this.rt.index != null) ? this.rt.index.cells[cell.id] : null;

			if (cfg != null && cfg.disabled)
			{
				return null;
			}

			if (mxUtils.getValue(state.style, 'hmiDisabled', '0') == '1')
			{
				return null;
			}

			return widget;
		}

		return null;
	};

	/**
	 * Default click behaviour of control widgets. Returns true if handled.
	 */
	EventDispatcher.prototype.widgetClick = function(cell)
	{
		var widget = this.getControlWidget(cell);
		var tag = this.getValueTag(cell);

		if (widget == null || tag == null)
		{
			return false;
		}

		var rt = this.rt;
		var state = rt.graph.view.getState(cell);
		var confirm = mxUtils.getValue(state.style, 'hmiConfirm', '1') != '0';
		var write = function(value)
		{
			var doWrite = function()
			{
				rt.writer.write(tag, value, {cell: cell})['catch'](function(e)
				{
					Hmi.Actions.toast(e.message, 'error');
				});
			};

			if (confirm)
			{
				rt.events.confirm({text: mxResources.get('hmiConfirmWrite',
					[tag, String(value)])}, doWrite);
			}
			else
			{
				doWrite();
			}
		};

		if (widget == 'switch')
		{
			write(!Hmi.BindingEngine.toBool(rt.tags.getValue(tag)));

			return true;
		}
		else if (widget == 'button')
		{
			if (mxUtils.getValue(state.style, 'hmiMode', 'momentary') == 'latched')
			{
				write(!Hmi.BindingEngine.toBool(rt.tags.getValue(tag)));
			}

			return true;
		}
		else if (widget == 'numInput' || widget == 'dropdown')
		{
			this.openEditor(cell, widget, tag);

			return true;
		}

		return widget == 'slider';
	};

	/**
	 * Momentary buttons write 1 on press and 0 on release (no confirmation
	 * as the operator holds the button), sliders start dragging.
	 */
	EventDispatcher.prototype.widgetMouseDown = function(cell, me)
	{
		var widget = this.getControlWidget(cell);
		var tag = this.getValueTag(cell);
		var rt = this.rt;

		if (widget == 'button' && tag != null)
		{
			var state = rt.graph.view.getState(cell);
			rt.overlay.setStyle(cell.id, 'hmiPressed', '1', 'action');
			rt.requestFlush();

			if (mxUtils.getValue(state.style, 'hmiMode', 'momentary') == 'momentary')
			{
				this.momentary = {cell: cell, tag: tag};
				rt.writer.write(tag, true, {cell: cell})['catch'](function(e)
				{
					Hmi.Actions.toast(e.message, 'error');
				});
			}
		}
		else if (widget == 'slider' && tag != null)
		{
			this.dragging = {cell: cell, tag: tag};
			this.widgetDrag(me);
		}
	};

	EventDispatcher.prototype.widgetMouseUp = function(cell)
	{
		var rt = this.rt;

		if (this.getControlWidget(cell) == 'button')
		{
			rt.overlay.setStyle(cell.id, 'hmiPressed', null, 'action');
			rt.requestFlush();
		}

		if (this.momentary != null)
		{
			var m = this.momentary;
			this.momentary = null;
			rt.writer.write(m.tag, false, {cell: m.cell})['catch'](function(e)
			{
				Hmi.Actions.toast(e.message, 'error');
			});
		}
	};

	/**
	 * Returns the slider value for a mouse position.
	 */
	EventDispatcher.prototype.getSliderValue = function(state, x, y)
	{
		var style = state.style;
		var min = num(style, ['hmiMin', 'min'], 0);
		var max = num(style, ['hmiMax', 'max'], 100);
		var step = num(style, ['hmiStep', 'step'], 0);
		var vertical = mxUtils.getValue(style, 'orientation', 'horizontal') == 'vertical';
		var f = vertical ? 1 - (y - state.y) / Math.max(1, state.height) :
			(x - state.x) / Math.max(1, state.width);
		f = Math.max(0, Math.min(1, f));
		var value = min + f * (max - min);

		if (step > 0)
		{
			value = Math.round(value / step) * step;
		}

		return Math.round(value * 1e6) / 1e6;
	};

	EventDispatcher.prototype.widgetDrag = function(me)
	{
		var d = this.dragging;
		var state = this.rt.graph.view.getState(d.cell);

		if (state != null)
		{
			d.value = this.getSliderValue(state, me.getGraphX(), me.getGraphY());
			this.rt.overlay.setStyle(d.cell.id, 'hmiValue', d.value, 'action');
			this.rt.requestFlush();
		}
	};

	EventDispatcher.prototype.widgetDragEnd = function(me)
	{
		var d = this.dragging;
		var rt = this.rt;
		this.dragging = null;

		if (d != null && d.value != null)
		{
			rt.writer.write(d.tag, d.value, {cell: d.cell}).then(function()
			{
				rt.overlay.setStyle(d.cell.id, 'hmiValue', null, 'action');
				rt.requestFlush();
			}, function(e)
			{
				rt.overlay.setStyle(d.cell.id, 'hmiValue', null, 'action');
				rt.requestFlush();
				Hmi.Actions.toast(e.message, 'error');
			});
		}
	};

	/**
	 * Shows an HTML input or select over a numInput or dropdown widget.
	 */
	EventDispatcher.prototype.openEditor = function(cell, widget, tag)
	{
		this.closeEditor(false);

		var rt = this.rt;
		var graph = rt.graph;
		var state = graph.view.getState(cell);

		if (state == null || graph.container == null)
		{
			return;
		}

		var elt;
		var current = rt.tags.getValue(tag);

		if (widget == 'dropdown')
		{
			elt = document.createElement('select');
			var options = String(mxUtils.getValue(state.style, 'hmiOptions', '')).split(',');

			for (var i = 0; i < options.length; i++)
			{
				var sep = options[i].indexOf(':');
				var opt = document.createElement('option');
				opt.value = (sep >= 0) ? options[i].substring(0, sep) : options[i];
				mxUtils.write(opt, (sep >= 0) ? options[i].substring(sep + 1) : options[i]);

				if (String(current) == opt.value)
				{
					opt.selected = true;
				}

				elt.appendChild(opt);
			}
		}
		else
		{
			elt = document.createElement('input');
			var def = rt.tags.getDef(tag);
			elt.type = (def != null && def.type == 'string') ? 'text' : 'number';

			if (def != null && def.min != null)
			{
				elt.min = def.min;
			}

			if (def != null && def.max != null)
			{
				elt.max = def.max;
			}

			elt.value = (current != null) ? String(current) : '';
		}

		elt.setAttribute('aria-label', tag);
		elt.className = 'geHmiEditor';
		elt.style.cssText = 'position:absolute;box-sizing:border-box;z-index:3;font-size:' +
			Math.max(11, Math.round(12 * graph.view.scale)) + 'px;' +
			'left:' + state.x + 'px;top:' + state.y + 'px;width:' + state.width +
			'px;height:' + state.height + 'px;';
		graph.container.appendChild(elt);
		elt.focus();

		if (elt.select != null && widget != 'dropdown')
		{
			elt.select();
		}

		var self = this;
		this.editor = {elt: elt, cell: cell, tag: tag};

		var commit = function()
		{
			self.closeEditor(true);
		};

		mxEvent.addListener(elt, 'keydown', function(evt)
		{
			if (evt.keyCode == 13)
			{
				commit();
				mxEvent.consume(evt);
			}
			else if (evt.keyCode == 27)
			{
				self.closeEditor(false);
				mxEvent.consume(evt);
			}
		});

		if (widget == 'dropdown')
		{
			mxEvent.addListener(elt, 'change', commit);
		}

		mxEvent.addListener(elt, 'blur', function()
		{
			self.closeEditor(false);
		});
	};

	EventDispatcher.prototype.closeEditor = function(commit)
	{
		var ed = this.editor;

		if (ed != null)
		{
			this.editor = null;
			var value = ed.elt.value;

			if (ed.elt.parentNode != null)
			{
				ed.elt.parentNode.removeChild(ed.elt);
			}

			if (commit)
			{
				var rt = this.rt;
				rt.writer.write(ed.tag, value, {cell: ed.cell})['catch'](function(e)
				{
					Hmi.Actions.toast(e.message, 'error');
				});
				this.fire(ed.cell, 'change', {value: value});
			}
		}
	};

	/**
	 * Keyboard operation of focused widgets (HMI-WGT-22).
	 */
	EventDispatcher.prototype.keyDown = function(evt)
	{
		if (!this.isEnabled())
		{
			return;
		}

		var target = evt.target;
		var id = (target != null && target.getAttribute != null) ?
			target.getAttribute('data-hmi-cell') : null;
		var cell = (id != null) ? this.rt.getCell(id) : null;

		if (cell == null)
		{
			return;
		}

		var widget = this.getControlWidget(cell);

		if (evt.keyCode == 13 || evt.keyCode == 32)
		{
			if (!this.fire(cell, 'click'))
			{
				this.widgetClick(cell);
			}

			mxEvent.consume(evt);
		}
		else if (widget == 'slider' && evt.keyCode >= 37 && evt.keyCode <= 40)
		{
			var tag = this.getValueTag(cell);
			var state = this.rt.graph.view.getState(cell);
			var min = num(state.style, ['hmiMin', 'min'], 0);
			var max = num(state.style, ['hmiMax', 'max'], 100);
			var step = num(state.style, ['hmiStep', 'step'], (max - min) / 100);
			var value = parseFloat(this.rt.tags.getValue(tag));
			value = (isNaN(value) ? min : value) + ((evt.keyCode == 37 || evt.keyCode == 40) ?
				-step : step);
			value = Math.max(min, Math.min(max, value));
			this.rt.writer.write(tag, Math.round(value * 1e6) / 1e6, {cell: cell})['catch'](
				function(e)
				{
					Hmi.Actions.toast(e.message, 'error');
				});
			mxEvent.consume(evt);
		}
	};

	/**
	 * Makes interactive cells focusable with ARIA roles (HMI-WGT-22).
	 */
	EventDispatcher.prototype.decorate = function()
	{
		var rt = this.rt;

		if (rt.index == null)
		{
			return;
		}

		var roles = {switch: 'switch', button: 'button', slider: 'slider',
			numInput: 'textbox', dropdown: 'listbox'};

		for (var id in rt.index.cells)
		{
			var cell = rt.index.cells[id].cell;
			var state = rt.graph.view.getState(cell);

			if (state != null && state.shape != null && state.shape.node != null &&
				this.isHandled(cell))
			{
				var node = state.shape.node;
				var widget = this.getControlWidget(cell);
				node.setAttribute('tabindex', '0');
				node.setAttribute('data-hmi-cell', id);
				node.setAttribute('role', (widget != null) ? roles[widget] : 'button');
				node.setAttribute('aria-label', rt.graph.convertValueToString(cell) || id);

				if (widget == 'switch')
				{
					var tag = this.getValueTag(cell);
					node.setAttribute('aria-checked', Hmi.BindingEngine.toBool(
						rt.tags.getValue(tag)) ? 'true' : 'false');
				}
			}
		}
	};

	Hmi.EventDispatcher = EventDispatcher;
})();
