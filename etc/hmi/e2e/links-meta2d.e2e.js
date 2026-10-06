// Extension links from meta2d (plugins/hmi/INTOUCH_LINKS.md §11) at runtime
// with the "meta2d Extensions" page of templates/hmi/intouch_links_demo.xml:
// display, animation and script links with forced tag values, touch links
// with real mouse input, in the lightweight runtime (dev sources and
// bundle) and the full-app runtime.
// Run: node --test --test-concurrency=1 etc/hmi/e2e/links-meta2d.e2e.js
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
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
		ui.fileLoaded(new LocalFile(ui, args.xml, 'meta2d.drawio', true));
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

	await page.evaluate(async function(apiExpr)
	{
		window.rt = function()
		{
			return eval(apiExpr).getRuntime();
		};

		var ui = rt().ui;

		for (var i = 0; i < ui.pages.length; i++)
		{
			if (ui.pages[i].getName() == 'meta2d Extensions')
			{
				ui.selectPage(ui.pages[i]);
			}
		}

		await new Promise(function(r)
		{
			setTimeout(r, 500);
		});
		rt().simulator.stop();

		// Captures messages, opened URLs and toasts
		window.hmiMessages = [];
		rt().on('message', function(m)
		{
			window.hmiMessages.push(m);
		});
		window.hmiOpened = [];
		window.open = function(url)
		{
			window.hmiOpened.push(url);

			return null;
		};
	}, apiExpr);
	await page.waitForTimeout(300);

	return page;
}

function set(page, values)
{
	return page.evaluate(async function(values)
	{
		rt().setValues(values);
		await new Promise(function(r)
		{
			setTimeout(r, 200);
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
			style: (state != null) ? state.style : null,
			animation: (node != null) ? node.style.animation : '',
			playState: (node != null) ? node.style.animationPlayState : '',
			series: (r.overlay.getSeries != null) ? r.overlay.getSeries(id) : null
		};
	}, id);
}

async function click(page, id)
{
	var c = await page.evaluate(function(id)
	{
		var state = rt().graph.view.getState(rt().graph.model.getCell(id));
		var b = state.shape.node.getBoundingClientRect();

		return {x: b.left + b.width / 2, y: b.top + b.height / 2};
	}, id);
	await page.mouse.click(c.x, c.y);
}

async function scenario(page, okSelector)
{
	await set(page, {Status: 1, Level: 50, Pump: true, Rpm: 30, Animate: true, HighAlarm: false,
		FlowOn: true, Temp: 50, Batch: 5, Recipe: 'A'});

	// Multi-State: colour and label per state, mask, range and blink
	var st = await cellState(page, 'itd-m2d-states');
	assert.strictEqual(st.style.fillColor, '#43A047');
	assert.strictEqual(st.label, 'RUNNING');
	await set(page, {Status: 7});
	st = await cellState(page, 'itd-m2d-states');
	assert.strictEqual(st.style.fillColor, '#E53935');
	assert.strictEqual(st.label, 'FAULT 7');
	var phases = await page.evaluate(async function()
	{
		var seen = {};
		var cell = rt().graph.model.getCell('itd-m2d-states');

		for (var i = 0; i < 12; i++)
		{
			seen[String(rt().overlay.getVisible(cell) !== false)] = true;
			await new Promise(function(r)
			{
				setTimeout(r, 100);
			});
		}

		return seen;
	});
	assert.ok(phases['true'] && phases['false'], 'state blink ' + JSON.stringify(phases));
	await set(page, {Status: 0});
	st = await cellState(page, 'itd-m2d-states');
	assert.strictEqual(st.label, 'STOPPED');
	await page.waitForTimeout(600);
	assert.notStrictEqual((await cellState(page, 'itd-m2d-states')).visible, false);

	// Opacity and properties
	assert.strictEqual(String((await cellState(page, 'itd-m2d-opacity')).style.opacity), '58');
	var pr = await cellState(page, 'itd-m2d-properties');
	assert.strictEqual(String(pr.style.flipH), '1');
	assert.strictEqual(String(pr.style.dashed), '0');
	assert.strictEqual(pr.tooltip, 'Pump on');
	await set(page, {Pump: false, Level: 60});
	pr = await cellState(page, 'itd-m2d-properties');
	assert.strictEqual(String(pr.style.flipH), '0');
	assert.strictEqual(String(pr.style.dashed), '1');

	// Widget data: gauge value and trend series
	assert.strictEqual(String((await cellState(page, 'itd-m2d-gauge')).style.hmiValue), '60');
	await set(page, {Level: 61});
	await set(page, {Level: 62});
	var series = (await cellState(page, 'itd-m2d-trend')).series;
	assert.ok(series != null && JSON.stringify(series).indexOf('62') >= 0, 'trend series ' +
		JSON.stringify(series).substring(0, 200));

	// Animation: spin at Rpm, paused at 0, stopped when not Animate
	var sp = await cellState(page, 'itd-m2d-spin');
	assert.ok(/hmi-spin/.test(sp.animation) && /2000ms/.test(sp.animation), sp.animation);
	await set(page, {Rpm: 60});
	sp = await cellState(page, 'itd-m2d-spin');
	assert.ok(/hmi-spin/.test(sp.animation) && /1000ms/.test(sp.animation), sp.animation);
	await set(page, {Rpm: 0});
	assert.strictEqual((await cellState(page, 'itd-m2d-spin')).playState, 'paused');
	await set(page, {Rpm: 30, Animate: false});
	assert.strictEqual((await cellState(page, 'itd-m2d-spin')).animation, '');
	await set(page, {Animate: true});
	var bo = (await cellState(page, 'itd-m2d-bounce')).animation;
	assert.ok(/hmi-bounce/.test(bo) && /1000ms/.test(bo), bo);
	assert.match((await cellState(page, 'itd-m2d-sway')).animation, /hmi-sway/);
	await set(page, {HighAlarm: true});
	assert.match((await cellState(page, 'itd-m2d-glow')).animation, /hmi-glow/);
	await set(page, {HighAlarm: false});
	assert.strictEqual((await cellState(page, 'itd-m2d-glow')).animation, '');

	// Flow: run, speed and direction
	await set(page, {FlowOn: true, Level: 25});
	var fl = (await cellState(page, 'itd-m2d-flow')).style;
	assert.strictEqual(String(fl.flowAnimation), '1');
	assert.strictEqual(String(fl.flowAnimationDuration), '600');
	assert.strictEqual(String(fl.flowAnimationReverse), '0');
	await set(page, {Level: 100});
	fl = (await cellState(page, 'itd-m2d-flow')).style;
	assert.strictEqual(String(fl.flowAnimationDuration), '240');
	assert.strictEqual(String(fl.flowAnimationReverse), '1');
	await set(page, {FlowOn: false});
	assert.strictEqual(String((await cellState(page, 'itd-m2d-flow')).style.flowAnimation), '0');

	// Object scripts: data change and condition
	var changes = await get(page, 'Changes');
	await set(page, {Status: 2});
	await waitTag(page, 'Changes', new Function('v', 'return v === ' + (changes + 1) + ';'));
	var high = await get(page, 'HighCount');
	await set(page, {Temp: 90});
	await waitTag(page, 'HighCount', new Function('v', 'return v === ' + (high + 1) + ';'));
	await set(page, {Temp: 50});
	await page.waitForSelector('.geHmiToast', {timeout: 3000});

	// Choice input
	await click(page, 'itd-m2d-choice');
	await page.click('.geHmiChoice1');
	await waitTag(page, 'Recipe', function(v)
	{
		return v === 'B';
	});

	// Value pushbuttons with clamping
	await click(page, 'itd-m2d-plus');
	await waitTag(page, 'Batch', function(v)
	{
		return v === 6;
	});
	await set(page, {Batch: 1});
	await click(page, 'itd-m2d-minus');
	await waitTag(page, 'Batch', function(v)
	{
		return v === 0;
	});
	await click(page, 'itd-m2d-minus');
	await page.waitForTimeout(300);
	assert.strictEqual(await get(page, 'Batch'), 0);

	// Touch options: confirmation, then the write
	await set(page, {Batch: 4});
	await click(page, 'itd-m2d-confirm');
	await page.waitForSelector(okSelector, {timeout: 5000});
	assert.strictEqual(await get(page, 'Batch'), 4, 'nothing written before confirming');
	await page.click(okSelector);
	await waitTag(page, 'Batch', function(v)
	{
		return v === 0;
	});

	// Touch options: roles (the user has none), so nothing happens
	await click(page, 'itd-m2d-roles');
	await page.waitForTimeout(300);
	assert.strictEqual(await get(page, 'Batch'), 0);

	// Actions: open URL, send message, animation control
	await click(page, 'itd-m2d-url');
	await page.waitForFunction(function()
	{
		return window.hmiOpened.length == 1;
	});
	assert.match(await page.evaluate(function()
	{
		return window.hmiOpened[0];
	}), /^https:\/\/www\.drawio\.com/);
	await set(page, {Level: 33});
	await click(page, 'itd-m2d-message');
	await page.waitForFunction(function()
	{
		return window.hmiMessages.length > 0;
	});
	assert.deepStrictEqual(await page.evaluate(function()
	{
		var m = window.hmiMessages[window.hmiMessages.length - 1];

		return {name: m.name, payload: m.payload};
	}), {name: 'hello', payload: 33});
	await click(page, 'itd-m2d-pause');
	await page.waitForTimeout(200);
	assert.strictEqual((await cellState(page, 'itd-m2d-spin')).playState, 'paused');
	await click(page, 'itd-m2d-resume');
	await page.waitForTimeout(200);
	assert.strictEqual((await cellState(page, 'itd-m2d-spin')).playState, 'running');

	// Script with the new functions: StopAnimation and ShowMessage
	await page.evaluate(function()
	{
		var t = document.querySelectorAll('.geHmiToast');

		for (var i = 0; i < t.length; i++)
		{
			t[i].parentNode.removeChild(t[i]);
		}
	});
	await click(page, 'itd-m2d-script');
	await waitTag(page, 'Animate', function(v)
	{
		return v === false || v === 0;
	});
	await page.waitForSelector('.geHmiToast', {timeout: 3000});
	assert.strictEqual((await cellState(page, 'itd-m2d-bounce')).animation, '');
}

async function runAll(url, apiExpr, okSelector)
{
	var page = await openRuntime(url, apiExpr);

	try
	{
		await scenario(page, okSelector);
	}
	catch (e)
	{
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

test('meta2d links: lightweight runtime (dev sources)', async function()
{
	await runAll(await getRunUrl(false, false), 'Hmi.Viewer.instances[0]', '.geHmiConfirmOk');
});

test('meta2d links: lightweight runtime (bundle)', {skip: !hasViewer}, async function()
{
	await runAll(await getRunUrl(false, true), 'Hmi.Viewer.instances[0]', '.geHmiConfirmOk');
});

test('meta2d links: full-app runtime', async function()
{
	await runAll(await getRunUrl(true, false), 'Hmi.ui.hmi', '.geDialog .gePrimaryBtn');
});
