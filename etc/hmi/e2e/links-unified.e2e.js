// End-to-end tests for the links of INTOUCH_LINKS.md §12.1/§12.2 in the Animation Links dialog:
// bindings, keyframes, events, security, hoverHalo, triggers and stateMachines.
// Run: node --test --test-concurrency=1 etc/hmi/e2e/links-unified.e2e.js
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var util = require('./util.js');

// Screenshots are written only if HMI_UNIFIED_SHOTS names a directory
var SHOTS = process.env.HMI_UNIFIED_SHOTS || null;
var browser = null;
var web = null;

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

// DOM helpers used inside the page
async function install(page)
{
	await page.evaluate(function()
	{
		var U = window.UL = {};
		window.assert = function(c, m)
		{
			if (!c)
			{
				throw new Error(m || 'assertion failed');
			}
		};
		window.assert.strictEqual = function(a, b)
		{
			if (a !== b)
			{
				throw new Error('expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a));
			}
		};
		U.wait = function(ms)
		{
			return new Promise(function(r)
			{
				setTimeout(r, ms || 40);
			});
		};
		U.top = function()
		{
			return Hmi.ui.dialog.container;
		};
		U.fire = function(el)
		{
			el.dispatchEvent(new Event('input', {bubbles: true}));
			el.dispatchEvent(new Event('change', {bubbles: true}));
		};
		U.set = function(el, v)
		{
			if (el == null)
			{
				throw new Error('missing field');
			}

			if (el.type == 'checkbox')
			{
				el.checked = !!v;
			}
			else
			{
				el.value = v;
			}

			U.fire(el);
		};
		U.field = function(key, index, root)
		{
			var el = (root || U.top()).querySelectorAll('[data-field="' + key + '"]')[index || 0];

			if (el == null)
			{
				throw new Error('no field ' + key);
			}

			return el;
		};
		// The input of the form row or inline field with the label
		U.byLabel = function(label, root)
		{
			var rows = (root || U.top()).querySelectorAll('.geDialogFormRow, .geDialogInlineField');

			for (var i = 0; i < rows.length; i++)
			{
				var l = rows[i].querySelector(':scope > .geDialogFormLabel');

				if (l != null && l.textContent.indexOf(label) == 0)
				{
					return rows[i].querySelector('input:not([type="checkbox"]), select, textarea');
				}
			}

			throw new Error('no row ' + label);
		};
		U.ok = async function()
		{
			var d = U.top();
			d.querySelector('.gePrimaryBtn').click();
			await U.wait();

			if (U.top() == d)
			{
				throw new Error('dialog did not close: ' + (document.querySelector('.geDialog') || {}).textContent);
			}
		};
		U.cancel = async function()
		{
			var d = U.top();
			var label = mxResources.get('cancel');
			var btns = Array.prototype.filter.call(d.querySelectorAll('button.geBtn'), function(b)
			{
				return b.textContent == label;
			});
			btns[btns.length - 1].click();
			await U.wait();
		};
		U.check = function(id)
		{
			var cb = U.top().querySelector('[data-link="' + id + '"] [data-role="check"]');
			cb.checked = true;
			U.fire(cb);
		};
		U.add = async function(root)
		{
			(root || U.top()).querySelector('[data-role="add"]').click();
			await U.wait();
		};
		// Adds an action inside the action list number index of the top dialog
		U.action = async function(index, type, fields)
		{
			var list = U.top().querySelectorAll('[data-role="actions"]')[index];
			var outer = U.top();
			list.querySelector('[data-role="add"]').click();
			await U.wait();
			var d = U.top();
			var typeSel = d.querySelector('select');
			U.set(typeSel, type);
			await U.wait();

			for (var label in fields)
			{
				U.set(U.byLabel(label, d), fields[label]);
			}

			await U.ok();
			await U.wait();

			if (U.top() != outer)
			{
				throw new Error('not back in the outer dialog');
			}
		};
		U.cell = function()
		{
			return Hmi.ui.editor.graph.getSelectionCell();
		};
		U.attr = function(name, cell)
		{
			var v = (cell || U.cell()).value;

			return (v != null && v.getAttribute != null) ? v.getAttribute(name) : null;
		};
		U.json = function(name)
		{
			var v = U.attr(name);

			return (v == null) ? null : JSON.parse(v);
		};
		U.closeAll = function()
		{
			Hmi.Help.close();

			while (Hmi.ui.dialogs != null && Hmi.ui.dialogs.length > 0)
			{
				Hmi.ui.hideDialog();
			}
		};
	});
}

async function newCell(page, label)
{
	await page.evaluate(async function(label)
	{
		var graph = Hmi.ui.editor.graph;
		var cell = graph.insertVertex(graph.getDefaultParent(), null, label || 'Tank', 100, 100, 120, 80);
		graph.setSelectionCell(cell);
		await UL.wait(100);
	}, label);
}

async function shot(page, name)
{
	if (SHOTS == null)
	{
		return;
	}

	await page.screenshot({path: path.join(SHOTS, name + '.png')});
}

// Configures the seven links through the dialogs
async function configureAll(page)
{
	await page.evaluate(async function()
	{
		Hmi.LinksDialog.show(Hmi.ui, [UL.cell()]);
		await UL.wait(100);
		var main = UL.top();

		// Bindings
		UL.check('bindings');
		await UL.wait();
		await UL.add();
		var d = UL.top();
		UL.set(d.querySelector('.geHmiTagWrap input, input'), 'Level');
		var targetSel = UL.byLabel('Target');
		UL.set(targetSel, 'style:');
		UL.set(targetSel.parentNode.querySelector('input'), 'fillColor');
		var kind = UL.byLabel('Transform');
		UL.set(kind, 'invert');
		await UL.ok();
		await UL.ok();

		// Keyframes
		UL.check('keyframes');
		await UL.wait();
		await UL.add();
		d = UL.top();
		UL.set(UL.field('name', 0), 'Pulse1');
		UL.set(UL.field('preset', 0), 'pulse');
		UL.set(UL.field('duration', 0), 800);
		UL.set(UL.field('autoPlay', 0), true);
		UL.field('addFrame', 0).click();
		await UL.wait();
		UL.set(UL.field('frame_opacity', 0), 50);
		UL.set(UL.field('frameDuration', 0), 400);
		await UL.ok();
		await UL.ok();

		// Events: two actions
		UL.check('events');
		await UL.wait();
		await UL.add();
		UL.set(UL.field('on', 0), 'dblclick');
		UL.set(UL.field('delay', 0), 100);
		await UL.action(0, 'writeTag', {Tag: 'Pump', Value: '1'});
		await UL.action(0, 'notify', {Text: 'clicked'});
		await UL.ok();
		await UL.ok();

		// Security
		UL.check('security');
		await UL.wait();
		UL.set(UL.field('roles', 0), 'op');
		UL.set(UL.field('mode', 0), 'disable');
		await UL.ok();

		// Hover halo
		UL.check('hoverHalo');
		await UL.wait();
		UL.set(UL.field('style', 0), 'outline');
		UL.set(UL.field('outline', 0), 'shape');
		UL.set(UL.field('color', 0), '#FF0000');
		await UL.ok();

		// Simple trigger: 2 conditions, OR, 2 actions (one setProps on style hmiLevel), else action
		UL.check('triggers');
		await UL.wait();
		await UL.add();
		UL.set(UL.field('name', 0), 'High level');
		UL.set(UL.field('conditionType', 0), 'or');
		UL.field('addCondition', 0).click();
		UL.field('addCondition', 0).click();
		await UL.wait();
		UL.set(UL.field('condTag', 0), 'Level');
		UL.set(UL.field('condOperator', 0), '>');
		UL.set(UL.field('condValue', 0), '80');
		UL.set(UL.field('condTag', 1), 'Run');
		UL.set(UL.field('condOperator', 1), '==');
		UL.set(UL.field('condValueTag', 1), 'Limit');
		await UL.action(0, 'writeTag', {Tag: 'Alarm', Value: '1'});
		await UL.action(0, 'setProps', {'Style (JSON)': '{"hmiLevel":2}'});
		await UL.action(1, 'writeTag', {Tag: 'Alarm', Value: '0'});
		UL.set(UL.field('deadband', 0), 2);
		UL.set(UL.field('onDelay', 0), 500);
		UL.set(UL.field('offDelay', 0), 1000);
		await UL.ok();
		await UL.ok();

		// State machine with 2 states
		UL.check('stateMachines');
		await UL.wait();
		await UL.add();
		UL.set(UL.field('name', 0), 'Pump');
		UL.field('addState', 0).click();
		UL.field('addState', 0).click();
		await UL.wait();
		UL.set(UL.field('stateName', 0), 'Stopped');
		UL.set(UL.field('stateName', 1), 'Running');
		var states = UL.top().querySelectorAll('[data-role="state"]');
		states[0].querySelector('[data-field="addCondition"]').click();
		states[1].querySelector('[data-field="addCondition"]').click();
		await UL.wait();
		UL.set(states[0].querySelector('[data-field="condTag"]'), 'Run');
		UL.set(states[0].querySelector('[data-field="condOperator"]'), '==');
		UL.set(states[0].querySelector('[data-field="condValue"]'), '0');
		UL.set(states[1].querySelector('[data-field="condTag"]'), 'Run');
		UL.set(states[1].querySelector('[data-field="condValue"]'), '1');

		// the actions of the second state
		var outer = UL.top();
		states[1].querySelector('[data-role="actions"] [data-role="add"]').click();
		await UL.wait();
		var ad = UL.top();
		UL.set(ad.querySelector('select'), 'notify');
		await UL.wait();
		UL.set(UL.byLabel('Text', ad), 'running');
		await UL.ok();
		assert(UL.top() == outer);
		await UL.ok();
		await UL.ok();
		assert(UL.top() == main);
	});
}

test('seven links: configure through the DOM, OK, schema, undo, round trip', async function()
{
	var page = await util.openEditor(browser, web.url);
	await install(page);
	await newCell(page);
	await configureAll(page);

	// Nothing is written before OK
	var before = await page.evaluate(function()
	{
		var c = UL.cell();

		return ['hmiBindings', 'hmiAnimations', 'hmiEvents', 'hmiTriggers', 'hmiRoles',
			'hmiRolesMode'].map(function(n)
		{
			return UL.attr(n);
		}).concat([c.style]);
	});
	assert.ok(before.slice(0, 6).every(function(v) { return v == null; }), JSON.stringify(before));
	assert.ok(!/hmiHalo/.test(before[6] || ''), before[6]);

	// The tab counts include the new links
	var counts = await page.$$eval('.geDialog [role="tab"]', function(list)
	{
		return list.map(function(t)
		{
			return t.getAttribute('data-count');
		});
	});
	assert.deepStrictEqual(counts, ['1', '1', '3', '2']);
	await shot(page, 'touch-tab-light');
	await page.click('.geDialog [data-tab="scripts"]');
	await shot(page, 'scripts-tab-light');
	await page.emulateMedia({colorScheme: 'dark'});
	await shot(page, 'scripts-tab-dark');
	await page.click('.geDialog [data-tab="touch"]');
	await shot(page, 'touch-tab-dark');
	await page.emulateMedia({colorScheme: 'light'});

	var res = await page.evaluate(async function()
	{
		var ui = Hmi.ui;
		var graph = ui.editor.graph;
		var um = ui.editor.undoManager;
		var cell = UL.cell();
		var undoBefore = um.history.length;
		UL.top().querySelector('.gePrimaryBtn').click();
		await UL.wait(100);

		var result = {
			undoSteps: um.history.length - undoBefore, bindings: UL.json('hmiBindings'),
			animations: UL.json('hmiAnimations'), events: UL.json('hmiEvents'),
			triggers: UL.json('hmiTriggers'), roles: UL.attr('hmiRoles'),
			mode: UL.attr('hmiRolesMode'), style: cell.style,
			schema: {
				bindings: Hmi.Schema.validate('bindings', UL.json('hmiBindings')),
				animations: Hmi.Schema.validate('animations', UL.json('hmiAnimations')),
				events: Hmi.Schema.validate('events', UL.json('hmiEvents')),
				triggers: Hmi.Schema.validate('triggers', UL.json('hmiTriggers'))
			},
			summary: Hmi.LinksDialog.objectSummary(cell)
		};

		// One undo reverts all seven links, one redo restores them
		um.undo();
		result.afterUndo = ['hmiBindings', 'hmiAnimations', 'hmiEvents', 'hmiTriggers', 'hmiRoles',
			'hmiRolesMode'].map(function(n) { return UL.attr(n); }).concat([cell.style || '']);
		um.redo();
		result.afterRedo = UL.attr('hmiTriggers') != null && /hmiHaloColor/.test(cell.style);

		return result;
	});

	assert.strictEqual(res.undoSteps, 1, 'one undoable edit');
	assert.deepStrictEqual(res.afterUndo, [null, null, null, null, null, null, ''], 'one undo reverts all');
	assert.ok(res.afterRedo);
	assert.deepStrictEqual(res.schema, {bindings: [], animations: [], events: [], triggers: []});
	assert.strictEqual(res.bindings.length, 1);
	assert.strictEqual(res.bindings[0].tag, 'Level');
	assert.strictEqual(res.bindings[0].target, 'style:fillColor');
	assert.strictEqual(res.bindings[0].transform.kind, 'invert');
	assert.strictEqual(res.animations[0].name, 'Pulse1');
	assert.strictEqual(res.animations[0].preset, 'pulse');
	assert.strictEqual(res.animations[0].duration, 800);
	assert.strictEqual(res.animations[0].autoPlay, true);
	assert.strictEqual(res.animations[0].frames[0].props.opacity, 50);
	assert.strictEqual(res.animations[0].frames[0].duration, 400);
	assert.strictEqual(res.events[0].on, 'dblclick');
	assert.strictEqual(res.events[0].delay, 100);
	assert.deepStrictEqual(res.events[0].actions.map(function(a) { return a.type; }), ['writeTag', 'notify']);
	assert.strictEqual(res.roles, 'op');
	assert.strictEqual(res.mode, 'disable');
	assert.match(res.style, /hmiHaloStyle=outline/);
	assert.match(res.style, /hmiHaloOutline=shape/);
	assert.match(res.style, /hmiHaloColor=#FF0000/i);

	var simple = res.triggers.filter(function(t) { return t.states == null; });
	var machines = res.triggers.filter(function(t) { return t.states != null; });
	assert.strictEqual(simple.length, 1);
	assert.strictEqual(simple[0].name, 'High level');
	assert.strictEqual(simple[0].conditionType, 'or');
	assert.deepStrictEqual(simple[0].conditions.map(function(c) { return c.operator; }), ['>', '==']);
	assert.strictEqual(simple[0].conditions[0].value, 80);
	assert.strictEqual(simple[0].conditions[1].valueTag, 'Limit');
	assert.strictEqual(simple[0].actions.length, 2);
	assert.deepStrictEqual(simple[0].actions[1].style, {hmiLevel: 2});
	assert.strictEqual(simple[0].elseActions.length, 1);
	assert.strictEqual(simple[0].deadband, 2);
	assert.strictEqual(simple[0].onDelay, 500);
	assert.strictEqual(simple[0].offDelay, 1000);
	assert.strictEqual(machines.length, 1);
	assert.deepStrictEqual(machines[0].states.map(function(s) { return s.name; }), ['Stopped', 'Running']);
	assert.strictEqual(machines[0].states[1].actions[0].type, 'notify');
	assert.strictEqual(machines[0].states[0].conditions[0].value, 0);

	// objectSummary: every link, in tab order
	assert.deepStrictEqual(res.summary.map(function(e) { return e.id + '@' + e.tab; }),
		['bindings@display', 'keyframes@animation', 'events@touch', 'security@touch',
			'hoverHalo@touch', 'triggers@scripts', 'stateMachines@scripts']);
	res.summary.forEach(function(e)
	{
		assert.ok(e.text.length > 5, e.text);
	});

	// Reopen: round trip without a change keeps everything
	var again = await page.evaluate(async function()
	{
		var cell = UL.cell();
		var snapshot = JSON.stringify([UL.attr('hmiBindings'), UL.attr('hmiAnimations'), UL.attr('hmiEvents'),
			UL.attr('hmiTriggers'), UL.attr('hmiRoles'), UL.attr('hmiRolesMode'), cell.style]);
		Hmi.LinksDialog.show(Hmi.ui, [cell]);
		await UL.wait(100);
		var on = Array.prototype.filter.call(UL.top().querySelectorAll('[data-link]'), function(r)
		{
			return r.querySelector('[data-role="check"]').checked;
		}).map(function(r) { return r.getAttribute('data-link'); });

		// open every settings dialog and press OK: nothing changes
		for (var i = 0; i < on.length; i++)
		{
			var main = UL.top();
			main.querySelector('[data-link="' + on[i] + '"] [data-role="configure"]').click();
			await UL.wait();

			if (['security', 'hoverHalo'].indexOf(on[i]) < 0)
			{
				// the list shows one row per item
				var rows = UL.top().querySelectorAll('[data-role="item"]');
				assert(rows.length >= 1, on[i] + ' has no rows');
			}

			await UL.ok();
		}

		UL.top().querySelector('.gePrimaryBtn').click();
		await UL.wait(100);

		return {on: on, before: snapshot, after: JSON.stringify([UL.attr('hmiBindings'), UL.attr('hmiAnimations'),
			UL.attr('hmiEvents'), UL.attr('hmiTriggers'), UL.attr('hmiRoles'), UL.attr('hmiRolesMode'), cell.style]),
			same: snapshot == JSON.stringify([UL.attr('hmiBindings'), UL.attr('hmiAnimations'),
			UL.attr('hmiEvents'), UL.attr('hmiTriggers'), UL.attr('hmiRoles'), UL.attr('hmiRolesMode'), cell.style])};
	});
	assert.deepStrictEqual(again.on.sort(), ['bindings', 'events', 'hoverHalo', 'keyframes', 'security',
		'stateMachines', 'triggers']);
	assert.strictEqual(again.after, again.before, 'reopen and OK keeps the storages');

	// Undo reverts everything in one step (the reopen above wrote the same values: undo it first)
	var undone = await page.evaluate(async function()
	{
		var um = Hmi.ui.editor.undoManager;
		var cell = UL.cell();
		var n = 0;

		// undo until the cell has no HMI attributes
		while (UL.attr('hmiTriggers') != null && n < 5)
		{
			um.undo();
			n++;
		}

		return {steps: n, attrs: ['hmiBindings', 'hmiAnimations', 'hmiEvents', 'hmiTriggers', 'hmiRoles',
			'hmiRolesMode'].map(function(a) { return UL.attr(a); }), style: cell.style,
			summary: Hmi.LinksDialog.objectSummary(cell)};
	});
	assert.ok(undone.steps <= 2, 'undo steps ' + undone.steps);
	assert.deepStrictEqual(undone.attrs, [null, null, null, null, null, null]);
	assert.ok(!/hmiHalo/.test(undone.style || ''), undone.style);
	assert.deepStrictEqual(undone.summary, []);
	assert.deepStrictEqual(page.hmiErrors, []);
	await page.close();
});

test('unchecking clears the storage on OK; cancel keeps it; multi-selection writes all', async function()
{
	var page = await util.openEditor(browser, web.url);
	await install(page);
	await newCell(page, 'A');
	await page.evaluate(async function()
	{
		var graph = Hmi.ui.editor.graph;
		var a = UL.cell();
		var b = graph.insertVertex(graph.getDefaultParent(), null, 'B', 300, 100, 120, 80);
		Hmi.Model.setCellConfig(graph, [a], 'roles', ['op']);
		graph.setAttributeForCell(a, 'hmiRolesMode', 'disable');
		Hmi.Model.setCellConfig(graph, [a], 'triggers', [{name: 't', conditions: [{tag: 'X', operator: 'true'}],
			actions: [{type: 'notify', text: 'x'}]}, {name: 'm', states: [{name: 's1', actions: []}]}]);
		graph.setCellStyles('hmiHaloStyle', 'glow', [a]);
		window.CELLS = [a, b];
		graph.setSelectionCells([a, b]);

		// Cancel: nothing changes
		Hmi.LinksDialog.show(Hmi.ui, [a, b]);
		await UL.wait(100);
		var cb = UL.top().querySelector('[data-link="security"] [data-role="check"]');
		assert(cb.checked);
		cb.checked = false;
		UL.fire(cb);
		await UL.cancel();
		assert.strictEqual(UL.attr('hmiRoles', a), 'op');
	});

	var res = await page.evaluate(async function()
	{
		var a = CELLS[0];
		var b = CELLS[1];
		Hmi.LinksDialog.show(Hmi.ui, [a, b]);
		await UL.wait(100);
		['security', 'triggers', 'hoverHalo'].forEach(function(id)
		{
			var cb = UL.top().querySelector('[data-link="' + id + '"] [data-role="check"]');
			assert(cb.checked, id);
			cb.checked = false;
			UL.fire(cb);
		});
		UL.top().querySelector('.gePrimaryBtn').click();
		await UL.wait(100);

		return CELLS.map(function(c)
		{
			return {roles: UL.attr('hmiRoles', c), mode: UL.attr('hmiRolesMode', c), style: c.style,
				triggers: UL.attr('hmiTriggers', c)};
		});
	});

	// Roles/mode/halo cleared on both cells; the state machine stays (only simple triggers cleared)
	res.forEach(function(r)
	{
		assert.strictEqual(r.roles, null);
		assert.strictEqual(r.mode, null);
		assert.ok(!/hmiHalo/.test(r.style || ''), r.style);
		assert.strictEqual(JSON.parse(r.triggers).length, 1);
		assert.ok(Array.isArray(JSON.parse(r.triggers)[0].states));
	});

	// Multi-selection writes the new values to all cells
	await page.evaluate(async function()
	{
		Hmi.LinksDialog.show(Hmi.ui, CELLS);
		await UL.wait(100);
		UL.check('security');
		await UL.wait();
		UL.set(UL.field('roles', 0), 'eng, op');
		await UL.ok();
		UL.top().querySelector('.gePrimaryBtn').click();
		await UL.wait(100);
	});
	var roles = await page.evaluate(function()
	{
		return CELLS.map(function(c) { return [UL.attr('hmiRoles', c), UL.attr('hmiRolesMode', c)]; });
	});
	assert.deepStrictEqual(roles, [['eng,op', null], ['eng,op', null]]);
	assert.deepStrictEqual(page.hmiErrors, []);
	await page.close();
});

test('opts.tab and opts.link open the tab and the settings dialog', async function()
{
	var page = await util.openEditor(browser, web.url);
	await install(page);
	await newCell(page);
	var res = await page.evaluate(async function()
	{
		var out = {};
		var ids = ['bindings', 'keyframes', 'events', 'security', 'hoverHalo', 'triggers', 'stateMachines',
			'valueAnalog', 'fillColor:analog', 'dataChange'];

		for (var i = 0; i < ids.length; i++)
		{
			UL.closeAll();
			Hmi.LinksDialog.show(Hmi.ui, [UL.cell()], {link: ids[i]});
			await UL.wait(100);
			var panels = document.querySelectorAll('.geDialog [role="tabpanel"]');
			var sel = Array.prototype.filter.call(panels, function(p) { return !p.hidden; });
			var open = UL.top().querySelector('[data-dialog]');
			out[ids[i]] = {tab: sel.length ? sel[0].getAttribute('data-panel') : null,
				dialog: open ? open.getAttribute('data-dialog') : null};
		}

		UL.closeAll();
		Hmi.LinksDialog.show(Hmi.ui, [UL.cell()], {tab: 'scripts'});
		await UL.wait(100);
		out.tabOnly = Array.prototype.filter.call(document.querySelectorAll('.geDialog [role="tab"]'), function(t)
		{
			return t.getAttribute('aria-selected') == 'true';
		}).map(function(t) { return t.getAttribute('data-tab'); });
		out.tabOnlyDialog = UL.top().querySelector('[data-dialog]').getAttribute('data-dialog');
		UL.closeAll();

		return out;
	});
	assert.deepStrictEqual(res.bindings, {tab: 'display', dialog: 'link-bindings'});
	assert.deepStrictEqual(res.keyframes, {tab: 'animation', dialog: 'link-keyframes'});
	assert.deepStrictEqual(res.events, {tab: 'touch', dialog: 'link-events'});
	assert.deepStrictEqual(res.security, {tab: 'touch', dialog: 'link-security'});
	assert.deepStrictEqual(res.hoverHalo, {tab: 'touch', dialog: 'link-hoverHalo'});
	assert.deepStrictEqual(res.triggers, {tab: 'scripts', dialog: 'link-triggers'});
	assert.deepStrictEqual(res.stateMachines, {tab: 'scripts', dialog: 'link-stateMachines'});
	assert.deepStrictEqual(res.valueAnalog, {tab: 'display', dialog: 'link-valueAnalog'});
	assert.deepStrictEqual(res['fillColor:analog'], {tab: 'display', dialog: 'link-fillColor:analog'});
	assert.deepStrictEqual(res.dataChange, {tab: 'scripts', dialog: 'link-dataChange'});
	assert.deepStrictEqual(res.tabOnly, ['scripts']);
	assert.strictEqual(res.tabOnlyDialog, 'animation-links');
	assert.deepStrictEqual(page.hmiErrors, []);
	await page.close();
});

test('objectSummary lists hmiLinks and the new storages in tab order', async function()
{
	var page = await util.openEditor(browser, web.url);
	await install(page);
	await newCell(page);
	var list = await page.evaluate(function()
	{
		var graph = Hmi.ui.editor.graph;
		var cell = UL.cell();
		Hmi.Model.setCellConfig(graph, [cell], 'links', {valueDiscrete: {expr: 'Run', onMessage: 'On', offMessage: 'Off'},
			fillColor: {kind: 'discrete', expr: 'Run', offColor: '#FF0000', onColor: '#00C000'},
			dataChange: {expr: 'Level', deadband: 0, script: 'Level = 1;'}});
		Hmi.Model.setCellConfig(graph, [cell], 'roles', ['op']);
		Hmi.Model.setCellConfig(graph, [cell], 'bindings', [{tag: 'Level', target: 'label'}]);
		Hmi.Model.setCellConfig(graph, [cell], 'triggers', [{states: [{name: 'a'}]}]);

		return Hmi.LinksDialog.objectSummary(cell);
	});
	assert.deepStrictEqual(list.map(function(e) { return e.id + '@' + e.tab; }),
		['valueDiscrete@display', 'fillColor:discrete@display', 'bindings@display', 'security@touch',
			'stateMachines@scripts', 'dataChange@scripts']);
	assert.deepStrictEqual(await page.evaluate(function()
	{
		return Hmi.LinksDialog.objectSummary(null);
	}), []);
	await page.close();
});

test('help: icons and texts of the new links and their settings dialogs', async function()
{
	var page = await util.openEditor(browser, web.url);
	await install(page);
	await newCell(page);
	var res = await page.evaluate(async function()
	{
		Hmi.Help.missing = {};
		var keys = {};
		var counts = {};

		function collect(id)
		{
			var n = 0;
			Array.prototype.forEach.call(UL.top().querySelectorAll('[data-help]'), function(e)
			{
				keys[e.getAttribute('data-help')] = true;
				n++;
			});
			counts[id] = Math.max(counts[id] || 0, n);
		};

		Hmi.LinksDialog.show(Hmi.ui, [UL.cell()]);
		await UL.wait(100);
		collect('main');
		var ids = ['bindings', 'keyframes', 'events', 'security', 'hoverHalo', 'triggers', 'stateMachines'];

		for (var i = 0; i < ids.length; i++)
		{
			var main = UL.top();
			main.querySelector('[data-link="' + ids[i] + '"] [data-role="configure"]').click();
			await UL.wait();
			collect(ids[i]);

			if (['security', 'hoverHalo'].indexOf(ids[i]) < 0)
			{
				await UL.add();
				var item = UL.top();

				// every optional piece of the item editors
				['addCondition', 'addState', 'addFrame'].forEach(function(k)
				{
					var b = item.querySelector('[data-field="' + k + '"]');

					if (b != null)
					{
						b.click();
					}
				});
				var nested = item.querySelectorAll('[data-field="addCondition"]');

				for (var j = 0; j < nested.length; j++)
				{
					nested[j].click();
				}

				var selects = item.querySelectorAll('select[data-field]');

				for (var s = 0; s < selects.length; s++)
				{
					for (var o = 0; o < selects[s].options.length; o++)
					{
						selects[s].value = selects[s].options[o].value;
						UL.fire(selects[s]);
						collect(ids[i] + 'Item');
					}
				}

				collect(ids[i] + 'Item');
				await UL.cancel();
			}

			await UL.cancel();
		}

		var empty = Object.keys(keys).filter(function(k)
		{
			var t = Hmi.Help.text(k);

			return t == null || t.text == null || t.text.length < 10;
		});
		UL.closeAll();

		return {keys: Object.keys(keys), empty: empty, missing: Object.keys(Hmi.Help.missing), counts: counts};
	});
	assert.deepStrictEqual(res.empty, []);
	assert.deepStrictEqual(res.missing, []);

	['link.bindings', 'link.keyframes', 'link.events', 'link.security', 'link.hoverHalo', 'link.triggers',
		'link.stateMachines', 'group.hmiLnkTriggersGroup', 'field.security.roles', 'field.security.mode',
		'field.triggers.deadband', 'field.triggers.elseActions', 'field.conditions.valueTag',
		'field.stateMachines.states.name', 'field.keyframes.frames'].forEach(function(k)
	{
		assert.ok(res.keys.indexOf(k) >= 0, 'icon ' + k + ' in ' + res.keys.length + ' keys');
	});

	Object.keys(res.counts).forEach(function(id)
	{
		assert.ok(res.counts[id] >= 2, id + ' has ' + res.counts[id] + ' icons');
	});
	assert.deepStrictEqual(page.hmiErrors, []);
	await page.close();
});

test('settings dialogs: layout in light and dark, screenshots', async function()
{
	var page = await util.openEditor(browser, web.url);
	await install(page);
	await newCell(page);
	var ids = ['bindings', 'keyframes', 'events', 'security', 'hoverHalo', 'triggers', 'stateMachines'];

	for (var scheme of ['light', 'dark'])
	{
		await page.emulateMedia({colorScheme: scheme});

		for (var id of ids)
		{
			await page.evaluate(async function(id)
			{
				UL.closeAll();
				Hmi.LinksDialog.show(Hmi.ui, [UL.cell()], {link: id});
				await UL.wait(120);
			}, id);
			await shot(page, 'settings-' + id + '-' + scheme);
			var clipped = await page.evaluate(function()
			{
				var d = UL.top();
				var r = d.getBoundingClientRect();
				var bad = [];
				Array.prototype.forEach.call(d.querySelectorAll('button, input, select'), function(e)
				{
					var b = e.getBoundingClientRect();

					if (b.width > 0 && (b.right > r.right + 1 || b.left < r.left - 1))
					{
						bad.push(e.tagName + ':' + (e.getAttribute('data-field') || e.textContent));
					}
				});

				return bad;
			});
			assert.deepStrictEqual(clipped, [], id + ' ' + scheme);

			if (['security', 'hoverHalo'].indexOf(id) < 0)
			{
				await page.evaluate(async function()
				{
					await UL.add();
					Array.prototype.forEach.call(UL.top().querySelectorAll('[data-field^="add"]'), function(b)
					{
						b.click();
					});
					await UL.wait(100);
				});
				await shot(page, 'item-' + id + '-' + scheme);
				var clippedItem = await page.evaluate(function()
				{
					var d = UL.top();
					var r = d.getBoundingClientRect();

					return Array.prototype.filter.call(d.querySelectorAll('button, input, select'), function(e)
					{
						var b = e.getBoundingClientRect();

						return b.width > 0 && (b.right > r.right + 1 || b.left < r.left - 1);
					}).map(function(e) { return e.tagName + ':' + (e.getAttribute('data-field') || e.textContent); });
				});
				assert.deepStrictEqual(clippedItem, [], 'item ' + id + ' ' + scheme);
			}
		}
	}

	await page.evaluate(function()
	{
		UL.closeAll();
	});
	assert.deepStrictEqual(page.hmiErrors, []);
	await page.close();
});
