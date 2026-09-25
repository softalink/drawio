/**
 * Hmi.Import: meta2d JSON importer (SRS HMI-IMP-1) and HMI screen HTML
 * export (SRS HMI-IMP-3). See ARCHITECTURE.md and docs/hmi/IMPLEMENTATION_PLAN.md §5 M7.
 *
 * meta2d.js (https://github.com/le5le-com/meta2d.js, MIT licensed, le5le) is
 * the source data model this importer reads: `Pen` (packages/core/src/pen/model.ts),
 * `Meta2dData` / `Network` (packages/core/src/store/store.ts) and `Event` /
 * `EventAction` / `Trigger` / `TriggerCondition` / `RealTime` / `Comparison`
 * (packages/core/src/event/event.ts). Credit: le5le.com, MIT licence.
 *
 * `Hmi.Import.convertMeta2d(data)` is the DOM-free core converter: it turns a
 * parsed meta2d JSON document into a plain JS model
 * `{cells: [Cell], docConfig, report: [string]}`. It uses no browser globals
 * so it can be `require()`-d and unit tested under Node (ARCHITECTURE.md §1).
 *
 * `Hmi.Import.renderXml(model)` renders that JS model to an `<mxGraphModel>`
 * XML string using string building and manual XML escaping -- also DOM-free.
 *
 * `Hmi.Import.meta2dToXml(data)` composes the two and returns
 * `{xml, report}`. `Hmi.Import.install(ui)` and `Hmi.Import.importMeta2d(ui, data)`
 * are the only parts of this file that touch draw.io/browser globals; they
 * are guarded so requiring this file in Node never throws.
 */
(function()
{
	var root = (typeof globalThis !== 'undefined' ? globalThis : window);
	var Hmi = root.Hmi = root.Hmi || {};

	var Import = {};

	// -----------------------------------------------------------------
	// small helpers (DOM-free)
	// -----------------------------------------------------------------

	function isArray(v)
	{
		return Object.prototype.toString.call(v) === '[object Array]';
	};

	function isObject(v)
	{
		return v != null && typeof v === 'object' && !isArray(v);
	};

	function isNum(v)
	{
		return typeof v === 'number' && !isNaN(v);
	};

	function num(v, def)
	{
		return isNum(v) ? v : (isNum(def) ? def : 0);
	};

	function uid(prefix, seq)
	{
		return prefix + seq;
	};

	function pushReport(report, msg)
	{
		report.push(msg);
	};

	// -----------------------------------------------------------------
	// pen shape -> draw.io style mapping
	// -----------------------------------------------------------------

	// pen.name -> base style fragment (without trailing ';')
	var SHAPE_STYLE = {
		rectangle: 'rounded=0;whiteSpace=wrap;html=1;',
		square: 'rounded=0;whiteSpace=wrap;html=1;',
		roundRectangle: 'rounded=1;whiteSpace=wrap;html=1;',
		circle: 'ellipse;whiteSpace=wrap;html=1;',
		ellipse: 'ellipse;whiteSpace=wrap;html=1;',
		diamond: 'rhombus;whiteSpace=wrap;html=1;',
		triangle: 'triangle;whiteSpace=wrap;html=1;',
		hexagon: 'shape=hexagon;perimeter=hexagonPerimeter2;whiteSpace=wrap;html=1;',
		pentagon: 'shape=mxgraph.basic.pentagon;whiteSpace=wrap;html=1;',
		octagon: 'shape=mxgraph.basic.octagon;whiteSpace=wrap;html=1;',
		cloud: 'ellipse;shape=cloud;whiteSpace=wrap;html=1;',
		parallelogram: 'shape=parallelogram;perimeter=parallelogramPerimeter;whiteSpace=wrap;html=1;',
		trapezoid: 'shape=trapezoid;perimeter=trapezoidPerimeter;whiteSpace=wrap;html=1;',
		cylinder: 'shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;',
		text: 'text;html=1;align=center;verticalAlign=middle;'
	};

	// meta2d widget pen names -> hmi widget shapes (shapes/hmi/*)
	var WIDGET_STYLE = {
		gauge: 'shape=mxgraph.hmi.radialGauge;whiteSpace=wrap;html=1;',
		switch: 'shape=mxgraph.hmi.switch;whiteSpace=wrap;html=1;',
		slider: 'shape=mxgraph.hmi.slider;whiteSpace=wrap;html=1;'
	};

	function styleToString(style)
	{
		var parts = [];

		for (var key in style)
		{
			if (Object.prototype.hasOwnProperty.call(style, key) && style[key] != null)
			{
				parts.push((key === '' ) ? style[key] : (key + '=' + style[key]));
			}
		}

		return parts.join(';') + (parts.length > 0 ? ';' : '');
	};

	/**
	 * Builds an SVG data URI for a meta2d svgPath pen (data.paths[pen.pathId]).
	 */
	function svgPathDataUri(pen, data)
	{
		var d = null;

		if (data != null && isObject(data.paths) && pen.pathId != null)
		{
			d = data.paths[pen.pathId];
		}

		if (d == null)
		{
			d = '';
		}

		var w = num(pen.width, 100);
		var h = num(pen.height, 100);
		var fill = pen.background || pen.color || '#000000';
		var stroke = pen.color || 'none';
		var strokeWidth = num(pen.lineWidth, 1);

		var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h +
			'" viewBox="0 0 ' + w + ' ' + h + '"><path d="' + d.replace(/"/g, '&quot;') +
			'" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + strokeWidth + '"/></svg>';

		var b64;

		if (typeof Buffer !== 'undefined')
		{
			b64 = Buffer.from(svg, 'utf8').toString('base64');
		}
		else if (typeof btoa !== 'undefined')
		{
			b64 = btoa(unescape(encodeURIComponent(svg)));
		}
		else
		{
			b64 = svg; // last resort, should not happen
		}

		return 'data:image/svg+xml;base64,' + b64;
	};

	var ARROW_MAP = {
		none: 'none',
		triangle: 'block',
		triangleSolid: 'block',
		diamond: 'diamond',
		circle: 'oval',
		line: 'open'
	};

	function mapArrow(v)
	{
		if (v == null || v === '')
		{
			return null;
		}

		return ARROW_MAP[v] || 'classic';
	};

	var LINE_ANIMATE_TYPE = { 0: 'dash', 1: 'beads', 2: 'dots', 3: 'arrows', 4: 'liquid' };

	// -----------------------------------------------------------------
	// pen -> Cell
	// -----------------------------------------------------------------

	/**
	 * Applies the common style properties shared by every pen kind
	 * (background, color, lineWidth, font, opacity, rotation, dash,
	 * borderRadius, progress-as-level) onto the given style map.
	 */
	function applyCommonStyle(pen, style, report, tag)
	{
		if (pen.background != null && pen.background !== '')
		{
			style.fillColor = pen.background;
		}

		if (pen.color != null && pen.color !== '')
		{
			style.strokeColor = pen.color;
		}

		if (isNum(pen.lineWidth))
		{
			style.strokeWidth = pen.lineWidth;
		}

		var fontColor = pen.textColor || pen.fontColor;

		if (fontColor != null && fontColor !== '')
		{
			style.fontColor = fontColor;
		}

		if (isNum(pen.fontSize))
		{
			style.fontSize = pen.fontSize;
		}

		if (pen.fontFamily != null && pen.fontFamily !== '')
		{
			style.fontFamily = pen.fontFamily;
		}

		if (isNum(pen.borderRadius) && pen.borderRadius > 0)
		{
			style.rounded = 1;
			style.arcSize = Math.min(50, pen.borderRadius * 100);
		}

		if (isNum(pen.globalAlpha))
		{
			style.opacity = Math.round(pen.globalAlpha * 100);
		}

		if (isNum(pen.rotate) && pen.rotate !== 0)
		{
			style.rotation = pen.rotate;
		}

		if (isArray(pen.lineDash) && pen.lineDash.length > 0)
		{
			style.dashed = 1;
			style.dashPattern = pen.lineDash.join(' ');
		}

		if (pen.visible === false)
		{
			style.visible = 0;
		}

		if (isNum(pen.progress))
		{
			style.hmiLevel = pen.progress;

			if (pen.progressColor != null && pen.progressColor !== '')
			{
				style.hmiLevelColor = pen.progressColor;
			}

			if (pen.verticalProgress)
			{
				style.hmiLevelDirection = pen.reverseProgress ? 'down' : 'up';
			}
			else
			{
				style.hmiLevelDirection = pen.reverseProgress ? 'left' : 'right';
			}
		}
	};

	/**
	 * Returns true when the pen has no shape of its own beyond a text label
	 * (meta2d text-only pens have name 'text', or type 0 with no name and a
	 * text value but no distinct shape).
	 */
	function isTextOnly(pen)
	{
		return pen.name === 'text';
	};

	function baseStyleForPen(pen, data, report)
	{
		var style = {};
		var name = pen.name;

		if (WIDGET_STYLE[name] != null)
		{
			applyRaw(style, WIDGET_STYLE[name]);

			return style;
		}

		if (name === 'echarts' || name === 'chart')
		{
			var series = pen.echartsOption || pen.chartData || pen.dataset;
			var isLine = pen.chartType === 'line' || (isObject(series) && series.type === 'line');

			if (isLine)
			{
				applyRaw(style, 'shape=mxgraph.hmi.trendChart;whiteSpace=wrap;html=1;');
			}
			else
			{
				pushReport(report, 'pen ' + pen.id + ': chart type not supported, imported as a placeholder rectangle');
				applyRaw(style, SHAPE_STYLE.rectangle);
			}

			return style;
		}

		if (name === 'table2')
		{
			pushReport(report, 'pen ' + pen.id + ': table2 is not supported, imported as a placeholder rectangle');
			applyRaw(style, SHAPE_STYLE.rectangle);

			return style;
		}

		if (name === 'iframe' || name === 'video')
		{
			pushReport(report, 'pen ' + pen.id + ': ' + name + ' has no HMI equivalent, imported as an HTML label placeholder');
			applyRaw(style, 'rounded=0;whiteSpace=wrap;html=1;');

			return style;
		}

		if (name === 'image' || pen.image != null)
		{
			style.shape = 'image';
			style.image = pen.image || '';
			applyRaw(style, 'verticalLabelPosition=bottom;verticalAlign=top;');

			return style;
		}

		if (name === 'svgPath' || pen.pathId != null)
		{
			style.shape = 'image';
			style.image = svgPathDataUri(pen, data);

			return style;
		}

		if (isTextOnly(pen))
		{
			applyRaw(style, SHAPE_STYLE.text);

			return style;
		}

		if (SHAPE_STYLE[name] != null)
		{
			applyRaw(style, SHAPE_STYLE[name]);

			return style;
		}

		if (name === 'combine')
		{
			style.group = 1;
			applyRaw(style, 'group;');

			return style;
		}

		pushReport(report, 'pen ' + pen.id + ': shape "' + name + '" is not mapped, imported as a rectangle');
		applyRaw(style, SHAPE_STYLE.rectangle);

		return style;
	};

	function applyRaw(style, raw)
	{
		var parts = raw.split(';');

		for (var i = 0; i < parts.length; i++)
		{
			var p = parts[i];

			if (p === '')
			{
				continue;
			}

			var eq = p.indexOf('=');

			if (eq < 0)
			{
				style[p] = 1; // bare style token, e.g. 'ellipse'
			}
			else
			{
				style[p.substring(0, eq)] = p.substring(eq + 1);
			}
		}
	};

	/**
	 * key -> {target} map used both for RealTime bindings (2.2) and for the
	 * SetProps action's value object (§ Action mapping table).
	 */
	var PROP_TARGET_MAP = {
		text: 'label',
		background: 'style:fillColor',
		color: 'style:strokeColor',
		progress: 'style:hmiLevel',
		visible: 'visible',
		rotate: 'style:rotation'
	};

	function targetForKey(key)
	{
		if (Object.prototype.hasOwnProperty.call(PROP_TARGET_MAP, key))
		{
			return PROP_TARGET_MAP[key];
		}

		if (key === 'x' || key === 'y')
		{
			return 'geo:' + key;
		}

		return 'style:hmi' + key.charAt(0).toUpperCase() + key.substring(1);
	};

	/**
	 * Converts one non-line pen into a Cell {id, vertex:true, style, geometry,
	 * value, parentId}.
	 */
	function convertVertexPen(pen, data, report)
	{
		var style = baseStyleForPen(pen, data, report);
		applyCommonStyle(pen, style, report);

		var cell = {
			id: pen.id,
			vertex: true,
			style: style,
			geometry: {
				x: num(pen.x, 0),
				y: num(pen.y, 0),
				width: num(pen.width, 120),
				height: num(pen.height, 60)
			},
			label: pen.text || '',
			parentId: pen.parentId || null,
			hmi: {}
		};

		return cell;
	};

	/**
	 * Resolves source/target of a line pen from the connectedLines entries of
	 * every node pen that reference this line (meta2d stores the connection
	 * on the node side, ConnectLine{lineId, lineAnchor, anchor}).
	 */
	function resolveLineEndpoints(pen, pens)
	{
		var source = null;
		var target = null;

		for (var i = 0; i < pens.length; i++)
		{
			var p = pens[i];

			if (p.id === pen.id || !isArray(p.connectedLines))
			{
				continue;
			}

			for (var j = 0; j < p.connectedLines.length; j++)
			{
				var c = p.connectedLines[j];

				if (c == null || c.lineId !== pen.id)
				{
					continue;
				}

				// lineAnchor: '0' == first anchor (source), otherwise target
				if (c.lineAnchor === '0' || c.lineAnchor === 0)
				{
					source = p.id;
				}
				else
				{
					target = p.id;
				}
			}
		}

		return { source: source, target: target };
	};

	function convertLinePen(pen, data, pens, report)
	{
		var style = {};

		var lineName = pen.lineName;

		if (lineName === 'curve')
		{
			style.curved = 1;
		}
		else if (lineName === 'polyline' || lineName === 'mind')
		{
			style.edgeStyle = 'orthogonalEdgeStyle';
		}
		else
		{
			style.straight = 1;
		}

		var start = mapArrow(pen.fromArrow);
		var end = mapArrow(pen.toArrow);
		style.startArrow = start || 'none';
		style.endArrow = end || 'classic';

		applyCommonStyle(pen, style, report);

		// flow animation
		var animTypes = pen.lineAnimateType;
		var animType = isArray(animTypes) ? animTypes[0] : animTypes;

		if (animType != null || pen.autoPlay)
		{
			style.flowAnimation = 1;
			style.flowAnimationType = LINE_ANIMATE_TYPE[animType] != null ? LINE_ANIMATE_TYPE[animType] : 'dash';

			if (isNum(pen.animateSpan))
			{
				// meta2d animateSpan is a speed-like factor; approximate a
				// duration in ms (higher span -> slower).
				style.flowAnimationDuration = Math.max(100, Math.round(pen.animateSpan * 100));
			}

			if (pen.animateReverse)
			{
				style.flowAnimationReverse = 1;
			}

			if (pen.animateColor != null && pen.animateColor !== '')
			{
				style.flowAnimationColor = pen.animateColor;
			}
		}

		var ends = resolveLineEndpoints(pen, pens);

		var cell = {
			id: pen.id,
			edge: true,
			style: style,
			source: ends.source,
			target: ends.target,
			label: pen.text || '',
			parentId: pen.parentId || null,
			hmi: {}
		};

		if (ends.source == null && isArray(pen.anchors) && pen.anchors.length > 0)
		{
			var a0 = pen.anchors[0];
			cell.sourcePoint = { x: num(pen.x, 0) + num(a0.x, 0), y: num(pen.y, 0) + num(a0.y, 0) };
		}

		if (ends.target == null && isArray(pen.anchors) && pen.anchors.length > 1)
		{
			var a1 = pen.anchors[pen.anchors.length - 1];
			cell.targetPoint = { x: num(pen.x, 0) + num(a1.x, 0), y: num(pen.y, 0) + num(a1.y, 0) };
		}

		if (ends.source == null && ends.target == null && isArray(pen.anchors) && pen.anchors.length > 2)
		{
			cell.points = [];

			for (var i = 1; i < pen.anchors.length - 1; i++)
			{
				cell.points.push({ x: num(pen.x, 0) + num(pen.anchors[i].x, 0),
					y: num(pen.y, 0) + num(pen.anchors[i].y, 0) });
			}
		}

		return cell;
	};

	function isLinePen(pen)
	{
		return pen.type === 1 || pen.name === 'line';
	};

	// -----------------------------------------------------------------
	// events -> hmiEvents / EventAction -> Action
	// -----------------------------------------------------------------

	var EVENT_NAME_MAP = {
		click: 'click',
		dblclick: 'dblclick',
		enter: 'enter',
		leave: 'leave',
		mousedown: 'mousedown',
		mouseup: 'mouseup',
		valueUpdate: 'valueChange',
		message: 'message',
		contextmenu: 'contextmenu',
		input: 'change',
		change: 'change'
	};

	function mapEventName(name, report, pen)
	{
		var mapped = EVENT_NAME_MAP[name];

		if (mapped == null)
		{
			pushReport(report, (pen != null ? 'pen ' + pen.id + ': ' : '') +
				'event "' + name + '" has no equivalent, dropped');

			return null;
		}

		return mapped;
	};

	var COMPARISON_MAP = {
		'=': '==',
		'==': '==',
		'!=': '!=',
		'>': '>',
		'<': '<',
		'>=': '>=',
		'<=': '<=',
		'[)': 'range',
		'![)': '!range',
		'[]': 'in',
		'![]': '!in'
	};

	function convertCondition(where, report)
	{
		if (where == null)
		{
			return null;
		}

		var cond = {};

		if (where.key != null)
		{
			cond.tag = where.key;
		}

		if (where.comparison != null)
		{
			var op = COMPARISON_MAP[where.comparison];

			if (op == null)
			{
				pushReport(report, 'condition operator "' + where.comparison + '" is not mapped, using "=="');
				op = '==';
			}

			cond.operator = op;
		}

		if (where.value !== undefined)
		{
			cond.value = where.value;
		}

		return cond;
	};

	function convertTriggerCondition(tc, report)
	{
		var cond = {};

		if (tc.key != null)
		{
			cond.tag = tc.key;
		}

		if (tc.operator != null)
		{
			var op = COMPARISON_MAP[tc.operator];

			if (op == null)
			{
				pushReport(report, 'trigger condition operator "' + tc.operator + '" is not mapped, using "=="');
				op = '==';
			}

			cond.operator = op;
		}

		if (tc.value !== undefined)
		{
			cond.value = tc.value;
		}

		if (tc.source != null)
		{
			cond.valueTag = tc.source;
		}

		return cond;
	};

	/**
	 * meta2d.js EventAction enum (event.ts) index -> name, in declaration
	 * order (Link=0 .. Message=18).
	 */
	var EVENT_ACTION_NAMES = ['Link', 'SetProps', 'StartAnimate', 'PauseAnimate', 'StopAnimate',
		'JS', 'GlobalFn', 'Emit', 'StartVideo', 'PauseVideo', 'StopVideo', 'SendPropData',
		'SendVarData', 'Navigator', 'Dialog', 'SendData', 'PostMessage', 'PostMessageToParent', 'Message'];

	function targetSpecFor(id)
	{
		if (id == null || id === '' || id === 'self')
		{
			return 'self';
		}

		return { cells: [id] };
	};

	/**
	 * Converts a meta2d value object (SetProps) into an Action style/attrs map
	 * using the same PROP_TARGET_MAP key -> target mapping.
	 */
	function propsToActionFields(value, report)
	{
		var fields = { style: {}, attrs: {} };

		if (!isObject(value))
		{
			return fields;
		}

		for (var key in value)
		{
			if (!Object.prototype.hasOwnProperty.call(value, key))
			{
				continue;
			}

			if (key === 'text')
			{
				fields.label = value[key];
				continue;
			}

			if (key === 'visible')
			{
				fields.visible = value[key];
				continue;
			}

			var target = targetForKey(key);

			if (target.indexOf('style:') === 0)
			{
				fields.style[target.substring(6)] = value[key];
			}
			else
			{
				fields.attrs[key] = value[key];
			}
		}

		return fields;
	};

	/**
	 * Converts one meta2d Event (an action entry, meta2d.js event.ts) into an
	 * HMI Action ({type, ...}), or null with a report note when unsupported.
	 */
	function convertEventAction(ev, report)
	{
		var actionName = EVENT_ACTION_NAMES[ev.action];

		switch (actionName)
		{
			case 'Link':
				return { type: 'openUrl', url: ev.value, target: ev.params || '_blank' };

			case 'SetProps':
				var fields = propsToActionFields(ev.value, report);

				return {
					type: 'setProps',
					target: targetSpecFor(ev.params),
					style: fields.style,
					attrs: fields.attrs,
					label: fields.label,
					visible: fields.visible
				};

			case 'StartAnimate':
				return { type: 'startAnimation', target: targetSpecFor(ev.value), name: ev.params };

			case 'PauseAnimate':
				return { type: 'pauseAnimation', target: targetSpecFor(ev.value), name: ev.params };

			case 'StopAnimate':
				return { type: 'stopAnimation', target: targetSpecFor(ev.value), name: ev.params };

			case 'JS':
				return { type: 'script', code: ev.value };

			case 'GlobalFn':
				pushReport(report, 'event action GlobalFn("' + ev.value + '") has no sandboxed equivalent, ' +
					'imported as a script action calling it by name');

				return { type: 'script', code: 'if (typeof ' + ev.value + ' === "function") { ' + ev.value + '(); }' };

			case 'Emit':
				return { type: 'emit', name: ev.value, payload: ev.params };

			case 'StartVideo':
				return { type: 'playMedia', target: targetSpecFor(ev.value), command: 'play' };

			case 'PauseVideo':
				return { type: 'playMedia', target: targetSpecFor(ev.value), command: 'pause' };

			case 'StopVideo':
				return { type: 'playMedia', target: targetSpecFor(ev.value), command: 'stop' };

			case 'SendPropData':
			case 'SendVarData':
				var items = isArray(ev.list) ? ev.list : [{ params: ev.params, value: ev.value }];
				var actions = [];

				for (var i = 0; i < items.length; i++)
				{
					actions.push({ type: 'writeTag', tag: items[i].params, value: items[i].value });
				}

				return (actions.length === 1) ? actions[0] : { type: 'script', code: null, subActions: actions };

			case 'Navigator':
				pushReport(report, 'navigate action targets page "' + ev.value + '"; the target page must exist after import');

				return { type: 'navigate', page: ev.value };

			case 'Dialog':
				return { type: 'dialog', url: ev.value, title: ev.params };

			case 'SendData':
				pushReport(report, 'event action SendData is not supported, dropped');

				return null;

			case 'PostMessage':
				return { type: 'postMessage', to: 'parent', data: ev.value };

			case 'PostMessageToParent':
				return { type: 'postMessage', to: 'parent', data: ev.value };

			case 'Message':
				return { type: 'notify', text: ev.value };

			default:
				pushReport(report, 'event action "' + ev.action + '" is not mapped, dropped');

				return null;
		}
	};

	/**
	 * Converts a meta2d pen.events entry (an "on"-level Event whose .actions
	 * are the EventAction entries, or an Event that is itself an action) into
	 * an HMI EventHandler.
	 */
	function convertPenEvent(ev, report, pen)
	{
		var on = mapEventName(ev.name, report, pen);

		if (on == null)
		{
			return null;
		}

		var handler = { on: on, conditionType: ev.conditionType || 'and', actions: [] };

		if (ev.message != null)
		{
			handler.message = ev.message;
		}

		if (isArray(ev.conditions) && ev.conditions.length > 0)
		{
			handler.conditions = [];

			for (var i = 0; i < ev.conditions.length; i++)
			{
				handler.conditions.push(convertTriggerCondition(ev.conditions[i], report));
			}
		}

		if (ev.confirm != null)
		{
			handler.confirm = (ev.confirmTitle != null) ? { title: ev.confirmTitle, text: ev.confirm } : true;
		}

		if (isNum(ev.timeout) && ev.timeout > 0)
		{
			handler.delay = ev.timeout;
		}

		var source = isArray(ev.actions) ? ev.actions : [ev];

		for (var j = 0; j < source.length; j++)
		{
			var action = convertEventAction(source[j], report);

			if (action != null)
			{
				handler.actions.push(action);
			}
		}

		return handler;
	};

	function convertPenEvents(pen, report)
	{
		var out = [];

		if (!isArray(pen.events))
		{
			return out;
		}

		for (var i = 0; i < pen.events.length; i++)
		{
			var handler = convertPenEvent(pen.events[i], report, pen);

			if (handler != null)
			{
				out.push(handler);
			}
		}

		return out;
	};

	// -----------------------------------------------------------------
	// pen.triggers (status machine) -> hmiTriggers
	// -----------------------------------------------------------------

	function convertTriggerActions(list, report)
	{
		var out = [];

		if (!isArray(list))
		{
			return out;
		}

		for (var i = 0; i < list.length; i++)
		{
			var action = convertEventAction(list[i], report);

			if (action != null)
			{
				out.push(action);
			}
		}

		return out;
	};

	function convertTrigger(trigger, report)
	{
		if (isArray(trigger.status) && trigger.status.length > 0)
		{
			var states = [];

			for (var i = 0; i < trigger.status.length; i++)
			{
				var s = trigger.status[i];
				var conditions = [];

				if (isArray(s.conditions))
				{
					for (var j = 0; j < s.conditions.length; j++)
					{
						conditions.push(convertTriggerCondition(s.conditions[j], report));
					}
				}

				states.push({
					name: s.name || ('state' + i),
					conditionType: s.conditionType || 'and',
					conditions: conditions,
					actions: convertTriggerActions(s.actions, report)
				});
			}

			return { name: trigger.name, states: states };
		}

		var conditions = [];

		if (isArray(trigger.conditions))
		{
			for (var k = 0; k < trigger.conditions.length; k++)
			{
				conditions.push(convertTriggerCondition(trigger.conditions[k], report));
			}
		}

		return {
			name: trigger.name,
			conditionType: trigger.conditionType || 'and',
			conditions: conditions,
			actions: convertTriggerActions(trigger.actions, report)
		};
	};

	function convertPenTriggers(pen, report)
	{
		var out = [];

		if (!isArray(pen.triggers))
		{
			return out;
		}

		for (var i = 0; i < pen.triggers.length; i++)
		{
			out.push(convertTrigger(pen.triggers[i], report));
		}

		return out;
	};

	// -----------------------------------------------------------------
	// frames -> hmiAnimations
	// -----------------------------------------------------------------

	var FRAME_PROP_MAP = {
		rotate: 'rotation',
		background: 'fillColor',
		color: 'strokeColor',
		visible: 'visible'
	};

	function convertFrameProps(frame, baseX, baseY, report)
	{
		var props = {};

		for (var key in frame)
		{
			if (!Object.prototype.hasOwnProperty.call(frame, key))
			{
				continue;
			}

			if (key === 'duration')
			{
				continue;
			}

			if (key === 'globalAlpha')
			{
				props.opacity = frame[key] * 100;
			}
			else if (key === 'x')
			{
				props.dx = frame[key] - baseX;
			}
			else if (key === 'y')
			{
				props.dy = frame[key] - baseY;
			}
			else if (key === 'width' || key === 'height')
			{
				props.scale = props.scale; // no direct per-axis scale; skipped intentionally
			}
			else if (FRAME_PROP_MAP[key] != null)
			{
				props[FRAME_PROP_MAP[key]] = frame[key];
			}
			// other frame keys (id, name, type, ...) are structural, ignored
		}

		return props;
	};

	function convertPenFrames(pen, report)
	{
		if (!isArray(pen.frames) || pen.frames.length === 0)
		{
			return [];
		}

		var baseX = num(pen.x, 0);
		var baseY = num(pen.y, 0);
		var frames = [];

		for (var i = 0; i < pen.frames.length; i++)
		{
			var f = pen.frames[i];
			frames.push({
				duration: isNum(f.duration) ? f.duration : 1000,
				props: convertFrameProps(f, baseX, baseY, report)
			});
		}

		var anim = {
			name: 'frames',
			autoPlay: !!pen.autoPlay,
			cycles: isNum(pen.animateCycle) ? pen.animateCycle : 0,
			duration: frames.reduce(function(sum, f) { return sum + f.duration; }, 0) || 1000,
			frames: frames
		};

		if (pen.keepAnimateState != null)
		{
			anim.keepState = !!pen.keepAnimateState;
		}

		if (pen.nextAnimate != null)
		{
			anim.next = { name: pen.nextAnimate };
		}

		return [anim];
	};

	// -----------------------------------------------------------------
	// networks / legacy data.* -> sources
	// -----------------------------------------------------------------

	function topicsFromString(str)
	{
		var out = [];

		if (str == null || str === '')
		{
			return out;
		}

		var parts = String(str).split(',');

		for (var i = 0; i < parts.length; i++)
		{
			var t = parts[i].trim();

			if (t !== '')
			{
				out.push({ filter: t, qos: 0 });
			}
		}

		return out;
	};

	function convertNetwork(net, seq, report)
	{
		var protocol = net.protocol;
		var id = 'src' + seq;
		var base = { id: id, name: net.name || id, enabled: net.enable !== false, scope: 'file' };

		if (protocol === 'mqtt')
		{
			base.type = 'mqtt';
			base.url = net.url;
			base.topics = topicsFromString(net.topics);

			if (net.options != null)
			{
				base.clientId = net.options.clientId;
			}

			return base;
		}

		if (protocol === 'websocket')
		{
			base.type = 'ws';
			base.url = net.url;
			base.protocols = (net.protocols != null) ? String(net.protocols).split(',') : [];

			return base;
		}

		if (protocol === 'http')
		{
			base.type = 'http';
			base.url = net.url;
			base.method = net.method || 'GET';
			base.headers = net.headers || {};
			base.body = net.body;
			base.interval = isNum(net.interval) ? net.interval : 1000;
			base.once = !!net.once;

			return base;
		}

		if (protocol === 'SSE')
		{
			base.type = 'sse';
			base.url = net.url;
			base.withCredentials = !!net.withCredentials;

			return base;
		}

		pushReport(report, 'network "' + (net.name || id) + '": protocol "' + protocol +
			'" (iot/sql/ADIIOT) is not supported, dropped');

		return null;
	};

	function convertNetworks(data, report)
	{
		var sources = [];
		var seq = 1;

		if (isArray(data.networks))
		{
			for (var i = 0; i < data.networks.length; i++)
			{
				var src = convertNetwork(data.networks[i], seq, report);

				if (src != null)
				{
					sources.push(src);
					seq++;
				}
			}
		}

		// legacy top-level fields
		if (data.mqtt != null && data.mqtt !== '')
		{
			sources.push({
				id: 'src' + seq++, name: 'mqtt', type: 'mqtt', enabled: true, scope: 'file',
				url: data.mqtt, topics: topicsFromString(data.mqttTopics),
				clientId: (data.mqttOptions != null) ? data.mqttOptions.clientId : undefined
			});
		}

		if (data.websocket != null && data.websocket !== '')
		{
			sources.push({
				id: 'src' + seq++, name: 'websocket', type: 'ws', enabled: true, scope: 'file',
				url: data.websocket,
				protocols: (data.websocketProtocols != null) ?
					(isArray(data.websocketProtocols) ? data.websocketProtocols : [data.websocketProtocols]) : []
			});
		}

		if (data.http != null && data.http !== '')
		{
			sources.push({
				id: 'src' + seq++, name: 'http', type: 'http', enabled: true, scope: 'file',
				url: data.http, method: 'GET', headers: data.httpHeaders || {},
				interval: isNum(data.httpTimeInterval) ? data.httpTimeInterval : 1000
			});
		}

		if (data.socketCbJs != null && data.socketCbJs !== '')
		{
			pushReport(report, 'socketCbJs is not converted automatically; add it as a source parser script manually');
		}

		return sources;
	};

	// -----------------------------------------------------------------
	// realTimes -> bindings, tags catalogue, triggers
	// -----------------------------------------------------------------

	function mockSpecFromRealTime(rt)
	{
		if (!rt.enableMock || rt.mock == null)
		{
			return undefined;
		}

		var mock = rt.mock;

		if (typeof mock === 'boolean')
		{
			return { kind: 'toggle' };
		}

		var str = String(mock);

		if (str === 'true' || str === 'false')
		{
			return { kind: 'toggle' };
		}

		if (str.indexOf('-') >= 0 && /^-?\d+(\.\d+)?\s*-\s*-?\d+(\.\d+)?$/.test(str))
		{
			var parts = str.split('-');

			return { kind: 'random', min: parseFloat(parts[0]), max: parseFloat(parts[1]) };
		}

		if (str.indexOf(',') >= 0)
		{
			return { kind: 'list', values: str.split(',').map(function(s) { return s.trim(); }) };
		}

		return { kind: 'constant', value: mock };
	};

	function tagTypeFor(rt)
	{
		var t = rt.type;

		if (t === 'float' || t === 'number') return 'number';
		if (t === 'integer' || t === 'int') return 'integer';
		if (t === 'bool' || t === 'boolean') return 'boolean';
		if (t === 'object' || t === 'array') return 'object';

		return 'string';
	};

	/**
	 * Converts data.realTimes into {tags: [TagDef], bindings: {penId:[Binding]},
	 * triggers: [Trigger]} (bindings keyed by the owning pen id, via bind.id).
	 */
	function convertRealTimes(data, report)
	{
		var tags = [];
		var bindingsByPen = {};
		var docTriggers = [];

		if (!isArray(data.realTimes))
		{
			return { tags: tags, bindingsByPen: bindingsByPen, docTriggers: docTriggers };
		}

		for (var i = 0; i < data.realTimes.length; i++)
		{
			var rt = data.realTimes[i];
			var tagName = (rt.bind != null && rt.bind.id != null) ? rt.bind.id : (rt.key || 'tag' + i);

			var tagDef = { name: tagName, type: tagTypeFor(rt) };

			if (rt.label != null)
			{
				tagDef.description = rt.label;
			}

			var sim = mockSpecFromRealTime(rt);

			if (sim != null)
			{
				tagDef.sim = sim;
			}

			tags.push(tagDef);

			var penId = (rt.bind != null) ? rt.bind.id : null;
			var key = rt.key || 'value';
			var target = targetForKey(key);

			if (penId != null)
			{
				bindingsByPen[penId] = bindingsByPen[penId] || [];
				bindingsByPen[penId].push({ tag: tagName, target: target });
			}
			else if (Object.prototype.hasOwnProperty.call(PROP_TARGET_MAP, key) === false && key !== 'x' && key !== 'y')
			{
				pushReport(report, 'realTime "' + tagName + '": key "' + key +
					'" mapped to "' + target + '" (no target cell; dropped)');
			}

			if (isArray(rt.triggers))
			{
				for (var j = 0; j < rt.triggers.length; j++)
				{
					var trigger = convertTrigger(rt.triggers[j], report);
					trigger.realTime = tagName;
					docTriggers.push(trigger);
				}
			}
		}

		return { tags: tags, bindingsByPen: bindingsByPen, docTriggers: docTriggers };
	};

	// -----------------------------------------------------------------
	// core: convertMeta2d
	// -----------------------------------------------------------------

	/**
	 * Converts a parsed meta2d JSON document into a DOM-free JS model:
	 * {cells: [Cell], docConfig, report: [string]}.
	 *
	 * Cell: {id, vertex|edge, style: {k:v}, geometry|source/target/points,
	 *   label, parentId, hmi: {bindings, events, triggers, animations, roles}}
	 */
	Import.convertMeta2d = function(data)
	{
		var report = [];
		data = data || {};
		var pens = isArray(data.pens) ? data.pens : [];

		var cells = [];

		for (var p = 0; p < pens.length; p++)
		{
			var pen = pens[p];

			if (pen.id == null)
			{
				continue;
			}

			var cell = isLinePen(pen) ? convertLinePen(pen, data, pens, report) :
				convertVertexPen(pen, data, report);

			cell.hmi.events = convertPenEvents(pen, report);
			cell.hmi.triggers = convertPenTriggers(pen, report);
			cell.hmi.animations = convertPenFrames(pen, report);

			if (pen.roles != null)
			{
				cell.hmi.roles = isArray(pen.roles) ? pen.roles.join(',') : String(pen.roles);
			}

			cells.push(cell);
		}

		var realTimeResult = convertRealTimes(data, report);

		for (var b in realTimeResult.bindingsByPen)
		{
			if (!Object.prototype.hasOwnProperty.call(realTimeResult.bindingsByPen, b))
			{
				continue;
			}

			var target = null;

			for (var c = 0; c < cells.length; c++)
			{
				if (cells[c].id === b)
				{
					target = cells[c];
					break;
				}
			}

			if (target != null)
			{
				target.hmi.bindings = (target.hmi.bindings || []).concat(realTimeResult.bindingsByPen[b]);
			}
			else
			{
				pushReport(report, 'realTime binding refers to unknown pen "' + b + '", dropped');
			}
		}

		var sources = convertNetworks(data, report);
		var docTriggers = realTimeResult.docTriggers;

		if (isArray(data.triggers))
		{
			for (var t = 0; t < data.triggers.length; t++)
			{
				docTriggers.push(convertTrigger(data.triggers[t], report));
			}
		}

		if (data.dataEvents != null || (data.dataset != null && isArray(data.dataset.devices)))
		{
			pushReport(report, 'dataset/dataEvents mock configuration is not converted automatically');
		}

		var docConfig = {
			version: 1,
			sources: sources,
			tags: realTimeResult.tags,
			triggers: docTriggers,
			sim: 'off',
			runtime: { fit: 'page', panZoom: true, nav: 'tabs', maxRate: 30, quality: 'outline', theme: 'default' }
		};

		if (data.enableMock)
		{
			docConfig.sim = 'on';
		}

		return { cells: cells, docConfig: docConfig, report: report };
	};

	// -----------------------------------------------------------------
	// XML rendering (DOM-free: string building only)
	// -----------------------------------------------------------------

	function xmlEscape(s)
	{
		return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
	};

	function attr(name, value)
	{
		if (value == null)
		{
			return '';
		}

		return ' ' + name + '="' + xmlEscape(value) + '"';
	};

	function jsonAttr(name, value)
	{
		if (value == null)
		{
			return '';
		}

		if (isArray(value) && value.length === 0)
		{
			return '';
		}

		if (isObject(value) && Object.keys(value).length === 0)
		{
			return '';
		}

		return attr(name, JSON.stringify(value));
	};

	/**
	 * Renders one cell's <object>...<mxCell/></object> (or a plain <mxCell/>
	 * when it has no HMI attributes and an empty label) plus its mxGeometry.
	 */
	function renderCell(cell)
	{
		var hmi = cell.hmi || {};
		var hasHmi = (hmi.bindings != null && hmi.bindings.length > 0) ||
			(hmi.events != null && hmi.events.length > 0) ||
			(hmi.triggers != null && hmi.triggers.length > 0) ||
			(hmi.animations != null && hmi.animations.length > 0) ||
			(hmi.roles != null && hmi.roles !== '');

		var styleStr = styleToString(cell.style || {});
		var mxCellOpen = '<mxCell id="' + xmlEscape(cell.id) + '"' +
			(hasHmi ? '' : attr('value', cell.label || '')) +
			attr('style', styleStr) +
			(cell.vertex ? ' vertex="1"' : '') +
			(cell.edge ? ' edge="1"' : '') +
			attr('parent', cell.parentId || '1') +
			(cell.edge ? attr('source', cell.source) + attr('target', cell.target) : '') +
			'>';

		var geomStr = '';

		if (cell.vertex && cell.geometry != null)
		{
			geomStr = '<mxGeometry x="' + cell.geometry.x + '" y="' + cell.geometry.y +
				'" width="' + cell.geometry.width + '" height="' + cell.geometry.height + '" as="geometry" />';
		}
		else if (cell.edge)
		{
			geomStr = '<mxGeometry relative="1" as="geometry">';

			if (cell.sourcePoint != null)
			{
				geomStr += '<mxPoint x="' + cell.sourcePoint.x + '" y="' + cell.sourcePoint.y + '" as="sourcePoint" />';
			}

			if (cell.targetPoint != null)
			{
				geomStr += '<mxPoint x="' + cell.targetPoint.x + '" y="' + cell.targetPoint.y + '" as="targetPoint" />';
			}

			if (isArray(cell.points) && cell.points.length > 0)
			{
				geomStr += '<Array as="points">';

				for (var i = 0; i < cell.points.length; i++)
				{
					geomStr += '<mxPoint x="' + cell.points[i].x + '" y="' + cell.points[i].y + '" />';
				}

				geomStr += '</Array>';
			}

			geomStr += '</mxGeometry>';
		}

		var body = mxCellOpen + geomStr + '</mxCell>';

		if (!hasHmi)
		{
			return body;
		}

		var objectStr = '<object id="' + xmlEscape(cell.id) + '"' +
			attr('label', cell.label || '') +
			(cell.label != null && /%[^%]+%/.test(cell.label) ? ' placeholders="1"' : '') +
			jsonAttr('hmiBindings', hmi.bindings) +
			jsonAttr('hmiEvents', hmi.events) +
			jsonAttr('hmiTriggers', hmi.triggers) +
			jsonAttr('hmiAnimations', hmi.animations) +
			(hmi.roles ? attr('hmiRoles', hmi.roles) : '') +
			'>';

		// the inner mxCell of an <object> wrapper carries no value attribute
		var innerCell = '<mxCell id="__inner_removed__"' +
			attr('style', styleStr) +
			(cell.vertex ? ' vertex="1"' : '') +
			(cell.edge ? ' edge="1"' : '') +
			attr('parent', cell.parentId || '1') +
			(cell.edge ? attr('source', cell.source) + attr('target', cell.target) : '') +
			'>' + geomStr + '</mxCell>';

		// the <object> itself carries the id; the inner mxCell must NOT repeat
		// the id (draw.io convention: object id == cell id, mxCell has none)
		innerCell = innerCell.replace(' id="__inner_removed__"', '');

		return objectStr + innerCell + '</object>';
	};

	/**
	 * Renders the model root cell (id 0) carrying the doc config, plus the
	 * default layer cell (id 1), and all pen cells parented under it.
	 */
	Import.renderXml = function(model)
	{
		var docConfig = model.docConfig || {};
		var hasDoc = (docConfig.sources && docConfig.sources.length > 0) ||
			(docConfig.tags && docConfig.tags.length > 0) ||
			(docConfig.triggers && docConfig.triggers.length > 0) || docConfig.sim === 'on';

		var out = '<mxGraphModel dx="800" dy="600" grid="1" gridSize="10" guides="1" tooltips="1" ' +
			'connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100" ' +
			'math="0" shadow="0">';
		out += '<root>';

		if (hasDoc)
		{
			out += '<object id="0"' + jsonAttr('hmi', docConfig) + '><mxCell /></object>';
		}
		else
		{
			out += '<mxCell id="0" />';
		}

		out += '<mxCell id="1" parent="0" />';

		var cells = model.cells || [];

		for (var i = 0; i < cells.length; i++)
		{
			out += renderCell(cells[i]);
		}

		out += '</root></mxGraphModel>';

		return out;
	};

	/**
	 * Converts a meta2d JSON document straight to draw.io <mxGraphModel> XML.
	 * Returns {xml, report}.
	 */
	Import.meta2dToXml = function(data)
	{
		var result = Import.convertMeta2d(data);

		return { xml: Import.renderXml(result), report: result.report };
	};

	// -----------------------------------------------------------------
	// UI integration (browser only; no code below touches Node)
	// -----------------------------------------------------------------

	/**
	 * Reports the unsupported-feature list to the user. Uses the existing
	 * ErrorDialog-based EditorUi.alert helper (a plain message dialog) rather
	 * than a bespoke dialog class, so this stays a thin wrapper over draw.io
	 * UI primitives.
	 */
	function showReportDialog(ui, report)
	{
		if (report == null || report.length === 0)
		{
			if (ui.alert != null)
			{
				ui.alert(mxResources.get('hmiImportMeta2d') + ': OK', 340);
			}

			return;
		}

		var intro = mxResources.get('hmiImportReportIntro') ||
			'The following features could not be imported automatically:';
		var lines = [intro];

		for (var i = 0; i < report.length; i++)
		{
			lines.push('• ' + report[i]);
		}

		if (ui.alert != null)
		{
			ui.alert(lines.join('\n'), 480);
		}
		else if (ui.showError != null)
		{
			ui.showError(mxResources.get('hmiImportMeta2d'), lines.join('\n'));
		}
		else if (root.console != null)
		{
			console.warn(lines.join('\n'));
		}
	};

	/**
	 * Imports one parsed meta2d JSON document into `ui`: creates a new page
	 * when the app has multi-page support, otherwise imports into the current
	 * page; merges the doc config onto the page root; shows the report.
	 * Exposed (not just used by the action) so it can be driven headlessly,
	 * e.g. from a browser smoke test.
	 */
	Import.importMeta2d = function(ui, data, filename)
	{
		var result = Import.convertMeta2d(data);
		var xml = Import.renderXml(result);
		var graph = ui.editor.graph;
		var doc = mxUtils.parseXml(xml);

		if (ui.pages != null && ui.insertPage != null)
		{
			var node = doc.documentElement;
			var page = ui.insertPage(null, ui.pages.length, node);
			page.setName(filename || 'meta2d');

			if (ui.selectPage != null)
			{
				ui.selectPage(page);
			}
		}
		else
		{
			graph.model.beginUpdate();

			try
			{
				var codec = new mxCodec(doc);
				var rootNode = doc.documentElement.getElementsByTagName('root')[0];
				var cells = [];

				for (var i = 0; i < rootNode.childNodes.length; i++)
				{
					var node = rootNode.childNodes[i];

					if (node.nodeType === 1 && node.getAttribute('id') !== '0' && node.getAttribute('id') !== '1')
					{
						cells.push(codec.decodeCell(node));
					}
				}

				graph.addCells(cells);

				var rootCellNode = rootNode.querySelector != null ? rootNode.querySelector('[id="0"]') : null;

				if (rootCellNode != null && rootCellNode.getAttribute('hmi') != null)
				{
					graph.setAttributeForCell(graph.model.getRoot(), 'hmi', rootCellNode.getAttribute('hmi'));
				}
			}
			finally
			{
				graph.model.endUpdate();
			}
		}

		showReportDialog(ui, result.report);

		return result;
	};

	function pickJsonFile(callback)
	{
		var input = document.createElement('input');
		input.setAttribute('type', 'file');
		input.setAttribute('accept', '.json,application/json');
		input.style.display = 'none';

		input.addEventListener('change', function()
		{
			if (input.files == null || input.files.length === 0)
			{
				return;
			}

			var file = input.files[0];
			var reader = new FileReader();

			reader.onload = function()
			{
				try
				{
					callback(JSON.parse(reader.result), file.name);
				}
				catch (e)
				{
					callback(null, file.name, e);
				}
			};

			reader.readAsText(file);
		});

		document.body.appendChild(input);
		input.click();

		window.setTimeout(function()
		{
			document.body.removeChild(input);
		}, 0);
	};

	/**
	 * SRS HMI-IMP-3: exports a self-contained HTML file for the current
	 * screen. Default mode embeds an iframe that loads this deployment at
	 * "<origin><path>?hmi=run&...#R<compressed data>" (the lightbox runtime
	 * mode already used by Plugin.getRunUrl). When `Hmi.viewerBundleUrl` is
	 * configured (future standalone viewer, IMPLEMENTATION_PLAN §5 M7), the
	 * export instead inlines that viewer bundle script directly.
	 */
	Import.exportHtml = function(ui)
	{
		var title = (ui.getCurrentFile() != null && ui.getCurrentFile().getTitle() != null) ?
			ui.getCurrentFile().getTitle() : 'HMI Screen';
		var runUrl = Hmi.Plugin.getRunUrl(ui);
		var absoluteUrl = window.location.origin + runUrl;
		var html;

		if (Hmi.viewerBundleUrl != null)
		{
			var data = ui.getFileData(true, null, null, null, null, null, null, true, null, false);

			html = '<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>' + xmlEscape(title) +
				'</title>\n<script src="' + xmlEscape(Hmi.viewerBundleUrl) + '"></script>\n' +
				'<style>html,body{margin:0;padding:0;height:100%;}#hmi{width:100%;height:100%;}</style>\n' +
				'</head><body><div id="hmi" data-mxgraph="' + xmlEscape(JSON.stringify({ highlight: '#0000ff',
					nav: false, resize: false, toolbar: '', edit: '_blank', xml: data })) +
				'"></div></body></html>';
		}
		else
		{
			html = '<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>' + xmlEscape(title) +
				'</title>\n<style>html,body{margin:0;padding:0;height:100%;}iframe{width:100%;height:100%;border:0;}</style>\n' +
				'</head><body><iframe src="' + xmlEscape(absoluteUrl) + '" allow="fullscreen"></iframe></body></html>';
		}

		var filename = (title.replace(/[^a-z0-9_-]+/gi, '_') || 'hmi-screen') + '.html';

		if (ui.saveData != null)
		{
			ui.saveData(filename, 'html', html, 'text/html');
		}
		else
		{
			var blob = new Blob([html], { type: 'text/html' });
			var url = URL.createObjectURL(blob);
			var a = document.createElement('a');
			a.href = url;
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			window.setTimeout(function() { URL.revokeObjectURL(url); }, 0);
		}
	};

	/**
	 * Installs the 'hmiImportMeta2d...' and 'hmiExportHtml...' actions.
	 * HmiPlugin.installEditor shows them in the HMI menu when they exist.
	 */
	Import.install = function(ui)
	{
		if (typeof document === 'undefined' || ui.actions == null)
		{
			return;
		}

		ui.actions.addAction('hmiImportMeta2d...', function()
		{
			pickJsonFile(function(data, filename, err)
			{
				if (err != null || data == null)
				{
					ui.handleError(err || { message: mxResources.get('invalidOrMissingFile') });

					return;
				}

				try
				{
					Import.importMeta2d(ui, data, filename != null ? filename.replace(/\.json$/i, '') : null);
				}
				catch (e)
				{
					ui.handleError(e);
				}
			});
		});

		ui.actions.addAction('hmiExportHtml...', function()
		{
			try
			{
				Import.exportHtml(ui);
			}
			catch (e)
			{
				ui.handleError(e);
			}
		});
	};

	Hmi.Import = Import;
})();
