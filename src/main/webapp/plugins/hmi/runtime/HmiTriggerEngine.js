/**
 * Hmi.TriggerEngine: evaluates simple triggers and state machines
 * (SRS HMI-TRG-1..6). DOM-light: receives `rt` (ARCHITECTURE.md §3.6).
 */
(function()
{
	var Hmi = (typeof globalThis !== 'undefined' ? globalThis : window).Hmi =
		(typeof globalThis !== 'undefined' ? globalThis : window).Hmi || {};

	function TriggerEngine(rt)
	{
		this.rt = rt;
		this.entries = [];       // [{cellId, index, trigger, refs, isStateMachine, state}]
		this.tagToTriggers = {}; // tag -> [entry, ...]
	};

	function triggerRefs(trigger)
	{
		var refs = [];

		if (Array.isArray(trigger.states))
		{
			for (var i = 0; i < trigger.states.length; i++)
			{
				var s = trigger.states[i];
				var stateRefs = Hmi.Condition.refs(s.conditions || []);

				for (var j = 0; j < stateRefs.length; j++)
				{
					if (refs.indexOf(stateRefs[j]) < 0)
					{
						refs.push(stateRefs[j]);
					}
				}
			}
		}
		else
		{
			refs = Hmi.Condition.refs(trigger.conditions || []);
		}

		return refs;
	};

	function makeEntry(cellId, index, trigger)
	{
		return {
			cellId: cellId,
			index: index,
			trigger: trigger,
			refs: triggerRefs(trigger),
			isStateMachine: Array.isArray(trigger.states),
			state: {
				committed: null,           // simple: null|true|false ; state machine: null|stateIndex
				pendingTarget: undefined,
				pendingTimer: null
			}
		};
	};

	/**
	 * build(index, docTriggers) -- index.cells[id].triggers holds each
	 * cell's hmiTriggers; docTriggers are document-level (cellId: null).
	 */
	TriggerEngine.prototype.build = function(index, docTriggers)
	{
		this.reset();
		this.entries = [];
		this.tagToTriggers = {};

		var cells = (index != null && index.cells != null) ? index.cells : {};

		for (var cellId in cells)
		{
			if (!Object.prototype.hasOwnProperty.call(cells, cellId))
			{
				continue;
			}

			var cellTriggers = cells[cellId].triggers || [];

			for (var i = 0; i < cellTriggers.length; i++)
			{
				this.addEntry(makeEntry(cellId, i, cellTriggers[i]));
			}
		}

		var docList = docTriggers || [];

		for (var j = 0; j < docList.length; j++)
		{
			this.addEntry(makeEntry(null, j, docList[j]));
		}
	};

	TriggerEngine.prototype.addEntry = function(entry)
	{
		this.entries.push(entry);

		for (var i = 0; i < entry.refs.length; i++)
		{
			var tag = entry.refs[i];

			if (this.tagToTriggers[tag] == null)
			{
				this.tagToTriggers[tag] = [];
			}

			this.tagToTriggers[tag].push(entry);
		}
	};

	function buildCtx(rt, changedSet)
	{
		return {
			value: function(tag) { return (rt.tags != null && typeof rt.tags.getValue === 'function') ? rt.tags.getValue(tag) : undefined; },
			quality: function(tag) { var e = (rt.tags != null && typeof rt.tags.get === 'function') ? rt.tags.get(tag) : null; return e != null ? e.quality : undefined; },
			changed: function(tag) { return changedSet != null && changedSet[tag] === true; },
			env: {
				tag: function(tag) { return (rt.tags != null && typeof rt.tags.getValue === 'function') ? rt.tags.getValue(tag) : undefined; },
				vars: {}
			}
		};
	};

	/**
	 * Applies numeric deadband hysteresis to > < >= <= conditions: when the
	 * trigger is currently 'true', the threshold relaxes by `deadband` so
	 * small oscillations near the edge don't re-fire.
	 */
	function deadbandConditions(conditions, deadband, currentlyTrue)
	{
		if (!deadband || !currentlyTrue)
		{
			return conditions;
		}

		var out = [];

		for (var i = 0; i < conditions.length; i++)
		{
			var c = conditions[i];

			if ((c.operator === '>' || c.operator === '>=') && typeof c.value === 'number')
			{
				var c1 = {};
				for (var k in c) { if (Object.prototype.hasOwnProperty.call(c, k)) c1[k] = c[k]; }
				c1.value = c.value - deadband;
				out.push(c1);
			}
			else if ((c.operator === '<' || c.operator === '<=') && typeof c.value === 'number')
			{
				var c2 = {};
				for (var k2 in c) { if (Object.prototype.hasOwnProperty.call(c, k2)) c2[k2] = c[k2]; }
				c2.value = c.value + deadband;
				out.push(c2);
			}
			else
			{
				out.push(c);
			}
		}

		return out;
	};

	TriggerEngine.prototype.runActions = function(entry, actions, stateLabel)
	{
		var rt = this.rt;

		if (actions == null || actions.length === 0 || rt.actions == null || typeof rt.actions.run !== 'function')
		{
			return;
		}

		var index = (rt.index != null && entry.cellId != null && rt.index.cells != null) ?
			rt.index.cells[entry.cellId] : null;
		var cell = index != null ? index.cell : null;

		try
		{
			rt.actions.run(actions, { cell: cell, trigger: entry.trigger, state: stateLabel });
		}
		catch (e)
		{
			if (typeof rt.log === 'function')
			{
				rt.log('error', 'trigger', 'action execution failed', { cellId: entry.cellId, error: String(e) });
			}
		}
	};

	TriggerEngine.prototype.evaluateSimple = function(entry, ctx)
	{
		var trigger = entry.trigger;
		var state = entry.state;
		var currentlyTrue = state.committed === true;
		var conds = deadbandConditions(trigger.conditions || [], trigger.deadband || 0, currentlyTrue);
		var raw = Hmi.Condition.testAll(conds, trigger.conditionType, ctx);
		var baseline = (state.committed === null) ? false : state.committed;

		if (raw === baseline && state.pendingTimer == null)
		{
			return;
		}

		if (raw === state.pendingTarget)
		{
			// Already waiting to commit this same value; nothing new.
			if (raw === baseline)
			{
				this.clearPending(state);
			}

			return;
		}

		this.clearPending(state);

		if (raw === baseline)
		{
			// Flipped back to the committed baseline before any delay fired.
			return;
		}

		var delay = raw ? (trigger.onDelay || 0) : (trigger.offDelay || 0);
		var self = this;

		if (delay <= 0)
		{
			this.commitSimple(entry, raw);
		}
		else
		{
			state.pendingTarget = raw;
			state.pendingTimer = setTimeout(function()
			{
				state.pendingTimer = null;
				state.pendingTarget = undefined;
				self.commitSimple(entry, raw);
			}, delay);
		}
	};

	TriggerEngine.prototype.clearPending = function(state)
	{
		if (state.pendingTimer != null)
		{
			clearTimeout(state.pendingTimer);
			state.pendingTimer = null;
		}

		state.pendingTarget = undefined;
	};

	TriggerEngine.prototype.commitSimple = function(entry, value)
	{
		var wasUnknown = entry.state.committed === null;
		entry.state.committed = value;

		if (value === true)
		{
			this.runActions(entry, entry.trigger.actions || [], true);
		}
		else if (!wasUnknown)
		{
			// true -> false edge only (not unknown -> false).
			this.runActions(entry, entry.trigger.elseActions || [], false);
		}
	};

	TriggerEngine.prototype.evaluateStateMachine = function(entry, ctx)
	{
		var states = entry.trigger.states || [];
		var newIndex = -1;

		for (var i = 0; i < states.length; i++)
		{
			var s = states[i];

			if (Hmi.Condition.testAll(s.conditions || [], s.conditionType, ctx))
			{
				newIndex = i;
				break;
			}
		}

		if (newIndex !== entry.state.committed)
		{
			entry.state.committed = newIndex;

			if (newIndex >= 0)
			{
				this.runActions(entry, states[newIndex].actions || [], states[newIndex].name);
			}
		}
	};

	TriggerEngine.prototype.evaluateEntry = function(entry, ctx)
	{
		if (entry.isStateMachine)
		{
			this.evaluateStateMachine(entry, ctx);
		}
		else
		{
			this.evaluateSimple(entry, ctx);
		}
	};

	/**
	 * evaluate(changedTags) -> evaluates only entries whose refs intersect
	 * changedTags.
	 */
	TriggerEngine.prototype.evaluate = function(changedTags)
	{
		if (changedTags == null || changedTags.length === 0)
		{
			return;
		}

		var changedSet = {};
		var affected = [];
		var seen = {};

		for (var i = 0; i < changedTags.length; i++)
		{
			var tag = changedTags[i];
			changedSet[tag] = true;

			var list = this.tagToTriggers[tag];

			if (list == null)
			{
				continue;
			}

			for (var j = 0; j < list.length; j++)
			{
				var entry = list[j];
				var key = (entry.cellId == null ? 'doc' : entry.cellId) + '#' + entry.index;

				if (!seen[key])
				{
					seen[key] = true;
					affected.push(entry);
				}
			}
		}

		var ctx = buildCtx(this.rt, changedSet);

		for (var k = 0; k < affected.length; k++)
		{
			this.evaluateEntry(affected[k], ctx);
		}
	};

	/**
	 * evaluateAll() -> evaluates every trigger (used at runtime start,
	 * HMI-TRG-5).
	 */
	TriggerEngine.prototype.evaluateAll = function()
	{
		var ctx = buildCtx(this.rt, {});

		for (var i = 0; i < this.entries.length; i++)
		{
			this.evaluateEntry(this.entries[i], ctx);
		}
	};

	/**
	 * reset() -> clears all trigger state and pending timers.
	 */
	TriggerEngine.prototype.reset = function()
	{
		for (var i = 0; i < this.entries.length; i++)
		{
			this.clearPending(this.entries[i].state);
			this.entries[i].state.committed = null;
		}
	};

	/**
	 * stateOf(cellId, triggerIndex) -> diagnostics: the committed state.
	 */
	TriggerEngine.prototype.stateOf = function(cellId, triggerIndex)
	{
		for (var i = 0; i < this.entries.length; i++)
		{
			var entry = this.entries[i];

			if (entry.cellId === cellId && entry.index === triggerIndex)
			{
				return {
					committed: entry.state.committed,
					pending: entry.state.pendingTarget
				};
			}
		}

		return null;
	};

	Hmi.TriggerEngine = TriggerEngine;
})();
