// End-to-end tests for the HMI runtime (SRS §7).
// Run: node --test --test-concurrency=1 etc/hmi/e2e/
// Requires: etc/hmi/dev dependencies installed (npm install in etc/hmi/dev).
var test = require('node:test');
var assert = require('node:assert');
var path = require('path');
var util = require('./util.js');

var dev = require(path.resolve(__dirname, '../dev/server.js'));

var browser = null;
var web = null;
var devServer = null;
var ports = null;

test.before(async function()
{
	web = await util.startStatic(0);
	browser = await util.launch();
	devServer = dev.createServer({mqttWsPort: 0, mqttTcpPort: 0, wsPort: 0, httpPort: 0,
		interval: 200, quiet: true});
	ports = await devServer.start();
});

test.after(async function()
{
	if (browser != null)
	{
		await browser.close();
	}

	if (devServer != null)
	{
		await devServer.stop();
	}

	if (web != null)
	{
		web.server.close();
	}
});

// Creates a simulated demo page in the editor and returns ids
function setupSimPage(page)
{
	return page.evaluate(function()
	{
		var ui = Hmi.ui;
		var graph = ui.editor.graph;
		var model = graph.model;
		var parent = graph.getDefaultParent();
		model.beginUpdate();

		try
		{
			var tank = graph.insertVertex(parent, 'tank1', '', 100, 100, 80, 160,
				'shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;size=15;');
			var label = graph.insertVertex(parent, 'lbl1', '', 220, 100, 120, 40, 'text;html=1;');
			var a = graph.insertVertex(parent, 'a', 'A', 100, 350, 60, 40);
			var b = graph.insertVertex(parent, 'b', 'B', 400, 350, 60, 40);
			var pipe = graph.insertEdge(parent, 'pipe1', '', a, b,
				'endArrow=none;strokeWidth=10;flowAnimation=1;flowAnimationType=dots;');
			Hmi.Model.setDocConfig(graph, {version: 1, sim: 'only', sources: [], triggers: [],
				tags: [{name: 'T1', type: 'number', unit: '%', decimals: 1,
					sim: {kind: 'sine', min: 10, max: 90, period: 3000, interval: 100}},
				{name: 'Run', type: 'boolean', sim: {kind: 'toggle', period: 500, interval: 500}}]});
			Hmi.Model.setCellConfig(graph, [tank], 'bindings', [{tag: 'T1', target: 'style:hmiLevel'}]);
			Hmi.Model.setCellConfig(graph, [label], 'bindings', [{tag: 'T1', target: 'label',
				format: {decimals: 1}}]);
			Hmi.Model.setCellConfig(graph, [tank], 'triggers', [{states: [
				{name: 'high', conditions: [{tag: 'T1', operator: '>=', value: 50}],
					actions: [{type: 'setProps', target: 'self', style: {strokeColor: '#FF0000'}}]},
				{name: 'normal', conditions: [], actions: [{type: 'setProps', target: 'self',
					style: {strokeColor: '#00AA00'}}]}]}]);
			Hmi.Model.setCellConfig(graph, [tank], 'animations', [{name: 'blink',
				preset: 'blink', autoPlay: true}]);
			Hmi.Model.setCellConfig(graph, [pipe], 'bindings', [{tag: 'Run',
				target: 'style:flowAnimation'}]);
		}
		finally
		{
			model.endUpdate();
		}
	});
}

test('runtime state never reaches the model (isolation)', async function()
{
	var page = await util.openEditor(browser, web.url);
	await setupSimPage(page);

	var result = await page.evaluate(async function()
	{
		var ui = Hmi.ui;
		var graph = ui.editor.graph;
		ui.editor.setModified(false);
		var xmlBefore = mxUtils.getXml(ui.editor.getGraphXml());
		var undoBefore = ui.editor.undoManager.history.length;
		var svgBefore = graph.view.getState(graph.model.getCell('tank1')).shape.node.innerHTML;

		ui.hmi.run({mode: 'preview', sim: 'only'});
		var levels = {};
		var strokes = {};

		for (var i = 0; i < 20; i++)
		{
			await new Promise(function(r)
			{
				setTimeout(r, 150);
			});
			var st = graph.view.getState(graph.model.getCell('tank1'));
			levels[st.style.hmiLevel] = true;
			strokes[st.style.strokeColor] = true;
		}

		var labelText = graph.view.getState(graph.model.getCell('lbl1')).text.value;
		ui.hmi.stop();

		return {
			levels: Object.keys(levels).length,
			strokes: Object.keys(strokes),
			label: labelText,
			sameXml: xmlBefore == mxUtils.getXml(ui.editor.getGraphXml()),
			undo: [undoBefore, ui.editor.undoManager.history.length],
			modified: ui.editor.modified,
			sameSvg: svgBefore == graph.view.getState(graph.model.getCell('tank1')).shape.node.innerHTML,
			animation: graph.view.getState(graph.model.getCell('tank1')).shape.node.style.animation
		};
	});

	assert.ok(result.levels > 5, 'level changes over time');
	assert.ok(result.strokes.indexOf('#FF0000') >= 0 && result.strokes.indexOf('#00AA00') >= 0,
		'trigger states applied: ' + result.strokes);
	assert.match(result.label, /^\d+\.\d %$/);
	assert.ok(result.sameXml, 'XML unchanged');
	assert.deepStrictEqual(result.undo[0], result.undo[1], 'undo history unchanged');
	assert.strictEqual(result.modified, false, 'file not modified');
	assert.ok(result.sameSvg, 'design rendering restored');
	assert.strictEqual(result.animation, '', 'animations removed');
	assert.deepStrictEqual(page.hmiErrors, []);
	await page.close();
});

test('MQTT source drives bindings and switch writes publish', async function()
{
	var page = await util.openEditor(browser, web.url);

	var result = await page.evaluate(async function(port)
	{
		var ui = Hmi.ui;
		var graph = ui.editor.graph;
		var model = graph.model;
		var parent = graph.getDefaultParent();
		model.beginUpdate();

		try
		{
			var tank = graph.insertVertex(parent, 'tank', '', 100, 100, 80, 160,
				'shape=mxgraph.hmi.tank;');
			var sw = graph.insertVertex(parent, 'sw', '', 250, 100, 80, 40,
				'shape=mxgraph.hmi.switch;hmiConfirm=0;');
			Hmi.Model.setDocConfig(graph, {version: 1, sim: 'off', triggers: [],
				sources: [{id: 'm', name: 'Broker', type: 'mqtt', enabled: true,
					url: 'ws://127.0.0.1:' + port + '/mqtt',
					topics: [{filter: 'plant/#', qos: 0}],
					format: {kind: 'topic', template: 'plant/{tag}'}}],
				tags: [{name: 'Tank1/Level', type: 'number'},
					{name: 'Pump1/Run', type: 'boolean', access: 'rw',
						write: {source: 'm', topic: 'plant/Pump1/Run/set',
							payload: '${value}'}}]});
			Hmi.Model.setCellConfig(graph, [tank], 'bindings', [{tag: 'Tank1/Level',
				target: 'prop:value'}]);
			Hmi.Model.setCellConfig(graph, [sw], 'bindings', [{tag: 'Pump1/Run',
				target: 'prop:value'}]);
		}
		finally
		{
			model.endUpdate();
		}

		var rt = ui.hmi.run({mode: 'run', interactive: true});
		var start = Date.now();

		while (rt.tags.get('Tank1/Level') == null && Date.now() - start < 8000)
		{
			await new Promise(function(r)
			{
				setTimeout(r, 100);
			});
		}

		await new Promise(function(r)
		{
			setTimeout(r, 300);
		});

		var status = rt.sources.status()[0].state;
		var level = graph.view.getState(model.getCell('tank')).style.hmiValue;
		var before = rt.tags.getValue('Pump1/Run');

		// Clicks the switch through the event dispatcher
		rt.events.widgetClick(model.getCell('sw'));
		start = Date.now();

		while (rt.tags.getValue('Pump1/Run') === before && Date.now() - start < 5000)
		{
			await new Promise(function(r)
			{
				setTimeout(r, 50);
			});
		}

		var after = rt.tags.getValue('Pump1/Run');
		var audit = rt.writer.auditLog.map(function(e)
		{
			return e.tag + ':' + e.outcome;
		});
		ui.hmi.stop();

		return {status: status, level: level, before: before, after: after, audit: audit};
	}, ports.mqttWsPort);

	assert.strictEqual(result.status, 'connected');
	assert.ok(parseFloat(result.level) > 0, 'tank value bound: ' + result.level);
	assert.notStrictEqual(result.after, result.before, 'switch write echoed back');
	assert.ok(result.audit.length > 0 && /^Pump1\/Run:/.test(result.audit[0]));
	assert.deepStrictEqual(page.hmiErrors, []);
	await page.close();
});

test('events: click navigates pages and emits messages', async function()
{
	var page = await util.openEditor(browser, web.url);

	var result = await page.evaluate(async function()
	{
		var ui = Hmi.ui;
		var graph = ui.editor.graph;
		var model = graph.model;
		var first = ui.currentPage;
		var second = ui.insertPage();
		second.setName('Detail');
		ui.selectPage(first);
		var parent = graph.getDefaultParent();
		var btn, lamp;
		model.beginUpdate();

		try
		{
			btn = graph.insertVertex(parent, 'btn', 'Go', 50, 50, 80, 40);
			lamp = graph.insertVertex(parent, 'lamp', '', 200, 50, 40, 40, 'ellipse;');
			Hmi.Model.setCellConfig(graph, [btn], 'events', [
				{on: 'click', actions: [{type: 'emit', name: 'hello', payload: 'x'},
					{type: 'navigate', page: 'Detail', delay: 200}]}]);
			Hmi.Model.setCellConfig(graph, [lamp], 'events', [
				{on: 'message', message: 'hello', actions: [{type: 'setProps', target: 'self',
					style: {fillColor: '#00FF00'}}]}]);
		}
		finally
		{
			model.endUpdate();
		}

		var rt = ui.hmi.run({mode: 'run', interactive: true});
		var messages = [];
		rt.on('message', function(m)
		{
			messages.push(m.name);
		});
		await new Promise(function(r)
		{
			setTimeout(r, 1200);
		});
		rt.events.fire(model.getCell('btn'), 'click');
		await new Promise(function(r)
		{
			setTimeout(r, 100);
		});
		rt.frame();
		var fill = graph.view.getState(model.getCell('lamp')).style.fillColor;
		await new Promise(function(r)
		{
			setTimeout(r, 500);
		});
		var pageName = ui.currentPage.getName();
		ui.hmi.stop();

		return {messages: messages, fill: fill, page: pageName};
	});

	assert.deepStrictEqual(result.messages, ['hello']);
	assert.strictEqual(result.fill, '#00FF00');
	assert.strictEqual(result.page, 'Detail');
	assert.deepStrictEqual(page.hmiErrors, []);
	await page.close();
});

test('security: script policy off and endpoint allow-list', async function()
{
	var page = await util.openEditor(browser, web.url);

	var result = await page.evaluate(async function(port)
	{
		window.DRAWIO_CONFIG = window.DRAWIO_CONFIG || {};
		DRAWIO_CONFIG.hmi = {scripts: 'off', allowedEndpoints: ['ws://allowed.example/']};
		var ui = Hmi.ui;
		var graph = ui.editor.graph;
		Hmi.Model.setDocConfig(graph, {version: 1, sim: 'off', triggers: [], tags: [],
			sources: [{id: 'm', name: 'Broker', type: 'mqtt', enabled: true,
				url: 'ws://127.0.0.1:' + port + '/mqtt', topics: [{filter: '#', qos: 0}]}]});
		var rt = ui.hmi.run({mode: 'run', interactive: true});
		var scriptError = null;

		try
		{
			await rt.runScript('return 1;', {}, null);
		}
		catch (e)
		{
			scriptError = e.message;
		}

		await new Promise(function(r)
		{
			setTimeout(r, 500);
		});
		var status = rt.sources.status()[0];
		var logText = JSON.stringify(rt.diag.log) + JSON.stringify(rt.sources.recent('m'));
		ui.hmi.stop();
		delete DRAWIO_CONFIG.hmi;

		return {scriptError: scriptError, state: status.state, lastError: status.lastError,
			logText: logText};
	}, ports.mqttWsPort);

	assert.match(result.scriptError, /disabled/i);
	assert.strictEqual(result.state, 'error');
	assert.match(result.lastError, /not allowed/i);
	await page.close();
});

test('embed API: host values and messages', async function()
{
	var page = await util.openEditor(browser, web.url);

	var result = await page.evaluate(async function()
	{
		var ui = Hmi.ui;
		var graph = ui.editor.graph;
		var parent = graph.getDefaultParent();
		var cell = graph.insertVertex(parent, 'v', '', 50, 50, 100, 40);
		Hmi.Model.setDocConfig(graph, {version: 1, sim: 'off', triggers: [], tags: [],
			sources: [{id: 'h', name: 'Host', type: 'host', enabled: true}]});
		Hmi.Model.setCellConfig(graph, [cell], 'bindings', [{tag: 'Speed', target: 'label',
			format: {decimals: 0}}]);
		ui.hmi.handleMessage({action: 'hmiRun'});
		ui.hmi.handleMessage({action: 'hmiSetValues', values: {Speed: 1234.4}});
		var rt = ui.hmi.getRuntime();
		rt.frame();
		var label = graph.view.getState(cell).text.value;
		var handled = ui.hmi.handleMessage({action: 'unknown'});
		ui.hmi.handleMessage({action: 'hmiStop'});

		return {label: label, handled: handled, running: ui.hmi.isRunning()};
	});

	assert.strictEqual(result.label, '1234');
	assert.strictEqual(result.handled, false);
	assert.strictEqual(result.running, false);
	await page.close();
});

test('HMI files open in draw.io without the plugin', async function()
{
	// Builds an HMI file with the plugin, then opens it without
	var page = await util.openEditor(browser, web.url);
	await setupSimPage(page);
	var xml = await page.evaluate(function()
	{
		return mxUtils.getXml(Hmi.ui.editor.getGraphXml());
	});
	await page.close();

	var plain = await browser.newPage();
	var errors = [];
	plain.on('pageerror', function(e)
	{
		errors.push(e.message);
	});
	await plain.goto(web.url + '/index.html?dev=1&' + util.APP_PARAMS, {waitUntil: 'load'});
	await plain.waitForFunction(function()
	{
		return window.App != null && document.querySelector('.geDiagramContainer') != null;
	}, null, {timeout: 60000});
	await plain.waitForTimeout(1500);

	var result = await plain.evaluate(async function(xml)
	{
		// Draw.loadPlugin is the supported way to reach the EditorUi instance
		var ui = await new Promise(function(resolve)
		{
			Draw.loadPlugin(resolve);
		});
		ui.editor.setGraphXml(mxUtils.parseXml(xml).documentElement);
		var graph = ui.editor.graph;
		var tank = graph.model.getCell('tank1');
		var state = graph.view.getState(tank);

		return {hasHmi: window.Hmi != null, rendered: state != null && state.shape != null,
			level: (state != null) ? state.style.hmiLevel : null,
			edges: graph.model.getCell('pipe1') != null};
	}, xml);

	assert.strictEqual(result.rendered, true);
	assert.strictEqual(result.edges, true);
	assert.strictEqual(result.level, undefined);
	assert.strictEqual(result.hasHmi, false);
	assert.deepStrictEqual(errors, []);
	await plain.close();
});

test('alarms: indicator preset, system tags and acknowledgement', async function()
{
	var page = await util.openEditor(browser, web.url);

	var result = await page.evaluate(async function()
	{
		var ui = Hmi.ui;
		var graph = ui.editor.graph;
		var parent = graph.getDefaultParent();
		var tank = graph.insertVertex(parent, 'tank', '', 50, 50, 80, 120,
			'shape=cylinder3;hmiAlarmIndicator=1;');
		var banner = graph.insertVertex(parent, 'banner', '', 200, 50, 300, 60,
			'shape=mxgraph.hmi.alarmBanner;');
		var count = graph.insertVertex(parent, 'count', '', 200, 150, 80, 30, 'text;html=1;');
		Hmi.Model.setDocConfig(graph, {version: 1, sim: 'off', triggers: [],
			sources: [{id: 'h', name: 'Host', type: 'host', enabled: true}],
			tags: [{name: 'Level', type: 'number', alarms: {hi: 80, deadband: 2,
				messages: {hi: 'Tank level high'}}}]});
		Hmi.Model.setCellConfig(graph, [tank], 'bindings', [{tag: 'Level', target: 'style:hmiLevel'}]);
		Hmi.Model.setCellConfig(graph, [banner], 'bindings', [{tag: '$alarms', target: 'prop:value'}]);
		Hmi.Model.setCellConfig(graph, [count], 'bindings', [{tag: '$alarmCount', target: 'label'}]);
		var rt = ui.hmi.run({mode: 'run', interactive: true});
		var wait = function(ms)
		{
			return new Promise(function(r)
			{
				setTimeout(r, ms);
			});
		};

		rt.setValues({Level: 90});
		await wait(200);
		rt.frame();
		var st = graph.view.getState(tank);
		var active = {stroke: st.style.strokeColor, blink: st.shape.node.style.animation,
			banner: graph.view.getState(banner).style.hmiValue,
			count: graph.view.getState(count).text.value};

		rt.alarms.ack();
		await wait(100);
		rt.frame();
		st = graph.view.getState(tank);
		var acked = {stroke: st.style.strokeColor, blink: st.shape.node.style.animation};

		rt.setValues({Level: 50});
		await wait(200);
		rt.frame();
		st = graph.view.getState(tank);
		var cleared = {stroke: st.style.strokeColor, count: graph.view.getState(count).text.value};
		ui.hmi.stop();

		return {active: active, acked: acked, cleared: cleared};
	});

	assert.strictEqual(result.active.stroke, '#F57C00');
	assert.match(result.active.blink, /hmi-blink/);
	assert.match(result.active.banner, /Tank level high/);
	assert.strictEqual(result.active.count, '1');
	assert.strictEqual(result.acked.stroke, '#F57C00');
	assert.strictEqual(result.acked.blink, '');
	assert.notStrictEqual(result.cleared.stroke, '#F57C00');
	assert.strictEqual(result.cleared.count, '0');
	await page.close();
});

test('security: script sandbox has no network or DOM access', async function()
{
	var page = await util.openEditor(browser, web.url);

	var result = await page.evaluate(async function()
	{
		var host = new Hmi.ScriptHost({policy: 'on', timeout: 500});
		var probes = {
			fetch: 'return typeof fetch',
			xhr: 'return typeof XMLHttpRequest',
			ws: 'return typeof WebSocket',
			importScripts: 'return typeof importScripts',
			document: 'return typeof document',
			viaFunction: 'return (new Function("return typeof fetch"))()',
			viaPrototype: 'var o = self; while (o) { if (o.fetch) return "found"; ' +
				'o = Object.getPrototypeOf(o); } return "undefined"',
			works: 'return args.x * 2'
		};
		var out = {};

		for (var key in probes)
		{
			try
			{
				out[key] = await host.run(probes[key], {x: 21}, {});
			}
			catch (e)
			{
				out[key] = 'error: ' + e.message;
			}
		}

		try
		{
			await host.run('while (true) {}', {}, {});
		}
		catch (e)
		{
			out.loop = e.message;
		}

		out.afterLoop = await host.run('return 1', {}, {});
		host.terminate();

		return out;
	});

	assert.deepStrictEqual(result, {fetch: 'undefined', xhr: 'undefined', ws: 'undefined',
		importScripts: 'undefined', document: 'undefined', viaFunction: 'undefined',
		viaPrototype: 'undefined', works: 42, loop: result.loop, afterLoop: 1});
	assert.match(result.loop, /timeout/i);
	await page.close();
});
