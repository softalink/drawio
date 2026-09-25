var test = require('node:test');
var assert = require('node:assert');
var load = require('./load.js');
var Hmi = load(['core/HmiExpr.js', 'core/HmiCondition.js', 'core/HmiTransform.js']);

test('scale', function()
{
	var t = { kind: 'scale', inMin: 0, inMax: 100, outMin: 0, outMax: 1 };
	assert.strictEqual(Hmi.Transform.apply(t, 50), 0.5);
	assert.strictEqual(Hmi.Transform.apply(t, 0), 0);
	assert.strictEqual(Hmi.Transform.apply(t, 100), 1);
});

test('scale with clamp', function()
{
	var t = { kind: 'scale', inMin: 0, inMax: 100, outMin: 0, outMax: 10, clamp: true };
	assert.strictEqual(Hmi.Transform.apply(t, 150), 10);
	assert.strictEqual(Hmi.Transform.apply(t, -50), 0);
});

test('map: discrete and range entries, first match wins', function()
{
	var t = {
		kind: 'map',
		entries: [
			{ operator: '==', value: 0, output: '#888' },
			{ operator: '==', value: 1, output: '#0a0' },
			{ operator: 'range', value: [80, 100], output: 'red' }
		],
		'default': 'gray'
	};
	assert.strictEqual(Hmi.Transform.apply(t, 0), '#888');
	assert.strictEqual(Hmi.Transform.apply(t, 1), '#0a0');
	assert.strictEqual(Hmi.Transform.apply(t, 85), 'red');
	assert.strictEqual(Hmi.Transform.apply(t, 50), 'gray');
});

test('invert', function()
{
	var t = { kind: 'invert' };
	assert.strictEqual(Hmi.Transform.apply(t, true), false);
	assert.strictEqual(Hmi.Transform.apply(t, false), true);
});

test('expr', function()
{
	var t = { kind: 'expr', expr: 'value*1.8+32' };
	assert.strictEqual(Hmi.Transform.apply(t, 0), 32);
	assert.strictEqual(Hmi.Transform.apply(t, 100), 212);
});

test('script: returns env.runScript promise when present, else value unchanged', function()
{
	var t = { kind: 'script', code: 'return value*2;' };

	return Hmi.Transform.apply(t, 5, {
		runScript: function(code, args) { return Promise.resolve(args.value * 2); }
	}).then(function(result)
	{
		assert.strictEqual(result, 10);
	});
});

test('script: falls back to value when no runScript', function()
{
	var t = { kind: 'script', code: 'return value*2;' };
	assert.strictEqual(Hmi.Transform.apply(t, 5, {}), 5);
});

test('unknown/missing kind returns value unchanged', function()
{
	assert.strictEqual(Hmi.Transform.apply(null, 7), 7);
	assert.strictEqual(Hmi.Transform.apply({ kind: 'bogus' }, 7), 7);
});
