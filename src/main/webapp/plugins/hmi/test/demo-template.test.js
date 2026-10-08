// templates/hmi/intouch_links_demo.xml: every link and object feature validates
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var load = require('./load.js');
var Hmi = load(['core/HmiExpr.js', 'core/HmiFormat.js', 'core/HmiQuickScript.js', 'core/HmiLinks.js',
	'core/HmiSchema.js']);
var S = Hmi.Schema;
var xml = fs.readFileSync(path.join(__dirname, '../../../templates/hmi/intouch_links_demo.xml'), 'utf8');

function unescape(s)
{
	return s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>').replace(/&#10;/g, '\n').replace(/&amp;/g, '&');
}

// {cellId: {attr: parsed JSON}} for the JSON attributes of the <object> cells
function objects()
{
	var result = {};
	var re = /<object id="([^"]+)"([^>]*)>/g;
	var m;

	while ((m = re.exec(xml)) != null)
	{
		var attrs = {};
		var are = /(hmi[A-Za-z]*)='([^']*)'|(hmi[A-Za-z]*)="([^"]*)"/g;
		var a;

		while ((a = are.exec(m[2])) != null)
		{
			attrs[a[1] || a[3]] = unescape((a[1] != null) ? a[2] : a[4]);
		}

		result[m[1]] = attrs;
	}

	return result;
}

var KINDS = {hmiLinks: 'links', hmiBindings: 'bindings', hmiEvents: 'events', hmiTriggers: 'triggers',
	hmiAnimations: 'animations'};

test('demo template: every link and object feature validates', function()
{
	var all = objects();
	var count = 0;

	for (var id in all)
	{
		for (var attr in KINDS)
		{
			if (all[id][attr] != null)
			{
				assert.deepStrictEqual(S.validate(KINDS[attr], JSON.parse(all[id][attr])), [], id + ' ' + attr);
				count++;
			}
		}
	}

	assert.ok(count >= 150, 'validated: ' + count);
});

test('demo template: the Object Features page has each feature', function()
{
	var all = objects();
	var used = {};

	for (var id in all)
	{
		if (id.indexOf('itd-of-') == 0)
		{
			for (var attr in all[id])
			{
				used[attr] = true;
			}
		}
	}

	['hmiLinks', 'hmiBindings', 'hmiEvents', 'hmiTriggers', 'hmiAnimations', 'hmiRoles', 'hmiRolesMode']
		.forEach(function(a)
		{
			assert.ok(used[a], 'Object Features uses ' + a);
		});

	var triggers = JSON.parse(all['itd-of-trig-pressure'].hmiTriggers);
	assert.strictEqual(triggers[0].states, undefined);
	assert.strictEqual(triggers[0].conditionType, 'or');
	assert.ok(JSON.parse(all['itd-of-sm-status'].hmiTriggers)[0].states.length == 4);
	assert.strictEqual(all['itd-of-sec-disable'].hmiRolesMode, 'disable');
	assert.strictEqual(JSON.parse(all['itd-of-media-audio'].hmiLinks).media.mode, 'play');
	assert.ok(xml.indexOf('hmiHaloStyle=glowOutline') >= 0 && xml.indexOf('hmiHaloOutline=shape') >= 0 &&
		xml.indexOf('hmiHalo=0') >= 0);

	// One page trigger and one page state machine in the page's document config
	var page = /<diagram id="itd-of"[^>]*>.*?<object id="0" hmi='([^']*)'/.exec(xml);
	assert.ok(page != null);
	var doc = JSON.parse(unescape(page[1]));
	assert.deepStrictEqual(S.validate('doc', doc), []);
	assert.deepStrictEqual(S.validate('triggers', doc.triggers), []);
	assert.strictEqual(doc.triggers.filter(function(t) { return t.states == null; }).length, 1);
	assert.strictEqual(doc.triggers.filter(function(t) { return t.states != null; }).length, 1);
});

test('demo template: options of existing links', function()
{
	var all = objects();
	var presets = {};
	var flows = {};
	var anchors = {};
	var conditions = {};

	for (var id in all)
	{
		if (all[id].hmiLinks != null)
		{
			var links = JSON.parse(all[id].hmiLinks);

			if (links.animation != null) presets[links.animation.preset] = true;
			if (links.flow != null) flows[links.flow.type] = true;

			['sizeHeight', 'sizeWidth', 'sizeScale'].forEach(function(k)
			{
				if (links[k] != null) anchors[k + ':' + links[k].anchor] = true;
			});

			if (links.pushAction != null)
			{
				links.pushAction.scripts.forEach(function(s) { conditions[s.condition] = true; });
			}
		}
	}

	['spin', 'pulse', 'shake', 'fadeInOut', 'blink', 'colorCycle', 'bounce', 'sway', 'glow', 'custom']
		.forEach(function(p) { assert.ok(presets[p], 'animation preset ' + p); });
	['dash', 'dots', 'beads', 'arrows', 'liquid'].forEach(function(t) { assert.ok(flows[t], 'flow ' + t); });
	['sizeHeight:offset', 'sizeWidth:offset', 'sizeScale:offset'].forEach(function(a)
	{
		assert.ok(anchors[a], 'anchor ' + a);
	});
	['onLeftDouble', 'onRightDown', 'whileRightDown', 'onRightUp', 'onRightDouble'].forEach(function(c)
	{
		assert.ok(conditions[c], 'script condition ' + c);
	});

	// The custom preset names an animation of the object
	var custom = JSON.parse(all['itd-m2d-custom'].hmiAnimations);
	assert.strictEqual(custom[0].name, JSON.parse(all['itd-m2d-custom'].hmiLinks).animation.name);
});
