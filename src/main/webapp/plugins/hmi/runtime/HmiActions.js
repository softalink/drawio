/**
 * Runtime action executors (SRS HMI-EVT-5, ARCHITECTURE.md §2.2 Action).
 *
 * Action types follow meta2d.js EventAction (MIT, le5le) where applicable.
 * Visual changes go to the overlay 'action' layer and never to the model.
 */
(function()
{
	var root = (typeof globalThis !== 'undefined') ? globalThis : window;
	var Hmi = root.Hmi = root.Hmi || {};

	function Actions(rt)
	{
		this.rt = rt;
	};

	/**
	 * Registry of action executors: function(rt, action, ctx) → Promise|value.
	 */
	Actions.types = {};

	function delay(ms)
	{
		return new Promise(function(resolve)
		{
			setTimeout(resolve, ms);
		});
	};

	/**
	 * Runs the actions sequentially. ctx = {cell, event, value, handler}.
	 */
	Actions.prototype.run = function(actions, ctx)
	{
		var rt = this.rt;
		var self = this;
		ctx = ctx || {};

		if (actions == null || actions.length == 0)
		{
			return Promise.resolve();
		}

		var index = 0;
		var stopOnError = ctx.handler != null && ctx.handler.stopOnError;

		function next()
		{
			if (index >= actions.length || !rt.running)
			{
				return Promise.resolve();
			}

			var action = actions[index++];
			var wait = (action.delay > 0) ? delay(action.delay) : Promise.resolve();

			return wait.then(function()
			{
				return self.execute(action, ctx);
			}).then(next, function(e)
			{
				rt.log('error', 'action', 'Action ' + action.type + ' failed' +
					((ctx.cell != null) ? ' on ' + ctx.cell.id : '') + ': ' +
					((e != null && e.message != null) ? e.message : e));

				if (!stopOnError)
				{
					return next();
				}
			});
		};

		return next();
	};

	/**
	 * Executes a single action.
	 */
	Actions.prototype.execute = function(action, ctx)
	{
		var fn = Actions.types[action.type];

		if (fn == null)
		{
			return Promise.reject(new Error('Unknown action type ' + action.type));
		}

		try
		{
			return Promise.resolve(fn(this.rt, action, ctx || {}));
		}
		catch (e)
		{
			return Promise.reject(e);
		}
	};

	/**
	 * Resolves ${var} in all string values of an object.
	 */
	function resolveObject(rt, obj, cell)
	{
		var result = {};

		for (var key in obj)
		{
			var value = obj[key];
			result[key] = (typeof value === 'string') ? rt.resolveVars(value, cell) : value;
		}

		return result;
	};

	/**
	 * Returns the value for writeTag.
	 */
	function getWriteValue(rt, action, ctx)
	{
		if (action.fromWidget)
		{
			return Promise.resolve(ctx.value);
		}
		else if (action.expr != null && action.expr !== '')
		{
			var bindings = new Hmi.BindingEngine(rt);

			return Promise.resolve(Hmi.Expr.evaluate(action.expr,
				bindings.createEnv(ctx.cell, ctx.value)));
		}
		else if (action.prompt != null)
		{
			return new Promise(function(resolve, reject)
			{
				var title = (typeof action.prompt === 'object' && action.prompt.title) ?
					action.prompt.title : mxResources.get('hmiEnterValue');
				var current = rt.tags.getValue(action.tag);
				var dlg = new FilenameDialog(rt.ui, (current != null) ? String(current) : '',
					mxResources.get('ok'), function(value)
					{
						if (value != null)
						{
							resolve(value);
						}
						else
						{
							reject(new Error('Cancelled'));
						}
					}, mxUtils.htmlEntities(title));
				rt.ui.showDialog(dlg.container, 300, 80, true, true);
				dlg.init();
			});
		}

		var value = action.value;

		return Promise.resolve((typeof value === 'string') ?
			rt.resolveVars(value, ctx.cell) : value);
	};

	Actions.types.setProps = function(rt, action, ctx)
	{
		var cells = rt.resolveTargets(action.target, ctx.cell);

		for (var i = 0; i < cells.length; i++)
		{
			var id = cells[i].id;

			if (action.style != null)
			{
				rt.overlay.setStyles(id, resolveObject(rt, action.style, cells[i]), 'action');
			}

			if (action.attrs != null)
			{
				var attrs = resolveObject(rt, action.attrs, cells[i]);

				for (var name in attrs)
				{
					rt.overlay.setAttribute(id, name, attrs[name], 'action');
				}
			}

			if (action.label != null)
			{
				rt.overlay.setLabel(id, rt.resolveVars(String(action.label), cells[i]), 'action');
			}

			if (action.visible != null)
			{
				rt.overlay.setVisible(id, Hmi.BindingEngine.toBool(action.visible), 'action');
			}

			if (action.reset)
			{
				rt.overlay.clearLayer('action', id);
			}
		}

		rt.requestFlush();
	};

	Actions.types.writeTag = function(rt, action, ctx)
	{
		return getWriteValue(rt, action, ctx).then(function(value)
		{
			return rt.writer.write(action.tag, value, {cell: ctx.cell});
		});
	};

	Actions.types.toggleTag = function(rt, action, ctx)
	{
		return rt.writer.toggle(action.tag, {cell: ctx.cell});
	};

	Actions.types.pulseTag = function(rt, action, ctx)
	{
		return rt.writer.pulse(action.tag, (action.value != null) ? action.value : 1,
			(action.reset != null) ? action.reset : 0, action.ms || 500, {cell: ctx.cell});
	};

	/**
	 * Returns the page for the given id or name.
	 */
	Actions.findPage = function(ui, idOrName)
	{
		if (ui.pages != null)
		{
			for (var i = 0; i < ui.pages.length; i++)
			{
				if (ui.pages[i].getId() == idOrName)
				{
					return ui.pages[i];
				}
			}

			for (var i = 0; i < ui.pages.length; i++)
			{
				if (ui.pages[i].getName() == idOrName)
				{
					return ui.pages[i];
				}
			}
		}

		return null;
	};

	Actions.types.navigate = function(rt, action, ctx)
	{
		if (action.page != null)
		{
			var page = Actions.findPage(rt.ui, rt.resolveVars(String(action.page), ctx.cell));

			if (page == null)
			{
				throw new Error('Page not found: ' + action.page);
			}

			if (page != rt.ui.currentPage)
			{
				rt.ui.selectPage(page);
			}
		}
		else if (action.url != null)
		{
			var url = Graph.sanitizeLink(rt.resolveVars(action.url, ctx.cell));

			if (url != null)
			{
				window.location.href = url;
			}
		}
	};

	Actions.types.openUrl = function(rt, action, ctx)
	{
		var url = Graph.sanitizeLink(rt.resolveVars(action.url, ctx.cell));

		if (url == null)
		{
			throw new Error('URL not allowed');
		}

		var target = action.target || '_blank';

		if (target == '_self')
		{
			window.location.href = url;
		}
		else
		{
			var wnd = window.open(url, target);

			if (wnd != null)
			{
				wnd.opener = null;
			}
		}
	};

	Actions.types.dialog = function(rt, action, ctx)
	{
		if (Hmi.Faceplate == null)
		{
			throw new Error('Dialogs are not available');
		}

		if (action.page != null)
		{
			var page = Actions.findPage(rt.ui, rt.resolveVars(String(action.page), ctx.cell));

			if (page == null)
			{
				throw new Error('Page not found: ' + action.page);
			}

			Hmi.Faceplate.showPage(rt, page, action);
		}
		else if (action.url != null)
		{
			var url = Graph.sanitizeLink(rt.resolveVars(action.url, ctx.cell));

			if (url == null)
			{
				throw new Error('URL not allowed');
			}

			Hmi.Faceplate.showUrl(rt, url, action);
		}
	};

	function animationAction(method)
	{
		return function(rt, action, ctx)
		{
			var cells = rt.resolveTargets(action.target, ctx.cell);

			for (var i = 0; i < cells.length; i++)
			{
				rt.animator[method](cells[i].id, action.name);
			}

			rt.requestFlush();
		};
	};

	Actions.types.startAnimation = animationAction('start');
	Actions.types.pauseAnimation = animationAction('pause');
	Actions.types.stopAnimation = animationAction('stop');

	Actions.types.emit = function(rt, action, ctx)
	{
		var payload = (typeof action.payload === 'string') ?
			rt.resolveVars(action.payload, ctx.cell) : action.payload;
		rt.fire('message', {name: action.name, payload: payload,
			cellId: (ctx.cell != null) ? ctx.cell.id : null});
		rt.events.fireMessage(action.name, payload);
	};

	Actions.types.send = function(rt, action, ctx)
	{
		var payload = action.payload;

		if (payload != null && typeof payload === 'object')
		{
			payload = JSON.stringify(payload);
		}

		payload = rt.resolveVars((payload != null) ? String(payload) : '', ctx.cell);

		return rt.sources.write(action.source, {
			topic: rt.resolveVars(action.topic, ctx.cell),
			payload: payload, message: payload, body: payload,
			qos: action.qos, retain: action.retain, method: action.method,
			url: rt.resolveVars(action.url, ctx.cell), headers: action.headers
		});
	};

	Actions.types.notify = function(rt, action, ctx)
	{
		Actions.toast(rt.resolveVars(String(action.text || ''), ctx.cell), action.level);
	};

	Actions.types.postMessage = function(rt, action, ctx)
	{
		var data = action.data;

		if (typeof data === 'string')
		{
			data = rt.resolveVars(data, ctx.cell);
		}

		if (action.to == null || action.to == 'parent')
		{
			var target = window.opener || window.parent;

			if (target != null && target != window)
			{
				target.postMessage(JSON.stringify({event: 'hmiPostMessage', data: data,
					cellId: (ctx.cell != null) ? ctx.cell.id : null}), '*');
			}
		}
		else
		{
			var state = rt.graph.view.getState(rt.getCell(action.to));
			var frame = (state != null && state.text != null && state.text.node != null) ?
				state.text.node.getElementsByTagName('iframe')[0] : null;

			if (frame != null && frame.contentWindow != null)
			{
				frame.contentWindow.postMessage(JSON.stringify(data), '*');
			}
			else
			{
				throw new Error('No iframe in cell ' + action.to);
			}
		}
	};

	Actions.types.script = function(rt, action, ctx)
	{
		return rt.runScript(action.code, {value: ctx.value, event: ctx.event}, ctx.cell);
	};

	Actions.types.drawioAction = function(rt, action, ctx)
	{
		if (action.action != null)
		{
			var list = (action.action.length != null) ? action.action : [action.action];

			// Transient by default: runtime actions never change the model
			for (var i = 0; i < list.length; i++)
			{
				for (var key in list[i])
				{
					if (list[i][key] != null && typeof list[i][key] === 'object' &&
						list[i][key].transient == null)
					{
						list[i][key].transient = true;
					}
				}
			}

			return new Promise(function(resolve)
			{
				rt.graph.executeCustomActions(list, resolve, null);
			});
		}
	};

	Actions.types.ackAlarms = function(rt, action, ctx)
	{
		rt.alarms.ack(action.tag);
	};

	Actions.types.playMedia = function(rt, action, ctx)
	{
		var cells = rt.resolveTargets(action.target, ctx.cell);

		for (var i = 0; i < cells.length; i++)
		{
			var state = rt.graph.view.getState(cells[i]);

			if (state != null && state.text != null && state.text.node != null)
			{
				var media = state.text.node.querySelectorAll('video,audio');

				for (var j = 0; j < media.length; j++)
				{
					if (action.command == 'pause')
					{
						media[j].pause();
					}
					else if (action.command == 'stop')
					{
						media[j].pause();
						media[j].currentTime = 0;
					}
					else
					{
						media[j].play();
					}
				}
			}
		}
	};

	/**
	 * Shows a transient toast message (SRS notify action).
	 */
	Actions.toast = function(text, level)
	{
		var div = document.createElement('div');
		div.className = 'geHmiToast geHmiToast-' + (level || 'info');
		div.setAttribute('role', (level == 'error') ? 'alert' : 'status');
		mxUtils.write(div, text);
		div.style.cssText = 'position:fixed;left:50%;bottom:32px;transform:translateX(-50%);' +
			'z-index:100000;padding:8px 16px;border-radius:4px;font:13px sans-serif;' +
			'color:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);max-width:80%;' +
			'background:' + ((level == 'error') ? '#C62828' : ((level == 'warn') ?
			'#E65100' : '#37474F')) + ';';
		document.body.appendChild(div);

		setTimeout(function()
		{
			if (div.parentNode != null)
			{
				div.parentNode.removeChild(div);
			}
		}, (level == 'error') ? 6000 : 3000);
	};

	/**
	 * Handler for {"hmi": action} entries in draw.io custom links (H7).
	 */
	Actions.handleCustomAction = function(graph, action, cell)
	{
		var rt = (graph.hmiRuntime != null && graph.hmiRuntime.running) ?
			graph.hmiRuntime : null;

		if (rt != null)
		{
			rt.actions.run((action.length != null) ? action : [action], {cell: cell});
		}
	};

	Hmi.Actions = Actions;
})();
