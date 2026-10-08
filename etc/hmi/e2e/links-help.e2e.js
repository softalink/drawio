// End-to-end tests for the tabs of the Animation Links dialog and the quick
// help ("i" icons, ui/HmiHelp.js + ui/HmiHelpTexts.js).
// Run: node --test --test-concurrency=1 etc/hmi/e2e/links-help.e2e.js
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

// Links used by the tab tests: Display 2, Animation 1, Touch 3, Scripts 1
var LINKS = {valueDiscrete: {expr: 'Run', onMessage: 'On', offMessage: 'Off'},
	fillColor: {kind: 'discrete', expr: 'Run', offColor: '#FF0000', onColor: '#00C000'},
	animation: {expr: 'Run', preset: 'spin'},
	inputDiscrete: {tag: 'Run', key: null},
	sliderH: {tag: 'Level', atLeft: 0, atRight: 100, toLeft: 0, toRight: 100, reference: 'center'},
	pushDiscrete: {tag: 'Run', action: 'toggle'},
	dataChange: {expr: 'Level', deadband: 0, script: 'Level = 1;'}};

async function openDialog(page, links)
{
	return page.evaluate(async function(links)
	{
		var ui = Hmi.ui;
		var graph = ui.editor.graph;
		var cell = graph.insertVertex(graph.getDefaultParent(), 'c' + Date.now(), 'Tank', 100, 100, 120, 80);

		if (links != null)
		{
			Hmi.Model.setCellConfig(graph, [cell], 'links', links);
		}

		graph.setSelectionCell(cell);
		Hmi.LinksDialog.show(ui, [cell]);
		await new Promise(function(r)
		{
			setTimeout(r, 200);
		});

		return cell.id;
	}, links);
}

async function closeDialogs(page)
{
	await page.evaluate(function()
	{
		window.Hmi.Help.close();

		while (Hmi.ui.dialogs != null && Hmi.ui.dialogs.length > 0)
		{
			Hmi.ui.hideDialog();
		}
	});
}

function selectedTab(page)
{
	return page.evaluate(function()
	{
		var tabs = document.querySelectorAll('.geDialog [role="tab"]');
		var sel = Array.prototype.filter.call(tabs, function(t)
		{
			return t.getAttribute('aria-selected') == 'true';
		});
		var panels = Array.prototype.filter.call(document.querySelectorAll('.geDialog [role="tabpanel"]'),
			function(p)
			{
				return !p.hidden;
			});

		return {selected: sel.map(function(t)
		{
			return t.getAttribute('data-tab');
		}), visiblePanels: panels.map(function(p)
		{
			return p.getAttribute('data-panel');
		})};
	});
}

// Measures the gaps between the cards of the visible tab
function measureGaps(page)
{
	return page.evaluate(function()
	{
		var panel = document.querySelector('.geDialog [role="tabpanel"]:not([hidden])');
		var masonry = panel.querySelector('.geHmiMasonry');
		var cards = Array.prototype.map.call(masonry.children, function(c)
		{
			var r = c.getBoundingClientRect();

			return {left: r.left, right: r.right, top: r.top, bottom: r.bottom};
		});
		var columns = [];
		cards.forEach(function(c)
		{
			var col = columns.filter(function(x)
			{
				return Math.abs(x.left - c.left) < 2;
			})[0];

			if (col == null)
			{
				col = {left: c.left, right: c.right, cards: []};
				columns.push(col);
			}

			col.cards.push(c);
		});
		columns.sort(function(a, b)
		{
			return a.left - b.left;
		});
		var m = masonry.getBoundingClientRect();
		var h = [];
		var v = [];
		var firstTops = [];
		var lastBottoms = [];

		for (var i = 0; i < columns.length; i++)
		{
			columns[i].cards.sort(function(a, b)
			{
				return a.top - b.top;
			});
			firstTops.push(columns[i].cards[0].top - m.top);
			lastBottoms.push(m.bottom - columns[i].cards[columns[i].cards.length - 1].bottom);

			if (i > 0)
			{
				h.push(columns[i].left - columns[i - 1].right);
			}

			for (var j = 1; j < columns[i].cards.length; j++)
			{
				v.push(columns[i].cards[j].top - columns[i].cards[j - 1].bottom);
			}
		}

		return {columns: columns.length, cards: cards.length, h: h, v: v, firstTops: firstTops,
			lastBottoms: lastBottoms};
	});
}

test('Animation Links dialog: tabs, counts, keyboard and fixed size', async function()
{
	var page = await util.openEditor(browser, web.url);
	await openDialog(page, LINKS);

	// Four tabs with counts, opened on the first tab that has links
	var tabs = await page.$$eval('.geDialog [role="tab"]', function(list)
	{
		return list.map(function(t)
		{
			return {id: t.getAttribute('data-tab'),
				label: t.querySelector('.geHmiTabLabel').textContent,
				count: t.querySelector('.geHmiTabCount').textContent, text: t.textContent};
		});
	});
	assert.deepStrictEqual(tabs.map(function(t) { return t.id + ':' + t.label + ':' + t.count; }),
		['display:Display:(2)', 'animation:Animation:(1)', 'touch:Touch:(3)', 'scripts:Scripts:(1)']);
	assert.strictEqual(tabs[2].text, 'Touch(3)');
	assert.strictEqual(await page.getAttribute('.geDialog [role="tablist"]', 'role'), 'tablist');
	assert.deepStrictEqual(await selectedTab(page), {selected: ['display'], visiblePanels: ['display']});

	// There is no subtitle under the title (no object name, no count of objects)
	var sub = await page.evaluate(function()
	{
		var dlg = document.querySelector('.geDialog [data-dialog="animation-links"]');
		var next = dlg.querySelector('h3').nextElementSibling;

		return {next: next.getAttribute('role') || next.className, text: dlg.textContent};
	});
	assert.ok(sub.next.indexOf('geHmiTabs') >= 0 || sub.next == 'tablist', sub.next);
	assert.ok(!/Object: |Applies to \d+ objects|different links/.test(sub.text), sub.text.substring(0, 80));
	assert.strictEqual(await page.$('.geDialog [data-dialog="animation-links"] .geDialogHint[title]'), null);

	// Rows of hidden tabs stay in the DOM
	assert.strictEqual(await page.$$eval('.geDialog [data-link]', function(r) { return r.length; }), 59);

	// Click
	await page.click('.geDialog [data-tab="touch"]');
	assert.deepStrictEqual(await selectedTab(page), {selected: ['touch'], visiblePanels: ['touch']});

	// Arrow keys move between the tabs (and wrap around)
	await page.keyboard.press('ArrowRight');
	assert.deepStrictEqual(await selectedTab(page), {selected: ['scripts'], visiblePanels: ['scripts']});
	await page.keyboard.press('ArrowRight');
	assert.deepStrictEqual(await selectedTab(page), {selected: ['display'], visiblePanels: ['display']});
	await page.keyboard.press('ArrowLeft');
	assert.deepStrictEqual(await selectedTab(page), {selected: ['scripts'], visiblePanels: ['scripts']});
	await page.keyboard.press('Home');
	assert.deepStrictEqual(await selectedTab(page), {selected: ['display'], visiblePanels: ['display']});
	await page.keyboard.press('End');
	assert.deepStrictEqual(await selectedTab(page), {selected: ['scripts'], visiblePanels: ['scripts']});
	assert.strictEqual(await page.evaluate(function()
	{
		return document.activeElement.getAttribute('data-tab');
	}), 'scripts');

	// Live counts
	await page.click('.geDialog [data-tab="animation"]');
	await page.evaluate(function()
	{
		var cb = document.querySelector('.geDialog [data-link="flow"] [data-role="check"]');
		cb.checked = true;
		cb.dispatchEvent(new Event('change', {bubbles: true}));
	});
	await page.waitForSelector('.geDialog [data-dialog="link-flow"]');
	await page.evaluate(function()
	{
		Hmi.ui.dialog.container.querySelector('.gePrimaryBtn').click();
	});
	await page.waitForTimeout(100);
	assert.strictEqual(await page.textContent('.geDialog [data-tab="animation"] .geHmiTabCount'), '(2)');
	await page.click('.geDialog [data-link="flow"] [data-role="check"]');
	assert.strictEqual(await page.textContent('.geDialog [data-tab="animation"] .geHmiTabCount'), '(1)');

	// Fixed size: the dialog does not change its size when switching tabs
	var sizes = [];

	for (var id of ['display', 'animation', 'touch', 'scripts'])
	{
		await page.click('.geDialog [data-tab="' + id + '"]');
		sizes.push(await page.evaluate(function()
		{
			var r = document.querySelector('.geDialog').getBoundingClientRect();

			return Math.round(r.width) + 'x' + Math.round(r.height);
		}));
	}

	assert.strictEqual(new Set(sizes).size, 1, JSON.stringify(sizes));
	assert.deepStrictEqual(page.hmiErrors, []);
	await page.close();
});

test('Animation Links dialog: opens on the tab with links and remembers the tab', async function()
{
	var page = await util.openEditor(browser, web.url);
	await openDialog(page, {pushDiscrete: LINKS.pushDiscrete});
	assert.deepStrictEqual((await selectedTab(page)).selected, ['touch']);
	await closeDialogs(page);

	// No links: the tab that was used last
	await openDialog(page, null);
	assert.deepStrictEqual((await selectedTab(page)).selected, ['touch']);
	await page.click('.geDialog [data-tab="scripts"]');
	await closeDialogs(page);
	await openDialog(page, null);
	assert.deepStrictEqual((await selectedTab(page)).selected, ['scripts']);
	await closeDialogs(page);

	// Links in the Display tab win over the remembered tab
	await openDialog(page, {valueDiscrete: LINKS.valueDiscrete});
	assert.deepStrictEqual((await selectedTab(page)).selected, ['display']);
	await page.close();
});

test('Animation Links dialog: cards have equal horizontal and vertical gaps', async function()
{
	var page = await util.openEditor(browser, web.url);
	await openDialog(page, null);

	for (var id of ['display', 'animation', 'touch', 'scripts'])
	{
		await page.click('.geDialog [data-tab="' + id + '"]');
		var gaps = await measureGaps(page);
		assert.ok(gaps.cards > 0, id);

		if (id == 'display' || id == 'touch')
		{
			assert.ok(gaps.columns >= 3, id + ': ' + JSON.stringify(gaps));
		}

		if (id == 'display')
		{
			assert.ok(gaps.v.length > 3, id + ': ' + JSON.stringify(gaps));
		}

		gaps.h.concat(gaps.v).forEach(function(g)
		{
			assert.ok(Math.abs(g - 10) <= 1, id + ': gap ' + g + ' ' + JSON.stringify(gaps));
		});

		// No offset above the first and below the last card of a column
		gaps.firstTops.forEach(function(t)
		{
			assert.ok(Math.abs(t) <= 1, id + ': top ' + t);
		});
		assert.ok(Math.min.apply(null, gaps.lastBottoms) <= 1, id + ': bottom ' + JSON.stringify(gaps));
	}

	// No truncated link label in any tab (labels wrap instead)
	var truncated = await page.evaluate(function()
	{
		var bad = [];
		Array.prototype.forEach.call(document.querySelectorAll('.geDialog [data-link] label'), function(l)
		{
			if (l.scrollWidth > l.clientWidth + 1)
			{
				bad.push(l.textContent);
			}
		});

		return bad;
	});
	assert.deepStrictEqual(truncated, []);
	await page.close();
});

test('quick help: popovers of tabs, groups and links', async function()
{
	var page = await util.openEditor(browser, web.url);
	await openDialog(page, LINKS);

	async function popover()
	{
		return page.evaluate(function()
		{
			var p = document.querySelector('.geHmiHelpPop');

			if (p == null)
			{
				return null;
			}

			var r = p.getBoundingClientRect();
			var d = document.querySelector('.geDialog').getBoundingClientRect();

			return {text: p.textContent, key: p.getAttribute('data-help-popover'),
				count: document.querySelectorAll('.geHmiHelpPop').length,
				inside: r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth &&
				r.bottom <= window.innerHeight,
				width: r.width, onTop: document.elementFromPoint(r.left + 5, r.top + 5) != null &&
				p.contains(document.elementFromPoint(r.left + 5, r.top + 5)),
				z: getComputedStyle(p).zIndex, dialogZ: getComputedStyle(document.querySelector('.geDialog')).zIndex};
		});
	}

	// Tab: a click on the icon does not switch the tab
	await page.click('.geDialog [data-help="tab.touch"]');
	var pop = await popover();
	assert.ok(pop != null && pop.text.length > 20, 'tab popover');
	assert.strictEqual(pop.key, 'tab.touch');
	assert.ok(pop.inside && pop.onTop && pop.width <= 321, JSON.stringify(pop));
	assert.deepStrictEqual((await selectedTab(page)).selected, ['display']);

	// Clicking the icon again closes it
	await page.click('.geDialog [data-help="tab.touch"]');
	assert.strictEqual(await popover(), null);

	// Only one popover is open at a time; Escape closes it and keeps the dialog
	await page.click('.geDialog [data-help="tab.display"]');

	// The open popover covers the next icon, so this one is clicked directly
	await page.$eval('.geDialog [data-help="group.hmiLnkValueDisplay"]', function(el)
	{
		el.click();
	});
	pop = await popover();
	assert.strictEqual(pop.count, 1);
	assert.strictEqual(pop.key, 'group.hmiLnkValueDisplay');
	assert.ok(pop.text.length > 20);
	await page.keyboard.press('Escape');
	assert.strictEqual(await popover(), null);
	assert.ok(await page.$('.geDialog [data-dialog="animation-links"]'));

	// Link row: the neighbouring checkbox is not toggled
	var before = await page.isChecked('.geDialog [data-link="valueAnalog"] [data-role="check"]');
	await page.click('.geDialog [data-link="valueAnalog"] [data-help="link.valueAnalog"]');
	pop = await popover();
	assert.strictEqual(pop.key, 'link.valueAnalog');
	assert.ok(pop.text.length > 20);
	assert.strictEqual(await page.isChecked('.geDialog [data-link="valueAnalog"] [data-role="check"]'), before);
	assert.strictEqual(await page.$$eval('.geDialog [data-dialog="link-valueAnalog"]', function(l) { return l.length; }), 0);

	// Outside click closes it
	await page.click('.geDialog h3');
	assert.strictEqual(await popover(), null);

	// The icons are keyboard accessible
	await page.focus('.geDialog [data-link="valueDiscrete"] [data-help]');
	await page.keyboard.press('Enter');
	assert.ok(await popover());
	assert.ok(await page.$('.geDialog [data-dialog="animation-links"]'), 'Enter does not close the dialog');
	await page.keyboard.press('Escape');
	assert.strictEqual(await popover(), null);
	assert.strictEqual(await page.getAttribute('.geDialog [data-link="valueDiscrete"] [data-help]', 'aria-label').then(function(l)
	{
		return /^Help: /.test(l);
	}), true);

	// Dark mode: the popover uses theme colours
	await page.emulateMedia({colorScheme: 'dark'});
	await page.click('.geDialog [data-help="tab.display"]');
	var colors = await page.evaluate(function()
	{
		var p = document.querySelector('.geHmiHelpPop');
		var cs = getComputedStyle(p);

		return {bg: cs.backgroundColor, color: cs.color};
	});
	assert.notStrictEqual(colors.bg, colors.color);
	await closeDialogs(page);
	assert.deepStrictEqual(page.hmiErrors, []);
	await page.close();
});

test('quick help: settings dialogs, list editors and Halo dialog', async function()
{
	var page = await util.openEditor(browser, web.url);
	await openDialog(page, null);

	async function popoverKey()
	{
		return page.evaluate(function()
		{
			var p = document.querySelector('.geHmiHelpPop');

			return (p != null && p.textContent.length > 15) ? p.getAttribute('data-help-popover') : null;
		});
	}

	// Open the settings of Discrete value display: title and field labels
	await page.click('.geDialog [data-link="valueDiscrete"] [data-role="configure"]');
	await page.waitForSelector('.geDialog [data-dialog="link-valueDiscrete"]');
	await page.click('.geDialog [data-dialog="link-valueDiscrete"] h3 [data-help]');
	assert.strictEqual(await popoverKey(), 'link.valueDiscrete');
	await page.keyboard.press('Escape');
	assert.strictEqual(await popoverKey(), null);
	assert.ok(await page.$('.geDialog [data-dialog="link-valueDiscrete"]'), 'Escape keeps the settings dialog');
	await page.click('.geDialog [data-dialog="link-valueDiscrete"] [data-help="field.expr"], ' +
		'.geDialog [data-dialog="link-valueDiscrete"] [data-help="field.valueDiscrete.expr"]');
	assert.match(await popoverKey(), /^field\.(valueDiscrete\.)?expr$/);
	await page.mouse.click(5, 5);
	assert.strictEqual(await popoverKey(), null);
	await closeDialogs(page);

	// A checkbox field: the icon must not toggle it
	await openDialog(page, null);
	await page.click('.geDialog [data-tab="touch"]');
	await page.click('.geDialog [data-link="inputAnalog"] [data-role="configure"]');
	await page.waitForSelector('.geDialog [data-dialog="link-inputAnalog"]');
	// The icons do not change the row heights (uniform row rhythm)
	var heights = await page.evaluate(function()
	{
		var rows = document.querySelectorAll('.geDialog [data-dialog="link-inputAnalog"] .geDialogSection > ' +
			'.geDialogFormRow, .geDialog [data-dialog="link-inputAnalog"] .geDialogSection > .geDialogCheckRow');

		return Array.prototype.filter.call(rows, function(r)
		{
			return r.offsetHeight > 0 && r.querySelector('[data-help]') != null;
		}).map(function(r)
		{
			return Math.round(r.getBoundingClientRect().height);
		});
	});
	assert.ok(heights.length >= 5, JSON.stringify(heights));
	// (the Formatting row is 30 px high because of its Clear button, with or without an icon)
	assert.deepStrictEqual(heights.filter(function(h) { return h != 28 && h != 30; }), [], JSON.stringify(heights));
	assert.ok(heights.filter(function(h) { return h == 30; }).length <= 1, JSON.stringify(heights));
	var cbSel = '.geDialog [data-dialog="link-inputAnalog"] [data-field="keypad"]';
	var checked = await page.isChecked(cbSel);
	await page.click(cbSel + ' >> xpath=.. >> [data-help]');
	assert.ok(await popoverKey());
	assert.strictEqual(await page.isChecked(cbSel), checked);
	await page.keyboard.press('Escape');
	await closeDialogs(page);

	// List editors: state columns and series legend
	await openDialog(page, null);
	await page.click('.geDialog [data-tab="display"]');
	await page.click('.geDialog [data-link="states"] [data-role="configure"]');
	await page.waitForSelector('.geDialog [data-dialog="link-states"]');
	await page.click('.geDialog [data-dialog="link-states"] [data-role="state"] [data-help="field.states.match"]');
	assert.strictEqual(await popoverKey(), 'field.states.match');
	await page.keyboard.press('Escape');
	await page.click('.geDialog [data-dialog="link-states"] [data-help="field.states"]');
	assert.strictEqual(await popoverKey(), 'field.states');
	await page.keyboard.press('Escape');
	await closeDialogs(page);
	await openDialog(page, null);
	await page.click('.geDialog [data-link="widgetData"] [data-role="configure"]');
	await page.waitForSelector('.geDialog [data-dialog="link-widgetData"]');
	await page.click('.geDialog [data-dialog="link-widgetData"] [data-help="field.series.maxPoints"]');
	assert.strictEqual(await popoverKey(), 'field.series.maxPoints');
	await closeDialogs(page);

	// Hover Halo dialog
	await page.evaluate(function()
	{
		Hmi.HaloDialog.show(Hmi.ui);
	});
	await page.waitForSelector('.geDialog [data-preset="crispOutline"]');

	for (var key of ['halo.dialog', 'halo.presets', 'halo.preview', 'halo.style', 'halo.color',
		'halo.size', 'halo.press'])
	{
		await page.click('.geDialog [data-help="' + key + '"]');
		assert.strictEqual(await popoverKey(), key);
		await page.keyboard.press('Escape');
	}

	var pressSel = '.geDialog [data-help="halo.press"]';
	var pressBefore = await page.evaluate(function()
	{
		return document.querySelector('[data-help="halo.press"]').parentNode.querySelector('input').checked;
	});
	await page.click(pressSel);
	assert.strictEqual(await page.evaluate(function()
	{
		return document.querySelector('[data-help="halo.press"]').parentNode.querySelector('input').checked;
	}), pressBefore);
	await page.keyboard.press('Escape');
	await closeDialogs(page);

	// Per-object halo settings: the Hover Halo link of the Animation Links dialog
	await openDialog(page, null);
	await page.click('.geDialog [data-tab="touch"]');
	await page.click('.geDialog [data-link="hoverHalo"] [data-role="configure"]');
	await page.waitForSelector('.geDialog [data-dialog="link-hoverHalo"]');
	var objectKeys = await page.$$eval('.geDialog [data-dialog="link-hoverHalo"] [data-help^="halo.object."]', function(l)
	{
		return l.map(function(e)
		{
			return e.getAttribute('data-help');
		});
	});
	assert.deepStrictEqual(objectKeys, ['halo.object.style', 'halo.object.outlineShape', 'halo.object.color']);
	await page.evaluate(function()
	{
		document.querySelector(".geDialog [data-dialog=\"link-hoverHalo\"] [data-help=\"halo.object.outlineShape\"]").click();
	});
	assert.strictEqual(await popoverKey(), 'halo.object.outlineShape');
	assert.deepStrictEqual(page.hmiErrors, []);
	await page.close();
});

test('quick help: every icon of every dialog has a help text', async function()
{
	var page = await util.openEditor(browser, web.url);
	await page.evaluate(function()
	{
		Hmi.Help.missing = {};
	});
	await openDialog(page, null);

	var keys = await page.evaluate(async function()
	{
		var found = {};

		function collect()
		{
			Array.prototype.forEach.call(Hmi.ui.dialog.container.querySelectorAll('[data-help]'), function(e)
			{
				found[e.getAttribute('data-help')] = true;
			});
		};

		function wait()
		{
			return new Promise(function(r)
			{
				setTimeout(r, 30);
			});
		};

		collect();
		var main = Hmi.ui.dialog.container;
		var ids = Array.prototype.map.call(main.querySelectorAll('[data-link]'), function(r)
		{
			return r.getAttribute('data-link');
		});
		var perDialog = {};

		for (var i = 0; i < ids.length; i++)
		{
			var btn = main.querySelector('[data-link="' + ids[i] + '"] [data-role="configure"]');
			btn.click();
			await wait();
			var dlg = Hmi.ui.dialog.container;

			if (dlg == main)
			{
				throw new Error('settings dialog of ' + ids[i] + ' did not open');
			}

			// Every value of every select re-renders conditional fields and alarm colours
			var selects = dlg.querySelectorAll('select[data-field]');

			for (var s = 0; s < selects.length; s++)
			{
				for (var o = 0; o < selects[s].options.length; o++)
				{
					selects[s].value = selects[s].options[o].value;
					selects[s].dispatchEvent(new Event('change', {bubbles: true}));
					collect();
				}
			}

			// Add an item to every list
			['addState', 'addProperty', 'addSeries', 'addChoice', 'addCommand', 'addBreakpoint',
				'addScript'].forEach(function(k)
			{
				var add = dlg.querySelector('[data-field="' + k + '"]');

				if (add != null)
				{
					add.click();
				}
			});
			collect();
			perDialog[ids[i]] = dlg.querySelectorAll('[data-help]').length;
			Hmi.ui.hideDialog();
			await wait();
		}

		// Halo dialog
		Hmi.HaloDialog.show(Hmi.ui);
		await wait();
		collect();
		perDialog.halo = Hmi.ui.dialog.container.querySelectorAll('[data-help]').length;
		Hmi.ui.hideDialog();
		found.__perDialog = perDialog;

		return found;
	});

	var perDialog = keys.__perDialog;
	delete keys.__perDialog;
	var list = Object.keys(keys);
	var empty = await page.evaluate(function(list)
	{
		return list.filter(function(k)
		{
			var t = Hmi.Help.text(k);

			return t == null || t.text == null || t.text.length < 10;
		});
	}, list);
	assert.deepStrictEqual(empty, []);
	assert.deepStrictEqual(await page.evaluate(function()
	{
		return Object.keys(Hmi.Help.missing);
	}), [], 'keys without a help text');

	// Every dialog has icons on its fields
	Object.keys(perDialog).forEach(function(id)
	{
		assert.ok(perDialog[id] >= 2, id + ' has ' + perDialog[id] + ' help icons');
	});

	// Each key groups: tabs, groups, links, fields, headings and Halo
	var kinds = {};
	list.forEach(function(k)
	{
		var kind = k.split('.')[0];
		kinds[kind] = (kinds[kind] || 0) + 1;
	});
	assert.strictEqual(kinds.tab, 4);
	assert.strictEqual(kinds.group, 16);
	assert.strictEqual(kinds.link, 59);
	assert.ok(kinds.field > 40 && kinds.heading >= 8 && kinds.halo >= 15, JSON.stringify(kinds));
	console.log('help keys used by the dialogs: ' + list.length + ' ' + JSON.stringify(kinds));
	assert.deepStrictEqual(page.hmiErrors, []);
	await page.close();
});
