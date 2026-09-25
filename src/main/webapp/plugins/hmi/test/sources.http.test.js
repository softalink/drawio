var test = require('node:test');
var assert = require('node:assert');
var http = require('node:http');
var util = require('./hmiTestUtil.js');

/**
 * A tiny slow/counting HTTP endpoint, independent of the dev server, used
 * to verify no-overlap polling and once/skipFirst behaviour precisely.
 */
function startCounterServer(delayMs)
{
	var count = 0;
	var concurrent = 0;
	var maxConcurrent = 0;

	var server = http.createServer(function(req, res)
	{
		concurrent++;
		maxConcurrent = Math.max(maxConcurrent, concurrent);
		count++;
		var n = count;

		setTimeout(function()
		{
			concurrent--;
			res.setHeader('Content-Type', 'application/json');
			res.end(JSON.stringify({n: n}));
		}, delayMs);
	});

	return new Promise(function(resolve)
	{
		server.listen(0, function()
		{
			resolve({
				server: server,
				port: server.address().port,
				getCount: function() { return count; },
				getMaxConcurrent: function() { return maxConcurrent; },
				close: function() { return new Promise(function(r) { server.close(r); }); }
			});
		});
	});
};

test('HmiHttpSource: polling does not overlap on a slow endpoint', function(t)
{
	var Hmi = util.loadHmi();

	return startCounterServer(300).then(function(counter)
	{
		var tags = new Hmi.TagStore({});
		var mgr = new Hmi.SourceManager({tags: tags, allow: function() { return true; }, resolve: function(s) { return s; }});

		mgr.configure([{
			id: 'http1', type: 'http', enabled: true,
			url: 'http://localhost:' + counter.port + '/',
			method: 'GET', interval: 250, format: {kind: 'flat'},
			reconnect: {maxAttempts: 0}
		}]);

		mgr.start();

		return util.delay(1200).then(function()
		{
			mgr.stop();
			assert.strictEqual(counter.getMaxConcurrent(), 1, 'overlapping HTTP polls detected');
			assert.ok(counter.getCount() >= 2, 'expected several polls in 1.2s');

			return counter.close();
		});
	});
});

test('HmiHttpSource: once stops after the first poll', function(t)
{
	var Hmi = util.loadHmi();

	return startCounterServer(20).then(function(counter)
	{
		var tags = new Hmi.TagStore({});
		var mgr = new Hmi.SourceManager({tags: tags, allow: function() { return true; }, resolve: function(s) { return s; }});

		mgr.configure([{
			id: 'http2', type: 'http', enabled: true,
			url: 'http://localhost:' + counter.port + '/',
			method: 'GET', interval: 250, once: true, format: {kind: 'flat'},
			reconnect: {maxAttempts: 0}
		}]);

		mgr.start();

		return util.delay(900).then(function()
		{
			mgr.stop();
			assert.strictEqual(counter.getCount(), 1, 'once should issue exactly one request');

			return counter.close();
		});
	});
});

test('HmiHttpSource: skipFirst delays the first request by one interval', function(t)
{
	var Hmi = util.loadHmi();

	return startCounterServer(10).then(function(counter)
	{
		var tags = new Hmi.TagStore({});
		var mgr = new Hmi.SourceManager({tags: tags, allow: function() { return true; }, resolve: function(s) { return s; }});
		var start = Date.now();
		var firstReceivedAt = null;

		mgr.on('updates', function(updates)
		{
			if (firstReceivedAt == null && updates.length > 0)
			{
				firstReceivedAt = Date.now() - start;
			}
		});

		mgr.configure([{
			id: 'http3', type: 'http', enabled: true,
			url: 'http://localhost:' + counter.port + '/',
			method: 'GET', interval: 250, skipFirst: true, format: {kind: 'flat'},
			reconnect: {maxAttempts: 0}
		}]);

		mgr.start();

		return util.delay(400).then(function()
		{
			mgr.stop();
			assert.strictEqual(counter.getCount(), 1, 'expected exactly one request to have fired by 400ms');
			assert.ok(firstReceivedAt >= 200, 'skipFirst should delay the first request by ~one interval, got ' + firstReceivedAt + 'ms');

			return counter.close();
		});
	});
});
