var test = require('node:test');
var assert = require('node:assert');
var load = require('./load.js');
var Hmi = load(['core/HmiExpr.js', 'core/HmiFormat.js', 'core/HmiTagStore.js', 'runtime/HmiWriter.js']);

function makeRt(overrides)
{
	var tags = new Hmi.TagStore();
	var events = [];
	var logs = [];

	var rt = {
		mode: 'run',
		config: { runtime: {} },
		tags: tags,
		sources: { write: function() { return Promise.resolve(); } },
		fire: function(name, payload) { events.push([name, payload]); },
		log: function(level, cat, msg, data) { logs.push([level, cat, msg, data]); },
		hasRoles: function() { return true; },
		_events: events,
		_logs: logs
	};

	for (var k in overrides)
	{
		if (Object.prototype.hasOwnProperty.call(overrides, k)) rt[k] = overrides[k];
	}

	return rt;
}

test('refuses write in view mode', function()
{
	var rt = makeRt({ mode: 'view' });
	rt.tags.define([{ name: 'T1', type: 'number', access: 'rw' }]);
	var writer = new Hmi.Writer(rt);

	return writer.write('T1', 5).then(function() { assert.fail('should reject'); }, function(err)
	{
		assert.match(err.message, /view-only/);
		assert.strictEqual(writer.auditLog[0].outcome, 'refused');
	});
});

test('refuses write to read-only tag', function()
{
	var rt = makeRt();
	rt.tags.define([{ name: 'T1', type: 'number', access: 'r' }]);
	var writer = new Hmi.Writer(rt);

	return writer.write('T1', 5).then(function() { assert.fail('should reject'); }, function(err)
	{
		assert.match(err.message, /read-only/);
	});
});

test('refuses write to undeclared tag unless allowUndeclaredWrites', function()
{
	var rt = makeRt();
	var writer = new Hmi.Writer(rt);

	return writer.write('Unknown', 5).then(function() { assert.fail('should reject'); }, function(err)
	{
		assert.match(err.message, /not declared/);
	}).then(function()
	{
		rt.config.runtime.allowUndeclaredWrites = true;
		return writer.write('Unknown', 5).then(function(v) { assert.strictEqual(v, 5); });
	});
});

test('refuses write failing type coercion', function()
{
	var rt = makeRt();
	rt.tags.define([{ name: 'T1', type: 'number', access: 'rw' }]);
	var writer = new Hmi.Writer(rt);

	return writer.write('T1', 'not-a-number').then(function() { assert.fail(); }, function(err)
	{
		assert.match(err.message, /type validation/);
	});
});

test('refuses write out of min/max range', function()
{
	var rt = makeRt();
	rt.tags.define([{ name: 'T1', type: 'number', access: 'rw', min: 0, max: 10 }]);
	var writer = new Hmi.Writer(rt);

	return writer.write('T1', 20).then(function() { assert.fail(); }, function(err)
	{
		assert.match(err.message, /maximum/);
	});
});

test('refuses write without required roles', function()
{
	var rt = makeRt({ hasRoles: function() { return false; } });
	rt.tags.define([{ name: 'T1', type: 'number', access: 'rw', roles: ['eng'] }]);
	var writer = new Hmi.Writer(rt);

	return writer.write('T1', 5).then(function() { assert.fail(); }, function(err)
	{
		assert.match(err.message, /role/);
	});
});

test('local tag write applies immediately', function()
{
	var rt = makeRt();
	rt.tags.define([{ name: 'T1', type: 'number', local: true }]);
	var writer = new Hmi.Writer(rt);

	return writer.write('T1', 5).then(function(v)
	{
		assert.strictEqual(v, 5);
		assert.strictEqual(rt.tags.getValue('T1'), 5);
		assert.strictEqual(writer.auditLog[0].outcome, 'ok');
	});
});

test('remote write: confirmed mode resolves once tag value matches', function()
{
	var rt = makeRt();
	rt.tags.define([{ name: 'T1', type: 'number', access: 'rw', write: { source: 's1', mode: 'confirmed', timeout: 2000 } }]);
	var writer = new Hmi.Writer(rt);

	var p = writer.write('T1', 7);
	setTimeout(function() { rt.tags.set('T1', 7, { quality: 'good', source: 'device' }); }, 5);

	return p.then(function(v)
	{
		assert.strictEqual(v, 7);
		assert.strictEqual(writer.auditLog[writer.auditLog.length - 1].outcome, 'ok');
	});
});

test('remote write: confirmed mode times out to unconfirmed but still resolves', function()
{
	var rt = makeRt();
	rt.tags.define([{ name: 'T1', type: 'number', access: 'rw', write: { source: 's1', mode: 'confirmed', timeout: 20 } }]);
	var writer = new Hmi.Writer(rt);

	return writer.write('T1', 7).then(function(v)
	{
		assert.strictEqual(v, 7);
		assert.strictEqual(writer.auditLog[writer.auditLog.length - 1].outcome, 'unconfirmed');
	});
});

test('remote write: optimistic mode sets value immediately and reverts on timeout', function(t, done)
{
	var rt = makeRt();
	rt.tags.define([{ name: 'T1', type: 'number', access: 'rw', initial: 1, write: { source: 's1', mode: 'optimistic', timeout: 20 } }]);
	var writer = new Hmi.Writer(rt);

	writer.write('T1', 99).then(function(v)
	{
		assert.strictEqual(v, 99);
		assert.strictEqual(rt.tags.getValue('T1'), 99);

		setTimeout(function()
		{
			assert.strictEqual(rt.tags.getValue('T1'), 1); // reverted
			done();
		}, 40);
	});
});

test('request template substitution: ${value} ${tag} ${ts}', function()
{
	var rt = makeRt();
	var captured = null;
	rt.sources.write = function(source, req) { captured = req; return Promise.resolve(); };
	rt.tags.define([{
		name: 'T1', type: 'number', access: 'rw',
		write: { source: 's1', topic: 'plant/${tag}', payload: '{"value":${value}}', mode: 'confirmed', timeout: 20 }
	}]);
	var writer = new Hmi.Writer(rt);

	return writer.write('T1', 5).then(function()
	{
		assert.strictEqual(captured.topic, 'plant/T1');
		assert.strictEqual(captured.payload, '{"value":5}');
	});
});

test('request template: string value JSON-quoted when unquoted in template', function()
{
	var rt = makeRt();
	var captured = null;
	rt.sources.write = function(source, req) { captured = req; return Promise.resolve(); };
	rt.tags.define([{
		name: 'T1', type: 'string', access: 'rw',
		write: { source: 's1', payload: '{"value":${value}}', mode: 'confirmed', timeout: 20 }
	}]);
	var writer = new Hmi.Writer(rt);

	return writer.write('T1', 'hello').then(function()
	{
		assert.strictEqual(captured.payload, '{"value":"hello"}');
	});
});

test('audit log never contains a "credentials" style secret field and rings at 500', function()
{
	var rt = makeRt();
	rt.tags.define([{ name: 'T1', type: 'number', local: true }]);
	var writer = new Hmi.Writer(rt);
	var chain = Promise.resolve();

	for (var i = 0; i < 510; i++)
	{
		(function(i)
		{
			chain = chain.then(function() { return writer.write('T1', i); });
		})(i);
	}

	return chain.then(function()
	{
		assert.strictEqual(writer.auditLog.length, 500);

		for (var j = 0; j < writer.auditLog.length; j++)
		{
			assert.strictEqual(Object.prototype.hasOwnProperty.call(writer.auditLog[j], 'password'), false);
			assert.strictEqual(Object.prototype.hasOwnProperty.call(writer.auditLog[j], 'credentials'), false);
		}
	});
});

test('pulse: writes value then reset after ms', function(t, done)
{
	var rt = makeRt();
	rt.tags.define([{ name: 'T1', type: 'number', local: true }]);
	var writer = new Hmi.Writer(rt);

	writer.pulse('T1', 1, 0, 20).then(function()
	{
		assert.strictEqual(rt.tags.getValue('T1'), 1);

		setTimeout(function()
		{
			assert.strictEqual(rt.tags.getValue('T1'), 0);
			done();
		}, 40);
	});
});

test('toggle: inverts current boolean value', function()
{
	var rt = makeRt();
	rt.tags.define([{ name: 'T1', type: 'boolean', local: true, initial: false }]);
	var writer = new Hmi.Writer(rt);

	return writer.toggle('T1').then(function(v)
	{
		assert.strictEqual(v, true);
		assert.strictEqual(rt.tags.getValue('T1'), true);
	});
});
