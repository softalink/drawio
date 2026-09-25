var test = require('node:test');
var assert = require('node:assert');
var load = require('./load.js');
var Hmi = load(['core/HmiExpr.js', 'core/HmiCondition.js', 'core/HmiTagStore.js', 'core/HmiFormat.js', 'runtime/HmiTriggerEngine.js']);

function makeRt()
{
	var tags = new Hmi.TagStore();
	var runCalls = [];

	var rt = {
		tags: tags,
		index: { cells: {} },
		actions: {
			run: function(actions, ctx) { runCalls.push({ actions: actions, ctx: ctx }); }
		},
		log: function() {},
		_runCalls: runCalls
	};

	return rt;
}

test('simple trigger fires actions on false->true edge, elseActions on true->false', function()
{
	var rt = makeRt();
	rt.tags.define([{ name: 'T1', type: 'number', initial: 0 }]);
	var engine = new Hmi.TriggerEngine(rt);

	var trigger = {
		conditions: [{ tag: 'T1', operator: '>', value: 10 }],
		conditionType: 'and',
		actions: [{ type: 'notify', text: 'high' }],
		elseActions: [{ type: 'notify', text: 'normal' }]
	};

	engine.build({ cells: {} }, [trigger]);
	engine.evaluateAll(); // initial: false, no actions expected

	assert.strictEqual(rt._runCalls.length, 0);

	rt.tags.set('T1', 20);
	engine.evaluate(['T1']);
	assert.strictEqual(rt._runCalls.length, 1);
	assert.deepStrictEqual(rt._runCalls[0].actions, trigger.actions);

	rt.tags.set('T1', 5);
	engine.evaluate(['T1']);
	assert.strictEqual(rt._runCalls.length, 2);
	assert.deepStrictEqual(rt._runCalls[1].actions, trigger.elseActions);
});

test('initial evaluation: edge is taken from unknown state, only fires when true', function()
{
	var rt = makeRt();
	rt.tags.define([{ name: 'T1', type: 'number', initial: 50 }]); // already > 10
	var engine = new Hmi.TriggerEngine(rt);
	var trigger = { conditions: [{ tag: 'T1', operator: '>', value: 10 }], actions: [{ type: 'notify' }] };
	engine.build({ cells: {} }, [trigger]);
	engine.evaluateAll();
	assert.strictEqual(rt._runCalls.length, 1); // fires once for the initial true state
});

test('empty conditions array means always true', function()
{
	var rt = makeRt();
	var engine = new Hmi.TriggerEngine(rt);
	var trigger = { conditions: [], actions: [{ type: 'notify' }] };
	engine.build({ cells: {} }, [trigger]);
	engine.evaluateAll();
	assert.strictEqual(rt._runCalls.length, 1);
});

test('state machine: first match wins, actions run only on entry', function()
{
	var rt = makeRt();
	rt.tags.define([{ name: 'T1', type: 'number', initial: 0 }]);
	var engine = new Hmi.TriggerEngine(rt);

	var trigger = {
		states: [
			{ name: 'high', conditions: [{ tag: 'T1', operator: '>', value: 80 }], actions: [{ type: 'notify', text: 'high' }] },
			{ name: 'mid', conditions: [{ tag: 'T1', operator: '>', value: 20 }], actions: [{ type: 'notify', text: 'mid' }] },
			{ name: 'low', conditions: [], actions: [{ type: 'notify', text: 'low' }] }
		]
	};

	engine.build({ cells: {} }, [trigger]);
	engine.evaluateAll(); // T1=0 -> matches 'low' (first match: high fails, mid fails, low always true)
	assert.strictEqual(rt._runCalls.length, 1);
	assert.strictEqual(rt._runCalls[0].ctx.state, 'low');

	// Re-evaluate with the same value: must NOT re-run (actions only on entry).
	engine.evaluate(['T1']);
	assert.strictEqual(rt._runCalls.length, 1);

	rt.tags.set('T1', 50);
	engine.evaluate(['T1']);
	assert.strictEqual(rt._runCalls.length, 2);
	assert.strictEqual(rt._runCalls[1].ctx.state, 'mid');

	rt.tags.set('T1', 90);
	engine.evaluate(['T1']);
	assert.strictEqual(rt._runCalls.length, 3);
	assert.strictEqual(rt._runCalls[2].ctx.state, 'high');
});

test('onDelay: actions fire only after condition holds for onDelay ms', function(t, done)
{
	var rt = makeRt();
	rt.tags.define([{ name: 'T1', type: 'number', initial: 0 }]);
	var engine = new Hmi.TriggerEngine(rt);
	var trigger = {
		conditions: [{ tag: 'T1', operator: '>', value: 10 }],
		actions: [{ type: 'notify' }],
		onDelay: 30
	};
	engine.build({ cells: {} }, [trigger]);
	engine.evaluateAll();

	rt.tags.set('T1', 20);
	engine.evaluate(['T1']);
	assert.strictEqual(rt._runCalls.length, 0); // not yet, waiting on delay

	setTimeout(function()
	{
		assert.strictEqual(rt._runCalls.length, 0); // still before delay elapses
	}, 10);

	setTimeout(function()
	{
		assert.strictEqual(rt._runCalls.length, 1); // delay elapsed
		done();
	}, 50);
});

test('onDelay: condition flipping back before the delay cancels the pending action', function(t, done)
{
	var rt = makeRt();
	rt.tags.define([{ name: 'T1', type: 'number', initial: 0 }]);
	var engine = new Hmi.TriggerEngine(rt);
	var trigger = {
		conditions: [{ tag: 'T1', operator: '>', value: 10 }],
		actions: [{ type: 'notify' }],
		onDelay: 30
	};
	engine.build({ cells: {} }, [trigger]);
	engine.evaluateAll();

	rt.tags.set('T1', 20);
	engine.evaluate(['T1']);

	setTimeout(function()
	{
		rt.tags.set('T1', 0); // flips back before the 30ms onDelay elapses
		engine.evaluate(['T1']);
	}, 10);

	setTimeout(function()
	{
		assert.strictEqual(rt._runCalls.length, 0); // action never fired
		done();
	}, 60);
});

test('offDelay: elseActions fire only after condition stays false for offDelay ms', function(t, done)
{
	var rt = makeRt();
	rt.tags.define([{ name: 'T1', type: 'number', initial: 20 }]);
	var engine = new Hmi.TriggerEngine(rt);
	var trigger = {
		conditions: [{ tag: 'T1', operator: '>', value: 10 }],
		actions: [{ type: 'notify', text: 'on' }],
		elseActions: [{ type: 'notify', text: 'off' }],
		offDelay: 30
	};
	engine.build({ cells: {} }, [trigger]);
	engine.evaluateAll();
	assert.strictEqual(rt._runCalls.length, 1); // initial true

	rt.tags.set('T1', 0);
	engine.evaluate(['T1']);
	assert.strictEqual(rt._runCalls.length, 1); // waiting on offDelay

	setTimeout(function()
	{
		assert.strictEqual(rt._runCalls.length, 2);
		assert.deepStrictEqual(rt._runCalls[1].actions, trigger.elseActions);
		done();
	}, 60);
});

test('deadband: relaxes the threshold once the trigger is true (hysteresis)', function()
{
	var rt = makeRt();
	rt.tags.define([{ name: 'T1', type: 'number', initial: 0 }]);
	var engine = new Hmi.TriggerEngine(rt);
	var trigger = {
		conditions: [{ tag: 'T1', operator: '>', value: 80 }],
		actions: [{ type: 'notify' }],
		elseActions: [{ type: 'notify', text: 'off' }],
		deadband: 5
	};
	engine.build({ cells: {} }, [trigger]);
	engine.evaluateAll();

	rt.tags.set('T1', 85);
	engine.evaluate(['T1']);
	assert.strictEqual(rt._runCalls.length, 1); // entered true

	// Drops to 77 (< 80 but within the 5-wide deadband of 75) -> stays true.
	rt.tags.set('T1', 77);
	engine.evaluate(['T1']);
	assert.strictEqual(rt._runCalls.length, 1); // no elseActions yet

	// Drops below 80 - 5 = 75 -> clears.
	rt.tags.set('T1', 70);
	engine.evaluate(['T1']);
	assert.strictEqual(rt._runCalls.length, 2);
});

test('evaluate() only touches triggers whose refs intersect the changed tags', function()
{
	var rt = makeRt();
	rt.tags.define([{ name: 'A', type: 'number', initial: 0 }, { name: 'B', type: 'number', initial: 0 }]);
	var engine = new Hmi.TriggerEngine(rt);
	var triggerA = { conditions: [{ tag: 'A', operator: '>', value: 10 }], actions: [{ type: 'notify', text: 'A' }] };
	var triggerB = { conditions: [{ tag: 'B', operator: '>', value: 10 }], actions: [{ type: 'notify', text: 'B' }] };
	engine.build({ cells: {} }, [triggerA, triggerB]);
	engine.evaluateAll();

	rt.tags.set('A', 20);
	engine.evaluate(['A']);
	assert.strictEqual(rt._runCalls.length, 1);
	assert.deepStrictEqual(rt._runCalls[0].actions, triggerA.actions);
});

test('expr-based conditions and refs work through the engine', function()
{
	var rt = makeRt();
	rt.tags.define([{ name: 'A', type: 'number', initial: 0 }, { name: 'B', type: 'number', initial: 0 }]);
	var engine = new Hmi.TriggerEngine(rt);
	var trigger = {
		conditions: [{ expr: 'tag("A")+tag("B")', operator: '>', value: 10 }],
		actions: [{ type: 'notify' }]
	};
	engine.build({ cells: {} }, [trigger]);
	engine.evaluateAll();

	rt.tags.set('A', 6);
	engine.evaluate(['A']);
	assert.strictEqual(rt._runCalls.length, 0);

	rt.tags.set('B', 6);
	engine.evaluate(['B']);
	assert.strictEqual(rt._runCalls.length, 1);
});

test('cell triggers pass the resolved cell through ctx, doc triggers pass null', function()
{
	var rt = makeRt();
	var fakeCell = { id: 'c1' };
	rt.index.cells['c1'] = { cell: fakeCell, triggers: [{ conditions: [], actions: [{ type: 'notify' }] }] };
	var engine = new Hmi.TriggerEngine(rt);
	engine.build(rt.index, []);
	engine.evaluateAll();
	assert.strictEqual(rt._runCalls[0].ctx.cell, fakeCell);
});

test('document-level triggers (cellId null) work for page-wide logic', function()
{
	var rt = makeRt();
	rt.tags.define([{ name: 'Estop', type: 'boolean', initial: false }]);
	var engine = new Hmi.TriggerEngine(rt);
	var trigger = { conditions: [{ tag: 'Estop', operator: '==', value: true }], actions: [{ type: 'setProps' }] };
	engine.build({ cells: {} }, [trigger]);
	engine.evaluateAll();
	assert.strictEqual(rt._runCalls.length, 0);

	rt.tags.set('Estop', true);
	engine.evaluate(['Estop']);
	assert.strictEqual(rt._runCalls.length, 1);
	assert.strictEqual(rt._runCalls[0].ctx.cell, null);
});

test('reset() clears committed state and pending timers', function(t, done)
{
	var rt = makeRt();
	rt.tags.define([{ name: 'T1', type: 'number', initial: 0 }]);
	var engine = new Hmi.TriggerEngine(rt);
	var trigger = {
		conditions: [{ tag: 'T1', operator: '>', value: 10 }],
		actions: [{ type: 'notify' }],
		onDelay: 30
	};
	engine.build({ cells: {} }, [trigger]);
	engine.evaluateAll();

	rt.tags.set('T1', 20);
	engine.evaluate(['T1']); // schedules a pending onDelay timer

	engine.reset();

	setTimeout(function()
	{
		assert.strictEqual(rt._runCalls.length, 0); // pending timer was cancelled
		assert.strictEqual(engine.stateOf(null, 0).committed, null);
		done();
	}, 50);
});

test('stateOf() reports diagnostics for a given cell/trigger index', function()
{
	var rt = makeRt();
	rt.tags.define([{ name: 'T1', type: 'number', initial: 20 }]);
	var engine = new Hmi.TriggerEngine(rt);
	engine.build({ cells: {} }, [{ conditions: [{ tag: 'T1', operator: '>', value: 10 }], actions: [] }]);
	engine.evaluateAll();
	assert.strictEqual(engine.stateOf(null, 0).committed, true);
	assert.strictEqual(engine.stateOf(null, 99), null);
});
