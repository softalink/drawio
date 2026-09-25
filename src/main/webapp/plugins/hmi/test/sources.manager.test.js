var test = require('node:test');
var assert = require('node:assert');
var util = require('./hmiTestUtil.js');

test('HmiSourceManager: allow-list refusal strips credentials from lastError', function(t)
{
	var Hmi = util.loadHmi();
	var tags = new Hmi.TagStore({});
	var mgr = new Hmi.SourceManager({
		tags: tags,
		allow: function() { return false; },
		resolve: function(s) { return s; }
	});

	mgr.configure([{
		id: 'ws1', type: 'ws', enabled: true,
		url: 'ws://user:sekret@localhost:1/mqtt',
		format: {kind: 'flat'}
	}]);

	mgr.start();

	return util.waitFor(function()
	{
		return mgr.status()[0].state === 'error';
	}, 2000).then(function()
	{
		var s = mgr.status()[0];
		assert.match(s.lastError, /^Endpoint not allowed: /);
		assert.ok(s.lastError.indexOf('sekret') < 0, 'lastError leaked credentials: ' + s.lastError);
		mgr.stop();
	});
});

test('HmiSourceManager: redacts credential-shaped fields in the recent buffer, truncated to 2KB', function(t)
{
	var Hmi = util.loadHmi();
	var tags = new Hmi.TagStore({});
	var mgr = new Hmi.SourceManager({tags: tags, allow: function() { return true; }, resolve: function(s) { return s; }});
	var def = {id: 'x1', type: 'host', enabled: true, format: {kind: 'flat'}};

	mgr.configure([def]);
	mgr.start();

	var msg = JSON.stringify({tagA: 1, password: 'hunter2', token: 'abc.def.ghi'});

	return mgr.receive(def, msg, {topic: 'x'}).then(function()
	{
		var recent = mgr.recent('x1');
		assert.strictEqual(recent.length, 1);
		var payload = recent[0].payload;
		assert.ok(payload.indexOf('hunter2') < 0, 'password leaked into recent(): ' + payload);
		assert.ok(payload.indexOf('abc.def.ghi') < 0, 'token leaked into recent(): ' + payload);
		assert.match(payload, /\*\*\*/);

		// Truncation
		var big = {id: 1};
		var s = '';

		for (var i = 0; i < 4000; i++)
		{
			s += 'x';
		}

		big.blob = s;

		return mgr.receive(def, JSON.stringify(big), {topic: 'y'});
	}).then(function()
	{
		var recent = mgr.recent('x1');
		var last = recent[recent.length - 1];
		assert.ok(last.payload.length <= 2049, 'payload not truncated to 2KB: ' + last.payload.length);
		mgr.stop();
	});
});

test('HmiSourceManager: parser script (via ScriptHost) can replace the mapped updates', function(t)
{
	var Hmi = util.loadHmi();
	var tags = new Hmi.TagStore({});
	var host = new Hmi.ScriptHost({policy: 'on', timeout: 500});
	var mgr = new Hmi.SourceManager({tags: tags, allow: function() { return true; }, resolve: function(s) { return s; }, scripts: host});

	var def = {
		id: 'p1', type: 'host', enabled: true,
		format: {kind: 'flat'},
		parser: 'var m = JSON.parse(args.message); return [{tag: "Doubled", value: m.v * 2}];'
	};

	mgr.configure([def]);
	mgr.start();

	return mgr.receive(def, JSON.stringify({v: 21}), {topic: 'z'}).then(function()
	{
		assert.strictEqual(tags.getValue('Doubled'), 42);
		mgr.stop();
		host.terminate();
	});
});

test('HmiSourceManager: reconnects with backoff after the endpoint comes back', {timeout: 20000}, function(t)
{
	var Hmi = util.loadHmi();

	return util.startDevServer().then(function(r)
	{
		var srv = r.srv;
		var ports = r.ports;
		var tags = new Hmi.TagStore({});
		var states = [];
		var mgr = new Hmi.SourceManager({tags: tags, allow: function() { return true; }, resolve: function(s) { return s; }});

		mgr.on('status', function(s) { states.push(s.state); });

		mgr.configure([{
			id: 'ws1', type: 'ws', enabled: true,
			url: 'ws://localhost:' + ports.wsPort + '/',
			format: {kind: 'flat'},
			reconnect: {maxAttempts: 0}
		}]);

		mgr.start();

		return util.waitFor(function() { return mgr.status()[0].state === 'connected'; }, 5000).then(function()
		{
			return srv.stop();
		}).then(function()
		{
			return util.waitFor(function()
			{
				var s = mgr.status()[0].state;

				return s === 'error' || s === 'disconnected';
			}, 5000);
		}).then(function()
		{
			return util.startDevServer({mqttWsPort: 0, mqttTcpPort: 0, wsPort: ports.wsPort, httpPort: 0});
		}).then(function(r2)
		{
			return util.waitFor(function()
			{
				return mgr.status()[0].state === 'connected';
			}, 15000).then(function()
			{
				mgr.stop();

				return r2.srv.stop();
			});
		});
	});
});
