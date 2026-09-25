// End-to-end tests for the HMI editor UI (Format tab, dialogs, windows,
// validator, faceplates, importer).
// Run: node --test --test-concurrency=1 etc/hmi/e2e/ui.e2e.js
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var util = require('./util.js');

var browser = null;
var web = null;

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

test('dialogs, windows and the HMI format tab open without errors', async function()
{
	var page = await util.openEditor(browser, web.url);

	var result = await page.evaluate(async function()
	{
		var ui = Hmi.ui;
		var graph = ui.editor.graph;
		var wait = function(ms)
		{
			return new Promise(function(r)
			{
				setTimeout(r, ms);
			});
		};
		var cell = graph.insertVertex(graph.getDefaultParent(), 'v1', 'Pump', 50, 50, 80, 40);
		Hmi.Model.setDocConfig(graph, {version: 1, sim: 'only', triggers: [], sources: [],
			tags: [{name: 'Speed', type: 'number', sim: {kind: 'sine', min: 0, max: 100,
				period: 2000, interval: 200}}]});
		graph.setSelectionCell(cell);
		await wait(300);

		var tabs = Array.prototype.map.call(document.querySelectorAll('.geFormatTitle'),
			function(e)
			{
				return e.textContent;
			});
		var opened = [];
		var names = ['SourcesDialog', 'TagsDialog', 'TagBrowser', 'Diagnostics', 'Validator'];

		for (var i = 0; i < names.length; i++)
		{
			Hmi[names[i]].show(ui);
			await wait(200);
			opened.push(names[i]);
			ui.hideDialog();
		}

		ui.hmi.run({mode: 'preview', sim: 'only'});
		await wait(600);
		Hmi.AlarmList.show(ui);
		Hmi.Diagnostics.show(ui);
		await wait(300);
		ui.hmi.stop();

		return {tabs: tabs, opened: opened};
	});

	assert.ok(result.tabs.indexOf('HMI') >= 0, 'HMI tab present: ' + result.tabs);
	assert.strictEqual(result.opened.length, 5);
	assert.deepStrictEqual(page.hmiErrors, []);
	await page.close();
});

test('validator reports undeclared tags, missing pages and read-only writes', async function()
{
	var page = await util.openEditor(browser, web.url);

	var result = await page.evaluate(function()
	{
		var ui = Hmi.ui;
		var graph = ui.editor.graph;
		var cell = graph.insertVertex(graph.getDefaultParent(), 'v1', '', 50, 50, 80, 40);
		Hmi.Model.setDocConfig(graph, {version: 1, sim: 'off', triggers: [], tags: [
			{name: 'RO', type: 'number', access: 'r'}],
			sources: [{id: 'm', name: 'M', type: 'mqtt', enabled: true, url: 'ws://x/mqtt', topics: []}]});
		Hmi.Model.setCellConfig(graph, [cell], 'bindings', [{tag: 'Unknown', target: 'label'}]);
		Hmi.Model.setCellConfig(graph, [cell], 'events', [{on: 'click', actions: [
			{type: 'navigate', page: 'Nowhere'}, {type: 'writeTag', tag: 'RO', value: 1}]}]);

		return Hmi.Validator.validate(ui).map(function(r)
		{
			return r.level + ': ' + r.message;
		}).join('\n');
	});

	assert.match(result, /Unknown/);
	assert.match(result, /Nowhere/);
	assert.match(result, /RO/);
	assert.match(result, /topic/i);
	await page.close();
});

test('faceplate renders bound labels of another page', async function()
{
	var page = await util.openEditor(browser, web.url);

	var result = await page.evaluate(async function()
	{
		var ui = Hmi.ui;
		var graph = ui.editor.graph;
		var main = ui.currentPage;
		var detail = ui.insertPage();
		detail.setName('Detail');
		ui.selectPage(detail);
		var lbl = graph.insertVertex(graph.getDefaultParent(), 'fpLabel', '', 20, 20, 120, 30,
			'text;html=1;');
		Hmi.Model.setCellConfig(graph, [lbl], 'bindings', [{tag: 'Speed', target: 'label',
			format: {decimals: 0}}]);
		ui.selectPage(main);
		Hmi.Model.setDocConfig(graph, {version: 1, sim: 'off', triggers: [], tags: [],
			sources: [{id: 'h', name: 'H', type: 'host', enabled: true}]});
		var rt = ui.hmi.run({mode: 'run'});
		rt.setValues({Speed: 1500});
		rt.frame();
		Hmi.Faceplate.showPage(rt, detail, {title: 'Detail'});
		await new Promise(function(r)
		{
			setTimeout(r, 300);
		});
		rt.setValues({Speed: 1600});
		rt.frame();
		await new Promise(function(r)
		{
			setTimeout(r, 300);
		});
		var text = Array.prototype.map.call(document.querySelectorAll('.mxWindow'),
			function(w)
			{
				return w.textContent;
			}).join(' ');
		var mainXml = mxUtils.getXml(ui.editor.getGraphXml());
		ui.hmi.stop();

		return {text: text, mainHasBinding: mainXml.indexOf('fpLabel') >= 0};
	});

	assert.match(result.text, /1600/);
	assert.strictEqual(result.mainHasBinding, false, 'faceplate does not alter the main page');
	await page.close();
});

test('meta2d import creates a runnable page', async function()
{
	var page = await util.openEditor(browser, web.url);
	var fixture = JSON.parse(fs.readFileSync(path.join(util.WEBAPP,
		'plugins/hmi/test/fixtures/meta2d-sample.json'), 'utf8'));

	var result = await page.evaluate(async function(data)
	{
		var ui = Hmi.ui;
		var pages = ui.pages.length;
		var report = Hmi.Import.importMeta2d(ui, data, 'sample');
		ui.hmi.run({mode: 'preview', sim: 'only'});
		await new Promise(function(r)
		{
			setTimeout(r, 800);
		});
		var rt = ui.hmi.getRuntime();
		var errors = rt.diag.log.filter(function(e)
		{
			return e.level == 'error';
		}).length;
		ui.hmi.stop();

		return {pagesAdded: ui.pages.length - pages, cells: Object.keys(
			ui.editor.graph.model.cells).length, errors: errors};
	}, fixture);

	assert.strictEqual(result.pagesAdded, 1);
	assert.ok(result.cells > 5);
	assert.strictEqual(result.errors, 0);
	assert.deepStrictEqual(page.hmiErrors, []);
	await page.close();
});
