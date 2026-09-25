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
