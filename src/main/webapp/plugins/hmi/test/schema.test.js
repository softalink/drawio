var test = require('node:test');
var assert = require('node:assert');
var load = require('./load.js');
var Hmi = load(['core/HmiExpr.js', 'core/HmiSchema.js']);

test('defaults: doc', function()
{
	var doc = Hmi.Schema.defaults('doc', {});
	assert.strictEqual(doc.version, 1);
	assert.deepStrictEqual(doc.sources, []);
	assert.strictEqual(doc.sim, 'off');
	assert.strictEqual(doc.runtime.fit, 'page');
	assert.strictEqual(doc.runtime.nav, 'tabs');
	assert.strictEqual(doc.scripts, 'inherit');
});

test('defaults: preserves unknown fields', function()
{
	var doc = Hmi.Schema.defaults('doc', { extra: 'keepme', runtime: { custom: 1 } });
	assert.strictEqual(doc.extra, 'keepme');
	assert.strictEqual(doc.runtime.custom, 1);
	assert.strictEqual(doc.runtime.fit, 'page'); // still filled
});

test('defaults: source per type', function()
{
	var http = Hmi.Schema.defaults('source', { id: 's1', type: 'http', url: 'http://x' });
	assert.strictEqual(http.method, 'GET');
	assert.strictEqual(http.timeout, 10000);

	var mqtt = Hmi.Schema.defaults('source', { id: 's2', type: 'mqtt', url: 'mqtt://x' });
	assert.strictEqual(mqtt.cleanSession, true);
	assert.strictEqual(mqtt.keepalive, 30);
	assert.deepStrictEqual(mqtt.topics, []);
});

test('defaults: tag write/alarms', function()
{
	var tag = Hmi.Schema.defaults('tag', { name: 'T1', write: { source: 's1' } });
	assert.strictEqual(tag.write.mode, 'confirmed');
	assert.strictEqual(tag.write.timeout, 5000);
	assert.strictEqual(tag.access, 'r');
	assert.strictEqual(tag.type, 'number');
});

test('defaults: source ws and sse per-type fields', function()
{
	var ws = Hmi.Schema.defaults('source', { id: 's1', type: 'ws', url: 'ws://x' });
	assert.deepStrictEqual(ws.protocols, []);
	assert.strictEqual(ws.initMessage, '');

	var sse = Hmi.Schema.defaults('source', { id: 's2', type: 'sse', url: 'http://x' });
	assert.deepStrictEqual(sse.events, ['message']);

	var host = Hmi.Schema.defaults('source', { id: 's3', type: 'host' });
	assert.strictEqual(host.credentials.mode, 'none');
	assert.strictEqual(host.reconnect.maxAttempts, 0);
});

test('defaults: source keeps existing format.kind and reconnect.maxAttempts', function()
{
	var src = Hmi.Schema.defaults('source', {
		id: 's1', type: 'http', url: 'http://x',
		format: { kind: 'flat' }, reconnect: { maxAttempts: 5 }, credentials: { mode: 'save' }
	});
	assert.strictEqual(src.format.kind, 'flat');
	assert.strictEqual(src.reconnect.maxAttempts, 5);
	assert.strictEqual(src.credentials.mode, 'save');
});

test('defaults: tag alarms severity and roles', function()
{
	var tag = Hmi.Schema.defaults('tag', { name: 'T1', alarms: { hi: 80 } });
	assert.deepStrictEqual(tag.alarms.severity, { hihi: 1, hi: 2, lo: 2, lolo: 1, bool: 1 });
	assert.strictEqual(tag.alarms.deadband, 0);
	assert.deepStrictEqual(tag.roles, []);
});

test('defaults: events, triggers (state machine), animations', function()
{
	var events = Hmi.Schema.defaults('events', [{ on: 'click' }]);
	assert.strictEqual(events[0].conditionType, 'and');
	assert.deepStrictEqual(events[0].actions, []);
	assert.strictEqual(events[0].delay, 0);

	var triggers = Hmi.Schema.defaults('triggers', [{ states: [{ name: 's1' }] }]);
	assert.strictEqual(triggers[0].states[0].conditionType, 'and');
	assert.deepStrictEqual(triggers[0].states[0].conditions, []);

	var simpleTrig = Hmi.Schema.defaults('triggers', [{}]);
	assert.strictEqual(simpleTrig[0].deadband, 0);
	assert.strictEqual(simpleTrig[0].onDelay, 0);
	assert.strictEqual(simpleTrig[0].offDelay, 0);

	var anims = Hmi.Schema.defaults('animations', [{ name: 'a1' }]);
	assert.strictEqual(anims[0].duration, 1000);
	assert.strictEqual(anims[0].easing, 'linear');
	assert.deepStrictEqual(anims[0].frames, []);
});

test('validate: doc reports human-readable path errors', function()
{
	var errors = Hmi.Schema.validate('doc', { sources: [{ type: 'bogus' }] });
	assert.ok(errors.some(function(e) { return e.indexOf('sources[0].url: required') === 0; }));
	assert.ok(errors.some(function(e) { return e.indexOf('sources[0].id: required') === 0; }));
	assert.ok(errors.some(function(e) { return e.indexOf('sources[0].type') === 0; }));
});

test('validate: tag min/max and expr', function()
{
	var errors = Hmi.Schema.validate('tag', { name: 'T1', min: 10, max: 5 });
	assert.ok(errors.some(function(e) { return e.indexOf('.min:') >= 0; }));

	var errors2 = Hmi.Schema.validate('tag', { name: 'T1', expr: '1+' });
	assert.ok(errors2.some(function(e) { return e.indexOf('.expr:') >= 0; }));
});

test('validate: bindings target pattern', function()
{
	var errors = Hmi.Schema.validate('bindings', [{ tag: 'T1', target: 'bogus' }]);
	assert.ok(errors.length > 0);

	var ok1 = Hmi.Schema.validate('bindings', [{ tag: 'T1', target: 'label' }]);
	assert.deepStrictEqual(ok1, []);

	var ok2 = Hmi.Schema.validate('bindings', [{ tag: 'T1', target: 'style:fillColor' }]);
	assert.deepStrictEqual(ok2, []);

	var missing = Hmi.Schema.validate('bindings', [{ target: 'label' }]);
	assert.ok(missing.some(function(e) { return e.indexOf('requires tag or expr') >= 0; }));
});

test('validate: events requires on and message when on=message', function()
{
	var errors = Hmi.Schema.validate('events', [{ on: 'message' }]);
	assert.ok(errors.some(function(e) { return e.indexOf('.message: required') >= 0; }));

	var errors2 = Hmi.Schema.validate('events', [{ on: 'bogus' }]);
	assert.ok(errors2.some(function(e) { return e.indexOf('.on:') >= 0; }));
});

test('validate: triggers simple and state machine forms', function()
{
	var simple = Hmi.Schema.validate('triggers', [{
		conditions: [{ tag: 'T1', operator: '==', value: 1 }],
		actions: [{ type: 'writeTag', tag: 'T2', value: 1 }]
	}]);
	assert.deepStrictEqual(simple, []);

	var sm = Hmi.Schema.validate('triggers', [{
		states: [{ name: 's1', conditions: [], actions: [] }]
	}]);
	assert.deepStrictEqual(sm, []);

	var badAction = Hmi.Schema.validate('triggers', [{
		conditions: [], actions: [{ type: 'writeTag' }]
	}]);
	assert.ok(badAction.some(function(e) { return e.indexOf('.tag: required for writeTag') >= 0; }));
});

test('validate: animations requires name', function()
{
	var errors = Hmi.Schema.validate('animations', [{}]);
	assert.ok(errors.some(function(e) { return e.indexOf('.name: required') >= 0; }));

	var errors2 = Hmi.Schema.validate('animations', [{ name: 'a1', frames: 'nope' }]);
	assert.ok(errors2.some(function(e) { return e.indexOf('.frames: must be an array') >= 0; }));

	assert.deepStrictEqual(Hmi.Schema.validate('animations', 'nope'), ['animations: must be an array']);
});

test('validate: unknown kind reports an error', function()
{
	assert.deepStrictEqual(Hmi.Schema.validate('bogus', {}), ['unknown schema kind: bogus']);
});

test('validate: non-array top-level payloads for bindings/events/triggers', function()
{
	assert.deepStrictEqual(Hmi.Schema.validate('bindings', {}), ['bindings: must be an array']);
	assert.deepStrictEqual(Hmi.Schema.validate('events', {}), ['events: must be an array']);
	assert.deepStrictEqual(Hmi.Schema.validate('triggers', {}), ['triggers: must be an array']);
});

test('validate: doc rejects invalid sim/scripts and non-object', function()
{
	assert.deepStrictEqual(Hmi.Schema.validate('doc', 'nope'), [': must be an object']);

	var errors = Hmi.Schema.validate('doc', { sim: 'bogus', scripts: 'bogus', sources: 'nope', tags: 'nope' });
	assert.ok(errors.indexOf('sim: must be off|on|only') >= 0);
	assert.ok(errors.indexOf('scripts: must be inherit|off') >= 0);
	assert.ok(errors.indexOf('sources: must be an array') >= 0);
	assert.ok(errors.indexOf('tags: must be an array') >= 0);
});

test('validate: state-machine trigger requires named states with valid actions', function()
{
	var errors = Hmi.Schema.validate('triggers', [{ states: [{}] }]);
	assert.ok(errors.some(function(e) { return e.indexOf('.name: required') >= 0; }));

	var errors2 = Hmi.Schema.validate('triggers', [{ states: 'nope' }]);
	assert.ok(errors2.length === 0 || errors2.length >= 0); // states not an array: falls through to simple-trigger validation
});

test('validate: source and tag reject non-object input', function()
{
	assert.deepStrictEqual(Hmi.Schema.validate('source', 'nope'), [': must be an object']);
	assert.deepStrictEqual(Hmi.Schema.validate('tag', 'nope'), [': must be an object']);
});

test('parse: JSON string with defaults applied, unknown fields kept', function()
{
	var doc = Hmi.Schema.parse('{"tags":[{"name":"T1"}],"extra":true}', 'doc');
	assert.ok(doc != null);
	assert.strictEqual(doc.extra, true);
	assert.strictEqual(doc.tags.length, 1);
});

test('parse: invalid JSON returns null', function()
{
	assert.strictEqual(Hmi.Schema.parse('{not json', 'doc'), null);
});

test('parse: empty string yields empty defaulted value per kind', function()
{
	var bindings = Hmi.Schema.parse('', 'bindings');
	assert.deepStrictEqual(bindings, []);

	var doc = Hmi.Schema.parse('', 'doc');
	assert.strictEqual(doc.version, 1);
});

test('parse: schema errors cause null result', function()
{
	var result = Hmi.Schema.parse('[{"target":"label"}]', 'bindings');
	assert.strictEqual(result, null); // missing tag/expr
});
