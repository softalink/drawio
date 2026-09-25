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
	};

	/**
	 * configure(tagDefs) -> records alarm limits per tag.
	 */
	Alarms.prototype.configure = function(tagDefs)
	{
		this.defs = {};

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
			}
		}
	};

	function severityFor(alarmDef, level)
	{
		if (alarmDef.severity != null && alarmDef.severity[level] != null)
		{
			return alarmDef.severity[level];
		}

		return (level === 'hihi' || level === 'lolo' || level === 'bool') ? 1 : 2;
	};

	function messageFor(alarmDef, level, tag)
	{
		if (alarmDef.messages != null && alarmDef.messages[level] != null)
		{
			return alarmDef.messages[level];
		}

		return tag + ' ' + level.toUpperCase();
	};

	/**
	 * Determines the currently-active limit level ('hihi'|'hi'|'lo'|'lolo'
	 * |'bool'|null) for a numeric/boolean value, applying deadband
	 * hysteresis against the tag's previous alarm state so a clearing alarm
	 * doesn't chatter at the threshold.
	 */
	Alarms.prototype.evaluateLevel = function(tag, alarmDef, value)
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

			var level = this.evaluateLevel(tag, alarmDef, entry.value);
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
