// End-to-end tests for the animation links editor: Animation Links dialog,
// Substitute Tags, Define Missing Tags, Tag Browser select mode, validator.
// Run: node --test --test-concurrency=1 etc/hmi/e2e/links-ui.e2e.js
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

// DOM helpers used inside the page
async function installHelpers(page)
{
	await page.evaluate(function()
	{
		var H = window.TT = {};
		H.wait = function(ms)
		{
			return new Promise(function(r)
			{
				setTimeout(r, ms || 50);
			});
		};
		H.dlg = function()
		{
			return Hmi.ui.dialog.container;
		};
		H.field = function(key, index)
		{
			return H.dlg().querySelectorAll('[data-field="' + key + '"]')[index || 0];
		};
		H.fire = function(el)
		{
			el.dispatchEvent(new Event('input', {bubbles: true}));
			el.dispatchEvent(new Event('change', {bubbles: true}));
		};
		H.set = function(key, value, index)
		{
			var el = H.field(key, index);

			if (el == null)
			{
				throw new Error('no field ' + key);
			}

			if (el.type == 'checkbox')
			{
				el.checked = !!value;
			}
			else
			{
				el.value = value;
			}

			H.fire(el);
		};
		H.ok = function()
		{
			H.dlg().querySelector('.gePrimaryBtn').click();
		};
		H.check = function(id)
		{
			var cb = H.dlg().querySelector('[data-link="' + id + '"] [data-role="check"]');
			cb.checked = true;
			H.fire(cb);
		};
		H.isChecked = function(id)
		{
			return H.dlg().querySelector('[data-link="' + id + '"] [data-role="check"]').checked;
		};
		H.depth = function()
		{
			return Hmi.ui.dialogs != null ? Hmi.ui.dialogs.length : 0;
		};
		// Checks a link (opens its dialog), fills it with fn and presses OK
		H.configure = async function(id, fn)
		{
			var before = H.depth();
			H.check(id);
			await H.wait(80);

			if (H.depth() != before + 1)
			{
				throw new Error('config dialog of ' + id + ' did not open');
			}

			fn();
			H.ok();
			await H.wait(80);

			if (H.depth() != before)
			{
				throw new Error('config dialog of ' + id + ' did not close: ' +
					H.dlg().textContent.substring(0, 200));
			}
		};
		H.insert = function(label, id)
		{
			var graph = Hmi.ui.editor.graph;

			return graph.insertVertex(graph.getDefaultParent(), id || null, label, 100, 100, 120, 80);
		};
	});
}

async function closeDialogs(page)
{
	await page.evaluate(function()
	{
		while (Hmi.ui.dialogs != null && Hmi.ui.dialogs.length > 0)
		{
			Hmi.ui.hideDialog();
		}
	});
}

test('Animation Links dialog saves every link type, validates and round-trips', async function()
{
	var page = await util.openEditor(browser, web.url);
	await installHelpers(page);

	var rect = await page.evaluate(async function()
	{
		var ui = Hmi.ui;
		var graph = ui.editor.graph;
		var out = window.__out = {};
		var cell = TT.insert('Tank', 'c1');
		var other = TT.insert('Other', 'c2');
		graph.setSelectionCell(cell);

		Hmi.Model.setDocConfig(graph, {version: 1, sources: [], triggers: [], sim: 'off',
			tags: [{name: 'TankLevel', type: 'number'}, {name: 'Pump1/Run', type: 'boolean'}]});

		// Context menu path (real popup menu)
		var state = graph.view.getState(cell);
		graph.popupMenuHandler.popup(state.x + 10, state.y + 10, cell,
			new MouseEvent('contextmenu', {clientX: state.x + 10, clientY: state.y + 10}));
		await TT.wait(100);
		var items = Array.prototype.slice.call(document.querySelectorAll('tr.mxPopupMenuItem'));
		out.menuLabels = items.map(function(i)
		{
			return i.textContent;
		}).filter(function(l)
		{
			return /Animation Links|Substitute Tags/.test(l);
		});
		var item = items.filter(function(i)
		{
			return /Animation Links/.test(i.textContent);
		})[0];
		var r = item.getBoundingClientRect();

		return {x: r.x + r.width / 2, y: r.y + r.height / 2};
	});

	await page.mouse.move(rect.x, rect.y);
	await page.mouse.down();
	await page.mouse.up();

	var result = await page.evaluate(async function()
	{
		var ui = Hmi.ui;
		var graph = ui.editor.graph;
		var out = window.__out;
		var cell = graph.model.getCell('c1');
		var other = graph.model.getCell('c2');
		await TT.wait(150);
		out.opened = Hmi.ui.dialog != null && TT.dlg().querySelector('[data-link]') != null;

		// All groups and links present
		var rows = TT.dlg().querySelectorAll('[data-link]');
		out.rowCount = rows.length;
		out.titles = Array.prototype.map.call(TT.dlg().querySelectorAll('.geHmiGroupTitle'), function(e)
		{
			return e.textContent;
		});

		await TT.configure('valueDiscrete', function()
		{
			TT.set('expr', 'Pump1/Run');
			TT.set('onMessage', 'Running');
			TT.set('offMessage', 'Stopped');
		});
		await TT.configure('valueAnalog', function()
		{
			TT.set('expr', 'TankLevel');
			TT.set('formatMode', 'fixed');
			TT.set('formatPrecision', 2);
			TT.set('formatFixedWidth', true);
		});
		await TT.configure('locationH', function()
		{
			TT.set('expr', 'TankLevel');
			TT.set('toLeft', 10);
			TT.set('toRight', 20);
		});
		await TT.configure('sizeHeight', function()
		{
			TT.set('expr', 'TankLevel');
			TT.set('anchor', 'top');
		});
		await TT.configure('fillColor:analog', function()
		{
			TT.set('expr', 'TankLevel');
			TT.field('addBreakpoint').click();
			TT.set('bpValue', 75, 2);
			TT.set('bpColor', '#FF0000', 2);
		});
		await TT.configure('lineColor:analogAlarm', function()
		{
			TT.set('tag', 'TankLevel');
			TT.set('alarmType', 'deviation');
			TT.set('color_minor', '#FFFF00');
		});
		await TT.configure('textColor:discrete', function()
		{
			TT.set('expr', 'Pump1/Run');
		});
		// A kind replaces the previous one of the same color target
		await TT.configure('textColor:discreteAlarm', function()
		{
			TT.set('tag', 'Pump1/Run');
		});
		out.textDiscreteStillChecked = TT.isChecked('textColor:discrete');
		await TT.configure('fillVertical', function()
		{
			TT.set('expr', 'TankLevel');
			TT.set('direction', 'down');
		});
		await TT.configure('blink', function()
		{
			TT.set('expr', 'Pump1/Run');
			TT.set('mode', 'visible');
			TT.set('speed', 'fast');
			TT.set('fillColor', '#FFFF00');
		});
		await TT.configure('tooltip', function()
		{
			TT.set('text', 'Main tank');
		});
		await TT.configure('inputAnalog', function()
		{
			TT.set('tag', 'TankLevel');
			TT.set('keyCtrl', true);
			TT.set('key', 'F5');
			TT.set('keypad', true);
			TT.set('message', 'Level?');
			TT.set('min', '0');
			TT.set('max', 'TankMax');
		});
		await TT.configure('inputString', function()
		{
			TT.set('tag', 'Pump1/Name');
			TT.set('echo', 'password');
			TT.set('passwordChar', '#');
			TT.set('encrypt', true);
		});
		await TT.configure('pushAction', function()
		{
			TT.set('key', 'Enter');
			TT.set('script', 'TankLevel = TankLevel + 1;');
			TT.field('addScript').click();
			TT.set('condition', 'whileLeftDown', 1);
			TT.set('period', 250, 1);
			TT.set('script', 'TankLevel = 0;', 1);
		});
		await TT.configure('showWindow', function()
		{
			TT.set('window', true);
			TT.set('windowType', 'popup');
			TT.set('windowX', 20);
			TT.set('windowWidth', 300);
			TT.set('windowTitle', 'Details');
		});

		// Validation: max must be greater than min (dialog stays open)
		var depth = TT.depth();
		TT.check('inputDiscrete');
		await TT.wait(80);
		TT.set('tag', 'Pump1/Run');
		TT.ok();
		await TT.wait(80);
		out.inputDiscreteOk = TT.depth() == depth;
		TT.check('sliderH');
		await TT.wait(80);
		TT.set('tag', 'TankLevel');
		TT.set('atLeft', 5);
		TT.ok();
		await TT.wait(80);
		out.sliderOk = TT.depth() == depth;

		// Failing validation keeps the dialog open
		var before = TT.depth();
		TT.check('pushDiscrete');
		await TT.wait(80);
		TT.ok();
		await TT.wait(100);
		out.emptyTagBlocked = TT.depth() > before;
		while (TT.depth() > before)
		{
			ui.hideDialog();
		}
		// cancelled (not saved) -> not checked
		await TT.wait(50);
		out.pushDiscreteChecked = TT.isChecked('pushDiscrete');

		TT.ok();
		await TT.wait(100);
		out.links = Hmi.Model.getCellConfig(cell).links;
		out.window = Hmi.Model.getDocConfig(graph).window;
		out.attr = cell.value.getAttribute('hmiLinks');
		out.otherLinks = Hmi.Model.getCellConfig(other).links;
		out.summary = Hmi.LinksDialog.summary(out.links);
		out.schema = (Hmi.Schema && Hmi.LinksDialog.schemaSupportsLinks()) ?
			Hmi.Schema.validate('links', out.links) : 'n/a';

		// Undo / redo restore everything in one step
		ui.editor.undoManager.undo();
		out.afterUndo = Object.keys(Hmi.Model.getCellConfig(cell).links).length;
		out.windowAfterUndo = Hmi.Model.getDocConfig(graph).window || null;
		ui.editor.undoManager.redo();
		out.afterRedo = Object.keys(Hmi.Model.getCellConfig(cell).links).length;

		// Re-open: all configured links show as checked and values load
		graph.setSelectionCell(cell);
		Hmi.LinksDialog.show(ui, [cell]);
		await TT.wait(100);
		out.reopenChecked = ['valueDiscrete', 'fillColor:analog', 'lineColor:analogAlarm',
			'textColor:discreteAlarm', 'pushAction'].map(TT.isChecked);
		TT.dlg().querySelector('[data-link="valueDiscrete"] [data-role="configure"]').click();
		await TT.wait(80);
		out.reopenValue = [TT.field('expr').value, TT.field('onMessage').value];
		TT.dlg().querySelector('.gePrimaryBtn').click();
		await TT.wait(50);
		// Uncheck removes the link
		var cb = TT.dlg().querySelector('[data-link="valueString"] [data-role="check"]');
		var cb2 = TT.dlg().querySelector('[data-link="valueDiscrete"] [data-role="check"]');
		cb2.checked = false;
		TT.fire(cb2);
		TT.ok();
		await TT.wait(100);
		out.afterRemove = Object.keys(Hmi.Model.getCellConfig(cell).links).indexOf('valueDiscrete');

		// Multiple selection applies to all cells
		graph.setSelectionCells([cell, other]);
		Hmi.LinksDialog.show(ui, graph.getSelectionCells());
		await TT.wait(100);
		await TT.configure('visibility', function()
		{
			TT.set('expr', 'Pump1/Run');
			TT.set('visibleState', 'off');
		});
		TT.ok();
		await TT.wait(100);
		out.multi = [Hmi.Model.getCellConfig(cell).links.visibility,
			Hmi.Model.getCellConfig(other).links.visibility];

		return out;
	});

	assert.deepStrictEqual(page.hmiErrors, []);
	assert.strictEqual(result.opened, true);
	assert.ok(result.menuLabels.some(function(l) { return /Animation Links/.test(l); }), JSON.stringify(result.menuLabels));
	assert.ok(result.menuLabels.some(function(l) { return /Substitute Tags/.test(l); }));
	assert.strictEqual(result.rowCount, 60);
	assert.ok(result.titles.indexOf('Value Display') >= 0 && result.titles.indexOf('Touch Pushbuttons') >= 0);
	assert.strictEqual(result.textDiscreteStillChecked, false);
	assert.strictEqual(result.inputDiscreteOk, true);
	assert.strictEqual(result.sliderOk, true);
	assert.strictEqual(result.emptyTagBlocked, true);
	assert.strictEqual(result.pushDiscreteChecked, false);

	var l = result.links;
	assert.deepStrictEqual(l.valueDiscrete, {expr: 'Pump1/Run', onMessage: 'Running', offMessage: 'Stopped'});
	assert.strictEqual(l.valueAnalog.expr, 'TankLevel');
	assert.deepStrictEqual(l.valueAnalog.format, {mode: 'fixed', precision: 2, bitsFrom: 0, bitsTo: 31, fixedWidth: true});
	assert.deepStrictEqual([l.locationH.expr, l.locationH.toLeft, l.locationH.toRight, l.locationH.atLeft, l.locationH.atRight],
		['TankLevel', 10, 20, 0, 100]);
	assert.strictEqual(l.sizeHeight.anchor, 'top');
	assert.strictEqual(l.fillColor.kind, 'analog');
	assert.strictEqual(l.fillColor.breakpoints.length, 3);
	assert.deepStrictEqual(l.fillColor.breakpoints[2], {value: 75, color: '#FF0000'});
	assert.strictEqual(l.lineColor.kind, 'analogAlarm');
	assert.strictEqual(l.lineColor.alarmType, 'deviation');
	assert.deepStrictEqual(Object.keys(l.lineColor.colors).sort(), ['major', 'minor', 'normal']);
	assert.strictEqual(l.lineColor.colors.minor, '#FFFF00');
	assert.deepStrictEqual(l.textColor, {kind: 'discreteAlarm', tag: 'Pump1/Run',
		normalColor: '#00C000', alarmColor: '#FF0000'});
	assert.strictEqual(l.fillVertical.direction, 'down');
	assert.strictEqual(l.fillVertical.backgroundColor, '#FFFFFF');
	assert.strictEqual(l.blink.mode, 'visible');
	assert.strictEqual(l.blink.speed, 'fast');
	assert.strictEqual(l.blink.fillColor, '#FFFF00');
	assert.strictEqual(l.blink.textColor, undefined);
	assert.deepStrictEqual([l.tooltip.mode, l.tooltip.text], ['static', 'Main tank']);
	assert.strictEqual(l.inputAnalog.tag, 'TankLevel');
	assert.deepStrictEqual(l.inputAnalog.key, {key: 'F5', ctrl: true, shift: false});
	assert.deepStrictEqual([l.inputAnalog.keypad, l.inputAnalog.message, l.inputAnalog.min, l.inputAnalog.max],
		[true, 'Level?', 0, 'TankMax']);
	assert.deepStrictEqual([l.inputString.echo, l.inputString.passwordChar, l.inputString.encrypt],
		['password', '#', true]);
	assert.deepStrictEqual(l.pushAction.key, {key: 'Enter', ctrl: false, shift: false});
	assert.deepStrictEqual(l.pushAction.scripts, [
		{condition: 'onLeftDown', period: 500, script: 'TankLevel = TankLevel + 1;'},
		{condition: 'whileLeftDown', period: 250, script: 'TankLevel = 0;'}]);
	assert.deepStrictEqual(l.showWindow.windows, ['Page-1']);
	assert.deepStrictEqual(result.window, {type: 'popup', x: 20, width: 300, title: 'Details'});
	assert.strictEqual(result.windowAfterUndo, null);
	assert.deepStrictEqual(result.otherLinks, {});
	assert.ok(result.attr.charAt(0) == '{', 'hmiLinks is a JSON object');
	assert.ok(result.summary.indexOf('Fill Color: Analog (TankLevel, 3 break points)') >= 0, JSON.stringify(result.summary));
	assert.ok(result.summary.some(function(s) { return /^Value Display: Discrete/.test(s); }));

	if (result.schema !== 'n/a')
	{
		assert.deepStrictEqual(result.schema, []);
	}

	assert.strictEqual(result.afterUndo, 0);
	assert.strictEqual(result.afterRedo, Object.keys(l).length);
	assert.deepStrictEqual(result.reopenChecked, [true, true, true, true, true]);
	assert.deepStrictEqual(result.reopenValue, ['Pump1/Run', 'Running']);
	assert.strictEqual(result.afterRemove, -1);
	assert.deepStrictEqual(result.multi[0], {expr: 'Pump1/Run', visibleState: 'off'});
	assert.deepStrictEqual(result.multi[1], {expr: 'Pump1/Run', visibleState: 'off'});
	assert.deepStrictEqual(page.hmiErrors, []);
	await page.close();
});

test('per-link validation: analog limits, break points, expressions, key equivalents', async function()
{
	var page = await util.openEditor(browser, web.url);
	await installHelpers(page);

	var result = await page.evaluate(async function()
	{
		var ui = Hmi.ui;
		var graph = ui.editor.graph;
		var out = {};
		var cell = TT.insert('X', 'v1');
		graph.setSelectionCell(cell);
		Hmi.LinksDialog.show(ui, [cell]);
		await TT.wait(100);

		async function attempt(id, fn)
		{
			var before = TT.depth();
			TT.check(id);
			await TT.wait(80);
			fn();
			TT.ok();
			await TT.wait(100);
			// an error dialog is stacked on top when validation fails
			var blocked = TT.depth() > before + 1;
			var msg = blocked ? TT.dlg().textContent : '';

			while (TT.depth() > before)
			{
				ui.hideDialog();
			}

			await TT.wait(50);

			return {blocked: blocked, msg: msg};
		};

		out.maxMin = await attempt('inputAnalog', function()
		{
			TT.set('tag', 'A');
			TT.set('min', '50');
			TT.set('max', '10');
		});
		out.badExpr = await attempt('valueString', function()
		{
			TT.set('expr', 'A + (');
		});
		out.descending = await attempt('fillColor:analog', function()
		{
			TT.set('expr', 'A');
			TT.set('bpValue', 80, 0);
			TT.set('bpValue', 10, 1);
		});
		out.eleven = await attempt('lineColor:analog', function()
		{
			TT.set('expr', 'A');

			for (var i = 0; i < 12; i++)
			{
				var add = TT.field('addBreakpoint');

				if (!add.disabled)
				{
					add.click();
				}
			}

			out.addDisabledAt10 = TT.field('addBreakpoint').disabled;
			out.rows10 = TT.dlg().querySelectorAll('[data-role="breakpoint"]').length;
			// ascending default values: make them ascending then ok
			var vals = TT.dlg().querySelectorAll('[data-field="bpValue"]');

			for (var j = 0; j < vals.length; j++)
			{
				vals[j].value = j * 5;
			}
		});
		out.tooLong = await attempt('tooltip', function()
		{
			TT.set('text', '');
		});
		out.noWindow = await attempt('hideWindow', function() {});
		out.badScriptEmpty = await attempt('pushAction', function() {});
		out.badColor = await attempt('blink', function()
		{
			TT.set('expr', 'A');
			TT.set('mode', 'visible');
			TT.set('textColor', 'red');
		});

		// format mode enables/disables
		TT.check('valueAnalog');
		await TT.wait(80);
		out.fmtText = [TT.field('formatFixedWidth').disabled, TT.field('formatPrecision').disabled,
			TT.field('formatBitsFrom').disabled];
		TT.set('formatMode', 'hex');
		out.fmtHex = [TT.field('formatFixedWidth').disabled, TT.field('formatPrecision').disabled,
			TT.field('formatBitsFrom').disabled];
		TT.set('formatMode', 'exponential');
		TT.set('formatPrecision', 3);
		out.fmtExp = [TT.field('formatPrecision').disabled, TT.field('formatBitsFrom').disabled];
		TT.field('formatClear').click();
		out.fmtCleared = [TT.field('formatMode').value, TT.field('formatPrecision').value];
		TT.set('formatMode', 'fixed');
		TT.set('formatPrecision', 12);
		TT.set('expr', 'A');
		TT.ok();
		await TT.wait(100);
		out.precisionBlocked = TT.depth() > 2;

		return out;
	});

	assert.strictEqual(result.maxMin.blocked, true);
	assert.match(result.maxMin.msg, /greater than the minimum/);
	assert.strictEqual(result.badExpr.blocked, true);
	assert.strictEqual(result.descending.blocked, true);
	assert.match(result.descending.msg, /ascending/);
	assert.strictEqual(result.addDisabledAt10, true);
	assert.strictEqual(result.rows10, 10);
	assert.strictEqual(result.eleven.blocked, false);
	assert.strictEqual(result.tooLong.blocked, true);
	assert.strictEqual(result.noWindow.blocked, true);
	assert.strictEqual(result.badScriptEmpty.blocked, true);
	assert.strictEqual(result.badColor.blocked, true);
	assert.deepStrictEqual(result.fmtText, [true, true, true]);
	assert.deepStrictEqual(result.fmtHex, [false, true, false]);
	assert.deepStrictEqual(result.fmtExp, [false, true]);
	assert.deepStrictEqual(result.fmtCleared, ['text', '0']);
	assert.strictEqual(result.precisionBlocked, true);
	assert.deepStrictEqual(page.hmiErrors, []);
	await page.close();
});

test('Alt+double-click, HMI tab summary and link badge', async function()
{
	var page = await util.openEditor(browser, web.url);
	await installHelpers(page);

	var result = await page.evaluate(async function()
	{
		var ui = Hmi.ui;
		var graph = ui.editor.graph;
		var out = {};
		var cell = TT.insert('Valve', 'v1');
		var plain = TT.insert('Plain', 'v2');
		Hmi.Model.setCellConfig(graph, [cell], 'links', {
			fillColor: {kind: 'analog', expr: 'TankLevel', breakpoints: [{value: 0, color: '#0000FF'},
				{value: 10, color: '#00FF00'}, {value: 20, color: '#FF0000'}, {value: 30, color: '#FFFF00'}]},
			valueDiscrete: {expr: 'Run', onMessage: 'On', offMessage: 'Off'}});

		// Alt+double-click
		var evt = new MouseEvent('dblclick', {altKey: true, bubbles: true});
		graph.dblClick(evt, cell);
		await TT.wait(150);
		out.altOpened = Hmi.ui.dialog != null && Hmi.ui.dialog.container.querySelector('[data-link="valueDiscrete"]') != null;
		out.altChecked = out.altOpened && TT.isChecked('valueDiscrete');
		Hmi.ui.hideDialog();
		await TT.wait(100);

		// Badge only while on, no model change
		var hist = ui.editor.undoManager.history.length;
		var count = function(c)
		{
			return (c.overlays || []).filter(function(o) { return o.hmiLinkBadge; }).length;
		};
		out.badgeOff = [count(cell), count(plain)];
		Hmi.LinksDialog.decorate(ui, true);
		out.badgeOn = [count(cell), count(plain)];
		Hmi.LinksDialog.decorate(ui, false);
		out.badgeAfter = [count(cell), count(plain)];
		out.historyUnchanged = ui.editor.undoManager.history.length == hist;

		// Dialog open shows badges; closing removes them
		graph.setSelectionCell(cell);
		Hmi.LinksDialog.show(ui, [cell]);
		await TT.wait(150);
		out.badgeInDialog = count(cell);
		ui.hideDialog();
		await TT.wait(100);
		out.badgeAfterDialog = count(cell);

		// HMI tab: summary + button
		graph.clearSelection();
		graph.setSelectionCell(cell);
		await TT.wait(300);
		var tab = Array.prototype.filter.call(document.querySelectorAll('.geFormatTitle'), function(e)
		{
			return e.textContent == 'HMI';
		})[0];
		tab.click();
		await TT.wait(300);
		out.badgeWithTab = count(cell);
		var lines = Array.prototype.map.call(document.querySelectorAll('[data-role="links-summary"] div'), function(e)
		{
			return e.textContent;
		});
		out.summary = lines;
		document.querySelector('[data-role="links-button"]').click();
		await TT.wait(150);
		out.buttonOpens = TT.dlg().querySelector('[data-link="fillColor:analog"]') != null;
		out.fillChecked = TT.isChecked('fillColor:analog');
		ui.hideDialog();
		await TT.wait(100);
		out.badgeStaysWithTab = count(cell);

		// Empty selection: doc summary buttons
		graph.clearSelection();
		await TT.wait(300);
		tab = Array.prototype.filter.call(document.querySelectorAll('.geFormatTitle'), function(e)
		{
			return e.textContent == 'HMI';
		})[0];
		tab.click();
		await TT.wait(200);
		out.docButtons = Array.prototype.map.call(document.querySelectorAll('.geFormatContent button'), function(b)
		{
			return b.textContent;
		}).filter(function(t)
		{
			return /Substitute|Missing/.test(t);
		});
		var other = Array.prototype.filter.call(document.querySelectorAll('.geFormatTitle'), function(e)
		{
			return e.textContent != 'HMI';
		})[0];
		other.click();
		await TT.wait(100);
		out.badgeAfterTab = count(cell);

		// HMI menu actions registered
		out.actions = ['hmiAnimationLinks', 'hmiSubstituteTags', 'hmiDefineMissingTags'].map(function(a)
		{
			return ui.actions.get(a) != null;
		});

		// Edit Data hides hmiLinks like the other hmi* attributes
		graph.setSelectionCell(cell);
		var dlg = new EditDataDialog(ui, cell);
		ui.showDialog(dlg.container, 480, 300, true, true);
		await TT.wait(100);
		var rows = dlg.container.querySelectorAll('.geDialogFormRow');
		out.editDataHidden = Array.prototype.filter.call(rows, function(r)
		{
			var l = r.querySelector('.geDialogFormLabel');

			return l != null && /hmiLinks/.test(l.textContent) && r.style.display != 'none';
		}).length;
		out.editDataHasLinksRow = Array.prototype.some.call(rows, function(r)
		{
			var l = r.querySelector('.geDialogFormLabel');

			return l != null && /hmiLinks/.test(l.textContent);
		});
		ui.hideDialog();

		// Model: scan and hasCellConfig
		var idx = Hmi.Model.scan(graph);
		out.scanLinks = Object.keys(idx.cells.v1.links);
		out.scanPlain = idx.cells.v2 == null;
		out.hasCfg = [Hmi.Model.hasCellConfig(cell), Hmi.Model.hasCellConfig(plain)];
		out.tagToCells = (Hmi.Links != null && Hmi.Links.refs != null) ?
			(idx.tagToCells.TankLevel || []).indexOf('v1') >= 0 : 'n/a';
		out.configLinks = [typeof Hmi.Model.getCellConfig(plain).links, Object.keys(Hmi.Model.getCellConfig(plain).links).length];

		return out;
	});

	assert.strictEqual(result.altOpened, true);
	assert.strictEqual(result.altChecked, true);
	assert.deepStrictEqual(result.badgeOff, [0, 0]);
	assert.deepStrictEqual(result.badgeOn, [1, 0]);
	assert.deepStrictEqual(result.badgeAfter, [0, 0]);
	assert.strictEqual(result.historyUnchanged, true);
	assert.strictEqual(result.badgeInDialog, 1);
	assert.strictEqual(result.badgeAfterDialog, 0);
	assert.strictEqual(result.badgeWithTab, 1);
	assert.strictEqual(result.badgeStaysWithTab, 1);
	assert.strictEqual(result.badgeAfterTab, 0);
	assert.deepStrictEqual(result.summary, ['Value Display: Discrete (Run)',
		'Fill Color: Analog (TankLevel, 4 break points)']);
	assert.strictEqual(result.buttonOpens, true);
	assert.strictEqual(result.fillChecked, true);
	assert.ok(result.docButtons.length >= 2, JSON.stringify(result.docButtons));
	assert.deepStrictEqual(result.actions, [true, true, true]);
	assert.strictEqual(result.editDataHasLinksRow, true);
	assert.strictEqual(result.editDataHidden, 0);
	assert.deepStrictEqual(result.scanLinks.sort(), ['fillColor', 'valueDiscrete']);
	assert.strictEqual(result.scanPlain, true);
	assert.deepStrictEqual(result.hasCfg, [true, false]);

	if (result.tagToCells !== 'n/a')
	{
		assert.strictEqual(result.tagToCells, true);
	}

	assert.deepStrictEqual(result.configLinks, ['object', 0]);
	assert.deepStrictEqual(page.hmiErrors, []);
	await page.close();
});

test('Tag Browser select mode with wildcard filters and list/details views', async function()
{
	var page = await util.openEditor(browser, web.url);
	await installHelpers(page);

	var result = await page.evaluate(async function()
	{
		var ui = Hmi.ui;
		var graph = ui.editor.graph;
		var out = {};
		Hmi.Model.setDocConfig(graph, {version: 1, sources: [], triggers: [], sim: 'off',
			tags: [{name: 'TankLevel', type: 'number', unit: 'm'}, {name: 'TankTemp', type: 'number'},
				{name: 'Tank1', type: 'number'}, {name: 'Pump1/Run', type: 'boolean'},
				{name: 'Pump2.Run', type: 'boolean'}]});
		var M = Hmi.TagBrowser.matches;
		out.matches = [M('TankLevel', 'Tank*'), M('TankLevel', 'tank?'), M('Tank1', 'Tank?'),
			M('Pump1/Run', 'Pump?/Run'), M('Pump2.Run', 'Pump?.Run'), M('TankLevel', 'level'),
			M('TankLevel', '*Level'), M('TankLevel', 'Level*'), M('a+b', 'a+b'), M('a+b', 'a+*')];

		var picked = null;
		Hmi.TagBrowser.select(ui, function(name)
		{
			picked = name;
		}, {});
		await TT.wait(100);
		var names = function()
		{
			return Array.prototype.map.call(TT.dlg().querySelectorAll('.geHmiPickRow'), function(r)
			{
				return r.firstChild.textContent;
			});
		};
		out.all = names().length;
		out.detailsCols = TT.dlg().querySelectorAll('.geHmiPickTable th').length;
		var filter = TT.dlg().querySelector('input[type="text"]');
		filter.value = 'Tank?';
		TT.fire(filter);
		out.tankQ = names();
		filter.value = 'Tank*';
		TT.fire(filter);
		out.tankStar = names();
		var view = TT.dlg().querySelector('select');
		view.value = 'list';
		TT.fire(view);
		out.listView = [TT.dlg().querySelectorAll('.geHmiPickTable').length, TT.dlg().querySelectorAll('.geHmiPickList').length];
		var row = Array.prototype.filter.call(TT.dlg().querySelectorAll('.geHmiPickRow'), function(r)
		{
			return r.textContent == 'TankTemp';
		})[0];
		row.dispatchEvent(new MouseEvent('click', {bubbles: true}));
		row.dispatchEvent(new MouseEvent('dblclick', {bubbles: true}));
		await TT.wait(100);
		out.picked = picked;
		out.closed = TT.depth() == 0;

		// Tag picker field in a link dialog opens the same browser
		var cell = TT.insert('P', 'p1');
		graph.setSelectionCell(cell);
		Hmi.LinksDialog.show(ui, [cell]);
		await TT.wait(100);
		TT.check('sliderH');
		await TT.wait(100);
		var tagInput = TT.field('tag');
		tagInput.dispatchEvent(new MouseEvent('dblclick', {bubbles: true}));
		await TT.wait(100);
		out.pickerDepth = TT.depth();
		var f2 = TT.dlg().querySelector('input[type="text"]');
		f2.value = 'Pump?*';
		TT.fire(f2);
		var r2 = TT.dlg().querySelectorAll('.geHmiPickRow');
		out.pumpRows = r2.length;
		r2[0].dispatchEvent(new MouseEvent('click', {bubbles: true}));
		TT.ok();
		await TT.wait(100);
		out.tagValue = TT.field('tag').value;

		TT.ok();
		await TT.wait(50);
		await closeAll();

		function closeAll()
		{
			while (TT.depth() > 0)
			{
				ui.hideDialog();
			}
		};

		// Floating tag browser: wildcard filter + view toggle
		Hmi.TagBrowser.show(ui);
		await TT.wait(150);
		var win = ui.hmiTagBrowserWindow.window.div;
		var search = win.querySelector('input[type="text"]');
		var count = function()
		{
			return win.querySelectorAll('.geHmiTagRow').length || win.querySelectorAll('tr').length;
		};
		search.value = 'Pump*';
		TT.fire(search);
		out.winPump = Array.prototype.filter.call(win.querySelectorAll('tr'), function(r)
		{
			return /^Pump/.test(r.textContent);
		}).length;
		var vs = win.querySelector('select');
		vs.value = 'list';
		TT.fire(vs);
		out.winListHeader = win.querySelectorAll('th').length;

		return out;
	});

	assert.deepStrictEqual(result.matches, [true, false, true, true, true, true, true, false, true, true]);
	assert.strictEqual(result.all, 5);
	assert.strictEqual(result.detailsCols, 4);
	assert.deepStrictEqual(result.tankQ, ['Tank1']);
	assert.deepStrictEqual(result.tankStar, ['Tank1', 'TankLevel', 'TankTemp']);
	assert.deepStrictEqual(result.listView, [0, 1]);
	assert.strictEqual(result.picked, 'TankTemp');
	assert.strictEqual(result.closed, true);
	assert.strictEqual(result.pickerDepth, 3);
	assert.strictEqual(result.pumpRows, 2);
	assert.strictEqual(result.tagValue, 'Pump1/Run');
	assert.strictEqual(result.winPump, 2);
	assert.strictEqual(result.winListHeader, 0);
	assert.deepStrictEqual(page.hmiErrors, []);
	await page.close();
});

test('Substitute Tags rewrites links, bindings, events, triggers and animations in one undo step', async function()
{
	var page = await util.openEditor(browser, web.url);
	await installHelpers(page);

	var result = await page.evaluate(async function()
	{
		var ui = Hmi.ui;
		var graph = ui.editor.graph;
		var out = {};
		var cell = TT.insert('Tank', 't1');
		var untouched = TT.insert('Other', 't2');
		var set = function(c, attr, v)
		{
			graph.setAttributeForCell(c, attr, JSON.stringify(v));
		};
		var links = {
			valueAnalog: {expr: 'TankLevel * 2 + Tank/Level.Value + TankLevel2 + StrLen("TankLevel")',
				format: {mode: 'text', precision: 0, bitsFrom: 0, bitsTo: 31, fixedWidth: false}},
			inputAnalog: {tag: 'TankLevel', key: null, keypad: false, min: 'TankMin', max: 'TankMax',
				inputOnly: false},
			fillColor: {kind: 'analog', expr: 'TankLevel', breakpoints: [{value: 0, color: '#0000FF'}]},
			lineColor: {kind: 'discreteAlarm', tag: 'TankLevel', normalColor: '#00FF00', alarmColor: '#FF0000'},
			pushAction: {key: null, scripts: [{condition: 'onLeftDown',
				script: 'TankLevel = TankLevel + 1; Other.Value = "TankLevel";'}]},
			visibility: {expr: 'NOT Pump1.Run AND Tank/Level > 3', visibleState: 'on'}};
		set(cell, 'hmiLinks', links);
		set(cell, 'hmiBindings', [{tag: 'TankLevel', target: 'label'},
			{expr: 'tag("TankLevel") + tag("TankLevel2")', target: 'tooltip'},
			{tag: 'Other', target: 'style:hmiLevel', transform: {kind: 'expr', expr: 'value + tag("TankLevel")'}}]);
		set(cell, 'hmiEvents', [{on: 'click', conditions: [{tag: 'TankLevel', operator: '>', value: 1}],
			actions: [{type: 'writeTag', tag: 'TankLevel', value: 1}, {type: 'toggleTag', tag: 'Pump1.Run'}]}]);
		set(cell, 'hmiTriggers', [{name: 'tr', conditions: [{tag: 'Other', operator: '>', valueTag: 'TankLevel'}],
			actions: [{type: 'pulseTag', tag: 'TankLevel', value: 1, reset: 0, ms: 100}]}]);
		set(cell, 'hmiAnimations', [{name: 's', preset: 'spin', params: {rpmTag: 'TankLevel'}}]);
		set(untouched, 'hmiBindings', [{tag: 'TankLevel', target: 'label'}]);
		var before = {};
		['hmiLinks', 'hmiBindings', 'hmiEvents', 'hmiTriggers', 'hmiAnimations'].forEach(function(a)
		{
			before[a] = cell.value.getAttribute(a);
		});
		var histBefore = ui.editor.undoManager.history.length;

		// Collection
		var refs = Hmi.SubstituteTags.collect(ui, [cell]);
		out.refNames = refs.map(function(r)
		{
			return r.name;
		}).sort();

		graph.setSelectionCell(cell);
		Hmi.SubstituteTags.show(ui, [cell]);
		await TT.wait(150);
		out.rows = Array.prototype.map.call(TT.dlg().querySelectorAll('tr[data-tag]'), function(r)
		{
			return r.getAttribute('data-tag');
		}).sort();
		var inputs = TT.dlg().querySelectorAll('[data-field="newName"]');
		var byOld = {};
		Array.prototype.forEach.call(inputs, function(i)
		{
			byOld[i.getAttribute('data-old')] = i;
		});
		byOld.TankLevel.value = 'Tank1/Level';
		byOld['Pump1.Run'].value = 'Pump9';
		byOld.TankMax.value = 'Limits.Max';
		TT.ok();
		await TT.wait(150);

		out.links = JSON.parse(cell.value.getAttribute('hmiLinks'));
		out.bindings = JSON.parse(cell.value.getAttribute('hmiBindings'));
		out.events = JSON.parse(cell.value.getAttribute('hmiEvents'));
		out.triggers = JSON.parse(cell.value.getAttribute('hmiTriggers'));
		out.animations = JSON.parse(cell.value.getAttribute('hmiAnimations'));
		out.untouched = untouched.value.getAttribute('hmiBindings');
		out.historySteps = ui.editor.undoManager.history.length - histBefore;

		ui.editor.undoManager.undo();
		out.undoRestored = ['hmiLinks', 'hmiBindings', 'hmiEvents', 'hmiTriggers', 'hmiAnimations'].every(function(a)
		{
			return cell.value.getAttribute(a) === before[a];
		});

		// Swap A <-> B in one pass
		var map = {TankLevel: 'TankLevel2', TankLevel2: 'TankLevel'};
		out.swap = Hmi.SubstituteTags.rewriteExpr('TankLevel + TankLevel2 * Tank/Level.Name', map);
		out.rewrite = [
			Hmi.SubstituteTags.rewriteExpr('A.B + A.Value + A', {A: 'Z'}),
			Hmi.SubstituteTags.rewriteExpr('xA + A_ + $A + A$ + "A" + \'A\' + A\\B', {A: 'Z'}),
			Hmi.SubstituteTags.rewriteExpr('tag("A") + 1', {A: 'Z'}),
			Hmi.SubstituteTags.rewriteExpr('Show("A"); A = 1;', {A: 'Z'}, true),
			Hmi.SubstituteTags.rewriteExpr('Motor1.Cmd + Motor1', {'Motor1.Cmd': 'M2.Cmd'}),
			Hmi.SubstituteTags.rewriteExpr('(A)+A/B+A-1', {A: 'Z'})];

		// Dialog with no new names changes nothing
		graph.setSelectionCell(cell);
		Hmi.SubstituteTags.show(ui, [cell]);
		await TT.wait(100);
		var h = ui.editor.undoManager.history.length;
		TT.ok();
		await TT.wait(100);
		out.noopHistory = ui.editor.undoManager.history.length == h;

		// Invalid new name keeps the dialog open
		Hmi.SubstituteTags.show(ui, [cell]);
		await TT.wait(100);
		TT.dlg().querySelectorAll('[data-field="newName"]')[0].value = 'bad name';
		TT.ok();
		await TT.wait(100);
		out.invalidBlocked = TT.depth() >= 2;
		while (TT.depth() > 0)
		{
			ui.hideDialog();
		}

		// No selection: whole page
		graph.clearSelection();
		Hmi.SubstituteTags.show(ui, []);
		await TT.wait(100);
		out.pageRows = TT.dlg().querySelectorAll('tr[data-tag]').length > 3;
		ui.hideDialog();

		return out;
	});

	assert.deepStrictEqual(result.refNames, ['Other', 'Pump1.Run', 'Tank/Level', 'TankLevel', 'TankLevel2',
		'TankMax', 'TankMin'].sort(), JSON.stringify(result.refNames));
	assert.deepStrictEqual(result.rows, result.refNames);
	var l = result.links;
	assert.strictEqual(l.valueAnalog.expr, 'Tank1/Level * 2 + Tank/Level.Value + TankLevel2 + StrLen("TankLevel")');
	assert.strictEqual(l.inputAnalog.tag, 'Tank1/Level');
	assert.strictEqual(l.inputAnalog.max, 'Limits.Max');
	assert.strictEqual(l.inputAnalog.min, 'TankMin');
	assert.strictEqual(l.fillColor.expr, 'Tank1/Level');
	assert.strictEqual(l.lineColor.tag, 'Tank1/Level');
	assert.strictEqual(l.pushAction.scripts[0].script, 'Tank1/Level = Tank1/Level + 1; Other.Value = "TankLevel";');
	assert.strictEqual(l.visibility.expr, 'NOT Pump9 AND Tank/Level > 3');
	assert.strictEqual(result.bindings[0].tag, 'Tank1/Level');
	assert.strictEqual(result.bindings[1].expr, 'tag("Tank1/Level") + tag("TankLevel2")');
	assert.strictEqual(result.bindings[2].transform.expr, 'value + tag("Tank1/Level")');
	assert.strictEqual(result.bindings[2].tag, 'Other');
	assert.strictEqual(result.events[0].conditions[0].tag, 'Tank1/Level');
	assert.strictEqual(result.events[0].actions[0].tag, 'Tank1/Level');
	assert.strictEqual(result.events[0].actions[1].tag, 'Pump9');
	assert.strictEqual(result.triggers[0].conditions[0].valueTag, 'Tank1/Level');
	assert.strictEqual(result.triggers[0].conditions[0].tag, 'Other');
	assert.strictEqual(result.triggers[0].actions[0].tag, 'Tank1/Level');
	assert.strictEqual(result.animations[0].params.rpmTag, 'Tank1/Level');
	assert.strictEqual(result.untouched, '[{"tag":"TankLevel","target":"label"}]');
	assert.strictEqual(result.historySteps, 1);
	assert.strictEqual(result.undoRestored, true);
	assert.strictEqual(result.swap, 'TankLevel2 + TankLevel * Tank/Level.Name');
	assert.deepStrictEqual(result.rewrite, [
		'A.B + Z.Value + Z',
		'xA + A_ + $A + A$ + "A" + \'A\' + A\\B',
		'tag("Z") + 1',
		'Show("A"); Z = 1;',
		'M2.Cmd + Motor1',
		'(Z)+A/B+Z-1']);
	assert.strictEqual(result.noopHistory, true);
	assert.strictEqual(result.invalidBlocked, true);
	assert.strictEqual(result.pageRows, true);
	assert.deepStrictEqual(page.hmiErrors, []);
	await page.close();
});

test('Define Missing Tags infers types and adds catalogue entries (undoable)', async function()
{
	var page = await util.openEditor(browser, web.url);
	await installHelpers(page);

	var result = await page.evaluate(async function()
	{
		var ui = Hmi.ui;
		var graph = ui.editor.graph;
		var out = {};
		Hmi.Model.setDocConfig(graph, {version: 1, sources: [], triggers: [], sim: 'off',
			tags: [{name: 'Known', type: 'number'}]});
		var cell = TT.insert('C', 'c1');
		graph.setAttributeForCell(cell, 'hmiLinks', JSON.stringify({
			inputDiscrete: {tag: 'RunCmd', key: null, message: '', setPrompt: 'On', resetPrompt: 'Off',
				onMessage: 'On', offMessage: 'Off', inputOnly: false},
			inputString: {tag: 'Operator', key: null, keypad: false, message: '', echo: 'yes',
				passwordChar: '*', encrypt: false, inputOnly: false},
			inputAnalog: {tag: 'Setpoint', key: null, keypad: false, message: '', min: 'SpMin', max: 100,
				inputOnly: false},
			valueAnalog: {expr: 'Known + Pressure * 2'},
			valueDiscrete: {expr: 'Running', onMessage: 'On', offMessage: 'Off'},
			valueString: {expr: 'Status', },
			fillColor: {kind: 'discreteAlarm', tag: 'HighAlarm', normalColor: '#00FF00', alarmColor: '#FF0000'},
			lineColor: {kind: 'analogAlarm', tag: 'Temp', alarmType: 'value',
				colors: {normal: '#00FF00', lolo: '#FF0000', lo: '#FFA500', hi: '#FFA500', hihi: '#FF0000'}},
			sliderH: {tag: 'Position', atLeft: 0, atRight: 100, toLeft: 0, toRight: 100, reference: 'center'},
			pushDiscrete: {tag: 'Known', key: null, action: 'toggle'}}));
		graph.setAttributeForCell(cell, 'hmiBindings', JSON.stringify([{tag: 'Lamp', target: 'visible'},
			{tag: '$alarms', target: 'label'}]));
		graph.setAttributeForCell(cell, 'hmiEvents', JSON.stringify([{on: 'click', actions: [
			{type: 'toggleTag', tag: 'Toggled'}, {type: 'writeTag', tag: 'Written', value: 1}]}]));

		var missing = Hmi.SubstituteTags.findMissing(ui);
		out.missing = {};
		missing.forEach(function(m)
		{
			out.missing[m.name] = m.type + (m.write ? ':rw' : '');
		});

		var tagsBefore = Hmi.Model.getDocConfig(graph).tags.length;
		var hist = ui.editor.undoManager.history.length;
		Hmi.SubstituteTags.defineMissing(ui);
		await TT.wait(150);
		out.rows = TT.dlg().querySelectorAll('tr[data-tag]').length;
		// uncheck one, change one type
		var rows = TT.dlg().querySelectorAll('tr[data-tag]');
		Array.prototype.forEach.call(rows, function(r)
		{
			if (r.getAttribute('data-tag') == 'Written')
			{
				r.querySelector('[data-field="define"]').checked = false;
			}

			if (r.getAttribute('data-tag') == 'Pressure')
			{
				var sel = r.querySelector('[data-field="type"]');
				sel.value = 'integer';
			}
		});
		TT.ok();
		await TT.wait(150);
		var cfg = Hmi.Model.getDocConfig(graph);
		out.added = {};
		cfg.tags.forEach(function(t)
		{
			if (t.name != 'Known')
			{
				out.added[t.name] = t.type + (t.access == 'rw' ? ':rw' : '');
			}
		});
		out.steps = ui.editor.undoManager.history.length - hist;
		out.tagErrors = cfg.tags.map(function(t)
		{
			return Hmi.Schema.validate('tag', t);
		}).filter(function(e)
		{
			return e.length > 0;
		});
		out.stillMissing = Hmi.SubstituteTags.findMissing(ui).map(function(m)
		{
			return m.name;
		});

		ui.editor.undoManager.undo();
		out.afterUndo = Hmi.Model.getDocConfig(graph).tags.length == tagsBefore;
		ui.editor.undoManager.redo();

		// Nothing left: message instead of a dialog
		Hmi.SubstituteTags.addTags(ui, [{name: 'Written', type: 'number', write: true}]);
		var d = TT.depth();
		Hmi.SubstituteTags.defineMissing(ui);
		await TT.wait(100);
		out.noDialogText = TT.depth() == d + 1 ? TT.dlg().textContent : '';
		while (TT.depth() > 0)
		{
			ui.hideDialog();
		}

		// Menu action runs
		ui.actions.get('hmiDefineMissingTags').funct();
		await TT.wait(100);
		out.actionRuns = TT.depth() > 0;
		while (TT.depth() > 0)
		{
			ui.hideDialog();
		}

		return out;
	});

	assert.deepStrictEqual(result.missing, {RunCmd: 'boolean:rw', Operator: 'string:rw', Setpoint: 'number:rw',
		SpMin: 'number', Pressure: 'number', Running: 'boolean', Status: 'string', HighAlarm: 'boolean',
		Temp: 'number', Position: 'number:rw', Lamp: 'boolean', Toggled: 'boolean:rw', Written: 'number:rw'});
	assert.strictEqual(result.rows, 13);
	assert.strictEqual(result.added.Written, undefined);
	assert.strictEqual(result.added.Pressure, 'integer');
	assert.strictEqual(result.added.RunCmd, 'boolean:rw');
	assert.strictEqual(result.added.Operator, 'string:rw');
	assert.strictEqual(result.added.Running, 'boolean');
	assert.strictEqual(result.added['$alarms'], undefined);
	assert.strictEqual(result.steps, 1);
	assert.deepStrictEqual(result.tagErrors, []);
	assert.deepStrictEqual(result.stillMissing, ['Written']);
	assert.strictEqual(result.afterUndo, true);
	assert.match(result.noDialogText, /already defined/);
	assert.strictEqual(result.actionRuns, true);
	assert.deepStrictEqual(page.hmiErrors, []);
	await page.close();
});

test('Validator reports animation link issues (section 10)', async function()
{
	var page = await util.openEditor(browser, web.url);
	await installHelpers(page);

	var result = await page.evaluate(async function()
	{
		var ui = Hmi.ui;
		var graph = ui.editor.graph;
		Hmi.Model.setDocConfig(graph, {version: 1, sources: [], triggers: [], sim: 'off',
			tags: [{name: 'Level', type: 'number'}, {name: 'Run', type: 'boolean'}]});
		var a = TT.insert('A', 'a1');
		var b = TT.insert('B', 'b1');
		var key = {key: 'F2', ctrl: true, shift: false};
		Hmi.Model.setCellConfig(graph, [a], 'links', {
			valueAnalog: {expr: 'Level >', format: {mode: 'text', precision: 0, bitsFrom: 0, bitsTo: 31, fixedWidth: false}},
			visibility: {expr: 'Run AND Undeclared1', visibleState: 'on'},
			inputAnalog: {tag: 'Level', key: key, keypad: false, message: '', min: 10, max: 5, inputOnly: false},
			showWindow: {key: null, windows: ['NoSuchPage']},
			fillColor: {kind: 'analog', expr: 'Level', breakpoints: [{value: 5, color: '#000000'}, {value: 1, color: '#FFFFFF'}]}});
		Hmi.Model.setCellConfig(graph, [b], 'links', {
			pushDiscrete: {tag: 'Run', key: key, action: 'toggle'},
			sliderH: {tag: 'Level', atLeft: 0, atRight: 100, toLeft: 0, toRight: 100, reference: 'center'}});
		var list = Hmi.Validator.validate(ui);

		return list.map(function(r)
		{
			return r.level + '|' + r.cellId + '|' + r.message;
		});
	});

	var text = result.join('\n');
	assert.match(text, /error\|a1\|link valueAnalog expression/);
	assert.match(text, /warning\|a1\|link: undeclared tag "Undeclared1"/);
	assert.match(text, /error\|a1\|link inputAnalog: maximum \(5\) must be greater than minimum \(10\)/);
	assert.match(text, /error\|a1\|link showWindow: window "NoSuchPage" not found/);
	assert.match(text, /error\|a1\|link fillColor: break points must be in ascending order/);
	assert.match(text, /warning\|b1\|link pushDiscrete: key equivalent Ctrl\+F2 is also used by inputAnalog of cell a1/);
	assert.ok(!/b1\|link: undeclared/.test(text));
	assert.deepStrictEqual(page.hmiErrors, []);
	await page.close();
});
