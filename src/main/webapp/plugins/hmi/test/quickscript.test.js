var test = require('node:test');
var assert = require('node:assert');
var load = require('./load.js');
var Hmi = load(['core/HmiExpr.js', 'core/HmiFormat.js', 'core/HmiQuickScript.js']);
var QS = Hmi.QuickScript;

function mkApi(tags, extra)
{
	var calls = [];
	var api = {
		calls: calls,
		tags: tags || {},
		read: function(n) { return api.tags[n]; },
		write: function(n, v)
		{
			calls.push(['write:start', n, v]);

			return new Promise(function(resolve)
			{
				setTimeout(function()
				{
					api.tags[n] = v;
					calls.push(['write:done', n, v]);
					resolve();
				}, 5);
			});
		},
		show: function(n) { calls.push(['show', n]); },
		hide: function(n) { calls.push(['hide', n]); },
		hideSelf: function() { calls.push(['hideSelf']); },
		showAt: function(n, x, y, mode) { calls.push(['showAt', n, x, y, mode]); },
		dialogValueEntry: function(t, lo, hi, p) { calls.push(['dve', t, lo, hi, p]); return Promise.resolve(api.dveResult); },
		dialogStringEntry: function(t, p) { calls.push(['dse', t, p]); return Promise.resolve(1); },
		log: function(t) { calls.push(['log', t]); },
		ack: function(t) { calls.push(['ack', t]); }
	};

	for (var k in (extra || {}))
	{
		api[k] = extra[k];
	}

	return api;
}

function run(src, tags, extra, env)
{
	var api = mkApi(tags, extra);

	return QS.compile(src).run(api, env).then(function() { return api; });
}

function names(api)
{
	return api.calls.map(function(c) { return c.join(':'); });
}

test('assignments are awaited in order', async function()
{
	var api = await run('A = 1; B = A + 1;\nC = B * 10', {});
	assert.deepStrictEqual(api.calls.map(function(c) { return c[0] + ' ' + c[1]; }),
		['write:start A', 'write:done A', 'write:start B', 'write:done B', 'write:start C', 'write:done C']);
	assert.deepStrictEqual(api.tags, { A: 1, B: 2, C: 20 });
});

test('comments, case-insensitive keywords, newlines and semicolons', async function()
{
	var src = '{ header comment\nspanning lines }\nA = 1; { inline } B = 2\n\n  if A = 1 then  { c }\n C = 3;\nendif;\n';
	var api = await run(src, {});
	assert.deepStrictEqual(api.tags, { A: 1, B: 2, C: 3 });
});

test('IF / ELSEIF / ELSE', async function()
{
	var src = 'IF X > 10 THEN R = "big"; ELSEIF X > 5 THEN R = "mid"; ELSEIF X > 2 THEN\n R = "small";\nELSE R = "tiny"; ENDIF;';
	assert.strictEqual((await run(src, { X: 11 })).tags.R, 'big');
	assert.strictEqual((await run(src, { X: 6 })).tags.R, 'mid');
	assert.strictEqual((await run(src, { X: 3 })).tags.R, 'small');
	assert.strictEqual((await run(src, { X: 0 })).tags.R, 'tiny');
	// nested, no else
	var nested = 'IF A THEN IF B THEN R = 1; ENDIF; R2 = 2; ENDIF;';
	var api = await run(nested, { A: 1, B: 0 });
	assert.deepStrictEqual(api.tags, { A: 1, B: 0, R2: 2 });
	api = await run(nested, { A: 0, B: 1 });
	assert.deepStrictEqual(api.tags, { A: 0, B: 1 });
	// discrete truthiness
	api = await run('IF S THEN R = 1; ELSE R = 2; ENDIF', { S: 'off' });
	assert.strictEqual(api.tags.R, 2);
	// ELSE with a statement on the same line
	api = await run('IF 0 THEN R = 1;\nELSE R = 9;\nENDIF', {});
	assert.strictEqual(api.tags.R, 9);
});

test('FOR / NEXT with STEP, nested and RETURN', async function()
{
	var src = 'DIM i AS INTEGER; DIM sum AS INTEGER;\nFOR i = 1 TO 5 sum = sum + i; NEXT;\nTotal = sum;';
	// statement directly after the header on the same line is not supported; use separators
	src = 'DIM i AS INTEGER; DIM sum AS INTEGER;\nFOR i = 1 TO 5\n sum = sum + i;\nNEXT;\nTotal = sum;';
	assert.strictEqual((await run(src, {})).tags.Total, 15);
	assert.strictEqual((await run('DIM s AS INTEGER; FOR k = 10 TO 1 STEP -3\n s = s + k;\nNEXT; T = s; K2 = k', {})).tags.T, 10 + 7 + 4 + 1);
	assert.strictEqual((await run('DIM s AS INTEGER; FOR k = 1 TO 0\n s = 1;\nNEXT; T = s', {})).tags.T, 0);
	var nested = 'DIM n AS INTEGER; FOR a = 1 TO 3\n FOR b = 1 TO 4\n n = n + 1;\n NEXT;\n NEXT; T = n';
	assert.strictEqual((await run(nested, {})).tags.T, 12);
	// writes inside loops are awaited sequentially
	var api = await run('FOR i = 1 TO 3\n Out = i;\nNEXT', {});
	assert.deepStrictEqual(api.calls.map(function(c) { return c[0]; }),
		['write:start', 'write:done', 'write:start', 'write:done', 'write:start', 'write:done']);
	// RETURN inside nested blocks stops the script
	api = await run('A = 1;\nIF 1 THEN\n RETURN;\nENDIF;\nA = 2;', {});
	assert.strictEqual(api.tags.A, 1);
	api = await run('FOR i = 1 TO 5\n IF i = 3 THEN RETURN; ENDIF;\n X = i;\nNEXT; X = 99', {});
	assert.strictEqual(api.tags.X, 2);
});

test('FOR iteration bound is global', async function()
{
	await assert.rejects(run('FOR i = 1 TO 100000\n DIM_ = 1;\nNEXT', {}), function(e)
	{
		return e instanceof QS.Error && /iteration limit/.test(e.message) && e.line === 1;
	});
	// nested loops share the budget: 100 * 101 > 10000
	await assert.rejects(run('FOR a = 1 TO 100\n FOR b = 1 TO 100\n x = 1;\n NEXT;\n NEXT', {}),
		function(e) { return e instanceof QS.Error && /iteration limit/.test(e.message); });
	// exactly at the limit is allowed
	var api = await run('DIM n AS INTEGER; FOR i = 1 TO ' + QS.MAX_ITERATIONS + '\n n = n + 1;\nNEXT; T = n', {});
	assert.strictEqual(api.tags.T, QS.MAX_ITERATIONS);
	await assert.rejects(run('FOR i = 1 TO 5 STEP 0\n x = 1;\nNEXT', {}), /STEP/);
	await assert.rejects(run('FOR i = 1 TO "a"\n x = 1;\nNEXT', {}), /numbers/);
});

test('DIM locals do not write tags and are typed', async function()
{
	var api = await run('DIM a AS INTEGER; DIM b, c AS REAL; DIM s AS MESSAGE; DIM d AS DISCRETE;\nB1 = a; B2 = b + c; B3 = s + "x"; B4 = d;\na = 5; b = a * 2; Out = b;', {});
	assert.deepStrictEqual(api.tags, { B1: 0, B2: 0, B3: 'x', B4: 0, Out: 10 });
	// case-insensitive locals
	api = await run('DIM Count AS INTEGER; COUNT = 3; T = count + 1', {});
	assert.deepStrictEqual(api.tags, { T: 4 });
	// a local shadows a tag of the same name
	api = await run('DIM X AS INTEGER; X = 5; T = X', { X: 100 });
	assert.strictEqual(api.tags.X, 100);
	assert.strictEqual(api.tags.T, 5);
});

test('assignments of undefined write nothing', async function()
{
	var api = await run('A = Missing;', {});
	assert.deepStrictEqual(api.calls, []);
});

test('Show / Hide / ShowAt / ShowTopLeftAt / HideSelf / LogMessage / Ack / PlaySound', async function()
{
	var api = await run('Show("Win1"); Hide("Win2"); ShowAt("W3", $ObjHor + 10, 20);\nShowTopLeftAt("W4", 1, 2); HideSelf();\nLogMessage("n=" + 5); Ack(Alm1); AlarmAck("Alm2"); PlaySound("x.wav", 1)',
		{ $ObjHor: 100 });
	assert.deepStrictEqual(api.calls, [
		['show', 'Win1'], ['hide', 'Win2'], ['showAt', 'W3', 110, 20, 'center'],
		['showAt', 'W4', 1, 2, 'topleft'], ['hideSelf'], ['log', 'n=5'],
		['ack', 'Alm1'], ['ack', 'Alm2'], ['log', 'PlaySound ignored']]);
});

test('SetTagValue / GetTagValue', async function()
{
	var api = await run('SetTagValue("Dyn", 4 * 2); R = GetTagValue("Dyn"); Z = GetTagValue(Dyn2)', { Dyn2: 'q' });
	assert.strictEqual(api.tags.Dyn, 8);
	assert.strictEqual(api.tags.R, 8);
	assert.strictEqual(api.tags.Z, 'q', 'a bare identifier argument names the tag');
});

test('DialogValueEntry return code propagation and ordering', async function()
{
	var api = mkApi({});
	api.dveResult = 1;
	await QS.compile('RC = DialogValueEntry(Setpoint, 0, 100, "Enter value");\nIF RC = 1 THEN Msg = "ok"; ELSE Msg = "cancel"; ENDIF;').run(api);
	assert.deepStrictEqual(api.calls[0], ['dve', 'Setpoint', 0, 100, 'Enter value']);
	assert.strictEqual(api.tags.RC, 1);
	assert.strictEqual(api.tags.Msg, 'ok');

	api = mkApi({});
	api.dveResult = 0;
	await QS.compile('DIM rc AS INTEGER; rc = DialogValueEntry("Setpoint", 0, 100, "p"); Msg = rc; IF rc <> 1 THEN RETURN; ENDIF; After = 1').run(api);
	assert.strictEqual(api.tags.Msg, 0);
	assert.strictEqual(api.tags.After, undefined);

	api = mkApi({});
	await QS.compile('DialogStringEntry(Name, "Enter name"); RC = DialogStringEntry("N2", "x")').run(api);
	assert.deepStrictEqual(api.calls[0], ['dse', 'Name', 'Enter name']);
	assert.deepStrictEqual(api.calls[1], ['dse', 'N2', 'x']);
	assert.strictEqual(api.tags.RC, 1);
});

test('expressions see tags, env extras and dotfields', async function()
{
	var api = await run('Out = Tank.Level * 2 + Pump.Quality; V = value + 1; S = Text(Level, "#.#") + " m"',
		{ 'Tank.Level': 21, Level: 3.14 },
		null,
		{ value: 4, tagEntry: function(n) { return { value: 1, quality: 'good', ts: 1 }; } });
	assert.strictEqual(api.tags.Out, 42 + 192);
	assert.strictEqual(api.tags.V, 5);
	assert.strictEqual(api.tags.S, '3.1 m');
});

test('api.read falls back to env.tag', async function()
{
	var api = mkApi({});
	delete api.read;
	await QS.compile('A = B + 1').run(api, { tag: function(n) { return n === 'B' ? 1 : undefined; } });
	assert.strictEqual(api.tags.A, 2);
	var api2 = mkApi({});
	delete api2.read;
	await QS.compile('A = 5; C = D').run(api2);
	assert.strictEqual(api2.tags.A, 5);
	assert.strictEqual(api2.tags.C, undefined);
});

test('compile errors carry line numbers', function()
{
	function err(src)
	{
		try
		{
			QS.compile(src);
		}
		catch (e)
		{
			assert.ok(e instanceof QS.Error);
			assert.ok(e instanceof Error);
			assert.strictEqual(e.name, 'Hmi.QuickScript.Error');

			return e;
		}

		assert.fail('expected an error for ' + src);
	}

	assert.strictEqual(err('A = 1;\nB = ;').line, 2);
	assert.strictEqual(err('A = 1;\n\n\nB = 1 +').line, 4);
	assert.strictEqual(err('A = 1;\nIF A THEN\n B = 1;').line, 2);
	assert.match(err('IF A THEN\n B = 1;').message, /ENDIF/);
	assert.strictEqual(err('FOR i = 1 TO 3\n x = 1;').line, 1);
	assert.match(err('FOR i = 1 TO 3\n x = 1;').message, /NEXT/);
	assert.strictEqual(err('A = 1;\nENDIF;').line, 2);
	assert.strictEqual(err('A = 1;\nNEXT;').line, 2);
	assert.strictEqual(err('ELSE').line, 1);
	assert.strictEqual(err('IF 1 THEN\nELSE\nELSE\nENDIF').line, 3);
	assert.strictEqual(err('IF 1 THEN\nELSE\nELSEIF 1 THEN\nENDIF').line, 3);
	assert.strictEqual(err('ELSEIF 1 THEN').line, 1);
	assert.strictEqual(err('IF A\n B = 1;\nENDIF').line, 1);
	assert.strictEqual(err('IF 1 THEN\nELSEIF A\nENDIF').line, 2);
	assert.strictEqual(err('A = 1;\nFrobnicate(1);').line, 2);
	assert.strictEqual(err('A = 1;\nShow();').line, 2);
	assert.strictEqual(err('Show("a", "b")').line, 1);
	assert.strictEqual(err('\n\nthis is not valid').line, 3);
	assert.strictEqual(err('A = "abc').line, 1);
	assert.strictEqual(err('A = 1;\n{ never closed').line, 2);
	assert.strictEqual(err('DIM x AS BIGINT').line, 1);
	assert.strictEqual(err('DIM x INTEGER').line, 1);
	assert.strictEqual(err('DIM __proto__ AS INTEGER').line, 1);
	assert.strictEqual(err('DIM 1x AS INTEGER').line, 1);
	assert.strictEqual(err('FOR i 1 TO 3\nNEXT').line, 1);
	assert.strictEqual(err('FOR i = 1\nNEXT').line, 1);
	assert.strictEqual(err('A = 1;\nB = ~;').line, 2);
	assert.match(err('A = 1 AND').message, /expression error/);
	assert.throws(function() { QS.compile(5); }, QS.Error);
	assert.throws(function() { QS.compile(new Array(120000).join('a')); }, /too long/);
	assert.strictEqual(err('B = (1 +\n 2').line, 1, 'newlines inside parentheses do not split');
});

test('multi-line call arguments and strings with delimiters', async function()
{
	var api = await run('Show(\n "Win;1"\n);\nT = "a;b{c}d=e"', {});
	assert.deepStrictEqual(api.calls[0], ['show', 'Win;1']);
	assert.strictEqual(api.tags.T, 'a;b{c}d=e');
	api = await run('T = "say \\"x\\" ok"; U = \'it\'', {});
	assert.strictEqual(api.tags.T, 'say "x" ok');
});

test('runtime errors carry line numbers', async function()
{
	await assert.rejects(run('A = 1;\nB = 2;\nShow("x")', {}, { show: undefined }), function(e)
	{
		return e instanceof QS.Error && e.line === 3 && /api.show/.test(e.message);
	});
	await assert.rejects(run('\nA = 1', {}, { write: function() { return Promise.reject(new Error('denied')); } }),
		function(e) { return e instanceof QS.Error && e.line === 2 && /denied/.test(e.message); });
	await assert.rejects(run('\nA = 1', {}, { write: function() { throw new Error('boom'); } }),
		function(e) { return e instanceof QS.Error && e.line === 2 && /boom/.test(e.message); });
	await assert.rejects(run('A = 1', {}, { write: undefined }), /api.write/);
	await assert.rejects(run('A = 1;\nDialogValueEntry(T, 0, 1, "p")', {}, { dialogValueEntry: function() { return Promise.reject(new Error('nope')); } }),
		function(e) { return e instanceof QS.Error && e.line === 2 && /nope/.test(e.message); });
	await assert.rejects(run('GetTagValue("a")', {}, { read: undefined }), /api.read/);
});

test('refs of a compiled script', function()
{
	var c = QS.compile('IF Pump.Run AND Level > 3 THEN Out = Flow + 1; ENDIF');
	assert.deepStrictEqual(c.refs.sort(), ['Flow', 'Level', 'Pump.Run'].sort());
});

test('security: scripts cannot reach prototypes or globals', async function()
{
	var api = await run('A = constructor; B = __proto__; C = process; D = globalThis', {});
	assert.deepStrictEqual(api.calls, []);
	assert.throws(function() { QS.compile('eval("1")'); }, QS.Error);
	assert.throws(function() { QS.compile('x = eval("1")'); }, QS.Error);
});

test('the script run resolves to undefined and can run repeatedly', async function()
{
	var c = QS.compile('DIM n AS INTEGER; n = n + 1; Out = n');
	var api1 = mkApi({});
	assert.strictEqual(await c.run(api1), undefined);
	var api2 = mkApi({});
	await c.run(api2);
	assert.strictEqual(api1.tags.Out, 1);
	assert.strictEqual(api2.tags.Out, 1, 'locals start fresh on every run');
});
