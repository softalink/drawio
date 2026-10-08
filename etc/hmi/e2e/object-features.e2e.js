// The "Object Features" page of templates/hmi/intouch_links_demo.xml at
// runtime: bindings, keyframes, event handlers, security, hover halo, object
// triggers and state machines, media, and the page trigger and page state
// machine. Also the link options added to the other pages: offset anchors,
// the remaining animation presets and flow types, and the right button and
// double-click script conditions.
// Run: node --test --test-concurrency=1 etc/hmi/e2e/object-features.e2e.js
var test = require('node:test');
var assert = require('node:assert');
var util = require('./util.js');

var path = require('path');
var fs = require('fs');

// Screenshots are written only if HMI_OF_SHOTS names a directory
var SHOTS = process.env.HMI_OF_SHOTS || null;
var demo = fs.readFileSync(path.join(util.WEBAPP, 'templates/hmi/intouch_links_demo.xml'), 'utf8');
var browser = null;
var web = null;
var runUrl = null;

test.before(async function()
{
	web = await util.startStatic(0);
	browser = await util.launch();
	var editor = await util.openEditor(browser, web.url);
	var url = await editor.evaluate(async function(xml)
	{
		var ui = Hmi.ui;
		ui.fileLoaded(new LocalFile(ui, xml, 'demo.drawio', true));
		await new Promise(function(r)
		{
			setTimeout(r, 500);
		});

		return Hmi.Plugin.getRunUrl(ui, false);
	}, demo);
	await editor.close();
	runUrl = url.substring(url.lastIndexOf('/'));
});

test.after(async function()
{
	await browser.close();
	web.server.close();
});

async function shot(page, name)
{
	if (SHOTS != null)
	{
		fs.mkdirSync(SHOTS, {recursive: true});
		await page.screenshot({path: path.join(SHOTS, name + '.png')});
	}
}

// Opens the run screen on the given page with the simulator stopped
async function openPage(name, query)
{
	var page = await browser.newPage({viewport: {width: 1400, height: 900}});
	page.hmiErrors = [];
	page.on('pageerror', function(e)
	{
		page.hmiErrors.push(e.message);
	});
	var hash = runUrl.indexOf('#');
	await page.goto(web.url + runUrl.substring(0, hash) + (query || '') + runUrl.substring(hash));
	await page.waitForFunction(function()
	{
		try
		{
			return Hmi.Viewer.instances[0].isRunning();
		}
		catch (e)
		{
			return false;
		}
	}, null, {timeout: 60000});
	await page.evaluate(async function(name)
	{
		window.rt = function()
		{
			return Hmi.Viewer.instances[0].getRuntime();
		};
		var ui = rt().ui;

		for (var i = 0; i < ui.pages.length; i++)
		{
			if (ui.pages[i].getName() == name)
			{
				ui.selectPage(ui.pages[i]);
			}
		}

		await new Promise(function(r)
		{
			setTimeout(r, 500);
		});
		rt().simulator.stop();
	}, name);
	await page.waitForTimeout(300);

	return page;
}

function set(page, values, ms)
{
	return page.evaluate(async function(args)
	{
		rt().setValues(args.values);
		await new Promise(function(r)
		{
			setTimeout(r, args.ms);
		});
	}, {values: values, ms: ms || 200});
}

function get(page, tag)
{
	return page.evaluate(function(tag)
	{
		return rt().tags.getValue(tag);
	}, tag);
}

function waitFor(page, fn, arg, timeout)
{
	return page.waitForFunction(fn, arg, {timeout: timeout || 5000});
}

function cellState(page, id)
{
	return page.evaluate(function(id)
	{
		var r = rt();
		var cell = r.graph.model.getCell(id);
		var state = r.graph.view.getState(cell);
		var node = (state != null && state.shape != null) ? state.shape.node : null;

		return {
			label: r.overlay.getMerged(id, 'label'),
			tooltip: r.overlay.getMerged(id, 'tooltip'),
			visible: r.overlay.getVisible(cell),
			geo: r.overlay.getGeo(id),
			style: (state != null) ? state.style : null,
			animation: (node != null) ? node.style.animation : '',
			halo: (node != null) ? node.getAttribute('data-hmi-halo') : null
		};
	}, id);
}

function center(page, id)
{
	return page.evaluate(function(id)
	{
		var state = rt().graph.view.getState(rt().graph.model.getCell(id));
		var b = state.shape.node.getBoundingClientRect();

		return {x: b.left + b.width / 2, y: b.top + b.height / 2};
	}, id);
}

async function click(page, id, options)
{
	var c = await center(page, id);
	await page.mouse.click(c.x, c.y, options);
}

function upper(v)
{
	return String(v).toUpperCase();
}

test('demo template: the Object Features page runs', async function()
{
	var page = await openPage('Object Features');

	try
	{
		assert.strictEqual(await page.evaluate(function()
		{
			return rt().ui.currentPage.getName();
		}), 'Object Features');
		await set(page, {Level: 85, Angle: 25, Pressure: 50, HighAlarm: false, Status: 0, Temp: 50,
			MediaOn: false, EvClicks: 0, Presses: 0}, 800);
		await shot(page, 'object-features');

		// Bindings: label with format, colour map, level, tooltip expression, rotation
		var b = await cellState(page, 'itd-of-bind-label');
		assert.strictEqual(b.label, '85.0');
		assert.strictEqual(upper(b.style.fillColor), '#EF9A9A');
		await set(page, {Level: 60});
		assert.strictEqual(upper((await cellState(page, 'itd-of-bind-label')).style.fillColor), '#FFE082');
		var tank = await cellState(page, 'itd-of-bind-tank');
		assert.strictEqual(parseFloat(tank.style.hmiLevel), 60);
		assert.strictEqual(tank.tooltip, 'Level 60 %');
		assert.strictEqual(parseFloat((await cellState(page, 'itd-of-bind-rotate')).style.rotation), 90);

		// Keyframes: the autoplay animation moves the box, the button plays the chain
		await waitFor(page, function()
		{
			var g = rt().overlay.getGeo('itd-of-key-patrol');

			return g != null && Math.abs(g.dx) > 5;
		});
		var before = await page.evaluate(function()
		{
			return rt().overlay.getGeo('itd-of-key-chain');
		});
		await click(page, 'itd-of-key-play');
		await waitFor(page, function(before)
		{
			var g = rt().overlay.getGeo('itd-of-key-chain');

			return g != null && JSON.stringify(g) != before;
		}, JSON.stringify(before));

		// Event handlers: click, enter / leave, message with a delayed action
		await click(page, 'itd-of-ev-click');
		await page.waitForTimeout(500);
		await click(page, 'itd-of-ev-click');
		await waitFor(page, function()
		{
			return rt().tags.getValue('EvClicks') == 2;
		});
		await waitFor(page, function()
		{
			return rt().overlay.getMerged('itd-of-ev-count', 'label') == 'Clicks: 2';
		});
		var hc = await center(page, 'itd-of-ev-hover');
		await page.mouse.move(hc.x, hc.y);
		await waitFor(page, function()
		{
			return rt().overlay.getMerged('itd-of-ev-hover', 'label') == 'Inside';
		});
		await page.mouse.move(hc.x, hc.y - 70);
		await waitFor(page, function()
		{
			return rt().overlay.getMerged('itd-of-ev-hover', 'label') == 'Outside';
		});
		await click(page, 'itd-of-ev-emit');
		await waitFor(page, function()
		{
			return rt().overlay.getMerged('itd-of-ev-message', 'label') == 'Ping received';
		});
		await waitFor(page, function()
		{
			return rt().overlay.getMerged('itd-of-ev-message', 'label') == 'Waiting';
		});

		// Security without a role: hidden, disabled, open
		assert.strictEqual((await cellState(page, 'itd-of-sec-hide')).visible, false);
		assert.strictEqual(String((await cellState(page, 'itd-of-sec-disable')).style.opacity), '40');
		await click(page, 'itd-of-sec-disable');
		await page.waitForTimeout(300);
		assert.strictEqual(await get(page, 'Presses'), 0);
		await click(page, 'itd-of-sec-open');
		await waitFor(page, function()
		{
			return rt().tags.getValue('Presses') == 1;
		});

		// Hover halo: per object styles, off
		var halo = async function(id)
		{
			var c = await center(page, id);
			await page.mouse.move(c.x, c.y);
			await page.waitForTimeout(150);

			return page.evaluate(function(id)
			{
				var state = rt().graph.view.getState(rt().graph.model.getCell(id));

				return {attr: state.shape.node.getAttribute('data-hmi-halo'),
					filter: state.shape.node.style.filter || '',
					outline: document.querySelectorAll('[data-hmi-halo-outline]').length};
			}, id);
		};
		assert.strictEqual((await halo('itd-of-halo-glow')).attr, 'hover');
		assert.strictEqual((await halo('itd-of-halo-off')).attr, null);
		assert.strictEqual((await halo('itd-of-halo-shape')).attr, 'hover');
		await page.mouse.move(5, 5);

		// Object trigger: or-conditions with an on delay, else actions
		await set(page, {Pressure: 80}, 700);
		var tp = await cellState(page, 'itd-of-trig-pressure');
		assert.strictEqual(upper(tp.style.strokeColor), '#E53935');
		assert.match(tp.animation, /hmi-blink/);
		await set(page, {Pressure: 50}, 400);
		tp = await cellState(page, 'itd-of-trig-pressure');
		assert.strictEqual(upper(tp.style.strokeColor), '#90A4AE');
		assert.strictEqual(tp.animation, '');
		await set(page, {Pressure: 20}, 700);
		assert.strictEqual(upper((await cellState(page, 'itd-of-trig-pressure')).style.strokeColor), '#E53935');
		await set(page, {HighAlarm: true});
		assert.strictEqual((await cellState(page, 'itd-of-trig-alarm')).label, 'ALARM');
		await set(page, {HighAlarm: false});
		assert.strictEqual((await cellState(page, 'itd-of-trig-alarm')).label, 'normal');

		// Object state machines
		assert.strictEqual((await cellState(page, 'itd-of-sm-status')).label, 'STOPPED');
		await set(page, {Status: 2});
		assert.strictEqual((await cellState(page, 'itd-of-sm-status')).label, 'WARNING');
		await set(page, {Status: 3});
		assert.strictEqual(upper((await cellState(page, 'itd-of-sm-status')).style.fillColor), '#E53935');
		assert.strictEqual((await cellState(page, 'itd-of-sm-temp')).label, 'Temp: normal');
		await set(page, {Temp: 10});
		assert.strictEqual((await cellState(page, 'itd-of-sm-temp')).label, 'Temp: cold');

		// Page trigger with on and off delays
		await set(page, {Temp: 90}, 900);
		assert.strictEqual((await cellState(page, 'itd-of-ptrig-banner')).label, 'Temp high: check cooling');
		assert.strictEqual((await cellState(page, 'itd-of-sm-temp')).label, 'Temp: hot');
		await set(page, {Temp: 79}, 900);
		assert.strictEqual((await cellState(page, 'itd-of-ptrig-banner')).label, 'Temp high: check cooling',
			'deadband');
		await set(page, {Temp: 50}, 900);
		assert.strictEqual((await cellState(page, 'itd-of-ptrig-banner')).label, 'Temp normal');

		// Page state machine
		await set(page, {Level: 10});
		assert.strictEqual((await cellState(page, 'itd-of-psm-band')).label, 'Level band: LOW');
		assert.strictEqual(upper((await cellState(page, 'itd-of-psm-low')).style.fillColor), '#42A5F5');
		await set(page, {Level: 90});
		assert.strictEqual((await cellState(page, 'itd-of-psm-band')).label, 'Level band: HIGH');
		assert.strictEqual(upper((await cellState(page, 'itd-of-psm-high')).style.fillColor), '#EF5350');
		assert.strictEqual(upper((await cellState(page, 'itd-of-psm-low')).style.fillColor), '#CFD8DC');

		// Media: the audio plays while MediaOn, Stop rewinds
		var audio = function()
		{
			return page.evaluate(function()
			{
				var state = rt().graph.view.getState(rt().graph.model.getCell('itd-of-media-audio'));
				var a = (state.text != null) ? state.text.node.querySelector('audio') : null;

				return (a == null) ? null : {paused: a.paused, muted: a.muted, time: a.currentTime};
			});
		};
		var a = await audio();
		assert.ok(a != null, 'audio element');
		assert.strictEqual(a.paused, true);
		await click(page, 'itd-of-media-toggle');
		await waitFor(page, function()
		{
			var state = rt().graph.view.getState(rt().graph.model.getCell('itd-of-media-audio'));
			var a = state.text.node.querySelector('audio');

			return !a.paused && a.currentTime > 0;
		});
		assert.strictEqual((await cellState(page, 'itd-of-media-state')).label, 'PLAYING');
		await click(page, 'itd-of-media-stop');
		await waitFor(page, function()
		{
			var state = rt().graph.view.getState(rt().graph.model.getCell('itd-of-media-audio'));
			var a = state.text.node.querySelector('audio');

			return a.paused && a.currentTime == 0;
		});
		assert.strictEqual(await get(page, 'MediaOn'), false);
		await shot(page, 'object-features-after');
		assert.deepStrictEqual(page.hmiErrors, []);
	}
	finally
	{
		await page.close();
	}
});

test('demo template: security with the engineer and operator roles', async function()
{
	var page = await openPage('Object Features', '&hmi-role=engineer,operator');

	try
	{
		assert.notStrictEqual((await cellState(page, 'itd-of-sec-hide')).visible, false);
		assert.notStrictEqual(String((await cellState(page, 'itd-of-sec-disable')).style.opacity), '40');
		await set(page, {Presses: 0});
		await click(page, 'itd-of-sec-hide');
		await click(page, 'itd-of-sec-disable');
		await waitFor(page, function()
		{
			return rt().tags.getValue('Presses') == 2;
		});
		assert.deepStrictEqual(page.hmiErrors, []);
	}
	finally
	{
		await page.close();
	}
});

test('demo template: offset anchors of Object Size', async function()
{
	var page = await openPage('Display Links');

	try
	{
		await set(page, {Level: 42.25}, 300);
		await shot(page, 'display-offsets');
		var pct = (10 + 0.4225 * 90) / 100;
		var sh = (await cellState(page, 'itd-size-height-offset')).geo;
		assert.ok(Math.abs(sh.dh - (100 * pct - 100)) < 0.01 && Math.abs(sh.dy + sh.dh * 0.25) < 0.01,
			'height offset ' + JSON.stringify(sh));
		var sw = (await cellState(page, 'itd-size-width-offset')).geo;
		pct = (5 + 0.4225 * 95) / 100;
		assert.ok(Math.abs(sw.dw - (100 * pct - 100)) < 0.01 && Math.abs(sw.dx + sw.dw * 0.75) < 0.01,
			'width offset ' + JSON.stringify(sw));
		var sc = (await cellState(page, 'itd-size-scale-offset')).geo;
		var d = 32 * (40 + 0.4225 * 80) / 100 - 32;
		assert.ok(Math.abs(sc.dw - d) < 0.01 && Math.abs(sc.dx + d * 0.25) < 0.01 &&
			Math.abs(sc.dy + d * 0.25) < 0.01, 'scale offset ' + JSON.stringify(sc));
		assert.deepStrictEqual(page.hmiErrors, []);
	}
	finally
	{
		await page.close();
	}
});

test('demo template: animation presets and flow types', async function()
{
	var page = await openPage('meta2d Extensions');

	try
	{
		await set(page, {Animate: true, Pump: true, Temp: 90, FlowOn: true, Level: 25}, 400);
		await shot(page, 'meta2d-presets');
		assert.match((await cellState(page, 'itd-m2d-pulse')).animation, /hmi-pulse/);
		assert.match((await cellState(page, 'itd-m2d-pulse')).animation, /667ms/);
		assert.match((await cellState(page, 'itd-m2d-shake')).animation, /hmi-shake/);
		assert.match((await cellState(page, 'itd-m2d-fade')).animation, /hmi-fade/);
		assert.match((await cellState(page, 'itd-m2d-blink')).animation, /hmi-blink/);
		assert.match((await cellState(page, 'itd-m2d-blink')).animation, /1500ms/);

		// Colour cycle and custom keyframes run per frame
		await waitFor(page, function()
		{
			var s = rt().graph.view.getState(rt().graph.model.getCell('itd-m2d-colorcycle'));

			return s != null && String(s.style.fillColor).toUpperCase() != '#FFFFFF';
		});
		await waitFor(page, function()
		{
			var s = rt().graph.view.getState(rt().graph.model.getCell('itd-m2d-custom'));

			return s != null && Math.abs(parseFloat(s.style.rotation || 0)) > 1;
		});

		// Shake only while Temp > 80
		await set(page, {Temp: 50});
		assert.strictEqual((await cellState(page, 'itd-m2d-shake')).animation, '');

		var types = {'itd-m2d-flow': 'dash', 'itd-m2d-flow-dots': 'dots', 'itd-m2d-flow-beads': 'beads',
			'itd-m2d-flow-arrows': 'arrows', 'itd-m2d-flow-liquid': 'liquid'};

		for (var id in types)
		{
			var st = (await cellState(page, id)).style;
			assert.strictEqual(String(st.flowAnimation), '1', id);
			assert.strictEqual(st.flowAnimationType, types[id], id);
		}

		await set(page, {FlowOn: false});
		assert.strictEqual(String((await cellState(page, 'itd-m2d-flow-liquid')).style.flowAnimation), '0');
		assert.deepStrictEqual(page.hmiErrors, []);
	}
	finally
	{
		await page.close();
	}
});

test('demo template: right button and double-click scripts', async function()
{
	var page = await openPage('Touch Links');

	try
	{
		await set(page, {Doubles: 0, RightClicks: 0, RightHeld: 0, RightDoubles: 0, LastClick: 'none'});
		await shot(page, 'touch-right');
		var dc = await center(page, 'itd-action-double');
		await page.mouse.dblclick(dc.x, dc.y);
		await waitFor(page, function()
		{
			return rt().tags.getValue('Doubles') >= 1;
		});
		assert.strictEqual(await get(page, 'LastClick'), 'left double');

		// Right press, hold and release
		var c = await center(page, 'itd-action-right');
		await page.mouse.move(c.x, c.y);
		await page.mouse.down({button: 'right'});
		await waitFor(page, function()
		{
			return rt().tags.getValue('RightClicks') == 1 && rt().tags.getValue('LastClick') == 'right down';
		});
		await page.waitForTimeout(700);
		await page.mouse.up({button: 'right'});
		await waitFor(page, function()
		{
			return rt().tags.getValue('LastClick') == 'right up';
		});
		assert.ok(await get(page, 'RightHeld') >= 2, 'while right down');
		var held = await get(page, 'RightHeld');
		await page.waitForTimeout(500);
		assert.strictEqual(await get(page, 'RightHeld'), held, 'stops on release');

		// Right double-click
		await page.waitForTimeout(600);
		await page.mouse.click(c.x, c.y, {button: 'right'});
		await page.mouse.click(c.x, c.y, {button: 'right'});
		await waitFor(page, function()
		{
			return rt().tags.getValue('RightDoubles') == 1;
		});
		await waitFor(page, function()
		{
			return /RD=1/.test(rt().overlay.getMerged('itd-action-right-value', 'label'));
		});
		assert.deepStrictEqual(page.hmiErrors, []);
	}
	finally
	{
		await page.close();
	}
});
