// Tests of the built bundles (plugins/hmi.min.js, js/hmi-viewer.min.js).
// Run after "ant app" (or "ant hmi"): node --test etc/hmi/e2e/bundle.e2e.js
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var util = require('./util.js');

var browser = null;
var web = null;
var hasBundle = fs.existsSync(path.join(util.WEBAPP, 'plugins/hmi.min.js'));
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

test('production app loads the minified plugin bundle', {skip: !hasBundle}, async function()
{
	process.env.HMI_E2E_BUNDLE = '1';
	var page = await util.openEditor(browser, web.url);
	delete process.env.HMI_E2E_BUNDLE;

	var result = await page.evaluate(async function()
	{
		var ui = Hmi.ui;
		var graph = ui.editor.graph;
		var cell = graph.insertVertex(graph.getDefaultParent(), 'v', '', 20, 20, 80, 40);
		Hmi.Model.setDocConfig(graph, {version: 1, sim: 'only', sources: [], triggers: [],
			tags: [{name: 'A', type: 'number', sim: {kind: 'constant', value: 7, interval: 100}}]});
		Hmi.Model.setCellConfig(graph, [cell], 'bindings', [{tag: 'A', target: 'label'}]);
		ui.hmi.run({mode: 'preview', sim: 'only'});
		await new Promise(function(r)
		{
			setTimeout(r, 800);
		});
		var label = graph.view.getState(cell).text.value;
		ui.hmi.stop();

		return {bundled: Hmi.bundled === true, label: label};
	});

	assert.strictEqual(result.bundled, true);
	assert.strictEqual(result.label, '7');
	assert.deepStrictEqual(page.hmiErrors, []);
	await page.close();
});

test('standalone viewer runs HMI screens from data-mxgraph', {skip: !hasViewer}, async function()
{
	var xml = '<mxGraphModel><root><object id="0" hmi="' +
		'{&quot;version&quot;:1,&quot;sim&quot;:&quot;only&quot;,&quot;sources&quot;:[],&quot;triggers&quot;:[],' +
		'&quot;tags&quot;:[{&quot;name&quot;:&quot;L&quot;,&quot;type&quot;:&quot;number&quot;,' +
		'&quot;sim&quot;:{&quot;kind&quot;:&quot;constant&quot;,&quot;value&quot;:42,&quot;interval&quot;:100}}]}">' +
		'<mxCell/></object><mxCell id="1" parent="0"/>' +
		'<object id="t" label="" hmiBindings="[{&quot;tag&quot;:&quot;L&quot;,&quot;target&quot;:&quot;label&quot;}]">' +
		'<mxCell style="text;html=1;" vertex="1" parent="1"><mxGeometry x="10" y="10" width="80" height="30" as="geometry"/></mxCell></object>' +
		'<object id="g" label="" hmiBindings="[{&quot;tag&quot;:&quot;L&quot;,&quot;target&quot;:&quot;prop:value&quot;}]">' +
		'<mxCell style="shape=mxgraph.hmi.radialGauge;noLabel=1;" vertex="1" parent="1"><mxGeometry x="100" y="10" width="120" height="120" as="geometry"/></mxCell></object>' +
		'</root></mxGraphModel>';
	var config = JSON.stringify({xml: xml, hmi: {sim: 'only'}});
	util.addPage('/__test/viewer.html', '<!DOCTYPE html><html><body>' +
		'<div class="mxgraph" style="width:400px;height:200px" data-mxgraph="' +
		config.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"></div>' +
		'<script src="/js/hmi-viewer.min.js"></script></body></html>');

	var page = await browser.newPage();
	var errors = [];
	page.on('pageerror', function(e)
	{
		errors.push(e.message);
	});
	await page.goto(web.url + '/__test/viewer.html', {waitUntil: 'load'});
	await page.waitForFunction(function()
	{
		return window.Hmi != null && Hmi.Viewer != null && document.querySelector('svg') != null;
	}, null, {timeout: 30000});
	await page.waitForTimeout(1500);

	var result = await page.evaluate(function()
	{
		var text = document.querySelector('.mxgraph').textContent;

		return {text: text, hasGauge: document.querySelector('.mxgraph svg') != null};
	});

	assert.match(result.text, /42/);
	assert.deepStrictEqual(errors, []);
	await page.close();
});
