var test = require('node:test');
var assert = require('node:assert');
var load = require('./load.js');
var Hmi = load(['core/HmiExpr.js', 'core/HmiFormat.js', 'core/HmiLinks.js']);
var L = Hmi.Links;

function close(a, b, msg)
{
	assert.ok(Math.abs(a - b) < 1e-9, (msg || '') + ' expected ' + b + ' got ' + a);
}

test('isTrue and lerp', function()
{
	assert.strictEqual(L.isTrue('Off'), false);
	assert.strictEqual(L.isTrue('x'), true);
	assert.strictEqual(L.isTrue(undefined), false);
	assert.strictEqual(L.lerp(5, 0, 10, 0, 100), 50);
	assert.strictEqual(L.lerp(-5, 0, 10, 0, 100), 0, 'clamped below');
	assert.strictEqual(L.lerp(50, 0, 10, 0, 100), 100, 'clamped above');
	assert.strictEqual(L.lerp(5, 0, 10, 100, 0), 50, 'reversed output');
	assert.strictEqual(L.lerp(50, 0, 10, 100, 0), 0, 'reversed output clamps to the interval');
	assert.strictEqual(L.lerp(-50, 0, 10, 100, 0), 100);
	assert.strictEqual(L.lerp(5, 10, 0, 0, 100), 50, 'reversed input');
	assert.strictEqual(L.lerp(3, 5, 5, 7, 9), 7, 'degenerate input range returns o0');
});

test('locationH / locationV', function()
{
	var h = { atLeft: 0, atRight: 100, toLeft: 20, toRight: 80 };
	assert.deepStrictEqual(L.locationH(h, 0), { dx: -20 });
	assert.deepStrictEqual(L.locationH(h, 100), { dx: 80 });
	assert.deepStrictEqual(L.locationH(h, 50), { dx: 30 });
	assert.deepStrictEqual(L.locationH(h, 500), { dx: 80 });
	assert.deepStrictEqual(L.locationH(h, '100'), { dx: 80 });
	assert.deepStrictEqual(L.locationH({ atLeft: 0, atRight: 100, toLeft: 0, toRight: 0 }, 50), { dx: 0 });
	assert.strictEqual(L.locationH(h, undefined), null);
	assert.strictEqual(L.locationH(h, 'abc'), null);
	assert.strictEqual(L.locationH(null, 1), null);
	assert.deepStrictEqual(L.locationH({}, 50), { dx: 50 }, 'defaults');
	// value at bottom moves down, value at top moves up (negative y)
	var v = { atTop: 100, atBottom: 0, up: 40, down: 10 };
	assert.deepStrictEqual(L.locationV(v, 100), { dy: -40 });
	assert.deepStrictEqual(L.locationV(v, 0), { dy: 10 });
	assert.deepStrictEqual(L.locationV(v, 20), { dy: 0 });
	assert.deepStrictEqual(L.locationV(v, true), { dy: 10 - 50 * 0.01 });
	assert.deepStrictEqual(L.locationV({}, 100), { dy: -100 }, 'defaults');
	assert.strictEqual(L.locationV(v, null), null);
});

test('orientation: simple rotation without offset', function()
{
	var o = { valueAtMaxCCW: 0, valueAtMaxCW: 100, ccwRotation: 90, cwRotation: 270 };
	assert.deepStrictEqual(L.orientation(o, 0, 10, 10), { rotation: -90, dx: 0, dy: 0 });
	assert.deepStrictEqual(L.orientation(o, 100, 10, 10), { rotation: 270, dx: 0, dy: 0 });
	assert.deepStrictEqual(L.orientation(o, 50, 10, 10), { rotation: 90, dx: 0, dy: 0 });
	assert.deepStrictEqual(L.orientation({}, 50, 10, 10), { rotation: 180, dx: 0, dy: 0 }, 'defaults');
	assert.strictEqual(L.orientation(o, undefined, 1, 1), null);
});

test('orientation: rotation about an offset point (numeric geometry check)', function()
{
	// centre C at the origin, offset point P; clockwise on screen (y down)
	// The cell is rotated about its own centre by `rotation`; after the
	// returned translation the cell centre must be P + R(C - P) = P - R(P).
	function rotateCw(p, deg)
	{
		var r = deg * Math.PI / 180;

		return { x: p.x * Math.cos(r) - p.y * Math.sin(r), y: p.x * Math.sin(r) + p.y * Math.cos(r) };
	}

	var cases = [[10, 0, 90], [10, 0, 180], [0, 20, 90], [30, -15, 45], [-7, 12, 270], [5, 5, -60], [0, 0, 123]];

	for (var i = 0; i < cases.length; i++)
	{
		var P = { x: cases[i][0], y: cases[i][1] };
		var angle = cases[i][2];
		var link = {
			valueAtMaxCCW: -360, valueAtMaxCW: 360, ccwRotation: 360, cwRotation: 360,
			offsetX: P.x, offsetY: P.y
		};
		// angle > 0: value = angle (CW), angle < 0: use the ccw branch
		var res = L.orientation(link, angle, 50, 50);
		var rot = res.rotation;
		close(((rot % 360) + 360) % 360, ((angle % 360) + 360) % 360, 'angle');

		var rp = rotateCw(P, rot);
		var expectedCentre = { x: P.x - rp.x, y: P.y - rp.y };
		close(res.dx, expectedCentre.x, 'dx ' + i);
		close(res.dy, expectedCentre.y, 'dy ' + i);

		// independent check: a point at the original centre, rotated about P, lands at the new centre
		var rel = { x: -P.x, y: -P.y };
		var rotated = rotateCw(rel, rot);
		close(P.x + rotated.x, res.dx, 'independent x ' + i);
		close(P.y + rotated.y, res.dy, 'independent y ' + i);

		// the rotation about the cell's own centre applied to a point Q of the cell
		// then translated equals the rotation about P of the same point
		var Q = { x: 13, y: -4 };
		var viaCentre = rotateCw(Q, rot);
		viaCentre = { x: viaCentre.x + res.dx, y: viaCentre.y + res.dy };
		var q2 = rotateCw({ x: Q.x - P.x, y: Q.y - P.y }, rot);
		close(viaCentre.x, P.x + q2.x, 'Q x ' + i);
		close(viaCentre.y, P.y + q2.y, 'Q y ' + i);
	}

	// worked example: P = (10, 0), 90 degrees clockwise -> centre moves to (10, -10)
	var ex = L.orientation({ valueAtMaxCCW: 0, valueAtMaxCW: 100, ccwRotation: 0, cwRotation: 90, offsetX: 10, offsetY: 0 }, 100, 20, 20);
	close(ex.rotation, 90);
	close(ex.dx, 10);
	close(ex.dy, -10);
});

test('size: anchors and percentages', function()
{
	var link = { valueAtMin: 0, valueAtMax: 100, minPercent: 0, maxPercent: 200, anchor: 'top' };
	assert.deepStrictEqual(L.size(link, 50, false, 40, 60), { dh: 0, dy: 0 });
	assert.deepStrictEqual(L.size(link, 100, false, 40, 60), { dh: 60, dy: 0 }, 'top anchor keeps the top edge');
	link.anchor = 'middle';
	assert.deepStrictEqual(L.size(link, 100, false, 40, 60), { dh: 60, dy: -30 });
	link.anchor = 'bottom';
	assert.deepStrictEqual(L.size(link, 100, false, 40, 60), { dh: 60, dy: -60 });
	assert.deepStrictEqual(L.size(link, 0, false, 40, 60), { dh: -60, dy: 60 }, 'shrinks to zero height');
	assert.deepStrictEqual(L.size(link, 0, false, 40, 60), { dh: -60, dy: 60 });
	assert.deepStrictEqual(L.size({ valueAtMin: 0, valueAtMax: 100 }, 50, false, 40, 60), { dh: -30, dy: 30 }, 'default height anchor is bottom');

	var w = { valueAtMin: 0, valueAtMax: 10, minPercent: 50, maxPercent: 150, anchor: 'left' };
	assert.deepStrictEqual(L.size(w, 10, true, 40, 60), { dw: 20, dx: 0 });
	w.anchor = 'center';
	assert.deepStrictEqual(L.size(w, 10, true, 40, 60), { dw: 20, dx: -10 });
	w.anchor = 'right';
	assert.deepStrictEqual(L.size(w, 10, true, 40, 60), { dw: 20, dx: -20 });
	assert.deepStrictEqual(L.size(w, 0, true, 40, 60), { dw: -20, dx: 20 });
	assert.deepStrictEqual(L.size({ valueAtMin: 0, valueAtMax: 10 }, 5, true, 40, 60), { dw: -20, dx: 0 }, 'default width anchor is left');
	assert.deepStrictEqual(L.size(w, 99, true, 40, 60), { dw: 20, dx: -20 }, 'clamped');
	assert.strictEqual(L.size(w, 'x', true, 40, 60), null);
	assert.strictEqual(L.size(null, 1, true, 40, 60), null);
});

test('color: discrete', function()
{
	var c = { kind: 'discrete', expr: 'A', offColor: '#111', onColor: '#222' };
	assert.strictEqual(L.color(c, 1), '#222');
	assert.strictEqual(L.color(c, 'Off'), '#111');
	assert.strictEqual(L.color(c, undefined), null);
	assert.strictEqual(L.color({ kind: 'discrete' }, 1), null);
	assert.strictEqual(L.color(null, 1), null);
	assert.strictEqual(L.color({ kind: 'weird' }, 1), null);
});

test('color: analog breakpoints', function()
{
	var c = {
		kind: 'analog', expr: 'A',
		breakpoints: [{ value: 50, color: 'b' }, { value: 0, color: 'a' }, { value: 100, color: 'c' }]
	};
	assert.strictEqual(L.color(c, -10), 'a', 'below the first value gives the first colour');
	assert.strictEqual(L.color(c, 0), 'a');
	assert.strictEqual(L.color(c, 49.9), 'a');
	assert.strictEqual(L.color(c, 50), 'b');
	assert.strictEqual(L.color(c, 99), 'b');
	assert.strictEqual(L.color(c, 100), 'c');
	assert.strictEqual(L.color(c, 1000), 'c');
	assert.strictEqual(L.color(c, 'junk'), null);
	assert.strictEqual(L.color(c, undefined), null);
	assert.strictEqual(L.color({ kind: 'analog', breakpoints: [] }, 1), null);
	assert.strictEqual(L.color({ kind: 'analog' }, 1), null);
	assert.strictEqual(c.breakpoints[0].value, 50, 'the link is not mutated');
});

test('color: alarm kinds', function()
{
	var d = { kind: 'discreteAlarm', tag: 'T', normalColor: 'n', alarmColor: 'x' };
	assert.strictEqual(L.color(d, 0, { active: true, level: 'alarm', acked: false }), 'x');
	assert.strictEqual(L.color(d, 0, { active: false }), 'n');
	assert.strictEqual(L.color(d, 0, null), 'n');
	assert.strictEqual(L.color(d, 0), 'n');

	var a = { kind: 'analogAlarm', tag: 'T', alarmType: 'value', colors: { normal: 'n', lolo: 'LL', lo: 'L', hi: 'H', hihi: 'HH' } };
	assert.strictEqual(L.color(a, 0, { active: true, level: 'hihi' }), 'HH');
	assert.strictEqual(L.color(a, 0, { active: true, level: 'hi' }), 'H');
	assert.strictEqual(L.color(a, 0, { active: true, level: 'lo' }), 'L');
	assert.strictEqual(L.color(a, 0, { active: true, level: 'lolo' }), 'LL');
	assert.strictEqual(L.color(a, 0, { active: false, level: null }), 'n');
	assert.strictEqual(L.color(a, 0, { active: true, level: 'major' }), 'n', 'level of another type');
	assert.strictEqual(L.color(a, 0, undefined), 'n');

	var dev = { kind: 'analogAlarm', tag: 'T', alarmType: 'deviation', colors: { normal: 'n', minor: 'mi', major: 'ma' } };
	assert.strictEqual(L.color(dev, 0, { active: true, level: 'minor' }), 'mi');
	assert.strictEqual(L.color(dev, 0, { active: true, level: 'major' }), 'ma');
	assert.strictEqual(L.color(dev, 0, { active: true, level: 'hi' }), 'n');

	var roc = { kind: 'analogAlarm', tag: 'T', alarmType: 'roc', colors: { normal: 'n', roc: 'r' } };
	assert.strictEqual(L.color(roc, 0, { active: true, level: 'roc' }), 'r');
	assert.strictEqual(L.color(roc, 0, { active: false }), 'n');
	assert.strictEqual(L.color({ kind: 'analogAlarm', tag: 'T', alarmType: 'bogus', colors: { normal: 'n' } }, 0, { active: true, level: 'roc' }), 'n');
	assert.strictEqual(L.color({ kind: 'analogAlarm', tag: 'T' }, 0, null), null);
	assert.strictEqual(L.color({ kind: 'analogAlarm', tag: 'T', alarmType: 'roc', colors: { normal: 'n' } }, 0, { active: true, level: 'roc' }), 'n', 'missing alarm colour falls back to normal');
});

test('fill', function()
{
	var f = { valueAtMin: 0, valueAtMax: 200, minPercent: 0, maxPercent: 100, direction: 'down' };
	assert.deepStrictEqual(L.fill(f, 100), { percent: 50, direction: 'down' });
	assert.deepStrictEqual(L.fill(f, 500), { percent: 100, direction: 'down' });
	assert.deepStrictEqual(L.fill(f, -5), { percent: 0, direction: 'down' });
	assert.deepStrictEqual(L.fill({ valueAtMin: 0, valueAtMax: 100, minPercent: 20, maxPercent: 80 }, 50), { percent: 50, direction: 'up' });
	assert.deepStrictEqual(L.fill({}, 30, true), { percent: 30, direction: 'right' });
	assert.deepStrictEqual(L.fill({ valueAtMin: 0, valueAtMax: 100, minPercent: -50, maxPercent: 150 }, 100), { percent: 100, direction: 'up' }, 'percent is kept within 0..100');
	assert.strictEqual(L.fill(f, undefined), null);
	assert.strictEqual(L.fill(null, 1), null);
});

test('visible / disabled', function()
{
	assert.strictEqual(L.visible({ visibleState: 'on' }, 1), true);
	assert.strictEqual(L.visible({ visibleState: 'on' }, 0), false);
	assert.strictEqual(L.visible({ visibleState: 'off' }, 1), false);
	assert.strictEqual(L.visible({ visibleState: 'off' }, 'off'), true);
	assert.strictEqual(L.visible({}, 1), true);
	assert.strictEqual(L.visible({}, undefined), null);
	assert.strictEqual(L.visible(null, 1), null);
	assert.strictEqual(L.disabled({ disabledState: 'on' }, 1), true);
	assert.strictEqual(L.disabled({ disabledState: 'on' }, 0), false);
	assert.strictEqual(L.disabled({ disabledState: 'off' }, 0), true);
	assert.strictEqual(L.disabled({ disabledState: 'off' }, 1), false);
	assert.strictEqual(L.disabled({}, 1), true);
	assert.strictEqual(L.disabled({}, null), null);
	assert.strictEqual(L.disabled(null, 1), null);
});

test('valueText', function()
{
	var d = { onMessage: 'Run', offMessage: 'Stop' };
	assert.strictEqual(L.valueText('valueDiscrete', d, 1, ''), 'Run');
	assert.strictEqual(L.valueText('valueDiscrete', d, 0, ''), 'Stop');
	assert.strictEqual(L.valueText('valueDiscrete', {}, 1, ''), 'On');
	assert.strictEqual(L.valueText('valueDiscrete', {}, 0, ''), 'Off');
	assert.strictEqual(L.valueText('valueAnalog', {}, 123.45, 'Temp = #.# C'), 'Temp = 123.5 C');
	assert.strictEqual(L.valueText('valueAnalog', { format: { mode: 'hex' } }, 255, ''), 'FF');
	assert.strictEqual(L.valueText('valueAnalog', { format: { mode: 'fixed', precision: 1, fixedWidth: true } }, 12345, '###'), '***');
	assert.strictEqual(L.valueText('valueString', {}, 'abc', 'x'), 'abc');
	assert.strictEqual(L.valueText('valueString', {}, 12, 'x'), '12');
	assert.strictEqual(L.valueText('valueString', {}, undefined, 'x'), null);
	assert.strictEqual(L.valueText('valueAnalog', null, 1, ''), null);
});

test('sliderValue is the inverse of the location mapping', function()
{
	var h = { atLeft: 0, atRight: 100, toLeft: 20, toRight: 80 };
	assert.strictEqual(L.sliderValue(h, -20, false), 0);
	assert.strictEqual(L.sliderValue(h, 80, false), 100);
	assert.strictEqual(L.sliderValue(h, 30, false), 50);
	assert.strictEqual(L.sliderValue(h, 1000, false), 100, 'clamped');
	assert.strictEqual(L.sliderValue(h, -1000, false), 0);

	var v = { atTop: 100, atBottom: 0, up: 40, down: 10 };
	assert.strictEqual(L.sliderValue(v, -40, true), 100);
	assert.strictEqual(L.sliderValue(v, 10, true), 0);
	assert.strictEqual(L.sliderValue(v, 0, true), 20);
	assert.strictEqual(L.sliderValue(v, -999, true), 100);
	assert.strictEqual(L.sliderValue(v, 999, true), 0);
	assert.strictEqual(L.sliderValue(v, 'x', true), null);
	assert.strictEqual(L.sliderValue(null, 1, true), null);

	for (var val = 0; val <= 100; val += 12.5)
	{
		close(L.sliderValue(h, L.locationH(h, val).dx, false), val, 'round trip h');
		close(L.sliderValue(v, L.locationV(v, val).dy, true), val, 'round trip v');
	}

	// zero travel
	assert.strictEqual(L.sliderValue({ atLeft: 5, atRight: 9, toLeft: 0, toRight: 0 }, 3, false), 5);
});

test('pushValues table', function()
{
	assert.deepStrictEqual(L.pushValues('direct', 0), { down: 1, up: 0 });
	assert.deepStrictEqual(L.pushValues('reverse', 0), { down: 0, up: 1 });
	assert.deepStrictEqual(L.pushValues('toggle', 0), { down: 1, up: undefined });
	assert.deepStrictEqual(L.pushValues('toggle', 1), { down: 0, up: undefined });
	assert.deepStrictEqual(L.pushValues('toggle', 'off'), { down: 1, up: undefined });
	assert.deepStrictEqual(L.pushValues('toggle', true), { down: 0, up: undefined });
	assert.deepStrictEqual(L.pushValues('set', 0), { down: 1, up: undefined });
	assert.deepStrictEqual(L.pushValues('reset', 1), { down: 0, up: undefined });
	assert.deepStrictEqual(L.pushValues(undefined, 1), { down: 1, up: 0 }, 'direct is the default');
});

test('refs', function()
{
	var links = {
		valueAnalog: { expr: 'Tank.Level * 2 + Flow' },
		visibility: { expr: 'Pump1/Run AND NOT Fault' },
		fillColor: { kind: 'analog', expr: 'Temp', breakpoints: [] },
		lineColor: { kind: 'discreteAlarm', tag: 'AlmTag', normalColor: 'a', alarmColor: 'b' },
		textColor: { kind: 'analogAlarm', tag: 'AlmTag2', alarmType: 'roc', colors: {} },
		inputAnalog: { tag: 'SP', min: 'MinTag', max: 'MaxTag' },
		inputDiscrete: { tag: 'Cmd' },
		sliderH: { tag: 'Pos' },
		pushAction: { key: null, scripts: [] },
		tooltip: { mode: 'static', text: 'hello' },
		locationH: { expr: 'bad (' }
	};
	var r = L.refs(links);
	['Tank.Level', 'Flow', 'Pump1/Run', 'Fault', 'Temp', 'AlmTag', 'AlmTag2', 'SP', 'MinTag', 'MaxTag', 'Cmd', 'Pos'].forEach(function(t)
	{
		assert.ok(r.indexOf(t) >= 0, t);
	});
	assert.strictEqual(r.indexOf('hello'), -1);
	assert.strictEqual(r.length, new Set(r).size, 'unique');

	var r2 = L.refs({ inputAnalog: { tag: 'SP', min: 1, max: '1e3' }, sliderV: null, x: 5 });
	assert.deepStrictEqual(r2, ['SP']);
	assert.deepStrictEqual(L.refs(null), []);
	assert.deepStrictEqual(L.refs({}), []);
	assert.deepStrictEqual(L.refs({ tooltip: { mode: 'expression', expr: 'T.Value' } }), ['T.Value', 'T']);
	assert.deepStrictEqual(L.refs({ inputAnalog: { tag: 'SP', min: ' MinTag ' } }), ['SP', 'MinTag']);
});

test('inputLimits fallbacks (pages 71-72)', function()
{
	var values = { MinT: 5, MaxT: '50', Bad: 'abc' };
	var defs = { SP: { min: -10, max: 500 }, NoLim: {} };
	var gv = function(n) { return values[n]; };
	var gd = function(n) { return defs[n]; };

	assert.deepStrictEqual(L.inputLimits({ tag: 'SP', min: 2, max: 20 }, gv, gd), { min: 2, max: 20 });
	assert.deepStrictEqual(L.inputLimits({ tag: 'SP' }, gv, gd), { min: 1, max: 100 }, 'defaults');
	assert.deepStrictEqual(L.inputLimits({ tag: 'SP', min: '3', max: '1e3' }, gv, gd), { min: 3, max: 1000 });
	assert.deepStrictEqual(L.inputLimits({ tag: 'SP', min: 'MinT', max: 'MaxT' }, gv, gd), { min: 5, max: 50 });
	assert.deepStrictEqual(L.inputLimits({ tag: 'SP', min: 'Bad', max: 'Missing' }, gv, gd), { min: -10, max: 500 }, 'bad references use the tag definition');
	assert.deepStrictEqual(L.inputLimits({ tag: 'NoLim', min: 'Bad', max: 'Missing' }, gv, gd), { min: 1, max: 100 }, 'no definition limits: 1/100');
	assert.deepStrictEqual(L.inputLimits({ tag: 'Unknown', min: 'Bad', max: 'Missing' }, gv, gd), { min: 1, max: 100 });
	assert.deepStrictEqual(L.inputLimits({ tag: 'SP', min: 'Bad', max: 'Missing' }), { min: 1, max: 100 }, 'no callbacks');
	assert.deepStrictEqual(L.inputLimits({ min: 'Bad', max: 'Missing' }, gv, gd), { min: 1, max: 100 }, 'no tag');
	assert.deepStrictEqual(L.inputLimits(null, gv, gd), { min: 1, max: 100 });
	assert.deepStrictEqual(L.inputLimits({ min: '', max: null }, gv, gd), { min: 1, max: 100 });
	assert.deepStrictEqual(L.inputLimits({ tag: 'SP', min: 'MinT', max: 'MaxT' }, function() { return undefined; }, gd), { min: -10, max: 500 });
	assert.strictEqual(L.isTagName('1e3'), false);
	assert.strictEqual(L.isTagName('1e'), true);
	assert.strictEqual(L.isTagName('ee1'), true);
	assert.strictEqual(L.isTagName(5), false);
});
