var test = require('node:test');
var assert = require('node:assert');
var load = require('./load.js');
var Hmi = load(['core/HmiExpr.js', 'core/HmiFormat.js', 'core/HmiTagStore.js', 'core/HmiSimulator.js']);

test('random within min/max, integer option', function()
{
	var store = new Hmi.TagStore();
	var sim = new Hmi.Simulator(store);
	sim.configure([{ name: 'T1', sim: { kind: 'random', min: 10, max: 20, integer: true, interval: 100 } }]);
	sim.step(0);
	var v = store.getValue('T1');
	assert.ok(v >= 10 && v <= 20);
	assert.strictEqual(v, Math.round(v));
});

test('sine oscillates between min and max over the period', function()
{
	var store = new Hmi.TagStore();
	var sim = new Hmi.Simulator(store);
	sim.configure([{ name: 'T1', sim: { kind: 'sine', min: 0, max: 10, period: 1000, interval: 10 } }]);
	sim.step(0);
	assert.ok(store.getValue('T1') >= 0 && store.getValue('T1') <= 10);
	sim.step(250); // quarter period -> near max
	assert.ok(store.getValue('T1') > 5);
});

test('ramp increments by step and wraps at max', function()
{
	var store = new Hmi.TagStore();
	var sim = new Hmi.Simulator(store);
	sim.configure([{ name: 'T1', sim: { kind: 'ramp', min: 0, max: 3, step: 1, interval: 10 } }]);
	sim.step(0);
	assert.strictEqual(store.getValue('T1'), 1);
	sim.step(10);
	assert.strictEqual(store.getValue('T1'), 2);
	sim.step(20);
	assert.strictEqual(store.getValue('T1'), 3);
	sim.step(30);
	assert.strictEqual(store.getValue('T1'), 0); // wraps
});

test('list cycles through values', function()
{
	var store = new Hmi.TagStore();
	var sim = new Hmi.Simulator(store);
	sim.configure([{ name: 'T1', sim: { kind: 'list', values: ['a', 'b', 'c'], interval: 10 } }]);
	sim.step(0);
	assert.strictEqual(store.getValue('T1'), 'a');
	sim.step(10);
	assert.strictEqual(store.getValue('T1'), 'b');
	sim.step(20);
	assert.strictEqual(store.getValue('T1'), 'c');
	sim.step(30);
	assert.strictEqual(store.getValue('T1'), 'a');
});

test('toggle flips each interval', function()
{
	var store = new Hmi.TagStore();
	var sim = new Hmi.Simulator(store);
	sim.configure([{ name: 'T1', sim: { kind: 'toggle', interval: 10 } }]);
	sim.step(0);
	var first = store.getValue('T1');
	sim.step(10);
	assert.strictEqual(store.getValue('T1'), !first);
});

test('constant holds the configured value', function()
{
	var store = new Hmi.TagStore();
	var sim = new Hmi.Simulator(store);
	sim.configure([{ name: 'T1', sim: { kind: 'constant', values: [42], interval: 10 } }]);
	sim.step(0);
	assert.strictEqual(store.getValue('T1'), 42);
});

test('per-tag interval respected: default 1000ms', function()
{
	var store = new Hmi.TagStore();
	var sim = new Hmi.Simulator(store);
	sim.configure([{ name: 'T1', sim: { kind: 'constant', values: [1] } }]);
	sim.step(0);
	assert.strictEqual(store.getValue('T1'), 1);
	store.set('T1', 99); // override to detect whether it re-fires too early
	sim.step(500);
	assert.strictEqual(store.getValue('T1'), 99); // not yet due
	sim.step(1000);
	assert.strictEqual(store.getValue('T1'), 1); // due now
});

test('script kind uses opts.runScript when provided', function(t, done)
{
	var store = new Hmi.TagStore();
	var sim = new Hmi.Simulator(store, {
		runScript: function(code, args) { return Promise.resolve(123); }
	});
	sim.configure([{ name: 'T1', sim: { kind: 'script', code: 'x', interval: 10 } }]);
	sim.step(0);
	setTimeout(function()
	{
		assert.strictEqual(store.getValue('T1'), 123);
		done();
	}, 10);
});

test('start(ms)/stop drive step() via setInterval', function(t, done)
{
	var store = new Hmi.TagStore();
	var sim = new Hmi.Simulator(store);
	sim.configure([{ name: 'T1', sim: { kind: 'constant', values: [7], interval: 10 } }]);
	sim.start(15);
	setTimeout(function()
	{
		sim.stop();
		assert.strictEqual(store.getValue('T1'), 7);
		done();
	}, 60);
});

test('write() manually overrides a simulated tag value', function()
{
	var store = new Hmi.TagStore();
	var sim = new Hmi.Simulator(store);
	sim.configure([{ name: 'T1', sim: { kind: 'ramp', min: 0, max: 10, step: 1, interval: 10 } }]);
	sim.write('T1', 5);
	assert.strictEqual(store.getValue('T1'), 5);
	sim.step(10);
	assert.strictEqual(store.getValue('T1'), 6); // ramps on from the override
});

test('mockValue: float range and list', function()
{
	var v = Hmi.Simulator.mockValue({ type: 'float', mock: '1-2' });
	assert.ok(v >= 1 && v <= 2);
	var list = Hmi.Simulator.mockValue({ type: 'float', mock: '1,2,3' });
	assert.ok([1, 2, 3].indexOf(list) >= 0);
});

test('mockValue: integer, bool, string forms', function()
{
	var i = Hmi.Simulator.mockValue({ type: 'integer', mock: '5-10' });
	assert.ok(i >= 5 && i <= 10 && i === Math.round(i));

	assert.strictEqual(Hmi.Simulator.mockValue({ type: 'bool', mock: 'true' }), true);
	assert.strictEqual(Hmi.Simulator.mockValue({ type: 'bool', mock: 'false' }), false);

	var s = Hmi.Simulator.mockValue({ mock: '[8]' });
	assert.strictEqual(typeof s, 'string');
	assert.strictEqual(s.length, 8);

	var pick = Hmi.Simulator.mockValue({ mock: 'a,b,c' });
	assert.ok(['a', 'b', 'c'].indexOf(pick) >= 0);
});
