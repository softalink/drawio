var test = require('node:test');
var assert = require('node:assert');
var util = require('./hmiTestUtil.js');

// Node 22 has no global EventSource without --experimental-eventsource, and
// node --test does not let us pass that flag per-file, so we inject a tiny
// polyfill for this test only (see ARCHITECTURE.md / task brief).
global.EventSource = util.EventSourcePolyfill;

test('HmiSseSource: connect, receive updates, and write() rejects (read-only)', function(t)
{
	var Hmi = util.loadHmi();

	return util.startDevServer().then(function(r)
	{
		var srv = r.srv;
		var ports = r.ports;
		var tags = new Hmi.TagStore({});
		var mgr = new Hmi.SourceManager({
			tags: tags,
			allow: function() { return true; },
			resolve: function(s) { return s; }
		});

		mgr.configure([{
			id: 'sse1',
			type: 'sse',
			enabled: true,
			url: 'http://localhost:' + ports.httpPort + '/sse',
			format: {kind: 'flat'},
			events: ['message'],
			reconnect: {maxAttempts: 0}
		}]);

		mgr.start();

		return util.waitFor(function()
		{
			return mgr.status()[0].state === 'connected';
		}, 5000).then(function()
		{
			return util.waitFor(function()
			{
				return tags.getValue('Http/Temp') !== undefined;
			}, 5000);
		}).then(function()
		{
			assert.strictEqual(typeof tags.getValue('Http/Temp'), 'number');

			return mgr.write('sse1', {topic: 'x', payload: 'y'});
		}).then(function()
		{
			assert.fail('write() on an SSE source should reject');
		}, function(err)
		{
			assert.match(String(err && err.message || err), /read-only/i);
		}).then(function()
		{
			mgr.stop();

			return srv.stop();
		});
	});
});
