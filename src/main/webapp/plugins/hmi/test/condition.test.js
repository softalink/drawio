var test = require('node:test');
var assert = require('node:assert');
var load = require('./load.js');
var Hmi = load(['core/HmiExpr.js', 'core/HmiCondition.js']);

function ctxFor(values, quality, changedTags)
{
	quality = quality || {};
	changedTags = changedTags || {};

	return {
		value: function(tag) { return values[tag]; },
		quality: function(tag) { return quality[tag] || 'good'; },
		changed: function(tag) { return !!changedTags[tag]; },
		env: { tag: function(tag) { return values[tag]; }, vars: {} }
	};
};

test('operator matrix: == != > < >= <=', function()
{
	var ctx = ctxFor({ T1: 5 });
	assert.strictEqual(Hmi.Condition.test({ tag: 'T1', operator: '==', value: 5 }, ctx), true);
	assert.strictEqual(Hmi.Condition.test({ tag: 'T1', operator: '!=', value: 5 }, ctx), false);
	assert.strictEqual(Hmi.Condition.test({ tag: 'T1', operator: '>', value: 3 }, ctx), true);
	assert.strictEqual(Hmi.Condition.test({ tag: 'T1', operator: '<', value: 3 }, ctx), false);
	assert.strictEqual(Hmi.Condition.test({ tag: 'T1', operator: '>=', value: 5 }, ctx), true);
	assert.strictEqual(Hmi.Condition.test({ tag: 'T1', operator: '<=', value: 4 }, ctx), false);
});

test('range: half-open [a,b)', function()
{
	var ctx = ctxFor({ T1: 10 });
	assert.strictEqual(Hmi.Condition.test({ tag: 'T1', operator: 'range', value: [0, 10] }, ctx), false);
	assert.strictEqual(Hmi.Condition.test({ tag: 'T1', operator: 'range', value: [0, 11] }, ctx), true);
	assert.strictEqual(Hmi.Condition.test({ tag: 'T1', operator: 'range', value: '5,15' }, ctx), true);
	assert.strictEqual(Hmi.Condition.test({ tag: 'T1', operator: '!range', value: [0, 10] }, ctx), true);
});

test('in / !in with ranges and lists', function()
{
	var ctx = ctxFor({ T1: 25 });
	assert.strictEqual(Hmi.Condition.test({ tag: 'T1', operator: 'in', value: '1,20..30,65' }, ctx), true);
	assert.strictEqual(Hmi.Condition.test({ tag: 'T1', operator: 'in', value: [1, 20, 65] }, ctx), false);
	assert.strictEqual(Hmi.Condition.test({ tag: 'T1', operator: '!in', value: '1,20..30,65' }, ctx), false);

	var ctx2 = ctxFor({ T1: 'red' });
	assert.strictEqual(Hmi.Condition.test({ tag: 'T1', operator: 'in', value: 'red,green,blue' }, ctx2), true);
});

test('changed', function()
{
	var ctx = ctxFor({ T1: 5 }, {}, { T1: true });
	assert.strictEqual(Hmi.Condition.test({ tag: 'T1', operator: 'changed' }, ctx), true);
	assert.strictEqual(Hmi.Condition.test({ tag: 'T2', operator: 'changed' }, ctx), false);
});

test('isBad', function()
{
	var ctx = ctxFor({ T1: 5 }, { T1: 'bad' });
	assert.strictEqual(Hmi.Condition.test({ tag: 'T1', operator: 'isBad' }, ctx), true);
	assert.strictEqual(Hmi.Condition.test({ tag: 'T2', operator: 'isBad' }, ctx), false); // unknown quality
});

test('true operator / empty conditions always true', function()
{
	var ctx = ctxFor({});
	assert.strictEqual(Hmi.Condition.test({ operator: 'true' }, ctx), true);
	assert.strictEqual(Hmi.Condition.test(null, ctx), true);
	assert.strictEqual(Hmi.Condition.testAll([], 'and', ctx), true);
});

test('valueTag operand', function()
{
	var ctx = ctxFor({ T1: 10, T2: 5 });
	assert.strictEqual(Hmi.Condition.test({ tag: 'T1', operator: '>', valueTag: 'T2' }, ctx), true);
});

test('expr operand', function()
{
	var ctx = ctxFor({ A: 2, B: 3 });
	assert.strictEqual(Hmi.Condition.test({ expr: 'tag("A")+tag("B")', operator: '==', value: 5 }, ctx), true);
});

test('testAll: and/or', function()
{
	var ctx = ctxFor({ T1: 5, T2: 10 });
	var conds = [{ tag: 'T1', operator: '==', value: 5 }, { tag: 'T2', operator: '==', value: 99 }];
	assert.strictEqual(Hmi.Condition.testAll(conds, 'and', ctx), false);
	assert.strictEqual(Hmi.Condition.testAll(conds, 'or', ctx), true);
});

test('refs: tag, valueTag, expr-embedded', function()
{
	var conds = [
		{ tag: 'A', operator: '>', value: 1 },
		{ tag: 'B', operator: '>', valueTag: 'C' },
		{ expr: 'tag("D")+tag("E")', operator: '==', value: 2 }
	];
	var refs = Hmi.Condition.refs(conds).sort();
	assert.deepStrictEqual(refs, ['A', 'B', 'C', 'D', 'E']);
});

test('valueInRange / valueInArray directly', function()
{
	assert.strictEqual(Hmi.Condition.valueInRange(5, [0, 10]), true);
	assert.strictEqual(Hmi.Condition.valueInRange(10, [0, 10]), false);
	assert.strictEqual(Hmi.Condition.valueInArray(5, '1,2..8,10'), true);
	assert.strictEqual(Hmi.Condition.valueInArray(9, '1,2..8,10'), false);
});
