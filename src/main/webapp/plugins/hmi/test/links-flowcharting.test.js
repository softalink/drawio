// Features adopted from grafana-flowcharting (INTOUCH_LINKS.md §13)
var test = require('node:test');
var assert = require('node:assert');
var load = require('./load.js');
var Hmi = load(['core/HmiExpr.js', 'core/HmiFormat.js', 'core/HmiQuickScript.js', 'core/HmiLinks.js',
	'core/HmiSchema.js']);
var L = Hmi.Links;
var S = Hmi.Schema;

test('parseColor and mixColor', function()
{
	assert.deepStrictEqual(L.parseColor('#f00'), [255, 0, 0, 1]);
	assert.deepStrictEqual(L.parseColor('#00FF0080'), [0, 255, 0, 128 / 255]);
	assert.deepStrictEqual(L.parseColor('rgb(1, 2, 3)'), [1, 2, 3, 1]);
	assert.deepStrictEqual(L.parseColor('rgba(1,2,3,0.5)'), [1, 2, 3, 0.5]);
	assert.deepStrictEqual(L.parseColor('Red'), [255, 0, 0, 1]);
	assert.strictEqual(L.parseColor('none'), null);
	assert.strictEqual(L.parseColor(null), null);
	assert.strictEqual(L.mixColor('#000000', '#ffffff', 0.5), '#808080');
	assert.strictEqual(L.mixColor('#ff0000', '#0000ff', 0), '#ff0000');
	assert.strictEqual(L.mixColor('#ff0000', '#0000ff', 1), '#0000ff');
	assert.strictEqual(L.mixColor('#ff0000', '#0000ff', 7), '#0000ff');
	assert.strictEqual(L.mixColor('rgba(0,0,0,0)', '#000000', 0.5), 'rgba(0,0,0,0.5)');
	assert.strictEqual(L.mixColor('#ff0000', 'none', 0.5), null);
});

test('tween interpolates numbers and colours, switches others at the end', function()
{
	assert.strictEqual(L.tween(0, 100, 0.25), 25);
	assert.strictEqual(L.tween('10', '20', 0.5), 15);
	assert.strictEqual(L.tween('#000000', '#ffffff', 0.5), '#808080');
	assert.strictEqual(L.tween('a', 'b', 0.5), undefined);
	assert.strictEqual(L.tween('a', 'b', 1), 'b');
	assert.strictEqual(L.tween(0, 100, 1), 100);
});

test('analog colour: steps by default, blends with blend', function()
{
	var link = { kind: 'analog', expr: 'T', breakpoints: [{ value: 0, color: '#00ff00' },
		{ value: 50, color: '#ffff00' }, { value: 100, color: '#ff0000' }] };
	assert.strictEqual(L.color(link, 25), '#00ff00');
	link.blend = true;
	assert.strictEqual(L.color(link, 25), '#80ff00');
	assert.strictEqual(L.color(link, 75), '#ff8000');
	assert.strictEqual(L.color(link, 0), '#00ff00');
	assert.strictEqual(L.color(link, 50), '#ffff00');
	assert.strictEqual(L.color(link, 150), '#ff0000');
	assert.strictEqual(L.color(link, -5), '#00ff00');
	// A colour that cannot be mixed keeps the step
	link.breakpoints[1].color = 'none';
	assert.strictEqual(L.color(link, 25), '#00ff00');
});

test('colour links: stale colour when the data is older than staleSeconds', function()
{
	var link = { kind: 'discrete', expr: 'A', onColor: '#00ff00', offColor: '#ff0000',
		staleSeconds: 10, staleColor: '#808080' };
	assert.strictEqual(L.color(link, 1, null, 5000), '#00ff00');
	assert.strictEqual(L.color(link, 1, null, 10000), '#00ff00');
	assert.strictEqual(L.color(link, 1, null, 10001), '#808080');
	assert.strictEqual(L.color(link, 1, null, null), '#00ff00');
	link.staleSeconds = 0;
	assert.strictEqual(L.color(link, 1, null, 99999), '#00ff00');
	link.staleSeconds = 10;
	link.staleColor = '';
	assert.strictEqual(L.color(link, 1, null, 99999), '#00ff00');
	assert.strictEqual(L.isStale({ staleSeconds: 1 }, 1500), true);
	assert.strictEqual(L.isStale({}, 1500), false);
});

test('matchState: regular expressions', function()
{
	assert.strictEqual(L.matchState('/warn/i', 'Pump WARNING'), true);
	assert.strictEqual(L.matchState('/^run/', 'stopped'), false);
	assert.strictEqual(L.matchState('/a,b/', 'xa,by'), true);
	assert.strictEqual(L.matchState('/^1\\d$/', 12), true);
	assert.strictEqual(L.matchState('/[/', 'x'), false);
	assert.strictEqual(L.matchState('/x/', null), false);
	// Not a regex: plain value and list matching still apply
	assert.strictEqual(L.matchState('/', '/'), true);
	assert.strictEqual(L.matchState('1,2', 2), true);
});

test('state: the reserved match stale wins while the data is old', function()
{
	var link = { expr: 'A', staleSeconds: 30, states: [{ match: '1', fillColor: '#0f0' },
		{ match: 'stale', fillColor: '#888' }, { match: '*', fillColor: '#f00' }] };
	assert.strictEqual(L.state(link, 1, 1000).fillColor, '#0f0');
	assert.strictEqual(L.state(link, 1, 31000).fillColor, '#888');
	assert.strictEqual(L.state(link, 0, 1000).fillColor, '#f00');
	assert.strictEqual(L.state(link, 'stale', 1000).fillColor, '#f00');
	assert.strictEqual(L.matchState('stale', 'stale'), false);
	assert.strictEqual(L.matchState(' Stale ', 1, true), true);
	// Without a stale state, old data uses the value states
	link.states.splice(1, 1);
	assert.strictEqual(L.state(link, 1, 31000).fillColor, '#0f0');
});

test('refs include the tooltip trend tag', function()
{
	assert.deepStrictEqual(L.refs({ tooltip: { mode: 'static', text: 'x', trend: true, trendTag: 'Tank.Level' } }),
		['Tank.Level']);
});

test('schema: new fields and links validate', function()
{
	function errs(links)
	{
		return S.validate('links', links);
	}

	assert.deepStrictEqual(errs({ fillColor: { kind: 'analog', expr: 'T', blend: true,
		breakpoints: [{ value: 0, color: '#000' }], staleSeconds: 5, staleColor: '#888' } }), []);
	assert.ok(errs({ fillColor: { kind: 'analog', expr: 'T', blend: 'yes' } }).join().indexOf('blend') >= 0);
	assert.ok(errs({ fillColor: { kind: 'discrete', expr: 'T', staleSeconds: -1 } }).join().indexOf('staleSeconds') >= 0);
	assert.ok(errs({ states: { expr: 'T', staleSeconds: 'x', states: [] } }).join().indexOf('staleSeconds') >= 0);
	assert.deepStrictEqual(errs({ tooltip: { mode: 'static', text: 'a', trend: true, trendTag: 'T', trendSeconds: 60 } }), []);
	assert.ok(errs({ tooltip: { mode: 'static', text: 'a', trendSeconds: 1 } }).join().indexOf('trendSeconds') >= 0);
	assert.deepStrictEqual(errs({ smooth: { duration: 400 } }), []);
	assert.ok(errs({ smooth: { duration: 20000 } }).join().indexOf('duration') >= 0);
	assert.deepStrictEqual(errs({ alarmMarker: { show: 'hide' } }), []);
	assert.ok(errs({ alarmMarker: { show: 'maybe' } }).join().indexOf('show') >= 0);

	var d = S.defaults('links', { smooth: {}, alarmMarker: {}, tooltip: { mode: 'static', trend: true } });
	assert.strictEqual(d.smooth.duration, 500);
	assert.strictEqual(d.alarmMarker.show, 'show');
	assert.strictEqual(d.tooltip.trendSeconds, 60);
});

test('demo template: the Flowcharting Features page has valid links', function()
{
	var fs = require('fs');
	var path = require('path');
	var xml = fs.readFileSync(path.join(__dirname, '../../../templates/hmi/intouch_links_demo.xml'), 'utf8');
	var re = /<object id="(itd-fc-[^"]+)"[^>]*?hmiLinks='([^']*)'/g;
	var m;
	var count = 0;
	var types = {};

	while ((m = re.exec(xml)) != null)
	{
		var json = m[2].replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>').replace(/&#10;/g, '\n').replace(/&amp;/g, '&');
		var links = JSON.parse(json);
		assert.deepStrictEqual(S.validate('links', links), [], m[1]);
		Object.keys(links).forEach(function(k) { types[k] = true; });
		count++;
	}

	assert.ok(count >= 12, 'cells: ' + count);
	['smooth', 'alarmMarker', 'tooltip', 'states', 'fillColor'].forEach(function(t)
	{
		assert.ok(types[t], 'demo uses ' + t);
	});
	assert.ok(xml.indexOf('"blend":true') >= 0);
	assert.ok(xml.indexOf('"staleSeconds":5') >= 0);
});

test('size: anchor at an offset from the centre', function()
{
	// Height 100 -> 50 %: delta -50
	var h = { expr: 'A', anchor: 'offset', offsetY: 0 };
	assert.deepStrictEqual(L.size(h, 50, false, 200, 100), { dh: -50, dy: 25 });
	h.offsetY = 50;
	assert.deepStrictEqual(L.size(h, 50, false, 200, 100), { dh: -50, dy: 50 });
	h.offsetY = -50;
	assert.deepStrictEqual(L.size(h, 50, false, 200, 100), { dh: -50, dy: 0 });
	h.offsetY = 30;
	assert.deepStrictEqual(L.size(h, 50, false, 200, 100), { dh: -50, dy: 40 });
	// Width 200 -> 150 %: delta 100, point 40 px right of the centre stays
	var w = { expr: 'A', anchor: 'offset', offsetX: 40, maxPercent: 150 };
	assert.deepStrictEqual(L.size(w, 100, true, 200, 100), { dw: 100, dx: -70 });
	// Unchanged anchors
	assert.deepStrictEqual(L.size({ expr: 'A' }, 50, false, 200, 100), { dh: -50, dy: 50 });
	assert.deepStrictEqual(L.size({ expr: 'A', anchor: 'center' }, 50, true, 200, 100), { dw: -100, dx: 50 });
});

test('scale: width and height together around an anchor', function()
{
	var link = { expr: 'A', valueAtMin: 0, valueAtMax: 100, minPercent: 50, maxPercent: 150 };
	// Value 100 -> 150 %
	assert.deepStrictEqual(L.scale(link, 100, 200, 100), { dw: 100, dh: 50, dx: -50, dy: -25 });
	link.anchor = 'topLeft';
	assert.deepStrictEqual(L.scale(link, 100, 200, 100), { dw: 100, dh: 50, dx: 0, dy: 0 });
	link.anchor = 'bottomRight';
	assert.deepStrictEqual(L.scale(link, 0, 200, 100), { dw: -100, dh: -50, dx: 100, dy: 50 });
	link.anchor = 'bottom';
	assert.deepStrictEqual(L.scale(link, 50, 200, 100), { dw: 0, dh: 0, dx: 0, dy: 0 });
	link.anchor = 'offset';
	link.offsetX = -100;
	link.offsetY = 50;
	assert.deepStrictEqual(L.scale(link, 100, 200, 100), { dw: 100, dh: 50, dx: 0, dy: -50 });
	assert.strictEqual(L.scale(link, 'x', 200, 100), null);
	assert.strictEqual(L.scale(null, 1, 200, 100), null);

	assert.deepStrictEqual(S.validate('links', { sizeScale: { expr: 'A', anchor: 'offset', offsetX: 5, offsetY: -5 },
		sizeHeight: { expr: 'B', anchor: 'offset', offsetY: 10 } }), []);
	assert.ok(S.validate('links', { sizeScale: { expr: 'A', anchor: 'middle' } }).join().indexOf('anchor') >= 0);
	assert.ok(S.validate('links', { sizeWidth: { expr: 'A', offsetX: 'x' } }).join().indexOf('offsetX') >= 0);
	assert.ok(S.validate('links', { sizeScale: { anchor: 'center' } }).join().indexOf('expr') >= 0);
	assert.strictEqual(S.defaults('links', { sizeScale: { expr: 'A' } }).sizeScale.anchor, 'center');
});
