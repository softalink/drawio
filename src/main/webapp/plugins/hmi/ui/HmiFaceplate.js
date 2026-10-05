/**
 * Hmi.Faceplate: 'dialog' action rendering (ARCHITECTURE.md §2.2 Action
 * "dialog"). showPage renders another page read-only in an mxWindow, with
 * its own overlay and index bound to the SAME rt.tags. showUrl renders a
 * sandboxed iframe. Multiple faceplates may be open at once.
 *
 * The faceplate uses a "proxy rt" (Object.create(rt) with graph/overlay/
 * index overridden) so Hmi.Actions / Hmi.EventDispatcher work unmodified
 * against the faceplate's own graph while writeTag/toggleTag/etc. still go
 * through the real writer/sources/scripts of the owning runtime.
 *
 * Limitation: animations are not driven inside faceplates (no rAF loop);
 * bindings, InTouch animation links and click actions work fully.
 *
 * action = {title, width, height, x, y, screen: {x, y, anchor}, windowType}
 * where x/y are the window's top-left screen position and screen places the
 * window centre ('center') or top-left corner ('topleft') at a screen point
 * (ShowAt/ShowTopLeftAt, INTOUCH_LINKS.md §8). windowType 'popup' is modal.
 */
(function()
{
	var root = (typeof globalThis !== 'undefined') ? globalThis : window;
	var Hmi = root.Hmi = root.Hmi || {};

	var Faceplate = {};
	var seq = 0;

	/**
	 * Round-trips the page's model through mxCodec (the same technique used
	 * for file save/load) so the faceplate gets an independent mxCell tree
	 * and the main model is never touched.
	 */
	function cloneModel(page)
	{
		var tempModel = new mxGraphModel(page.root);
		var enc = new mxCodec(mxUtils.createXmlDocument());
		var node = enc.encode(tempModel);
		var newModel = new mxGraphModel();
		var dec = new mxCodec(node.ownerDocument);
		dec.decode(node, newModel);

		return newModel;
	};

	Faceplate.showPage = function(rt, page, action)
	{
		var ui = rt.ui;

		if (ui.updatePageRoot != null && page.root == null)
		{
			ui.updatePageRoot(page);
		}

		var container = document.createElement('div');
		container.style.cssText = 'position:relative;overflow:hidden;background:#fff;';

		var model = null;

		try
		{
			model = cloneModel(page);
		}
		catch (e)
		{
			rt.log('error', 'faceplate', 'Failed to clone page: ' + e.message);
		}

		var graph = new Graph(container, model);
		graph.setEnabled(false);
		graph.setTooltips(true);
		graph.setPanning(true);

		graph.hmiOverlay = new Hmi.Overlay(graph);
		var overlay = graph.hmiOverlay;
		overlay.tagResolver = function(name)
		{
			return rt.tags.get(name);
		};
		overlay.tagDefResolver = function(name)
		{
			return rt.tags.getDef(name);
		};

		var proxy = Object.create(rt);
		proxy.mainRuntime = rt.mainRuntime || rt;
		proxy.graph = graph;
		proxy.overlay = overlay;
		proxy.index = Hmi.Model.scan(graph);
		proxy.getCell = function(id)
		{
			return graph.model.getCell(id);
		};
		proxy.requestFlush = function()
		{
			overlay.flush(false);
		};
		proxy.log = function(level, category, message, data)
		{
			rt.log(level, 'faceplate.' + category, message, data);
		};

		proxy.bindings = new Hmi.BindingEngine(proxy);
		proxy.bindings.build(proxy.index);
		proxy.links = (Hmi.LinkEngine != null) ? new Hmi.LinkEngine(proxy) : null;
		proxy.events = new Hmi.EventDispatcher(proxy);
		proxy.actions = new Hmi.Actions(proxy);
		proxy.events.install();
		proxy.events.decorate();

		if (proxy.links != null)
		{
			proxy.links.build(proxy.index);
			proxy.links.install();
		}

		var updateAll = function()
		{
			var names = [];

			for (var tag in proxy.index.tags)
			{
				names.push(tag);
			}

			proxy.bindings.update(names);

			if (proxy.links != null)
			{
				proxy.links.update(names);
			}

			overlay.flush(false);
		};
		updateAll();

		var tagsListener = function(names)
		{
			proxy.bindings.update(names);

			if (proxy.links != null)
			{
				proxy.links.update(names);
			}

			overlay.flush(false);
		};
		rt.on('tags', tagsListener);

		var alarmListener = function(evt)
		{
			if (proxy.links != null && evt != null && evt.changed != null)
			{
				proxy.links.update(evt.changed);
				overlay.flush(false);
			}
		};
		rt.on('alarm', alarmListener);

		graph.fit(30);
		graph.view.setTranslate(30, 30);

		if (proxy.links != null)
		{
			proxy.links.decorate();
		}

		var title = (action != null && action.title != null) ? action.title : page.getName();
		var width = (action != null && action.width) || 480;
		var height = (action != null && action.height) || 360;

		var pos = Faceplate.getPosition(action, width, height);

		var wnd = new mxWindow(title, container, pos.x, pos.y, width, height, true, true);
		wnd.setMaximizable(true);
		wnd.setResizable(true);
		wnd.setClosable(true);
		wnd.destroyOnClose = true;
		proxy.faceplateWindow = wnd;
		wnd.hmiRuntime = proxy;

		// Popup windows are modal (InTouch popup window type)
		var backdrop = null;

		if (action != null && action.windowType == 'popup')
		{
			backdrop = document.createElement('div');
			backdrop.className = 'geHmiPopupBackdrop';
			var z = parseInt(wnd.div.style.zIndex) || 3;
			backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.15);' +
				'z-index:' + z + ';';
			wnd.div.style.zIndex = z + 1;
			document.body.appendChild(backdrop);
		}

		wnd.setVisible(true);

		wnd.addListener('resize', function()
		{
			graph.doResizeContainer(container.clientWidth, container.clientHeight);
			graph.fit(30);
		});

		var closed = false;
		var cleanup = function()
		{
			if (!closed)
			{
				closed = true;
				rt.off('tags', tagsListener);
				rt.off('alarm', alarmListener);
				proxy.events.uninstall();

				if (proxy.links != null)
				{
					proxy.links.uninstall();
				}

				if (backdrop != null && backdrop.parentNode != null)
				{
					backdrop.parentNode.removeChild(backdrop);
				}

				graph.destroy();
			}
		};

		wnd.addListener(mxEvent.CLOSE, cleanup);
		wnd.addListener(mxEvent.DESTROY, cleanup);

		return wnd;
	};

	/**
	 * Returns the top-left screen position of a new window.
	 */
	Faceplate.getPosition = function(action, width, height)
	{
		var x = null;
		var y = null;

		if (action != null && action.screen != null)
		{
			var anchor = action.screen.anchor || 'center';
			x = (anchor == 'topleft') ? action.screen.x : action.screen.x - width / 2;
			y = (anchor == 'topleft') ? action.screen.y : action.screen.y - height / 2;
		}
		else if (action != null && action.x != null && action.y != null &&
			!isNaN(parseFloat(action.x)) && !isNaN(parseFloat(action.y)))
		{
			x = parseFloat(action.x);
			y = parseFloat(action.y);
		}

		if (x == null || y == null)
		{
			var vw = window.innerWidth || document.body.offsetWidth;
			var vh = window.innerHeight || document.body.offsetHeight;
			x = (vw - width) / 2 + (seq % 5) * 24;
			y = Math.max(40, (vh - height) / 3 + (seq % 5) * 24);
			seq++;
		}

		return {x: Math.max(0, Math.round(x)), y: Math.max(0, Math.round(y))};
	};

	Faceplate.showUrl = function(rt, url, action)
	{
		var container = document.createElement('div');
		container.style.cssText = 'overflow:hidden;';

		var iframe = document.createElement('iframe');
		iframe.setAttribute('src', url);
		iframe.setAttribute('sandbox', 'allow-scripts allow-forms');
		iframe.style.cssText = 'width:100%;height:100%;border:0;display:block;';
		container.appendChild(iframe);

		var title = (action != null && action.title != null) ? action.title : url;
		var width = (action != null && action.width) || 480;
		var height = (action != null && action.height) || 360;

		var x = Math.max(0, (document.body.offsetWidth - width) / 2 + (seq % 5) * 24);
		var y = Math.max(40, (document.body.offsetHeight - height) / 3 + (seq % 5) * 24);
		seq++;

		var wnd = new mxWindow(title, container, x, y, width, height, true, true);
		wnd.setMaximizable(true);
		wnd.setResizable(true);
		wnd.setClosable(true);
		wnd.setVisible(true);

		wnd.addListener('resize', function()
		{
			iframe.style.height = container.clientHeight + 'px';
		});

		return wnd;
	};

	Hmi.Faceplate = Faceplate;
})();
