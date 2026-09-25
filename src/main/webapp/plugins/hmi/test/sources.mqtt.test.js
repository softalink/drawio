var test = require('node:test');
var assert = require('node:assert');
var util = require('./hmiTestUtil.js');

test('HmiMqttSource: connect, receive with topic mapping, and publish-write', function(t)
{
	var Hmi = util.loadHmi();
	var dev, srv, ports;

	return util.startDevServer().then(function(r)
	{
		srv = r.srv;
		ports = r.ports;

		var tags = new Hmi.TagStore({});
		var statuses = [];
		var mgr = new Hmi.SourceManager({
			tags: tags,
			allow: function() { return true; },
			resolve: function(s) { return s; }
		});

		mgr.on('status', function(s) { statuses.push(s); });

		mgr.configure([{
			id: 'mqtt1',
			type: 'mqtt',
			enabled: true,
			url: 'ws://localhost:' + ports.mqttWsPort + '/mqtt',
			format: {kind: 'topic', template: 'plant/{tag}'},
			topics: [{filter: 'plant/#', qos: 0}],
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
				return tags.getValue('Tank1/Level') !== undefined;
			}, 5000);
		}).then(function()
		{
			var v = tags.getValue('Tank1/Level');
			assert.strictEqual(typeof v, 'number');

			// publish-write: write to plant/Pump1/Run/set, the dev server
			// echoes it back on plant/Pump1/Run, which we're subscribed to.
			return mgr.write('mqtt1', {topic: 'plant/Pump1/Run/set', payload: '1', qos: 0});
		}).then(function()
		{
			return util.waitFor(function()
			{
				return tags.getValue('Pump1/Run') === 1;
			}, 5000);
		}).then(function()
		{
			assert.ok(statuses.some(function(s) { return s.state === 'connected'; }));
			mgr.stop();

			return srv.stop();
		});
	});
});
