var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var load = require('./load.js');
var Hmi = load(['core/HmiSchema.js']);
var S = Hmi.Schema;

function errs(links)
{
	return S.validate('links', links);
}

function has(list, text)
{
	return list.some(function(e) { return e.indexOf(text) >= 0; });
}

function dflt(links)
{
	return S.defaults('links', links);
}

test('a fully populated valid extension link set has no errors', function()
{
	var links = {
		opacity: { expr: 'A', valueAtMin: 0, valueAtMax: 10, minPercent: 10, maxPercent: 90 },
		states: { expr: 'A', states: [{ match: '0', fillColor: '#f00', label: '#.#', opacity: 50, visible: true, blink: false, image: 'a.png' }, { match: '*' }] },
		properties: { items: [{ target: 'style:flipH', expr: 'A' }, { target: 'label', expr: 'B' }] },
		widgetData: { expr: 'A', series: [{ tag: 'T', name: 'n', maxPoints: 100 }] },
		animation: { expr: 'A', preset: 'glow', name: '', rateExpr: 'R', reverseExpr: 'V', color: '#0f0' },
		flow: { expr: 'A', type: 'beads', reverseExpr: 'V', speedExpr: 'S', color: '#00f', width: 3 },
		media: { expr: 'A', mode: 'pause' },
		inputChoice: { tag: 'T', key: null, message: 'm', options: [{ label: 'One', value: 1 }, { label: 'Two', value: 'two' }] },
		pushValue: { tag: 'T', key: { key: 'F2' }, action: 'add', value: 5, min: 0, max: 100 },
		openUrl: { key: null, url: 'http://x/${a}', target: 'dialog', title: 't', width: 800, height: 600 },
		sendMessage: { key: null, name: 'm', payloadExpr: 'A', to: 'both' },
		control: { key: null, commands: [{ object: 'Me', command: 'startAnimation', animation: '' }, { object: 'tag:x', command: 'stopMedia' }] },
		touchOptions: { confirm: 'sure?', confirmTitle: 't', roles: ['admin'], delay: 200 },
		dataChange: { expr: 'A', deadband: 0.5, script: 'X = 1' },
		condition: { expr: 'A', onTrue: 'a', onFalse: 'b', whileTrue: 'c', whileFalse: 'd', period: 250 }
	};

	assert.deepStrictEqual(errs(links), []);
});

test('defaults of the extension links', function()
{
	var l = dflt({
		opacity: { expr: 'A' }, states: { expr: 'A' }, properties: {}, widgetData: { series: [{ tag: 'T' }, { tag: 'U', maxPoints: 5 }] },
		animation: { expr: 'A' }, flow: { expr: 'A' }, media: { expr: 'A' }, inputChoice: { tag: 'T' },
		pushValue: { tag: 'T' }, openUrl: { url: 'u' }, sendMessage: { name: 'm' }, control: {}, touchOptions: {},
		dataChange: { expr: 'A' }, condition: { expr: 'A' }
	});

	assert.deepStrictEqual([l.opacity.valueAtMin, l.opacity.valueAtMax, l.opacity.minPercent, l.opacity.maxPercent], [0, 100, 0, 100]);
	assert.deepStrictEqual(l.states.states, []);
	assert.deepStrictEqual(l.properties.items, []);
	assert.strictEqual(l.widgetData.series[0].maxPoints, 600);
	assert.strictEqual(l.widgetData.series[1].maxPoints, 5);
	assert.strictEqual(l.animation.preset, 'spin');
	assert.strictEqual(l.flow.type, 'dash');
	assert.strictEqual(l.media.mode, 'play');
	assert.deepStrictEqual(l.inputChoice.options, []);
	assert.strictEqual(l.inputChoice.key, null);
	assert.strictEqual(l.pushValue.action, 'set');
	assert.strictEqual(l.pushValue.key, null);
	assert.strictEqual(l.openUrl.target, 'blank');
	assert.strictEqual(l.openUrl.width, 640);
	assert.strictEqual(l.openUrl.height, 480);
	assert.strictEqual(l.openUrl.key, null);
	assert.strictEqual(l.sendMessage.to, 'page');
	assert.strictEqual(l.sendMessage.key, null);
	assert.deepStrictEqual(l.control.commands, []);
	assert.strictEqual(l.control.key, null);
	assert.deepStrictEqual(l.touchOptions.roles, []);
	assert.strictEqual(l.touchOptions.delay, 0);
	assert.strictEqual(l.dataChange.deadband, 0);
	assert.strictEqual(l.condition.period, 1000);
});

test('defaults preserve given values and are idempotent', function()
{
	var l = dflt({
		animation: { preset: 'sway', custom: 1 }, openUrl: { url: 'u', width: 10, key: { key: 'a' } },
		condition: { expr: 'A', period: 5000 }, touchOptions: { roles: ['x'], delay: 3 }
	});
	var copy = JSON.parse(JSON.stringify(l));

	assert.strictEqual(l.animation.preset, 'sway');
	assert.strictEqual(l.animation.custom, 1);
	assert.strictEqual(l.openUrl.width, 10);
	assert.strictEqual(l.openUrl.height, 480);
	assert.deepStrictEqual(l.openUrl.key, { key: 'a' });
	assert.strictEqual(l.condition.period, 5000);
	assert.deepStrictEqual(l.touchOptions.roles, ['x']);
	assert.deepStrictEqual(dflt(l), copy);
});

test('required fields', function()
{
	assert.ok(has(errs({ opacity: {} }), 'opacity.expr: required'));
	assert.ok(has(errs({ states: {} }), 'states.expr: required'));
	assert.ok(has(errs({ media: { expr: '  ' } }), 'media.expr: required'));
	assert.ok(has(errs({ inputChoice: { options: [{ label: 'a', value: 1 }] } }), 'inputChoice.tag: required'));
	assert.ok(has(errs({ pushValue: {} }), 'pushValue.tag: required'));
	assert.ok(has(errs({ openUrl: {} }), 'openUrl.url: required'));
	assert.ok(has(errs({ sendMessage: {} }), 'sendMessage.name: required'));
	assert.ok(has(errs({ dataChange: {} }), 'dataChange.expr: required'));
	assert.ok(has(errs({ condition: {} }), 'condition.expr: required'));
	assert.ok(has(errs({ pushValue: { tag: 'T', action: 'expression' } }), 'pushValue.expr: required'));
	assert.ok(has(errs({ animation: { preset: 'custom' } }), 'animation.name: required'));
	assert.deepStrictEqual(errs({ animation: {} }), []);
	assert.deepStrictEqual(errs({ flow: {} }), []);
	assert.deepStrictEqual(errs({ properties: {} }), []);
	assert.deepStrictEqual(errs({ touchOptions: {} }), []);
});

test('enums', function()
{
	assert.ok(has(errs({ animation: { preset: 'zoom' } }), 'animation.preset: must be one of spin|pulse|shake|fadeInOut|blink|colorCycle|bounce|sway|glow|custom'));
	assert.ok(has(errs({ flow: { type: 'x' } }), 'flow.type: must be one of dash|dots|beads|arrows|liquid'));
	assert.ok(has(errs({ media: { expr: 'A', mode: 'stop' } }), 'media.mode: must be one of play|pause'));
	assert.ok(has(errs({ pushValue: { tag: 'T', action: 'mul' } }), 'pushValue.action: must be one of set|add|subtract|expression'));
	assert.ok(has(errs({ openUrl: { url: 'u', target: 'top' } }), 'openUrl.target: must be one of blank|self|dialog'));
	assert.ok(has(errs({ sendMessage: { name: 'm', to: 'all' } }), 'sendMessage.to: must be one of page|host|both'));

	['spin', 'pulse', 'shake', 'fadeInOut', 'blink', 'colorCycle', 'bounce', 'sway', 'glow'].forEach(function(p)
	{
		assert.deepStrictEqual(errs({ animation: { preset: p } }), [], p);
	});
});

test('control commands', function()
{
	assert.ok(has(errs({ control: { commands: [{ command: 'jump' }] } }), 'control.commands[0].command: must be one of'));
	assert.ok(has(errs({ control: { commands: [5] } }), 'control.commands[0]: must be an object'));
	assert.ok(has(errs({ control: { commands: {} } }), 'control.commands: must be an array'));
	assert.ok(has(errs({ control: { commands: [{ command: 'playMedia', object: 5 }] } }), 'control.commands[0].object: must be a string'));
});

test('numbers and ranges', function()
{
	assert.ok(has(errs({ opacity: { expr: 'A', valueAtMax: 'x' } }), 'opacity.valueAtMax: must be a number'));
	assert.ok(has(errs({ openUrl: { url: 'u', width: 'wide' } }), 'openUrl.width: must be a number'));
	assert.ok(has(errs({ openUrl: { url: 'u', width: 0 } }), 'openUrl.width: must be a positive number'));
	assert.ok(has(errs({ openUrl: { url: 'u', height: -1 } }), 'openUrl.height: must be a positive number'));
	assert.ok(has(errs({ flow: { width: 0 } }), 'flow.width: must be a positive number'));
	assert.ok(has(errs({ touchOptions: { delay: -1 } }), 'touchOptions.delay: must not be negative'));
	assert.ok(has(errs({ dataChange: { expr: 'A', deadband: -1 } }), 'dataChange.deadband: must not be negative'));
	assert.ok(has(errs({ condition: { expr: 'A', period: 99 } }), 'condition.period: must be at least 100'));
	assert.deepStrictEqual(errs({ condition: { expr: 'A', period: 100 } }), []);
	assert.ok(has(errs({ pushValue: { tag: 'T', min: 'a' } }), 'pushValue.min: must be a number'));
	assert.ok(has(errs({ pushValue: { tag: 'T', max: '5' } }), 'pushValue.max: must be a number'));
});

test('pushValue value rules', function()
{
	assert.ok(has(errs({ pushValue: { tag: 'T', action: 'add' } }), 'pushValue.value: must be a number'));
	assert.ok(has(errs({ pushValue: { tag: 'T', action: 'subtract', value: 'abc' } }), 'pushValue.value: must be a number'));
	assert.deepStrictEqual(errs({ pushValue: { tag: 'T', action: 'add', value: '5' } }), []);
	assert.deepStrictEqual(errs({ pushValue: { tag: 'T', action: 'set', value: 'text' } }), []);
	assert.deepStrictEqual(errs({ pushValue: { tag: 'T' } }), []);
});

test('inputChoice options', function()
{
	assert.ok(has(errs({ inputChoice: { tag: 'T' } }), 'inputChoice.options: at least one option required'));
	assert.ok(has(errs({ inputChoice: { tag: 'T', options: [] } }), 'inputChoice.options: at least one option required'));
	assert.ok(has(errs({ inputChoice: { tag: 'T', options: {} } }), 'inputChoice.options: must be an array'));
	assert.ok(has(errs({ inputChoice: { tag: 'T', options: ['a'] } }), 'inputChoice.options[0]: must be an object'));
	assert.ok(has(errs({ inputChoice: { tag: 'T', options: [{ value: 1 }] } }), 'inputChoice.options[0].label: must be a string'));
	assert.ok(has(errs({ inputChoice: { tag: 'T', options: [{ label: 'a' }] } }), 'inputChoice.options[0].value: required'));
	assert.deepStrictEqual(errs({ inputChoice: { tag: 'T', options: [{ label: 'a', value: 0 }, { label: '', value: false }] } }), []);
});

test('states entries', function()
{
	assert.ok(has(errs({ states: { expr: 'A', states: {} } }), 'states.states: must be an array'));
	assert.ok(has(errs({ states: { expr: 'A', states: [1] } }), 'states.states[0]: must be an object'));
	assert.ok(has(errs({ states: { expr: 'A', states: [{}] } }), 'states.states[0].match: required'));
	assert.ok(has(errs({ states: { expr: 'A', states: [{ match: '1', opacity: 101 }] } }), 'states.states[0].opacity: must be a number 0..100'));
	assert.ok(has(errs({ states: { expr: 'A', states: [{ match: '1', visible: 'yes' }] } }), 'states.states[0].visible: must be a boolean'));
	assert.ok(has(errs({ states: { expr: 'A', states: [{ match: '1', blink: 1 }] } }), 'states.states[0].blink: must be a boolean'));
	assert.ok(has(errs({ states: { expr: 'A', states: [{ match: '1', fillColor: 5 }] } }), 'states.states[0].fillColor: must be a string'));
	assert.deepStrictEqual(errs({ states: { expr: 'A', states: [{ match: '' }] } }), []);
});

test('properties and widgetData entries', function()
{
	assert.ok(has(errs({ properties: { items: {} } }), 'properties.items: must be an array'));
	assert.ok(has(errs({ properties: { items: [{ expr: 'A' }] } }), 'properties.items[0].target: required'));
	assert.ok(has(errs({ properties: { items: [{ target: 'label' }] } }), 'properties.items[0].expr: required'));
	assert.ok(has(errs({ widgetData: { series: {} } }), 'widgetData.series: must be an array'));
	assert.ok(has(errs({ widgetData: { series: [{}] } }), 'widgetData.series[0].tag: required'));
	assert.ok(has(errs({ widgetData: { series: [{ tag: 'T', maxPoints: 0 }] } }), 'widgetData.series[0].maxPoints: must be a positive number'));
	assert.ok(has(errs({ widgetData: { expr: 5 } }), 'widgetData.expr: must be a string'));
});

test('touch options and keys', function()
{
	assert.ok(has(errs({ touchOptions: { roles: 'admin' } }), 'touchOptions.roles: must be an array'));
	assert.ok(has(errs({ touchOptions: { roles: [''] } }), 'touchOptions.roles[0]: must be a non-empty string'));
	assert.ok(has(errs({ touchOptions: { confirm: 5 } }), 'touchOptions.confirm: must be a string'));
	assert.ok(has(errs({ openUrl: { url: 'u', key: 'F1' } }), 'openUrl.key: must be an object or null'));
	assert.ok(has(errs({ sendMessage: { name: 'm', key: {} } }), 'sendMessage.key.key: required'));
	assert.ok(has(errs({ pushValue: { tag: 'T', key: { key: '' } } }), 'pushValue.key.key: required'));
	assert.ok(has(errs({ opacity: 5 }), 'opacity: must be an object'));
	assert.ok(has(errs({ dataChange: { expr: 'A', script: 5 } }), 'dataChange.script: must be a string'));
	assert.ok(has(errs({ condition: { expr: 'A', onTrue: 5 } }), 'condition.onTrue: must be a string'));
});

test('parse applies defaults for the extension links', function()
{
	var l = S.parse('{"animation":{"expr":"A"},"condition":{"expr":"A"}}', 'links');

	assert.strictEqual(l.animation.preset, 'spin');
	assert.strictEqual(l.condition.period, 1000);
	assert.strictEqual(S.parse('{"condition":{"expr":"A","period":5}}', 'links'), null);
});

test('links.schema.json describes the extension links', function()
{
	var file = path.join(__dirname, '..', '..', '..', '..', '..', '..', 'docs', 'hmi', 'schema', 'links.schema.json');
	var sch = JSON.parse(fs.readFileSync(file, 'utf8'));
	var p = sch.properties;
	var types = ['opacity', 'states', 'properties', 'widgetData', 'animation', 'flow', 'media', 'inputChoice',
		'pushValue', 'openUrl', 'sendMessage', 'control', 'touchOptions', 'dataChange', 'condition'];

	types.forEach(function(t)
	{
		assert.ok(p[t], t);
		assert.strictEqual(p[t].type, 'object', t);
	});

	assert.strictEqual(p.animation.properties.preset.default, 'spin');
	assert.strictEqual(p.animation.properties.preset.enum.length, 10);
	assert.strictEqual(p.flow.properties.type.default, 'dash');
	assert.strictEqual(p.media.properties.mode.default, 'play');
	assert.strictEqual(p.pushValue.properties.action.default, 'set');
	assert.strictEqual(p.openUrl.properties.target.default, 'blank');
	assert.strictEqual(p.openUrl.properties.width.default, 640);
	assert.strictEqual(p.openUrl.properties.height.default, 480);
	assert.strictEqual(p.sendMessage.properties.to.default, 'page');
	assert.strictEqual(p.touchOptions.properties.delay.default, 0);
	assert.strictEqual(p.dataChange.properties.deadband.default, 0);
	assert.strictEqual(p.condition.properties.period.default, 1000);
	assert.strictEqual(p.condition.properties.period.minimum, 100);
	assert.strictEqual(p.widgetData.properties.series.items.properties.maxPoints.default, 600);
	assert.strictEqual(p.inputChoice.properties.options.minItems, 1);
	assert.strictEqual(p.control.properties.commands.items.properties.command.enum.length, 6);
	assert.deepStrictEqual(p.states.required, ['expr']);
	assert.deepStrictEqual(p.states.properties.states.items.required, ['match']);
});
