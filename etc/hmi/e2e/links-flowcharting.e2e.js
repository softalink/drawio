// Features adopted from grafana-flowcharting (INTOUCH_LINKS.md §13) at
// runtime: smooth changes, blended analog colours, alarm markers, tooltip
// trends, data age and regular expression states.
// Run: node --test --test-concurrency=1 etc/hmi/e2e/links-flowcharting.e2e.js
var test = require('node:test');
var assert = require('node:assert');
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

function attr(obj)
{
	return JSON.stringify(obj).replace(/&/g, '&amp;').replace(/'/g, '&apos;').replace(/</g, '&lt;');
}

function cell(id, x, links, extra)
{
	return '<object id="' + id + '" label="' + id + '"' + (links ? " hmiLinks='" + attr(links) + "'" : '') +
		(extra || '') + '><mxCell style="rounded=0;whiteSpace=wrap;html=1;fillColor=#FFFFFF;strokeColor=#000000;" ' +
		'vertex="1" parent="1"><mxGeometry x="' + x + '" y="100" width="100" height="60" as="geometry"/>' +
		'</mxCell></object>';
}

function diagram(runtime)
{
	var cfg = {version: 1, sim: 'off', runtime: runtime, sources: [], triggers: [],
		tags: [{name: 'Temp', type: 'number', access: 'rw', local: true, initial: 0,
			alarms: {hi: 80, hihi: 95}},
		{name: 'Level', type: 'number', access: 'rw', local: true, initial: 0},
		{name: 'Mode', type: 'string', access: 'rw', local: true, initial: 'AUTO'},
		{name: 'Flag', type: 'boolean', access: 'rw', local: true, initial: false}]};
	var cells = [
		cell('blend', 20, {fillColor: {kind: 'analog', expr: 'Level', blend: true,
			breakpoints: [{value: 0, color: '#00FF00'}, {value: 100, color: '#FF0000'}]}}),
		cell('smooth', 140, {fillColor: {kind: 'analog', expr: 'Level',
			breakpoints: [{value: 0, color: '#000000'}, {value: 50, color: '#FFFFFF'}]},
			locationH: {expr: 'Level', atLeft: 0, atRight: 100, toLeft: 0, toRight: 100},
			smooth: {duration: 800}}),
		cell('marker', 260, {valueAnalog: {expr: 'Temp', format: {mode: 'text'}}}),
		cell('nomarker', 380, {valueAnalog: {expr: 'Temp', format: {mode: 'text'}},
			alarmMarker: {show: 'hide'}}),
		cell('trend', 500, {tooltip: {mode: 'static', text: 'Tank level', trend: true,
			trendTag: 'Level', trendSeconds: 60}}),
		cell('stale', 620, {states: {expr: 'Flag', staleSeconds: 2, states: [
			{match: 'stale', fillColor: '#808080'}, {match: '1', fillColor: '#00C000'},
			{match: '*', fillColor: '#C00000'}]}}),
		cell('regex', 740, {states: {expr: 'Mode', states: [{match: '/^man/i', fillColor: '#FFA500'},
			{match: '*', fillColor: '#0000FF'}]}})
	];

	return '<mxfile><diagram id="p1" name="Page-1"><mxGraphModel><root>' +
		"<object id=\"0\" hmi='" + attr(cfg) + "'><mxCell/></object>" +
		'<mxCell id="1" parent="0"/>' + cells.join('') + '</root></mxGraphModel></diagram></mxfile>';
}

async function openRun(runtime)
{
	var editor = await util.openEditor(browser, web.url);
	var url = await editor.evaluate(async function(xml)
	{
		var ui = Hmi.ui;
		ui.fileLoaded(new LocalFile(ui, xml, 'fc.drawio', true));
		await new Promise(function(r)
		{
			setTimeout(r, 500);
		});

		return Hmi.Plugin.getRunUrl(ui, false);
	}, diagram(runtime));
	await editor.close();

	var page = await browser.newPage({viewport: {width: 1400, height: 900}});
	page.hmiErrors = [];
	page.on('pageerror', function(e)
	{
		page.hmiErrors.push(e.message);
	});
	await page.goto(web.url + url.substring(url.lastIndexOf('/')));
	await page.waitForFunction(function()
	{
		try
		{
			return Hmi.Viewer.instances[0].isRunning() && Hmi.Viewer.instances[0].getRuntime().initialized;
		}
		catch (e)
		{
			return false;
		}
	}, null, {timeout: 60000});
	await page.evaluate(function()
	{
		window.rt = function()
		{
			return Hmi.Viewer.instances[0].getRuntime();
		};
	});

	return page;
}

function set(page, values, wait)
{
	return page.evaluate(async function(args)
	{
		rt().setValues(args.values);
		await new Promise(function(r)
		{
			setTimeout(r, args.wait);
		});
	}, {values: values, wait: (wait != null) ? wait : 150});
}

function style(page, id, key)
{
	return page.evaluate(function(args)
	{
		var r = rt();
		var state = r.graph.view.getState(r.graph.model.getCell(args.id));

		return (state != null) ? state.style[args.key] : null;
	}, {id: id, key: key});
}

function geo(page, id)
{
	return page.evaluate(function(id)
	{
		return rt().overlay.getGeo(id);
	}, id);
}

test('blend, smooth changes, data age, regex states, trend tooltip and alarm markers', async function()
{
	var page = await openRun({fit: 'none', panZoom: false, alarmMarkers: true});

	try
	{
		// Blended analog colour: half way between green and red
		await set(page, {Level: 50});
		assert.strictEqual(String(await style(page, 'blend', 'fillColor')).toLowerCase(), '#808000');

		// Smooth change: colour and location move gradually to the target
		await set(page, {Level: 0}, 1200);
		assert.strictEqual(String(await style(page, 'smooth', 'fillColor')).toLowerCase(), '#000000');
		await set(page, {Level: 100}, 250);
		var mid = String(await style(page, 'smooth', 'fillColor')).toLowerCase();
		var g = await geo(page, 'smooth');
		assert.ok(mid != '#000000' && mid != '#ffffff', 'colour in between: ' + mid);
		assert.ok(g != null && g.dx > 0 && g.dx < 100, 'location in between: ' + JSON.stringify(g));
		await page.waitForTimeout(900);
		assert.strictEqual(String(await style(page, 'smooth', 'fillColor')).toLowerCase(), '#ffffff');
		assert.strictEqual((await geo(page, 'smooth')).dx, 100);

		// The blend cell has no smooth link and the page has no smoothMs
		await set(page, {Level: 0}, 60);
		assert.strictEqual(String(await style(page, 'blend', 'fillColor')).toLowerCase(), '#00ff00');

		// Regular expression state
		await set(page, {Mode: 'Manual'});
		assert.strictEqual(String(await style(page, 'regex', 'fillColor')).toUpperCase(), '#FFA500');
		await set(page, {Mode: 'AUTO'});
		assert.strictEqual(String(await style(page, 'regex', 'fillColor')).toUpperCase(), '#0000FF');

		// Data age: the stale state after 2 s without updates, back on update
		await set(page, {Flag: true});
		assert.strictEqual(String(await style(page, 'stale', 'fillColor')).toUpperCase(), '#00C000');
		await page.waitForTimeout(3300);
		assert.strictEqual(String(await style(page, 'stale', 'fillColor')).toUpperCase(), '#808080');
		await set(page, {Flag: false}, 300);
		assert.strictEqual(String(await style(page, 'stale', 'fillColor')).toUpperCase(), '#C00000');

		// Tooltip trend: a node with the text and a sparkline
		await set(page, {Level: 10}, 60);
		await set(page, {Level: 60}, 60);
		await set(page, {Level: 30}, 60);
		var tip = await page.evaluate(function()
		{
			var r = rt();
			var html = r.graph.getTooltipForCell(r.graph.model.getCell('trend'));
			var node = document.createElement('div');
			node.innerHTML = html;
			node = node.firstChild;

			return (node != null && node.nodeType == 1) ? {text: node.textContent,
				path: node.querySelector('path') != null, tag: node.getAttribute('data-hmi-trend')} : String(node);
		});
		assert.strictEqual(tip.tag, 'Level');
		assert.ok(tip.path, 'sparkline drawn');
		assert.ok(tip.text.indexOf('Tank level') >= 0 && tip.text.indexOf('30') >= 0, tip.text);

		// Real hover shows the sparkline tooltip
		var box = await page.evaluate(function()
		{
			var r = rt();
			var b = r.graph.view.getState(r.graph.model.getCell('trend')).shape.node.getBoundingClientRect();

			return {x: b.left + b.width / 2, y: b.top + b.height / 2};
		});
		await page.mouse.move(box.x, box.y);
		await page.mouse.move(box.x + 3, box.y + 2);
		await page.waitForSelector('.mxTooltip [data-hmi-trend] svg path', {timeout: 5000});
		await page.mouse.move(5, 5);

		// Alarm markers: on objects with an alarmed tag, unless hidden
		var markers = function()
		{
			return page.evaluate(function()
			{
				return Array.prototype.map.call(document.querySelectorAll('[data-hmi-alarm-marker]'), function(n)
				{
					return n.getAttribute('data-hmi-alarm-marker') + ':' + n.getAttribute('data-hmi-severity');
				});
			});
		};
		assert.deepStrictEqual(await markers(), []);
		await set(page, {Temp: 85}, 300);
		assert.deepStrictEqual(await markers(), ['unacked:2']);
		assert.strictEqual(await page.evaluate(function() { return rt().links.markers.count(); }), 1);
		await set(page, {Temp: 99}, 300);
		assert.deepStrictEqual(await markers(), ['unacked:1']);
		await page.evaluate(function()
		{
			rt().alarms.ack();
		});
		await page.waitForTimeout(300);
		assert.deepStrictEqual(await markers(), ['acked:1']);
		await set(page, {Temp: 20}, 300);
		assert.deepStrictEqual(await markers(), []);

		assert.deepStrictEqual(page.hmiErrors, []);
	}
	finally
	{
		await page.close();
	}
});

test('page smoothMs applies to every object; markers stay off by default', async function()
{
	var page = await openRun({fit: 'none', panZoom: false, smoothMs: 600});

	try
	{
		await set(page, {Level: 100}, 150);
		var mid = String(await style(page, 'blend', 'fillColor')).toLowerCase();
		assert.ok(mid != '#00ff00' && mid != '#ff0000', 'blend cell is smoothed by the page: ' + mid);
		await page.waitForTimeout(800);
		assert.strictEqual(String(await style(page, 'blend', 'fillColor')).toLowerCase(), '#ff0000');

		await set(page, {Temp: 99}, 300);
		assert.strictEqual(await page.evaluate(function()
		{
			return document.querySelectorAll('[data-hmi-alarm-marker]').length;
		}), 0);
		assert.deepStrictEqual(page.hmiErrors, []);
	}
	finally
	{
		await page.close();
	}
});
