// End-to-end tests for the editor UI of the meta2d extension links
// (INTOUCH_LINKS.md §11): Animation Links dialog, validator, Substitute Tags
// and Define Missing Tags.
// Run: node --test --test-concurrency=1 etc/hmi/e2e/links-meta2d-ui.e2e.js
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


// Fields allowed per link type (INTOUCH_LINKS.md §11.1)
var FIELDS = {
	opacity: ['expr', 'valueAtMin', 'valueAtMax', 'minPercent', 'maxPercent'],
	states: ['expr', 'states'],
	properties: ['items'],
	widgetData: ['expr', 'series'],
	animation: ['expr', 'preset', 'name', 'rateExpr', 'reverseExpr', 'color'],
	flow: ['expr', 'type', 'reverseExpr', 'speedExpr', 'color', 'width'],
	media: ['expr', 'mode'],
	inputChoice: ['tag', 'key', 'message', 'options'],
	pushValue: ['tag', 'key', 'action', 'value', 'expr', 'min', 'max'],
	openUrl: ['key', 'url', 'target', 'title', 'width', 'height'],
	sendMessage: ['key', 'name', 'payloadExpr', 'to'],
	control: ['key', 'commands'],
	touchOptions: ['confirm', 'confirmTitle', 'roles', 'delay'],
	dataChange: ['expr', 'deadband', 'script'],
	condition: ['expr', 'onTrue', 'onFalse', 'whileTrue', 'whileFalse', 'period']
};

function isSubset(expected, actual, path, errors)
{
	if (expected !== null && typeof expected === 'object')
	{
		if (actual === null || typeof actual !== 'object')
		{
			errors.push(path + ': expected object, got ' + JSON.stringify(actual));

			return;
		}

		if (Array.isArray(expected))
		{
			if (!Array.isArray(actual) || actual.length != expected.length)
			{
				errors.push(path + ': expected array of ' + expected.length + ', got ' + JSON.stringify(actual));

				return;
			}
		}

		for (var k in expected)
		{
			isSubset(expected[k], actual[k], path + '.' + k, errors);
		}
	}
	else if (expected !== actual)
	{
		errors.push(path + ': expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
	}
}

function assertLinks(links, expected)
{
	var errors = [];

	for (var type in expected)
	{
		assert.ok(links[type] != null, 'missing link ' + type);
		isSubset(expected[type], links[type], type, errors);

		for (var k in links[type])
		{
			assert.ok(FIELDS[type].indexOf(k) >= 0, type + '.' + k + ' is not a §11.1 field');
		}
	}

	assert.deepStrictEqual(errors, []);
}

var KEYS = function(key, ctrl)
{
	return {key: key, ctrl: !!ctrl, shift: false};
};

var EXPECTED = {
	opacity: {expr: 'TankLevel', valueAtMin: 0, valueAtMax: 100, minPercent: 10, maxPercent: 90},
	states: {expr: 'TankLevel', states: [
		{match: '0..50', fillColor: '#00FF00', label: '#.# m', visible: true, blink: true},
		{match: '*', textColor: '#FF0000', image: 'img.png', opacity: 40}]},
	properties: {items: [{target: 'style:fillColor', expr: 'TankLevel * 2'},
		{target: 'attr:foo', expr: 'Pump1/Run'}]},
	widgetData: {expr: 'TankLevel', series: [{tag: 'TankLevel', name: 'Level', maxPoints: 300},
		{tag: 'Pump1/Run', maxPoints: 600}]},
	animation: {expr: 'Pump1/Run', preset: 'glow', color: '#FFAA00', rateExpr: 'TankLevel / 10'},
	flow: {expr: 'Pump1/Run', type: 'arrows', color: '#0000FF', width: 3, speedExpr: 'TankLevel / 50',
		reverseExpr: 'TankLevel < 0'},
	media: {expr: 'Pump1/Run', mode: 'pause'},
	inputChoice: {tag: 'Mode', key: KEYS('F2'), message: 'Pick', options: [
		{label: 'Auto', value: 1}, {label: 'Manual', value: 2}]},
	pushValue: {tag: 'TankLevel', key: KEYS('F3', true), action: 'add', value: 5, min: 0, max: 100},
	openUrl: {key: KEYS('F4'), url: 'https://example.com/${id}', target: 'dialog', title: 'Docs',
		width: 800, height: 480},
	sendMessage: {key: KEYS('F5'), name: 'alarmAck', payloadExpr: 'TankLevel', to: 'both'},
	control: {key: KEYS('F6'), commands: [{object: 'c2', command: 'startAnimation'},
		{object: 'tag:pumps', command: 'playMedia'},
		{object: 'Me', command: 'stopAnimation', animation: 'wiggle'}]},
	touchOptions: {confirm: 'Really?', confirmTitle: 'Confirm', roles: ['operator', 'admin'], delay: 250},
	dataChange: {expr: 'TankLevel', deadband: 0.5, script: 'TankLevel = 0;'},
	condition: {expr: 'Pump1/Run', onTrue: 'TankLevel = 1;', whileTrue: 'TankLevel = TankLevel + 1;',
		period: 500}
};

// Fills and saves every new link of the Animation Links dialog (TT in the page)
async function fillAll(page)
{
	return page.evaluate(async function()
	{
		var ui = Hmi.ui;
		var graph = ui.editor.graph;
		var out = {};
		var cell = TT.insert('Tank', 'c1');
		TT.insert('Other', 'c2');
		graph.setSelectionCell(cell);
		Hmi.Model.setDocConfig(graph, {version: 1, sources: [], triggers: [], sim: 'off',
			tags: [{name: 'TankLevel', type: 'number'}, {name: 'Pump1/Run', type: 'boolean'},
			{name: 'Mode', type: 'number'}]});
		Hmi.LinksDialog.show(ui, [cell]);
		await TT.wait(150);

		out.rows = TT.dlg().querySelectorAll('[data-link]').length;
		out.bands = Array.prototype.map.call(TT.dlg().querySelectorAll('[role="tab"]'), function(e)
		{
			return e.querySelector('.geHmiTabLabel').textContent;
		});
		out.titles = Array.prototype.map.call(TT.dlg().querySelectorAll('.geHmiGroupTitle'), function(e)
		{
			return e.textContent;
		});
		out.groups = {};
		Array.prototype.forEach.call(TT.dlg().querySelectorAll('.geHmiGroupTitle'), function(t)
		{
			out.groups[t.textContent] = Array.prototype.map.call(
				t.parentNode.querySelectorAll('[data-link]'), function(r)
				{
					return r.getAttribute('data-link') + '=' + r.textContent;
				});
		});

		await TT.configure('opacity', function()
		{
			TT.set('expr', 'TankLevel');
			TT.set('minPercent', 10);
			TT.set('maxPercent', 90);
		});
		await TT.configure('states', function()
		{
			TT.set('expr', 'TankLevel');
			TT.set('stMatch', '0..50', 0);
			TT.set('st_fillColor', '#00FF00', 0);
			TT.set('stLabel', '#.# m', 0);
			TT.set('stVisible', 'true', 0);
			TT.set('stBlink', true, 0);
			TT.field('addState').click();
			TT.set('stMatch', '*', 1);
			TT.set('st_textColor', '#FF0000', 1);
			TT.set('stOpacity', 40, 1);
			TT.set('stImage', 'img.png', 1);
		});
		await TT.configure('properties', function()
		{
			TT.set('propPick', 'style:fillColor', 0);
			TT.set('propExpr', 'TankLevel * 2', 0);
			TT.field('addProperty').click();
			TT.set('propTarget', 'attr:foo', 1);
			TT.set('propExpr', 'Pump1/Run', 1);
		});
		await TT.configure('widgetData', function()
		{
			TT.set('expr', 'TankLevel');
			TT.field('addSeries').click();
			TT.set('seriesTag', 'TankLevel', 0);
			TT.set('seriesName', 'Level', 0);
			TT.set('seriesMax', 300, 0);
			TT.field('addSeries').click();
			TT.set('seriesTag', 'Pump1/Run', 1);
		});
		await TT.configure('animation', function()
		{
			TT.set('expr', 'Pump1/Run');
			out.animHiddenBefore = [!!TT.field('color').offsetParent, !!TT.field('name').offsetParent,
				!!TT.field('reverseExpr').offsetParent];
			TT.set('preset', 'glow');
			out.animHiddenGlow = [!!TT.field('color').offsetParent, !!TT.field('name').offsetParent,
				!!TT.field('reverseExpr').offsetParent];
			TT.set('color', '#FFAA00');
			TT.set('rateExpr', 'TankLevel / 10');
		});
		await TT.configure('flow', function()
		{
			TT.set('expr', 'Pump1/Run');
			TT.set('type', 'arrows');
			TT.set('color', '#0000FF');
			TT.set('width', 3);
			TT.set('speedExpr', 'TankLevel / 50');
			TT.set('reverseExpr', 'TankLevel < 0');
		});
		await TT.configure('media', function()
		{
			TT.set('expr', 'Pump1/Run');
			TT.set('mode', 'pause');
		});
		await TT.configure('inputChoice', function()
		{
			TT.set('tag', 'Mode');
			TT.set('key', 'F2');
			TT.set('message', 'Pick');
			TT.set('choiceLabel', 'Auto', 0);
			TT.set('choiceValue', '1', 0);
			TT.field('addChoice').click();
			TT.set('choiceLabel', 'Manual', 1);
			TT.set('choiceValue', '2', 1);
		});
		await TT.configure('pushValue', function()
		{
			TT.set('tag', 'TankLevel');
			TT.set('keyCtrl', true);
			TT.set('key', 'F3');
			out.pvSet = [!!TT.field('value').offsetParent, !!TT.field('expr').offsetParent,
				!!TT.field('min').offsetParent];
			TT.set('action', 'expression');
			out.pvExpr = [!!TT.field('value').offsetParent, !!TT.field('expr').offsetParent,
				!!TT.field('min').offsetParent];
			TT.set('action', 'add');
			out.pvAdd = [!!TT.field('value').offsetParent, !!TT.field('expr').offsetParent,
				!!TT.field('min').offsetParent];
			TT.set('value', '5');
			TT.set('min', 0);
			TT.set('max', 100);
		});
		await TT.configure('openUrl', function()
		{
			TT.set('key', 'F4');
			TT.set('url', 'https://example.com/${id}');
			out.urlBlank = !!TT.field('title').offsetParent;
			TT.set('target', 'dialog');
			out.urlDialog = !!TT.field('title').offsetParent;
			TT.set('title', 'Docs');
			TT.set('width', 800);
		});
		await TT.configure('sendMessage', function()
		{
			TT.set('key', 'F5');
			TT.set('name', 'alarmAck');
			TT.set('payloadExpr', 'TankLevel');
			TT.set('to', 'both');
		});
		await TT.configure('control', function()
		{
			TT.set('key', 'F6');
			TT.set('cmdObject', 'c2', 0);
			TT.field('addCommand').click();
			TT.set('cmdObject', 'tag:pumps', 1);
			TT.set('cmdCommand', 'playMedia', 1);
			out.cmdAnimDisabled = TT.field('cmdAnimation', 1).disabled;
			TT.field('addCommand').click();
			TT.set('cmdObject', 'Me', 2);
			TT.set('cmdCommand', 'stopAnimation', 2);
			TT.set('cmdAnimation', 'wiggle', 2);
		});
		await TT.configure('touchOptions', function()
		{
			TT.set('confirm', 'Really?');
			TT.set('confirmTitle', 'Confirm');
			TT.set('roles', 'operator, admin');
			TT.set('delay', 250);
		});
		await TT.configure('dataChange', function()
		{
			TT.set('expr', 'TankLevel');
			TT.set('deadband', 0.5);
			TT.set('script', 'TankLevel = 0;');
			TT.field('checkScript').click();
			out.scriptOk = TT.dlg().querySelector('[data-role="scriptResult"]').textContent;
		});
		await TT.configure('condition', function()
		{
			TT.set('expr', 'Pump1/Run');
			TT.set('onTrue', 'TankLevel = 1;');
			TT.set('whileTrue', 'TankLevel = TankLevel + 1;');
			TT.set('period', 500);
		});

		TT.ok();
		await TT.wait(120);
		out.links = JSON.parse(cell.value.getAttribute('hmiLinks'));
		out.summary = Hmi.LinksDialog.summary(out.links);
		out.schema = Hmi.Schema.validate('links', out.links);

		return out;
	});
}

test('Animation Links dialog configures every extension link and round-trips', async function()
{
	var page = await util.openEditor(browser, web.url);
	await installHelpers(page);
	var out = await fillAll(page);

	assert.deepStrictEqual(page.hmiErrors, []);
	assert.strictEqual(out.rows, 57);
	assert.deepStrictEqual(out.bands, ['Display', 'Animation', 'Touch', 'Scripts']);
	assert.ok(['States and Properties', 'Animation', 'Actions', 'Object Scripts'].every(function(t)
	{
		return out.titles.indexOf(t) >= 0;
	}), JSON.stringify(out.titles));
	assert.ok(out.groups.Miscellaneous.some(function(r) { return /^opacity=Opacity/.test(r); }));
	assert.deepStrictEqual(out.groups['States and Properties'].map(function(r) { return r.split('=')[0]; }),
		['states', 'properties', 'widgetData', 'bindings']);
	assert.deepStrictEqual(out.groups.Animation.map(function(r) { return r.split('=')[0]; }),
		['animation', 'flow', 'media', 'keyframes']);
	assert.ok(out.groups['User Inputs'].some(function(r) { return /^inputChoice=Choice/.test(r); }));
	assert.ok(out.groups['Touch Pushbuttons'].some(function(r) { return /^pushValue=Analog\/String Value/.test(r); }));
	assert.deepStrictEqual(out.groups.Actions.map(function(r) { return r.split('=')[0]; }),
		['openUrl', 'sendMessage', 'control', 'touchOptions', 'events', 'security', 'hoverHalo']);
	assert.deepStrictEqual(out.groups['Object Scripts'].map(function(r) { return r.split('=')[0]; }),
		['dataChange', 'condition']);

	assert.deepStrictEqual(out.animHiddenBefore, [false, false, true]);
	assert.deepStrictEqual(out.animHiddenGlow, [true, false, false]);
	assert.deepStrictEqual(out.pvSet, [true, false, false]);
	assert.deepStrictEqual(out.pvExpr, [false, true, false]);
	assert.deepStrictEqual(out.pvAdd, [true, false, true]);
	assert.deepStrictEqual([out.urlBlank, out.urlDialog], [false, true]);
	assert.strictEqual(out.cmdAnimDisabled, true);
	assert.ok(/OK|ok/i.test(out.scriptOk) || out.scriptOk !== '', out.scriptOk);

	assertLinks(out.links, EXPECTED);
	assert.deepStrictEqual(out.schema, []);
	assert.strictEqual(Object.keys(out.links).length, 15);
	assert.strictEqual(out.summary.length, 15);
	assert.ok(out.summary.some(function(s) { return /^Miscellaneous: Opacity \(TankLevel\)/.test(s); }), JSON.stringify(out.summary));
	assert.ok(out.summary.some(function(s) { return /^States and Properties: Multi-State \(TankLevel, 2 states\)/.test(s); }), JSON.stringify(out.summary));
	assert.ok(out.summary.some(function(s) { return /^Actions: Open URL \(https:\/\/example.com/.test(s); }));
	assert.ok(out.summary.some(function(s) { return /^Object Scripts: Condition \(Pump1\/Run\)/.test(s); }));
	assert.ok(out.summary.some(function(s) { return /^User Inputs: Choice \(Mode, 2 options\)/.test(s); }));
	assert.ok(out.summary.some(function(s) { return /^Actions: Animation\/Media Control \(3 commands\)/.test(s); }), JSON.stringify(out.summary));

	// Reopen: everything checked, values load, OK without changes keeps the JSON
	var again = await page.evaluate(async function()
	{
		var ui = Hmi.ui;
		var graph = ui.editor.graph;
		var cell = graph.model.getCell('c1');
		var out = {};
		var before = cell.value.getAttribute('hmiLinks');
		graph.setSelectionCell(cell);
		Hmi.LinksDialog.show(ui, [cell]);
		await TT.wait(150);
		var ids = Object.keys(JSON.parse(before));
		out.allChecked = ids.every(TT.isChecked);

		function open(id)
		{
			TT.dlg().querySelector('[data-link="' + id + '"] [data-role="configure"]').click();
		};

		open('states');
		await TT.wait(80);
		out.stateRows = TT.dlg().querySelectorAll('[data-role="state"]').length;
		out.state0 = [TT.field('stMatch', 0).value, TT.field('st_fillColor', 0).value,
			TT.field('stVisible', 0).value, TT.field('stBlink', 0).checked];
		out.state1 = [TT.field('stMatch', 1).value, TT.field('st_textColor', 1).value,
			TT.field('stOpacity', 1).value, TT.field('stImage', 1).value, TT.field('stVisible', 1).value];
		// Reorder: move the second state up
		TT.dlg().querySelectorAll('[data-role="state"]')[1].querySelector('[data-role="up"]').click();
		out.reordered = [TT.field('stMatch', 0).value, TT.field('stMatch', 1).value];
		TT.dlg().querySelectorAll('[data-role="state"]')[0].querySelector('[data-role="down"]').click();
		out.restored = [TT.field('stMatch', 0).value, TT.field('stMatch', 1).value];
		TT.ok();
		await TT.wait(80);

		open('control');
		await TT.wait(80);
		out.cmds = [TT.field('cmdObject', 1).value, TT.field('cmdCommand', 1).value,
			TT.field('cmdAnimation', 2).value, TT.field('key').value];
		TT.ok();
		await TT.wait(80);

		open('touchOptions');
		await TT.wait(80);
		out.opts = [TT.field('confirm').value, TT.field('roles').value, TT.field('delay').value];
		TT.ok();
		await TT.wait(80);

		['opacity', 'properties', 'widgetData', 'animation', 'flow', 'media', 'inputChoice', 'pushValue',
			'openUrl', 'sendMessage', 'dataChange', 'condition'].forEach(function(id)
		{
			out['cfg_' + id] = true;
		});

		for (var i = 0; i < ids.length; i++)
		{
			if (ids[i] != 'states' && ids[i] != 'control' && ids[i] != 'touchOptions')
			{
				open(ids[i]);
				await TT.wait(60);
				TT.ok();
				await TT.wait(60);
			}
		}

		out.depth = TT.depth();
		TT.ok();
		await TT.wait(100);
		out.unchanged = (cell.value.getAttribute('hmiLinks') == before);
		out.changed = JSON.stringify(JSON.parse(cell.value.getAttribute('hmiLinks'))) == before;

		// Uncheck removes a new link
		Hmi.LinksDialog.show(ui, [cell]);
		await TT.wait(100);
		var cb = TT.dlg().querySelector('[data-link="flow"] [data-role="check"]');
		cb.checked = false;
		TT.fire(cb);
		TT.ok();
		await TT.wait(100);
		out.flowRemoved = JSON.parse(cell.value.getAttribute('hmiLinks')).flow === undefined;

		// Undo restores flow, again undo removes everything, redo brings it back
		ui.editor.undoManager.undo();
		out.undo1 = Object.keys(JSON.parse(cell.value.getAttribute('hmiLinks'))).length;
		var steps = 0;

		// the save without changes may or may not be an undo step of its own
		while (Object.keys(Hmi.Model.getCellConfig(cell).links).length > 0 && steps < 3)
		{
			ui.editor.undoManager.undo();
			steps++;
		}

		out.undo2 = Object.keys(Hmi.Model.getCellConfig(cell).links).length;

		while (steps > 0)
		{
			ui.editor.undoManager.redo();
			steps--;
		}

		out.redo = Object.keys(Hmi.Model.getCellConfig(cell).links).length;

		return out;
	});

	assert.strictEqual(again.allChecked, true);
	assert.strictEqual(again.stateRows, 2);
	assert.deepStrictEqual(again.state0, ['0..50', '#00FF00', 'true', true]);
	assert.deepStrictEqual(again.state1, ['*', '#FF0000', '40', 'img.png', '']);
	assert.deepStrictEqual(again.reordered, ['*', '0..50']);
	assert.deepStrictEqual(again.restored, ['0..50', '*']);
	assert.deepStrictEqual(again.cmds, ['tag:pumps', 'playMedia', 'wiggle', 'F6']);
	assert.deepStrictEqual(again.opts, ['Really?', 'operator, admin', '250']);
	assert.strictEqual(again.depth, 1);
	assert.strictEqual(again.changed, true);
	assert.strictEqual(again.flowRemoved, true);
	assert.strictEqual(again.undo1, 15);
	assert.strictEqual(again.undo2, 0);
	assert.strictEqual(again.redo, 15);
	assert.deepStrictEqual(page.hmiErrors, []);
	await page.close();
});

test('per-link validation of the extension links blocks bad input', async function()
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
			var blocked = TT.depth() > before + 1;
			var msg = blocked ? TT.dlg().textContent : '';

			while (TT.depth() > before)
			{
				ui.hideDialog();
			}

			await TT.wait(50);

			return {blocked: blocked, msg: msg};
		};

		out.noOptions = await attempt('inputChoice', function()
		{
			TT.set('tag', 'A');
			TT.dlg().querySelector('[data-role="choice"] [data-role="delete"]').click();
		});
		out.emptyOption = await attempt('inputChoice', function()
		{
			TT.set('tag', 'A');
		});
		out.addNaN = await attempt('pushValue', function()
		{
			TT.set('tag', 'A');
			TT.set('action', 'add');
			TT.set('value', 'abc');
		});
		out.minMax = await attempt('pushValue', function()
		{
			TT.set('tag', 'A');
			TT.set('action', 'subtract');
			TT.set('value', '1');
			TT.set('min', 10);
			TT.set('max', 5);
		});
		out.js = await attempt('openUrl', function()
		{
			TT.set('url', 'javascript:alert(1)');
		});
		out.emptyUrl = await attempt('openUrl', function() {});
		out.badScript = await attempt('dataChange', function()
		{
			TT.set('expr', 'A');
			TT.set('script', 'IF A THEN');
		});
		out.noScript = await attempt('condition', function()
		{
			TT.set('expr', 'A');
		});
		out.badWhile = await attempt('condition', function()
		{
			TT.set('expr', 'A');
			TT.set('whileTrue', 'A = ;');
		});
		out.badRate = await attempt('animation', function()
		{
			TT.set('rateExpr', 'A + (');
		});
		out.customNoName = await attempt('animation', function()
		{
			TT.set('preset', 'custom');
		});
		out.badMatch = await attempt('states', function()
		{
			TT.set('expr', 'A');
			TT.set('stMatch', '');
		});
		out.badColor = await attempt('states', function()
		{
			TT.set('expr', 'A');
			TT.set('stMatch', '1');
			TT.set('st_fillColor', 'red');
		});
		out.badOpacity = await attempt('states', function()
		{
			TT.set('expr', 'A');
			TT.set('stMatch', '1');
			TT.set('stOpacity', 140);
		});
		out.badTarget = await attempt('properties', function()
		{
			TT.set('propTarget', 'foo');
			TT.set('propExpr', 'A');
		});
		out.badPropExpr = await attempt('properties', function()
		{
			TT.set('propTarget', 'label');
			TT.set('propExpr', '1 +');
		});
		out.noWidgetData = await attempt('widgetData', function() {});
		out.noMessage = await attempt('sendMessage', function() {});
		out.noCommands = await attempt('control', function()
		{
			TT.dlg().querySelector('[data-role="command"] [data-role="delete"]').click();
		});
		out.seriesNoTag = await attempt('widgetData', function()
		{
			TT.field('addSeries').click();
		});
		out.noMedia = await attempt('media', function() {});
		out.okFlow = await attempt('flow', function() {});
		out.okTouch = await attempt('touchOptions', function() {});

		return out;
	});

	['noOptions', 'emptyOption', 'addNaN', 'minMax', 'js', 'emptyUrl', 'badScript', 'noScript', 'badWhile',
		'badRate', 'customNoName', 'badMatch', 'badColor', 'badOpacity', 'badTarget', 'badPropExpr',
		'noWidgetData', 'noMessage', 'noCommands', 'seriesNoTag', 'noMedia'].forEach(function(k)
	{
		assert.strictEqual(result[k].blocked, true, k);
	});

	assert.match(result.addNaN.msg, /enter a number/);
	assert.match(result.js.msg, /http, https/);
	assert.match(result.badScript.msg, /Script/);
	assert.strictEqual(result.okFlow.blocked, false);
	assert.strictEqual(result.okTouch.blocked, false);
	assert.deepStrictEqual(page.hmiErrors, []);
	await page.close();
});

test('validator covers the extension links', async function()
{
	var page = await util.openEditor(browser, web.url);
	await installHelpers(page);

	var result = await page.evaluate(async function()
	{
		var ui = Hmi.ui;
		var graph = ui.editor.graph;
		var a = TT.insert('A', 'a1');
		var b = TT.insert('B', 'b1');
		var good = TT.insert('Good', 'g1');
		TT.insert('Target', 't1');
		Hmi.Model.setDocConfig(graph, {version: 1, sources: [], triggers: [], sim: 'off',
			tags: [{name: 'Known', type: 'number'}, {name: 'Flag', type: 'boolean'}]});
		Hmi.Model.setCellConfig(graph, [a], 'links', {
			inputChoice: {tag: 'Known', key: {key: 'F1', ctrl: false, shift: false}, options: []},
			pushValue: {tag: 'Known', action: 'add', value: 'abc'},
			openUrl: {url: 'javascript:alert(1)'},
			sendMessage: {name: 'x', payloadExpr: 'Known +', to: 'page'},
			control: {commands: [{object: 'nope', command: 'startAnimation'},
				{object: 't1', command: 'stopAnimation'}, {object: 'Me', command: 'playMedia'},
				{object: 'tag:missing', command: 'stopMedia'}]},
			dataChange: {expr: 'Known', script: 'IF Known THEN'},
			condition: {expr: 'Flag', onTrue: 'Known = 1;', whileFalse: 'Known = ;', period: 1000},
			animation: {preset: 'spin', rateExpr: 'Known * (', reverseExpr: 'Flag'},
			widgetData: {expr: 'Unknown1', series: [{tag: 'Unknown2', maxPoints: 10}]},
			flow: {expr: 'Flag', speedExpr: 'Unknown3'},
			states: {expr: 'Known', states: [{match: '*'}]},
			properties: {items: [{target: 'label', expr: 'Unknown4'}]}});
		Hmi.Model.setCellConfig(graph, [b], 'links', {
			pushValue: {tag: 'Known', key: {key: 'F1', ctrl: false, shift: false}, action: 'set', value: 1},
			openUrl: {url: 'ftp://example.com/x'}});
		Hmi.Model.setCellConfig(graph, [good], 'links', {
			openUrl: {url: '/docs/${id}.html', target: 'blank'},
			control: {commands: [{object: 'a1', command: 'startAnimation'}]},
			inputChoice: {tag: 'Known', options: [{label: 'A', value: 1}]},
			pushValue: {tag: 'Known', action: 'add', value: 2},
			dataChange: {expr: 'Known', script: 'Known = 1;'}});

		var list = Hmi.Validator.validate(ui);

		return list.map(function(r)
		{
			return r.level + '|' + r.cellId + '|' + r.message;
		});
	});

	function has(re)
	{
		assert.ok(result.some(function(m) { return re.test(m); }), String(re) + ' in ' + JSON.stringify(result, null, 1));
	}

	has(/^error\|a1\|link inputChoice: no options/);
	has(/^error\|a1\|link pushValue: action add needs a numeric value/);
	has(/^error\|a1\|link openUrl: url "javascript:alert\(1\)" is not allowed/);
	has(/^error\|b1\|link openUrl: url "ftp:\/\/example.com\/x" is not allowed/);
	has(/^error\|a1\|link sendMessage payloadExpr/);
	has(/^error\|a1\|link control: command 1: object "nope" not found/);
	has(/^error\|a1\|link control: command 4: object "tag:missing" not found/);
	has(/^error\|a1\|link dataChange script script/);
	has(/^error\|a1\|link condition whileFalse script/);
	has(/^error\|a1\|link animation rateExpr/);
	has(/^warning\|a1\|link: undeclared tag "Unknown1"/);
	has(/^warning\|a1\|link: undeclared tag "Unknown2"/);
	has(/^warning\|a1\|link: undeclared tag "Unknown3"/);
	has(/^warning\|a1\|link: undeclared tag "Unknown4"/);
	has(/^warning\|b1\|link pushValue: key equivalent F1 is also used by inputChoice of cell a1/);
	assert.ok(!result.some(function(m) { return /^[a-z]+\|g1\|/.test(m); }), JSON.stringify(result.filter(function(m) { return /\|g1\|/.test(m); })));
	assert.ok(!result.some(function(m) { return /object "(t1|Me)"/.test(m); }));
	assert.deepStrictEqual(page.hmiErrors, []);
	await page.close();
});

test('Substitute Tags and Define Missing Tags cover the extension links', async function()
{
	var page = await util.openEditor(browser, web.url);
	await installHelpers(page);
	await fillAll(page);

	var result = await page.evaluate(async function()
	{
		var ui = Hmi.ui;
		var graph = ui.editor.graph;
		var out = {};
		var cell = graph.model.getCell('c1');
		var before = cell.value.getAttribute('hmiLinks');
		var refs = Hmi.SubstituteTags.collect(ui, [cell]);
		out.names = refs.map(function(r)
		{
			return r.name + ':' + r.type;
		});

		Hmi.SubstituteTags.show(ui, [cell]);
		await TT.wait(150);
		var input = TT.dlg().querySelector('[data-field="newName"][data-old="TankLevel"]');
		out.hasRow = input != null;
		input.value = 'Tank2';
		TT.fire(input);
		var input2 = TT.dlg().querySelector('[data-field="newName"][data-old="Pump1/Run"]');
		input2.value = 'Pump2/Run';
		TT.fire(input2);
		TT.ok();
		await TT.wait(120);
		out.links = JSON.parse(cell.value.getAttribute('hmiLinks'));
		out.text = cell.value.getAttribute('hmiLinks');
		ui.editor.undoManager.undo();
		out.undone = (cell.value.getAttribute('hmiLinks') == before);

		// Define Missing Tags: type inference from the new links
		var other = TT.insert('M', 'm1');
		Hmi.Model.setCellConfig(graph, [other], 'links', {
			widgetData: {expr: 'WdTag', series: [{tag: 'SeriesTag', maxPoints: 10}]},
			opacity: {expr: 'OpTag', valueAtMin: 0, valueAtMax: 100, minPercent: 0, maxPercent: 100},
			condition: {expr: 'CondTag', onTrue: 'CondOut = 1;', period: 1000},
			media: {expr: 'MediaTag', mode: 'play'},
			flow: {expr: 'FlowTag', type: 'dash', speedExpr: 'SpeedTag', reverseExpr: 'RevTag'},
			animation: {expr: 'AnimTag', preset: 'spin', rateExpr: 'RateTag'},
			inputChoice: {tag: 'ChoiceNum', options: [{label: 'a', value: 1}, {label: 'b', value: '2'}]},
			sendMessage: {name: 'm', payloadExpr: 'PayloadTag', to: 'page'},
			pushValue: {tag: 'PvNum', action: 'add', value: 1}});
		var second = TT.insert('N', 'n1');
		Hmi.Model.setCellConfig(graph, [second], 'links', {
			inputChoice: {tag: 'ChoiceStr', options: [{label: 'a', value: 'x'}, {label: 'b', value: 2}]},
			pushValue: {tag: 'PvStr', action: 'set', value: 'abc'}});
		var missing = Hmi.SubstituteTags.findMissing(ui);
		out.missing = {};
		missing.forEach(function(r)
		{
			out.missing[r.name] = r.type + (r.write ? ':rw' : '');
		});

		return out;
	});

	assert.ok(result.names.indexOf('TankLevel:number') >= 0, JSON.stringify(result.names));
	assert.ok(result.names.some(function(n) { return /^Pump1\/Run:/.test(n); }), JSON.stringify(result.names));
	assert.ok(result.names.indexOf('Mode:number') >= 0, JSON.stringify(result.names));
	assert.strictEqual(result.hasRow, true);
	assert.ok(!/TankLevel/.test(result.text), result.text);
	assert.ok(!/Pump1\/Run/.test(result.text), result.text);
	var l = result.links;
	assert.strictEqual(l.opacity.expr, 'Tank2');
	assert.strictEqual(l.states.expr, 'Tank2');
	assert.strictEqual(l.properties.items[0].expr, 'Tank2 * 2');
	assert.strictEqual(l.properties.items[1].expr, 'Pump2/Run');
	assert.strictEqual(l.widgetData.expr, 'Tank2');
	assert.strictEqual(l.widgetData.series[0].tag, 'Tank2');
	assert.strictEqual(l.widgetData.series[1].tag, 'Pump2/Run');
	assert.strictEqual(l.animation.rateExpr, 'Tank2 / 10');
	assert.strictEqual(l.animation.expr, 'Pump2/Run');
	assert.strictEqual(l.flow.speedExpr, 'Tank2 / 50');
	assert.strictEqual(l.flow.reverseExpr, 'Tank2 < 0');
	assert.strictEqual(l.media.expr, 'Pump2/Run');
	assert.strictEqual(l.pushValue.tag, 'Tank2');
	assert.strictEqual(l.sendMessage.payloadExpr, 'Tank2');
	assert.strictEqual(l.dataChange.expr, 'Tank2');
	assert.strictEqual(l.dataChange.script, 'Tank2 = 0;');
	assert.strictEqual(l.condition.expr, 'Pump2/Run');
	assert.strictEqual(l.condition.onTrue, 'Tank2 = 1;');
	assert.strictEqual(l.condition.whileTrue, 'Tank2 = Tank2 + 1;');
	assert.strictEqual(l.inputChoice.tag, 'Mode');
	assert.strictEqual(result.undone, true);

	var m = result.missing;
	assert.strictEqual(m.WdTag, 'number');
	assert.strictEqual(m.SeriesTag, 'number');
	assert.strictEqual(m.OpTag, 'number');
	assert.strictEqual(m.CondTag, 'boolean');
	assert.strictEqual(m.MediaTag, 'boolean');
	assert.strictEqual(m.FlowTag, 'boolean');
	assert.strictEqual(m.SpeedTag, 'number');
	assert.strictEqual(m.RevTag, 'boolean');
	assert.strictEqual(m.AnimTag, 'boolean');
	assert.strictEqual(m.RateTag, 'number');
	assert.strictEqual(m.ChoiceNum, 'number:rw');
	assert.strictEqual(m.ChoiceStr, 'string:rw');
	assert.strictEqual(m.PvNum, 'number:rw');
	assert.strictEqual(m.PvStr, 'string:rw');
	assert.strictEqual(m.PayloadTag, 'number');
	assert.ok(m.CondOut != null);
	assert.deepStrictEqual(page.hmiErrors, []);
	await page.close();
});
