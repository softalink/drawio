/**
 * HMI plugin dev/test servers.
 *
 * Starts, on localhost:
 *  - MQTT over WebSocket   : ws://localhost:<mqttWsPort>/mqtt (and /)
 *  - Plain MQTT (TCP)      : mqtt://localhost:<mqttTcpPort>
 *  - JSON WebSocket        : ws://localhost:<wsPort>/  broadcasts
 *                            {"Sim/Ws1": n, "Sim/Ws2": n} every 500ms and
 *                            echoes back any message it receives.
 *  - HTTP JSON             : http://localhost:<httpPort>/tags (GET)
 *                            http://localhost:<httpPort>/write (POST)
 *  - SSE                   : http://localhost:<httpPort>/sse (GET)
 *  - MQTT data generator   : publishes plant/Tank1/Level, plant/Pump1/Run,
 *                            plant/Pump1/Speed, plant/Valve1/Open,
 *                            plant/Boiler/Temp, plant/Boiler/Pressure every
 *                            500ms (sine/ramp waveforms), and echoes writes
 *                            to plant/+/+/set back on the plant/X/Y topic.
 *
 * Usage:
 *   node etc/hmi/dev/server.js                 (default ports, runs until Ctrl-C)
 *   var dev = require('./server.js');
 *   dev.createServer({mqttWsPort: 0, ...}).start().then(function(ports) {...});
 *
 * Ports default to the values above; pass 0 for any port to get a random
 * free port (used by the test suite), reported back in the start() result.
 */
var http = require('http');
var net = require('net');
var WebSocket = require('ws');
var Aedes = require('aedes');

var DEFAULT_PORTS = {
	mqttWsPort: 9001,
	mqttTcpPort: 1883,
	wsPort: 9002,
	httpPort: 9003
};

function setCors(res)
{
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

function readBody(req, cb)
{
	var chunks = [];

	req.on('data', function(c) { chunks.push(c); });
	req.on('end', function() { cb(Buffer.concat(chunks).toString('utf8')); });
	req.on('error', function() { cb(''); });
};

/**
 * Node's server.close() waits for existing connections (including
 * long-lived WebSocket/SSE ones) to end on their own before its callback
 * fires. For tests that stop and restart the dev server repeatedly, track
 * raw sockets per server and destroy them on stop() so close() resolves
 * promptly instead of hanging until a client disconnects.
 */
function trackSockets(server)
{
	var sockets = [];

	server.on('connection', function(socket)
	{
		sockets.push(socket);

		socket.on('close', function()
		{
			var idx = sockets.indexOf(socket);

			if (idx >= 0)
			{
				sockets.splice(idx, 1);
			}
		});
	});

	return function destroyAll()
	{
		for (var i = 0; i < sockets.length; i++)
		{
			try { sockets[i].destroy(); } catch (e) {}
		}

		sockets = [];
	};
};

/**
 * @param opts {mqttWsPort, mqttTcpPort, wsPort, httpPort} - all optional,
 *             default to DEFAULT_PORTS; pass 0 for a random free port.
 */
function createServer(opts)
{
	opts = opts || {};
	var ports = {
		mqttWsPort: opts.mqttWsPort != null ? opts.mqttWsPort : DEFAULT_PORTS.mqttWsPort,
		mqttTcpPort: opts.mqttTcpPort != null ? opts.mqttTcpPort : DEFAULT_PORTS.mqttTcpPort,
		wsPort: opts.wsPort != null ? opts.wsPort : DEFAULT_PORTS.wsPort,
		httpPort: opts.httpPort != null ? opts.httpPort : DEFAULT_PORTS.httpPort
	};

	var aedes = Aedes();
	var mqttTcpServer = net.createServer(aedes.handle);
	var destroyMqttTcpSockets = trackSockets(mqttTcpServer);

	// --- MQTT over WebSocket -------------------------------------------
	var mqttWsHttpServer = http.createServer(function(req, res)
	{
		setCors(res);
		res.writeHead(404);
		res.end();
	});

	var destroyMqttWsSockets = trackSockets(mqttWsHttpServer);
	var mqttWss = new WebSocket.Server({server: mqttWsHttpServer});

	mqttWss.on('connection', function(ws)
	{
		var stream = WebSocket.createWebSocketStream(ws);
		stream.on('error', function() {}); // avoid unhandled 'error' crashing the process
		aedes.handle(stream);
	});

	// --- JSON WebSocket ---------------------------------------------------
	var jsonWsHttpServer = http.createServer(function(req, res)
	{
		setCors(res);
		res.writeHead(404);
		res.end();
	});

	var destroyJsonWsSockets = trackSockets(jsonWsHttpServer);
	var jsonWss = new WebSocket.Server({server: jsonWsHttpServer});
	var jsonClients = [];
	var wsSimState = {'Sim/Ws1': 0, 'Sim/Ws2': 0};

	jsonWss.on('connection', function(ws)
	{
		jsonClients.push(ws);

		ws.send(JSON.stringify(wsSimState));

		ws.on('message', function(msg)
		{
			// Echo writes back verbatim (as a JSON message if parseable, so
			// a source's write-then-read round trip has something to see).
			try
			{
				var data = JSON.parse(msg.toString());
				ws.send(JSON.stringify({echo: data}));
			}
			catch (e)
			{
				ws.send(JSON.stringify({echo: msg.toString()}));
			}
		});

		ws.on('close', function()
		{
			var idx = jsonClients.indexOf(ws);

			if (idx >= 0)
			{
				jsonClients.splice(idx, 1);
			}
		});

		ws.on('error', function() {});
	});

	var wsTimer = setInterval(function()
	{
		var t = Date.now() / 1000;
		wsSimState['Sim/Ws1'] = Math.round((50 + 50 * Math.sin(t / 5)) * 100) / 100;
		wsSimState['Sim/Ws2'] = Math.round((t % 100) * 100) / 100;

		var payload = JSON.stringify(wsSimState);

		for (var i = 0; i < jsonClients.length; i++)
		{
			if (jsonClients[i].readyState === WebSocket.OPEN)
			{
				jsonClients[i].send(payload);
			}
		}
	}, 500);

	// --- HTTP JSON + SSE ----------------------------------------------
	var httpTags = {'Http/Temp': 21.5, 'Http/Status': 'ok'};
	var sseClients = [];

	var httpServer = http.createServer(function(req, res)
	{
		setCors(res);

		var url = req.url.split('?')[0];

		if (req.method === 'OPTIONS')
		{
			res.writeHead(204);
			res.end();

			return;
		}

		if (url === '/tags' && req.method === 'GET')
		{
			res.writeHead(200, {'Content-Type': 'application/json'});
			res.end(JSON.stringify(httpTags));
		}
		else if (url === '/write' && req.method === 'POST')
		{
			readBody(req, function(body)
			{
				try
				{
					var data = JSON.parse(body);

					for (var k in data)
					{
						if (Object.prototype.hasOwnProperty.call(data, k))
						{
							httpTags[k] = data[k];
						}
					}

					res.writeHead(200, {'Content-Type': 'application/json'});
					res.end(JSON.stringify({ok: true, tags: httpTags}));
				}
				catch (e)
				{
					res.writeHead(400, {'Content-Type': 'application/json'});
					res.end(JSON.stringify({ok: false, error: 'invalid JSON body'}));
				}
			});
		}
		else if (url === '/sse' && req.method === 'GET')
		{
			res.writeHead(200, {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				'Connection': 'keep-alive'
			});
			res.write('\n');

			sseClients.push(res);

			req.on('close', function()
			{
				var idx = sseClients.indexOf(res);

				if (idx >= 0)
				{
					sseClients.splice(idx, 1);
				}
			});
		}
		else
		{
			res.writeHead(404);
			res.end();
		}
	});

	var destroyHttpSockets = trackSockets(httpServer);

	var httpTimer = setInterval(function()
	{
		var t = Date.now() / 1000;
		httpTags['Http/Temp'] = Math.round((21.5 + 3 * Math.sin(t / 8)) * 100) / 100;

		var payload = 'data: ' + JSON.stringify(httpTags) + '\n\n';

		for (var i = 0; i < sseClients.length; i++)
		{
			sseClients[i].write(payload);
		}
	}, 500);

	// --- MQTT data generator + write echo ------------------------------
	var t0 = Date.now();
	var pumpSpeedPhase = 0;

	function mqttPublish(topic, value)
	{
		aedes.publish({
			cmd: 'publish',
			topic: topic,
			payload: Buffer.from(String(value)),
			qos: 0,
			retain: false,
			dup: false
		}, function() {});
	};

	var genTimer = setInterval(function()
	{
		var t = (Date.now() - t0) / 1000;

		var tankLevel = Math.round((50 + 40 * Math.sin(t / 20)) * 100) / 100;
		var pumpRun = (Math.floor(t / 15) % 2 === 0);
		var pumpSpeed = pumpRun ? Math.round((1450 + 25 * Math.sin(t / 3)) * 100) / 100 : 0;
		var valveOpen = Math.round((50 + 45 * Math.abs(Math.sin(t / 10))) * 100) / 100;
		var boilerTemp = Math.round((180 + 15 * Math.sin(t / 25)) * 100) / 100;
		var boilerPressure = Math.round((4 + 1.5 * Math.sin(t / 25 + 1)) * 100) / 100;

		mqttPublish('plant/Tank1/Level', tankLevel);
		mqttPublish('plant/Pump1/Run', pumpRun ? 1 : 0);
		mqttPublish('plant/Pump1/Speed', pumpSpeed);
		mqttPublish('plant/Valve1/Open', valveOpen);
		mqttPublish('plant/Boiler/Temp', boilerTemp);
		mqttPublish('plant/Boiler/Pressure', boilerPressure);
	}, 500);

	aedes.on('publish', function(packet, client)
	{
		// Only echo writes from real clients (not our own generator, and
		// not aedes' internal $SYS messages), matching plant/<area>/<tag>/set.
		if (client == null || packet.topic.indexOf('$SYS') === 0)
		{
			return;
		}

		var m = /^plant\/([^/]+)\/([^/]+)\/set$/.exec(packet.topic);

		if (m != null)
		{
			var statusTopic = 'plant/' + m[1] + '/' + m[2];

			aedes.publish({
				cmd: 'publish',
				topic: statusTopic,
				payload: packet.payload,
				qos: 0,
				retain: false,
				dup: false
			}, function() {});
		}
	});

	var started = false;

	function start()
	{
		if (started)
		{
			return Promise.reject(new Error('server already started'));
		}

		started = true;

		return new Promise(function(resolve, reject)
		{
			var pending = 4;
			var failed = false;

			function onError(err)
			{
				if (!failed)
				{
					failed = true;
					reject(err);
				}
			};

			function onListening()
			{
				pending--;

				if (pending === 0 && !failed)
				{
					resolve({
						mqttWsPort: mqttWsHttpServer.address().port,
						mqttTcpPort: mqttTcpServer.address().port,
						wsPort: jsonWsHttpServer.address().port,
						httpPort: httpServer.address().port
					});
				}
			};

			mqttTcpServer.once('error', onError);
			mqttWsHttpServer.once('error', onError);
			jsonWsHttpServer.once('error', onError);
			httpServer.once('error', onError);

			mqttTcpServer.listen(ports.mqttTcpPort, onListening);
			mqttWsHttpServer.listen(ports.mqttWsPort, onListening);
			jsonWsHttpServer.listen(ports.wsPort, onListening);
			httpServer.listen(ports.httpPort, onListening);
		});
	};

	function stop()
	{
		clearInterval(wsTimer);
		clearInterval(httpTimer);
		clearInterval(genTimer);

		for (var i = 0; i < sseClients.length; i++)
		{
			try { sseClients[i].end(); } catch (e) {}
		}

		// Force-close any still-open connections (WebSocket upgrades, SSE
		// streams, keep-alive sockets) so server.close() below resolves
		// promptly instead of waiting for clients to disconnect on their own.
		destroyMqttTcpSockets();
		destroyMqttWsSockets();
		destroyJsonWsSockets();
		destroyHttpSockets();

		return new Promise(function(resolve)
		{
			var pending = 4;

			function done()
			{
				pending--;

				if (pending <= 0)
				{
					aedes.close(function() { resolve(); });
				}
			};

			mqttTcpServer.close(done);
			mqttWsHttpServer.close(done);
			jsonWsHttpServer.close(done);
			httpServer.close(done);
		});
	};

	return {
		start: start,
		stop: stop,
		aedes: aedes,
		ports: ports
	};
};

module.exports = {createServer: createServer};

if (require.main === module)
{
	var srv = createServer({});

	srv.start().then(function(ports)
	{
		console.log('HMI dev server listening:');
		console.log('  MQTT over WebSocket : ws://localhost:' + ports.mqttWsPort + '/mqtt');
		console.log('  MQTT (TCP)          : mqtt://localhost:' + ports.mqttTcpPort);
		console.log('  JSON WebSocket      : ws://localhost:' + ports.wsPort + '/');
		console.log('  HTTP JSON           : http://localhost:' + ports.httpPort + '/tags');
		console.log('  SSE                 : http://localhost:' + ports.httpPort + '/sse');
		console.log('Press Ctrl-C to stop.');
	}, function(err)
	{
		console.error('Failed to start HMI dev server:', err);
		process.exit(1);
	});

	process.on('SIGINT', function()
	{
		srv.stop().then(function() { process.exit(0); });
	});
}
