var test = require('node:test');
var assert = require('node:assert');
var load = require('./load.js');
var Hmi = load(['core/HmiExpr.js', 'core/HmiFormat.js', 'core/HmiQuickScript.js']);
var QS = Hmi.QuickScript;

function mkApi(tags)
{
	var calls = [];
	var api = {
		calls: calls,
		tags: tags || {},
		read: function(n) { return api.tags[n]; },
		write: function(n, v) { api.tags[n] = v; },
		openUrl: function(u, t) { calls.push(['openUrl', u, t]); },
		message: function(t, l) { calls.push(['message', t, l]); },
		emit: function(n, p) { calls.push(['emit', n, p]); },
		postToHost: function(n, p) { calls.push(['postToHost', n, p]); },
		animation: function(o, c, n) { calls.push(['animation', o, c, n]); },
		media: function(o, c) { calls.push(['media', o, c]); },
		setProperty: function(o, t, v) { calls.push(['setProperty', o, t, v]); },
		show: function(p, o) { calls.push(['show', p, o]); }
	};

	return api;
}

function run(src, tags)
{
	var api = mkApi(tags);

	return QS.compile(src).run(api, {}).then(function() { return api; });
}

function fails(src, api, text)
{
	return QS.compile(src).run(api, {}).then(function()
	{
		assert.fail('expected an error: ' + src);
	}, function(e)
	{
		assert.ok(e instanceof QS.Error, String(e));
		assert.ok(e.message.indexOf(text) >= 0, e.message);
	});
}

test('OpenURL', async function()
{
	var api = await run('OpenURL("http://x/a")');
	assert.deepStrictEqual(api.calls, [['openUrl', 'http://x/a', undefined]]);
	api = await run('OpenURL("http://x/" + "b", "dialog")');
	assert.deepStrictEqual(api.calls, [['openUrl', 'http://x/b', 'dialog']]);
});

test('ShowMessage', async function()
{
	var api = await run('ShowMessage("hi")');
	assert.deepStrictEqual(api.calls, [['message', 'hi', undefined]]);
	api = await run('ShowMessage("careful", "warn")');
	assert.deepStrictEqual(api.calls, [['message', 'careful', 'warn']]);
});

test('SendMessage and PostToHost evaluate expressions', async function()
{
	var api = await run('SendMessage("m")', {});
	assert.deepStrictEqual(api.calls, [['emit', 'm', undefined]]);
	api = await run('SendMessage("m", Level * 2); PostToHost("h", Level); PostToHost("h2")', { Level: 4 });
	assert.deepStrictEqual(api.calls, [['emit', 'm', 8], ['postToHost', 'h', 4], ['postToHost', 'h2', undefined]]);
});

test('Start/Pause/StopAnimation', async function()
{
	var api = await run('StartAnimation(Me)\nPauseAnimation(Me, "spin")\nStopAnimation("cell1", "x")');
	assert.deepStrictEqual(api.calls, [
		['animation', 'Me', 'start', undefined],
		['animation', 'Me', 'pause', 'spin'],
		['animation', 'cell1', 'stop', 'x']
	]);
});

test('Me is case-insensitive and canonical; other identifiers are evaluated', async function()
{
	var api = await run('StartAnimation(me); StartAnimation(ME); StartAnimation(Target)', { Target: 'tag:pumps' });
	assert.deepStrictEqual(api.calls, [
		['animation', 'Me', 'start', undefined],
		['animation', 'Me', 'start', undefined],
		['animation', 'tag:pumps', 'start', undefined]
	]);
	api = await run('StartAnimation("")');
	assert.deepStrictEqual(api.calls, [['animation', '', 'start', undefined]]);
});

test('Me is only special for object arguments', async function()
{
	var api = await run('SendMessage("m", Me)', { Me: 7 });
	assert.deepStrictEqual(api.calls, [['emit', 'm', 7]]);
});

test('Play/Pause/StopMedia', async function()
{
	var api = await run('PlayMedia(Me); PauseMedia("c2"); StopMedia(Me)');
	assert.deepStrictEqual(api.calls, [['media', 'Me', 'play'], ['media', 'c2', 'pause'], ['media', 'Me', 'stop']]);
});

test('SetProperty', async function()
{
	var api = await run('SetProperty(Me, "label", "Run " + "now")\nSetProperty("c1", "style:fillColor", Color)', { Color: '#ff0000' });
	assert.deepStrictEqual(api.calls, [
		['setProperty', 'Me', 'label', 'Run now'],
		['setProperty', 'c1', 'style:fillColor', '#ff0000']
	]);
});

test('Navigate calls show with replace', async function()
{
	var api = await run('Navigate("Page-2")');
	assert.deepStrictEqual(api.calls, [['show', 'Page-2', { replace: true }]]);
});

test('functions are case-insensitive and work in IF blocks', async function()
{
	var api = await run('IF Level > 3 THEN\nopenurl("u")\nELSE\nNAVIGATE("p")\nENDIF', { Level: 5 });
	assert.deepStrictEqual(api.calls, [['openUrl', 'u', undefined]]);
});

test('arity is checked at compile time', function()
{
	var bad = ['OpenURL()', 'OpenURL("a", "b", "c")', 'ShowMessage()', 'ShowMessage(1, 2, 3)', 'SendMessage()',
		'PostToHost(1, 2, 3)', 'StartAnimation()', 'StopAnimation(Me, "a", "b")', 'PlayMedia()', 'PlayMedia(Me, 1)',
		'SetProperty(Me, "a")', 'SetProperty(Me, "a", 1, 2)', 'Navigate()', 'Navigate("a", "b")'];

	bad.forEach(function(src)
	{
		assert.throws(function() { QS.compile(src); }, function(e)
		{
			return e instanceof QS.Error && e.message.indexOf('wrong number of arguments') >= 0;
		}, src);
	});
});

test('missing api functions raise a clear runtime error', async function()
{
	var cases = [
		['OpenURL("a")', 'api.openUrl'], ['ShowMessage("a")', 'api.message'], ['SendMessage("a")', 'api.emit'],
		['PostToHost("a")', 'api.postToHost'], ['StartAnimation(Me)', 'api.animation'], ['PauseAnimation(Me)', 'api.animation'],
		['StopAnimation(Me)', 'api.animation'], ['PlayMedia(Me)', 'api.media'], ['PauseMedia(Me)', 'api.media'],
		['StopMedia(Me)', 'api.media'], ['SetProperty(Me, "a", 1)', 'api.setProperty'], ['Navigate("a")', 'api.show']
	];

	for (var i = 0; i < cases.length; i++)
	{
		await fails(cases[i][0], {}, cases[i][1] + ' is not available');
	}
});

test('argument expression errors are compile errors', function()
{
	assert.throws(function() { QS.compile('OpenURL("a" +)'); }, function(e) { return e instanceof QS.Error; });
});

test('refs include argument tags; writes and locals are listed', function()
{
	var c = QS.compile('SendMessage("m", A + B)\nStartAnimation(Me)\nX = 1\nSetTagValue(Y, 2)\nDIM L AS INTEGER\nL = 3\nFOR i = 1 TO 2\nZ = i\nNEXT');
	assert.deepStrictEqual(c.refs.slice().sort(), ['A', 'B', 'i']);
	assert.deepStrictEqual(c.locals.slice().sort(), ['L', 'i']);
	assert.deepStrictEqual(c.writes.slice().sort(), ['X', 'Y', 'Z']);
});

test('existing functions still work', async function()
{
	var api = await run('Show("W1")');
	assert.deepStrictEqual(api.calls, [['show', 'W1', undefined]]);
});
