/**
 * Hmi.Alarms: session-local alarm tracking (SRS HMI-ALM-1..5).
 * DOM-light: receives `rt` (ARCHITECTURE.md §3.6).
 */
(function()
{
	var Hmi = (typeof globalThis !== 'undefined' ? globalThis : window).Hmi =
		(typeof globalThis !== 'undefined' ? globalThis : window).Hmi || {};

	function Alarms(rt)
	{
		this.rt = rt;
		this.defs = {};   // tag -> tagDef.alarms
		this.active = {}; // tag -> {level, severity, message, state, ts, value}
		this.last = {};   // tag -> {value, ts, roc} previous sample for rate-of-change alarms
		this.targetDeps = {}; // deviation target tag -> [alarm tags]
	};

	/**
	 * configure(tagDefs) -> records alarm limits per tag.
	 */
	Alarms.prototype.configure = function(tagDefs)
	{
		this.defs = {};
		this.last = {};
		this.targetDeps = {};

		if (tagDefs == null)
		{
			return;
		}

		for (var i = 0; i < tagDefs.length; i++)
		{
			var def = tagDefs[i];

			if (def != null && def.alarms != null && def.name != null)
			{
				this.defs[def.name] = def.alarms;

				var dev = deviationOf(def.alarms);

				if (dev != null && typeof dev.target === 'string' && dev.target !== '')
				{
					(this.targetDeps[dev.target] = this.targetDeps[dev.target] || []).push(def.name);
				}
			}
		}
	};

	/**
	 * Deviation settings: flat ({target, minorDev, majorDev}) or nested
	 * ({deviation: {...}}). Returns null when none is configured.
	 */
	function deviationOf(alarmDef)
	{
		var d = (alarmDef.deviation != null && typeof alarmDef.deviation === 'object') ? alarmDef.deviation : alarmDef;

		if (d.target == null || (d.minorDev == null && d.majorDev == null))
		{
			return null;
		}

		return d;
	};

	function rocOf(alarmDef)
	{
		var r = alarmDef.roc;

		if (r != null && typeof r === 'object')
		{
			r = r.limit != null ? r.limit : r.roc;
		}

		return (typeof r === 'number' && !isNaN(r)) ? r : null;
	};

	function severityFor(alarmDef, level)
	{
		if (alarmDef.severity != null && alarmDef.severity[level] != null)
		{
			return alarmDef.severity[level];
		}

		return (level === 'hihi' || level === 'lolo' || level === 'bool' || level === 'major') ? 1 : 2;
	};

	function messageFor(alarmDef, level, tag)
	{
		if (alarmDef.messages != null && alarmDef.messages[level] != null)
		{
			return alarmDef.messages[level];
		}

		if (level === 'minor' || level === 'major')
		{
			return tag + ' ' + level.toUpperCase() + ' DEVIATION';
		}

		if (level === 'roc')
		{
			return tag + ' RATE OF CHANGE';
		}

		return tag + ' ' + level.toUpperCase();
	};

	/**
	 * Determines the currently-active limit level ('hihi'|'hi'|'lo'|'lolo'
	 * |'bool'|null) for a numeric/boolean value, applying deadband
	 * hysteresis against the tag's previous alarm state so a clearing alarm
	 * doesn't chatter at the threshold.
	 */
	Alarms.prototype.evaluateLevel = function(tag, alarmDef, value, ts)
	{
		var valueLevel = this.valueLevel(tag, alarmDef, value);
		var devLevel = this.deviationLevel(alarmDef, value);
		var rocLevel = this.rocLevel(tag, alarmDef, value, ts);
		var order = ['hihi', 'lolo', 'major', 'hi', 'lo', 'minor', 'roc', 'bool'];
		var found = [valueLevel, devLevel, rocLevel];

		for (var i = 0; i < order.length; i++)
		{
			if (found.indexOf(order[i]) >= 0)
			{
				return order[i];
			}
		}

		return null;
	};

	/**
	 * 'major' | 'minor' | null: absolute deviation from the target (a
	 * number or the name of a tag).
	 */
	Alarms.prototype.deviationLevel = function(alarmDef, value)
	{
		var dev = deviationOf(alarmDef);

		if (dev == null)
		{
			return null;
		}

		var target = dev.target;

		if (typeof target === 'string')
		{
			var rt = this.rt;
			target = (rt.tags != null && typeof rt.tags.getValue === 'function') ? rt.tags.getValue(target) : undefined;
		}

		var t = (target == null || target === '' || typeof target === 'boolean') ? NaN : Number(target);
		var v = Number(value);

		if (isNaN(t) || isNaN(v))
		{
			return null;
		}

		var diff = Math.abs(v - t);

		if (dev.majorDev != null && diff >= dev.majorDev)
		{
			return 'major';
		}

		if (dev.minorDev != null && diff >= dev.minorDev)
		{
			return 'minor';
		}

		return null;
	};

	/**
	 * 'roc' while the absolute rate between the last two samples exceeds
	 * the limit; re-evaluated only for a new sample.
	 */
	Alarms.prototype.rocLevel = function(tag, alarmDef, value, ts)
	{
		var limit = rocOf(alarmDef);

		if (limit == null)
		{
			return null;
		}

		var v = Number(value);
		var now = (ts != null) ? ts : Date.now();
		var prev = this.last[tag];

		if (isNaN(v))
		{
			return null;
		}

		if (prev == null)
		{
			this.last[tag] = { value: v, ts: now, roc: false };

			return null;
		}

		if (prev.ts === now && prev.value === v)
		{
			return prev.roc ? 'roc' : null;
		}

		var dt = (now - prev.ts) / 1000;

		if (dt <= 0)
		{
			return prev.roc ? 'roc' : null;
		}

		var rate = Math.abs(v - prev.value) / dt;
		var roc = rate > limit;
		this.last[tag] = { value: v, ts: now, roc: roc };

		return roc ? 'roc' : null;
	};

	Alarms.prototype.valueLevel = function(tag, alarmDef, value)
	{
		var deadband = alarmDef.deadband || 0;
		var prevLevel = this.active[tag] != null ? this.active[tag].level : null;

		if (alarmDef.bool != null)
		{
			return (!!value === alarmDef.bool) ? 'bool' : null;
		}

		var v = Number(value);

		if (isNaN(v))
		{
			return null;
		}

		// Widen the currently-active threshold by the deadband so the alarm
		// only clears once the value has moved back past it (hysteresis).
		var hihiThresh = alarmDef.hihi;
		var hiThresh = alarmDef.hi;
		var loThresh = alarmDef.lo;
		var loloThresh = alarmDef.lolo;

		if (prevLevel === 'hihi' && hihiThresh != null)
		{
			hihiThresh -= deadband;
		}

		if (prevLevel === 'hi' && hiThresh != null)
		{
			hiThresh -= deadband;
		}

		if (prevLevel === 'lo' && loThresh != null)
		{
			loThresh += deadband;
		}

		if (prevLevel === 'lolo' && loloThresh != null)
		{
			loloThresh += deadband;
		}

		if (hihiThresh != null && v >= hihiThresh)
		{
			return 'hihi';
		}

		if (hiThresh != null && v >= hiThresh)
		{
			return 'hi';
		}

		if (loloThresh != null && v <= loloThresh)
		{
			return 'lolo';
		}

		if (loThresh != null && v <= loThresh)
		{
			return 'lo';
		}

		return null;
	};

	/**
	 * evaluate(changedTags) -> [] of tags whose alarm state changed.
	 */
	Alarms.prototype.evaluate = function(changedTags)
	{
		var rt = this.rt;
		var changedAlarms = [];
		var tags = changedTags;

		if (tags != null)
		{
			tags = tags.slice();

			for (var ci = 0; ci < changedTags.length; ci++)
			{
				var deps = Object.prototype.hasOwnProperty.call(this.targetDeps, changedTags[ci]) ?
					this.targetDeps[changedTags[ci]] : null;

				for (var di = 0; deps != null && di < deps.length; di++)
				{
					if (tags.indexOf(deps[di]) < 0)
					{
						tags.push(deps[di]);
					}
				}
			}
		}

		if (tags == null)
		{
			tags = [];

			for (var name in this.defs)
			{
				if (Object.prototype.hasOwnProperty.call(this.defs, name))
				{
					tags.push(name);
				}
			}
		}

		for (var i = 0; i < tags.length; i++)
		{
			var tag = tags[i];
			var alarmDef = this.defs[tag];

			if (alarmDef == null)
			{
				continue;
			}

			var entry = (rt.tags != null && typeof rt.tags.get === 'function') ? rt.tags.get(tag) : null;

			if (entry == null)
			{
				continue;
			}

			var level = this.evaluateLevel(tag, alarmDef, entry.value, entry.ts);
			var current = this.active[tag];

			if (level != null)
			{
				if (current == null || current.state === 'cleared-unack')
				{
					this.active[tag] = {
						tag: tag,
						level: level,
						severity: severityFor(alarmDef, level),
						message: messageFor(alarmDef, level, tag),
						state: 'active-unack',
						ts: Date.now(),
						value: entry.value
					};
					changedAlarms.push(tag);
				}
				else if (current.level !== level)
				{
					current.level = level;
					current.severity = severityFor(alarmDef, level);
					current.message = messageFor(alarmDef, level, tag);
					current.value = entry.value;
					current.ts = Date.now();
					changedAlarms.push(tag);
				}
			}
			else if (current != null && (current.state === 'active-unack' || current.state === 'active-ack'))
			{
				if (current.state === 'active-unack')
				{
					current.state = 'cleared-unack';
					current.ts = Date.now();
					changedAlarms.push(tag);
				}
				else
				{
					// active-ack -> cleared, and already acked: remove it.
					delete this.active[tag];
					changedAlarms.push(tag);
				}
			}
		}

		if (changedAlarms.length > 0 && typeof rt.fire === 'function')
		{
			rt.fire('alarm', { list: this.list(), changed: changedAlarms });
		}

		return changedAlarms;
	};

	/**
	 * list() -> [{tag, level, severity, message, state, ts}]
	 */
	Alarms.prototype.list = function()
	{
		var out = [];

		for (var tag in this.active)
		{
			if (Object.prototype.hasOwnProperty.call(this.active, tag))
			{
				var a = this.active[tag];
				out.push({ tag: a.tag, level: a.level, severity: a.severity, message: a.message, state: a.state, ts: a.ts });
			}
		}

		return out;
	};

	/**
	 * stateOf(tag) -> {active, level, acked, severity} | {active: false}.
	 * level is hihi|hi|lo|lolo for value alarms, minor|major for deviation,
	 * roc for rate of change and 'alarm' for discrete (bool) alarms.
	 */
	Alarms.prototype.stateOf = function(tag)
	{
		var a = Object.prototype.hasOwnProperty.call(this.active, tag) ? this.active[tag] : null;

		if (a == null || a.state === 'cleared-unack')
		{
			return { active: false };
		}

		return {
			active: true,
			level: (a.level === 'bool') ? 'alarm' : a.level,
			acked: a.state === 'active-ack',
			severity: a.severity
		};
	};

	/**
	 * ack(tag?) -> acknowledges one alarm, or all when omitted. A
	 * cleared-unack alarm becomes fully cleared (removed) on ack.
	 */
	Alarms.prototype.ack = function(tag)
	{
		var rt = this.rt;
		var changed = [];

		function ackOne(name, entry)
		{
			if (entry.state === 'active-unack')
			{
				entry.state = 'active-ack';
				changed.push(name);
			}
			else if (entry.state === 'cleared-unack')
			{
				changed.push(name);
			}
		};

		if (tag != null)
		{
			var entry = this.active[tag];

			if (entry != null)
			{
				var wasCleared = entry.state === 'cleared-unack';
				ackOne(tag, entry);

				if (wasCleared)
				{
					delete this.active[tag];
				}
			}
		}
		else
		{
			var toDelete = [];

			for (var name in this.active)
			{
				if (Object.prototype.hasOwnProperty.call(this.active, name))
				{
					var e = this.active[name];
					var wasClearedAll = e.state === 'cleared-unack';
					ackOne(name, e);

					if (wasClearedAll)
					{
						toDelete.push(name);
					}
				}
			}

			for (var d = 0; d < toDelete.length; d++)
			{
				delete this.active[toDelete[d]];
			}
		}

		if (changed.length > 0 && typeof rt.fire === 'function')
		{
			rt.fire('alarm', { list: this.list(), changed: changed });
		}

		return changed;
	};

	/**
	 * counts() -> {bySeverity: {1: n, 2: n, ...}, total}
	 */
	Alarms.prototype.counts = function()
	{
		var bySeverity = {};
		var total = 0;

		for (var tag in this.active)
		{
			if (Object.prototype.hasOwnProperty.call(this.active, tag))
			{
				var a = this.active[tag];
				bySeverity[a.severity] = (bySeverity[a.severity] || 0) + 1;
				total++;
			}
		}

		return { bySeverity: bySeverity, total: total };
	};

	/**
	 * highestUnacked(tag) -> the highest-severity unacknowledged alarm for a
	 * tag (lower number = higher severity), or null.
	 */
	Alarms.prototype.highestUnacked = function(tag)
	{
		var a = this.active[tag];

		if (a != null && (a.state === 'active-unack' || a.state === 'cleared-unack'))
		{
			return a;
		}

		return null;
	};

	Hmi.Alarms = Alarms;
})();
