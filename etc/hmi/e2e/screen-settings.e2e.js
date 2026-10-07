// End-to-end tests of the Screen Settings dialog (ui/HmiScreenSettings.js)
// and of the summary HMI tab (ui/HmiFormatPanel.js), INTOUCH_LINKS.md §12.3
// and §12.4.
// Run: node --test --test-concurrency=1 etc/hmi/e2e/screen-settings.e2e.js
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

var DOC = {version: 1, sim: 'off', scripts: 'inherit',
	sources: [{id: 's1', name: 'Broker', type: 'mqtt', enabled: true, url: 'ws://x/mqtt', topics: []},
		{id: 's2', name: 'Poll', type: 'http', enabled: true, url: 'http://x/data'}],
	tags: [{name: 'Level', type: 'number', unit: '%'}, {name: 'Pump', type: 'boolean', access: 'rw'},
		{name: 'Temp', type: 'number', unit: 'C'}],
	triggers: [{name: 'HighLevel', conditionType: 'and', conditions: [{tag: 'Level', operator: '>', value: 90}],
		actions: [{type: 'notify', text: 'high'}], elseActions: [{type: 'notify', text: 'normal'}]}],
	runtime: {fit: 'page'}};

async function setup(page, doc)
{
	await page.evaluate(function(d)
	{
		var graph = Hmi.ui.editor.graph;
		Hmi.Model.setDocConfig(graph, d);
		Hmi.ui.editor.undoManager.clear();
	}, doc || DOC);
}

async function open(page, tab)
{
	await page.evaluate(function(t)
	{
		Hmi.ScreenSettings.show(Hmi.ui, {tab: t});
	}, tab);
	await page.waitForSelector('[data-dialog="screen-settings"]');
}

function dlg(page)
{
	return page.locator('.geDialog').last();
}

async function doc(page)
{
	return page.evaluate(function()
	{
		return Hmi.Model.getDocConfig(Hmi.ui.editor.graph);
	});
}

async function undoCount(page)
{
	return page.evaluate(function()
	{
		return Hmi.ui.editor.undoManager.history.length;
	});
}

async function selectedTab(page)
{
	return page.evaluate(function()
	{
		var b = document.querySelector('[data-dialog="screen-settings"] .geHmiTab[aria-selected="true"]');

		return (b != null) ? b.getAttribute('data-tab') : null;
	});
}

async function closeAll(page)
{
	await page.evaluate(function()
	{
		while (document.querySelector('.geDialog') != null)
		{
			Hmi.ui.hideDialog();
		}
	});
}

test('opens from the HMI menu with six tabs, counts and help on everything', async function()
{
	var page = await util.openEditor(browser, web.url);
	await setup(page);

	// Extras > HMI / SCADA > Screen Settings...
	await page.click('.geMenubar >> text=Extras');
	await page.click('.geMenubarContainer >> text=/^HMI/', {timeout: 5000}).catch(async function()
	{
		await page.click('text=/^HMI \\/ SCADA|^HMI$/');
	});
	await page.click('text=Screen Settings...');
	await page.waitForSelector('[data-dialog="screen-settings"]');

	var info = await page.evaluate(function()
	{
		var root = document.querySelector('[data-dialog="screen-settings"]');
		var list = root.querySelector('[role="tablist"]');

		return {
			tabs: Array.prototype.map.call(list.querySelectorAll('[role="tab"]'), function(t)
			{
				return t.getAttribute('data-tab') + '|' + t.textContent;
			}),
			panels: root.querySelectorAll('[role="tabpanel"]').length,
			selected: root.querySelectorAll('[role="tab"][aria-selected="true"]').length
		};
	});

	assert.deepStrictEqual(info.tabs, ['sources|Data Sources(2)', 'tags|Tags(3)',
		'pageTriggers|Page Triggers(1)', 'runtime|Runtime', 'hoverHalo|Hover Halo', 'window|Window']);
	assert.strictEqual(info.panels, 6);
	assert.strictEqual(info.selected, 1);

	// Every tab renders, arrow keys move the selection
	var ids = ['sources', 'tags', 'pageTriggers', 'runtime', 'hoverHalo', 'window'];

	for (var i = 0; i < ids.length; i++)
	{
		await page.click('[data-dialog="screen-settings"] [data-tab="' + ids[i] + '"]');
		var visible = await page.evaluate(function(id)
		{
			var p = document.querySelector('[data-panel="' + id + '"]');

			return !p.hidden && p.getBoundingClientRect().height > 20;
		}, ids[i]);
		assert.ok(visible, 'panel ' + ids[i]);
	}

	await page.focus('[data-tab="window"]');
	await page.keyboard.press('ArrowRight');
	assert.strictEqual(await selectedTab(page), 'sources', 'arrow right wraps');
	await page.keyboard.press('ArrowLeft');
	assert.strictEqual(await selectedTab(page), 'window');
	await page.keyboard.press('Home');
	assert.strictEqual(await selectedTab(page), 'sources');
	await page.keyboard.press('End');
	assert.strictEqual(await selectedTab(page), 'window');

	// The size is the same on every tab
	var sizes = await page.evaluate(function()
	{
		var out = [];
		var tabs = document.querySelectorAll('[data-dialog="screen-settings"] [role="tab"]');

		for (var i = 0; i < tabs.length; i++)
		{
			tabs[i].click();
			out.push(Math.round(document.querySelector('.geDialog').getBoundingClientRect().height));
		}

		return out;
	});
	assert.ok(sizes.every(function(s)
	{
		return s == sizes[0];
	}), 'fixed dialog size ' + sizes);

	// Help icons: every tab, section, field and column has one with a text
	var help = await page.evaluate(function()
	{
		var all = {};
		var tabs = document.querySelectorAll('[data-dialog="screen-settings"] [role="tab"]');

		for (var i = 0; i < tabs.length; i++)
		{
			tabs[i].click();
			var icons = document.querySelectorAll('[data-dialog="screen-settings"] .geHmiHelp');

			for (var j = 0; j < icons.length; j++)
			{
				all[icons[j].getAttribute('data-help')] = (Hmi.HelpTexts[icons[j].getAttribute('data-help')] != null);
			}
		}

		return {keys: all, missing: Object.keys(Hmi.Help.missing)};
	});
	assert.deepStrictEqual(help.missing, [], 'no missing help keys');

	['screen.dialog', 'screen.tab.sources', 'screen.tab.tags', 'screen.tab.pageTriggers',
		'screen.tab.runtime', 'screen.tab.hoverHalo', 'screen.tab.window', 'sources.col.enabled',
		'sources.col.source', 'sources.add', 'tags.add', 'tags.col.name', 'tags.col.access',
		'tags.exchange', 'screen.triggers.list', 'tags.sim', 'tags.fit', 'tags.maxRate',
		'runtime.theme', 'runtime.blink', 'runtime.blink.slow', 'runtime.blink.fast', 'halo.style',
		'halo.reset', 'window.type', 'window.x', 'window.title', 'window.section.geometry'].forEach(function(k)
	{
		assert.ok(help.keys[k] === true, 'help icon ' + k);
	});

	assert.ok(Object.keys(help.keys).every(function(k)
	{
		return help.keys[k];
	}), 'every icon has a text');
	assert.deepStrictEqual(page.hmiErrors, []);
	await page.close();
});

test('the old actions and dialogs open Screen Settings on their tab', async function()
{
	var page = await util.openEditor(browser, web.url);
	await setup(page);

	var cases = [['hmiSources', 'sources'], ['hmiTags', 'tags'], ['hmiHoverHalo', 'hoverHalo'],
		['hmiScreenSettings', null]];

	for (var i = 0; i < cases.length; i++)
	{
		await page.evaluate(function(name)
		{
			Hmi.ui.actions.get(name).funct();
		}, cases[i][0]);
		await page.waitForSelector('[data-dialog="screen-settings"]');

		if (cases[i][1] != null)
		{
			assert.strictEqual(await selectedTab(page), cases[i][1], cases[i][0]);
		}

		await closeAll(page);
	}

	var wrappers = [['SourcesDialog', 'sources'], ['TagsDialog', 'tags'], ['HaloDialog', 'hoverHalo']];

	for (var j = 0; j < wrappers.length; j++)
	{
		await page.evaluate(function(name)
		{
			Hmi[name].show(Hmi.ui);
		}, wrappers[j][0]);
		await page.waitForSelector('[data-dialog="screen-settings"]');
		assert.strictEqual(await selectedTab(page), wrappers[j][1], wrappers[j][0]);
		await closeAll(page);
	}

	// Context menu of the empty canvas
	await page.evaluate(function()
	{
		Hmi.ui.editor.graph.clearSelection();
	});
	await page.click('.geDiagramContainer', {button: 'right', position: {x: 300, y: 300}});
	await page.click('.mxPopupMenu >> text=Screen Settings...');
	await page.waitForSelector('[data-dialog="screen-settings"]');
	await closeAll(page);
	assert.deepStrictEqual(page.hmiErrors, []);
	await page.close();
});

test('editing every tab and OK is one undoable edit, Cancel discards', async function()
{
	var page = await util.openEditor(browser, web.url);
	await setup(page);
	var before = await doc(page);
	var count = await undoCount(page);

	await open(page, 'sources');

	// Data source
	await page.click('[data-source="s1"] span:nth-child(2)');
	await page.waitForFunction(function()
	{
		return document.querySelectorAll('.geDialog').length == 2;
	});
	await dlg(page).locator('input[type="text"]').first().fill('Renamed broker');
	await dlg(page).locator('.gePrimaryBtn').click();
	await page.waitForFunction(function()
	{
		return document.querySelectorAll('.geDialog').length == 1;
	});

	// Tag
	await page.click('[data-dialog="screen-settings"] [data-tab="tags"]');
	await page.click('[data-tag="Pump"] td');
	await page.waitForSelector('[data-dialog="tag-editor"]');
	await dlg(page).locator('input[type="text"]').first().fill('PumpRun');
	await dlg(page).locator('.gePrimaryBtn').click();
	await page.waitForFunction(function()
	{
		return document.querySelectorAll('.geDialog').length == 1;
	});
	assert.strictEqual(await page.locator('[data-tab="tags"]').getAttribute('data-count'), '3');

	// Page trigger with else actions
	await page.click('[data-dialog="screen-settings"] [data-tab="pageTriggers"]');
	await page.locator('[data-role="page-triggers"] [data-role="add"]').first().click();
	await page.waitForFunction(function()
	{
		return document.querySelectorAll('.geDialog').length == 2;
	});
	await dlg(page).locator('input[type="text"]').first().fill('LowLevel');
	// The second action list of the trigger form holds the else actions
	await dlg(page).locator('[data-role="actions"]').nth(1).locator('[data-role="add"]').first().click();
	await page.waitForFunction(function()
	{
		return document.querySelectorAll('.geDialog').length == 3;
	});
	await dlg(page).locator('.gePrimaryBtn').click();
	await page.waitForFunction(function()
	{
		return document.querySelectorAll('.geDialog').length == 2;
	});
	await dlg(page).locator('.gePrimaryBtn').click();
	await page.waitForFunction(function()
	{
		return document.querySelectorAll('.geDialog').length == 1;
	});
	assert.strictEqual(await page.locator('[data-tab="pageTriggers"]').getAttribute('data-count'), '2');

	// Runtime
	await page.click('[data-dialog="screen-settings"] [data-tab="runtime"]');
	await page.selectOption('[data-field="fit"]', 'width');
	await page.selectOption('[data-field="theme"]', 'isa101');
	await page.fill('[data-field="blinkFast"]', '300');
	await page.fill('[data-field="designWidth"]', '800');
	await page.fill('[data-field="designHeight"]', '600');

	// Hover halo
	await page.click('[data-dialog="screen-settings"] [data-tab="hoverHalo"]');
	await page.click('[data-preset="crispOutline"]');

	// Window
	await page.click('[data-dialog="screen-settings"] [data-tab="window"]');
	await page.selectOption('[data-field="type"]', 'popup');
	await page.fill('[data-field="x"]', '120');
	await page.fill('[data-field="y"]', '40');
	await page.fill('[data-field="title"]', 'Pump details');

	// Nothing is stored before OK
	assert.deepStrictEqual(await doc(page), before);
	await page.click('[data-role="screen-ok"]');
	await page.waitForFunction(function()
	{
		return document.querySelector('.geDialog') == null;
	});

	var after = await doc(page);
	assert.strictEqual(after.sources[0].name, 'Renamed broker');
	assert.strictEqual(after.tags[1].name, 'PumpRun');
	assert.strictEqual(after.triggers.length, 2);
	assert.strictEqual(after.triggers[1].name, 'LowLevel');
	assert.strictEqual(after.triggers[1].elseActions.length, 1);
	assert.strictEqual(after.runtime.fit, 'width');
	assert.strictEqual(after.runtime.theme, 'isa101');
	assert.strictEqual(after.runtime.blink.fast, 300);
	assert.strictEqual(after.runtime.width, 800);
	assert.strictEqual(after.runtime.height, 600);
	assert.strictEqual(after.runtime.hoverHalo.style, 'outline');
	assert.strictEqual(after.window.type, 'popup');
	assert.strictEqual(after.window.x, 120);
	assert.strictEqual(after.window.title, 'Pump details');
	assert.strictEqual(await undoCount(page), count + 1, 'one undoable edit');

	await page.evaluate(function()
	{
		Hmi.ui.editor.undoManager.undo();
	});
	assert.deepStrictEqual(await doc(page), before, 'one undo restores everything');
	await page.evaluate(function()
	{
		Hmi.ui.editor.undoManager.redo();
	});
	assert.strictEqual((await doc(page)).runtime.fit, 'width');

	// Cancel discards
	await page.evaluate(function()
	{
		Hmi.ui.editor.undoManager.undo();
	});
	count = await undoCount(page);
	await open(page, 'runtime');
	await page.selectOption('[data-field="fit"]', 'none');
	await page.click('[data-dialog="screen-settings"] [data-tab="sources"]');
	await page.click('[data-source="s2"] .geBtn:last-child');
	assert.strictEqual(await page.locator('[data-tab="sources"]').getAttribute('data-count'), '1');
	await dlg(page).locator('.geBtn', {hasText: 'Cancel'}).click();
	await page.waitForFunction(function()
	{
		return document.querySelector('.geDialog') == null;
	});
	assert.deepStrictEqual(await doc(page), before, 'cancel discards');
	assert.strictEqual(await undoCount(page), count);
	assert.deepStrictEqual(page.hmiErrors, []);
	await page.close();
});

test('errors keep the dialog open and mark the tab', async function()
{
	var page = await util.openEditor(browser, web.url);
	await setup(page);
	await open(page, 'runtime');
	await page.fill('[data-field="maxRate"]', '0');
	await page.click('[data-dialog="screen-settings"] [data-tab="window"]');
	await page.click('[data-role="screen-ok"]');

	assert.ok(await page.locator('[data-dialog="screen-settings"]').isVisible(), 'dialog stays open');
	assert.strictEqual(await selectedTab(page), 'runtime', 'jumps to the tab with the error');
	assert.strictEqual(await page.locator('[data-tab="runtime"]').getAttribute('data-error'), 'true');
	assert.match(await page.locator('[data-role="screen-errors"]').textContent(), /Runtime: Max update rate/);
	assert.notStrictEqual((await doc(page)).runtime.maxRate, 0, 'nothing stored');

	await page.fill('[data-field="maxRate"]', '20');
	await page.click('[data-role="screen-ok"]');
	await page.waitForFunction(function()
	{
		return document.querySelector('.geDialog') == null;
	});
	assert.strictEqual((await doc(page)).runtime.maxRate, 20);
	await page.close();
});

test('the Window tab shows, edits and clears the window of the page', async function()
{
	var page = await util.openEditor(browser, web.url);
	await setup(page, {version: 1, sources: [], tags: [], triggers: [],
		window: {type: 'overlay', x: 10, y: 20, width: 300, title: 'Panel'}});
	await open(page, 'window');
	var shown = await page.evaluate(function()
	{
		return {type: document.querySelector('[data-field="type"]').value,
			x: document.querySelector('[data-field="x"]').value,
			width: document.querySelector('[data-field="width"]').value,
			title: document.querySelector('[data-field="title"]').value};
	});
	assert.deepStrictEqual(shown, {type: 'overlay', x: '10', width: '300', title: 'Panel'});

	// Back to the default: the window setting is removed
	await page.selectOption('[data-field="type"]', 'replace');
	await page.fill('[data-field="x"]', '');
	await page.fill('[data-field="y"]', '');
	await page.fill('[data-field="width"]', '');
	await page.fill('[data-field="title"]', '');
	await page.click('[data-role="screen-ok"]');
	await page.waitForFunction(function()
	{
		return document.querySelector('.geDialog') == null;
	});
	assert.strictEqual((await doc(page)).window, undefined);
	await page.close();
});

async function showHmiTab(page)
{
	await page.evaluate(function()
	{
		var tabs = document.querySelectorAll('.geFormatTitle');

		for (var i = 0; i < tabs.length; i++)
		{
			if (tabs[i].textContent == 'HMI')
			{
				tabs[i].click();
			}
		}
	});
}

test('the HMI tab summarises the page and the object', async function()
{
	var page = await util.openEditor(browser, web.url);
	await setup(page);

	await page.evaluate(function()
	{
		var graph = Hmi.ui.editor.graph;
		var a = graph.insertVertex(graph.getDefaultParent(), 'v1', 'Pump', 50, 50, 80, 40);
		graph.insertVertex(graph.getDefaultParent(), 'v2', 'Plain', 200, 50, 80, 40);
		Hmi.Model.setCellConfig(graph, [a], 'bindings', [{tag: 'Level', target: 'label'}]);
		Hmi.Model.setCellConfig(graph, [a], 'links', {visibility: {expr: 'Pump', visible: true}});
		graph.clearSelection();
	});
	await page.waitForTimeout(300);
	await showHmiTab(page);

	// No selection: page summary and buttons
	var info = await page.evaluate(function()
	{
		var panel = Hmi.ui.format.container.lastChild;
		var lines = {};

		Array.prototype.forEach.call(panel.querySelectorAll('[data-summary]'), function(l)
		{
			lines[l.getAttribute('data-summary')] = l.textContent;
		});

		return {lines: lines, buttons: Array.prototype.map.call(panel.querySelectorAll('button[data-role]'),
			function(b)
			{
				return b.getAttribute('data-role');
			}), texts: Array.prototype.map.call(panel.querySelectorAll('button[data-role]'), function(b)
			{
				return b.textContent;
			}), help: Array.prototype.map.call(panel.querySelectorAll('.geHmiHelp'), function(h)
			{
				return h.getAttribute('data-help');
			}), old: panel.textContent.indexOf('Quick Add') + panel.textContent.indexOf('Bindings')};
	});
	assert.deepStrictEqual(info.lines, {sources: 'Data Sources2', tags: 'Tags3', objects: 'Objects with links1',
		pageTriggers: 'Page Triggers1'});
	assert.deepStrictEqual(info.buttons, ['screen-settings', 'tag-browser', 'substitute-tags',
		'define-missing', 'validate', 'live-preview', 'run-screen']);
	assert.deepStrictEqual(info.texts.slice(0, 5), ['Screen Settings...', 'Tag Browser...', 'Substitute Tags...',
		'Define Missing Tags...', 'Validate...']);
	['hmiTab.document', 'hmiTab.summary', 'hmiTab.screenSettings', 'hmiTab.tagBrowser', 'hmiTab.substitute',
		'hmiTab.defineMissing', 'hmiTab.validate', 'hmiTab.livePreview', 'hmiTab.runScreen'].forEach(function(k)
	{
		assert.ok(info.help.indexOf(k) >= 0, 'help ' + k);
	});
	assert.strictEqual(info.old, -2, 'the old sections are gone');

	// Screen Settings button and summary line
	await page.click('[data-role="screen-settings"]');
	await page.waitForSelector('[data-dialog="screen-settings"]');
	await closeAll(page);
	await page.click('[data-summary="tags"]');
	await page.waitForSelector('[data-dialog="screen-settings"]');
	assert.strictEqual(await selectedTab(page), 'tags');
	await closeAll(page);

	// Object selected: the links of the object
	await page.evaluate(function()
	{
		var graph = Hmi.ui.editor.graph;
		graph.setSelectionCell(graph.model.getCell('v1'));
	});
	await page.waitForTimeout(300);
	await showHmiTab(page);
	var obj = await page.evaluate(function()
	{
		var panel = Hmi.ui.format.container.lastChild;

		return {links: Array.prototype.map.call(panel.querySelectorAll('[data-link]'), function(l)
		{
			return l.getAttribute('data-link');
		}), buttons: Array.prototype.map.call(panel.querySelectorAll('button[data-role]'), function(b)
		{
			return b.getAttribute('data-role');
		}), expected: Hmi.LinksDialog.objectSummary(Hmi.ui.editor.graph.model.getCell('v1')).map(function(e)
		{
			return e.id;
		}), text: panel.textContent};
	});
	assert.ok(obj.links.length >= 2, 'bindings and visibility are listed: ' + obj.links);
	assert.deepStrictEqual(obj.links, obj.expected);
	assert.deepStrictEqual(obj.buttons, ['links-button', 'tag-browser']);
	assert.ok(obj.text.indexOf('Quick Add') < 0 && obj.text.indexOf('Roles') < 0);

	// A click on a line opens Animation Links on that link
	await page.click('[data-link="bindings"]');
	await page.waitForSelector('[data-dialog="animation-links"]');
	var tab = await page.evaluate(function()
	{
		var b = document.querySelector('[data-dialog="animation-links"] .geHmiTab[aria-selected="true"]');

		return (b != null) ? b.getAttribute('data-tab') : null;
	});
	assert.strictEqual(tab, 'display', 'bindings are on the Display tab');
	await closeAll(page);

	// The Animation Links button
	await page.click('[data-role="links-button"]');
	await page.waitForSelector('[data-dialog="animation-links"]');
	await closeAll(page);

	// Object without links
	await page.evaluate(function()
	{
		var graph = Hmi.ui.editor.graph;
		graph.setSelectionCell(graph.model.getCell('v2'));
	});
	await page.waitForTimeout(300);
	await showHmiTab(page);
	var none = await page.evaluate(function()
	{
		var panel = Hmi.ui.format.container.lastChild;
		var n = panel.querySelector('[data-role="no-links"]');

		return n != null ? n.textContent : null;
	});
	assert.strictEqual(none, 'No HMI links');

	assert.deepStrictEqual(page.hmiErrors, []);
	await page.close();
});

test('page state machines are created and edited with a form and run', async function()
{
	var page = await util.openEditor(browser, web.url);
	var d = JSON.parse(JSON.stringify(DOC));
	d.tags.push({name: 'Mode', type: 'string', access: 'rw', local: true, initial: ''});
	await setup(page, d);
	await open(page, 'pageTriggers');

	var result = await page.evaluate(async function()
	{
		var wait = function(ms)
		{
			return new Promise(function(r)
			{
				setTimeout(r, ms || 60);
			});
		};
		var top = function()
		{
			return Hmi.ui.dialog.container;
		};
		var set = function(el, v)
		{
			el.value = v;
			el.dispatchEvent(new Event('input', {bubbles: true}));
			el.dispatchEvent(new Event('change', {bubbles: true}));
		};
		var out = {};
		var settings = top();
		settings.querySelector('[data-role="add-state-machine"]').click();
		await wait();
		var sm = top();
		out.form = sm.querySelector('[data-dialog="page-state-machine"]') != null &&
			sm.querySelector('[data-field="addState"]') != null;
		set(sm.querySelector('[data-field="name"]'), 'PumpState');
		sm.querySelector('[data-field="addState"]').click();
		sm.querySelector('[data-field="addState"]').click();
		await wait();
		var states = sm.querySelectorAll('[data-role="state"]');
		set(states[0].querySelector('[data-field="stateName"]'), 'Stopped');
		set(states[1].querySelector('[data-field="stateName"]'), 'Running');
		states[0].querySelector('[data-field="addCondition"]').click();
		states[1].querySelector('[data-field="addCondition"]').click();
		await wait();
		set(states[0].querySelector('[data-field="condTag"]'), 'Pump');
		set(states[0].querySelector('[data-field="condValue"]'), 'false');
		set(states[1].querySelector('[data-field="condTag"]'), 'Pump');
		set(states[1].querySelector('[data-field="condValue"]'), 'true');

		// One writeTag action per state
		for (var i = 0; i < 2; i++)
		{
			var before = top();
			states[i].querySelector('[data-role="actions"] [data-role="add"]').click();
			await wait();
			var ad = top();
			set(ad.querySelector('select'), 'writeTag');
			await wait();
			var inputs = ad.querySelectorAll('input[type="text"], input:not([type])');
			set(inputs[0], 'Mode');
			set(inputs[1], (i == 0) ? 'stopped' : 'running');
			ad.querySelector('.gePrimaryBtn').click();
			await wait();
			out['back' + i] = top() == before;
		}

		sm.querySelector('.gePrimaryBtn').click();
		await wait();
		out.listed = settings.querySelector('[data-role="page-triggers"]').textContent.indexOf('PumpState') >= 0;

		// Editing it again shows the form with both states
		var rows = settings.querySelectorAll('[data-role="page-triggers"] [data-role="item"]');
		var edit = (rows.length > 0) ? rows[rows.length - 1] : null;
		out.rows = rows.length;

		if (edit != null)
		{
			(edit.querySelector('[data-role="edit"]') || edit).click();
			await wait();
			out.editStates = top().querySelectorAll('[data-role="state"]').length;
			out.editJson = top().querySelector('textarea') != null &&
				top().querySelector('[data-field="addState"]') == null;
			Hmi.ui.hideDialog();
			await wait();
		}

		settings.querySelector('.gePrimaryBtn').click();
		await wait(200);

		return out;
	});

	assert.strictEqual(result.form, true);
	assert.strictEqual(result.back0, true);
	assert.strictEqual(result.back1, true);
	assert.strictEqual(result.listed, true);
	assert.strictEqual(result.editStates, 2, JSON.stringify(result));
	assert.strictEqual(result.editJson, false);

	var cfg = await doc(page);
	var sm = cfg.triggers[cfg.triggers.length - 1];
	assert.strictEqual(sm.name, 'PumpState');
	assert.deepStrictEqual(sm.states.map(function(s)
	{
		return s.name;
	}), ['Stopped', 'Running']);
	assert.strictEqual(sm.states[1].actions[0].type, 'writeTag');
	assert.deepStrictEqual(await page.evaluate(function()
	{
		return Hmi.Schema.validate('triggers', Hmi.Model.getDocConfig(Hmi.ui.editor.graph).triggers);
	}), []);

	// The state machine runs in live preview
	var modes = await page.evaluate(async function()
	{
		var wait = function(ms)
		{
			return new Promise(function(r)
			{
				setTimeout(r, ms);
			});
		};
		var rt = Hmi.ui.hmi.run({mode: 'preview', sim: 'only'});
		await wait(1500);
		rt.setValues({Pump: true});
		await wait(400);
		var a = rt.tags.getValue('Mode');
		rt.setValues({Pump: false});
		await wait(400);
		var b = rt.tags.getValue('Mode');
		window.smDebug = {trig: JSON.stringify(Hmi.Model.getDocConfig(Hmi.ui.editor.graph).triggers.slice(-1)),
			log: rt.diag.log.slice(-8).map(function(e) { return e.category + ' ' + e.message; }), init: rt.initialized};
		Hmi.ui.hmi.stop();

		return [a, b];
	});
	assert.deepStrictEqual(modes, ['running', 'stopped'], JSON.stringify(await page.evaluate(function()
	{
		return window.smDebug;
	})));
	await page.close();
});
