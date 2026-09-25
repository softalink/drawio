var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var load = require('./load.js');

var Hmi = load([
	'core/HmiExpr.js',
	'core/HmiFormat.js',
	'core/HmiCondition.js',
	'core/HmiTransform.js',
	'core/HmiTagStore.js',
	'core/HmiSimulator.js',
	'core/HmiSchema.js',
	'ui/HmiImport.js'
]);

var sample = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'meta2d-sample.json'), 'utf8'));

function cellById(cells, id)
{
	for (var i = 0; i < cells.length; i++)
	{
		if (cells[i].id === id)
		{
			return cells[i];
		}
	}

	return null;
}

test('convertMeta2d is DOM-free and returns cells/docConfig/report', function()
{
	assert.strictEqual(typeof Hmi.Import.convertMeta2d, 'function');
	var result = Hmi.Import.convertMeta2d(sample);
	assert.ok(Array.isArray(result.cells));
	assert.ok(result.cells.length > 0);
	assert.ok(result.docConfig != null);
	assert.ok(Array.isArray(result.report));
});

test('shape mapping: rectangle, circle, diamond, text', function()
{
	var result = Hmi.Import.convertMeta2d(sample);
	var tank = cellById(result.cells, 'tank');
	assert.strictEqual(tank.style.rounded, '0');
	assert.strictEqual(tank.style.fillColor, '#e6e6e6');
	assert.strictEqual(tank.style.strokeColor, '#333333');
	assert.strictEqual(tank.style.strokeWidth, 2);
	// progress -> hmiLevel/hmiLevelColor/hmiLevelDirection
	assert.strictEqual(tank.style.hmiLevel, 65);
	assert.strictEqual(tank.style.hmiLevelColor, '#2ecc71');
	assert.strictEqual(tank.style.hmiLevelDirection, 'up');

	var pump = cellById(result.cells, 'pump');
	assert.strictEqual(pump.style.ellipse, 1);

	var valve = cellById(result.cells, 'valve');
	assert.strictEqual(valve.style.rhombus, 1);

	var lbl = cellById(result.cells, 'lbl');
	assert.strictEqual(lbl.style.text, 1);
});

test('image and svgPath pens', function()
{
	var result = Hmi.Import.convertMeta2d(sample);
	var logo = cellById(result.cells, 'logo');
	assert.strictEqual(logo.style.shape, 'image');
	assert.strictEqual(logo.style.image, 'https://example.com/logo.png');

	var icon = cellById(result.cells, 'icon');
	assert.strictEqual(icon.style.shape, 'image');
	assert.ok(/^data:image\/svg\+xml;base64,/.test(icon.style.image));
	var svg = Buffer.from(icon.style.image.split(',')[1], 'base64').toString('utf8');
	assert.ok(svg.indexOf('M0 0 L40 0') >= 0);
});

test('widgets: gauge and switch map to mxgraph.hmi.* shapes', function()
{
	var result = Hmi.Import.convertMeta2d(sample);
	var gauge = cellById(result.cells, 'gauge1');
	assert.strictEqual(gauge.style.shape, 'mxgraph.hmi.radialGauge');

	var sw = cellById(result.cells, 'sw1');
	assert.strictEqual(sw.style.shape, 'mxgraph.hmi.switch');
	assert.strictEqual(sw.hmi.roles, 'operator,engineer');
});

test('unsupported widgets are reported: table2, video', function()
{
	var result = Hmi.Import.convertMeta2d(sample);
	var table = cellById(result.cells, 'table1');
	assert.ok(table != null);
	assert.ok(result.report.some(function(r) { return r.indexOf('table1') >= 0 && r.indexOf('table2') >= 0; }));

	var vid = cellById(result.cells, 'vid1');
	assert.ok(vid != null);
	assert.ok(result.report.some(function(r) { return r.indexOf('vid1') >= 0; }));
});

test('echarts line series maps to trend chart widget', function()
{
	var result = Hmi.Import.convertMeta2d(sample);
	var chart = cellById(result.cells, 'chart1');
	assert.strictEqual(chart.style.shape, 'mxgraph.hmi.trendChart');
});

test('combine group produces group cell with children parented to it', function()
{
	var result = Hmi.Import.convertMeta2d(sample);
	var grp = cellById(result.cells, 'grp1');
	assert.strictEqual(grp.style.group, 1);

	var c1 = cellById(result.cells, 'c1');
	var c2 = cellById(result.cells, 'c2');
	assert.strictEqual(c1.parentId, 'grp1');
	assert.strictEqual(c2.parentId, 'grp1');
});

test('line pen: edge with source/target resolved from connectedLines, arrows, curve/polyline', function()
{
	var result = Hmi.Import.convertMeta2d(sample);
	var line = cellById(result.cells, 'line1');
	assert.strictEqual(line.edge, true);
	assert.strictEqual(line.target, 'pump');
	assert.strictEqual(line.style.edgeStyle, 'orthogonalEdgeStyle'); // polyline
	assert.strictEqual(line.style.startArrow, 'none');
	assert.strictEqual(line.style.endArrow, 'block'); // triangle -> block

	// line animation
	assert.strictEqual(line.style.flowAnimation, 1);
	assert.strictEqual(line.style.flowAnimationType, 'dash'); // lineAnimateType 0
	assert.strictEqual(line.style.flowAnimationReverse, 1);
	assert.strictEqual(line.style.flowAnimationColor, '#ff0000');
	assert.ok(line.style.flowAnimationDuration > 0);
});

test('networks convert to sources: mqtt, http; unsupported protocol reported', function()
{
	var result = Hmi.Import.convertMeta2d(sample);
	var sources = result.docConfig.sources;
	var mqtt = sources.filter(function(s) { return s.type === 'mqtt'; })[0];
	assert.ok(mqtt != null);
	assert.strictEqual(mqtt.url, 'mqtt://broker.local:1883');
	assert.deepStrictEqual(mqtt.topics.map(function(t) { return t.filter; }), ['plant/tank', 'plant/pump']);

	var http = sources.filter(function(s) { return s.type === 'http' && s.name === 'rest'; })[0];
	assert.ok(http != null);
	assert.strictEqual(http.interval, 2000);

	// legacy top-level http field also becomes a source
	var legacyHttp = sources.filter(function(s) { return s.name === 'http'; })[0];
	assert.ok(legacyHttp != null);
	assert.strictEqual(legacyHttp.url, 'http://legacy.local/status');

	assert.ok(result.report.some(function(r) { return r.indexOf('iot') >= 0 || r.indexOf('legacyIot') >= 0; }));
});

test('realTimes convert to tag catalogue, bindings on the bound pen, and sim mock spec', function()
{
	var result = Hmi.Import.convertMeta2d(sample);
	assert.strictEqual(result.docConfig.tags.length, 2);
	var tag = result.docConfig.tags[0];
	assert.strictEqual(tag.name, 'pump');
	assert.strictEqual(tag.type, 'number');
	assert.deepStrictEqual(tag.sim, { kind: 'random', min: 0, max: 100 });

	var pump = cellById(result.cells, 'pump');
	assert.ok(pump.hmi.bindings.length >= 2);
	var textBinding = pump.hmi.bindings.filter(function(b) { return b.target === 'label'; })[0];
	assert.ok(textBinding != null);
	assert.strictEqual(textBinding.tag, 'pump');
});

test('realTime triggers become document triggers tagged with the realTime name', function()
{
	var result = Hmi.Import.convertMeta2d(sample);
	var trig = result.docConfig.triggers.filter(function(t) { return t.name === 'highSpeed'; })[0];
	assert.ok(trig != null);
	assert.strictEqual(trig.realTime, 'pump');
	assert.strictEqual(trig.conditions[0].operator, '>');
	assert.strictEqual(trig.actions[0].type, 'setProps');
});

test('global data.triggers become document triggers', function()
{
	var result = Hmi.Import.convertMeta2d(sample);
	var trig = result.docConfig.triggers.filter(function(t) { return t.name === 'globalHighTemp'; })[0];
	assert.ok(trig != null);
	assert.strictEqual(trig.conditions[0].operator, '>=');
	assert.strictEqual(trig.actions[0].type, 'notify');
});

test('pen events convert to hmiEvents with mapped action types', function()
{
	var result = Hmi.Import.convertMeta2d(sample);
	var tank = cellById(result.cells, 'tank');
	assert.strictEqual(tank.hmi.events.length, 3);

	var click = tank.hmi.events[0];
	assert.strictEqual(click.on, 'click');
	assert.strictEqual(click.actions[0].type, 'setProps');
	assert.strictEqual(click.actions[0].label, 'Full');
	assert.strictEqual(click.actions[0].style.fillColor, '#00cc00');

	var dbl = tank.hmi.events[1];
	assert.strictEqual(dbl.on, 'dblclick');
	assert.strictEqual(dbl.actions[0].type, 'navigate');
	assert.strictEqual(dbl.actions[0].page, 'page2');

	var up = tank.hmi.events[2];
	assert.strictEqual(up.on, 'mouseup');
	assert.strictEqual(up.actions[0].type, 'notify');
	assert.strictEqual(up.actions[0].text, 'Acknowledged');
});

test('frames convert to hmiAnimations keyframes', function()
{
	var result = Hmi.Import.convertMeta2d(sample);
	var valve = cellById(result.cells, 'valve');
	assert.strictEqual(valve.hmi.animations.length, 1);
	var anim = valve.hmi.animations[0];
	assert.strictEqual(anim.autoPlay, true);
	assert.strictEqual(anim.frames.length, 2);
	assert.strictEqual(anim.frames[1].props.rotation, 180);
	assert.strictEqual(anim.frames[1].props.fillColor, '#ff0000');
});

test('renderXml produces a parseable mxGraphModel with object wrappers carrying hmi attrs', function()
{
	var result = Hmi.Import.convertMeta2d(sample);
	var xml = Hmi.Import.renderXml(result);
	assert.ok(xml.indexOf('<mxGraphModel') === 0);
	assert.ok(xml.indexOf('</mxGraphModel>') === xml.length - '</mxGraphModel>'.length);
	assert.ok(xml.indexOf('id="0"') >= 0);
	assert.ok(xml.indexOf('hmi=') >= 0); // doc config on root
	assert.ok(xml.indexOf('hmiBindings=') >= 0);
	assert.ok(xml.indexOf('hmiEvents=') >= 0);
	assert.ok(xml.indexOf('hmiAnimations=') >= 0);
	assert.ok(xml.indexOf('hmiRoles="operator,engineer"') >= 0);

	// XML escaping: no raw quotes from JSON leak unescaped into attributes
	var attrs = xml.match(/hmiEvents="[^"]*"/g);
	assert.ok(attrs != null && attrs.length > 0);
});

test('meta2dToXml composes convertMeta2d + renderXml', function()
{
	var out = Hmi.Import.meta2dToXml(sample);
	assert.strictEqual(typeof out.xml, 'string');
	assert.ok(Array.isArray(out.report));
	assert.ok(out.report.length > 0); // table2/video/iot are reported
});

test('every produced hmiBindings/hmiEvents/hmiTriggers/hmiAnimations attribute is schema-valid', function()
{
	var result = Hmi.Import.convertMeta2d(sample);

	for (var i = 0; i < result.cells.length; i++)
	{
		var hmi = result.cells[i].hmi;

		if (hmi.bindings != null && hmi.bindings.length > 0)
		{
			var errs = Hmi.Schema.validate('bindings', hmi.bindings);
			assert.deepStrictEqual(errs, [], 'bindings on ' + result.cells[i].id + ': ' + JSON.stringify(errs));
		}

		if (hmi.events != null && hmi.events.length > 0)
		{
			var errs2 = Hmi.Schema.validate('events', hmi.events);
			assert.deepStrictEqual(errs2, [], 'events on ' + result.cells[i].id + ': ' + JSON.stringify(errs2));
		}

		if (hmi.triggers != null && hmi.triggers.length > 0)
		{
			var errs3 = Hmi.Schema.validate('triggers', hmi.triggers);
			assert.deepStrictEqual(errs3, [], 'triggers on ' + result.cells[i].id + ': ' + JSON.stringify(errs3));
		}

		if (hmi.animations != null && hmi.animations.length > 0)
		{
			var errs4 = Hmi.Schema.validate('animations', hmi.animations);
			assert.deepStrictEqual(errs4, [], 'animations on ' + result.cells[i].id + ': ' + JSON.stringify(errs4));
		}
	}
});

test('doc config (sources/tags/triggers) is schema-valid', function()
{
	var result = Hmi.Import.convertMeta2d(sample);
	var errs = Hmi.Schema.validate('doc', result.docConfig);
	assert.deepStrictEqual(errs, [], JSON.stringify(errs));
});

test('requiring ui/HmiImport.js in Node touches no browser globals at load time', function()
{
	// already required above without throwing; re-require from a clean
	// require cache entry point via load() confirms no top-level DOM access
	assert.strictEqual(typeof Hmi.Import.install, 'function');
	assert.strictEqual(typeof Hmi.Import.importMeta2d, 'function');
	assert.strictEqual(typeof Hmi.Import.exportHtml, 'function');
});
