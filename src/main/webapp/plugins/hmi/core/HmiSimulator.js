/**
 * Hmi.Simulator: per-tag simulation (SRS HMI-SIM-1..4).
 * mockValue() syntax ported from meta2d.js (MIT), le5le:
 * packages/core/src/core.ts `mockValue`/`dataMock`.
 *
 * DOM-free (ARCHITECTURE.md §1).
 */
(function()
{
	var Hmi = (typeof globalThis !== 'undefined' ? globalThis : window).Hmi =
		(typeof globalThis !== 'undefined' ? globalThis : window).Hmi || {};

	function defaultLog(level, category, message, data)
	{
		if (typeof console !== 'undefined' && console[level])
		{
			console[level]('[' + category + '] ' + message, data || '');
		}
	};

	var DEFAULT_TICK_MS = 250;
	var DEFAULT_INTERVAL_MS = 1000;

	/**
	 * new Simulator(tagStore, {log})
	 */
	function Simulator(tagStore, opts)
	{
		opts = opts || {};
		this.tags = tagStore;
		this.log = opts.log || defaultLog;
		this.runScript = opts.runScript;
		this.states = {}; // name -> {def, phase, listIndex, toggleOn, nextAt, lastValue}
		this.timer = null;
		this.tickMs = DEFAULT_TICK_MS;
	};

	Simulator.prototype.configure = function(tagDefs)
	{
		this.states = {};

		if (tagDefs == null)
		{
			return;
		}

		for (var i = 0; i < tagDefs.length; i++)
		{
			var def = tagDefs[i];

			if (def == null || def.sim == null || def.name == null)
			{
				continue;
			}

			this.states[def.name] = {
				def: def,
				phase: Math.random() * Math.PI * 2,
				listIndex: 0,
				toggleOn: false,
				nextAt: 0, // fire on the first step(), whatever `now` it is called with
				lastValue: (def.sim.kind === 'ramp') ? (def.sim.min != null ? def.sim.min : 0) : undefined
			};
		}
	};

	Simulator.prototype.stepTag = function(name, state, now)
	{
		var def = state.def;
		var sim = def.sim || {};
		var interval = sim.interval > 0 ? sim.interval : DEFAULT_INTERVAL_MS;

		if (now < state.nextAt)
		{
			return;
		}

		state.nextAt = now + interval;

		var value;

		switch (sim.kind)
		{
			case 'random':
				var min = sim.min != null ? sim.min : 0;
				var max = sim.max != null ? sim.max : 100;
				value = min + Math.random() * (max - min);

				if (sim.integer)
				{
					value = Math.round(value);
				}

				break;

			case 'sine':
				var smin = sim.min != null ? sim.min : 0;
				var smax = sim.max != null ? sim.max : 100;
				var period = sim.period > 0 ? sim.period : 60000;
				var mid = (smin + smax) / 2;
				var amp = (smax - smin) / 2;
				value = mid + amp * Math.sin((now / period) * 2 * Math.PI);
				break;

			case 'ramp':
				var rmin = sim.min != null ? sim.min : 0;
				var rmax = sim.max != null ? sim.max : 100;
				var step = sim.step != null ? sim.step : 1;
				var cur = state.lastValue != null ? state.lastValue : rmin;
				cur += step;

				if (cur > rmax)
				{
					cur = rmin;
				}
				else if (cur < rmin)
				{
					cur = rmax;
				}

				value = cur;
				state.lastValue = cur;
				break;

			case 'list':
				var values = sim.values || [];

				if (values.length === 0)
				{
					return;
				}

				value = values[state.listIndex % values.length];
				state.listIndex++;
				break;

			case 'toggle':
				state.toggleOn = !state.toggleOn;
				value = state.toggleOn;
				break;

			case 'constant':
				value = (sim.value != null) ? sim.value : ((sim.values && sim.values.length > 0) ?
					sim.values[0] : def.initial);
				break;

			case 'script':
				if (this.runScript)
				{
					var self = this;

					this.runScript(sim.code, { tag: name }).then(function(result)
					{
						self.tags.set(name, result, { quality: 'good', source: 'sim' });
					})['catch'](function(err)
					{
						self.log('warn', 'simulator', 'sim script failed', { tag: name, error: String(err) });
					});
				}

				return;

			default:
				return;
		}

		this.tags.set(name, value, { quality: 'good', source: 'sim', ts: now });
	};

	/**
	 * step(now) -> testable deterministically without timers.
	 */
	Simulator.prototype.step = function(now)
	{
		now = now != null ? now : Date.now();

		for (var name in this.states)
		{
			if (Object.prototype.hasOwnProperty.call(this.states, name))
			{
				this.stepTag(name, this.states[name], now);
			}
		}
	};

	/**
	 * start(ms) -> setInterval driving step() at a base tick (default 250ms).
	 */
	Simulator.prototype.start = function(ms)
	{
		this.stop();
		this.tickMs = ms > 0 ? ms : DEFAULT_TICK_MS;

		var self = this;

		this.timer = setInterval(function()
		{
			self.step(Date.now());
		}, this.tickMs);
	};

	Simulator.prototype.stop = function()
	{
		if (this.timer != null)
		{
			clearInterval(this.timer);
			this.timer = null;
		}
	};

	/**
	 * write(tag, value) -> manual override of a simulated tag's current
	 * value (SRS HMI-SIM-4); keeps the simulation running from that value
	 * for 'ramp'.
	 */
	Simulator.prototype.write = function(tag, value)
	{
		var state = this.states[tag];

		if (state != null)
		{
			state.lastValue = value;
		}

		this.tags.set(tag, value, { quality: 'good', source: 'sim' });
	};

	/**
	 * mockValue(spec) -- meta2d syntax.
	 * spec: {type: 'float'|'integer'|'bool'|'string', mock: '...'}
	 * mock forms: 'a-b' range, 'a,b,c' list, 'true'/'false', '[n]' random string.
	 */
	function randomString(len)
	{
		var chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
		var out = '';

		for (var i = 0; i < len; i++)
		{
			out += chars.charAt(Math.floor(Math.random() * chars.length));
		}

		return out;
	};

	function mockValue(spec)
	{
		if (spec == null || spec.mock === undefined)
		{
			return undefined;
		}

		var mock = spec.mock;
		var type = spec.type;

		if (type === 'float' || type === 'integer')
		{
			if (typeof mock === 'string' && mock.indexOf(',') >= 0)
			{
				var arr = mock.split(',');
				var pick = arr[Math.floor(Math.random() * arr.length)];

				return type === 'integer' ? parseInt(pick, 10) : parseFloat(pick);
			}

			if (typeof mock === 'string' && mock.indexOf('-') >= 0 && mock.indexOf('-') !== 0)
			{
				var parts = mock.split('-');
				var min = parseFloat(parts[0]);
				var max = parseFloat(parts[1]);
				var v = Math.random() * (max - min) + min;

				return type === 'integer' ? Math.round(v) : v;
			}

			return type === 'integer' ? parseInt(mock, 10) : parseFloat(mock);
		}

		if (type === 'bool')
		{
			if (typeof mock === 'boolean')
			{
				return mock;
			}

			if (mock === 'true')
			{
				return true;
			}

			if (mock === 'false')
			{
				return false;
			}

			return Math.random() < 0.5;
		}

		// string
		if (typeof mock === 'string' && mock.indexOf(',') >= 0)
		{
			var sarr = mock.split(',');

			return sarr[Math.floor(Math.random() * sarr.length)];
		}

		if (typeof mock === 'string' && mock.charAt(0) === '[' && mock.charAt(mock.length - 1) === ']')
		{
			var len = parseInt(mock.substring(1, mock.length - 1), 10);

			return randomString(isNaN(len) ? 0 : len);
		}

		return mock;
	};

	Simulator.mockValue = mockValue;

	Hmi.Simulator = Simulator;
})();
