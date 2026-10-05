/**
 * Hmi.Schema: hand-rolled defaults/validate/parse for the persisted HMI
 * JSON schemas (ARCHITECTURE.md §2). DOM-free (ARCHITECTURE.md §1).
 *
 * Unknown fields are preserved everywhere: defaults() only fills in missing
 * keys, validate() never strips anything, parse() returns the object as
 * given (after JSON.parse) with defaults applied.
 */
(function()
{
	var Hmi = (typeof globalThis !== 'undefined' ? globalThis : window).Hmi =
		(typeof globalThis !== 'undefined' ? globalThis : window).Hmi || {};

	function isPlainObject(v)
	{
		return v != null && typeof v === 'object' && !Array.isArray(v);
	};

	function isString(v)
	{
		return typeof v === 'string';
	};

	function isArray(v)
	{
		return Array.isArray(v);
	};

	/**
	 * has(map, key) -- own-property membership test for the lookup tables
	 * below, so values like "constructor" never match an inherited
	 * Object.prototype member.
	 */
	function has(map, key)
	{
		return typeof key === 'string' && Object.prototype.hasOwnProperty.call(map, key);
	};

	// ---------------------------------------------------------------
	// defaults()
	// ---------------------------------------------------------------

	function defaultRuntime(rt)
	{
		rt = isPlainObject(rt) ? rt : {};

		if (rt.fit == null) rt.fit = 'page';
		if (rt.panZoom == null) rt.panZoom = true;
		if (rt.nav == null) rt.nav = 'tabs';
		if (rt.maxRate == null) rt.maxRate = 30;
		if (rt.quality == null) rt.quality = 'outline';
		if (rt.theme == null) rt.theme = 'default';

		return rt;
	};

	function defaultsDoc(obj)
	{
		obj = isPlainObject(obj) ? obj : {};

		if (obj.version == null) obj.version = 1;
		if (!isArray(obj.sources)) obj.sources = [];
		if (!isArray(obj.tags)) obj.tags = [];
		if (!isArray(obj.triggers)) obj.triggers = [];
		if (obj.sim == null) obj.sim = 'off';
		obj.runtime = defaultRuntime(obj.runtime);
		if (obj.scripts == null) obj.scripts = 'inherit';

		return obj;
	};

	function defaultsSource(obj)
	{
		obj = isPlainObject(obj) ? obj : {};

		if (obj.enabled == null) obj.enabled = true;
		if (obj.scope == null) obj.scope = 'file';
		if (obj.prefix == null) obj.prefix = '';

		if (!isPlainObject(obj.format))
		{
			obj.format = { kind: 'auto' };
		}
		else if (obj.format.kind == null)
		{
			obj.format.kind = 'auto';
		}

		if (!isPlainObject(obj.reconnect))
		{
			obj.reconnect = { maxAttempts: 0 };
		}
		else if (obj.reconnect.maxAttempts == null)
		{
			obj.reconnect.maxAttempts = 0;
		}

		if (obj.type === 'mqtt')
		{
			if (obj.cleanSession == null) obj.cleanSession = true;
			if (obj.keepalive == null) obj.keepalive = 30;
			if (obj.protocolVersion == null) obj.protocolVersion = 4;
			if (!isArray(obj.topics)) obj.topics = [];
		}
		else if (obj.type === 'ws')
		{
			if (!isArray(obj.protocols)) obj.protocols = [];
			if (obj.initMessage == null) obj.initMessage = '';
		}
		else if (obj.type === 'http')
		{
			if (obj.method == null) obj.method = 'GET';
			if (!isPlainObject(obj.headers)) obj.headers = {};
			if (obj.body == null) obj.body = '';
			if (obj.interval == null) obj.interval = 1000;
			if (obj.withCredentials == null) obj.withCredentials = false;
			if (obj.once == null) obj.once = false;
			if (obj.skipFirst == null) obj.skipFirst = false;
			if (obj.timeout == null) obj.timeout = 10000;
		}
		else if (obj.type === 'sse')
		{
			if (!isArray(obj.events)) obj.events = ['message'];
		}

		if (!isPlainObject(obj.credentials))
		{
			obj.credentials = { mode: 'none' };
		}
		else if (obj.credentials.mode == null)
		{
			obj.credentials.mode = 'none';
		}

		return obj;
	};

	function defaultsTag(obj)
	{
		obj = isPlainObject(obj) ? obj : {};

		if (obj.type == null) obj.type = 'number';
		if (obj.access == null) obj.access = 'r';
		if (obj.local == null) obj.local = false;

		if (obj.write != null && isPlainObject(obj.write))
		{
			if (obj.write.payload == null) obj.write.payload = '{"value":${value}}';
			if (obj.write.mode == null) obj.write.mode = 'confirmed';
			if (obj.write.timeout == null) obj.write.timeout = 5000;
		}

		if (obj.alarms != null && isPlainObject(obj.alarms))
		{
			if (obj.alarms.deadband == null) obj.alarms.deadband = 0;

			if (!isPlainObject(obj.alarms.severity))
			{
				obj.alarms.severity = { hihi: 1, hi: 2, lo: 2, lolo: 1, bool: 1 };
			}
		}

		if (!isArray(obj.roles)) obj.roles = [];

		return obj;
	};

	function defaultsBinding(obj)
	{
		obj = isPlainObject(obj) ? obj : {};

		return obj;
	};

	function defaultsBindings(list)
	{
		list = isArray(list) ? list : [];

		for (var i = 0; i < list.length; i++)
		{
			list[i] = defaultsBinding(list[i]);
		}

		return list;
	};

	function defaultsEvent(obj)
	{
		obj = isPlainObject(obj) ? obj : {};

		if (obj.conditionType == null) obj.conditionType = 'and';
		if (!isArray(obj.actions)) obj.actions = [];
		if (obj.delay == null) obj.delay = 0;
		if (obj.stopOnError == null) obj.stopOnError = false;

		return obj;
	};

	function defaultsEvents(list)
	{
		list = isArray(list) ? list : [];

		for (var i = 0; i < list.length; i++)
		{
			list[i] = defaultsEvent(list[i]);
		}

		return list;
	};

	function defaultsTrigger(obj)
	{
		obj = isPlainObject(obj) ? obj : {};

		if (isArray(obj.states))
		{
			for (var i = 0; i < obj.states.length; i++)
			{
				var s = obj.states[i];

				if (isPlainObject(s))
				{
					if (s.conditionType == null) s.conditionType = 'and';
					if (!isArray(s.conditions)) s.conditions = [];
					if (!isArray(s.actions)) s.actions = [];
				}
			}
		}
		else
		{
			if (obj.conditionType == null) obj.conditionType = 'and';
			if (!isArray(obj.conditions)) obj.conditions = [];
			if (!isArray(obj.actions)) obj.actions = [];
			if (obj.deadband == null) obj.deadband = 0;
			if (obj.onDelay == null) obj.onDelay = 0;
			if (obj.offDelay == null) obj.offDelay = 0;
		}

		return obj;
	};

	function defaultsTriggers(list)
	{
		list = isArray(list) ? list : [];

		for (var i = 0; i < list.length; i++)
		{
			list[i] = defaultsTrigger(list[i]);
		}

		return list;
	};

	function defaultsAnimation(obj)
	{
		obj = isPlainObject(obj) ? obj : {};

		if (obj.autoPlay == null) obj.autoPlay = false;
		if (obj.cycles == null) obj.cycles = 0;
		if (obj.duration == null) obj.duration = 1000;
		if (obj.easing == null) obj.easing = 'linear';
		if (obj.keepState == null) obj.keepState = false;
		if (!isArray(obj.frames)) obj.frames = [];

		return obj;
	};

	function defaultsAnimations(list)
	{
		list = isArray(list) ? list : [];

		for (var i = 0; i < list.length; i++)
		{
			list[i] = defaultsAnimation(list[i]);
		}

		return list;
	};


	// ---------------------------------------------------------------
	// Animation links (attribute hmiLinks, INTOUCH_LINKS.md §2)
	// ---------------------------------------------------------------

	var LINK_DISPLAY_EXPR = ['valueDiscrete', 'valueAnalog', 'valueString', 'locationH', 'locationV',
		'orientation', 'sizeHeight', 'sizeWidth', 'lineColor', 'fillColor', 'textColor',
		'fillVertical', 'fillHorizontal', 'blink', 'visibility', 'disable', 'tooltip'];
	var LINK_TOUCH = ['inputDiscrete', 'inputAnalog', 'inputString', 'sliderH', 'sliderV',
		'pushDiscrete', 'pushAction', 'showWindow', 'hideWindow'];
	var COLOR_LINKS = { lineColor: true, fillColor: true, textColor: true };
	var LINK_CONDITIONS = ['onLeftDown', 'whileLeftDown', 'onLeftUp', 'onLeftDouble', 'onRightDown',
		'whileRightDown', 'onRightUp', 'onRightDouble', 'onMouseOver', 'whileMouseOver', 'onMouseLeave'];
	var FORMAT_MODES = ['text', 'real', 'fixed', 'integer', 'exponential', 'hex', 'binary'];

	/**
	 * Numeric defaults per link type: {field: default}.
	 */
	var LINK_NUMBERS = {
		locationH: { atLeft: 0, atRight: 100, toLeft: 0, toRight: 100 },
		locationV: { atTop: 100, atBottom: 0, up: 100, down: 0 },
		orientation: { valueAtMaxCCW: 0, valueAtMaxCW: 100, ccwRotation: 0, cwRotation: 360, offsetX: 0, offsetY: 0 },
		sizeHeight: { valueAtMin: 0, valueAtMax: 100, minPercent: 0, maxPercent: 100 },
		sizeWidth: { valueAtMin: 0, valueAtMax: 100, minPercent: 0, maxPercent: 100 },
		fillVertical: { valueAtMin: 0, valueAtMax: 100, minPercent: 0, maxPercent: 100 },
		fillHorizontal: { valueAtMin: 0, valueAtMax: 100, minPercent: 0, maxPercent: 100 },
		sliderH: { atLeft: 0, atRight: 100, toLeft: 0, toRight: 100 },
		sliderV: { atTop: 100, atBottom: 0, up: 100, down: 0 }
	};

	/**
	 * Enum fields per link type: {field: [allowed values, default first]}.
	 */
	var LINK_ENUMS = {
		sizeHeight: { anchor: ['bottom', 'top', 'middle'] },
		sizeWidth: { anchor: ['left', 'center', 'right'] },
		fillVertical: { direction: ['up', 'down'] },
		fillHorizontal: { direction: ['right', 'left'] },
		blink: { mode: ['invisible', 'visible'], speed: ['medium', 'slow', 'fast'] },
		visibility: { visibleState: ['on', 'off'] },
		disable: { disabledState: ['on', 'off'] },
		tooltip: { mode: ['static', 'expression'] },
		inputString: { echo: ['yes', 'no', 'password'] },
		sliderH: { reference: ['left', 'center', 'right'] },
		sliderV: { reference: ['top', 'middle', 'bottom'] },
		pushDiscrete: { action: ['direct', 'reverse', 'toggle', 'reset', 'set'] }
	};

	function defaultsLinkFormat(f)
	{
		f = isPlainObject(f) ? f : {};

		if (f.mode == null) f.mode = 'text';
		if (f.precision == null) f.precision = 0;
		if (f.bitsFrom == null) f.bitsFrom = 0;
		if (f.bitsTo == null) f.bitsTo = 31;
		if (f.fixedWidth == null) f.fixedWidth = false;

		return f;
	};

	function defaultsLink(type, link)
	{
		if (!isPlainObject(link))
		{
			return link;
		}

		var nums = has(LINK_NUMBERS, type) ? LINK_NUMBERS[type] : null;
		var enums = has(LINK_ENUMS, type) ? LINK_ENUMS[type] : null;
		var k;

		if (nums != null)
		{
			for (k in nums)
			{
				if (link[k] == null) link[k] = nums[k];
			}
		}

		if (enums != null)
		{
			for (k in enums)
			{
				if (link[k] == null) link[k] = enums[k][0];
			}
		}

		switch (type)
		{
			case 'valueDiscrete':
				if (link.onMessage == null) link.onMessage = 'On';
				if (link.offMessage == null) link.offMessage = 'Off';
				break;

			case 'valueAnalog':
				link.format = defaultsLinkFormat(link.format);
				break;

			case 'fillVertical':
			case 'fillHorizontal':
				if (link.backgroundColor == null) link.backgroundColor = '#FFFFFF';
				break;

			case 'analogAlarm':
				break;

			case 'tooltip':
				if (link.mode === 'static' && link.text == null) link.text = '';
				break;

			case 'inputDiscrete':
				if (link.key === undefined) link.key = null;
				if (link.setPrompt == null) link.setPrompt = 'On';
				if (link.resetPrompt == null) link.resetPrompt = 'Off';
				if (link.onMessage == null) link.onMessage = 'On';
				if (link.offMessage == null) link.offMessage = 'Off';
				if (link.inputOnly == null) link.inputOnly = false;
				break;

			case 'inputAnalog':
				if (link.key === undefined) link.key = null;
				if (link.keypad == null) link.keypad = false;
				if (link.min == null) link.min = 1;
				if (link.max == null) link.max = 100;
				if (link.inputOnly == null) link.inputOnly = false;
				link.format = defaultsLinkFormat(link.format);
				break;

			case 'inputString':
				if (link.key === undefined) link.key = null;
				if (link.keypad == null) link.keypad = false;
				if (link.passwordChar == null) link.passwordChar = '*';
				if (link.encrypt == null) link.encrypt = false;
				if (link.inputOnly == null) link.inputOnly = false;
				break;

			case 'pushDiscrete':
				if (link.key === undefined) link.key = null;
				break;

			case 'pushAction':
				if (link.key === undefined) link.key = null;
				if (!isArray(link.scripts)) link.scripts = [];

				for (var i = 0; i < link.scripts.length; i++)
				{
					var sc = link.scripts[i];

					if (isPlainObject(sc))
					{
						if (sc.condition == null) sc.condition = 'onLeftDown';
						if (sc.period == null) sc.period = 500;
						if (sc.script == null) sc.script = '';
					}
				}

				break;

			case 'showWindow':
			case 'hideWindow':
				if (link.key === undefined) link.key = null;
				if (!isArray(link.windows)) link.windows = [];
				break;
		}

		if (COLOR_LINKS[type] === true && link.kind === 'analog' && !isArray(link.breakpoints))
		{
			link.breakpoints = [];
		}

		return link;
	};

	function defaultsLinks(obj)
	{
		obj = isPlainObject(obj) ? obj : {};

		for (var type in obj)
		{
			if (Object.prototype.hasOwnProperty.call(obj, type))
			{
				defaultsLink(type, obj[type]);
			}
		}

		return obj;
	};

	function defaults(kind, obj)
	{
		switch (kind)
		{
			case 'doc': return defaultsDoc(obj);
			case 'source': return defaultsSource(obj);
			case 'tag': return defaultsTag(obj);
			case 'bindings': return defaultsBindings(obj);
			case 'events': return defaultsEvents(obj);
			case 'triggers': return defaultsTriggers(obj);
			case 'animations': return defaultsAnimations(obj);
			case 'links': return defaultsLinks(obj);
			default: return obj;
		}
	};

	// ---------------------------------------------------------------
	// validate()
	// ---------------------------------------------------------------

	var SOURCE_TYPES = { mqtt: true, ws: true, http: true, sse: true, host: true };
	var TAG_TYPES = { number: true, integer: true, boolean: true, string: true, object: true };
	var ACCESS_VALUES = { r: true, rw: true };
	var TARGET_RE = /^(label|tooltip|visible)$|^(attr|style|geo|prop):.+$/;
	var CONDITION_OPS = {
		'==': true, '!=': true, '>': true, '<': true, '>=': true, '<=': true,
		range: true, '!range': true, 'in': true, '!in': true, changed: true, isBad: true, 'true': true
	};
	var EVENT_ON_VALUES = {
		click: true, dblclick: true, mousedown: true, mouseup: true, enter: true, leave: true,
		valueChange: true, pageOpen: true, pageClose: true, message: true, change: true,
		contextmenu: true, longpress: true
	};
	var ACTION_TYPES = {
		setProps: true, writeTag: true, toggleTag: true, pulseTag: true, navigate: true,
		openUrl: true, dialog: true, startAnimation: true, pauseAnimation: true, stopAnimation: true,
		emit: true, send: true, notify: true, postMessage: true, script: true, drawioAction: true,
		ackAlarms: true, playMedia: true
	};

	function validateSourceObj(obj, path, errors)
	{
		if (!isPlainObject(obj))
		{
			errors.push(path + ': must be an object');

			return;
		}

		if (!isString(obj.id) || obj.id === '')
		{
			errors.push(path + '.id: required');
		}

		if (!isString(obj.type) || !has(SOURCE_TYPES, obj.type))
		{
			errors.push(path + '.type: must be one of mqtt|ws|http|sse|host');
		}

		if (obj.type !== 'host' && (!isString(obj.url) || obj.url === ''))
		{
			errors.push(path + '.url: required');
		}

		if (obj.scope != null && obj.scope !== 'file' && obj.scope !== 'page')
		{
			errors.push(path + '.scope: must be file|page');
		}

		if (obj.format != null)
		{
			if (!isPlainObject(obj.format))
			{
				errors.push(path + '.format: must be an object');
			}
			else if (obj.format.kind != null &&
				['auto', 'flat', 'array', 'topic', 'jsonpath', 'drawio-update-xml'].indexOf(obj.format.kind) < 0)
			{
				errors.push(path + '.format.kind: invalid');
			}
		}
	};

	function validateTagObj(obj, path, errors)
	{
		if (!isPlainObject(obj))
		{
			errors.push(path + ': must be an object');

			return;
		}

		if (!isString(obj.name) || obj.name === '')
		{
			errors.push(path + '.name: required');
		}

		if (obj.type != null && !has(TAG_TYPES, obj.type))
		{
			errors.push(path + '.type: must be one of number|integer|boolean|string|object');
		}

		if (obj.access != null && !has(ACCESS_VALUES, obj.access))
		{
			errors.push(path + '.access: must be r|rw');
		}

		if (obj.min != null && obj.max != null && Number(obj.min) > Number(obj.max))
		{
			errors.push(path + '.min: must be <= max');
		}

		if (obj.expr != null && obj.expr !== '')
		{
			try
			{
				Hmi.Expr.compile(obj.expr);
			}
			catch (e)
			{
				errors.push(path + '.expr: ' + e.message);
			}
		}
	};

	function validateConditionObj(obj, path, errors)
	{
		if (!isPlainObject(obj))
		{
			errors.push(path + ': must be an object');

			return;
		}

		if ((obj.tag == null || obj.tag === '') && (obj.expr == null || obj.expr === '') && obj.operator !== 'true')
		{
			errors.push(path + ': requires tag or expr');
		}

		if (obj.operator != null && !has(CONDITION_OPS, obj.operator))
		{
			errors.push(path + '.operator: invalid');
		}

		if (obj.expr != null && obj.expr !== '')
		{
			try
			{
				Hmi.Expr.compile(obj.expr);
			}
			catch (e)
			{
				errors.push(path + '.expr: ' + e.message);
			}
		}
	};

	function validateConditionsArray(list, path, errors)
	{
		if (list == null)
		{
			return;
		}

		if (!isArray(list))
		{
			errors.push(path + ': must be an array');

			return;
		}

		for (var i = 0; i < list.length; i++)
		{
			validateConditionObj(list[i], path + '[' + i + ']', errors);
		}
	};

	function validateActionObj(obj, path, errors)
	{
		if (!isPlainObject(obj))
		{
			errors.push(path + ': must be an object');

			return;
		}

		if (!isString(obj.type) || !has(ACTION_TYPES, obj.type))
		{
			errors.push(path + '.type: invalid action type');
		}

		if (obj.type === 'writeTag' && (obj.tag == null || obj.tag === ''))
		{
			errors.push(path + '.tag: required for writeTag');
		}

		if ((obj.type === 'toggleTag' || obj.type === 'pulseTag') && (obj.tag == null || obj.tag === ''))
		{
			errors.push(path + '.tag: required for ' + obj.type);
		}
	};

	function validateActionsArray(list, path, errors)
	{
		if (!isArray(list))
		{
			errors.push(path + ': must be an array');

			return;
		}

		for (var i = 0; i < list.length; i++)
		{
			validateActionObj(list[i], path + '[' + i + ']', errors);
		}
	};

	function validateBindingObj(obj, path, errors)
	{
		if (!isPlainObject(obj))
		{
			errors.push(path + ': must be an object');

			return;
		}

		if ((obj.tag == null || obj.tag === '') && (obj.expr == null || obj.expr === ''))
		{
			errors.push(path + ': requires tag or expr');
		}

		if (!isString(obj.target) || !TARGET_RE.test(obj.target))
		{
			errors.push(path + '.target: required, must be label|tooltip|visible|attr:<n>|style:<k>|geo:x|y|width|height|prop:<n>');
		}

		if (obj.expr != null && obj.expr !== '')
		{
			try
			{
				Hmi.Expr.compile(obj.expr);
			}
			catch (e)
			{
				errors.push(path + '.expr: ' + e.message);
			}
		}
	};

	function validateBindings(list, errors)
	{
		if (!isArray(list))
		{
			errors.push('bindings: must be an array');

			return;
		}

		for (var i = 0; i < list.length; i++)
		{
			validateBindingObj(list[i], 'bindings[' + i + ']', errors);
		}
	};

	function validateEventObj(obj, path, errors)
	{
		if (!isPlainObject(obj))
		{
			errors.push(path + ': must be an object');

			return;
		}

		if (!isString(obj.on) || !has(EVENT_ON_VALUES, obj.on))
		{
			errors.push(path + '.on: invalid event name');
		}

		if (obj.on === 'message' && (obj.message == null || obj.message === ''))
		{
			errors.push(path + '.message: required when on=message');
		}

		validateConditionsArray(obj.conditions, path + '.conditions', errors);
		validateActionsArray(obj.actions || [], path + '.actions', errors);
	};

	function validateEvents(list, errors)
	{
		if (!isArray(list))
		{
			errors.push('events: must be an array');

			return;
		}

		for (var i = 0; i < list.length; i++)
		{
			validateEventObj(list[i], 'events[' + i + ']', errors);
		}
	};

	function validateTriggerObj(obj, path, errors)
	{
		if (!isPlainObject(obj))
		{
			errors.push(path + ': must be an object');

			return;
		}

		if (isArray(obj.states))
		{
			for (var i = 0; i < obj.states.length; i++)
			{
				var s = obj.states[i];
				var sp = path + '.states[' + i + ']';

				if (!isPlainObject(s))
				{
					errors.push(sp + ': must be an object');
					continue;
				}

				if (!isString(s.name) || s.name === '')
				{
					errors.push(sp + '.name: required');
				}

				validateConditionsArray(s.conditions || [], sp + '.conditions', errors);
				validateActionsArray(s.actions || [], sp + '.actions', errors);
			}
		}
		else
		{
			validateConditionsArray(obj.conditions || [], path + '.conditions', errors);
			validateActionsArray(obj.actions || [], path + '.actions', errors);

			if (obj.elseActions != null)
			{
				validateActionsArray(obj.elseActions, path + '.elseActions', errors);
			}
		}
	};

	function validateTriggers(list, errors)
	{
		if (!isArray(list))
		{
			errors.push('triggers: must be an array');

			return;
		}

		for (var i = 0; i < list.length; i++)
		{
			validateTriggerObj(list[i], 'triggers[' + i + ']', errors);
		}
	};

	function validateAnimationObj(obj, path, errors)
	{
		if (!isPlainObject(obj))
		{
			errors.push(path + ': must be an object');

			return;
		}

		if (!isString(obj.name) || obj.name === '')
		{
			errors.push(path + '.name: required');
		}

		if (obj.frames != null && !isArray(obj.frames))
		{
			errors.push(path + '.frames: must be an array');
		}
	};

	function validateAnimations(list, errors)
	{
		if (!isArray(list))
		{
			errors.push('animations: must be an array');

			return;
		}

		for (var i = 0; i < list.length; i++)
		{
			validateAnimationObj(list[i], 'animations[' + i + ']', errors);
		}
	};

	function validateDoc(obj, errors)
	{
		if (!isPlainObject(obj))
		{
			errors.push(': must be an object');

			return;
		}

		if (obj.sources != null)
		{
			if (!isArray(obj.sources))
			{
				errors.push('sources: must be an array');
			}
			else
			{
				for (var i = 0; i < obj.sources.length; i++)
				{
					validateSourceObj(obj.sources[i], 'sources[' + i + ']', errors);
				}
			}
		}

		if (obj.tags != null)
		{
			if (!isArray(obj.tags))
			{
				errors.push('tags: must be an array');
			}
			else
			{
				for (var j = 0; j < obj.tags.length; j++)
				{
					validateTagObj(obj.tags[j], 'tags[' + j + ']', errors);
				}
			}
		}

		if (obj.triggers != null)
		{
			validateTriggers(obj.triggers, errors);
		}

		if (obj.sim != null && ['off', 'on', 'only'].indexOf(obj.sim) < 0)
		{
			errors.push('sim: must be off|on|only');
		}

		if (obj.scripts != null && ['inherit', 'off'].indexOf(obj.scripts) < 0)
		{
			errors.push('scripts: must be inherit|off');
		}
	};


	// ---------------------------------------------------------------
	// validate(): animation links
	// ---------------------------------------------------------------

	function isFiniteNumber(v)
	{
		return typeof v === 'number' && isFinite(v);
	};

	function checkNumbers(link, fields, path, errors)
	{
		for (var k in fields)
		{
			if (link[k] != null && !isFiniteNumber(link[k]))
			{
				errors.push(path + '.' + k + ': must be a number');
			}
		}
	};

	function checkStrings(link, fields, path, errors)
	{
		for (var i = 0; i < fields.length; i++)
		{
			if (link[fields[i]] != null && !isString(link[fields[i]]))
			{
				errors.push(path + '.' + fields[i] + ': must be a string');
			}
		}
	};

	function checkBooleans(link, fields, path, errors)
	{
		for (var i = 0; i < fields.length; i++)
		{
			if (link[fields[i]] != null && typeof link[fields[i]] !== 'boolean')
			{
				errors.push(path + '.' + fields[i] + ': must be a boolean');
			}
		}
	};

	function checkRequiredString(link, field, path, errors)
	{
		if (!isString(link[field]) || link[field].replace(/\s+/g, '') === '')
		{
			errors.push(path + '.' + field + ': required');
		}
	};

	function validateLinkKey(key, path, errors)
	{
		if (key == null)
		{
			return;
		}

		if (!isPlainObject(key))
		{
			errors.push(path + ': must be an object or null');

			return;
		}

		if (!isString(key.key) || key.key === '')
		{
			errors.push(path + '.key: required');
		}

		checkBooleans(key, ['ctrl', 'shift'], path, errors);
	};

	function validateLinkFormat(f, path, errors)
	{
		if (f == null)
		{
			return;
		}

		if (!isPlainObject(f))
		{
			errors.push(path + ': must be an object');

			return;
		}

		if (f.mode != null && FORMAT_MODES.indexOf(f.mode) < 0)
		{
			errors.push(path + '.mode: must be one of ' + FORMAT_MODES.join('|'));
		}

		if (f.precision != null && !(isFiniteNumber(f.precision) && f.precision >= 0 && f.precision <= 8 &&
			Math.floor(f.precision) === f.precision))
		{
			errors.push(path + '.precision: must be an integer 0..8');
		}

		var bits = ['bitsFrom', 'bitsTo'];

		for (var i = 0; i < bits.length; i++)
		{
			var b = f[bits[i]];

			if (b != null && !(isFiniteNumber(b) && b >= 0 && b <= 31 && Math.floor(b) === b))
			{
				errors.push(path + '.' + bits[i] + ': must be an integer 0..31');
			}
		}

		checkBooleans(f, ['fixedWidth'], path, errors);
	};

	function validateColorLink(type, link, path, errors)
	{
		var kinds = ['discrete', 'analog', 'discreteAlarm', 'analogAlarm'];
		var i;

		if (kinds.indexOf(link.kind) < 0)
		{
			errors.push(path + '.kind: must be one of ' + kinds.join('|'));

			return;
		}

		if (link.kind === 'discrete')
		{
			checkRequiredString(link, 'expr', path, errors);
			checkStrings(link, ['offColor', 'onColor'], path, errors);
		}
		else if (link.kind === 'analog')
		{
			checkRequiredString(link, 'expr', path, errors);

			if (link.breakpoints != null && !isArray(link.breakpoints))
			{
				errors.push(path + '.breakpoints: must be an array');
			}
			else if (isArray(link.breakpoints))
			{
				if (link.breakpoints.length > 10)
				{
					errors.push(path + '.breakpoints: at most 10 entries');
				}

				for (i = 0; i < link.breakpoints.length; i++)
				{
					var bp = link.breakpoints[i];
					var bpPath = path + '.breakpoints[' + i + ']';

					if (!isPlainObject(bp))
					{
						errors.push(bpPath + ': must be an object');
						continue;
					}

					if (!isFiniteNumber(bp.value))
					{
						errors.push(bpPath + '.value: must be a number');
					}
					else if (i > 0 && isPlainObject(link.breakpoints[i - 1]) &&
						isFiniteNumber(link.breakpoints[i - 1].value) && bp.value < link.breakpoints[i - 1].value)
					{
						errors.push(bpPath + '.value: breakpoints must be in ascending order');
					}

					if (!isString(bp.color))
					{
						errors.push(bpPath + '.color: must be a string');
					}
				}
			}
		}
		else if (link.kind === 'discreteAlarm')
		{
			checkRequiredString(link, 'tag', path, errors);
			checkStrings(link, ['normalColor', 'alarmColor'], path, errors);
		}
		else
		{
			checkRequiredString(link, 'tag', path, errors);

			if (['value', 'deviation', 'roc'].indexOf(link.alarmType) < 0)
			{
				errors.push(path + '.alarmType: must be one of value|deviation|roc');
			}
			else if (link.colors != null && !isPlainObject(link.colors))
			{
				errors.push(path + '.colors: must be an object');
			}
			else if (isPlainObject(link.colors))
			{
				var keys = (link.alarmType === 'value') ? ['normal', 'lolo', 'lo', 'hi', 'hihi'] :
					((link.alarmType === 'deviation') ? ['normal', 'minor', 'major'] : ['normal', 'roc']);

				for (i = 0; i < keys.length; i++)
				{
					if (link.colors[keys[i]] != null && !isString(link.colors[keys[i]]))
					{
						errors.push(path + '.colors.' + keys[i] + ': must be a string');
					}
				}
			}
		}
	};

	function validateLink(type, link, path, errors)
	{
		var k;

		if (!isPlainObject(link))
		{
			errors.push(path + ': must be an object');

			return;
		}

		if (has(LINK_NUMBERS, type))
		{
			checkNumbers(link, LINK_NUMBERS[type], path, errors);
		}

		if (has(LINK_ENUMS, type))
		{
			for (k in LINK_ENUMS[type])
			{
				if (link[k] != null && LINK_ENUMS[type][k].indexOf(link[k]) < 0)
				{
					errors.push(path + '.' + k + ': must be one of ' + LINK_ENUMS[type][k].join('|'));
				}
			}
		}

		if (has(COLOR_LINKS, type))
		{
			validateColorLink(type, link, path, errors);

			return;
		}

		switch (type)
		{
			case 'valueDiscrete':
				checkRequiredString(link, 'expr', path, errors);
				checkStrings(link, ['onMessage', 'offMessage'], path, errors);
				break;

			case 'valueAnalog':
				checkRequiredString(link, 'expr', path, errors);
				validateLinkFormat(link.format, path + '.format', errors);
				break;

			case 'valueString':
			case 'locationH':
			case 'locationV':
			case 'orientation':
			case 'sizeHeight':
			case 'sizeWidth':
			case 'visibility':
			case 'disable':
				checkRequiredString(link, 'expr', path, errors);
				break;

			case 'fillVertical':
			case 'fillHorizontal':
				checkRequiredString(link, 'expr', path, errors);
				checkStrings(link, ['backgroundColor'], path, errors);
				break;

			case 'blink':
				checkRequiredString(link, 'expr', path, errors);
				checkStrings(link, ['textColor', 'lineColor', 'fillColor'], path, errors);
				break;

			case 'tooltip':
				if (link.mode === 'expression')
				{
					checkRequiredString(link, 'expr', path, errors);
				}
				else if (link.text != null && !isString(link.text))
				{
					errors.push(path + '.text: must be a string');
				}
				else if (isString(link.text) && link.text.length > 131)
				{
					errors.push(path + '.text: at most 131 characters');
				}

				break;

			case 'inputDiscrete':
				checkRequiredString(link, 'tag', path, errors);
				validateLinkKey(link.key, path + '.key', errors);
				checkStrings(link, ['message', 'setPrompt', 'resetPrompt', 'onMessage', 'offMessage'], path, errors);
				checkBooleans(link, ['inputOnly'], path, errors);
				break;

			case 'inputAnalog':
				checkRequiredString(link, 'tag', path, errors);
				validateLinkKey(link.key, path + '.key', errors);
				checkStrings(link, ['message'], path, errors);
				checkBooleans(link, ['keypad', 'inputOnly'], path, errors);
				validateLinkFormat(link.format, path + '.format', errors);

				var lim = ['min', 'max'];

				for (var i = 0; i < lim.length; i++)
				{
					var lv = link[lim[i]];

					if (lv != null && !isFiniteNumber(lv) && !(isString(lv) && lv.replace(/\s+/g, '') !== ''))
					{
						errors.push(path + '.' + lim[i] + ': must be a number or a tag name');
					}
				}

				if (isFiniteNumber(link.min) && isFiniteNumber(link.max) && link.max <= link.min)
				{
					errors.push(path + '.max: must be greater than min');
				}

				break;

			case 'inputString':
				checkRequiredString(link, 'tag', path, errors);
				validateLinkKey(link.key, path + '.key', errors);
				checkStrings(link, ['message', 'passwordChar'], path, errors);
				checkBooleans(link, ['keypad', 'encrypt', 'inputOnly'], path, errors);
				break;

			case 'sliderH':
			case 'sliderV':
				checkRequiredString(link, 'tag', path, errors);
				break;

			case 'pushDiscrete':
				checkRequiredString(link, 'tag', path, errors);
				validateLinkKey(link.key, path + '.key', errors);
				break;

			case 'pushAction':
				validateLinkKey(link.key, path + '.key', errors);

				if (link.scripts != null && !isArray(link.scripts))
				{
					errors.push(path + '.scripts: must be an array');
				}
				else if (isArray(link.scripts))
				{
					for (var s = 0; s < link.scripts.length; s++)
					{
						var sc = link.scripts[s];
						var sp = path + '.scripts[' + s + ']';

						if (!isPlainObject(sc))
						{
							errors.push(sp + ': must be an object');
							continue;
						}

						if (LINK_CONDITIONS.indexOf(sc.condition) < 0)
						{
							errors.push(sp + '.condition: must be one of ' + LINK_CONDITIONS.join('|'));
						}

						if (sc.period != null && !(isFiniteNumber(sc.period) && sc.period > 0))
						{
							errors.push(sp + '.period: must be a positive number');
						}

						if (!isString(sc.script))
						{
							errors.push(sp + '.script: must be a string');
						}
					}
				}

				break;

			case 'showWindow':
			case 'hideWindow':
				validateLinkKey(link.key, path + '.key', errors);

				if (link.windows != null && !isArray(link.windows))
				{
					errors.push(path + '.windows: must be an array');
				}
				else if (isArray(link.windows))
				{
					for (var w = 0; w < link.windows.length; w++)
					{
						if (!isString(link.windows[w]) || link.windows[w] === '')
						{
							errors.push(path + '.windows[' + w + ']: must be a non-empty string');
						}
					}
				}

				break;
		}
	};

	function validateLinks(obj, errors)
	{
		if (!isPlainObject(obj))
		{
			errors.push('links: must be an object');

			return;
		}

		for (var type in obj)
		{
			if (Object.prototype.hasOwnProperty.call(obj, type) &&
				(LINK_DISPLAY_EXPR.indexOf(type) >= 0 || LINK_TOUCH.indexOf(type) >= 0))
			{
				validateLink(type, obj[type], type, errors);
			}
		}
	};

	function validate(kind, obj)
	{
		var errors = [];

		switch (kind)
		{
			case 'doc':
				validateDoc(obj, errors);
				break;

			case 'source':
				validateSourceObj(obj, '', errors);
				break;

			case 'tag':
				validateTagObj(obj, '', errors);
				break;

			case 'bindings':
				validateBindings(obj, errors);
				break;

			case 'events':
				validateEvents(obj, errors);
				break;

			case 'triggers':
				validateTriggers(obj, errors);
				break;

			case 'animations':
				validateAnimations(obj, errors);
				break;

			case 'links':
				validateLinks(obj, errors);
				break;

			default:
				errors.push('unknown schema kind: ' + kind);
		}

		return errors;
	};

	// ---------------------------------------------------------------
	// parse()
	// ---------------------------------------------------------------

	/**
	 * parse(json, kind) -> value | null. Parses a JSON string (or passes an
	 * already-parsed value through), applies defaults(). Returns null on a
	 * JSON parse error or when validate() reports errors.
	 */
	function parse(json, kind)
	{
		var value;

		if (typeof json === 'string')
		{
			if (json === '')
			{
				value = (kind === 'bindings' || kind === 'events' || kind === 'triggers' || kind === 'animations') ? [] : {};
			}
			else
			{
				try
				{
					value = JSON.parse(json);
				}
				catch (e)
				{
					return null;
				}
			}
		}
		else
		{
			value = json;
		}

		value = defaults(kind, value);
		var errors = validate(kind, value);

		if (errors.length > 0)
		{
			return null;
		}

		return value;
	};

	Hmi.Schema = {
		defaults: defaults,
		validate: validate,
		parse: parse
	};
})();
