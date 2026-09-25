var test = require('node:test');
var assert = require('node:assert');
var load = require('./load.js');
var Hmi = load(['core/HmiExpr.js', 'core/HmiFormat.js']);

test('null/undefined -> --', function()
{
	assert.strictEqual(Hmi.Format.format(null), '--');
	assert.strictEqual(Hmi.Format.format(undefined), '--');
});

test('decimals via fmt.decimals', function()
{
	assert.strictEqual(Hmi.Format.format(3.14159, { decimals: 2 }), '3.14');
	assert.strictEqual(Hmi.Format.format(3, { decimals: 2 }), '3.00');
});

test('pattern like 0.00 / #,##0.0', function()
{
	assert.strictEqual(Hmi.Format.format(3.14159, '0.00'), '3.14');
	assert.strictEqual(Hmi.Format.format(1234.5, '#,##0.0'), '1,234.5');
	assert.strictEqual(Hmi.Format.format(1234567, '#,##0'), '1,234,567');
});

test('booleans', function()
{
	assert.strictEqual(Hmi.Format.format(true), 'true');
	assert.strictEqual(Hmi.Format.format(false), 'false');
});

test('unit suffix from tagDef unless fmt.unit === false', function()
{
	var def = { unit: 'C' };
	assert.strictEqual(Hmi.Format.format(20, { decimals: 1 }, def), '20.0 C');
	assert.strictEqual(Hmi.Format.format(20, { decimals: 1, unit: false }, def), '20.0');
});

test('tagDef.decimals used when fmt omits decimals', function()
{
	var def = { decimals: 3 };
	assert.strictEqual(Hmi.Format.format(1, null, def), '1.000');
});

test('coerce: number/integer/boolean/string/object', function()
{
	assert.deepStrictEqual(Hmi.Format.coerce('5', 'number'), { ok: true, value: 5 });
	assert.strictEqual(Hmi.Format.coerce('abc', 'number').ok, false);
	assert.deepStrictEqual(Hmi.Format.coerce('5.7', 'integer'), { ok: true, value: 6 });
	assert.deepStrictEqual(Hmi.Format.coerce('true', 'boolean'), { ok: true, value: true });
	assert.deepStrictEqual(Hmi.Format.coerce('false', 'boolean'), { ok: true, value: false });
	assert.strictEqual(Hmi.Format.coerce('maybe', 'boolean').ok, false);
	assert.deepStrictEqual(Hmi.Format.coerce(5, 'string'), { ok: true, value: '5' });
	assert.deepStrictEqual(Hmi.Format.coerce({ a: 1 }, 'object'), { ok: true, value: { a: 1 } });
});

test('formatSpec / parseSpec: Name|0.0', function()
{
	assert.deepStrictEqual(Hmi.Format.parseSpec('T1|0.0'), { name: 'T1', fmt: '0.0' });
	assert.deepStrictEqual(Hmi.Format.parseSpec('T1'), { name: 'T1', fmt: null });
	assert.strictEqual(Hmi.Format.formatSpec(3.14159, 'T1|0.0'), '3.1');
});
