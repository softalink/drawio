var test = require('node:test');
var assert = require('node:assert');
var load = require('./load.js');
var Hmi = load(['core/HmiExpr.js', 'core/HmiFormat.js', 'core/HmiTagStore.js']);

test('define + initial values', function()
{
	var store = new Hmi.TagStore();
	store.define([{ name: 'T1', type: 'number', initial: 5 }]);
	assert.strictEqual(store.getValue('T1'), 5);
	assert.deepStrictEqual(store.getDef('T1').type, 'number');
});

test('set coerces to declared type, bad coercion keeps last good value and sets quality bad', function()
{
	var store = new Hmi.TagStore();
	store.define([{ name: 'T1', type: 'number', initial: 1 }]);
	assert.strictEqual(store.set('T1', '2'), true);
	assert.strictEqual(store.getValue('T1'), 2);

	var changed = store.set('T1', 'not-a-number');
	assert.strictEqual(changed, true); // quality changed to bad
	assert.strictEqual(store.get('T1').quality, 'bad');
	assert.strictEqual(store.get('T1').value, 2); // kept last good value
});

test('set returns false when nothing changed', function()
{
	var store = new Hmi.TagStore();
	store.set('T1', 5, { quality: 'good' });
	assert.strictEqual(store.set('T1', 5, { quality: 'good' }), false);
});

test('setMany returns changed names only', function()
{
	var store = new Hmi.TagStore();
	store.set('T1', 1);
	var changed = store.setMany([{ tag: 'T1', value: 1 }, { tag: 'T2', value: 2 }]);
	assert.deepStrictEqual(changed, ['T2']);
});

test('get returns prev', function()
{
	var store = new Hmi.TagStore();
	store.set('T1', 1);
	store.set('T1', 2);
	var entry = store.get('T1');
	assert.strictEqual(entry.value, 2);
	assert.strictEqual(entry.prev, 1);
});

test('names(): declared union seen', function()
{
	var store = new Hmi.TagStore();
	store.define([{ name: 'T1', type: 'number' }]);
	store.set('T2', 5);
	assert.deepStrictEqual(store.names().sort(), ['T1', 'T2']);
});

test('takeDirty clears after reading', function()
{
	var store = new Hmi.TagStore();
	store.set('T1', 1);
	store.set('T2', 2);
	assert.deepStrictEqual(store.takeDirty().sort(), ['T1', 'T2']);
	assert.deepStrictEqual(store.takeDirty(), []);
});

test('onChange / offChange', function()
{
	var store = new Hmi.TagStore();
	var calls = [];
	var fn = function(name, entry) { calls.push([name, entry.value]); };
	store.onChange(fn);
	store.set('T1', 1);
	store.offChange(fn);
	store.set('T1', 2);
	assert.deepStrictEqual(calls, [['T1', 1]]);
});

test('checkStale marks stale after staleMs with no update', function()
{
	var store = new Hmi.TagStore();
	store.define([{ name: 'T1', type: 'number', staleMs: 100 }]);
	store.set('T1', 1, { ts: 0 });
	var stale = store.checkStale(50);
	assert.deepStrictEqual(stale, []);
	stale = store.checkStale(200);
	assert.deepStrictEqual(stale, ['T1']);
	assert.strictEqual(store.get('T1').quality, 'stale');
});

test('derived tags recompute when inputs change', function()
{
	var store = new Hmi.TagStore();
	store.define([
		{ name: 'A', type: 'number', initial: 1 },
		{ name: 'B', type: 'number', initial: 2 },
		{ name: 'C', type: 'number', expr: 'tag("A")+tag("B")' }
	]);
	assert.strictEqual(store.getValue('C'), 3);
	store.set('A', 10);
	assert.strictEqual(store.getValue('C'), 12);
});

test('derived tag cycle guard does not hang or throw', function()
{
	var store = new Hmi.TagStore();
	var warnings = [];
	store.log = function(level) { if (level === 'warn') warnings.push(1); };
	store.define([
		{ name: 'A', type: 'number', expr: 'tag("B")+1' },
		{ name: 'B', type: 'number', expr: 'tag("A")+1' }
	]);
	// Should complete without infinite recursion.
	store.set('A', 5);
	assert.ok(true);
});

test('clear resets everything', function()
{
	var store = new Hmi.TagStore();
	store.define([{ name: 'T1', type: 'number', initial: 1 }]);
	store.clear();
	assert.strictEqual(store.getValue('T1'), undefined);
	assert.deepStrictEqual(store.names(), []);
});
