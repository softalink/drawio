var test = require('node:test');
var assert = require('node:assert');
var load = require('./load.js');
var Hmi = load(['core/HmiExpr.js', 'core/HmiFormat.js']);

var IT = { intouch: true };

function mkEnv(tags, extra)
{
	var env = {
		tag: function(n) { return Object.prototype.hasOwnProperty.call(tags, n) ? tags[n] : undefined; },
		vars: {}
	};

	for (var k in (extra || {}))
	{
		env[k] = extra[k];
	}

	return env;
}

function ev(src, tags, extra)
{
	return Hmi.Expr.evaluate(src, mkEnv(tags || {}, extra), IT);
}

test('bare identifiers read tags', function()
{
	assert.strictEqual(ev('TankLevel >= 75', { TankLevel: 80 }), true);
	assert.strictEqual(ev('Tank_CV*0.06', { Tank_CV: 100 }), 6);
	assert.strictEqual(ev('Missing', {}), undefined);
	assert.strictEqual(ev('$ObjHor + 1', { $ObjHor: 9 }), 10);
	assert.strictEqual(ev('Pump1/Run', { 'Pump1/Run': 1 }), 1);
	assert.strictEqual(ev('Plant\\Pump', { 'Plant\\Pump': 'x' }), 'x');
	assert.strictEqual(ev('a/2', { a: 10 }), 5);
	assert.strictEqual(ev('a % 3', { a: 10 }), 1);
	assert.strictEqual(ev('a != b', { a: 1, b: 2 }), true);
	assert.strictEqual(ev('@x + #y', { '@x': 1, '#y': 2 }), 3);
});

test('value and vars take precedence over tags', function()
{
	var env = mkEnv({ value: 99, x: 1 });
	env.value = 5;
	env.vars = { x: 7, Count: 2 };
	assert.strictEqual(Hmi.Expr.evaluate('value + x', env, IT), 12);
	assert.strictEqual(Hmi.Expr.evaluate('count', env, IT), 2, 'vars are case-insensitive');
	env.vars = { obj: { a: { b: 3 } } };
	assert.strictEqual(Hmi.Expr.evaluate('obj.a.b', env, IT), 3);
	env.value = { z: 4 };
	assert.strictEqual(Hmi.Expr.evaluate('value.z', env, IT), 4);
});

test('operators AND OR NOT MOD <> = and comments', function()
{
	assert.strictEqual(ev('1 AND 0'), false);
	assert.strictEqual(ev('1 and 2'), true);
	assert.strictEqual(ev('0 OR 3'), true);
	assert.strictEqual(ev('0 or 0'), false);
	assert.strictEqual(ev('NOT 0'), true);
	assert.strictEqual(ev('not "off"'), true);
	assert.strictEqual(ev('NOT A AND B', { A: 0, B: 1 }), true);
	assert.strictEqual(ev('7 MOD 3'), 1);
	assert.strictEqual(ev('7 mod 3'), 1);
	assert.strictEqual(ev('1 <> 2'), true);
	assert.strictEqual(ev('2 <> 2'), false);
	assert.strictEqual(ev('A = 5', { A: 5 }), true);
	assert.strictEqual(ev('A = 5 AND B <> 1', { A: 5, B: 2 }), true);
	assert.strictEqual(ev('2 ^ 3'), 8);
	assert.strictEqual(ev('1 {comment} + {another\nline} 2'), 3);
	assert.strictEqual(ev('1 ? 2 : 3'), 2);
	assert.strictEqual(ev('"off" ? 2 : 3'), 3);
	assert.strictEqual(ev('TRUE AND false'), false);
	assert.throws(function() { ev('1 + {open'); }, Hmi.Expr.Error);
});

test('string concatenation and literals', function()
{
	assert.strictEqual(ev('"Tank " + Name + ": " + 5', { Name: 'A' }), 'Tank A: 5');
	assert.strictEqual(ev('"a" + Missing'), 'a');
	assert.strictEqual(ev('"C:\\dir"'), 'C:\\dir');
	assert.strictEqual(ev('"say \\"hi\\""'), 'say "hi"');
	assert.strictEqual(ev('\'x\\ty\''), 'x\ty');
});

test('dotted tag names and dotfields', function()
{
	var entries = { T1: { value: 5, quality: 'good', ts: 1234 }, Bad: { value: 1, quality: 'bad', ts: 1 } };
	var defs = { T1: { min: 0, max: 200 } };
	var alarms = {
		A: { active: true, acked: false },
		B: { state: 'active-ack' },
		C: { state: 'active-unack' },
		D: { state: 'cleared-unack' },
		E: { active: false }
	};
	var extra = {
		tagEntry: function(n) { return entries[n] || null; },
		tagDef: function(n) { return defs[n] || null; },
		alarmOf: function(n) { return alarms[n] || null; }
	};
	var tags = { T1: 5, 'Motor1.Cmd': 'run', 'Motor1': 3, 'Odd.Value': 'tagwins', A: 1, B: 1, C: 1, D: 1, E: 1 };

	assert.strictEqual(ev('Motor1.Cmd', tags, extra), 'run', 'full dotted name tried first');
	assert.strictEqual(ev('Motor1.Value', tags, extra), 3);
	assert.strictEqual(ev('Odd.Value', tags, extra), 'tagwins', 'existing dotted tag wins over dotfield');
	assert.strictEqual(ev('T1.Value', tags, extra), 5);
	assert.strictEqual(ev('t1.value', { T1: 5 }, extra), undefined, 'tag names are case sensitive, dotfield names are not');
	assert.strictEqual(ev('T1.VALUE', tags, extra), 5);
	assert.strictEqual(ev('T1.Name', tags, extra), 'T1');
	assert.strictEqual(ev('T1.Quality', tags, extra), 192);
	assert.strictEqual(ev('Bad.Quality', tags, extra), 0);
	assert.strictEqual(ev('Nope.Quality', tags, extra), 0);
	assert.strictEqual(ev('T1.MinEU', tags, extra), 0);
	assert.strictEqual(ev('T1.MaxEU', tags, extra), 200);
	assert.strictEqual(ev('T1.MinRaw', tags, extra), 0);
	assert.strictEqual(ev('T1.MaxRaw', tags, extra), 200);
	assert.strictEqual(ev('Nope.MaxEU', tags, extra), undefined);
	assert.strictEqual(ev('T1.TimeLastModified', tags, extra), 1234);
	assert.strictEqual(ev('Nope.TimeLastModified', tags, extra), undefined);
	assert.strictEqual(ev('A.Alarm', tags, extra), 1);
	assert.strictEqual(ev('E.Alarm', tags, extra), 0);
	assert.strictEqual(ev('D.Alarm', tags, extra), 0);
	assert.strictEqual(ev('C.Alarm', tags, extra), 1);
	assert.strictEqual(ev('Zed.Alarm', tags, extra), 0);
	assert.strictEqual(ev('A.Ack', tags, extra), 0);
	assert.strictEqual(ev('B.Ack', tags, extra), 1);
	assert.strictEqual(ev('C.Ack', tags, extra), 0);
	assert.strictEqual(ev('D.Ack', tags, extra), 0);
	assert.strictEqual(ev('E.Ack', tags, extra), 1);
	assert.strictEqual(ev('Zed.Ack', tags, extra), 1);
	assert.strictEqual(ev('Foo.Bar', tags, extra), undefined, 'unknown suffix is not a dotfield');
	// without env helpers
	assert.strictEqual(ev('T1.Quality', tags), 0);
	assert.strictEqual(ev('T1.MinEU', tags), undefined);
	assert.strictEqual(ev('T1.Alarm', tags), 0);
	assert.strictEqual(ev('T1.Ack', tags), 1);
	assert.strictEqual(ev('T1.TimeLastModified', tags), undefined);
});

test('refs include bare identifiers and dotfield prefixes', function()
{
	var c = Hmi.Expr.compile('TankLevel > 5 AND Pump.Run OR Motor1.Cmd + T2.Quality + value + value.x + tag("q")', IT);
	assert.deepStrictEqual(c.refs.slice().sort(), ['Motor1.Cmd', 'Pump.Run', 'T2', 'T2.Quality', 'TankLevel', 'q'].sort());
	assert.deepStrictEqual(Hmi.Expr.compile('A.Value', IT).refs, ['A.Value', 'A']);
	assert.deepStrictEqual(Hmi.Expr.compile('Pump1/Run + A', IT).refs, ['Pump1/Run', 'A']);
	assert.deepStrictEqual(Hmi.Expr.compile('A + A', IT).refs, ['A']);
	assert.deepStrictEqual(Hmi.Expr.compile('IF(A, 1, 2) + (B ? 1 : -C) + NOT D', IT).refs.sort(), ['A', 'B', 'C', 'D']);
	// default mode unchanged
	assert.deepStrictEqual(Hmi.Expr.compile('A + tag("b")').refs, ['b']);
});

test('mode is part of the cache key', function()
{
	var d = Hmi.Expr.compile('A');
	var i = Hmi.Expr.compile('A', IT);
	assert.notStrictEqual(d, i);
	assert.strictEqual(Hmi.Expr.compile('A', IT), i);
	assert.strictEqual(Hmi.Expr.compile('A'), d);
	assert.strictEqual(Hmi.Expr.evaluate('A', { tag: function() { return 4; } }), undefined);
	assert.strictEqual(Hmi.Expr.evaluate('A', { tag: function() { return 4; } }, IT), 4);
	// operators are not available in default mode
	assert.throws(function() { Hmi.Expr.compile('1 AND 2'); }, Hmi.Expr.Error);
	assert.throws(function() { Hmi.Expr.compile('a = 1'); }, Hmi.Expr.Error);
	assert.throws(function() { Hmi.Expr.compile('a <> 1'); }, Hmi.Expr.Error);
	assert.throws(function() { Hmi.Expr.compile('Text(1,"#")'); }, Hmi.Expr.Error);
});

test('text conversion functions', function()
{
	assert.strictEqual(ev('Text(123.45, "#.#")'), '123.5');
	assert.strictEqual(ev('text(5, "000")'), '005');
	assert.strictEqual(ev('StrFromValue(1234.5, "0,000.0")'), '1,234.5');
	assert.strictEqual(ev('Text(X, "Temp = #.# C")', { X: 21.25 }), 'Temp = 21.3 C');
	assert.strictEqual(ev('Text(7)'), '7');
	assert.strictEqual(ev('StringFromIntg(255, 16)'), 'FF');
	assert.strictEqual(ev('StringFromIntg(5, 2)'), '101');
	assert.strictEqual(ev('StringFromIntg(-7.9)'), '-7');
	assert.strictEqual(ev('StringFromIntg(5, 1)'), '');
	assert.strictEqual(ev('StringFromIntg("x")'), '');
	assert.strictEqual(ev('StringFromReal(3.14159, 2, "f")'), '3.14');
	assert.strictEqual(ev('StringFromReal(3.14159, 2)'), '3.14');
	assert.strictEqual(ev('StringFromReal(1234.5, 2, "e")'), '1.23e+3');
	assert.strictEqual(ev('StringFromReal(1234.5, 2, "E")'), '1.23E+3');
	assert.strictEqual(ev('StringFromReal(1234.5, 3, "g")'), '1230');
	assert.strictEqual(ev('StringFromReal(0.5, 0, "g")'), '0.5');
	assert.strictEqual(ev('StringFromReal(1234.5, 3, "G")'), '1230');
	assert.strictEqual(ev('StringFromReal("x", 2)'), '');
	assert.strictEqual(ev('StringFromReal(2, -1)'), '2');
});

test('string functions', function()
{
	assert.strictEqual(ev('StrLen("hello")'), 5);
	assert.strictEqual(ev('StrLen(Missing)'), 0);
	assert.strictEqual(ev('StrUpper("aB")'), 'AB');
	assert.strictEqual(ev('StrLower("aB")'), 'ab');
	assert.strictEqual(ev('StrLeft("hello", 2)'), 'he');
	assert.strictEqual(ev('StrLeft("hello", -2)'), '');
	assert.strictEqual(ev('StrRight("hello", 3)'), 'llo');
	assert.strictEqual(ev('StrRight("hello", 0)'), '');
	assert.strictEqual(ev('StrRight("hi", 9)'), 'hi');
	assert.strictEqual(ev('StrMid("hello", 2, 3)'), 'ell');
	assert.strictEqual(ev('StrMid("hello", 4)'), 'lo');
	assert.strictEqual(ev('StrMid("hello", 0, 2)'), 'he');
	assert.strictEqual(ev('StrTrim("  a b  ")'), 'a b');
	assert.strictEqual(ev('StringToIntg("42.9abc")'), 42);
	assert.strictEqual(ev('StringToIntg("-42.9")'), -42);
	assert.strictEqual(ev('StringToIntg("x")'), 0);
	assert.strictEqual(ev('StringToReal("2.5")'), 2.5);
	assert.strictEqual(ev('StringToReal("x")'), 0);
});

test('numeric and trigonometric functions', function()
{
	assert.strictEqual(ev('Int(3.9)'), 3);
	assert.strictEqual(ev('Int(-3.9)'), -3);
	assert.strictEqual(ev('Trunc(-3.9)'), -3);
	assert.strictEqual(ev('Round(2.5)'), 3);
	assert.strictEqual(ev('Round(-2.5)'), -3);
	assert.strictEqual(ev('Round(1.005, 2)'), 1.01);
	assert.strictEqual(ev('Abs(-4)'), 4);
	assert.strictEqual(ev('Sqrt(16)'), 4);
	assert.strictEqual(ev('Exp(0)'), 1);
	assert.strictEqual(ev('Log(1)'), 0);
	assert.ok(Math.abs(ev('Log10(1000)') - 3) < 1e-12);
	assert.strictEqual(ev('Sgn(-5)'), -1);
	assert.strictEqual(ev('Sgn(5)'), 1);
	assert.strictEqual(ev('Sgn(0)'), 0);
	assert.ok(isNaN(ev('Sgn("x")')));
	assert.strictEqual(ev('Sin(90)'), 1);
	assert.strictEqual(ev('Sin(180)'), 0);
	assert.strictEqual(ev('Cos(0)'), 1);
	assert.strictEqual(ev('Cos(90)'), 0);
	assert.ok(Math.abs(ev('Tan(45)') - 1) < 1e-9);
	assert.ok(Math.abs(ev('ArcSin(1)') - 90) < 1e-9);
	assert.ok(Math.abs(ev('ArcCos(0)') - 90) < 1e-9);
	assert.ok(Math.abs(ev('ArcTan(1)') - 45) < 1e-9);
	assert.strictEqual(ev('PI()'), Math.PI);
	assert.strictEqual(ev('Min(3, 1, 2)'), 1);
	assert.strictEqual(ev('MAX(3, 1, 2)'), 3);
	assert.strictEqual(ev('IF(A, "yes", "no")', { A: 'off' }), 'no');
	assert.strictEqual(ev('IF(A, "yes", "no")', { A: 1 }), 'yes');
	assert.strictEqual(ev('Bool("off")'), false);
	assert.ok(Math.abs(ev('Now()') - Date.now()) < 1000);
	assert.strictEqual(ev('Abs(X)', { X: -2 }), 2);
	assert.throws(function() { ev('Frobnicate(1)'); }, Hmi.Expr.Error);
});

test('isTrue semantics', function()
{
	var f = [0, false, '', 'false', 'FALSE', 'off', 'Off', 'no', '0', null, undefined, NaN];
	var t = [1, -1, true, 'true', 'on', 'yes', 'abc', '1', 0.1, {}];

	for (var i = 0; i < f.length; i++)
	{
		assert.strictEqual(Hmi.Expr.isTrue(f[i]), false, String(f[i]));
	}

	for (i = 0; i < t.length; i++)
	{
		assert.strictEqual(Hmi.Expr.isTrue(t[i]), true, String(t[i]));
	}
});

test('security: no prototype access, no eval, bounded', function()
{
	assert.strictEqual(ev('constructor', {}), undefined);
	assert.strictEqual(ev('__proto__', {}), undefined);
	assert.strictEqual(ev('prototype', {}), undefined);
	assert.strictEqual(ev('toString', {}), undefined);
	var env = mkEnv({});
	env.value = { a: 1 };
	assert.strictEqual(Hmi.Expr.evaluate('value.constructor', env, IT), undefined);
	assert.strictEqual(Hmi.Expr.evaluate('value.__proto__', env, IT), undefined);
	assert.strictEqual(Hmi.Expr.evaluate('value.hasOwnProperty', env, IT), undefined);
	env.vars = { v: {} };
	assert.strictEqual(Hmi.Expr.evaluate('v.constructor', env, IT), undefined);
	assert.strictEqual(Hmi.Expr.evaluate('constructor.name', env, IT), undefined);
	assert.strictEqual(ev('constructor.Value', {}), undefined);
	assert.throws(function() { ev('eval("1")'); }, Hmi.Expr.Error);
	assert.throws(function() { ev('new Function("return 1")'); }, Hmi.Expr.Error);
	assert.throws(function() { ev('1 +'); }, Hmi.Expr.Error);
	assert.throws(function() { ev('"unterminated'); }, Hmi.Expr.Error);
	assert.throws(function() { ev('1 ~ 2'); }, Hmi.Expr.Error);
	var long = '';
	for (var i = 0; i < 100; i++) { long += '('; }
	assert.throws(function() { ev(long + '1' + ')'.repeat(100)); }, Hmi.Expr.Error);
	assert.throws(function() { ev(new Array(5000).join('1+') + '1'); }, Hmi.Expr.Error);
	// no tag function: undefined
	assert.strictEqual(Hmi.Expr.evaluate('A', {}, IT), undefined);
	// a tag lookup that throws is not swallowed silently by the engine, but cannot reach globals
	assert.strictEqual(ev('globalThis', {}), undefined);
	assert.strictEqual(ev('process', {}), undefined);
});

test('evaluation step limit holds in InTouch mode', function()
{
	var src = 'Abs(1)';

	for (var i = 0; i < 60; i++)
	{
		src = 'Abs(' + src + ' + ' + src.substring(0, 20) + ')';
		if (src.length > 3500) { break; }
	}

	// many nested calls stay bounded either by depth, length or steps
	try
	{
		ev(src);
	}
	catch (e)
	{
		assert.ok(e instanceof Hmi.Expr.Error);
	}
});
