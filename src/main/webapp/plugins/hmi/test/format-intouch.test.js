var test = require('node:test');
var assert = require('node:assert');
var load = require('./load.js');
var Hmi = load(['core/HmiExpr.js', 'core/HmiFormat.js']);
var F = Hmi.Format;

test('guide examples for 123.45', function()
{
	// NOTE: the guide prints 124 for '#'; round half away from zero of 123.45 is 123.
	var table = [
		['#', '123'], ['#.#', '123.5'], ['00000', '00123'], ['000.0', '123.5'],
		['00.00', '123.45'], ['0,000.#', '0,123.5']
	];

	for (var i = 0; i < table.length; i++)
	{
		assert.strictEqual(F.applyMask(table[i][0], 123.45), table[i][1], table[i][0]);
	}
});

test('applyMask: embedded masks, rounding, grouping, signs', function()
{
	assert.strictEqual(F.applyMask('Temp = #.# C', 123.45), 'Temp = 123.5 C');
	assert.strictEqual(F.applyMask('A ## B ##', 5), 'A 5 B ##', 'only the first run');
	assert.strictEqual(F.applyMask('x, y #', 7), 'x, y 7', 'a lone comma is not a mask');
	assert.strictEqual(F.applyMask('#.##', 2.5), '2.50');
	assert.strictEqual(F.applyMask('#', 0.5), '1');
	assert.strictEqual(F.applyMask('#', -0.5), '-1');
	assert.strictEqual(F.applyMask('#', -0.4), '0');
	assert.strictEqual(F.applyMask('#.##', -0.001), '0.00');
	assert.strictEqual(F.applyMask('#.##', 1.005), '1.01');
	assert.strictEqual(F.applyMask('#,###', 1234567), '1,234,567');
	assert.strictEqual(F.applyMask('0,000', 5), '0,005');
	assert.strictEqual(F.applyMask('00.0', -3.14), '-03.1');
	assert.strictEqual(F.applyMask('#.#', 1e-7), '0.0');
	assert.strictEqual(F.applyMask('#', 1e15), '1000000000000000');
	assert.strictEqual(F.applyMask('#.#', true), '1.0');
	assert.strictEqual(F.applyMask('#.#', '2.25'), '2.3');
	assert.strictEqual(F.applyMask('#.#', 'abc'), 'abc');
	assert.strictEqual(F.applyMask('x #.#', null), 'x ');
	assert.strictEqual(F.applyMask('#.#', Infinity), 'Infinity');
	assert.strictEqual(F.applyMask('no mask', 12.5), '12.5');
	assert.strictEqual(F.applyMask('no mask', null), '');
	assert.strictEqual(F.applyMask(null, 3), '3');
	assert.strictEqual(F.applyMask('.', 3), '3');
	assert.strictEqual(F.applyMask('#.#########', 1.5), '1.500000000');
});

test('advanced: text mode and default mode', function()
{
	assert.strictEqual(F.advanced(12.34, { mode: 'text' }, '##.#'), '12.3');
	assert.strictEqual(F.advanced(12.34, null, '##.#'), '12.3');
	assert.strictEqual(F.advanced(12.34, undefined, ''), '12.34');
	assert.strictEqual(F.advanced(12.34, { mode: 'text', fixedWidth: true }, '#'), '12', 'fixed width is not available for text');
});

test('advanced: real, integer, exponential', function()
{
	assert.strictEqual(F.advanced(12.5, { mode: 'real' }, ''), '12.5');
	assert.strictEqual(F.advanced(1 / 3, { mode: 'real' }, ''), '0.333333');
	assert.strictEqual(F.advanced(-1 / 3, { mode: 'real' }, ''), '-0.333333');
	assert.strictEqual(F.advanced(1 / 3, { mode: 'real' }, '', { globalPrecision: 2 }), '0.33');
	assert.strictEqual(F.advanced(7, { mode: 'real' }, ''), '7');
	assert.strictEqual(F.advanced(2.5, { mode: 'integer' }, ''), '3');
	assert.strictEqual(F.advanced(-2.5, { mode: 'integer' }, ''), '-3');
	assert.strictEqual(F.advanced(-0.2, { mode: 'integer' }, ''), '0');
	assert.strictEqual(F.advanced(12345.678, { mode: 'exponential', precision: 2 }, ''), '1.23E+4');
	assert.strictEqual(F.advanced(0.00012, { mode: 'exponential', precision: 1 }, ''), '1.2E-4');
	assert.strictEqual(F.advanced(5, { mode: 'exponential' }, ''), '5E+0');
	assert.strictEqual(F.advanced('abc', { mode: 'real' }, ''), '');
	assert.strictEqual(F.advanced(null, { mode: 'integer' }, ''), '');
	assert.strictEqual(F.advanced(NaN, { mode: 'integer' }, ''), '');
	assert.strictEqual(F.advanced(5, { mode: 'bogus' }, ''), '5');
});

test('advanced: fixed decimal point', function()
{
	assert.strictEqual(F.advanced(3.14159, { mode: 'fixed', precision: 2 }, ''), '3.14');
	assert.strictEqual(F.advanced(2.5, { mode: 'fixed', precision: 0 }, ''), '3');
	assert.strictEqual(F.advanced(-3.14159, { mode: 'fixed', precision: 2 }, ''), '-3.14');
	assert.strictEqual(F.advanced(-0.001, { mode: 'fixed', precision: 2 }, '', { type: 'real' }), '0.00');
	assert.strictEqual(F.advanced(1.5, { mode: 'fixed', precision: 9 }, ''), '1.50000000', 'precision is limited to 8');
	// integers and discretes: right padded with spaces where the decimals would be
	assert.strictEqual(F.advanced(42, { mode: 'fixed', precision: 2 }, ''), '42   ');
	assert.strictEqual(F.advanced(42, { mode: 'fixed', precision: 1 }, ''), '42  ');
	assert.strictEqual(F.advanced(-42, { mode: 'fixed', precision: 1 }, ''), '-42  ');
	assert.strictEqual(F.advanced(42, { mode: 'fixed', precision: 0 }, ''), '42');
	assert.strictEqual(F.advanced(true, { mode: 'fixed', precision: 2 }, ''), '1   ');
	assert.strictEqual(F.advanced(false, { mode: 'fixed', precision: 2 }, ''), '0   ');
	assert.strictEqual(F.advanced(1, { mode: 'fixed', precision: 2 }, '', { type: 'discrete' }), '1   ');
	// an explicit type overrides the inference from the value
	assert.strictEqual(F.advanced(5, { mode: 'fixed', precision: 2 }, '', { type: 'real' }), '5.00');
	assert.strictEqual(F.advanced(5.7, { mode: 'fixed', precision: 2 }, '', { type: 'integer' }), '6   ');
	assert.strictEqual(F.advanced(-0.2, { mode: 'fixed', precision: 1 }, '', { type: 'integer' }), '0  ');
});

test('advanced: hex and binary bit ranges', function()
{
	assert.strictEqual(F.advanced(255, { mode: 'hex', bitsFrom: 0, bitsTo: 31 }, ''), 'FF');
	assert.strictEqual(F.advanced(255, { mode: 'hex', bitsFrom: 0, bitsTo: 3 }, ''), 'F');
	assert.strictEqual(F.advanced(255, { mode: 'hex', bitsFrom: 4, bitsTo: 7 }, ''), 'F');
	assert.strictEqual(F.advanced(0xABCD, { mode: 'hex', bitsFrom: 4, bitsTo: 11 }, ''), 'BC');
	assert.strictEqual(F.advanced(0xABCD, { mode: 'hex', bitsFrom: 11, bitsTo: 4 }, ''), 'BC', 'reverse order');
	assert.strictEqual(F.advanced(5, { mode: 'binary', bitsFrom: 0, bitsTo: 31 }, ''), '101');
	assert.strictEqual(F.advanced(5, { mode: 'binary', bitsFrom: 0, bitsTo: 1 }, ''), '1');
	assert.strictEqual(F.advanced(5, { mode: 'binary', bitsFrom: 1, bitsTo: 0 }, ''), '1');
	assert.strictEqual(F.advanced(5, { mode: 'binary', bitsFrom: 2, bitsTo: 2 }, ''), '1', 'single bit');
	assert.strictEqual(F.advanced(5, { mode: 'binary', bitsFrom: 1, bitsTo: 1 }, ''), '0');
	assert.strictEqual(F.advanced(5, { mode: 'binary' }, ''), '101', 'default range 0..31');
	assert.strictEqual(F.advanced(-1, { mode: 'hex', bitsFrom: 0, bitsTo: 31 }, ''), 'FFFFFFFF');
	assert.strictEqual(F.advanced(-1, { mode: 'hex', bitsFrom: 0, bitsTo: 7 }, ''), 'FF');
	assert.strictEqual(F.advanced(0x80000000, { mode: 'hex', bitsFrom: 31, bitsTo: 31 }, ''), '1');
	assert.strictEqual(F.advanced(10.9, { mode: 'hex', bitsFrom: 0, bitsTo: 7 }, ''), 'A', 'truncates');
});

test('advanced: fixed width and the too-large character', function()
{
	var f = { mode: 'integer', fixedWidth: true };
	assert.strictEqual(F.advanced(123, f, '####'), '123');
	assert.strictEqual(F.advanced(12345, f, '####'), '****');
	assert.strictEqual(F.advanced(12345, f, '####', { tooLargeChar: '#' }), '####');
	assert.strictEqual(F.advanced(12345, f, '###', { tooLargeChar: '?' }), '???');
	assert.strictEqual(F.advanced(12345, f, '', {}), '', 'empty field text yields an empty string');
	assert.strictEqual(F.advanced(12345, f, null), '');
	assert.strictEqual(F.advanced(12345, { mode: 'integer' }, '##'), '12345', 'without fixedWidth the value grows');
	assert.strictEqual(F.advanced(5, { mode: 'hex', fixedWidth: true }, 'ab'), '5');
	assert.strictEqual(F.advanced(255, { mode: 'binary', fixedWidth: true, bitsFrom: 0, bitsTo: 7 }, 'xxxx'), '****');
});
