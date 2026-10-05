var test = require('node:test');
var assert = require('node:assert');
var load = require('./load.js');
var Hmi = load(['core/HmiExpr.js', 'core/HmiFormat.js', 'core/HmiTagStore.js', 'runtime/HmiAlarms.js']);

function setup(defs)
{
	var tags = new Hmi.TagStore();
	var events = [];
	var rt = { tags: tags, fire: function(n, p) { events.push([n, p]); }, _events: events };
	tags.define(defs);
	var alarms = new Hmi.Alarms(rt);
	alarms.configure(defs.map(function(d) { return tags.getDef(d.name); }));

	return { rt: rt, tags: tags, alarms: alarms };
}

function put(s, name, value, ts)
{
	s.tags.set(name, value, ts != null ? { ts: ts } : undefined);

	return s.alarms.evaluate([name]);
}

test('deviation alarm with a numeric target', function()
{
	var s = setup([{ name: 'T', type: 'number', initial: 50, alarms: { target: 50, minorDev: 5, majorDev: 10 } }]);
	assert.deepStrictEqual(s.alarms.stateOf('T'), { active: false });

	put(s, 'T', 52);
	assert.deepStrictEqual(s.alarms.stateOf('T'), { active: false });

	put(s, 'T', 55);
	var st = s.alarms.stateOf('T');
	assert.strictEqual(st.active, true);
	assert.strictEqual(st.level, 'minor');
	assert.strictEqual(st.acked, false);
	assert.strictEqual(st.severity, 2);
	var l = s.alarms.list()[0];
	assert.strictEqual(l.level, 'minor');
	assert.strictEqual(l.severity, 2);
	assert.strictEqual(l.message, 'T MINOR DEVIATION');
	assert.strictEqual(l.state, 'active-unack');

	put(s, 'T', 38);
	st = s.alarms.stateOf('T');
	assert.strictEqual(st.level, 'major', 'deviation is absolute');
	assert.strictEqual(st.severity, 1);
	assert.strictEqual(s.alarms.list()[0].message, 'T MAJOR DEVIATION');

	s.alarms.ack('T');
	assert.strictEqual(s.alarms.stateOf('T').acked, true);

	put(s, 'T', 50);
	assert.deepStrictEqual(s.alarms.stateOf('T'), { active: false });
	assert.strictEqual(s.alarms.list().length, 0, 'acked alarm is removed when cleared');
});

test('deviation alarm with a tag target follows the target', function()
{
	var s = setup([
		{ name: 'PV', type: 'number', initial: 10, alarms: { target: 'SP', minorDev: 3, majorDev: 6 } },
		{ name: 'SP', type: 'number', initial: 10 }
	]);
	put(s, 'PV', 14);
	assert.strictEqual(s.alarms.stateOf('PV').level, 'minor');

	// moving the setpoint re-evaluates the dependent alarm tag
	s.tags.set('SP', 14);
	var changed = s.alarms.evaluate(['SP']);
	assert.deepStrictEqual(changed, ['PV']);
	assert.deepStrictEqual(s.alarms.stateOf('PV'), { active: false });

	s.tags.set('SP', 6);
	s.alarms.evaluate(['SP']);
	assert.strictEqual(s.alarms.stateOf('PV').level, 'major');

	// unresolved target: no deviation alarm
	var s2 = setup([{ name: 'PV', type: 'number', initial: 10, alarms: { target: 'Nope', minorDev: 1 } }]);
	put(s2, 'PV', 1000);
	assert.deepStrictEqual(s2.alarms.stateOf('PV'), { active: false });
});

test('deviation: only one limit, nested definition and bad values', function()
{
	var s = setup([{ name: 'A', type: 'number', initial: 0, alarms: { deviation: { target: 0, majorDev: 5 } } }]);
	put(s, 'A', 4);
	assert.strictEqual(s.alarms.stateOf('A').active, false);
	put(s, 'A', -5);
	assert.strictEqual(s.alarms.stateOf('A').level, 'major');

	var s2 = setup([{ name: 'B', type: 'number', initial: 0, alarms: { target: 0, minorDev: 2 } }]);
	put(s2, 'B', 3);
	assert.strictEqual(s2.alarms.stateOf('B').level, 'minor');
	var s3 = setup([{ name: 'C', type: 'string', initial: '', alarms: { target: 0, minorDev: 2 } }]);
	put(s3, 'C', 'abc');
	assert.strictEqual(s3.alarms.stateOf('C').active, false);
});

test('rate of change alarm', function()
{
	var s = setup([{ name: 'R', type: 'number', initial: 0, alarms: { roc: 10 } }]);
	var t0 = 1000000;
	put(s, 'R', 0, t0);
	assert.strictEqual(s.alarms.stateOf('R').active, false);

	put(s, 'R', 5, t0 + 1000);   // 5 units/s
	assert.strictEqual(s.alarms.stateOf('R').active, false);

	put(s, 'R', 25, t0 + 2000);  // 20 units/s
	var st = s.alarms.stateOf('R');
	assert.strictEqual(st.active, true);
	assert.strictEqual(st.level, 'roc');
	assert.strictEqual(st.severity, 2);
	assert.strictEqual(s.alarms.list()[0].level, 'roc');
	assert.strictEqual(s.alarms.list()[0].message, 'R RATE OF CHANGE');

	// re-evaluating the same sample keeps the alarm
	s.alarms.evaluate(['R']);
	assert.strictEqual(s.alarms.stateOf('R').active, true);

	// falling quickly is a rate too
	put(s, 'R', 24, t0 + 3000);  // 1 unit/s: clears
	assert.deepStrictEqual(s.alarms.stateOf('R'), { active: false });
	assert.strictEqual(s.alarms.list()[0].state, 'cleared-unack');

	put(s, 'R', 0, t0 + 4000);   // -24 /s
	assert.strictEqual(s.alarms.stateOf('R').level, 'roc');

	// exactly at the limit does not alarm ("above")
	put(s, 'R', 10, t0 + 5000);
	assert.strictEqual(s.alarms.stateOf('R').active, false);

	// ROC limits given as an object
	var s2 = setup([{ name: 'X', type: 'number', initial: 0, alarms: { roc: { limit: 1 } } }]);
	put(s2, 'X', 0, 1000);
	put(s2, 'X', 5, 2000);
	assert.strictEqual(s2.alarms.stateOf('X').level, 'roc');

	// non-numeric samples and zero time deltas do not alarm
	put(s2, 'X', 'abc', 3000);
	assert.strictEqual(s2.alarms.stateOf('X').active, false);
});

test('rate of change: identical timestamps and default timestamps', function()
{
	var s = setup([{ name: 'R', type: 'number', initial: 0, alarms: { roc: 1 } }]);
	put(s, 'R', 0, 5000);
	put(s, 'R', 100, 5000);    // dt = 0: ignored
	assert.strictEqual(s.alarms.stateOf('R').active, false);
	put(s, 'R', 100, 5100);    // 100 - 0 over 0.1 s
	assert.strictEqual(s.alarms.stateOf('R').active, true);
	put(s, 'R', 100, 5100);    // same sample again: unchanged
	assert.strictEqual(s.alarms.stateOf('R').active, true);
	put(s, 'R', 100, 5100 - 1); // time going backwards: keeps the state
	assert.strictEqual(s.alarms.stateOf('R').active, true);

	// no ts in entries: Date.now is used and evaluate does not throw
	var rt = { tags: { get: function() { return { value: 1 }; }, getValue: function() { return 1; } } };
	var a = new Hmi.Alarms(rt);
	a.configure([{ name: 'Q', alarms: { roc: 1 } }]);
	a.evaluate(['Q']);
	assert.strictEqual(a.stateOf('Q').active, false);
});

test('stateOf for value and boolean alarms; combined limits', function()
{
	var s = setup([
		{ name: 'V', type: 'number', initial: 0, alarms: { hi: 80, hihi: 95, lo: 10, lolo: 2, deadband: 2 } },
		{ name: 'B', type: 'boolean', initial: false, alarms: { bool: true } },
		{ name: 'M', type: 'number', initial: 50, alarms: { hihi: 90, target: 50, minorDev: 5, majorDev: 20 } }
	]);
	assert.deepStrictEqual(s.alarms.stateOf('V'), { active: false });
	assert.deepStrictEqual(s.alarms.stateOf('Unknown'), { active: false });
	assert.deepStrictEqual(s.alarms.stateOf('constructor'), { active: false });

	put(s, 'V', 85);
	assert.deepStrictEqual(s.alarms.stateOf('V'), { active: true, level: 'hi', acked: false, severity: 2 });
	put(s, 'V', 97);
	assert.strictEqual(s.alarms.stateOf('V').level, 'hihi');
	assert.strictEqual(s.alarms.stateOf('V').severity, 1);
	put(s, 'V', 1);
	assert.strictEqual(s.alarms.stateOf('V').level, 'lolo');

	put(s, 'B', true);
	assert.deepStrictEqual(s.alarms.stateOf('B'), { active: true, level: 'alarm', acked: false, severity: 1 });
	assert.strictEqual(s.alarms.list()[s.alarms.list().length - 1].level, 'bool', 'list keeps the existing bool level');

	// value limit wins over deviation when both apply; deviation applies alone otherwise
	put(s, 'M', 95);
	assert.strictEqual(s.alarms.stateOf('M').level, 'hihi');
	put(s, 'M', 56);
	assert.strictEqual(s.alarms.stateOf('M').level, 'minor');
	put(s, 'M', 75);
	assert.strictEqual(s.alarms.stateOf('M').level, 'major');
});

test('custom messages and severities apply to the new kinds', function()
{
	var s = setup([{ name: 'T', type: 'number', initial: 0, alarms: {
		target: 0, minorDev: 1, majorDev: 2, roc: 1,
		severity: { major: 3, roc: 4 }, messages: { major: 'Way off', roc: 'Too fast' } } }]);
	put(s, 'T', 3, 1000);
	assert.strictEqual(s.alarms.list()[0].message, 'Way off');
	assert.strictEqual(s.alarms.stateOf('T').severity, 3);
	var t = setup([{ name: 'T', type: 'number', initial: 0, alarms: { roc: 1, severity: { roc: 4 }, messages: { roc: 'Too fast' } } }]);
	put(t, 'T', 0, 1000);
	put(t, 'T', 100, 2000);
	assert.strictEqual(t.alarms.list()[0].message, 'Too fast');
	assert.strictEqual(t.alarms.list()[0].severity, 4);
});
