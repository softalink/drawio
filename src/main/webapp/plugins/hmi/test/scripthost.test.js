var test = require('node:test');
var assert = require('node:assert');
var util = require('./hmiTestUtil.js');

test('HmiScriptHost: policy off rejects', function(t)
{
	var Hmi = util.loadHmi();
	var host = new Hmi.ScriptHost({policy: 'off'});

	return host.run('return 1;', {}, {}).then(function()
	{
		assert.fail('should have rejected');
	}, function(err)
	{
		assert.match(String(err.message), /Scripts are disabled/);
	});
});

test('HmiScriptHost: policy on runs a script and returns its result', function(t)
{
	var Hmi = util.loadHmi();
	var host = new Hmi.ScriptHost({policy: 'on', timeout: 1000});

	return host.run('return args.message.toUpperCase();', {message: 'hi'}, {}).then(function(result)
	{
		assert.strictEqual(result, 'HI');
		host.terminate();
	});
});

test('HmiScriptHost: getTag reads synchronously from the args.tags snapshot, and api calls reach the host', function(t)
{
	var Hmi = util.loadHmi();
	var host = new Hmi.ScriptHost({policy: 'on', timeout: 1000});
	var notified = [];

	return host.run(
		'api.notify("hi", "info"); return api.getTag("T1") + 1;',
		{tags: {T1: 41}},
		{notify: function(text, level) { notified.push([text, level]); }}
	).then(function(result)
	{
		assert.strictEqual(result, 42);
		assert.deepStrictEqual(notified, [['hi', 'info']]);
		host.terminate();
	});
});

test('HmiScriptHost: an infinite loop is terminated at the timeout, and the host recovers', {timeout: 10000}, function(t)
{
	var Hmi = util.loadHmi();
	var host = new Hmi.ScriptHost({policy: 'on', timeout: 200});

	// Warm the worker up first so the very first real call is not charged
	// for worker startup time against its timeout budget.
	return host.run('return 1;', {}, {}).then(function()
	{
		return host.run('while (true) {}', {}, {});
	}).then(function()
	{
		assert.fail('infinite loop should have timed out');
	}, function(err)
	{
		assert.match(String(err.message), /Script timeout/);

		// The host should recreate its worker lazily and keep working.
		return host.run('return 99;', {}, {}).then(function(result)
		{
			assert.strictEqual(result, 99);
			host.terminate();
		});
	});
});

test('HmiScriptHost: policy prompt asks once via confirm() and remembers the decision', function(t)
{
	var Hmi = util.loadHmi();
	var asked = 0;

	var host = new Hmi.ScriptHost({
		policy: 'prompt',
		timeout: 1000,
		fileKey: 'test-file-' + Date.now() + '-' + Math.random(),
		confirm: function() { asked++; return Promise.resolve(true); }
	});

	return host.run('return 1;', {}, {}).then(function(r1)
	{
		assert.strictEqual(r1, 1);
		assert.strictEqual(asked, 1);

		return host.run('return 2;', {}, {});
	}).then(function(r2)
	{
		assert.strictEqual(r2, 2);
		assert.strictEqual(asked, 1, 'confirm() should only be asked once per fileKey');
		host.terminate();
	});
});

test('HmiScriptHost: policy prompt rejects when the user declines', function(t)
{
	var Hmi = util.loadHmi();

	var host = new Hmi.ScriptHost({
		policy: 'prompt',
		timeout: 1000,
		fileKey: 'declined-file-' + Date.now() + '-' + Math.random(),
		confirm: function() { return Promise.resolve(false); }
	});

	return host.run('return 1;', {}, {}).then(function()
	{
		assert.fail('should have rejected');
	}, function(err)
	{
		assert.match(String(err.message), /declined/i);
	});
});
