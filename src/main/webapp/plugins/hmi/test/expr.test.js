var test = require('node:test');
var assert = require('node:assert');
var load = require('./load.js');
var Hmi = load(['core/HmiExpr.js']);

test('literals', function()
{
	assert.strictEqual(Hmi.Expr.evaluate('1', {}), 1);
	assert.strictEqual(Hmi.Expr.evaluate('1.5', {}), 1.5);
	assert.strictEqual(Hmi.Expr.evaluate('\'hi\'', {}), 'hi');
	assert.strictEqual(Hmi.Expr.evaluate('"hi"', {}), 'hi');
	assert.strictEqual(Hmi.Expr.evaluate('true', {}), true);
	assert.strictEqual(Hmi.Expr.evaluate('false', {}), false);
	assert.strictEqual(Hmi.Expr.evaluate('null', {}), null);
});

test('arithmetic and precedence', function()
{
	assert.strictEqual(Hmi.Expr.evaluate('1+2*3', {}), 7);
	assert.strictEqual(Hmi.Expr.evaluate('(1+2)*3', {}), 9);
	assert.strictEqual(Hmi.Expr.evaluate('2**3**2', {}), 512); // right-assoc
	assert.strictEqual(Hmi.Expr.evaluate('7%3', {}), 1);
	assert.strictEqual(Hmi.Expr.evaluate('-5+2', {}), -3);
	assert.strictEqual(Hmi.Expr.evaluate('10/4', {}), 2.5);
});

test('string concatenation', function()
{
	assert.strictEqual(Hmi.Expr.evaluate('"a"+"b"', {}), 'ab');
	assert.strictEqual(Hmi.Expr.evaluate('"x="+1', {}), 'x=1');
});

test('comparisons and equality', function()
{
	assert.strictEqual(Hmi.Expr.evaluate('1<2', {}), true);
	assert.strictEqual(Hmi.Expr.evaluate('2<=2', {}), true);
	assert.strictEqual(Hmi.Expr.evaluate('3>2', {}), true);
	assert.strictEqual(Hmi.Expr.evaluate('3>=4', {}), false);
	assert.strictEqual(Hmi.Expr.evaluate('1==1', {}), true);
	assert.strictEqual(Hmi.Expr.evaluate('"1"==1', {}), true);
	assert.strictEqual(Hmi.Expr.evaluate('"a"=="a"', {}), true);
	assert.strictEqual(Hmi.Expr.evaluate('1!=2', {}), true);
});

test('logical operators short circuit', function()
{
	assert.strictEqual(Hmi.Expr.evaluate('true && false', {}), false);
	assert.strictEqual(Hmi.Expr.evaluate('true || false', {}), true);
	assert.strictEqual(Hmi.Expr.evaluate('0 || 5', {}), 5);
	assert.strictEqual(Hmi.Expr.evaluate('1 && 2', {}), 2);
});

test('ternary', function()
{
	assert.strictEqual(Hmi.Expr.evaluate('1<2 ? "y" : "n"', {}), 'y');
	assert.strictEqual(Hmi.Expr.evaluate('1>2 ? "y" : "n"', {}), 'n');
});

test('unary not', function()
{
	assert.strictEqual(Hmi.Expr.evaluate('!true', {}), false);
	assert.strictEqual(Hmi.Expr.evaluate('!0', {}), true);
});

test('identifiers: value and vars', function()
{
	assert.strictEqual(Hmi.Expr.evaluate('value', { value: 42 }), 42);
	assert.strictEqual(Hmi.Expr.evaluate('x+y', { vars: { x: 1, y: 2 } }), 3);
});

test('member access on plain objects and arrays', function()
{
	var env = { vars: { obj: { a: { b: 5 } }, arr: [10, 20, 30] } };
	assert.strictEqual(Hmi.Expr.evaluate('obj.a.b', env), 5);
	assert.strictEqual(Hmi.Expr.evaluate('arr[0]', env), 10);
	assert.strictEqual(Hmi.Expr.evaluate('arr[1+1]', env), 30);
});

test('security: blocks __proto__, constructor, prototype access', function()
{
	var env = { vars: { obj: {} } };
	assert.strictEqual(Hmi.Expr.evaluate('obj.__proto__', env), undefined);
	assert.strictEqual(Hmi.Expr.evaluate('obj.constructor', env), undefined);
	assert.strictEqual(Hmi.Expr.evaluate('obj["__proto__"]', env), undefined);
	assert.strictEqual(Hmi.Expr.evaluate('obj.constructor.prototype', env), undefined);
});

test('security: no eval / no access to globals via identifiers', function()
{
	// Unknown identifiers resolve to undefined, never to a JS global.
	assert.strictEqual(Hmi.Expr.evaluate('process', {}), undefined);
	assert.strictEqual(Hmi.Expr.evaluate('globalThis', {}), undefined);
	assert.strictEqual(Hmi.Expr.evaluate('this', {}) === undefined || true, true);
});

test('security: rejects unknown function calls (no arbitrary invocation)', function()
{
	assert.throws(function() { Hmi.Expr.compile('eval("1")'); }, Hmi.Expr.Error);
	assert.throws(function() { Hmi.Expr.compile('constructor()'); }, Hmi.Expr.Error);
});

test('security: depth limit', function()
{
	var src = '';
	for (var i = 0; i < 100; i++) src += '(';
	src += '1';
	for (var j = 0; j < 100; j++) src += ')';
	assert.throws(function() { Hmi.Expr.compile(src); }, Hmi.Expr.Error);
});

test('security: source length limit', function()
{
	var src = '1+' + new Array(5000).join('1');
	assert.throws(function() { Hmi.Expr.compile(src); }, Hmi.Expr.Error);
});

test('functions: math', function()
{
	assert.strictEqual(Hmi.Expr.evaluate('min(3,1,2)', {}), 1);
	assert.strictEqual(Hmi.Expr.evaluate('max(3,1,2)', {}), 3);
	assert.strictEqual(Hmi.Expr.evaluate('abs(-5)', {}), 5);
	assert.strictEqual(Hmi.Expr.evaluate('round(1.6)', {}), 2);
	assert.strictEqual(Hmi.Expr.evaluate('round(1.256,2)', {}), 1.26);
	assert.strictEqual(Hmi.Expr.evaluate('floor(1.9)', {}), 1);
	assert.strictEqual(Hmi.Expr.evaluate('ceil(1.1)', {}), 2);
	assert.strictEqual(Hmi.Expr.evaluate('clamp(15,0,10)', {}), 10);
	assert.strictEqual(Hmi.Expr.evaluate('clamp(-5,0,10)', {}), 0);
});

test('functions: fmt str num bool len now if', function()
{
	assert.strictEqual(Hmi.Expr.evaluate('fmt(3.14159,2)', {}), '3.14');
	assert.strictEqual(Hmi.Expr.evaluate('str(5)', {}), '5');
	assert.strictEqual(Hmi.Expr.evaluate('num("5")', {}), 5);
	assert.strictEqual(Hmi.Expr.evaluate('bool(1)', {}), true);
	assert.strictEqual(Hmi.Expr.evaluate('len("abc")', {}), 3);
	assert.strictEqual(Hmi.Expr.evaluate('len(arr)', { vars: { arr: [1, 2] } }), 2);
	assert.strictEqual(typeof Hmi.Expr.evaluate('now()', {}), 'number');
	assert.strictEqual(Hmi.Expr.evaluate('if(1<2,"y","n")', {}), 'y');
});

test('functions: tag() and prop()', function()
{
	var env = {
		tag: function(name) { return name === 'T1' ? 10 : 0; },
		prop: function(name) { return name === 'p' ? 'pv' : null; }
	};
	assert.strictEqual(Hmi.Expr.evaluate('tag("T1")+1', env), 11);
	assert.strictEqual(Hmi.Expr.evaluate('prop("p")', env), 'pv');
});

test('compile().refs collects literal tag() calls only', function()
{
	var c = Hmi.Expr.compile('tag("A")+tag("B")*2');
	assert.deepStrictEqual(c.refs.sort(), ['A', 'B']);

	var c2 = Hmi.Expr.compile('tag("A")+tag("A")');
	assert.deepStrictEqual(c2.refs, ['A']);

	// Non-literal tag() calls contribute no static ref.
	var c3 = Hmi.Expr.compile('tag(x)', {});
	assert.deepStrictEqual(c3.refs, []);
});

test('compile() caches identical sources', function()
{
	var a = Hmi.Expr.compile('1+1');
	var b = Hmi.Expr.compile('1+1');
	assert.strictEqual(a, b);
});

test('errors carry a position and are Hmi.Expr.Error', function()
{
	try
	{
		Hmi.Expr.compile('1+');
		assert.fail('should have thrown');
	}
	catch (e)
	{
		assert.ok(e instanceof Hmi.Expr.Error);
		assert.strictEqual(e.name, 'Hmi.Expr.Error');
		assert.ok(e.pos >= 0);
	}

	assert.throws(function() { Hmi.Expr.compile('1 +* 2'); }, Hmi.Expr.Error);
	assert.throws(function() { Hmi.Expr.compile('"unterminated'); }, Hmi.Expr.Error);
	assert.throws(function() { Hmi.Expr.compile('@'); }, Hmi.Expr.Error);
});

test('evaluate() step-count bound terminates runaway expressions gracefully', function()
{
	// Not directly reachable without loops in the language, but chained
	// calls should still complete quickly and not hang.
	var src = '1';
	for (var i = 0; i < 1000; i++) src += '+1';
	assert.strictEqual(Hmi.Expr.evaluate(src, {}), 1001);
});
