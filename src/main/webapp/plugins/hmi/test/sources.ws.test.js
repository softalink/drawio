var test = require('node:test');
var assert = require('node:assert');
var util = require('./hmiTestUtil.js');

test('HmiWsSource: connect, receive flat JSON, and write', function(t)
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
			id: 'ws1',
			type: 'ws',
			enabled: true,
			url: 'ws://localhost:' + ports.wsPort + '/',
			format: {kind: 'flat'},
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
				return tags.getValue('Sim/Ws1') !== undefined;
			}, 5000);
		}).then(function()
		{
			assert.strictEqual(typeof tags.getValue('Sim/Ws1'), 'number');

			return mgr.write('ws1', {message: JSON.stringify({hello: 'world'})});
		}).then(function()
		{
			var recent = mgr.recent('ws1');
			assert.ok(recent.some(function(e) { return e.dir === 'out'; }));

			mgr.stop();

			return srv.stop();
		});
	});
});
