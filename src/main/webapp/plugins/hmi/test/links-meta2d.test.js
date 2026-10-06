var test = require('node:test');
var assert = require('node:assert');
var load = require('./load.js');
var Hmi = load(['core/HmiExpr.js', 'core/HmiFormat.js', 'core/HmiQuickScript.js', 'core/HmiLinks.js']);
var L = Hmi.Links;

test('opacity maps and clamps', function()
{
	assert.strictEqual(L.opacity({ expr: 'A' }, 50), 50);
	assert.strictEqual(L.opacity({ expr: 'A' }, -10), 0);
	assert.strictEqual(L.opacity({ expr: 'A' }, 500), 100);
	assert.strictEqual(L.opacity({ valueAtMin: 0, valueAtMax: 10, minPercent: 20, maxPercent: 80 }, 5), 50);
	assert.strictEqual(L.opacity({ valueAtMin: 0, valueAtMax: 10, minPercent: 20, maxPercent: 80 }, 100), 80);
	assert.strictEqual(L.opacity({ valueAtMin: 0, valueAtMax: 10, minPercent: 100, maxPercent: 0 }, 2.5), 75);
	assert.strictEqual(L.opacity({ valueAtMin: 0, valueAtMax: 10, minPercent: 0, maxPercent: 300 }, 10), 100);
	assert.strictEqual(L.opacity({}, '40'), 40);
	assert.strictEqual(L.opacity({}, 'abc'), null);
	assert.strictEqual(L.opacity({}, null), null);
	assert.strictEqual(L.opacity({}, undefined), null);
	assert.strictEqual(L.opacity(null, 1), null);
});

test('matchState: numeric single values', function()
{
	assert.strictEqual(L.matchState('1', 1), true);
	assert.strictEqual(L.matchState('1', '1.0'), true);
	assert.strictEqual(L.matchState('1.0', 1), true);
	assert.strictEqual(L.matchState(' 2 ', 2), true);
	assert.strictEqual(L.matchState('2', 3), false);
	assert.strictEqual(L.matchState('-5', -5), true);
	assert.strictEqual(L.matchState('0', 0), true);
	assert.strictEqual(L.matchState('1e3', 1000), true);
	assert.strictEqual(L.matchState(1, 1), true);
});

test('matchState: string comparison is case-insensitive', function()
{
	assert.strictEqual(L.matchState('Run', 'run'), true);
	assert.strictEqual(L.matchState('run', 'RUN'), true);
	assert.strictEqual(L.matchState(' run ', ' Run '), true);
	assert.strictEqual(L.matchState('run', 'stop'), false);
	assert.strictEqual(L.matchState('3abc', 3), false);
	assert.strictEqual(L.matchState('abc', 3), false);
});

test('matchState: booleans', function()
{
	['1', 'true', 'on', 'TRUE', 'On'].forEach(function(m)
	{
		assert.strictEqual(L.matchState(m, true), true, m);
		assert.strictEqual(L.matchState(m, false), false, m);
	});

	['0', 'false', 'off', 'False', 'OFF'].forEach(function(m)
	{
		assert.strictEqual(L.matchState(m, false), true, m);
		assert.strictEqual(L.matchState(m, true), false, m);
	});

	assert.strictEqual(L.matchState('2', true), false);
	assert.strictEqual(L.matchState('on,off', false), true);
});

test('matchState: ranges are half open', function()
{
	assert.strictEqual(L.matchState('0..10', 0), true);
	assert.strictEqual(L.matchState('0..10', 9.99), true);
	assert.strictEqual(L.matchState('0..10', 10), false);
	assert.strictEqual(L.matchState('0..10', -0.1), false);
	assert.strictEqual(L.matchState('..10', -1000), true);
	assert.strictEqual(L.matchState('..10', 10), false);
	assert.strictEqual(L.matchState('5..', 5), true);
	assert.strictEqual(L.matchState('5..', 1e9), true);
	assert.strictEqual(L.matchState('5..', 4), false);
	assert.strictEqual(L.matchState('..', 7), true);
	assert.strictEqual(L.matchState('-5..-1', -5), true);
	assert.strictEqual(L.matchState('-5..-1', -1), false);
	assert.strictEqual(L.matchState('1.5..2.5', 2), true);
	assert.strictEqual(L.matchState(' 1 .. 3 ', '2'), true);
	assert.strictEqual(L.matchState('0..10', 'abc'), false);
	assert.strictEqual(L.matchState('0..10', true), false);
	assert.strictEqual(L.matchState('a..b', 5), false);
	assert.strictEqual(L.matchState('0..10', undefined), false);
});

test('matchState: comma lists', function()
{
	assert.strictEqual(L.matchState('1,3,5..8', 1), true);
	assert.strictEqual(L.matchState('1,3,5..8', 3), true);
	assert.strictEqual(L.matchState('1,3,5..8', 7), true);
	assert.strictEqual(L.matchState('1,3,5..8', 8), false);
	assert.strictEqual(L.matchState('1,3,5..8', 4), false);
	assert.strictEqual(L.matchState(' 1 , 3 ', 3), true);
	assert.strictEqual(L.matchState('run, idle', 'IDLE'), true);
	assert.strictEqual(L.matchState('1,,2', 2), true);
	assert.strictEqual(L.matchState('1,,2', ''), false);
});

test('matchState: default and edge cases', function()
{
	assert.strictEqual(L.matchState('*', 5), true);
	assert.strictEqual(L.matchState(' * ', 'x'), true);
	assert.strictEqual(L.matchState('*', undefined), true);
	assert.strictEqual(L.matchState('*', null), true);
	assert.strictEqual(L.matchState('1,*', 99), true);
	assert.strictEqual(L.matchState('1', undefined), false);
	assert.strictEqual(L.matchState('1', null), false);
	assert.strictEqual(L.matchState('', 1), false);
	assert.strictEqual(L.matchState('', ''), false);
	assert.strictEqual(L.matchState(null, 1), false);
	assert.strictEqual(L.matchState(undefined, 1), false);
	assert.strictEqual(L.matchState('1', NaN), false);
});

test('state: first match wins and order matters', function()
{
	var a = { match: '0', label: 'zero' };
	var b = { match: '1..5', label: 'low' };
	var c = { match: '*', label: 'other' };
	var d = { match: '3', label: 'three' };
	var link = { expr: 'A', states: [a, b, d, c] };

	assert.strictEqual(L.state(link, 0), a);
	assert.strictEqual(L.state(link, 3), b);
	assert.strictEqual(L.state(link, 9), c);
	assert.strictEqual(L.state({ states: [c, a] }, 0), c);
	assert.strictEqual(L.state({ states: [a, b] }, 9), null);
});

test('state: undefined value only matches *', function()
{
	var c = { match: '*' };

	assert.strictEqual(L.state({ states: [{ match: '0' }] }, undefined), null);
	assert.strictEqual(L.state({ states: [{ match: '0' }, c] }, undefined), c);
	assert.strictEqual(L.state({ states: [] }, 1), null);
	assert.strictEqual(L.state({}, 1), null);
	assert.strictEqual(L.state(null, 1), null);
	assert.strictEqual(L.state({ states: [null, c] }, 1), c);
});

test('animationDuration', function()
{
	assert.strictEqual(L.animationDuration('spin', undefined), undefined);
	assert.strictEqual(L.animationDuration('spin', null), undefined);
	assert.strictEqual(L.animationDuration('spin', ''), undefined);
	assert.strictEqual(L.animationDuration('spin', 'abc'), undefined);
	assert.strictEqual(L.animationDuration('spin', NaN), undefined);
	assert.strictEqual(L.animationDuration('spin', 0), null);
	assert.strictEqual(L.animationDuration('spin', -5), null);
	assert.strictEqual(L.animationDuration('pulse', '0'), null);
	assert.strictEqual(L.animationDuration('spin', 60), 1000);
	assert.strictEqual(L.animationDuration('pulse', 30), 2000);
	assert.strictEqual(L.animationDuration('pulse', '120'), 500);
	assert.strictEqual(L.animationDuration('spin', 0.5), 120000);
});

test('pushValue: set', function()
{
	assert.strictEqual(L.pushValue({ action: 'set', value: '42' }, 5), 42);
	assert.strictEqual(L.pushValue({ action: 'set', value: 7 }, 5), 7);
	assert.strictEqual(L.pushValue({ action: 'set', value: 'abc' }, 5), 'abc');
	assert.strictEqual(L.pushValue({ action: 'set', value: '' }, 5), '');
	assert.strictEqual(L.pushValue({ value: '3.5' }, 5), 3.5);
	assert.strictEqual(L.pushValue({ action: 'set' }, 5), undefined);
	assert.strictEqual(L.pushValue(null, 5), undefined);
});

test('pushValue: add and subtract with clamping', function()
{
	assert.strictEqual(L.pushValue({ action: 'add', value: 5 }, 10), 15);
	assert.strictEqual(L.pushValue({ action: 'add', value: '5' }, '10'), 15);
	assert.strictEqual(L.pushValue({ action: 'subtract', value: 5 }, 10), 5);
	assert.strictEqual(L.pushValue({ action: 'add', value: 5 }, undefined), 5);
	assert.strictEqual(L.pushValue({ action: 'add', value: 5 }, 'x'), 5);
	assert.strictEqual(L.pushValue({ action: 'add', value: 5 }, NaN), 5);
	assert.strictEqual(L.pushValue({ action: 'subtract', value: 5 }, null), -5);
	assert.strictEqual(L.pushValue({ action: 'add', value: 5, max: 12 }, 10), 12);
	assert.strictEqual(L.pushValue({ action: 'add', value: 5, max: 100 }, 10), 15);
	assert.strictEqual(L.pushValue({ action: 'subtract', value: 5, min: 0 }, 3), 0);
	assert.strictEqual(L.pushValue({ action: 'subtract', value: 5, min: 0, max: 10 }, 8), 3);
	assert.strictEqual(L.pushValue({ action: 'add', value: 5, min: 0, max: 10 }, 20), 10);
	assert.strictEqual(L.pushValue({ action: 'add', value: 0.1 }, 0.2) > 0.29, true);
	assert.strictEqual(L.pushValue({ action: 'add', value: 'abc' }, 1), undefined);
	assert.strictEqual(L.pushValue({ action: 'add' }, 1), undefined);
});

test('pushValue: expression and unknown', function()
{
	assert.strictEqual(L.pushValue({ action: 'expression', expr: 'A' }, 1, function() { return 99; }), 99);
	assert.strictEqual(L.pushValue({ action: 'expression', expr: 'A' }, 1, function() { return 'x'; }), 'x');
	assert.strictEqual(L.pushValue({ action: 'expression', expr: 'A' }, 1), undefined);
	assert.strictEqual(L.pushValue({ action: 'bogus', value: 1 }, 1), undefined);
});

test('changed: first evaluation', function()
{
	assert.strictEqual(L.changed(undefined, 1), true);
	assert.strictEqual(L.changed(undefined, 0), true);
	assert.strictEqual(L.changed(undefined, null), true);
	assert.strictEqual(L.changed(undefined, undefined), false);
});

test('changed: numbers and deadband', function()
{
	assert.strictEqual(L.changed(1, 1), false);
	assert.strictEqual(L.changed(1, 2), true);
	assert.strictEqual(L.changed(1, 1.0001), true);
	assert.strictEqual(L.changed(10, 10.4, 0.5), false);
	assert.strictEqual(L.changed(10, 10.5, 0.5), false);
	assert.strictEqual(L.changed(10, 10.6, 0.5), true);
	assert.strictEqual(L.changed(10, 9.4, 0.5), true);
	assert.strictEqual(L.changed(10, 10, 0), false);
	assert.strictEqual(L.changed(NaN, NaN), false);
	assert.strictEqual(L.changed(NaN, 1), true);
});

test('changed: strings, booleans, objects', function()
{
	assert.strictEqual(L.changed('a', 'a'), false);
	assert.strictEqual(L.changed('a', 'b'), true);
	assert.strictEqual(L.changed(true, false), true);
	assert.strictEqual(L.changed(true, true), false);
	assert.strictEqual(L.changed(1, '1'), true);
	assert.strictEqual(L.changed(null, null), false);
	assert.strictEqual(L.changed(null, 0), true);
	assert.strictEqual(L.changed(1, undefined), true);
	assert.strictEqual(L.changed([1, 2], [1, 2]), false);
	assert.strictEqual(L.changed([1, 2], [1, 3]), true);
	assert.strictEqual(L.changed({ a: 1 }, { a: 1 }), false);
	assert.strictEqual(L.changed({ a: 1 }, { a: 2 }), true);
	assert.strictEqual(L.changed({ a: 1 }, null), true);
	assert.strictEqual(L.changed('a', 'b', 100), true);
});

test('refs: expression fields of the new display links', function()
{
	var r = L.refs({
		opacity: { expr: 'Op' },
		states: { expr: 'St', states: [{ match: '*' }] },
		properties: { items: [{ target: 'label', expr: 'P1 + 1' }, { target: 'visible', expr: 'P2' }] },
		widgetData: { expr: 'W', series: [{ tag: 'S1' }, { tag: 'S2', name: 'x' }, {}] }
	});

	assert.deepStrictEqual(r.slice().sort(), ['Op', 'P1', 'P2', 'S1', 'S2', 'St', 'W']);
});

test('refs: animation, flow and media', function()
{
	var r = L.refs({
		animation: { expr: 'En', rateExpr: 'Rate * 2', reverseExpr: 'Rev' },
		flow: { expr: 'FEn', speedExpr: 'Spd', reverseExpr: 'FRev' },
		media: { expr: 'Play' }
	});

	assert.deepStrictEqual(r.slice().sort(), ['En', 'FEn', 'FRev', 'Play', 'Rate', 'Rev', 'Spd']);
});

test('refs: touch links', function()
{
	var r = L.refs({
		inputChoice: { tag: 'Ch', options: [{ label: 'a', value: 1 }] },
		pushValue: { tag: 'Pv', action: 'expression', expr: 'Src + 1' },
		sendMessage: { name: 'm', payloadExpr: 'Pl' },
		openUrl: { url: 'http://x/${a}' },
		control: { commands: [{ object: 'Me', command: 'startAnimation' }] },
		touchOptions: { confirm: 'sure?' }
	});

	assert.deepStrictEqual(r.slice().sort(), ['Ch', 'Pl', 'Pv', 'Src']);
});

test('refs: object scripts include read and written tags', function()
{
	var r = L.refs({
		dataChange: { expr: 'Dc', script: 'Out = In1 + 1;\nSetTagValue(Out2, 3)' },
		condition: {
			expr: 'Cond',
			onTrue: 'T1 = 1', onFalse: 'F1 = Q', whileTrue: 'W1 = 2', whileFalse: 'W2 = 3'
		}
	});

	['Dc', 'Out', 'In1', 'Out2', 'Cond', 'T1', 'F1', 'Q', 'W1', 'W2'].forEach(function(n)
	{
		assert.ok(r.indexOf(n) >= 0, n + ' in ' + r.join());
	});

	assert.strictEqual(r.length, 10);
});

test('refs: script locals are not tags, invalid scripts are ignored', function()
{
	var r = L.refs({
		dataChange: { expr: 'A', script: 'DIM x AS INTEGER; x = 5; T = x' },
		condition: { expr: 'B', onTrue: 'this is not (valid', onFalse: 'Z = 1' }
	});

	assert.deepStrictEqual(r.slice().sort(), ['A', 'B', 'T', 'Z']);
	assert.deepStrictEqual(L.refs({ dataChange: { expr: 'A', script: 'GetTagValue(Q)' } }).slice().sort(), ['A']);
});

test('refs: no duplicates; pushAction scripts are still ignored', function()
{
	var r = L.refs({
		fillColor: { kind: 'discrete', expr: 'A' },
		opacity: { expr: 'A' },
		pushAction: { scripts: [{ condition: 'onLeftDown', script: 'Hidden = 1' }] },
		condition: { expr: 'A', onTrue: 'A = 1' }
	});

	assert.deepStrictEqual(r, ['A']);
});

test('refs: tolerate missing and malformed fields', function()
{
	assert.deepStrictEqual(L.refs({ properties: {}, widgetData: { series: 'x' }, animation: {}, flow: null, dataChange: {}, condition: {} }), []);
	assert.deepStrictEqual(L.refs({ properties: { items: [null, 5, {}] } }), []);
});
