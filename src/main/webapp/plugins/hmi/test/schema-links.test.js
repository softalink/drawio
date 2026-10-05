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

test('a fully populated valid link set has no errors', function()
{
	var links = {
		valueDiscrete: { expr: 'A', onMessage: 'On', offMessage: 'Off' },
		valueAnalog: { expr: 'A', format: { mode: 'fixed', precision: 2, bitsFrom: 0, bitsTo: 31, fixedWidth: true } },
		valueString: { expr: 'S' },
		locationH: { expr: 'A', atLeft: 0, atRight: 100, toLeft: 0, toRight: 100 },
		locationV: { expr: 'A', atTop: 100, atBottom: 0, up: 100, down: 0 },
		orientation: { expr: 'A', valueAtMaxCCW: 0, valueAtMaxCW: 100, ccwRotation: 0, cwRotation: 360, offsetX: 0, offsetY: 0 },
		sizeHeight: { expr: 'A', valueAtMin: 0, valueAtMax: 100, minPercent: 0, maxPercent: 100, anchor: 'top' },
		sizeWidth: { expr: 'A', anchor: 'center' },
		lineColor: { kind: 'discrete', expr: 'A', offColor: '#000', onColor: '#fff' },
		fillColor: { kind: 'analog', expr: 'A', breakpoints: [{ value: 0, color: 'red' }, { value: 5, color: 'green' }] },
		textColor: { kind: 'discreteAlarm', tag: 'T', normalColor: 'a', alarmColor: 'b' },
		fillVertical: { expr: 'A', direction: 'down', backgroundColor: '#FFFFFF' },
		fillHorizontal: { expr: 'A', direction: 'left' },
		blink: { expr: 'A', mode: 'visible', textColor: 'red', lineColor: '', fillColor: 'x', speed: 'fast' },
		visibility: { expr: 'A', visibleState: 'off' },
		disable: { expr: 'A', disabledState: 'on' },
		tooltip: { mode: 'static', text: 'x' },
		inputDiscrete: { tag: 'T', key: { key: 'F1', ctrl: false, shift: true }, message: 'm', setPrompt: 'On', resetPrompt: 'Off', onMessage: 'On', offMessage: 'Off', inputOnly: false },
		inputAnalog: { tag: 'T', key: null, keypad: true, message: 'm', min: 1, max: 100, inputOnly: true, format: { mode: 'hex' } },
		inputString: { tag: 'T', key: { key: 'a' }, keypad: false, message: '', echo: 'password', passwordChar: '*', encrypt: true, inputOnly: false },
		sliderH: { tag: 'T', atLeft: 0, atRight: 100, toLeft: 0, toRight: 100, reference: 'center' },
		sliderV: { tag: 'T', atTop: 100, atBottom: 0, up: 100, down: 0, reference: 'middle' },
		pushDiscrete: { tag: 'T', key: null, action: 'toggle' },
		pushAction: { key: null, scripts: [{ condition: 'whileLeftDown', period: 250, script: 'A = 1;' }] },
		showWindow: { key: null, windows: ['Page-1', 'Page 2'] },
		hideWindow: { key: { key: 'Escape' }, windows: [] }
	};
	assert.deepStrictEqual(errs(links), []);
	assert.deepStrictEqual(errs({}), []);
});

test('top level must be an object; unknown link types are tolerated', function()
{
	assert.ok(has(errs([]), 'links'));
	assert.ok(has(errs(null), 'links'));
	assert.ok(has(errs('x'), 'links'));
	assert.deepStrictEqual(errs({ futureLink: { anything: 1 } }), []);
	assert.ok(has(errs({ valueString: 'x' }), 'valueString: must be an object'));
	assert.ok(has(errs({ valueString: null }), 'valueString'));
});

test('expr and tag are required where documented', function()
{
	var exprTypes = ['valueDiscrete', 'valueAnalog', 'valueString', 'locationH', 'locationV', 'orientation',
		'sizeHeight', 'sizeWidth', 'fillVertical', 'fillHorizontal', 'blink', 'visibility', 'disable'];

	exprTypes.forEach(function(t)
	{
		var o = {};
		o[t] = {};
		assert.ok(has(errs(o), t + '.expr: required'), t);
		o[t] = { expr: '  ' };
		assert.ok(has(errs(o), t + '.expr: required'), t + ' blank');
		o[t] = { expr: 5 };
		assert.ok(has(errs(o), t + '.expr: required'), t + ' number');
		o[t] = { expr: 'A' };
		assert.deepStrictEqual(errs(o), [], t);
	});

	['inputDiscrete', 'inputAnalog', 'inputString', 'sliderH', 'sliderV', 'pushDiscrete'].forEach(function(t)
	{
		var o = {};
		o[t] = {};
		assert.ok(has(errs(o), t + '.tag: required'), t);
		o[t] = { tag: 'T' };
		assert.deepStrictEqual(errs(o), [], t);
	});

	assert.ok(has(errs({ tooltip: { mode: 'expression' } }), 'tooltip.expr: required'));
	assert.deepStrictEqual(errs({ tooltip: { mode: 'expression', expr: 'A' } }), []);
});

test('enums', function()
{
	var bad = {
		sizeHeight: ['anchor', 'left'], sizeWidth: ['anchor', 'top'], fillVertical: ['direction', 'left'],
		fillHorizontal: ['direction', 'up'], blink: ['speed', 'warp'], visibility: ['visibleState', 'maybe'],
		disable: ['disabledState', 'maybe'], tooltip: ['mode', 'dynamic'], inputString: ['echo', 'sometimes'],
		sliderH: ['reference', 'top'], sliderV: ['reference', 'left'], pushDiscrete: ['action', 'press']
	};

	Object.keys(bad).forEach(function(t)
	{
		var o = {};
		o[t] = { expr: 'A', tag: 'T' };
		o[t][bad[t][0]] = bad[t][1];
		assert.ok(has(errs(o), t + '.' + bad[t][0] + ': must be one of'), t);
	});

	assert.ok(has(errs({ blink: { expr: 'A', mode: 'flash' } }), 'blink.mode'));
});

test('numeric fields must be numbers', function()
{
	assert.ok(has(errs({ locationH: { expr: 'A', atLeft: '0' } }), 'locationH.atLeft: must be a number'));
	assert.ok(has(errs({ orientation: { expr: 'A', offsetX: NaN } }), 'orientation.offsetX'));
	assert.ok(has(errs({ sliderV: { tag: 'T', up: {} } }), 'sliderV.up'));
	assert.ok(has(errs({ sizeWidth: { expr: 'A', minPercent: 'x' } }), 'sizeWidth.minPercent'));
});

test('ColorLink kinds', function()
{
	assert.ok(has(errs({ fillColor: {} }), 'fillColor.kind'));
	assert.ok(has(errs({ fillColor: { kind: 'x' } }), 'fillColor.kind'));
	assert.ok(has(errs({ lineColor: { kind: 'discrete' } }), 'lineColor.expr: required'));
	assert.ok(has(errs({ lineColor: { kind: 'discrete', expr: 'A', onColor: 5 } }), 'lineColor.onColor: must be a string'));
	assert.ok(has(errs({ lineColor: { kind: 'discrete', expr: 'A', offColor: [] } }), 'lineColor.offColor'));

	assert.ok(has(errs({ fillColor: { kind: 'analog' } }), 'fillColor.expr: required'));
	assert.ok(has(errs({ fillColor: { kind: 'analog', expr: 'A', breakpoints: 'x' } }), 'breakpoints: must be an array'));
	var many = [];
	for (var i = 0; i < 11; i++) { many.push({ value: i, color: 'c' }); }
	assert.ok(has(errs({ fillColor: { kind: 'analog', expr: 'A', breakpoints: many } }), 'at most 10'));
	assert.deepStrictEqual(errs({ fillColor: { kind: 'analog', expr: 'A', breakpoints: many.slice(0, 10) } }), []);
	assert.ok(has(errs({ fillColor: { kind: 'analog', expr: 'A', breakpoints: [{ value: 5, color: 'a' }, { value: 1, color: 'b' }] } }), 'ascending'));
	assert.deepStrictEqual(errs({ fillColor: { kind: 'analog', expr: 'A', breakpoints: [{ value: 5, color: 'a' }, { value: 5, color: 'b' }] } }), []);
	assert.ok(has(errs({ fillColor: { kind: 'analog', expr: 'A', breakpoints: [{ value: 'x', color: 'a' }] } }), 'breakpoints[0].value'));
	assert.ok(has(errs({ fillColor: { kind: 'analog', expr: 'A', breakpoints: [{ value: 1, color: 7 }] } }), 'breakpoints[0].color'));
	assert.ok(has(errs({ fillColor: { kind: 'analog', expr: 'A', breakpoints: [null] } }), 'breakpoints[0]: must be an object'));

	assert.ok(has(errs({ textColor: { kind: 'discreteAlarm' } }), 'textColor.tag: required'));
	assert.ok(has(errs({ textColor: { kind: 'discreteAlarm', tag: 'T', alarmColor: 1 } }), 'alarmColor'));

	assert.ok(has(errs({ textColor: { kind: 'analogAlarm', tag: 'T', alarmType: 'x' } }), 'alarmType'));
	assert.ok(has(errs({ textColor: { kind: 'analogAlarm', alarmType: 'roc' } }), 'tag: required'));
	assert.ok(has(errs({ textColor: { kind: 'analogAlarm', tag: 'T', alarmType: 'roc', colors: 'x' } }), 'colors: must be an object'));
	assert.ok(has(errs({ textColor: { kind: 'analogAlarm', tag: 'T', alarmType: 'value', colors: { hihi: 1 } } }), 'colors.hihi'));
	assert.ok(has(errs({ textColor: { kind: 'analogAlarm', tag: 'T', alarmType: 'deviation', colors: { minor: 1 } } }), 'colors.minor'));
	assert.ok(has(errs({ textColor: { kind: 'analogAlarm', tag: 'T', alarmType: 'roc', colors: { roc: 1 } } }), 'colors.roc'));
	assert.deepStrictEqual(errs({ textColor: { kind: 'analogAlarm', tag: 'T', alarmType: 'value', colors: { normal: 'a', lolo: 'b', lo: 'c', hi: 'd', hihi: 'e' } } }), []);
	assert.deepStrictEqual(errs({ textColor: { kind: 'analogAlarm', tag: 'T', alarmType: 'deviation', colors: { normal: 'a', minor: 'b', major: 'c' } } }), []);
	assert.deepStrictEqual(errs({ textColor: { kind: 'analogAlarm', tag: 'T', alarmType: 'roc', colors: { normal: 'a', roc: 'b' } } }), []);
});

test('Key shape', function()
{
	assert.deepStrictEqual(errs({ pushDiscrete: { tag: 'T', key: null } }), []);
	assert.ok(has(errs({ pushDiscrete: { tag: 'T', key: 'F1' } }), 'key: must be an object or null'));
	assert.ok(has(errs({ pushDiscrete: { tag: 'T', key: {} } }), 'key.key: required'));
	assert.ok(has(errs({ pushDiscrete: { tag: 'T', key: { key: '' } } }), 'key.key: required'));
	assert.ok(has(errs({ pushDiscrete: { tag: 'T', key: { key: 'F1', ctrl: 'yes' } } }), 'key.ctrl: must be a boolean'));
	assert.ok(has(errs({ inputString: { tag: 'T', key: { key: 'F1', shift: 1 } } }), 'key.shift'));
	assert.ok(has(errs({ showWindow: { key: 5 } }), 'showWindow.key'));
	assert.ok(has(errs({ pushAction: { key: [] } }), 'pushAction.key'));
});

test('Format ranges', function()
{
	function f(fmt) { return errs({ valueAnalog: { expr: 'A', format: fmt } }); }

	assert.deepStrictEqual(f({ precision: 0 }), []);
	assert.deepStrictEqual(f({ precision: 8 }), []);
	assert.ok(has(f({ precision: 9 }), 'precision'));
	assert.ok(has(f({ precision: -1 }), 'precision'));
	assert.ok(has(f({ precision: 1.5 }), 'precision'));
	assert.ok(has(f({ precision: '2' }), 'precision'));
	assert.deepStrictEqual(f({ bitsFrom: 31, bitsTo: 0 }), []);
	assert.ok(has(f({ bitsFrom: 32 }), 'bitsFrom'));
	assert.ok(has(f({ bitsTo: -1 }), 'bitsTo'));
	assert.ok(has(f({ bitsTo: 2.5 }), 'bitsTo'));
	assert.ok(has(f({ mode: 'octal' }), 'format.mode'));
	assert.ok(has(f({ fixedWidth: 'yes' }), 'fixedWidth'));
	assert.ok(has(f('hex'), 'format: must be an object'));
	assert.deepStrictEqual(errs({ valueAnalog: { expr: 'A' } }), []);
	['text', 'real', 'fixed', 'integer', 'exponential', 'hex', 'binary'].forEach(function(m)
	{
		assert.deepStrictEqual(f({ mode: m }), [], m);
	});
	assert.ok(has(errs({ inputAnalog: { tag: 'T', format: { precision: 99 } } }), 'inputAnalog.format.precision'));
});

test('inputAnalog min / max', function()
{
	function a(o) { o.tag = 'T'; return errs({ inputAnalog: o }); }

	assert.deepStrictEqual(a({ min: 1, max: 100 }), []);
	assert.deepStrictEqual(a({ min: 'MinTag', max: 'MaxTag' }), []);
	assert.deepStrictEqual(a({ min: -5, max: 'MaxTag' }), []);
	assert.ok(has(a({ min: '' }), 'inputAnalog.min'));
	assert.ok(has(a({ max: '   ' }), 'inputAnalog.max'));
	assert.ok(has(a({ min: true }), 'inputAnalog.min'));
	assert.ok(has(a({ max: {} }), 'inputAnalog.max'));
	assert.ok(has(a({ min: 10, max: 10 }), 'greater than min'));
	assert.ok(has(a({ min: 10, max: 5 }), 'greater than min'));
	assert.ok(has(a({ keypad: 'yes' }), 'keypad'));
	assert.ok(has(a({ inputOnly: 1 }), 'inputOnly'));
	assert.ok(has(a({ message: 5 }), 'message'));
});

test('tooltip, windows, scripts, strings and booleans', function()
{
	assert.deepStrictEqual(errs({ tooltip: { mode: 'static', text: new Array(132).join('x') } }), []);
	assert.ok(has(errs({ tooltip: { mode: 'static', text: new Array(133).join('x') } }), '131'));
	assert.ok(has(errs({ tooltip: { mode: 'static', text: 5 } }), 'tooltip.text'));
	assert.deepStrictEqual(errs({ tooltip: {} }), []);

	assert.ok(has(errs({ showWindow: { windows: 'x' } }), 'windows: must be an array'));
	assert.ok(has(errs({ hideWindow: { windows: ['ok', ''] } }), 'windows[1]'));
	assert.ok(has(errs({ hideWindow: { windows: [5] } }), 'windows[0]'));

	assert.ok(has(errs({ pushAction: { scripts: 'x' } }), 'scripts: must be an array'));
	assert.ok(has(errs({ pushAction: { scripts: [null] } }), 'scripts[0]: must be an object'));
	assert.ok(has(errs({ pushAction: { scripts: [{ condition: 'onClick', script: '' }] } }), 'condition'));
	assert.ok(has(errs({ pushAction: { scripts: [{ condition: 'onLeftUp', script: 5 }] } }), 'script: must be a string'));
	assert.ok(has(errs({ pushAction: { scripts: [{ condition: 'onLeftUp', script: '', period: 0 }] } }), 'period'));
	assert.ok(has(errs({ pushAction: { scripts: [{ condition: 'onLeftUp', script: '', period: 'x' }] } }), 'period'));
	['onLeftDown', 'whileLeftDown', 'onLeftUp', 'onLeftDouble', 'onRightDown', 'whileRightDown', 'onRightUp',
		'onRightDouble', 'onMouseOver', 'whileMouseOver', 'onMouseLeave'].forEach(function(c)
	{
		assert.deepStrictEqual(errs({ pushAction: { scripts: [{ condition: c, script: '' }] } }), [], c);
	});

	assert.ok(has(errs({ valueDiscrete: { expr: 'A', onMessage: 1 } }), 'onMessage'));
	assert.ok(has(errs({ inputDiscrete: { tag: 'T', setPrompt: 1 } }), 'setPrompt'));
	assert.ok(has(errs({ inputDiscrete: { tag: 'T', inputOnly: 'x' } }), 'inputOnly'));
	assert.ok(has(errs({ inputString: { tag: 'T', encrypt: 'x' } }), 'encrypt'));
	assert.ok(has(errs({ inputString: { tag: 'T', passwordChar: 3 } }), 'passwordChar'));
	assert.ok(has(errs({ fillVertical: { expr: 'A', backgroundColor: 3 } }), 'backgroundColor'));
	assert.ok(has(errs({ blink: { expr: 'A', fillColor: 3 } }), 'blink.fillColor'));
});

test('defaults fill documented values and preserve everything else', function()
{
	var links = S.defaults('links', {
		valueDiscrete: { expr: 'A' },
		valueAnalog: { expr: 'A' },
		locationH: { expr: 'A', toRight: 5, custom: 'keep' },
		locationV: { expr: 'A' },
		orientation: { expr: 'A', offsetX: 7 },
		sizeHeight: { expr: 'A' },
		sizeWidth: { expr: 'A' },
		fillVertical: { expr: 'A' },
		fillHorizontal: { expr: 'A' },
		blink: { expr: 'A' },
		visibility: { expr: 'A' },
		disable: { expr: 'A' },
		tooltip: { mode: 'static' },
		fillColor: { kind: 'analog', expr: 'A' },
		lineColor: { kind: 'discrete', expr: 'A', onColor: 'x' },
		inputDiscrete: { tag: 'T' },
		inputAnalog: { tag: 'T' },
		inputString: { tag: 'T' },
		sliderH: { tag: 'T' },
		sliderV: { tag: 'T' },
		pushDiscrete: { tag: 'T' },
		pushAction: { scripts: [{ script: 'x' }, null] },
		showWindow: {},
		hideWindow: { windows: ['a'], key: { key: 'F2' } },
		unknownLink: { z: 1 }
	});

	assert.deepStrictEqual(links.valueDiscrete, { expr: 'A', onMessage: 'On', offMessage: 'Off' });
	assert.deepStrictEqual(links.valueAnalog.format, { mode: 'text', precision: 0, bitsFrom: 0, bitsTo: 31, fixedWidth: false });
	assert.deepStrictEqual(links.locationH, { expr: 'A', toRight: 5, custom: 'keep', atLeft: 0, atRight: 100, toLeft: 0 });
	assert.deepStrictEqual(links.locationV, { expr: 'A', atTop: 100, atBottom: 0, up: 100, down: 0 });
	assert.deepStrictEqual(links.orientation, { expr: 'A', offsetX: 7, valueAtMaxCCW: 0, valueAtMaxCW: 100, ccwRotation: 0, cwRotation: 360, offsetY: 0 });
	assert.strictEqual(links.sizeHeight.anchor, 'bottom');
	assert.strictEqual(links.sizeWidth.anchor, 'left');
	assert.strictEqual(links.sizeHeight.maxPercent, 100);
	assert.strictEqual(links.fillVertical.direction, 'up');
	assert.strictEqual(links.fillVertical.backgroundColor, '#FFFFFF');
	assert.strictEqual(links.fillHorizontal.direction, 'right');
	assert.strictEqual(links.blink.mode, 'invisible');
	assert.strictEqual(links.blink.speed, 'medium');
	assert.strictEqual(links.visibility.visibleState, 'on');
	assert.strictEqual(links.disable.disabledState, 'on');
	assert.strictEqual(links.tooltip.text, '');
	assert.deepStrictEqual(links.fillColor.breakpoints, []);
	assert.deepStrictEqual(links.lineColor, { kind: 'discrete', expr: 'A', onColor: 'x' });
	assert.strictEqual(links.inputDiscrete.setPrompt, 'On');
	assert.strictEqual(links.inputDiscrete.resetPrompt, 'Off');
	assert.strictEqual(links.inputDiscrete.key, null);
	assert.strictEqual(links.inputDiscrete.inputOnly, false);
	assert.strictEqual(links.inputAnalog.min, 1);
	assert.strictEqual(links.inputAnalog.max, 100);
	assert.strictEqual(links.inputAnalog.keypad, false);
	assert.strictEqual(links.inputAnalog.format.mode, 'text');
	assert.strictEqual(links.inputString.echo, 'yes');
	assert.strictEqual(links.inputString.passwordChar, '*');
	assert.strictEqual(links.inputString.encrypt, false);
	assert.strictEqual(links.sliderH.reference, 'left');
	assert.strictEqual(links.sliderH.toRight, 100);
	assert.strictEqual(links.sliderV.reference, 'top');
	assert.strictEqual(links.sliderV.up, 100);
	assert.strictEqual(links.pushDiscrete.action, 'direct');
	assert.deepStrictEqual(links.pushAction.scripts[0], { script: 'x', condition: 'onLeftDown', period: 500 });
	assert.strictEqual(links.pushAction.scripts[1], null);
	assert.deepStrictEqual(links.showWindow, { windows: [], key: null });
	assert.deepStrictEqual(links.hideWindow, { windows: ['a'], key: { key: 'F2' } });
	assert.deepStrictEqual(links.unknownLink, { z: 1 });
	assert.deepStrictEqual(S.defaults('links', null), {});
	assert.deepStrictEqual(S.defaults('links', { valueString: 'notAnObject' }), { valueString: 'notAnObject' });
	assert.deepStrictEqual(S.defaults('links', { pushAction: { scripts: 'x' } }).pushAction.scripts, []);
	assert.deepStrictEqual(S.defaults('links', { valueAnalog: { expr: 'A', format: { mode: 'hex', extra: 1 } } }).valueAnalog.format,
		{ mode: 'hex', extra: 1, precision: 0, bitsFrom: 0, bitsTo: 31, fixedWidth: false });

	links.pushAction.scripts.pop();
	// defaults produce valid links
	assert.deepStrictEqual(errs(links), []);
});

test('parse applies defaults and rejects invalid sets', function()
{
	var ok = S.parse('{"locationH":{"expr":"A"}}', 'links');
	assert.strictEqual(ok.locationH.atRight, 100);
	assert.deepStrictEqual(S.parse('', 'links'), {});
	assert.strictEqual(S.parse('{"locationH":{}}', 'links'), null);
	assert.strictEqual(S.parse('not json', 'links'), null);
	assert.deepStrictEqual(S.parse('[]', 'links'), {});
});

test('docs/hmi/schema/links.schema.json is a valid draft 2020-12 document', function()
{
	var file = path.join(__dirname, '..', '..', '..', '..', '..', '..', 'docs', 'hmi', 'schema', 'links.schema.json');
	var sch = JSON.parse(fs.readFileSync(file, 'utf8'));
	assert.strictEqual(sch.$schema, 'https://json-schema.org/draft/2020-12/schema');
	assert.strictEqual(sch.type, 'object');

	var types = ['valueDiscrete', 'valueAnalog', 'valueString', 'locationH', 'locationV', 'orientation', 'sizeHeight',
		'sizeWidth', 'lineColor', 'fillColor', 'textColor', 'fillVertical', 'fillHorizontal', 'blink', 'visibility',
		'disable', 'tooltip', 'inputDiscrete', 'inputAnalog', 'inputString', 'sliderH', 'sliderV', 'pushDiscrete',
		'pushAction', 'showWindow', 'hideWindow'];

	types.forEach(function(t)
	{
		assert.ok(sch.properties[t], t);
	});

	assert.strictEqual(sch.properties.tooltip.properties.text.maxLength, 131);
	assert.strictEqual(sch.$defs.colorLink.oneOf[1].properties.breakpoints.maxItems, 10);
	assert.strictEqual(sch.$defs.format.properties.precision.maximum, 8);
	assert.strictEqual(sch.$defs.format.properties.bitsTo.maximum, 31);
});
