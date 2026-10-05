// InTouch animation links at runtime (plugins/hmi/INTOUCH_LINKS.md) with the
// templates/hmi/intouch_links_demo.xml template: display links with forced
// tag values, and touch links with real mouse and keyboard input, in the
// lightweight runtime (dev sources and bundle) and the full-app runtime.
// Run: node --test --test-concurrency=1 etc/hmi/e2e/links.e2e.js
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var util = require('./util.js');

var browser = null;
var web = null;
var demo = fs.readFileSync(path.join(util.WEBAPP, 'templates/hmi/intouch_links_demo.xml'), 'utf8');
var hasViewer = fs.existsSync(path.join(util.WEBAPP, 'js/hmi-viewer.min.js'));

test.before(async function()
{
	web = await util.startStatic(0);
	browser = await util.launch();
});

test.after(async function()
{
	await browser.close();
	web.server.close();
});

async function getRunUrl(fullApp, bundle)
{
	if (bundle)
	{
		process.env.HMI_E2E_BUNDLE = '1';
	}

	var editor = await util.openEditor(browser, web.url);
	delete process.env.HMI_E2E_BUNDLE;

	var url = await editor.evaluate(async function(args)
	{
		var ui = Hmi.ui;
		ui.fileLoaded(new LocalFile(ui, args.xml, 'links.drawio', true));
		await new Promise(function(r)
		{
			setTimeout(r, 500);
		});

		return Hmi.Plugin.getRunUrl(ui, args.fullApp);
	}, {xml: demo, fullApp: fullApp});
	await editor.close();

	return url.substring(url.lastIndexOf('/'));
}

async function openRuntime(url, apiExpr)
{
	var page = await browser.newPage({viewport: {width: 1400, height: 900}});
	page.hmiErrors = [];
	page.on('pageerror', function(e)
	{
		page.hmiErrors.push(e.message);
	});
	await page.goto(web.url + url);
	await page.waitForFunction(function(apiExpr)
	{
		try
		{
			var api = eval(apiExpr);

			return api != null && api.isRunning();
		}
		catch (e)
		{
			return false;
		}
	}, apiExpr, {timeout: 60000});

	// Deterministic values: stops the simulator, exposes the runtime
	await page.evaluate(function(apiExpr)
	{
		window.rt = function()
		{
			return eval(apiExpr).getRuntime();
		};
		rt().simulator.stop();
	}, apiExpr);
	await page.waitForTimeout(500);

	return page;
}

function set(page, values)
{
	return page.evaluate(async function(values)
	{
		rt().setValues(values);
		await new Promise(function(r)
		{
			setTimeout(r, 150);
		});
	}, values);
}

function get(page, tag)
{
	return page.evaluate(function(tag)
	{
		return rt().tags.getValue(tag);
	}, tag);
}

function waitTag(page, tag, fn, timeout)
{
	return page.waitForFunction(function(args)
	{
		return eval('(' + args.fn + ')')(rt().tags.getValue(args.tag));
	}, {tag: tag, fn: fn.toString()}, {timeout: timeout || 5000});
}

// Merged overlay data of a cell: label, style, geo, visible, tooltip
function cellState(page, id)
{
	return page.evaluate(function(id)
	{
		var r = rt();
		var cell = r.graph.model.getCell(id);
		var state = r.graph.view.getState(cell);

		return {
			label: r.overlay.getMerged(id, 'label'),
			tooltip: r.overlay.getMerged(id, 'tooltip'),
			visible: r.overlay.getVisible(cell),
			geo: r.overlay.getGeo(id),
			style: (state != null) ? state.style : null
		};
	}, id);
}

// Screen centre of a cell (optionally of a faceplate window runtime)
function center(page, id, windowIndex)
{
	return page.evaluate(function(args)
	{
		var r = (args.w != null) ? rt().ui.hmiWindows[args.w].wnd.hmiRuntime : rt();
		var state = r.graph.view.getState(r.graph.model.getCell(args.id));
		var b = state.shape.node.getBoundingClientRect();

		return {x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height};
	}, {id: id, w: windowIndex});
}

async function click(page, id, windowIndex)
{
	var c = await center(page, id, windowIndex);
	await page.mouse.click(c.x, c.y);
}

function selectPage(page, name)
{
	return page.evaluate(async function(name)
	{
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
			setTimeout(r, 300);
		});
		rt().simulator.stop();
	}, name);
}

async function displayScenario(page)
{
	await set(page, {Level: 42.25, Angle: 25, Pump: true, Mode: 'manual', Temp: 90,
		Pressure: 80, Flow: 10, HighAlarm: false, Show: true, Enable: true});

	// Value displays and formatting
	assert.strictEqual((await cellState(page, 'itd-value-discrete')).label, 'RUNNING');
	assert.strictEqual((await cellState(page, 'itd-value-analog')).label, 'Level = 42.3 %');
	assert.strictEqual((await cellState(page, 'itd-value-string')).label, 'Mode: MANUAL');
	assert.strictEqual((await cellState(page, 'itd-format-fixed')).label, '42.25');
	assert.strictEqual((await cellState(page, 'itd-format-hex')).label, '2A');
	assert.match((await cellState(page, 'itd-format-bin')).label, /^0*101010$/);
	assert.match((await cellState(page, 'itd-format-exp')).label, /^4\.23E\+0*4$/);
	await set(page, {Pump: false});
	assert.strictEqual((await cellState(page, 'itd-value-discrete')).label, 'STOPPED');

	// Location, orientation and size
	var loc = await cellState(page, 'itd-location-h');
	assert.ok(Math.abs(loc.geo.dx - 42.25 * 2.3) < 0.01, 'locationH dx ' + JSON.stringify(loc.geo));
	var locv = await cellState(page, 'itd-location-v');
	assert.ok(Math.abs(locv.geo.dy + 42.25 * 0.75) < 0.01, 'locationV dy ' + JSON.stringify(locv.geo));
	assert.strictEqual(String((await cellState(page, 'itd-orientation')).style.rotation), '90');
	var sh = await cellState(page, 'itd-size-height');
	var h = 100 * (10 + 0.4225 * 90) / 100;
	assert.ok(Math.abs(sh.geo.dh - (h - 100)) < 0.01 && Math.abs(sh.geo.dy - (100 - h)) < 0.01,
		'sizeHeight ' + JSON.stringify(sh.geo));
	var sw = await cellState(page, 'itd-size-width');
	assert.ok(sw.geo.dw < 0 && Math.abs(sw.geo.dx) < 0.01, 'sizeWidth ' + JSON.stringify(sw.geo));

	// Percent fill
	var fv = await cellState(page, 'itd-fill-vertical');
	assert.strictEqual(parseFloat(fv.style.hmiLevel), 42.25);
	assert.strictEqual(fv.style.hmiLevelColor.toUpperCase(), '#42A5F5');
	assert.strictEqual(fv.style.fillColor.toUpperCase(), '#ECEFF1');
	var fh = await cellState(page, 'itd-fill-horizontal');
	assert.strictEqual(parseFloat(fh.style.hmiLevelH), 42.25);
	assert.strictEqual(parseFloat(fh.style.hmiLevel), 100);

	// Colours (discrete, analog, alarm kinds)
	assert.strictEqual((await cellState(page, 'itd-color-discrete')).style.fillColor, '#9E9E9E');
	await set(page, {Pump: true});
	assert.strictEqual((await cellState(page, 'itd-color-discrete')).style.fillColor, '#43A047');
	assert.strictEqual((await cellState(page, 'itd-color-analog')).style.fillColor, '#42A5F5');
	assert.strictEqual((await cellState(page, 'itd-color-value-alarm')).style.fontColor, '#EF6C00');
	await set(page, {Temp: 105});
	assert.strictEqual((await cellState(page, 'itd-color-value-alarm')).style.fontColor, '#C62828');
	await set(page, {Temp: 50});
	assert.strictEqual((await cellState(page, 'itd-color-value-alarm')).style.fontColor, '#2E7D32');
	assert.strictEqual((await cellState(page, 'itd-color-deviation')).style.fillColor, '#EF9A9A');
	await set(page, {Pressure: 64});
	assert.strictEqual((await cellState(page, 'itd-color-deviation')).style.fillColor, '#FFE082');
	await set(page, {Pressure: 52});
	assert.strictEqual((await cellState(page, 'itd-color-deviation')).style.fillColor, '#A5D6A7');
	await set(page, {HighAlarm: true});
	assert.strictEqual((await cellState(page, 'itd-color-discrete-alarm')).style.strokeColor, '#E53935');

	// Rate of change: a jump of 80 within ~0.2 s exceeds 20 units/s
	await set(page, {Flow: 90});
	assert.strictEqual((await cellState(page, 'itd-color-roc')).style.fillColor, '#CE93D8');

	// Blink (HighAlarm is true): both phases are seen
	var phases = await page.evaluate(async function()
	{
		var seen = {};
		var cell = rt().graph.model.getCell('itd-blink-invisible');

		for (var i = 0; i < 12; i++)
		{
			seen['v' + (rt().overlay.getVisible(cell) !== false)] = true;
			seen['c' + rt().graph.view.getState(rt().graph.model.getCell('itd-blink-visible')).style.fillColor] = true;
			await new Promise(function(r)
			{
				setTimeout(r, 100);
			});
		}

		return seen;
	});
	assert.ok(phases.vtrue && phases.vfalse, 'invisible blink ' + JSON.stringify(phases));
	await page.waitForTimeout(1100);
	await set(page, {HighAlarm: false});
	await page.waitForTimeout(600);
	assert.notStrictEqual((await cellState(page, 'itd-blink-invisible')).visible, false);

	// Visibility and tooltips
	await set(page, {Show: false});
	assert.strictEqual((await cellState(page, 'itd-visibility')).visible, false);
	await set(page, {Show: true});
	assert.notStrictEqual((await cellState(page, 'itd-visibility')).visible, false);
	assert.strictEqual((await cellState(page, 'itd-tooltip-static')).tooltip, 'Static tooltip text');
	assert.strictEqual((await cellState(page, 'itd-tooltip-expr')).tooltip, 'Level is 42.3 %');

	// Disable: clicks are ignored while Enable = 0
	await set(page, {Enable: false, Cmd: false});
	await click(page, 'itd-disable');
	await page.waitForTimeout(300);
	assert.strictEqual(await get(page, 'Cmd'), false);
	await set(page, {Enable: true});
	await click(page, 'itd-disable');
	await waitTag(page, 'Cmd', function(v)
	{
		return v === true;
	});
}

async function touchScenario(page)
{
	await selectPage(page, 'Touch Links');
	await set(page, {Cmd: false, Speed: 750, SetPoint: 50, SliderX: 50, SliderY: 50,
		PbDirect: false, PbReverse: true, PbToggle: false, PbLatch: false, Counter: 0, Held: 0,
		Hover: false});

	// Discrete input: Set/Reset prompt, label shows on/off message
	assert.strictEqual((await cellState(page, 'itd-input-discrete')).label, 'Cmd: OFF');
	await click(page, 'itd-input-discrete');
	await page.click('.geHmiChoice0');
	await waitTag(page, 'Cmd', function(v)
	{
		return v === true;
	});
	await page.waitForTimeout(150);
	assert.strictEqual((await cellState(page, 'itd-input-discrete')).label, 'Cmd: ON');

	// Analog input with keypad: out of range is rejected, then accepted
	await click(page, 'itd-input-keypad');
	await page.waitForSelector('.geHmiKeypad input');
	await page.fill('.geHmiKeypad input', '2000');
	await page.click('.geHmiKeypadOk');
	assert.ok(await page.$('.geHmiKeypad') != null, 'keypad stays open for 2000');
	await page.fill('.geHmiKeypad input', '');
	await page.click('.geHmiKeypad button[data-key="1"]');
	await page.click('.geHmiKeypad button[data-key="2"]');
	await page.click('.geHmiKeypad button[data-key="0"]');
	await page.click('.geHmiKeypad button[data-key="0"]');
	await page.click('.geHmiKeypadOk');
	await waitTag(page, 'Speed', function(v)
	{
		return v === 1200;
	});

	// Analog input with inline editor
	await click(page, 'itd-input-analog');
	await page.waitForSelector('input.geHmiLinkEditor');
	await page.fill('input.geHmiLinkEditor', '33');
	await page.press('input.geHmiLinkEditor', 'Enter');
	await waitTag(page, 'SetPoint', function(v)
	{
		return v === 33;
	});
	await page.waitForTimeout(150);
	assert.strictEqual((await cellState(page, 'itd-input-analog')).label, 'SP 33.0');

	// Password input: stored as SHA-256, label masked
	await click(page, 'itd-input-password');
	await page.waitForSelector('input.geHmiLinkEditor[type=password]');
	await page.fill('input.geHmiLinkEditor', 'secret');
	await page.press('input.geHmiLinkEditor', 'Enter');
	var hash = crypto.createHash('sha256').update('secret').digest('hex');
	await waitTag(page, 'Password', new Function('v', 'return v === "' + hash + '";'));
	await page.waitForTimeout(150);
	assert.strictEqual((await cellState(page, 'itd-input-password')).label, new Array(65).join('*'));

	// String input with keyboard
	await click(page, 'itd-input-string');
	await page.waitForSelector('.geHmiKeypad input');
	await page.fill('.geHmiKeypad input', 'Alice');
	await page.click('.geHmiKeypadOk');
	await waitTag(page, 'Operator', function(v)
	{
		return v === 'Alice';
	});

	// Pushbuttons: direct (1 while pressed), reverse, toggle, set, reset
	var c = await center(page, 'itd-push-direct');
	await page.mouse.move(c.x, c.y);
	await page.mouse.down();
	await waitTag(page, 'PbDirect', function(v)
	{
		return v === true;
	});
	await page.mouse.up();
	await waitTag(page, 'PbDirect', function(v)
	{
		return v === false;
	});
	c = await center(page, 'itd-push-reverse');
	await page.mouse.move(c.x, c.y);
	await page.mouse.down();
	await waitTag(page, 'PbReverse', function(v)
	{
		return v === false;
	});
	await page.mouse.up();
	await waitTag(page, 'PbReverse', function(v)
	{
		return v === true;
	});
	await click(page, 'itd-push-toggle');
	await waitTag(page, 'PbToggle', function(v)
	{
		return v === true;
	});
	await click(page, 'itd-push-set');
	await waitTag(page, 'PbLatch', function(v)
	{
		return v === true;
	});
	await click(page, 'itd-push-reset');
	await waitTag(page, 'PbLatch', function(v)
	{
		return v === false;
	});

	// Key equivalents: Ctrl+T toggles, Shift+F3 runs the counter script
	await page.mouse.click(5, 890);
	await page.keyboard.press('Control+t');
	await waitTag(page, 'PbToggle', function(v)
	{
		return v === false;
	});
	await page.keyboard.press('Shift+F3');
	await waitTag(page, 'Counter', function(v)
	{
		return v === 1;
	});

	// Action scripts: on down, while down, hover
	await click(page, 'itd-action-click');
	await waitTag(page, 'Counter', function(v)
	{
		return v === 2;
	});
	c = await center(page, 'itd-action-while');
	await page.mouse.move(c.x, c.y);
	await page.mouse.down();
	await page.waitForTimeout(750);
	await page.mouse.up();
	await waitTag(page, 'Held', function(v)
	{
		return v >= 2;
	});
	c = await center(page, 'itd-action-hover');
	await page.mouse.move(c.x, c.y, {steps: 3});
	await waitTag(page, 'Hover', function(v)
	{
		return v === true || v === 1;
	});
	await page.mouse.move(5, 890, {steps: 3});
	await waitTag(page, 'Hover', function(v)
	{
		return v === false || v === 0;
	});

	// IF script resets both counters
	await click(page, 'itd-action-reset');
	await waitTag(page, 'Held', function(v)
	{
		return v === 0;
	});
	assert.strictEqual(await get(page, 'Counter'), 0);

	// Horizontal slider: dragging right increases the value
	c = await center(page, 'itd-slider-h');
	await page.mouse.move(c.x, c.y);
	await page.mouse.down();
	await page.mouse.move(c.x + 60, c.y, {steps: 5});
	await page.mouse.up();
	await waitTag(page, 'SliderX', function(v)
	{
		return v > 60 && v <= 100;
	});
	var after = await center(page, 'itd-slider-h');
	assert.ok(after.x > c.x + 30, 'knob follows the value');

	// Vertical slider: dragging up increases the value
	c = await center(page, 'itd-slider-v');
	await page.mouse.move(c.x, c.y);
	await page.mouse.down();
	await page.mouse.move(c.x, c.y - 50, {steps: 5});
	await page.mouse.up();
	await waitTag(page, 'SliderY', function(v)
	{
		return v > 55;
	});

	// Windows: overlay (show, toggle inside, hide), popup with backdrop
	await click(page, 'itd-show-overlay');
	await page.waitForFunction(function()
	{
		return rt().ui.hmiWindows != null && rt().ui.hmiWindows.length == 1;
	});
	await page.waitForTimeout(300);
	assert.strictEqual(await page.evaluate(function()
	{
		return rt().ui.hmiWindows[0].page.getName();
	}), 'Overlay Window');
	var cmd = await get(page, 'Cmd');
	await click(page, 'itd-overlay-toggle', 0);
	await waitTag(page, 'Cmd', new Function('v', 'return v === ' + !cmd + ';'));
	await click(page, 'itd-hide-overlay');
	await page.waitForFunction(function()
	{
		return rt().ui.hmiWindows.length == 0;
	});

	await page.keyboard.press('F4');
	await page.waitForFunction(function()
	{
		return rt().ui.hmiWindows.length == 1;
	});
	await page.waitForTimeout(300);
	await click(page, 'itd-overlay-close', 0);
	await page.waitForFunction(function()
	{
		return rt().ui.hmiWindows.length == 0;
	});

	await click(page, 'itd-show-popup');
	await page.waitForSelector('.geHmiPopupBackdrop');
	await page.waitForTimeout(300);
	await click(page, 'itd-popup-close', 0);
	await page.waitForFunction(function()
	{
		return rt().ui.hmiWindows.length == 0 &&
			document.querySelector('.geHmiPopupBackdrop') == null;
	});

	// ShowTopLeftAt($ObjHor, $ObjVer) places the window at the button
	await click(page, 'itd-showat');
	await page.waitForFunction(function()
	{
		return rt().ui.hmiWindows.length == 1;
	});
	var placed = await page.evaluate(function()
	{
		var wnd = rt().ui.hmiWindows[0].wnd;
		var b = wnd.div.getBoundingClientRect();
		var s = rt().graph.view.getState(rt().graph.model.getCell('itd-showat')).shape.node.getBoundingClientRect();

		return {wx: b.left, wy: b.top, cx: s.left + s.width / 2, cy: s.top + s.height / 2};
	});
	assert.ok(Math.abs(placed.wx - placed.cx) < 3 && Math.abs(placed.wy - placed.cy) < 3,
		'ShowTopLeftAt ' + JSON.stringify(placed));
	await click(page, 'itd-overlay-close', 0);

	// DialogValueEntry from a script
	await click(page, 'itd-dialog-entry');
	await page.waitForSelector('.geHmiKeypad input');
	await page.fill('.geHmiKeypad input', '77');
	await page.click('.geHmiKeypadOk');
	await waitTag(page, 'SetPoint', function(v)
	{
		return v === 77;
	});

	// Replace window: navigates to the page
	await click(page, 'itd-show-replace');
	await page.waitForFunction(function()
	{
		return rt().ui.currentPage.getName() == 'Display Links';
	});
}

async function runAll(url, apiExpr)
{
	var page = await openRuntime(url, apiExpr);

	try
	{
		await displayScenario(page);
		await touchScenario(page);
	}
	catch (e)
	{
		// Runtime log for diagnosis
		var log = await page.evaluate(function()
		{
			return rt().diag.log.slice(-15).map(function(e)
			{
				return e.level + ' ' + e.category + ' ' + e.message;
			});
		});
		e.message += '\n' + log.join('\n') + '\n' + page.hmiErrors.join('\n');
		throw e;
	}

	assert.deepStrictEqual(page.hmiErrors, []);
	await page.close();
}

test('links: lightweight runtime (dev sources)', async function()
{
	await runAll(await getRunUrl(false, false), 'Hmi.Viewer.instances[0]');
});

test('links: lightweight runtime (bundle)', {skip: !hasViewer}, async function()
{
	await runAll(await getRunUrl(false, true), 'Hmi.Viewer.instances[0]');
});

test('links: full-app runtime', async function()
{
	await runAll(await getRunUrl(true, false), 'Hmi.ui.hmi');
});
