// Hover halo (runtime/HmiHalo.js, ui/HmiHaloDialog.js): the Hover Halo tab
// of Screen Settings with presets, per-object style overrides, and the glow,
// outline and off styles at runtime with real mouse input.
// Run: node --test --test-concurrency=1 etc/hmi/e2e/halo.e2e.js
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var util = require('./util.js');

var browser = null;
var web = null;
var demo = fs.readFileSync(path.join(util.WEBAPP, 'templates/hmi/intouch_links_demo.xml'), 'utf8');

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

async function openDemo()
{
	var editor = await util.openEditor(browser, web.url);
	editor.hmiErrors = [];
	editor.on('pageerror', function(e)
	{
		editor.hmiErrors.push(e.message);
	});
	await editor.evaluate(async function(xml)
	{
		var ui = Hmi.ui;
		ui.fileLoaded(new LocalFile(ui, xml, 'halo.drawio', true));
		await new Promise(function(r)
		{
			setTimeout(r, 500);
		});
	}, demo);

	return editor;
}

function storedHalo(editor)
{
	return editor.evaluate(function()
	{
		var cfg = Hmi.Model.getDocConfig(Hmi.ui.editor.graph);

		return (cfg.runtime != null) ? cfg.runtime.hoverHalo : undefined;
	});
}

test('halo dialog: presets, advanced settings, off and undo', async function()
{
	var editor = await openDemo();

	await editor.evaluate(function()
	{
		Hmi.HaloDialog.show(Hmi.ui);
	});
	await editor.waitForSelector('.geDialog [data-preset="crispOutline"]');

	// The default preset is selected and the preview glows
	assert.ok(await editor.$eval('[data-preset="softGlow"]', function(b)
	{
		return b.classList.contains('geHmiSel');
	}));
	assert.match(await editor.$eval('.geHmiHaloPreview [data-sample="button"] rect', function(r)
	{
		return r.style.filter;
	}), /drop-shadow/);

	// Crisp outline: outline rectangles in the preview, stored style
	await editor.click('[data-preset="crispOutline"]');
	assert.ok(await editor.$('.geHmiHaloPreview [data-outline]') != null);
	await editor.click('.geDialog .gePrimaryBtn');
	assert.deepStrictEqual(await storedHalo(editor), {style: 'outline'});

	// Shape outline: the preview uses an SVG filter, the setting is stored
	await editor.evaluate(function()
	{
		Hmi.HaloDialog.show(Hmi.ui);
	});
	await editor.waitForSelector('.geDialog [data-preset="shapeOutline"]');
	await editor.click('[data-preset="shapeOutline"]');
	assert.match(await editor.$eval('.geHmiHaloPreview [data-sample="lamp"] circle', function(c)
	{
		return c.style.filter;
	}), /url\("?#geHmiHaloOutline/);
	assert.strictEqual(await editor.$eval('.geDialog .geHmiHaloOutlineShape', function(e)
	{
		return e.value;
	}), 'shape');
	await editor.click('.geDialog .gePrimaryBtn');
	assert.deepStrictEqual(await storedHalo(editor), {style: 'outline', outlineShape: 'shape', padding: 2});

	// Strong glow with a colour and a dashed setting in the advanced part
	await editor.evaluate(function()
	{
		Hmi.HaloDialog.show(Hmi.ui);
	});
	await editor.waitForSelector('.geDialog [data-preset="strongGlow"]');
	await editor.click('[data-preset="strongGlow"]');
	await editor.fill('.geDialog .geHmiColorWrap input >> nth=0', '#FFB300');
	await editor.press('.geDialog .geHmiColorWrap input >> nth=0', 'Tab');
	await editor.click('.geDialog .gePrimaryBtn');
	var halo = await storedHalo(editor);
	assert.strictEqual(halo.size, 12);
	assert.strictEqual(halo.color, '#FFB300');

	// Off is stored as false and undo restores the previous settings
	await editor.evaluate(function()
	{
		Hmi.HaloDialog.show(Hmi.ui);
	});
	await editor.waitForSelector('.geDialog [data-preset="off"]');
	await editor.click('[data-preset="off"]');
	await editor.click('.geDialog .gePrimaryBtn');
	assert.strictEqual(await storedHalo(editor), false);
	await editor.evaluate(function()
	{
		Hmi.ui.actions.get('undo').funct();
	});
	assert.strictEqual((await storedHalo(editor)).color, '#FFB300');
	assert.deepStrictEqual(editor.hmiErrors, []);
	await editor.close();
});

test('halo per object and runtime styles', async function()
{
	var editor = await openDemo();

	// Page setting: crisp outline; one object overrides with a red glow,
	// another turns the halo off
	await editor.evaluate(function()
	{
		var ui = Hmi.ui;
		var graph = ui.editor.graph;
		ui.selectPage(ui.pages[1]);
		var cfg = Hmi.Model.getDocConfig(graph);
		cfg.runtime.hoverHalo = {style: 'outline', width: 3};
		Hmi.Model.setDocConfig(graph, cfg);
		graph.setSelectionCell(graph.model.getCell('itd-push-direct'));
	});

	// The per-object halo (style keys of the Animation Links hover halo link)
	await editor.evaluate(function()
	{
		var graph = Hmi.ui.editor.graph;
		var cell = graph.model.getCell('itd-push-direct');
		graph.setCellStyles('hmiHaloStyle', 'glow', [cell]);
		graph.setCellStyles('hmiHaloColor', '#E53935', [cell]);
	});
	await editor.evaluate(function()
	{
		var graph = Hmi.ui.editor.graph;
		graph.setCellStyles('hmiHalo', '0', [graph.model.getCell('itd-push-reverse')]);
		graph.setCellStyles('hmiHaloOutline', 'shape', [graph.model.getCell('itd-push-set')]);
	});
	var style = await editor.evaluate(function()
	{
		return Hmi.ui.editor.graph.getModel().getStyle(Hmi.ui.editor.graph.model.getCell('itd-push-direct'));
	});
	assert.match(style, /hmiHaloStyle=glow/);
	assert.match(style, /hmiHaloColor=#E53935/);

	// Run Screen (lightweight runtime)
	var url = await editor.evaluate(function()
	{
		return Hmi.Plugin.getRunUrl(Hmi.ui, false);
	});
	await editor.close();
	var page = await browser.newPage({viewport: {width: 1400, height: 900}});
	var errors = [];
	page.on('pageerror', function(e)
	{
		errors.push(e.message);
	});
	await page.goto(web.url + url.substring(url.lastIndexOf('/')));
	await page.waitForFunction(function()
	{
		return window.Hmi != null && Hmi.Viewer != null && Hmi.Viewer.instances.length > 0 &&
			Hmi.Viewer.instances[0].isRunning();
	}, null, {timeout: 60000});
	await page.evaluate(async function()
	{
		window.rt = function()
		{
			return Hmi.Viewer.instances[0].getRuntime();
		};
		rt().ui.selectPage(rt().ui.pages[1]);
		await new Promise(function(r)
		{
			setTimeout(r, 500);
		});
	});

	// A point on the page without objects (left of the title)
	var blank = await page.evaluate(function()
	{
		var r = rt().graph.container.getBoundingClientRect();

		return {x: r.left + 4, y: r.top + 4};
	});

	var hover = async function(id)
	{
		var b = await page.evaluate(function(id)
		{
			var s = rt().graph.view.getState(rt().graph.model.getCell(id));
			var r = s.shape.node.getBoundingClientRect();

			return {x: r.left + r.width / 2, y: r.top + r.height / 2};
		}, id);
		await page.mouse.move(b.x, b.y, {steps: 2});

		return page.evaluate(function(id)
		{
			var s = rt().graph.view.getState(rt().graph.model.getCell(id));
			var rect = document.querySelector('[data-hmi-halo-outline]');

			return {glow: s.shape.node.style.filter || '',
				outline: (rect != null) ? {width: rect.getAttribute('stroke-width'),
					color: rect.getAttribute('stroke'), state: rect.getAttribute('data-hmi-halo-outline')} : null};
		}, id);
	};

	// Page style: outline rectangle, 3 px, no glow
	var h = await hover('itd-push-toggle');
	assert.deepStrictEqual(h.outline, {width: '3', color: '#1E88E5', state: 'hover'});
	assert.strictEqual(h.glow, '');
	await page.mouse.down();
	assert.strictEqual(await page.evaluate(function()
	{
		return document.querySelector('[data-hmi-halo-outline]').getAttribute('stroke-width');
	}), '4');
	await page.mouse.up();

	// Object override: red glow, no outline
	h = await hover('itd-push-direct');
	assert.strictEqual(h.outline, null);
	assert.match(h.glow, /drop-shadow\(.*rgba?\(229, ?57, ?53/);

	// Object turned off: nothing
	h = await hover('itd-push-reverse');
	assert.strictEqual(h.outline, null);
	assert.strictEqual(h.glow, '');

	// Object override: outline that follows the shape (SVG filter)
	h = await hover('itd-push-set');
	assert.strictEqual(h.outline, null);
	assert.match(h.glow, /url\("?#geHmiHaloOutline/);
	assert.strictEqual(await page.evaluate(function()
	{
		return document.querySelectorAll('filter[id^="geHmiHaloOutline"]').length;
	}), 1);
	await page.mouse.move(blank.x, blank.y, {steps: 2});
	assert.strictEqual(await page.evaluate(function()
	{
		return document.querySelectorAll('filter[id^="geHmiHaloOutline"]').length;
	}), 0);

	// Leaving removes the outline
	await page.mouse.move(blank.x, blank.y, {steps: 2});
	assert.ok(await page.$('[data-hmi-halo-outline]') == null, 'outline removed');

	// Leaving the screen quickly (over another object) also ends the hover
	var t = await page.evaluate(function()
	{
		var s = rt().graph.view.getState(rt().graph.model.getCell('itd-push-toggle'));
		var r = s.shape.node.getBoundingClientRect();
		var c = rt().graph.container.getBoundingClientRect();

		return {x: r.left + r.width / 2, y: r.top + r.height / 2, out: c.bottom + 10};
	});
	await page.mouse.move(t.x, t.y, {steps: 2});
	assert.ok(await page.$('[data-hmi-halo-outline]') != null);
	await page.mouse.move(t.x, t.out);
	assert.ok(await page.$('[data-hmi-halo-outline]') == null, 'hover ends outside the screen');

	// Keyboard focus shows the halo, a mouse click does not keep it
	await page.keyboard.press('Tab');
	assert.ok(await page.evaluate(function()
	{
		return document.querySelector('[data-hmi-halo],[data-hmi-halo-outline]') != null;
	}), 'focus halo');
	assert.deepStrictEqual(errors, []);
	await page.close();
});
