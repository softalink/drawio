var test = require('node:test');
var assert = require('node:assert');
var load = require('./load.js');
var Hmi = load(['sources/HmiPayload.js']);

function byTag(updates)
{
	var map = {};
	for (var i = 0; i < updates.length; i++) map[updates[i].tag] = updates[i].value;
	return map;
}

test('auto: flat object -> each key is a tag', function()
{
	var updates = Hmi.Payload.map('{"T1":1,"T2":true}', { kind: 'auto' }, {});
	assert.deepStrictEqual(byTag(updates), { T1: 1, T2: true });
});

test('auto: object with id/value -> single tag update', function()
{
	var updates = Hmi.Payload.map('{"id":"T1","value":42}', { kind: 'auto' }, {});
	assert.strictEqual(updates.length, 1);
	assert.strictEqual(updates[0].tag, 'T1');
	assert.strictEqual(updates[0].value, 42);
});

test('auto: array of {tag|id|dataId, value, ts, quality}', function()
{
	var updates = Hmi.Payload.map(JSON.stringify([
		{ tag: 'T1', value: 1 },
		{ id: 'T2', value: 2, quality: 'bad' },
		{ dataId: 'T3', value: 3, ts: 111 }
	]), { kind: 'auto' }, {});
	assert.deepStrictEqual(byTag(updates), { T1: 1, T2: 2, T3: 3 });
	var t2 = updates.filter(function(u) { return u.tag === 'T2'; })[0];
	assert.strictEqual(t2.quality, 'bad');
	var t3 = updates.filter(function(u) { return u.tag === 'T3'; })[0];
	assert.strictEqual(t3.ts, 111);
});

test('auto: scalar string/number/bool payload with ctx.topic', function()
{
	assert.deepStrictEqual(Hmi.Payload.map('42', { kind: 'auto' }, { topic: 'plant/T1' }), [{ tag: 'plant/T1', value: 42 }]);
	assert.deepStrictEqual(Hmi.Payload.map('true', { kind: 'auto' }, { topic: 'T1' }), [{ tag: 'T1', value: true }]);
	assert.deepStrictEqual(Hmi.Payload.map('hello', { kind: 'auto' }, { topic: 'T1' }), [{ tag: 'T1', value: 'hello' }]);
});

test('auto: scalar payload without topic yields no updates', function()
{
	assert.deepStrictEqual(Hmi.Payload.map('42', { kind: 'auto' }, {}), []);
});

test('flat kind', function()
{
	var updates = Hmi.Payload.map({ A: 1, B: 2 }, { kind: 'flat' }, {});
	assert.deepStrictEqual(byTag(updates), { A: 1, B: 2 });
});

test('array kind', function()
{
	var updates = Hmi.Payload.map([{ tag: 'A', value: 1 }], { kind: 'array' }, {});
	assert.deepStrictEqual(byTag(updates), { A: 1 });
});

test('topic kind: plant/{tag} with single-segment tag', function()
{
	var updates = Hmi.Payload.map('12.5', { kind: 'topic', template: 'plant/{tag}' }, { topic: 'plant/T1' });
	assert.deepStrictEqual(updates, [{ tag: 'T1', value: 12.5 }]);
});

test('topic kind: last placeholder captures remaining segments', function()
{
	var updates = Hmi.Payload.map('1', { kind: 'topic', template: 'plant/{tag}' }, { topic: 'plant/area1/pump2' });
	assert.strictEqual(updates[0].tag, 'area1/pump2');
});

test('topic kind: multi-placeholder template, area + tag', function()
{
	var updates = Hmi.Payload.map('1', { kind: 'topic', template: 'plant/{area}/{tag}' }, { topic: 'plant/A1/T5' });
	assert.strictEqual(updates[0].tag, 'T5');
});

test('topic kind: object payload with value/ts/quality fields', function()
{
	var updates = Hmi.Payload.map(JSON.stringify({ value: 7, ts: 555, quality: 'good' }),
		{ kind: 'topic', template: 'plant/{tag}' }, { topic: 'plant/T1' });
	assert.strictEqual(updates[0].value, 7);
	assert.strictEqual(updates[0].ts, 555);
	assert.strictEqual(updates[0].quality, 'good');
});

test('topic kind: no match returns empty', function()
{
	var updates = Hmi.Payload.map('1', { kind: 'topic', template: 'plant/{tag}' }, { topic: 'other/x' });
	assert.deepStrictEqual(updates, []);
});

test('jsonpath: subset $.a.b[0].c and $[\'x\']', function()
{
	var msg = { a: { b: [{ c: 99 }] }, x: 'val' };
	var updates = Hmi.Payload.map(msg, {
		kind: 'jsonpath',
		paths: [{ tag: 'T1', path: '$.a.b[0].c' }, { tag: 'T2', path: "$['x']" }]
	}, {});
	assert.deepStrictEqual(byTag(updates), { T1: 99, T2: 'val' });
});

test('drawio-update-xml: parses <updates><update id=.. value=.. />', function()
{
	var xml = '<updates><update id="cell1" value="5"/><update id="cell2" value="on"/></updates>';
	var updates = Hmi.Payload.map(xml, { kind: 'drawio-update-xml' }, {});
	assert.strictEqual(updates.length, 2);
	assert.strictEqual(updates[0].tag, 'cell1');
	assert.strictEqual(updates[0].value, '5');
	assert.strictEqual(updates[0].xml, true);
	assert.strictEqual(updates[1].tag, 'cell2');
});

test('drawio-update-xml: entity decoding', function()
{
	var xml = '<updates><update id="c1" value="a &amp; b &lt;x&gt;"/></updates>';
	var updates = Hmi.Payload.map(xml, { kind: 'drawio-update-xml' }, {});
	assert.strictEqual(updates[0].value, 'a & b <x>');
});

test('ArrayBuffer / Uint8Array decoding (UTF-8)', function()
{
	var str = '{"T1":123}';
	var buf = Buffer.from(str, 'utf-8');
	var arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
	var updates = Hmi.Payload.map(arrayBuffer, { kind: 'auto' }, {});
	assert.deepStrictEqual(byTag(updates), { T1: 123 });

	var u8 = new Uint8Array(buf);
	var updates2 = Hmi.Payload.map(u8, { kind: 'auto' }, {});
	assert.deepStrictEqual(byTag(updates2), { T1: 123 });
});

test('meta2d compatibility: flat object without id/dataId -> keys are tags', function()
{
	var updates = Hmi.Payload.map({ temp: 21.5, running: true }, { kind: 'auto' }, {});
	assert.deepStrictEqual(byTag(updates), { temp: 21.5, running: true });
});

test('meta2d compatibility: array whose first element has dataId', function()
{
	var updates = Hmi.Payload.map([{ dataId: 'D1', value: 10 }, { dataId: 'D2', value: 20 }], { kind: 'auto' }, {});
	assert.deepStrictEqual(byTag(updates), { D1: 10, D2: 20 });
});

test('default format defaults to auto when omitted', function()
{
	var updates = Hmi.Payload.map('{"A":1}', null, {});
	assert.deepStrictEqual(byTag(updates), { A: 1 });
});
