var test = require('node:test');
var assert = require('node:assert');
var load = require('./load.js');
var Hmi = load(['core/HmiExpr.js', 'core/HmiFormat.js', 'core/HmiTagStore.js', 'runtime/HmiAlarms.js']);

function makeRt()
{
	var tags = new Hmi.TagStore();
	var events = [];

	return {
		tags: tags,
		fire: function(name, payload) { events.push([name, payload]); },
		_events: events
	};
}

test('hi/hihi limits activate in order of severity', function()
{
	var rt = makeRt();
	rt.tags.define([{ name: 'T1', type: 'number', initial: 0, alarms: { hi: 80, hihi: 95 } }]);
	var alarms = new Hmi.Alarms(rt);
	alarms.configure([rt.tags.getDef('T1')]);

	rt.tags.set('T1', 85);
	alarms.evaluate(['T1']);
	var list = alarms.list();
	assert.strictEqual(list.length, 1);
	assert.strictEqual(list[0].level, 'hi');
	assert.strictEqual(list[0].state, 'active-unack');

	rt.tags.set('T1', 97);
	alarms.evaluate(['T1']);
	list = alarms.list();
	assert.strictEqual(list[0].level, 'hihi');
});

test('lo/lolo limits', function()
{
	var rt = makeRt();
	rt.tags.define([{ name: 'T1', type: 'number', initial: 50, alarms: { lo: 20, lolo: 5 } }]);
	var alarms = new Hmi.Alarms(rt);
	alarms.configure([rt.tags.getDef('T1')]);

	rt.tags.set('T1', 15);
	alarms.evaluate(['T1']);
	assert.strictEqual(alarms.list()[0].level, 'lo');

	rt.tags.set('T1', 2);
	alarms.evaluate(['T1']);
	assert.strictEqual(alarms.list()[0].level, 'lolo');
});

test('boolean alarm', function()
{
	var rt = makeRt();
	rt.tags.define([{ name: 'Fault', type: 'boolean', initial: false, alarms: { bool: true } }]);
	var alarms = new Hmi.Alarms(rt);
	alarms.configure([rt.tags.getDef('Fault')]);

	rt.tags.set('Fault', true);
	alarms.evaluate(['Fault']);
	assert.strictEqual(alarms.list().length, 1);
	assert.strictEqual(alarms.list()[0].level, 'bool');

	rt.tags.set('Fault', false);
	alarms.evaluate(['Fault']);
	assert.strictEqual(alarms.list()[0].state, 'cleared-unack');
});

test('deadband hysteresis prevents chatter at the exact threshold', function()
{
	var rt = makeRt();
	rt.tags.define([{ name: 'T1', type: 'number', initial: 0, alarms: { hi: 80, deadband: 5 } }]);
	var alarms = new Hmi.Alarms(rt);
	alarms.configure([rt.tags.getDef('T1')]);

	rt.tags.set('T1', 81);
	alarms.evaluate(['T1']);
	assert.strictEqual(alarms.list().length, 1); // active

	// Drops just below 80 but within the deadband -> should stay active.
	rt.tags.set('T1', 78);
	alarms.evaluate(['T1']);
	assert.strictEqual(alarms.list()[0].state, 'active-unack');

	// Drops below hi - deadband (75) -> clears.
	rt.tags.set('T1', 74);
	alarms.evaluate(['T1']);
	assert.strictEqual(alarms.list()[0].state, 'cleared-unack');
});

test('states: active-unack -> active-ack -> cleared (removed after ack)', function()
{
	var rt = makeRt();
	rt.tags.define([{ name: 'T1', type: 'number', initial: 0, alarms: { hi: 80 } }]);
	var alarms = new Hmi.Alarms(rt);
	alarms.configure([rt.tags.getDef('T1')]);

	rt.tags.set('T1', 90);
	alarms.evaluate(['T1']);
	assert.strictEqual(alarms.list()[0].state, 'active-unack');

	alarms.ack('T1');
	assert.strictEqual(alarms.list()[0].state, 'active-ack');

	rt.tags.set('T1', 10); // clears while acked
	alarms.evaluate(['T1']);
	assert.strictEqual(alarms.list().length, 0); // removed immediately (already acked)
});

test('states: active-unack -> cleared-unack -> ack removes it', function()
{
	var rt = makeRt();
	rt.tags.define([{ name: 'T1', type: 'number', initial: 0, alarms: { hi: 80 } }]);
	var alarms = new Hmi.Alarms(rt);
	alarms.configure([rt.tags.getDef('T1')]);

	rt.tags.set('T1', 90);
	alarms.evaluate(['T1']);
	rt.tags.set('T1', 10);
	alarms.evaluate(['T1']);
	assert.strictEqual(alarms.list()[0].state, 'cleared-unack');

	alarms.ack();
	assert.strictEqual(alarms.list().length, 0);
});

test('ack(): acknowledges all when no tag given', function()
{
	var rt = makeRt();
	rt.tags.define([
		{ name: 'T1', type: 'number', initial: 0, alarms: { hi: 80 } },
		{ name: 'T2', type: 'number', initial: 0, alarms: { hi: 80 } }
	]);
	var alarms = new Hmi.Alarms(rt);
	alarms.configure([rt.tags.getDef('T1'), rt.tags.getDef('T2')]);

	rt.tags.set('T1', 90);
	rt.tags.set('T2', 90);
	alarms.evaluate(['T1', 'T2']);
	alarms.ack();

	var list = alarms.list();
	assert.strictEqual(list.length, 2);
	assert.ok(list.every(function(a) { return a.state === 'active-ack'; }));
});

test('fires rt.fire("alarm", ...) only on change', function()
{
	var rt = makeRt();
	rt.tags.define([{ name: 'T1', type: 'number', initial: 0, alarms: { hi: 80 } }]);
	var alarms = new Hmi.Alarms(rt);
	alarms.configure([rt.tags.getDef('T1')]);

	rt.tags.set('T1', 90);
	alarms.evaluate(['T1']);
	assert.strictEqual(rt._events.length, 1);
	assert.strictEqual(rt._events[0][0], 'alarm');

	rt.tags.set('T1', 91); // still 'hi', no state change
	alarms.evaluate(['T1']);
	assert.strictEqual(rt._events.length, 1); // unchanged, no new fire
});

test('counts() and highestUnacked()', function()
{
	var rt = makeRt();
	rt.tags.define([
		{ name: 'T1', type: 'number', initial: 0, alarms: { hi: 80, severity: { hi: 2 } } },
		{ name: 'T2', type: 'number', initial: 0, alarms: { hihi: 95, severity: { hihi: 1 } } }
	]);
	var alarms = new Hmi.Alarms(rt);
	alarms.configure([rt.tags.getDef('T1'), rt.tags.getDef('T2')]);
	rt.tags.set('T1', 90);
	rt.tags.set('T2', 99);
	alarms.evaluate(['T1', 'T2']);

	var counts = alarms.counts();
	assert.strictEqual(counts.total, 2);
	assert.strictEqual(counts.bySeverity[1], 1);
	assert.strictEqual(counts.bySeverity[2], 1);

	assert.ok(alarms.highestUnacked('T1') != null);
	assert.strictEqual(alarms.highestUnacked('T3'), null);
});
