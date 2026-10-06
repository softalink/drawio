// End-to-end tests for the quick help ("i" icons, ui/HmiHelp.js + ui/HmiHelpTexts.js) of the HMI
// dialogs, windows and editor forms: Data Sources, Tags, Tag Browser, Substitute / Define Missing
// Tags, Validator, Diagnostics, Credentials and the HMI tab of the Format panel with its item editors.
// Screenshots (light and dark, with one open popover) are written to the directory in the
// environment variable HMI_HELP_SHOTS if it is set.
// Run: node --test --test-concurrency=1 etc/hmi/e2e/dialogs-help.e2e.js
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var util = require('./util.js');

var browser = null;
var web = null;
var SHOTS = process.env.HMI_HELP_SHOTS || null;

test.before(async function()
{
	web = await util.startStatic(0);
	browser = await util.launch();

	if (SHOTS != null)
	{
		fs.mkdirSync(SHOTS, {recursive: true});
	}
});

test.after(async function()
{
	await browser.close();
	web.server.close();
});

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

async function openPage()
{
	var page = await util.openEditor(browser, web.url);
	await page.evaluate(function()
	{
		Hmi.Help.missing = {};
		window.__wait = function(ms)
		{
			return new Promise(function(r)
			{
				setTimeout(r, ms || 50);
			});
		};
		// The [data-help] icons below a root (default: the open dialog)
		window.__icons = function(root)
		{
			root = root || Hmi.ui.dialog.container;

			return Array.prototype.slice.call(root.querySelectorAll('[data-help]'));
		};
		// Icons that are shown (not inside a hidden row)
		window.__visible = function(root)
		{
			return __icons(root).filter(function(i)
			{
				return i.offsetParent != null;
			}).map(function(i)
			{
				return i.getAttribute('data-help');
			});
		};
		// Row heights with the icons, then without them (display none), then restored
		window.__heights = function(root)
		{
			root = root || Hmi.ui.dialog.container;
			var rows = Array.prototype.filter.call(root.querySelectorAll('.geDialogFormRow, ' +
				'.geDialogCheckRow, .geDialogInlineFields'), function(r)
			{
				return r.offsetParent != null && r.querySelector('[data-help]') != null;
			});
			var h = function()
			{
				return rows.map(function(r)
				{
					return {cls: r.className, height: r.getBoundingClientRect().height,
						area: r.querySelector('textarea') != null,
						text: r.textContent.substring(0, 30)};
				});
			};
			var withIcons = h();
			var icons = __icons(root);
			icons.forEach(function(i)
			{
				i.style.display = 'none';
			});
			var without = h();
			icons.forEach(function(i)
			{
				i.style.display = '';
			});

			return {withIcons: withIcons, without: without};
		};
	});

	return page;
}

async function closeAll(page)
{
	await page.evaluate(function()
	{
		Hmi.Help.close();

		while (Hmi.ui.dialogs != null && Hmi.ui.dialogs.length > 0)
		{
			Hmi.ui.hideDialog();
		}

		if (Hmi.ui.dialog != null)
		{
			Hmi.ui.hideDialog();
		}
	});
}

// Every icon below the root has a non-empty text and no key is missing
async function audit(page, rootExpr, min)
{
	var result = await page.evaluate(function(rootExpr)
	{
		var root = (rootExpr != null) ? (new Function('return ' + rootExpr))() : null;
		var bad = [];
		var keys = __icons(root).map(function(i)
		{
			var key = i.getAttribute('data-help');
			var info = Hmi.Help.text(key);

			if (info == null || info.text == null || info.text.replace(/\s+/g, '') === '' ||
				!info.title)
			{
				bad.push(key);
			}

			return key;
		});

		return {keys: keys, bad: bad, missing: Object.keys(Hmi.Help.missing)};
	}, rootExpr || null);
	assert.deepStrictEqual(result.bad, [], 'icons without text');
	assert.deepStrictEqual(result.missing, [], 'keys without text');
	assert.strictEqual(new Set(result.keys).size, result.keys.length,
		'duplicate keys ' + result.keys.join(' '));
	assert.ok(result.keys.length >= (min || 1), 'icons: ' + result.keys.length + ' ' + result.keys.join(' '));

	return result.keys;
}

// The icons do not change the height of the form rows, rows with a single line are 28 px high
async function checkHeights(page, rootExpr)
{
	var r = await page.evaluate(function(rootExpr)
	{
		return __heights((rootExpr != null) ? (new Function('return ' + rootExpr))() : null);
	}, rootExpr || null);
	assert.ok(r.withIcons.length > 0, 'rows with icons');

	for (var i = 0; i < r.withIcons.length; i++)
	{
		assert.ok(Math.abs(r.withIcons[i].height - r.without[i].height) < 0.5,
			'row height changed by the icon: ' + JSON.stringify([r.withIcons[i], r.without[i]]));

		if (!r.withIcons[i].area && /FormRow|CheckRow/.test(r.withIcons[i].cls))
		{
			assert.ok(r.withIcons[i].height >= 28 && r.withIcons[i].height <= 30,
				'row height ' + JSON.stringify(r.withIcons[i]));
		}
	}
}

async function popover(page)
{
	return page.evaluate(function()
	{
		var p = document.querySelector('.geHmiHelpPop');

		if (p == null)
		{
			return null;
		}

		var r = p.getBoundingClientRect();

		return {key: p.getAttribute('data-help-popover'), text: p.textContent,
			count: document.querySelectorAll('.geHmiHelpPop').length,
			inside: r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight};
	});
}

// Opens the popover of the key (screenshots in light and dark mode), closes it with Escape
async function shot(page, name, key)
{
	if (SHOTS == null)
	{
		return;
	}

	// Without a popover, to check the layout of the form itself
	fs.mkdirSync(path.join(SHOTS, 'plain'), {recursive: true});
	await page.screenshot({path: path.join(SHOTS, 'plain', name + '.png')});

	await page.evaluate(function(key)
	{
		var icon = document.querySelector('[data-help="' + key + '"]');
		icon.scrollIntoView({block: 'nearest'});
		icon.click();
	}, key);

	for (var scheme of ['light', 'dark'])
	{
		await page.emulateMedia({colorScheme: scheme});
		await page.waitForTimeout(80);
		await page.screenshot({path: path.join(SHOTS, name + '-' + scheme + '.png')});
	}

	await page.emulateMedia({colorScheme: 'light'});
	await page.keyboard.press('Escape');
}

async function seed(page)
{
	return page.evaluate(async function()
	{
		var ui = Hmi.ui;
		var graph = ui.editor.graph;
		var parent = graph.getDefaultParent();
		var cell = graph.insertVertex(parent, 'pump', 'Pump', 40, 40, 100, 60);
		var cell2 = graph.insertVertex(parent, 'tank', 'Tank', 200, 40, 100, 100);
		graph.insertEdge(parent, 'pipe', '', cell, cell2);
		Hmi.Model.setDocConfig(graph, {version: 1, sim: 'off', scripts: 'inherit',
			runtime: {fit: 'page', nav: 'tabs', maxRate: 30, quality: 'outline', panZoom: true},
			triggers: [{name: 'PageAlarm', conditions: [{tag: 'Tank.Level', operator: '>', value: 90}],
				conditionType: 'and', actions: [{type: 'notify', text: 'High', level: 'warn'}]}],
			sources: [
				{id: 'm1', name: 'Broker', type: 'mqtt', enabled: true, scope: 'file',
					url: 'wss://broker.example.com:8884/mqtt', topics: [{filter: 'plant/#', qos: 1}],
					format: {kind: 'topic', template: 'plant/{tag}'}, credentials: {mode: 'none'}},
				{id: 'w1', name: 'Gateway', type: 'ws', enabled: true, url: 'wss://gw.example.com/hmi',
					initMessage: '{"subscribe":1}', credentials: {mode: 'save', username: 'u', password: 'p'}},
				{id: 'h1', name: 'Poller', type: 'http', enabled: false, url: 'https://gw.example.com/api',
					method: 'POST', interval: 2000, body: '{}', credentials: {mode: 'param', param: 'tok'}},
				{id: 's1', name: 'Events', type: 'sse', enabled: true, url: 'https://gw.example.com/ev',
					events: ['message', 'alarm']},
				{id: 'x1', name: 'Host', type: 'host', enabled: true}],
			tags: [
				{name: 'Tank.Level', type: 'number', unit: '%', min: 0, max: 100, decimals: 1, access: 'rw',
					description: 'Level', sim: {kind: 'sine', min: 10, max: 90, period: 20000},
					write: {source: 'm1', topic: 'plant/cmd/${tag}', payload: '{"value":${value}}', mode: 'confirmed'},
					alarms: {hihi: 95, hi: 85, lo: 15, lolo: 5, deadband: 1, target: 50, minorDev: 10,
						majorDev: 20, roc: 5}, roles: ['eng']},
				{name: 'Pump.Run', type: 'boolean', access: 'rw', sim: {kind: 'toggle', interval: 2000}}]});
		Hmi.Model.setCellConfig(graph, [cell], 'bindings', [
			{tag: 'Tank.Level', target: 'style:fillColor', transform: {kind: 'scale', inMin: 0, inMax: 100,
				outMin: 0, outMax: 1, clamp: true}, format: {decimals: 1, unit: true}},
			{expr: 'tag("Pump.Run")', target: 'visible'}]);
		Hmi.Model.setCellConfig(graph, [cell], 'events', [{on: 'click', confirm: true,
			actions: [{type: 'toggleTag', tag: 'Pump.Run'}]}]);
		Hmi.Model.setCellConfig(graph, [cell], 'triggers', [{name: 'Hi',
			conditions: [{tag: 'Tank.Level', operator: '>', value: 90}], conditionType: 'and',
			actions: [{type: 'startAnimation', target: 'self', name: 'blink'}],
			elseActions: [{type: 'stopAnimation', target: 'self', name: 'blink'}]}]);
		Hmi.Model.setCellConfig(graph, [cell], 'animations', [{name: 'blink', preset: 'blink', params: {},
			autoPlay: true, duration: 1000}]);
		Hmi.Model.setCellConfig(graph, [cell], 'roles', ['eng']);
		Hmi.Model.setCellConfig(graph, [cell], 'links', {valueDiscrete: {expr: 'Pump.Run', onMessage: 'On',
			offMessage: 'Off'}});
		await __wait(100);

		return {cell: 'pump', tank: 'tank', edge: 'pipe'};
	});
}

// ---------------------------------------------------------------
// Data Sources
// ---------------------------------------------------------------

test('quick help: Data Sources tab, source editor for each protocol, test connection', async function()
{
	var page = await openPage();
	await seed(page);
	await page.evaluate(function()
	{
		Hmi.SourcesDialog.show(Hmi.ui);
	});
	await page.waitForSelector('.geDialog [data-help="sources.dialog"]');
	var keys = await audit(page, null, 3);
	assert.ok(keys.indexOf('sources.dialog') >= 0 && keys.indexOf('sources.list') >= 0 &&
		keys.indexOf('sources.add') >= 0, keys.join(' '));
	await shot(page, 'sources', 'sources.list');

	// The icon of the title opens its popover and keeps the dialog
	await page.click('.geDialog [data-help="sources.dialog"]');
	var pop = await popover(page);
	assert.strictEqual(pop.key, 'sources.dialog');
	assert.ok(pop.inside && pop.text.length > 60);
	await page.keyboard.press('Escape');
	assert.strictEqual(await popover(page), null);
	assert.ok(await page.$('.geDialog [data-help="sources.dialog"]'), 'dialog stays open');

	// A click on the icon of the list does not edit a source or toggle a box
	var checked = await page.$$eval('.geDialog input[type="checkbox"]', function(l)
	{
		return l.map(function(c)
		{
			return c.checked;
		});
	});
	await page.click('.geDialog [data-help="sources.list"]');
	assert.strictEqual((await popover(page)).key, 'sources.list');
	assert.deepStrictEqual(await page.$$eval('.geDialog input[type="checkbox"]', function(l)
	{
		return l.map(function(c)
		{
			return c.checked;
		});
	}), checked);
	await page.keyboard.press('Escape');

	// The editor of every source: type specific fields, URL help and credentials
	var expected = {
		mqtt: ['source.mqtt.clientId', 'source.mqtt.keepalive', 'source.mqtt.topics', 'source.mqtt.cleanSession'],
		ws: ['source.ws.initMessage'],
		http: ['source.http.method', 'source.http.interval', 'source.http.body'],
		sse: ['source.sse.events'],
		host: []};
	var common = ['source.dialog', 'source.name', 'source.type', 'source.scope', 'source.prefix',
		'source.format', 'source.format.template', 'source.scripts', 'source.parser', 'source.preConnect',
		'source.credentials'];

	for (var index = 0; index < 5; index++)
	{
		await page.evaluate(function(i)
		{
			var rows = Hmi.ui.dialog.container.querySelectorAll('[data-source]');
			rows[i].children[1].click();
		}, index);
		await page.waitForSelector('.geDialog [data-help="source.dialog"]');
		var type = await page.evaluate(function()
		{
			return Hmi.ui.dialog.container.querySelector('select').value;
		});
		var visible = await page.evaluate(function()
		{
			return __visible();
		});
		await audit(page, null, 8);
		await checkHeights(page);
		common.concat(expected[type]).forEach(function(k)
		{
			assert.ok(visible.indexOf(k) >= 0, type + ' lacks ' + k + ': ' + visible.join(' '));
		});

		// Fields of the other protocols are not there
		Object.keys(expected).forEach(function(other)
		{
			if (other != type)
			{
				expected[other].forEach(function(k)
				{
					assert.ok(visible.indexOf(k) < 0, type + ' shows ' + k);
				});
			}
		});

		if (type == 'host')
		{
			assert.ok(visible.indexOf('source.url.host') < 0 && visible.indexOf('source.url') < 0);
		}
		else
		{
			assert.ok(visible.indexOf('source.url.' + type) >= 0 || visible.indexOf('source.url') >= 0, visible.join(' '));
		}

		if (type == 'mqtt')
		{
			await shot(page, 'source-mqtt', 'source.mqtt.topics');

			// Icon next to a checkbox does not toggle it
			var before = await page.evaluate(function()
			{
				return document.querySelector('[data-help="source.mqtt.cleanSession"]')
					.parentNode.querySelector('input').checked;
			});
			await page.click('.geDialog [data-help="source.mqtt.cleanSession"]');
			assert.strictEqual((await popover(page)).key, 'source.mqtt.cleanSession');
			assert.strictEqual(await page.evaluate(function()
			{
				return document.querySelector('[data-help="source.mqtt.cleanSession"]')
					.parentNode.querySelector('input').checked;
			}), before);
			await page.keyboard.press('Escape');
		}

		if (type == 'ws')
		{
			// Credentials mode: save shows the user name and the password
			assert.ok(visible.indexOf('source.credentials.username') >= 0);
			assert.ok(visible.indexOf('source.credentials.password') >= 0);
			await shot(page, 'source-ws', 'source.credentials');
		}

		if (type == 'http')
		{
			assert.ok(visible.indexOf('source.credentials.param') >= 0);
		}

		// Cancel the editor (the list stays)
		await page.evaluate(function()
		{
			Hmi.ui.hideDialog();
		});
		await page.waitForSelector('.geDialog [data-help="sources.list"]');
	}

	// Switching the type in the editor changes the URL help and the fields
	await page.evaluate(function()
	{
		var rows = Hmi.ui.dialog.container.querySelectorAll('[data-source]');
		rows[0].children[1].click();
	});
	await page.waitForSelector('.geDialog [data-help="source.dialog"]');

	for (var t of ['http', 'sse', 'ws', 'host', 'mqtt'])
	{
		var urlKey = await page.evaluate(async function(t)
		{
			var sel = Hmi.ui.dialog.container.querySelector('select');
			sel.value = t;
			sel.dispatchEvent(new Event('change', {bubbles: true}));
			await __wait();

			return __visible().filter(function(k)
			{
				return /^source\.url/.test(k);
			});
		}, t);
		assert.deepStrictEqual(urlKey, (t == 'host') ? [] : ['source.url.' + t], t);
		await audit(page, null, 8);
	}

	// Credentials: prompt shows no fields, save shows two
	var credCounts = await page.evaluate(async function()
	{
		var sels = Hmi.ui.dialog.container.querySelectorAll('select');
		var mode = sels[sels.length - 1];
		var counts = {};

		for (var m of ['none', 'save', 'prompt', 'param'])
		{
			mode.value = m;
			mode.dispatchEvent(new Event('change', {bubbles: true}));
			await __wait();
			counts[m] = __visible().filter(function(k)
			{
				return /^source\.credentials\./.test(k);
			});
		}

		return counts;
	});
	assert.deepStrictEqual(credCounts, {none: [], save: ['source.credentials.username',
		'source.credentials.password'], prompt: [], param: ['source.credentials.param']});
	await closeAll(page);

	// Test connection
	await page.evaluate(function()
	{
		Hmi.SourcesDialog.testConnection(Hmi.ui, {id: 'h9', name: 'Poller', type: 'http',
			url: 'http://127.0.0.1:1/none', interval: 1000, enabled: true});
	});
	await page.waitForSelector('.geDialog [data-help="source.test"]');
	var testKeys = await audit(page, null, 2);
	assert.deepStrictEqual(testKeys.sort(), ['source.test', 'source.test.status']);
	await shot(page, 'source-test', 'source.test.status');
	await closeAll(page);

	// Credentials prompt of the runtime
	await page.evaluate(function()
	{
		Hmi.CredentialsDialog.show(Hmi.ui, {id: 'm1', name: 'Broker'}, function() {});
	});
	await page.waitForSelector('.geDialog [data-help="credentials.dialog"]');
	var credKeys = await audit(page, null, 4);
	assert.deepStrictEqual(credKeys.sort(), ['credentials.dialog', 'credentials.password',
		'credentials.token', 'credentials.username']);
	await checkHeights(page);
	await shot(page, 'credentials', 'credentials.token');
	await closeAll(page);
	assert.deepStrictEqual(page.hmiErrors, []);
	await page.close();
});

// ---------------------------------------------------------------
// Tags
// ---------------------------------------------------------------

test('quick help: Tags and Runtime tabs and tag editor with every simulation kind and the alarm section', async function()
{
	var page = await openPage();
	await seed(page);
	await page.evaluate(function()
	{
		Hmi.TagsDialog.show(Hmi.ui);
	});
	await page.waitForSelector('.geDialog [data-help="tags.dialog"]');
	var keys = await audit(page, null, 15);
	['tags.dialog', 'tags.sim', 'tags.scripts', 'tags.fit', 'tags.nav', 'tags.maxRate', 'tags.quality',
		'tags.panZoom', 'tags.width', 'tags.height', 'tags.add', 'tags.exchange', 'tags.list',
		'tags.col.name', 'tags.col.type', 'tags.col.unit', 'tags.col.access'].forEach(function(k)
	{
		assert.ok(keys.indexOf(k) >= 0, 'missing ' + k);
	});
	await shot(page, 'tags', 'tags.sim');

	// The icon next to the checkbox does not toggle it (Runtime tab)
	await page.click('.geDialog [data-tab="runtime"]');
	await checkHeights(page);
	var pz = await page.evaluate(function()
	{
		return document.querySelector('[data-help="tags.panZoom"]').parentNode.querySelector('input').checked;
	});
	await page.click('.geDialog [data-help="tags.panZoom"]');
	assert.strictEqual((await popover(page)).key, 'tags.panZoom');
	assert.strictEqual(await page.evaluate(function()
	{
		return document.querySelector('[data-help="tags.panZoom"]').parentNode.querySelector('input').checked;
	}), pz);
	await page.keyboard.press('Escape');

	// The header icon of a column does not open the editor
	await page.click('.geDialog [data-tab="tags"]');
	await page.click('.geDialog [data-help="tags.col.type"]');
	assert.strictEqual((await popover(page)).key, 'tags.col.type');
	assert.strictEqual(await page.$('.geDialog [data-dialog="tag-editor"]'), null);
	await page.keyboard.press('Escape');

	// The editor of the tag with simulation, write target and alarms
	await page.evaluate(function()
	{
		Hmi.ui.dialog.container.querySelector('table td').click();
	});
	await page.waitForSelector('.geDialog [data-dialog="tag-editor"]');
	var tagKeys = await audit(page, null, 30);
	['tag.dialog', 'tag.name', 'tag.type', 'tag.unit', 'tag.access', 'tag.description', 'tag.min', 'tag.max',
		'tag.decimals', 'tag.format', 'tag.initial', 'tag.staleMs', 'tag.local', 'tag.expr', 'tag.roles',
		'tag.sim', 'tag.sim.kind', 'tag.write', 'tag.write.source', 'tag.write.topic', 'tag.write.payload',
		'tag.write.mode', 'tag.alarms', 'tag.alarms.hihi', 'tag.alarms.hi', 'tag.alarms.lo', 'tag.alarms.lolo',
		'tag.alarms.deadband', 'tag.alarms.bool', 'tag.alarms.target', 'tag.alarms.minorDev',
		'tag.alarms.majorDev', 'tag.alarms.roc'].forEach(function(k)
	{
		assert.ok(tagKeys.indexOf(k) >= 0, 'missing ' + k);
	});
	await checkHeights(page);
	await shot(page, 'tag-editor', 'tag.sim.kind');
	await shot(page, 'tag-alarms', 'tag.alarms.target');

	// The fields of every simulation kind
	var kinds = {
		'': [],
		random: ['tag.sim.min', 'tag.sim.max', 'tag.sim.interval', 'tag.sim.integer'],
		sine: ['tag.sim.min', 'tag.sim.max', 'tag.sim.period', 'tag.sim.interval'],
		ramp: ['tag.sim.min', 'tag.sim.max', 'tag.sim.step', 'tag.sim.interval'],
		list: ['tag.sim.values', 'tag.sim.interval'],
		toggle: ['tag.sim.interval'],
		constant: ['tag.sim.values'],
		script: ['tag.sim.code', 'tag.sim.interval']};

	for (var kind of Object.keys(kinds))
	{
		var visible = await page.evaluate(async function(kind)
		{
			var sel = Hmi.ui.dialog.container.querySelector('[data-help="tag.sim.kind"]')
				.parentNode.parentNode.querySelector('select');
			sel.value = kind;
			sel.dispatchEvent(new Event('change', {bubbles: true}));
			await __wait();

			return __visible().filter(function(k)
			{
				return /^tag\.sim\./.test(k) && k != 'tag.sim.kind';
			});
		}, kind);
		assert.deepStrictEqual(visible.sort(), kinds[kind].slice().sort(), 'sim kind "' + kind + '"');
		await audit(page, null, 30);
		await checkHeights(page);

		if (kind == 'script')
		{
			await shot(page, 'tag-sim-script', 'tag.sim.code');
		}
	}

	// The checkbox of the tag editor
	var local = await page.evaluate(function()
	{
		return document.querySelector('[data-help="tag.local"]').parentNode.querySelector('input').checked;
	});
	await page.click('.geDialog [data-help="tag.local"]');
	assert.strictEqual((await popover(page)).key, 'tag.local');
	assert.strictEqual(await page.evaluate(function()
	{
		return document.querySelector('[data-help="tag.local"]').parentNode.querySelector('input').checked;
	}), local);
	await page.keyboard.press('Escape');
	assert.ok(await page.$('.geDialog [data-dialog="tag-editor"]'), 'the editor stays open');

	// Saving keeps the alarm and write settings of the tag
	await page.evaluate(function()
	{
		Hmi.ui.dialog.container.querySelector('[data-help="tag.sim.kind"]').parentNode.parentNode
			.querySelector('select').value = 'sine';
		Hmi.ui.dialog.container.querySelector('[data-help="tag.sim.kind"]').parentNode.parentNode
			.querySelector('select').dispatchEvent(new Event('change', {bubbles: true}));
		Hmi.ui.dialog.container.querySelector('.gePrimaryBtn').click();
	});
	await page.waitForSelector('.geDialog [data-help="tags.dialog"]');
	await page.evaluate(function()
	{
		Hmi.ui.dialog.container.querySelector('.gePrimaryBtn').click();
	});
	var tag = await page.evaluate(function()
	{
		return Hmi.Model.getDocConfig(Hmi.ui.editor.graph).tags[0];
	});
	assert.deepStrictEqual(tag.alarms.hihi, 95);
	assert.strictEqual(tag.alarms.target, 50);
	assert.strictEqual(tag.alarms.minorDev, 10);
	assert.strictEqual(tag.alarms.majorDev, 20);
	assert.strictEqual(tag.alarms.roc, 5);
	assert.strictEqual(tag.alarms.deadband, 1);
	assert.deepStrictEqual(tag.roles, ['eng']);
	assert.strictEqual(tag.write.source, 'm1');
	assert.strictEqual(tag.sim.kind, 'sine');
	assert.strictEqual(tag.sim.period, 20000);
	assert.strictEqual(tag.description, 'Level');

	// A new tag
	await page.evaluate(function()
	{
		Hmi.TagsDialog.showTagEditor(Hmi.ui, {name: '', type: 'number', access: 'r'}, function() {});
	});
	await page.waitForSelector('.geDialog [data-dialog="tag-editor"]');
	await audit(page, null, 30);
	await closeAll(page);
	assert.deepStrictEqual(page.hmiErrors, []);
	await page.close();
});

// ---------------------------------------------------------------
// Tag Browser, Substitute and Define Missing Tags
// ---------------------------------------------------------------

test('quick help: Tag Browser (window and select mode), Substitute Tags and Define Missing Tags', async function()
{
	var page = await openPage();
	await seed(page);

	// Select mode
	await page.evaluate(function()
	{
		Hmi.TagBrowser.select(Hmi.ui, function() {}, {});
	});
	await page.waitForSelector('.geDialog [data-help="tagBrowser.select"]');
	var keys = await audit(page, null, 7);
	['tagBrowser.select', 'tagBrowser.select.filter', 'tagBrowser.select.view', 'tagBrowser.pick.name',
		'tagBrowser.pick.type', 'tagBrowser.pick.unit', 'tagBrowser.pick.description'].forEach(function(k)
	{
		assert.ok(keys.indexOf(k) >= 0, 'missing ' + k);
	});
	await checkHeights(page);
	await shot(page, 'tag-select', 'tagBrowser.select.filter');

	// The list view has no column headers
	await page.evaluate(async function()
	{
		var sel = Hmi.ui.dialog.container.querySelectorAll('select')[0];
		sel.value = 'list';
		sel.dispatchEvent(new Event('change', {bubbles: true}));
		await __wait();
	});
	await audit(page, null, 3);
	assert.strictEqual((await page.evaluate(function()
	{
		return __visible();
	})).filter(function(k)
	{
		return /^tagBrowser\.pick/.test(k);
	}).length, 0);

	// A click on an icon of a row does not select a tag
	await page.click('.geDialog [data-help="tagBrowser.select.filter"]');
	assert.strictEqual((await popover(page)).key, 'tagBrowser.select.filter');
	await page.keyboard.press('Escape');
	await closeAll(page);

	// The window
	await page.evaluate(async function()
	{
		Hmi.ui.hmi.run({mode: 'preview', sim: 'only'});
		await __wait(500);
		Hmi.TagBrowser.show(Hmi.ui);
		await __wait(200);
	});
	var win = 'Hmi.ui.hmiTagBrowserWindow.window.div';
	var wkeys = await audit(page, win, 6);
	['tagBrowser.window', 'tagBrowser.filter', 'tagBrowser.view', 'tagBrowser.col.name',
		'tagBrowser.col.value', 'tagBrowser.col.quality', 'tagBrowser.col.override'].forEach(function(k)
	{
		assert.ok(wkeys.indexOf(k) >= 0, 'missing ' + k);
	});
	await shot(page, 'tag-browser', 'tagBrowser.col.override');

	// The icon in the title bar does not move the window and keeps it open
	var before = await page.evaluate(function()
	{
		var r = Hmi.ui.hmiTagBrowserWindow.window.div.getBoundingClientRect();

		return [r.left, r.top];
	});
	await page.click('[data-help="tagBrowser.window"]');
	assert.strictEqual((await popover(page)).key, 'tagBrowser.window');
	await page.keyboard.press('Escape');
	assert.deepStrictEqual(await page.evaluate(function()
	{
		var r = Hmi.ui.hmiTagBrowserWindow.window.div.getBoundingClientRect();

		return [r.left, r.top];
	}), before);
	await page.evaluate(function()
	{
		Hmi.ui.hmiTagBrowserWindow.window.setVisible(false);
		Hmi.ui.hmi.stop();
	});

	// Substitute Tags of the selected object
	await page.evaluate(async function()
	{
		var graph = Hmi.ui.editor.graph;
		graph.setSelectionCell(graph.model.getCell('pump'));
		Hmi.SubstituteTags.show(Hmi.ui, [graph.model.getCell('pump')]);
		await __wait(100);
	});
	await page.waitForSelector('.geDialog [data-dialog="substitute-tags"]');
	var sk = await audit(page, null, 3);
	assert.deepStrictEqual(sk.sort(), ['substitute.dialog', 'substitute.new', 'substitute.old']);
	await checkHeights(page).catch(function() {});
	await shot(page, 'substitute', 'substitute.new');
	await closeAll(page);

	// Define Missing Tags: a tag that is used but not declared
	await page.evaluate(async function()
	{
		var graph = Hmi.ui.editor.graph;
		Hmi.Model.setCellConfig(graph, [graph.model.getCell('tank')], 'bindings',
			[{tag: 'Undeclared.A', target: 'label'}, {tag: 'Undeclared.B', target: 'visible'}]);
		Hmi.SubstituteTags.defineMissing(Hmi.ui);
		await __wait(100);
	});
	await page.waitForSelector('.geDialog [data-dialog="define-missing-tags"]');
	var dk = await audit(page, null, 4);
	assert.deepStrictEqual(dk.sort(), ['define.col.name', 'define.col.type', 'define.col.use', 'define.dialog']);
	await shot(page, 'define-missing', 'define.col.type');

	// A click on the header icon of the checkbox column does not change the checkboxes
	var states = await page.$$eval('.geDialog [data-field="define"]', function(l)
	{
		return l.map(function(c)
		{
			return c.checked;
		});
	});
	await page.click('.geDialog [data-help="define.col.use"]');
	assert.strictEqual((await popover(page)).key, 'define.col.use');
	assert.deepStrictEqual(await page.$$eval('.geDialog [data-field="define"]', function(l)
	{
		return l.map(function(c)
		{
			return c.checked;
		});
	}), states);
	await page.keyboard.press('Escape');
	await closeAll(page);
	assert.deepStrictEqual(page.hmiErrors, []);
	await page.close();
});

// ---------------------------------------------------------------
// Validator, Diagnostics, Alarm list
// ---------------------------------------------------------------

test('quick help: Validator, Diagnostics and Alarm list windows', async function()
{
	var page = await openPage();
	await seed(page);
	await page.evaluate(async function()
	{
		Hmi.Validator.show(Hmi.ui);
		await __wait(100);
	});
	var vkeys = await audit(page, 'document.body', 3);
	assert.ok(vkeys.indexOf('validator.window') >= 0 && vkeys.indexOf('validator.summary') >= 0 &&
		vkeys.indexOf('validator.list') >= 0, vkeys.join(' '));
	await shot(page, 'validator', 'validator.list');

	// A click on an icon of the summary does not close the window
	await page.click('[data-help="validator.summary"]');
	assert.strictEqual((await popover(page)).key, 'validator.summary');
	await page.keyboard.press('Escape');
	assert.ok(await page.$('[data-help="validator.window"]'));
	await page.evaluate(function()
	{
		Array.prototype.forEach.call(document.querySelectorAll('.mxWindow'), function(w)
		{
			w.style.display = 'none';
		});
	});

	// Diagnostics need a running screen
	await page.evaluate(async function()
	{
		Hmi.ui.hmi.run({mode: 'preview', sim: 'only'});
		await __wait(500);
		Hmi.Diagnostics.show(Hmi.ui);
		await __wait(200);
	});
	var diag = 'Hmi.ui.hmiDiagnosticsWindow.div';
	var dkeys = await audit(page, diag, 12);
	['diag.window', 'diag.tab.sources', 'diag.tab.rate', 'diag.tab.log', 'diag.tab.writes',
		'diag.sources.name', 'diag.sources.type', 'diag.sources.state', 'diag.sources.received',
		'diag.sources.errors', 'diag.sources.lastMessage', 'diag.sources.lastError', 'diag.rate.frames',
		'diag.rate.updates', 'diag.rate.flushed', 'diag.log.level', 'diag.log.category',
		'diag.writes.list'].forEach(function(k)
	{
		assert.ok(dkeys.indexOf(k) >= 0, 'missing ' + k);
	});
	await shot(page, 'diagnostics', 'diag.sources.state');

	// The icon of a tab does not switch to the tab
	await page.click('[data-help="diag.tab.log"]');
	assert.strictEqual((await popover(page)).key, 'diag.tab.log');
	assert.notStrictEqual(await page.evaluate(function()
	{
		return Hmi.ui.hmiDiagnosticsWindow.div.querySelector('[data-help="diag.log.level"]')
			.closest('div[style*="display: none"]') == null;
	}), true);
	await page.keyboard.press('Escape');

	// Select the tabs: the icons of each panel are there
	for (var tab of ['hmiRateTab', 'hmiLogTab', 'hmiWritesTab'])
	{
		await page.evaluate(function(tab)
		{
			var name = mxResources.get(tab);
			var a = Array.prototype.filter.call(Hmi.ui.hmiDiagnosticsWindow.div.querySelectorAll('a'), function(e)
			{
				return e.firstChild != null && e.firstChild.nodeValue == name;
			})[0];
			a.click();
		}, tab);
		await audit(page, diag, 12);
	}

	await shot(page, 'diagnostics-log', 'diag.log.level');

	// Alarm list
	await page.evaluate(async function()
	{
		Hmi.AlarmList.show(Hmi.ui);
		await __wait(100);
	});
	var akeys = await audit(page, 'Hmi.ui.hmiAlarmListWindow.div', 2);
	assert.deepStrictEqual(akeys.sort(), ['alarmList.ackAll', 'alarmList.window']);
	await shot(page, 'alarm-list', 'alarmList.ackAll');
	await page.evaluate(function()
	{
		Hmi.ui.hmi.stop();
	});
	assert.deepStrictEqual(page.hmiErrors, []);
	await page.close();
});

// ---------------------------------------------------------------
// HMI tab and its item editors
// ---------------------------------------------------------------

async function showHmiTab(page, id)
{
	await page.evaluate(async function(id)
	{
		var graph = Hmi.ui.editor.graph;

		if (id == null)
		{
			graph.clearSelection();
		}
		else
		{
			graph.setSelectionCell(graph.model.getCell(id));
		}

		await __wait(300);
		var tab = Array.prototype.filter.call(document.querySelectorAll('.geFormatTitle'), function(e)
		{
			return e.textContent == 'HMI';
		})[0];
		tab.click();
		await __wait(300);
	}, id);
}

function hmiPanel()
{
	return 'Hmi.ui.format.container.lastChild';
}

test('quick help: HMI tab of the page and of an object, with the item editors', async function()
{
	var page = await openPage();
	var ids = await seed(page);

	// Nothing selected: the page summary and the buttons
	await showHmiTab(page);
	var keys = await audit(page, hmiPanel(), 9);
	['hmiTab.document', 'hmiTab.summary', 'hmiTab.screenSettings', 'hmiTab.tagBrowser',
		'hmiTab.substitute', 'hmiTab.defineMissing', 'hmiTab.validate', 'hmiTab.livePreview',
		'hmiTab.runScreen'].forEach(function(k)
	{
		assert.ok(keys.indexOf(k) >= 0, 'missing ' + k);
	});
	await shot(page, 'hmitab-document', 'hmiTab.screenSettings');

	// An icon on a button does not run the button, the button keeps its size
	var sizes = await page.evaluate(function()
	{
		var panel = Hmi.ui.format.container.lastChild;
		var btn = panel.querySelector('[data-help="hmiTab.screenSettings"]').parentNode.querySelector('button');
		var r = btn.getBoundingClientRect();
		var wrap = btn.parentNode.getBoundingClientRect();
		var icon = panel.querySelector('[data-help="hmiTab.screenSettings"]').getBoundingClientRect();

		return {btn: r.height, wrap: wrap.height, inside: icon.left >= r.left && icon.right <= r.right &&
			icon.top >= r.top && icon.bottom <= r.bottom, panelWidth: panel.getBoundingClientRect().width,
			btnWidth: r.width};
	});
	assert.ok(sizes.inside, JSON.stringify(sizes));
	assert.strictEqual(sizes.btn, sizes.wrap);
	await page.click('[data-help="hmiTab.screenSettings"]');
	assert.strictEqual((await popover(page)).key, 'hmiTab.screenSettings');
	assert.strictEqual(await page.$('.geDialog'), null, 'Screen Settings did not open');
	await page.keyboard.press('Escape');

	// An object: the summary of the links and the buttons
	await showHmiTab(page, ids.cell);
	keys = await audit(page, hmiPanel(), 3);
	['hmiTab.object', 'hmiTab.links', 'hmiTab.linksButton', 'hmiTab.tagBrowser'].forEach(function(k)
	{
		assert.ok(keys.indexOf(k) >= 0, 'missing ' + k);
	});
	assert.ok(keys.indexOf('hmiTab.quickAdd') < 0 && keys.indexOf('hmiTab.bindings') < 0 &&
		keys.indexOf('hmiTab.halo') < 0, 'the old sections are gone');
	await shot(page, 'hmitab-object', 'hmiTab.links');
	await page.click('[data-help="hmiTab.linksButton"]');
	assert.strictEqual((await popover(page)).key, 'hmiTab.linksButton');
	assert.strictEqual(await page.$('.geDialog'), null, 'Animation Links did not open');
	await page.keyboard.press('Escape');

	// An edge has the same summary
	await showHmiTab(page, ids.edge);
	await audit(page, hmiPanel(), 3);
	await showHmiTab(page, ids.cell);

	// Item editors of the Animation Links dialog (opened here directly)
	var sections = {bindings: ['binding.dialog', 'buildBindingEditor', {tag: '', target: 'label'}],
		events: ['event.dialog', 'buildEventEditor', {on: 'click', actions: []}],
		triggers: ['trigger.dialog', 'buildTriggerEditor', {name: '', conditions: [], conditionType: 'and',
			actions: []}],
		animations: ['animation.dialog', 'buildAnimationEditor', {name: 'anim', preset: 'blink', params: {}}]};

	for (var key of Object.keys(sections))
	{
		await page.evaluate(function(args)
		{
			Hmi.Editors.showItemDialog({ui: Hmi.ui, title: args.key, helpKey: args.sec[0], kind: args.key,
				value: args.sec[2], buildEditor: Hmi.FormatPanel[args.sec[1]], onSave: function() {}});
		}, {key: key, sec: sections[key]});
		await page.waitForSelector('.geDialog [data-help="' + sections[key][0] + '"]');
		var ek = await audit(page, null, 3);
		await checkHeights(page);
		await shot(page, 'item-' + key, ek[ek.length - 1]);
		await closeAll(page);
	}

	// Edit the existing items too
	await page.evaluate(function()
	{
		Hmi.Editors.showItemDialog({ui: Hmi.ui, title: 'Binding', helpKey: 'binding.dialog', kind: 'bindings',
			value: Hmi.Model.getCellConfig(Hmi.ui.editor.graph.model.getCell('pump')).bindings[0],
			buildEditor: Hmi.FormatPanel.buildBindingEditor, onSave: function() {}});
	});
	await page.waitForSelector('.geDialog [data-help="binding.dialog"]');
	var bk = await audit(page, null, 8);
	['binding.dialog', 'binding.tag', 'binding.expr', 'binding.target', 'transform.kind', 'binding.decimals',
		'binding.unit', 'item.json'].forEach(function(k)
	{
		assert.ok(bk.indexOf(k) >= 0, 'missing ' + k);
	});
	var unit = await page.evaluate(function()
	{
		return document.querySelector('.geDialog [data-help="binding.unit"]').parentNode.querySelector('input').checked;
	});
	await page.click('.geDialog [data-help="binding.unit"]');
	assert.strictEqual((await popover(page)).key, 'binding.unit');
	assert.strictEqual(await page.evaluate(function()
	{
		return document.querySelector('.geDialog [data-help="binding.unit"]').parentNode.querySelector('input').checked;
	}), unit);
	await page.keyboard.press('Escape');

	// The JSON toggle keeps its function next to its icon
	console.log('DBG', await page.evaluate(function()
	{
		var i = document.querySelector('.geDialog [data-help="item.json"]');
		var r = i.getBoundingClientRect();
		var e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);

		return [document.querySelectorAll('.geDialog').length, r.left, r.top, e == i, e && e.className, e && e.outerHTML.substring(0, 80)];
	}));
	await page.click('.geDialog [data-help="item.json"]');
	await page.waitForSelector('.geHmiHelpPop');
	assert.strictEqual((await popover(page)).key, 'item.json');
	assert.strictEqual(await page.$('.geDialog textarea'), null, 'the icon does not show the JSON');
	await page.keyboard.press('Escape');
	await closeAll(page);
	assert.deepStrictEqual(page.hmiErrors, []);
	await page.close();
});

test('quick help: transform, condition, target and action editors with every type', async function()
{
	var page = await openPage();
	await seed(page);

	// Transform: every kind
	var tk = await page.evaluate(async function()
	{
		Hmi.Editors.showItemDialog({ui: Hmi.ui, title: 'Binding', helpKey: 'binding.dialog', kind: 'bindings',
			value: {tag: 'a', target: 'label'}, buildEditor: Hmi.FormatPanel.buildBindingEditor,
			onSave: function() {}});
		await __wait(100);
		var sel = Hmi.ui.dialog.container.querySelector('[data-help="transform.kind"]').parentNode.parentNode
			.querySelector('select');
		var result = {};

		for (var kind of ['', 'scale', 'map', 'invert', 'expr', 'script'])
		{
			sel.value = kind;
			sel.dispatchEvent(new Event('change', {bubbles: true}));
			await __wait();
			result[kind] = __visible().filter(function(k)
			{
				return /^transform\./.test(k);
			});
		}

		return result;
	});
	assert.deepStrictEqual(tk, {'': ['transform.kind'], scale: ['transform.kind', 'transform.in', 'transform.out'],
		map: ['transform.kind', 'transform.entries', 'transform.default'], invert: ['transform.kind'],
		expr: ['transform.kind', 'transform.expr'], script: ['transform.kind', 'transform.script']});
	await audit(page, null, 6);
	await checkHeights(page);
	await page.evaluate(async function()
	{
		var sel = Hmi.ui.dialog.container.querySelector('[data-help="transform.kind"]').parentNode.parentNode
			.querySelector('select');
		sel.value = 'map';
		sel.dispatchEvent(new Event('change', {bubbles: true}));
		await __wait();
	});
	await shot(page, 'transform-map', 'transform.entries');
	await closeAll(page);

	// Event editor with its message name, the action list and the condition list of a trigger
	await page.evaluate(async function()
	{
		Hmi.Editors.showItemDialog({ui: Hmi.ui, title: 'Event', helpKey: 'event.dialog', kind: 'events',
			value: {on: 'message', message: 'x', actions: []}, buildEditor: Hmi.FormatPanel.buildEventEditor,
			onSave: function() {}});
		await __wait(100);
	});
	var evKeys = await audit(page, null, 5);
	['event.dialog', 'event.on', 'event.message', 'event.confirm', 'event.actions'].forEach(function(k)
	{
		assert.ok(evKeys.indexOf(k) >= 0, 'missing ' + k);
	});
	await checkHeights(page);

	// The add button of the action list opens the action editor
	await page.evaluate(function()
	{
		Array.prototype.filter.call(Hmi.ui.dialog.container.querySelectorAll('button'), function(b)
		{
			return b.textContent == mxResources.get('hmiAddItem');
		})[0].click();
	});
	await page.waitForSelector('.geDialog [data-help="action.dialog"]');
	await audit(page, null, 3);
	await closeAll(page);

	await page.evaluate(async function()
	{
		Hmi.Editors.showItemDialog({ui: Hmi.ui, title: 'Trigger', helpKey: 'trigger.dialog', kind: 'triggers',
			value: {name: 'T', conditions: [{tag: 'a', operator: '>', value: 1}], conditionType: 'and',
				actions: [], elseActions: []}, buildEditor: Hmi.FormatPanel.buildTriggerEditor,
			onSave: function() {}});
		await __wait(100);
	});
	var trKeys = await audit(page, null, 6);
	['trigger.dialog', 'trigger.name', 'trigger.conditionType', 'trigger.conditions', 'trigger.actions',
		'trigger.elseActions'].forEach(function(k)
	{
		assert.ok(trKeys.indexOf(k) >= 0, 'missing ' + k);
	});
	await checkHeights(page);
	await shot(page, 'trigger', 'trigger.conditions');

	// Condition editor: every operator
	await page.evaluate(function()
	{
		var rows = Hmi.ui.dialog.container.querySelectorAll('.geHmiItemRow span');
		rows[0].click();
	});
	await page.waitForSelector('.geDialog [data-help="condition.dialog"]');
	var ck = await page.evaluate(async function()
	{
		var sel = Hmi.ui.dialog.container.querySelector('[data-help="condition.operator"]').parentNode.parentNode
			.querySelector('select');
		var result = {};

		for (var op of ['==', 'range', 'in', 'changed', 'isBad', 'true'])
		{
			sel.value = op;
			sel.dispatchEvent(new Event('change', {bubbles: true}));
			await __wait();
			result[op] = __visible().filter(function(k)
			{
				return /^condition\.value/.test(k);
			}).length;
		}

		return result;
	});
	assert.deepStrictEqual(ck, {'==': 1, range: 1, 'in': 1, changed: 0, isBad: 0, 'true': 0});
	var cKeys = await audit(page, null, 5);
	['condition.dialog', 'condition.tag', 'condition.expr', 'condition.operator'].forEach(function(k)
	{
		assert.ok(cKeys.indexOf(k) >= 0, 'missing ' + k);
	});
	await checkHeights(page);
	await shot(page, 'condition', 'condition.operator');
	await closeAll(page);

	// Action editor: every type and every target mode
	var types = ['setProps', 'writeTag', 'toggleTag', 'pulseTag', 'navigate', 'openUrl', 'dialog',
		'startAnimation', 'pauseAnimation', 'stopAnimation', 'emit', 'send', 'notify', 'postMessage',
		'script', 'drawioAction', 'ackAlarms', 'playMedia'];
	await page.evaluate(async function()
	{
		Hmi.Editors.showItemDialog({ui: Hmi.ui, title: 'Action', helpKey: 'action.dialog', kind: 'events',
			value: {type: 'writeTag'}, buildEditor: Hmi.Editors.actionEditor, onSave: function() {}});
		await __wait(100);
	});
	var seen = {};

	for (var type of types)
	{
		var info = await page.evaluate(async function(type)
		{
			var sel = Hmi.ui.dialog.container.querySelector('[data-help="action.type"]').parentNode.parentNode
				.querySelector('select');
			sel.value = type;
			sel.dispatchEvent(new Event('change', {bubbles: true}));
			await __wait();
			var modes = {};

			var mode = Hmi.ui.dialog.container.querySelector('[data-help="target.kind"]');

			if (mode != null)
			{
				var ms = mode.parentNode.parentNode.querySelector('select');

				for (var m of ['self', 'cells', 'tags', 'layers'])
				{
					ms.value = m;
					ms.dispatchEvent(new Event('change', {bubbles: true}));
					await __wait();
					modes[m] = __visible().filter(function(k)
					{
						return k == 'target.value';
					}).length;
				}
			}

			return {keys: __visible(), modes: modes};
		}, type);
		await audit(page, null, 4);
		await checkHeights(page);
		info.keys.forEach(function(k)
		{
			seen[k] = true;
		});

		if (Object.keys(info.modes).length > 0)
		{
			assert.deepStrictEqual(info.modes, {self: 0, cells: 1, tags: 1, layers: 1}, type);
		}

		if (type == 'writeTag')
		{
			assert.ok(info.keys.indexOf('action.tag') >= 0 && info.keys.indexOf('action.value') >= 0 &&
				info.keys.indexOf('action.expr') >= 0, info.keys.join(' '));
		}

		if (type == 'dialog')
		{
			['action.page', 'action.url', 'action.dialogTitle', 'action.width', 'action.height'].forEach(function(k)
			{
				assert.ok(info.keys.indexOf(k) >= 0, 'dialog lacks ' + k);
			});
		}

		if (type == 'setProps')
		{
			await shot(page, 'action-setprops', 'target.kind');
		}
	}

	// Every field of every action type has an icon
	['action.type', 'action.delay', 'action.tag', 'action.value', 'action.expr', 'action.reset',
		'action.duration', 'action.page', 'action.url', 'action.dialogTitle', 'action.width', 'action.height',
		'action.animationName', 'action.label', 'action.styleJson', 'action.command', 'action.eventName',
		'action.payload', 'action.sourceId', 'action.topic', 'action.text', 'action.level', 'action.postTo',
		'action.data', 'action.script', 'action.drawioAction', 'target.kind'].forEach(function(k)
	{
		assert.ok(seen[k], 'no action type shows ' + k);
	});
	await closeAll(page);

	// Animation editor
	await page.evaluate(async function()
	{
		Hmi.Editors.showItemDialog({ui: Hmi.ui, title: 'Animation', helpKey: 'animation.dialog',
			kind: 'animations', value: {name: 'a', preset: 'spin', params: {rpm: 5}},
			buildEditor: Hmi.FormatPanel.buildAnimationEditor, onSave: function() {}});
		await __wait(100);
	});
	var an = await audit(page, null, 7);
	assert.deepStrictEqual(an.sort(), ['animation.autoPlay', 'animation.dialog', 'animation.duration',
		'animation.name', 'animation.preset', 'animation.rpm', 'animation.rpmTag', 'item.json']);
	await checkHeights(page);
	var auto = await page.evaluate(function()
	{
		return document.querySelector('.geDialog [data-help="animation.autoPlay"]').parentNode.querySelector('input').checked;
	});
	await page.click('.geDialog [data-help="animation.autoPlay"]');
	assert.strictEqual((await popover(page)).key, 'animation.autoPlay');
	assert.strictEqual(await page.evaluate(function()
	{
		return document.querySelector('.geDialog [data-help="animation.autoPlay"]').parentNode.querySelector('input').checked;
	}), auto);
	await page.keyboard.press('Escape');
	await closeAll(page);
	assert.deepStrictEqual(page.hmiErrors, []);
	await page.close();
});

// ---------------------------------------------------------------
// Popovers, keyboard, dark mode
// ---------------------------------------------------------------

test('quick help: popover behaviour in the new dialogs (Escape, one at a time, keyboard, dark mode)', async function()
{
	var page = await openPage();
	await seed(page);
	await page.evaluate(function()
	{
		Hmi.ScreenSettings.show(Hmi.ui, {tab: 'runtime'});
	});
	await page.waitForSelector('.geDialog [data-help="tags.sim"]');

	// Only one popover is open at a time
	await page.click('.geDialog [data-help="tags.sim"]');
	await page.click('.geDialog [data-help="tags.fit"]');
	var pop = await popover(page);
	assert.strictEqual(pop.count, 1);
	assert.strictEqual(pop.key, 'tags.fit');
	assert.ok(pop.inside);

	// Escape closes the popover first, the dialog stays; a second Escape reaches the dialog
	await page.keyboard.press('Escape');
	assert.strictEqual(await popover(page), null);
	assert.ok(await page.$('.geDialog [data-help="screen.dialog"]'));

	// Enter on a focused icon opens the popover and does not confirm the dialog
	await page.focus('.geDialog [data-help="tags.maxRate"]');
	await page.keyboard.press('Enter');
	assert.strictEqual((await popover(page)).key, 'tags.maxRate');
	assert.ok(await page.$('.geDialog [data-help="screen.dialog"]'), 'Enter does not close the dialog');
	await page.keyboard.press('Escape');

	// A click on the field next to an icon still works (the icon is not in the way)
	await page.fill('.geDialog [data-help="tags.maxRate"] >> xpath=../.. >> input', '20');
	assert.strictEqual(await page.inputValue('.geDialog [data-help="tags.maxRate"] >> xpath=../.. >> input'), '20');

	// The labels and aria labels
	var label = await page.getAttribute('.geDialog [data-help="tags.nav"]', 'aria-label');
	assert.match(label, /^Help: /);

	// Dark mode: the popover uses the theme colours
	await page.emulateMedia({colorScheme: 'dark'});
	await page.click('.geDialog [data-help="tags.quality"]');
	var colors = await page.evaluate(function()
	{
		var cs = getComputedStyle(document.querySelector('.geHmiHelpPop'));

		return {bg: cs.backgroundColor, color: cs.color};
	});
	assert.notStrictEqual(colors.bg, colors.color);
	await closeAll(page);
	assert.deepStrictEqual(page.hmiErrors, []);
	await page.close();
});

test('quick help: every key of the new dialogs has a text of its own', async function()
{
	var page = await openPage();
	var result = await page.evaluate(function()
	{
		var prefixes = /^(screen|runtime|window|sources|source|credentials|tags|tag|tagBrowser|substitute|define|validator|diag|alarmList|hmiTab|quick|flow|binding|event|trigger|animation|condition|transform|action|target|item)\./;
		var keys = Object.keys(Hmi.HelpTexts).filter(function(k)
		{
			return prefixes.test(k);
		});
		var empty = keys.filter(function(k)
		{
			var info = Hmi.Help.text(k);

			return info == null || !info.title || info.text.length < 20;
		});
		var long = keys.filter(function(k)
		{
			return Hmi.Help.text(k).text.length > 1200;
		});

		return {count: keys.length, empty: empty, long: long};
	});
	assert.ok(result.count > 200, 'help keys: ' + result.count);
	assert.deepStrictEqual(result.empty, []);
	assert.deepStrictEqual(result.long, []);
	await page.close();
});
