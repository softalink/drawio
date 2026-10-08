/**
 * Hmi.LinksDialog: design-stage editor for InTouch-style animation links
 * (INTOUCH_LINKS.md §2 and §10). The main dialog mirrors InTouch's
 * "Animation Links" dialog: one checkbox per link and a configure button
 * that opens the settings dialog of that link. Saving writes the attribute
 * hmiLinks through Hmi.Model.setCellConfig (one undoable edit).
 *
 * Also provides Hmi.LinksDialog.summary(links) for the HMI tab and
 * Hmi.LinksDialog.decorate(ui, on) for the link badge.
 *
 * DOM-bound; not part of the DOM-free module set (ARCHITECTURE.md §1).
 */
(function()
{
	var root = (typeof globalThis !== 'undefined') ? globalThis : window;
	var Hmi = root.Hmi = root.Hmi || {};

	var LinksDialog = {};

	function T(key)
	{
		var value = mxResources.get(key);

		return (value != null && value !== '') ? value : key;
	};

	function clone(obj)
	{
		return (obj === undefined) ? undefined : JSON.parse(JSON.stringify(obj));
	};

	function trim(s)
	{
		return String(s == null ? '' : s).replace(/^\s+|\s+$/g, '');
	};

	/**
	 * Appends the quick-help icon of the key (or the first of several keys
	 * with a text) to the parent. Nothing is added when there is no text.
	 */
	function addHelp(parent, keys, title)
	{
		return (Hmi.Help != null && parent != null) ? Hmi.Help.attach(parent, keys, title) : null;
	};

	/**
	 * Adds the help icon to the label of a form row or inline field.
	 */
	function labelHelp(row, keys, title)
	{
		return addHelp((row != null) ? row.querySelector('.geDialogFormLabel') : null, keys, title);
	};

	// ---------------------------------------------------------------
	// Option lists
	// ---------------------------------------------------------------

	var CONDITIONS = ['onLeftDown', 'whileLeftDown', 'onLeftUp', 'onLeftDouble',
		'onRightDown', 'whileRightDown', 'onRightUp', 'onRightDouble',
		'onMouseOver', 'whileMouseOver', 'onMouseLeave'];

	var NAMED_KEYS = ['Enter', 'Space', 'Escape', 'Tab', 'Insert', 'Delete', 'Home', 'End',
		'PageUp', 'PageDown'];

	function keyChoices()
	{
		var list = [{value: '', label: T('hmiLnkNone')}];
		var i;

		for (i = 1; i <= 16; i++)
		{
			list.push({value: 'F' + i, label: 'F' + i});
		}

		for (i = 0; i < 26; i++)
		{
			var ch = String.fromCharCode(65 + i);
			list.push({value: ch, label: ch});
		}

		for (i = 0; i < 10; i++)
		{
			list.push({value: String(i), label: String(i)});
		}

		for (i = 0; i < NAMED_KEYS.length; i++)
		{
			list.push({value: NAMED_KEYS[i], label: NAMED_KEYS[i]});
		}

		return list;
	};

	function opts(pairs)
	{
		return pairs.map(function(p)
		{
			return {value: p[0], label: T(p[1])};
		});
	};

	var FORMAT_MODES = [['text', 'hmiLnkFmtText'], ['real', 'hmiLnkFmtReal'],
		['fixed', 'hmiLnkFmtFixed'], ['integer', 'hmiLnkFmtInteger'],
		['exponential', 'hmiLnkFmtExponential'], ['hex', 'hmiLnkFmtHex'],
		['binary', 'hmiLnkFmtBinary']];

	var DEFAULT_FORMAT = {mode: 'text', precision: 0, bitsFrom: 0, bitsTo: 31, fixedWidth: false};

	// ---------------------------------------------------------------
	// Link specifications: id → {title, fields, fixed, width}
	// ---------------------------------------------------------------

	var SPECS = {};

	function field(key, type, label, extra)
	{
		var f = {key: key, type: type, label: label};

		for (var k in extra)
		{
			f[k] = extra[k];
		}

		return f;
	};

	function expr(extra)
	{
		return field('expr', 'expr', 'hmiLnkExpression', extra);
	};

	function head(label)
	{
		return field(null, 'heading', label);
	};

	function num(key, label, def, inline, extra)
	{
		var f = field(key, 'number', label, extra);
		f.def = def;
		f.inline = inline;

		return f;
	};

	function sel(key, label, def, pairs, extra)
	{
		var f = field(key, 'select', label, extra);
		f.def = def;
		f.options = opts(pairs);

		return f;
	};

	function color(key, label, def, extra)
	{
		var f = field(key, 'color', label, extra);
		f.def = def;

		return f;
	};

	/**
	 * Data-age fields: a colour (colour links) for data older than
	 * staleSeconds.
	 */
	function staleFields(noColor)
	{
		var list = [head('hmiLnkDataAge'), num('staleSeconds', 'hmiLnkStaleSeconds', undefined, 'age',
			{optional: true, min: 0})];

		if (!noColor)
		{
			list.push(color('staleColor', 'hmiLnkStaleColor', '', {optional: true, inline: 'age'}));
		}

		return list;
	};

	function def(id, title, fields, fixed, width)
	{
		SPECS[id] = {id: id, title: title, fields: fields, fixed: fixed || {}, width: width || 470};
	};

	function arrow(a, b)
	{
		return T(a) + ' → ' + T(b);
	};

	function percentFields(minPct, maxPct)
	{
		return [head('hmiLnkExprValue'),
			num('valueAtMin', 'hmiLnkAtMin', 0, 'v'),
			num('valueAtMax', 'hmiLnkAtMax', 100, 'v'),
			head(minPct),
			num('minPercent', 'hmiLnkMinPercent', 0, 'p'),
			num('maxPercent', 'hmiLnkMaxPercent', 100, 'p')];
	};

	var ANIM_PRESETS = [['spin', 'hmiLnkAnim_spin'], ['pulse', 'hmiLnkAnim_pulse'],
		['shake', 'hmiLnkAnim_shake'], ['fadeInOut', 'hmiLnkAnim_fadeInOut'],
		['blink', 'hmiLnkAnim_blink'], ['colorCycle', 'hmiLnkAnim_colorCycle'],
		['bounce', 'hmiLnkAnim_bounce'], ['sway', 'hmiLnkAnim_sway'], ['glow', 'hmiLnkAnim_glow'],
		['custom', 'hmiLnkAnim_custom']];

	var FLOW_TYPES = [['dash', 'hmiLnkFlow_dash'], ['dots', 'hmiLnkFlow_dots'],
		['beads', 'hmiLnkFlow_beads'], ['arrows', 'hmiLnkFlow_arrows'],
		['liquid', 'hmiLnkFlow_liquid']];

	var CONTROL_COMMANDS = ['startAnimation', 'pauseAnimation', 'stopAnimation', 'playMedia',
		'pauseMedia', 'stopMedia'];

	var PROP_TARGETS = ['style:fillColor', 'style:strokeColor', 'style:fontColor', 'style:opacity',
		'style:strokeWidth', 'style:rotation', 'style:flipH', 'style:flipV', 'label', 'tooltip',
		'visible', 'attr:', 'prop:'];

	var KEY_FIELD = field('key', 'key', 'hmiLnkKeyEquivalent', {def: null});

	function buildSpecs()
	{
		def('valueDiscrete', arrow('hmiLnkOutput', 'hmiLnkDiscreteExpression'),
			[expr(), field('onMessage', 'text', 'hmiLnkOnMessage', {def: 'On'}),
			field('offMessage', 'text', 'hmiLnkOffMessage', {def: 'Off'})]);
		def('valueAnalog', arrow('hmiLnkOutput', 'hmiLnkAnalogExpression'),
			[expr(), field('format', 'format', 'hmiLnkFormat', {def: DEFAULT_FORMAT})]);
		def('valueString', arrow('hmiLnkOutput', 'hmiLnkStringExpression'), [expr()]);

		def('locationH', T('hmiLnkHorizontalLocation'),
			[expr(), head('hmiLnkExprValue'),
			num('atLeft', 'hmiLnkAtLeft', 0, 'a'), num('atRight', 'hmiLnkAtRight', 100, 'a'),
			head('hmiLnkMovePixels'),
			num('toLeft', 'hmiLnkToLeft', 0, 'b', {min: 0}), num('toRight', 'hmiLnkToRight', 100, 'b', {min: 0})]);
		def('locationV', T('hmiLnkVerticalLocation'),
			[expr(), head('hmiLnkExprValue'),
			num('atTop', 'hmiLnkAtTop', 100, 'a'), num('atBottom', 'hmiLnkAtBottom', 0, 'a'),
			head('hmiLnkMovePixels'),
			num('up', 'hmiLnkUp', 100, 'b', {min: 0}), num('down', 'hmiLnkDown', 0, 'b', {min: 0})]);
		def('orientation', arrow('hmiLnkOrientation', 'hmiLnkAnalogValue'),
			[expr(), head('hmiLnkExprValue'),
			num('valueAtMaxCCW', 'hmiLnkAtMaxCCW', 0, 'a'), num('valueAtMaxCW', 'hmiLnkAtMaxCW', 100, 'a'),
			head('hmiLnkRotationDegrees'),
			num('ccwRotation', 'hmiLnkCcw', 0, 'b', {min: 0, max: 360}),
			num('cwRotation', 'hmiLnkCw', 360, 'b', {min: 0, max: 360}),
			head('hmiLnkRotationPoint'),
			num('offsetX', 'hmiLnkOffsetX', 0, 'c'), num('offsetY', 'hmiLnkOffsetY', 0, 'c')]);

		def('sizeHeight', arrow('hmiLnkObjectHeight', 'hmiLnkAnalogValue'),
			[expr()].concat(percentFields('hmiLnkHeightPercent')).concat([
			sel('anchor', 'hmiLnkAnchor', 'bottom', [['top', 'hmiLnkTop'],
				['middle', 'hmiLnkMiddle'], ['bottom', 'hmiLnkBottom'], ['offset', 'hmiLnkAnchorOffset']]),
			num('offsetY', 'hmiLnkOffsetY', 0, null, {showWhen: {anchor: 'offset'}})]));
		def('sizeWidth', arrow('hmiLnkObjectWidth', 'hmiLnkAnalogValue'),
			[expr()].concat(percentFields('hmiLnkWidthPercent')).concat([
			sel('anchor', 'hmiLnkAnchor', 'left', [['left', 'hmiLnkLeft'],
				['center', 'hmiLnkCenter'], ['right', 'hmiLnkRight'], ['offset', 'hmiLnkAnchorOffset']]),
			num('offsetX', 'hmiLnkOffsetX', 0, null, {showWhen: {anchor: 'offset'}})]));
		def('sizeScale', arrow('hmiLnkObjectScale', 'hmiLnkAnalogValue'),
			[expr()].concat(percentFields('hmiLnkScalePercent')).concat([
			sel('anchor', 'hmiLnkAnchor', 'center', [['center', 'hmiLnkCenter'],
				['topLeft', 'hmiLnkTopLeft'], ['top', 'hmiLnkTop'], ['topRight', 'hmiLnkTopRight'],
				['left', 'hmiLnkLeft'], ['right', 'hmiLnkRight'], ['bottomLeft', 'hmiLnkBottomLeft'],
				['bottom', 'hmiLnkBottom'], ['bottomRight', 'hmiLnkBottomRight'],
				['offset', 'hmiLnkAnchorOffset']]),
			num('offsetX', 'hmiLnkOffsetX', 0, 'c', {showWhen: {anchor: 'offset'}}),
			num('offsetY', 'hmiLnkOffsetY', 0, 'c', {showWhen: {anchor: 'offset'}})]));

		var targets = [['lineColor', 'hmiLnkLineColor'], ['fillColor', 'hmiLnkFillColor'],
			['textColor', 'hmiLnkTextColor']];

		for (var i = 0; i < targets.length; i++)
		{
			(function(id, label)
			{
				def(id + ':discrete', arrow(label, 'hmiLnkDiscreteExpression'),
					[expr(), color('offColor', 'hmiLnkOffColor', '#FF0000'),
					color('onColor', 'hmiLnkOnColor', '#00C000')].concat(staleFields()), {kind: 'discrete'});
				def(id + ':analog', arrow(label, 'hmiLnkAnalogExpression'),
					[expr(), field('breakpoints', 'breakpoints', 'hmiLnkBreakPoints',
					{def: [{value: 0, color: '#0000FF'}, {value: 50, color: '#00C000'}]}),
					field('blend', 'bool', 'hmiLnkBlend', {def: false})].concat(staleFields()),
					{kind: 'analog'});
				def(id + ':discreteAlarm', arrow(label, 'hmiLnkDiscreteAlarm'),
					[field('tag', 'tag', 'hmiLnkTagname'), color('normalColor', 'hmiLnkNormalColor', '#00C000'),
					color('alarmColor', 'hmiLnkAlarmColor', '#FF0000')].concat(staleFields()),
					{kind: 'discreteAlarm'});
				def(id + ':analogAlarm', arrow(label, 'hmiLnkAnalogAlarm'),
					[field('tag', 'tag', 'hmiLnkTagname'),
					sel('alarmType', 'hmiLnkAlarmType', 'value', [['value', 'hmiLnkAlarmValue'],
						['deviation', 'hmiLnkAlarmDeviation'], ['roc', 'hmiLnkAlarmRoc']]),
					field('colors', 'alarmColors', 'hmiLnkColors', {})].concat(staleFields()),
					{kind: 'analogAlarm'});
			})(targets[i][0], targets[i][1]);
		}

		def('fillVertical', arrow('hmiLnkVerticalFill', 'hmiLnkAnalogValue'),
			[expr()].concat(percentFields('hmiLnkFillPercent')).concat([
			sel('direction', 'hmiLnkDirection', 'up', [['up', 'hmiLnkUp'], ['down', 'hmiLnkDown']]),
			color('backgroundColor', 'hmiLnkBackground', '#FFFFFF')]));
		def('fillHorizontal', arrow('hmiLnkHorizontalFill', 'hmiLnkAnalogValue'),
			[expr()].concat(percentFields('hmiLnkFillPercent')).concat([
			sel('direction', 'hmiLnkDirection', 'right', [['right', 'hmiLnkFillRight'],
				['left', 'hmiLnkFillLeft']]),
			color('backgroundColor', 'hmiLnkBackground', '#FFFFFF')]));

		def('blink', arrow('hmiLnkObjectBlinking', 'hmiLnkDiscreteValue'),
			[expr(), sel('mode', 'hmiLnkBlinkMode', 'invisible', [['invisible', 'hmiLnkBlinkInvisible'],
				['visible', 'hmiLnkBlinkVisible']]),
			sel('speed', 'hmiLnkBlinkSpeed', 'medium', [['slow', 'hmiLnkSlow'],
				['medium', 'hmiLnkMedium'], ['fast', 'hmiLnkFast']]),
			color('textColor', 'hmiLnkTextColor', '', {optional: true, showWhen: {mode: 'visible'}}),
			color('lineColor', 'hmiLnkLineColor', '', {optional: true, showWhen: {mode: 'visible'}}),
			color('fillColor', 'hmiLnkFillColor', '', {optional: true, showWhen: {mode: 'visible'}})]);
		def('visibility', arrow('hmiLnkObjectVisibility', 'hmiLnkDiscreteValue'),
			[expr(), sel('visibleState', 'hmiLnkVisibleWhen', 'on', [['on', 'hmiLnkExprTrue'],
				['off', 'hmiLnkExprFalse']])]);
		def('disable', arrow('hmiLnkObjectDisabled', 'hmiLnkDiscreteValue'),
			[expr(), sel('disabledState', 'hmiLnkDisabledWhen', 'on', [['on', 'hmiLnkExprTrue'],
				['off', 'hmiLnkExprFalse']])]);
		def('tooltip', arrow('hmiLnkObjectTooltip', 'hmiLnkStringTagname'),
			[sel('mode', 'hmiLnkTooltipMode', 'static', [['static', 'hmiLnkStaticText'],
				['expression', 'hmiLnkExpression']]),
			field('text', 'text', 'hmiLnkTooltipText', {def: '', maxLength: 131,
				showWhen: {mode: 'static'}}),
			expr({showWhen: {mode: 'expression'}}),
			field('trend', 'bool', 'hmiLnkTrend', {def: false}),
			field('trendTag', 'tag', 'hmiLnkTrendTag', {optional: true, showWhen: {trend: true}}),
			num('trendSeconds', 'hmiLnkTrendSeconds', 60, null, {min: 5, max: 3600, showWhen: {trend: true}})]);

		def('inputDiscrete', arrow('hmiLnkInput', 'hmiLnkDiscreteTagname'),
			[field('tag', 'tag', 'hmiLnkTagname'), KEY_FIELD,
			field('message', 'text', 'hmiLnkMessage', {def: ''}),
			field('setPrompt', 'text', 'hmiLnkSetPrompt', {def: 'On'}),
			field('resetPrompt', 'text', 'hmiLnkResetPrompt', {def: 'Off'}),
			field('onMessage', 'text', 'hmiLnkOnMessage', {def: 'On'}),
			field('offMessage', 'text', 'hmiLnkOffMessage', {def: 'Off'}),
			field('inputOnly', 'bool', 'hmiLnkInputOnly', {def: false})]);
		def('inputAnalog', arrow('hmiLnkInput', 'hmiLnkAnalogTagname'),
			[field('tag', 'tag', 'hmiLnkTagname'), KEY_FIELD,
			field('keypad', 'bool', 'hmiLnkKeypad', {def: false}),
			field('message', 'text', 'hmiLnkMessage', {def: '', showWhen: {keypad: true}}),
			field('min', 'numOrTag', 'hmiLnkMinimum', {def: 1}),
			field('max', 'numOrTag', 'hmiLnkMaximum', {def: 100}),
			field('inputOnly', 'bool', 'hmiLnkInputOnly', {def: false}),
			field('format', 'format', 'hmiLnkFormat', {def: DEFAULT_FORMAT})]);
		def('inputString', arrow('hmiLnkInput', 'hmiLnkStringTagname'),
			[field('tag', 'tag', 'hmiLnkTagname'), KEY_FIELD,
			field('keypad', 'bool', 'hmiLnkKeyboard', {def: false}),
			field('message', 'text', 'hmiLnkMessage', {def: '', showWhen: {keypad: true}}),
			sel('echo', 'hmiLnkEcho', 'yes', [['yes', 'hmiLnkYes'], ['no', 'hmiLnkNo'],
				['password', 'hmiLnkPassword']]),
			field('passwordChar', 'text', 'hmiLnkPasswordChar', {def: '*', maxLength: 1,
				showWhen: {echo: 'password'}}),
			field('encrypt', 'bool', 'hmiLnkEncrypt', {def: false, showWhen: {echo: 'password'}}),
			field('inputOnly', 'bool', 'hmiLnkInputOnly', {def: false})]);

		def('sliderH', T('hmiLnkHorizontalSlider'),
			[field('tag', 'tag', 'hmiLnkTagname'), head('hmiLnkExprValue'),
			num('atLeft', 'hmiLnkAtLeft', 0, 'a'), num('atRight', 'hmiLnkAtRight', 100, 'a'),
			head('hmiLnkMovePixels'),
			num('toLeft', 'hmiLnkToLeft', 0, 'b', {min: 0}), num('toRight', 'hmiLnkToRight', 100, 'b', {min: 0}),
			sel('reference', 'hmiLnkReference', 'center', [['left', 'hmiLnkLeft'],
				['center', 'hmiLnkCenter'], ['right', 'hmiLnkRight']])]);
		def('sliderV', T('hmiLnkVerticalSlider'),
			[field('tag', 'tag', 'hmiLnkTagname'), head('hmiLnkExprValue'),
			num('atTop', 'hmiLnkAtTop', 100, 'a'), num('atBottom', 'hmiLnkAtBottom', 0, 'a'),
			head('hmiLnkMovePixels'),
			num('up', 'hmiLnkUp', 100, 'b', {min: 0}), num('down', 'hmiLnkDown', 0, 'b', {min: 0}),
			sel('reference', 'hmiLnkReference', 'middle', [['top', 'hmiLnkTop'],
				['middle', 'hmiLnkMiddle'], ['bottom', 'hmiLnkBottom']])]);

		def('pushDiscrete', arrow('hmiLnkPushbutton', 'hmiLnkDiscreteValue'),
			[field('tag', 'tag', 'hmiLnkTagname'), KEY_FIELD,
			sel('action', 'hmiLnkPushAction', 'direct', [['direct', 'hmiLnkPushDirect'],
				['reverse', 'hmiLnkPushReverse'], ['toggle', 'hmiLnkPushToggle'],
				['reset', 'hmiLnkPushReset'], ['set', 'hmiLnkPushSet']])]);
		def('pushAction', arrow('hmiLnkTouch', 'hmiLnkActionScript'),
			[KEY_FIELD, field('scripts', 'scripts', 'hmiLnkScripts', {})], null, 560);
		def('showWindow', T('hmiLnkWindowsToShow'),
			[KEY_FIELD, field('windows', 'windows', 'hmiLnkWindows', {})], null, 500);
		def('hideWindow', T('hmiLnkWindowsToHide'),
			[KEY_FIELD, field('windows', 'windows', 'hmiLnkWindows', {})], null, 500);

		// ---- Extension links from meta2d (INTOUCH_LINKS.md §11) ----
		def('opacity', arrow('hmiLnkOpacity', 'hmiLnkAnalogValue'),
			[expr()].concat(percentFields('hmiLnkOpacityPercent')));
		def('states', T('hmiLnkMultiState'),
			[expr(), field('states', 'states', 'hmiLnkStates', {def: [{match: '*'}]})].concat(staleFields(true)),
			null, 700);
		def('properties', T('hmiLnkProperties'),
			[field('items', 'propItems', 'hmiLnkPropItems', {def: [{target: '', expr: ''}]})], null, 620);
		def('widgetData', T('hmiLnkWidgetData'),
			[expr({optional: true}), field('series', 'series', 'hmiLnkSeries', {def: []})], null, 600);

		def('animation', T('hmiLnkAnimation'),
			[expr({optional: true}),
			sel('preset', 'hmiLnkPreset', 'spin', ANIM_PRESETS),
			field('name', 'text', 'hmiLnkAnimName', {def: '', showWhen: {preset: 'custom'}}),
			color('color', 'hmiLnkColor', '', {optional: true, showWhen: {preset: 'glow'}}),
			field('rateExpr', 'expr', 'hmiLnkRateExpr', {optional: true}),
			field('reverseExpr', 'expr', 'hmiLnkReverseExpr', {optional: true,
				showWhen: {preset: 'spin'}})]);
		def('flow', T('hmiLnkFlow'),
			[expr({optional: true}),
			sel('type', 'hmiLnkFlowType', 'dash', FLOW_TYPES),
			color('color', 'hmiLnkColor', '', {optional: true}),
			num('width', 'hmiLnkLineWidth', undefined, null, {optional: true, min: 1}),
			field('speedExpr', 'expr', 'hmiLnkSpeedExpr', {optional: true}),
			field('reverseExpr', 'expr', 'hmiLnkReverseExpr', {optional: true})]);
		def('smooth', T('hmiLnkSmooth'),
			[num('duration', 'hmiLnkSmoothDuration', 500, null, {min: 0, max: 10000})]);
		def('alarmMarker', T('hmiLnkAlarmMarker'),
			[sel('show', 'hmiLnkMarkerShow', 'show', [['show', 'hmiLnkMarkerShowOpt'],
				['hide', 'hmiLnkMarkerHideOpt']]),
			field('tag', 'tag', 'hmiLnkMarkerTag', {optional: true, showWhen: {show: 'show'}})]);
		def('media', T('hmiLnkMedia'),
			[expr(), sel('mode', 'hmiLnkMediaMode', 'play', [['play', 'hmiLnkMediaPlay'],
				['pause', 'hmiLnkMediaPause']])]);

		def('inputChoice', arrow('hmiLnkInput', 'hmiLnkChoice'),
			[field('tag', 'tag', 'hmiLnkTagname'), KEY_FIELD,
			field('message', 'text', 'hmiLnkMessage', {def: ''}),
			field('options', 'choices', 'hmiLnkOptions', {def: [{label: '', value: ''}]})], null, 560);
		def('pushValue', arrow('hmiLnkPushbutton', 'hmiLnkAnalogStringValue'),
			[field('tag', 'tag', 'hmiLnkTagname'), KEY_FIELD,
			sel('action', 'hmiLnkPushAction', 'set', [['set', 'hmiLnkPushSet'],
				['add', 'hmiLnkPushAdd'], ['subtract', 'hmiLnkPushSubtract'],
				['expression', 'hmiLnkExpression']]),
			field('value', 'valueText', 'hmiLnkValue', {def: '', showWhen: {action: ['set', 'add', 'subtract']}}),
			expr({showWhen: {action: 'expression'}}),
			num('min', 'hmiLnkMinimum', undefined, 'lim', {optional: true,
				showWhen: {action: ['add', 'subtract']}}),
			num('max', 'hmiLnkMaximum', undefined, 'lim', {optional: true,
				showWhen: {action: ['add', 'subtract']}})]);
		def('openUrl', T('hmiLnkOpenUrl'),
			[KEY_FIELD, field('url', 'text', 'hmiLnkUrl', {def: '', required: true}),
			sel('target', 'hmiLnkUrlTarget', 'blank', [['blank', 'hmiLnkUrlBlank'],
				['self', 'hmiLnkUrlSelf'], ['dialog', 'hmiLnkUrlDialog']]),
			field('title', 'text', 'hmiLnkWindowTitle', {def: '', optional: true,
				showWhen: {target: 'dialog'}}),
			num('width', 'hmiLnkWidth', 640, 'sz', {min: 50, showWhen: {target: 'dialog'}}),
			num('height', 'hmiLnkHeight', 480, 'sz', {min: 50, showWhen: {target: 'dialog'}})]);
		def('sendMessage', T('hmiLnkSendMessage'),
			[KEY_FIELD, field('name', 'text', 'hmiLnkMessageName', {def: '', required: true}),
			field('payloadExpr', 'expr', 'hmiLnkPayloadExpr', {optional: true}),
			sel('to', 'hmiLnkMessageTo', 'page', [['page', 'hmiLnkToPage'], ['host', 'hmiLnkToHost'],
				['both', 'hmiLnkToBoth']])]);
		def('control', T('hmiLnkControl'),
			[KEY_FIELD, field('commands', 'commands', 'hmiLnkCommands',
			{def: [{object: '', command: 'startAnimation'}]})], null, 680);
		def('touchOptions', T('hmiLnkTouchOptions'),
			[field('confirm', 'text', 'hmiLnkConfirm', {def: '', optional: true}),
			field('confirmTitle', 'text', 'hmiLnkConfirmTitle', {def: '', optional: true}),
			field('roles', 'roles', 'hmiLnkRoles', {def: []}),
			num('delay', 'hmiLnkDelay', 0, null, {min: 0})]);

		def('dataChange', T('hmiLnkDataChange'),
			[expr(), num('deadband', 'hmiLnkDeadband', 0, null, {min: 0}),
			field('script', 'script', 'hmiLnkScript', {def: '', rows: 8})], null, 560);
		def('condition', T('hmiLnkCondition'),
			[expr(),
			field('onTrue', 'script', 'hmiLnkOnTrue', {def: '', rows: 3, optional: true}),
			field('onFalse', 'script', 'hmiLnkOnFalse', {def: '', rows: 3, optional: true}),
			field('whileTrue', 'script', 'hmiLnkWhileTrue', {def: '', rows: 3, optional: true}),
			field('whileFalse', 'script', 'hmiLnkWhileFalse', {def: '', rows: 3, optional: true}),
			num('period', 'hmiLnkPeriod', 1000, null, {min: 100})], null, 560);
	};

	/**
	 * Main dialog layout: groups of [link id, label key].
	 */
	var GROUPS = [
		{band: 'hmiLnkDisplayLinks'},
		{title: 'hmiLnkValueDisplay', items: [['valueDiscrete', 'hmiLnkDiscrete'],
			['valueAnalog', 'hmiLnkAnalog'], ['valueString', 'hmiLnkString']]},
		{title: 'hmiLnkLocation', items: [['locationH', 'hmiLnkHorizontal'],
			['locationV', 'hmiLnkVertical']]},
		{title: 'hmiLnkObjectSize', items: [['sizeHeight', 'hmiLnkHeight'],
			['sizeWidth', 'hmiLnkWidth'], ['sizeScale', 'hmiLnkScale']]},
		{title: 'hmiLnkLineColor', color: 'lineColor'},
		{title: 'hmiLnkFillColor', color: 'fillColor'},
		{title: 'hmiLnkTextColor', color: 'textColor'},
		{title: 'hmiLnkPercentFill', items: [['fillVertical', 'hmiLnkVertical'],
			['fillHorizontal', 'hmiLnkHorizontal']]},
		{title: 'hmiLnkMiscellaneous', items: [['visibility', 'hmiLnkVisibility'],
			['blink', 'hmiLnkBlink'], ['orientation', 'hmiLnkOrientation'],
			['disable', 'hmiLnkDisable'], ['tooltip', 'hmiLnkTooltip'],
			['opacity', 'hmiLnkOpacity'], ['alarmMarker', 'hmiLnkAlarmMarker']]},
		{title: 'hmiLnkStatesProps', items: [['states', 'hmiLnkMultiState'],
			['properties', 'hmiLnkProperties'], ['widgetData', 'hmiLnkWidgetData'],
			['bindings', 'hmiLnkBindings']]},
		{band: 'hmiLnkAnimationLinks'},
		{title: 'hmiLnkAnimationGroup', items: [['animation', 'hmiLnkAnimation'],
			['flow', 'hmiLnkFlow'], ['media', 'hmiLnkMedia'], ['keyframes', 'hmiLnkKeyframes'],
			['smooth', 'hmiLnkSmooth']]},
		{band: 'hmiLnkTouchLinks'},
		{title: 'hmiLnkUserInputs', items: [['inputDiscrete', 'hmiLnkDiscrete'],
			['inputAnalog', 'hmiLnkAnalog'], ['inputString', 'hmiLnkString'],
			['inputChoice', 'hmiLnkChoice']]},
		{title: 'hmiLnkSliders', items: [['sliderV', 'hmiLnkVertical'],
			['sliderH', 'hmiLnkHorizontal']]},
		{title: 'hmiLnkTouchPushbuttons', items: [['pushDiscrete', 'hmiLnkDiscreteValue'],
			['pushAction', 'hmiLnkAction'], ['showWindow', 'hmiLnkShowWindow'],
			['hideWindow', 'hmiLnkHideWindow'], ['pushValue', 'hmiLnkAnalogStringValue']]},
		{title: 'hmiLnkActions', items: [['openUrl', 'hmiLnkOpenUrl'],
			['sendMessage', 'hmiLnkSendMessage'], ['control', 'hmiLnkControl'],
			['touchOptions', 'hmiLnkTouchOptions'], ['events', 'hmiLnkEvents'],
			['security', 'hmiLnkSecurity'], ['hoverHalo', 'hmiLnkHoverHalo']]},
		{band: 'hmiLnkScriptsBand'},
		{title: 'hmiLnkTriggersGroup', items: [['triggers', 'hmiLnkTriggers'],
			['stateMachines', 'hmiLnkStateMachines']]},
		{title: 'hmiLnkObjectScripts', items: [['dataChange', 'hmiLnkDataChange'],
			['condition', 'hmiLnkCondition']]}
	];

	var COLOR_KINDS = [['discrete', 'hmiLnkDiscrete'], ['analog', 'hmiLnkAnalog'],
		['discreteAlarm', 'hmiLnkDiscreteAlarm'], ['analogAlarm', 'hmiLnkAnalogAlarm']];

	var COLOR_TARGETS = {lineColor: true, fillColor: true, textColor: true};

	/**
	 * Canonical order of the link types for summaries.
	 */
	var ORDER = ['valueDiscrete', 'valueAnalog', 'valueString', 'locationH', 'locationV',
		'sizeHeight', 'sizeWidth', 'sizeScale', 'lineColor', 'fillColor', 'textColor', 'fillVertical',
		'fillHorizontal', 'visibility', 'blink', 'orientation', 'disable', 'tooltip',
		'inputDiscrete', 'inputAnalog', 'inputString', 'sliderV', 'sliderH', 'pushDiscrete',
		'pushAction', 'showWindow', 'hideWindow', 'opacity', 'states', 'properties', 'widgetData',
		'animation', 'flow', 'media', 'inputChoice', 'pushValue', 'openUrl', 'sendMessage',
		'control', 'touchOptions', 'dataChange', 'condition', 'smooth', 'alarmMarker'];

	// ---------------------------------------------------------------
	// Expression helpers
	// ---------------------------------------------------------------

	function compileExpr(src)
	{
		if (Hmi.Expr == null || Hmi.Expr.compile == null)
		{
			return {refs: []};
		}

		return Hmi.Expr.compile(src, {intouch: true});
	};

	var DOTFIELD_RE = /\.(value|name|quality|mineu|maxeu|minraw|maxraw|alarm|ack|timelastmodified)$/i;

	/**
	 * Expression refs list both "A.Value" and "A" for a dotfield access;
	 * drops the dotted duplicate when its prefix is in the list too.
	 */
	LinksDialog.cleanRefs = function(names)
	{
		return names.filter(function(n)
		{
			return !(DOTFIELD_RE.test(n) && names.indexOf(n.replace(DOTFIELD_RE, '')) >= 0);
		});
	};

	/**
	 * Returns the tag names referenced by an expression ([] on errors).
	 */
	LinksDialog.exprRefs = function(src)
	{
		if (src == null || src === '')
		{
			return [];
		}

		try
		{
			return LinksDialog.cleanRefs(compileExpr(src).refs || []);
		}
		catch (e)
		{
			return [];
		}
	};

	function isBareRef(src, name)
	{
		var s = trim(src).replace(/^(NOT\s+|!\s*)/i, '');

		return s === name;
	};

	function scriptRefs(src, known)
	{
		var out = [];

		try
		{
			if (Hmi.QuickScript != null && Hmi.QuickScript.refs != null)
			{
				return Hmi.QuickScript.refs(src) || [];
			}
		}
		catch (e)
		{
			// fall through
		}

		var re = /[A-Za-z_$][A-Za-z0-9_!@#$%&\\\/.]*/g;
		var m;

		while ((m = re.exec(src)) != null)
		{
			if (known[m[0]] && out.indexOf(m[0]) < 0)
			{
				out.push(m[0]);
			}
		}

		return out;
	};

	/**
	 * Returns [{name, type: 'boolean'|'number'|'string'|'any', write}] for
	 * every tag referenced by the links object. known: optional {name:true}
	 * used to find tags inside QuickScript text.
	 */
	LinksDialog.linkRefs = function(links, known)
	{
		var out = [];
		known = known || {};

		function add(name, type, write)
		{
			if (name != null && name !== '' && typeof name === 'string')
			{
				out.push({name: name, type: type, write: !!write});
			}
		};

		function addExpr(src, bareType, otherType)
		{
			var names = LinksDialog.exprRefs(src);

			for (var i = 0; i < names.length; i++)
			{
				add(names[i], isBareRef(src, names[i]) ? bareType : otherType, false);
			}
		};

		function addScriptRefs(src)
		{
			if (typeof src === 'string' && src !== '')
			{
				scriptRefs(src, known).forEach(function(n)
				{
					add(n, 'any', false);
				});
			}
		};

		var numExpr = {valueAnalog: 1, locationH: 1, locationV: 1, orientation: 1,
			sizeHeight: 1, sizeWidth: 1, sizeScale: 1, fillVertical: 1, fillHorizontal: 1};
		var boolExpr = {valueDiscrete: 1, blink: 1, visibility: 1, disable: 1};

		for (var type in links)
		{
			var l = links[type];

			if (l == null || typeof l !== 'object')
			{
				continue;
			}

			if (numExpr[type])
			{
				addExpr(l.expr, 'number', 'number');
			}
			else if (boolExpr[type])
			{
				addExpr(l.expr, 'boolean', 'any');
			}
			else if (type == 'valueString')
			{
				addExpr(l.expr, 'string', 'any');
			}
			else if (type == 'tooltip')
			{
				addExpr(l.expr, 'any', 'any');

				if (l.trend === true)
				{
					add(l.trendTag, 'number', false);
				}
			}
			else if (COLOR_TARGETS[type])
			{
				if (l.kind == 'discrete')
				{
					addExpr(l.expr, 'boolean', 'any');
				}
				else if (l.kind == 'analog')
				{
					addExpr(l.expr, 'number', 'number');
				}
				else if (l.kind == 'discreteAlarm')
				{
					add(l.tag, 'boolean', false);
				}
				else if (l.kind == 'analogAlarm')
				{
					add(l.tag, 'number', false);
				}
			}
			else if (type == 'inputDiscrete' || type == 'pushDiscrete')
			{
				add(l.tag, 'boolean', true);
			}
			else if (type == 'inputAnalog')
			{
				add(l.tag, 'number', true);

				if (typeof l.min === 'string')
				{
					add(l.min, 'number', false);
				}

				if (typeof l.max === 'string')
				{
					add(l.max, 'number', false);
				}
			}
			else if (type == 'inputString')
			{
				add(l.tag, 'string', true);
			}
			else if (type == 'sliderH' || type == 'sliderV')
			{
				add(l.tag, 'number', true);
			}
			else if (type == 'opacity')
			{
				addExpr(l.expr, 'number', 'number');
			}
			else if (type == 'states' || type == 'dataChange')
			{
				addExpr(l.expr, 'any', 'any');

				if (type == 'dataChange')
				{
					addScriptRefs(l.script);
				}
			}
			else if (type == 'properties')
			{
				(l.items || []).forEach(function(it)
				{
					addExpr(it.expr, 'any', 'any');
				});
			}
			else if (type == 'widgetData')
			{
				addExpr(l.expr, 'number', 'number');
				(l.series || []).forEach(function(se)
				{
					add(se.tag, 'number', false);
				});
			}
			else if (type == 'animation')
			{
				addExpr(l.expr, 'boolean', 'any');
				addExpr(l.rateExpr, 'number', 'number');
				addExpr(l.reverseExpr, 'boolean', 'any');
			}
			else if (type == 'flow')
			{
				addExpr(l.expr, 'boolean', 'any');
				addExpr(l.speedExpr, 'number', 'number');
				addExpr(l.reverseExpr, 'boolean', 'any');
			}
			else if (type == 'media')
			{
				addExpr(l.expr, 'boolean', 'any');
			}
			else if (type == 'alarmMarker')
			{
				add(l.tag, 'any', false);
			}
			else if (type == 'inputChoice')
			{
				var opts = l.options || [];
				var allNum = opts.length > 0 && opts.every(function(o)
				{
					return typeof o.value === 'number' ||
						(typeof o.value === 'string' && o.value !== '' && !isNaN(Number(o.value)));
				});
				add(l.tag, allNum ? 'number' : 'string', true);
			}
			else if (type == 'pushValue')
			{
				var textual = (l.action == 'set' || l.action == null) && typeof l.value === 'string' &&
					l.value !== '' && isNaN(Number(l.value));
				add(l.tag, textual ? 'string' : 'number', true);

				if (l.action == 'expression')
				{
					addExpr(l.expr, 'any', 'any');
				}
			}
			else if (type == 'sendMessage')
			{
				addExpr(l.payloadExpr, 'any', 'any');
			}
			else if (type == 'condition')
			{
				addExpr(l.expr, 'boolean', 'any');
				['onTrue', 'onFalse', 'whileTrue', 'whileFalse'].forEach(function(k)
				{
					addScriptRefs(l[k]);
				});
			}
			else if (type == 'pushAction' && l.scripts != null)
			{
				for (var i = 0; i < l.scripts.length; i++)
				{
					var names = scriptRefs(l.scripts[i].script || '', known);

					for (var j = 0; j < names.length; j++)
					{
						add(names[j], 'any', false);
					}
				}
			}
		}

		return out;
	};

	/**
	 * Returns every {kind, key} key equivalent of the links object.
	 */
	LinksDialog.keyOf = function(link)
	{
		if (link == null || link.key == null || link.key.key == null || link.key.key === '')
		{
			return null;
		}

		return (link.key.ctrl ? 'Ctrl+' : '') + (link.key.shift ? 'Shift+' : '') + link.key.key;
	};

	// ---------------------------------------------------------------
	// Form builder
	// ---------------------------------------------------------------

	function mark(el, key)
	{
		if (key != null)
		{
			el.setAttribute('data-field', key);
		}

		return el;
	};

	/**
	 * Column legend of a list editor whose columns have no labels of their
	 * own: one small caption with a help icon per column, appended to the
	 * heading. columns = [[label resource key, help keys], ...].
	 */
	function legend(head, columns)
	{
		for (var i = 0; columns != null && i < columns.length; i++)
		{
			var cap = document.createElement('span');
			cap.className = 'geHmiLegend';
			mxUtils.write(cap, T(columns[i][0]));
			addHelp(cap, columns[i][1]);
			head.appendChild(cap);
		}
	};

	/**
	 * Generic list editor: one card per item with reorder and delete
	 * buttons and an Add button. opts = {label, role, addKey, addLabel,
	 * items, blank(), build(content, item) → {get(), validate()}, tall,
	 * max, emptyKey}. Returns {rows, get(), validate()}.
	 */
	function listEditor(E, section, opts)
	{
		var h = document.createElement('div');
		h.className = 'geDialogHint geHmiSubHead';
		mxUtils.write(h, T(opts.label));
		addHelp(h, opts.helpKeys);
		legend(h, opts.legend);
		section.appendChild(h);
		var list = document.createElement('div');
		section.appendChild(list);
		var entries = [];
		var addBtn = E.button(T(opts.addLabel || 'hmiAddItem'), function()
		{
			addEntry(opts.blank());
			sync();
		});
		addBtn.style.marginTop = '6px';
		mark(addBtn, opts.addKey);
		section.appendChild(addBtn);

		function sync()
		{
			addBtn.disabled = (opts.max != null && entries.length >= opts.max);
		};

		function small(glyph, title, fn, role)
		{
			var b = E.button(glyph, fn);
			b.setAttribute('data-role', role);
			b.style.cssText = 'margin:0;flex:0 0 28px;width:28px;min-width:0;padding:0;height:24px;';
			b.setAttribute('title', title);

			return b;
		};

		function move(entry, dir)
		{
			var i = entries.indexOf(entry);
			var j = i + dir;

			if (j < 0 || j >= entries.length)
			{
				return;
			}

			entries.splice(i, 1);
			entries.splice(j, 0, entry);

			if (dir < 0)
			{
				list.insertBefore(entry.card, entries[j + 1].card);
			}
			else
			{
				list.insertBefore(entries[j - 1].card, entry.card);
			}
		};

		function addEntry(item)
		{
			var card = document.createElement('div');
			card.className = 'geHmiCard';
			card.style.cssText += 'display:flex;align-items:flex-start;column-gap:8px;';
			card.setAttribute('data-role', opts.role);
			var content = document.createElement('div');
			content.style.cssText = 'flex:1;min-width:0;';
			card.appendChild(content);
			var built = opts.build(content, item);
			var actions = document.createElement('div');
			actions.style.cssText = 'display:flex;flex:0 0 auto;gap:4px;' +
				(opts.tall ? 'flex-direction:column;' : 'align-self:center;');
			var entry = {card: card, built: built};
			actions.appendChild(small('▲', mxResources.get('moveUp') || 'Up', function()
			{
				move(entry, -1);
			}, 'up'));
			actions.appendChild(small('▼', mxResources.get('moveDown') || 'Down', function()
			{
				move(entry, 1);
			}, 'down'));
			actions.appendChild(small('✕', mxResources.get('delete'), function()
			{
				entries.splice(entries.indexOf(entry), 1);
				card.parentNode.removeChild(card);
				sync();
			}, 'delete'));
			card.appendChild(actions);
			entries.push(entry);
			list.appendChild(card);
		};

		(opts.items || []).forEach(addEntry);
		sync();

		return {rows: [h, list, addBtn], get: function()
		{
			return entries.map(function(e)
			{
				return e.built.get();
			});
		}, validate: function()
		{
			if (entries.length == 0 && opts.emptyKey != null)
			{
				return T(opts.label) + ': ' + T(opts.emptyKey);
			}

			for (var i = 0; i < entries.length; i++)
			{
				var err = entries[i].built.validate();

				if (err != null)
				{
					return T(opts.label) + ' ' + (i + 1) + ': ' + err;
				}
			}

			return null;
		}};
	};

	/**
	 * Text to value: numeric strings become numbers (so that 1.50 stays a
	 * string but 12 is a number).
	 */
	function textValue(s)
	{
		s = trim(s);

		return (s !== '' && String(Number(s)) === s) ? Number(s) : s;
	};

	function cardRow(content)
	{
		var row = E_inline(content);
		row.style.marginTop = (content.children.length > 1) ? '6px' : '0';

		return row;
	};

	function E_inline(content)
	{
		return Hmi.Editors.inlineFields(content);
	};

	function isColor(c)
	{
		return /^#[0-9A-F]{6}$/i.test(c);
	};

	/**
	 * QuickScript editor: textarea + Check button + result line. Returns
	 * {el, area, check() → error | null}.
	 */
	function scriptBox(E, initial, rows, helpKeys)
	{
		var box = document.createElement('div');
		var area = document.createElement('textarea');
		area.className = 'geHmiMono';
		area.setAttribute('rows', String(rows || 7));
		area.setAttribute('spellcheck', 'false');
		area.style.cssText = 'width:100%;box-sizing:border-box;resize:vertical;';
		area.value = initial || '';
		mark(area, 'script');
		box.appendChild(area);

		var bar = document.createElement('div');
		bar.style.cssText = 'display:flex;align-items:center;column-gap:8px;margin-top:6px;';
		var result = document.createElement('span');
		result.className = 'geDialogHint';
		result.style.cssText = 'flex:1;min-width:0;line-height:normal;';
		result.setAttribute('data-role', 'scriptResult');
		var check = E.button(T('hmiLnkCheck'), function()
		{
			var err = checkScript(area.value);
			result.className = (err == null) ? 'geDialogHint' : 'geHmiError';
			result.textContent = (err == null) ? T('hmiLnkScriptOk') : err;
		});
		check.style.margin = '0';
		mark(check, 'checkScript');
		bar.appendChild(check);
		addHelp(bar, helpKeys);
		bar.appendChild(result);
		box.appendChild(bar);

		return {el: box, area: area};
	};

	/**
	 * Builds the settings form of one link. Returns {el, getValue(),
	 * validate() → error string | null, extras}.
	 */
	function buildForm(ui, spec, value)
	{
		var E = Hmi.Editors;
		E.installStyle();
		value = value || {};
		var container = document.createElement('div');
		var section = document.createElement('div');
		section.className = 'geDialogSection';
		container.appendChild(section);

		var widgets = [];
		var inlineRow = null;
		var inlineName = null;
		var form = {el: container, extras: {}};

		// Help keys of a field (spec specific, then shared); col is the
		// column of a list or composite editor
		function fkeys(key, col)
		{
			var k = (col != null) ? key + '.' + col : key;

			return ['field.' + spec.id + '.' + k, 'field.' + k];
		};

		function place(f, el, labelKey)
		{
			var r;

			if (f.inline != null)
			{
				if (inlineRow == null || inlineName != f.inline)
				{
					inlineRow = E.inlineFields(section);
					inlineName = f.inline;
				}

				r = E.inlineField(inlineRow, T(f.label) + ':', el);
			}
			else
			{
				inlineRow = null;
				inlineName = null;
				r = E.row(section, T(labelKey || f.label) + ':');
			}

			labelHelp(r, fkeys(f.key));

			return r;
		};

		var needed = {alarmType: true};

		spec.fields.forEach(function(f)
		{
			for (var k in f.showWhen)
			{
				needed[k] = true;
			}
		});

		function values()
		{
			var o = {};

			for (var i = 0; i < widgets.length; i++)
			{
				var w = widgets[i];

				if (w.field.key != null && w.get != null && needed[w.field.key])
				{
					o[w.field.key] = w.get();
				}
			}

			return o;
		};

		function isShown(f, vals)
		{
			if (f.showWhen != null)
			{
				for (var k in f.showWhen)
				{
					var want = f.showWhen[k];

					if (Array.isArray(want) ? want.indexOf(vals[k]) < 0 : vals[k] !== want)
					{
						return false;
					}
				}
			}

			return true;
		};

		function refresh()
		{
			var vals = values();

			for (var i = 0; i < widgets.length; i++)
			{
				var w = widgets[i];
				w.shown = isShown(w.field, vals);

				for (var j = 0; j < w.rows.length; j++)
				{
					w.rows[j].style.display = w.shown ? '' : 'none';
				}

				if (w.update != null)
				{
					w.update(vals);
				}
			}

			var inl = section.querySelectorAll('.geDialogInlineFields');

			for (var k = 0; k < inl.length; k++)
			{
				var any = false;

				for (var c = 0; c < inl[k].children.length; c++)
				{
					any = any || (inl[k].children[c].style.display != 'none');
				}

				inl[k].style.display = any ? '' : 'none';
			}
		};

		var builders = {};

		builders.heading = function(f)
		{
			inlineRow = null;
			var el = document.createElement('div');
			el.className = 'geDialogHint geHmiSubHead';
			mxUtils.write(el, T(f.label));
			addHelp(el, 'heading.' + f.label);
			section.appendChild(el);

			return {rows: [el]};
		};

		builders.expr = function(f, v)
		{
			var pk = E.tagPicker(ui, v || '', {expression: true, placeholder: T('hmiLnkExprHint')});
			mark(pk.input, f.key);
			var row = place(f, pk);
			row.appendChild(pk);

			function check()
			{
				var bad = null;
				var s = trim(pk.input.value);

				if (s !== '')
				{
					try
					{
						compileExpr(s);
					}
					catch (e)
					{
						bad = e.message;
					}
				}

				pk.input.style.outline = (bad != null) ? '1px solid var(--error-color)' : '';
				pk.input.setAttribute('title', bad || '');

				return bad;
			};

			mxEvent.addListener(pk.input, 'change', check);

			return {rows: [row], get: function()
			{
				return trim(pk.input.value);
			}, validate: function()
			{
				var s = trim(pk.input.value);

				if (s === '' && !f.optional)
				{
					return T(f.label) + ': ' + T('hmiLnkRequired');
				}

				var bad = check();

				return (bad != null) ? T(f.label) + ': ' + bad : null;
			}};
		};

		builders.tag = function(f, v)
		{
			var pk = E.tagPicker(ui, v || '');
			mark(pk.input, f.key);
			var row = place(f, pk);
			row.appendChild(pk);

			return {rows: [row], get: function()
			{
				return trim(pk.input.value);
			}, validate: function()
			{
				return (trim(pk.input.value) === '' && !f.optional) ? T(f.label) + ': ' + T('hmiLnkRequired') : null;
			}};
		};

		builders.text = function(f, v)
		{
			var input = E.textInput(v != null ? v : '');
			mark(input, f.key);

			if (f.maxLength != null)
			{
				input.setAttribute('maxlength', String(f.maxLength));
			}

			var row = place(f, input);
			row.appendChild(input);

			return {rows: [row], get: function()
			{
				return input.value;
			}, validate: function()
			{
				if (f.required && trim(input.value) === '')
				{
					return T(f.label) + ': ' + T('hmiLnkRequired');
				}

				return (f.maxLength != null && input.value.length > f.maxLength) ?
					T(f.label) + ': ' + T('hmiLnkTooLong').replace('{1}', f.maxLength) : null;
			}};
		};

		builders.number = function(f, v)
		{
			var input = E.numberInput(v != null ? v : '');
			input.setAttribute('step', 'any');
			mark(input, f.key);
			var row = place(f, input);

			if (f.inline == null)
			{
				row.appendChild(input);
			}

			return {rows: [row], get: function()
			{
				var n = parseFloat(input.value);

				return isNaN(n) ? undefined : n;
			}, validate: function()
			{
				var n = parseFloat(input.value);

				if (isNaN(n))
				{
					return f.optional ? null : T(f.label) + ': ' + T('hmiLnkNumberRequired');
				}

				if ((f.min != null && n < f.min) || (f.max != null && n > f.max))
				{
					return T(f.label) + ': ' + T('hmiLnkOutOfRange') + ' [' +
						(f.min != null ? f.min : '-∞') + ', ' + (f.max != null ? f.max : '∞') + ']';
				}

				return null;
			}};
		};

		builders.numOrTag = function(f, v)
		{
			var pk = E.tagPicker(ui, v != null ? String(v) : '', {placeholder: T('hmiLnkNumberOrTag')});
			mark(pk.input, f.key);
			var row = place(f, pk);
			row.appendChild(pk);

			return {rows: [row], get: function()
			{
				var s = trim(pk.input.value);

				return (s !== '' && !isNaN(Number(s))) ? Number(s) : s;
			}, validate: function()
			{
				return (trim(pk.input.value) === '') ? T(f.label) + ': ' + T('hmiLnkRequired') : null;
			}};
		};

		builders.select = function(f, v)
		{
			var select = E.select(f.options, v);
			mark(select, f.key);
			var row = place(f, select);

			if (f.inline == null)
			{
				row.appendChild(select);
			}

			mxEvent.addListener(select, 'change', refresh);

			return {rows: [row], get: function()
			{
				return select.value;
			}};
		};

		builders.bool = function(f, v)
		{
			inlineRow = null;
			var cb = E.checkbox(T(f.label), !!v);
			mark(cb.input, f.key);
			section.appendChild(cb);
			var lbl = cb.querySelector('label');
			var id = 'hmiCb' + (builders.seq = (builders.seq || 0) + 1);
			cb.input.setAttribute('id', id);
			lbl.setAttribute('for', id);
			mxEvent.addListener(cb.input, 'change', refresh);
			addHelp(cb, fkeys(f.key));

			return {rows: [cb], get: function()
			{
				return cb.input.checked;
			}};
		};

		builders.color = function(f, v)
		{
			var ci = E.colorInput(ui, v || '');
			mark(ci.input, f.key);
			var row = place(f, ci);
			row.appendChild(ci);

			return {rows: [row], get: function()
			{
				return ci.getValue();
			}, validate: function()
			{
				var c = ci.getValue();

				if (c === '' && f.optional)
				{
					return null;
				}

				return /^#[0-9A-F]{6}$/i.test(c) ? null : T(f.label) + ': ' + T('hmiLnkColorInvalid');
			}};
		};

		builders.key = function(f, v)
		{
			var row = place(f, null);
			var wrap = document.createElement('span');
			wrap.style.cssText = 'display:flex;flex:1;min-width:0;align-items:center;column-gap:12px;';
			var ctrl = E.checkbox(T('hmiLnkCtrl'), !!(v && v.ctrl));
			var shift = E.checkbox(T('hmiLnkShift'), !!(v && v.shift));
			ctrl.style.minHeight = '0';
			shift.style.minHeight = '0';
			addHelp(ctrl, fkeys('key', 'ctrl'));
			addHelp(shift, fkeys('key', 'shift'));
			var select = E.select(keyChoices(), (v && v.key) || '');
			select.style.flex = '1';
			mark(select, 'key');
			mark(ctrl.input, 'keyCtrl');
			mark(shift.input, 'keyShift');
			wrap.appendChild(ctrl);
			wrap.appendChild(shift);
			wrap.appendChild(select);
			row.appendChild(wrap);

			function sync()
			{
				ctrl.input.disabled = shift.input.disabled = (select.value === '');
			};

			mxEvent.addListener(select, 'change', sync);
			sync();

			return {rows: [row], get: function()
			{
				return (select.value === '') ? null : {key: select.value,
					ctrl: ctrl.input.checked, shift: shift.input.checked};
			}};
		};

		builders.format = function(f, v)
		{
			v = v || DEFAULT_FORMAT;
			inlineRow = null;
			inlineName = null;
			var rows = [];
			var h = document.createElement('div');
			h.className = 'geDialogHint geHmiSubHead';
			mxUtils.write(h, T('hmiLnkAdvancedFormatting'));
			addHelp(h, 'heading.hmiLnkAdvancedFormatting');
			section.appendChild(h);
			rows.push(h);

			var modeRow = E.row(section, T('hmiLnkFormatting') + ':');
			labelHelp(modeRow, fkeys('format', 'mode'));
			var mode = E.select(opts(FORMAT_MODES), v.mode || 'text');
			mark(mode, 'formatMode');
			modeRow.appendChild(mode);
			var clear = E.button(T('hmiLnkClear'), function()
			{
				mode.value = DEFAULT_FORMAT.mode;
				prec.value = DEFAULT_FORMAT.precision;
				from.value = DEFAULT_FORMAT.bitsFrom;
				to.value = DEFAULT_FORMAT.bitsTo;
				fixed.input.checked = false;
				sync();
			});
			clear.style.margin = '0';
			mark(clear, 'formatClear');
			modeRow.appendChild(clear);
			rows.push(modeRow);

			var fixed = E.checkbox(T('hmiLnkFixedWidth'), !!v.fixedWidth);
			addHelp(fixed, fkeys('format', 'fixedWidth'));
			mark(fixed.input, 'formatFixedWidth');
			section.appendChild(fixed);
			rows.push(fixed);

			var inl = E.inlineFields(section);
			var prec = E.numberInput(v.precision != null ? v.precision : 0);
			var from = E.numberInput(v.bitsFrom != null ? v.bitsFrom : 0);
			var to = E.numberInput(v.bitsTo != null ? v.bitsTo : 31);
			[prec, from, to].forEach(function(n)
			{
				n.setAttribute('min', n == prec ? '0' : '0');
				n.setAttribute('max', n == prec ? '8' : '31');
			});
			mark(prec, 'formatPrecision');
			mark(from, 'formatBitsFrom');
			mark(to, 'formatBitsTo');
			labelHelp(E.inlineField(inl, T('hmiLnkPrecision') + ':', prec), fkeys('format', 'precision'));
			labelHelp(E.inlineField(inl, T('hmiLnkBitsFrom') + ':', from), fkeys('format', 'bitsFrom'));
			labelHelp(E.inlineField(inl, T('hmiLnkBitsTo') + ':', to), fkeys('format', 'bitsTo'));
			rows.push(inl);

			function sync()
			{
				var m = mode.value;
				fixed.input.disabled = (m == 'text');

				if (m == 'text')
				{
					fixed.input.checked = false;
				}

				prec.disabled = !(m == 'fixed' || m == 'exponential');
				from.disabled = to.disabled = !(m == 'hex' || m == 'binary');
			};

			mxEvent.addListener(mode, 'change', sync);
			sync();

			function int(el)
			{
				var n = parseInt(el.value, 10);

				return isNaN(n) ? 0 : n;
			};

			return {rows: rows, get: function()
			{
				return {mode: mode.value, precision: int(prec), bitsFrom: int(from),
					bitsTo: int(to), fixedWidth: fixed.input.checked};
			}, validate: function()
			{
				if (!prec.disabled && (int(prec) < 0 || int(prec) > 8))
				{
					return T('hmiLnkPrecision') + ': ' + T('hmiLnkOutOfRange') + ' [0, 8]';
				}

				if (!from.disabled && (int(from) < 0 || int(from) > 31 || int(to) < 0 || int(to) > 31))
				{
					return T('hmiLnkBitsFrom') + ' / ' + T('hmiLnkBitsTo') + ': ' +
						T('hmiLnkOutOfRange') + ' [0, 31]';
				}

				return null;
			}};
		};

		builders.breakpoints = function(f, v)
		{
			inlineRow = null;
			inlineName = null;
			var h = document.createElement('div');
			h.className = 'geDialogHint geHmiSubHead';
			mxUtils.write(h, T('hmiLnkBreakPoints') + ' (' + T('hmiLnkBreakPointsHint') + ')');
			addHelp(h, fkeys('breakpoints'));
			legend(h, [['hmiLnkValue', fkeys('breakpoints', 'value')],
				['hmiLnkColor', fkeys('breakpoints', 'color')]]);
			section.appendChild(h);
			var list = document.createElement('div');
			section.appendChild(list);
			var addBtn = E.button(T('hmiAddItem'), function()
			{
				var last = items.length > 0 ? items[items.length - 1] : null;
				var next = last != null ? (parseFloat(last.value.value) || 0) + 10 : 0;
				addItem(next, '#00C000');
				sync();
			});
			addBtn.style.marginTop = '6px';
			mark(addBtn, 'addBreakpoint');
			section.appendChild(addBtn);
			var items = [];

			function addItem(value, col)
			{
				var row = document.createElement('div');
				row.style.cssText = 'display:flex;align-items:center;column-gap:8px;margin-top:6px;';
				row.setAttribute('data-role', 'breakpoint');
				var num = E.numberInput(value);
				num.setAttribute('step', 'any');
				num.style.cssText = 'width:90px;flex:0 0 90px;';
				mark(num, 'bpValue');
				var ci = E.colorInput(ui, col);
				ci.style.flex = '1';
				mark(ci.input, 'bpColor');
				var del = E.button('✕', function()
				{
					items.splice(items.indexOf(item), 1);
					row.parentNode.removeChild(row);
					sync();
				});
				del.style.cssText = 'margin:0;flex:0 0 34px;width:34px;min-width:0;padding:0;';
				del.setAttribute('title', mxResources.get('delete'));
				var item = {value: num, color: ci, row: row};
				row.appendChild(num);
				row.appendChild(ci);
				row.appendChild(del);
				list.appendChild(row);
				items.push(item);
			};

			function sync()
			{
				addBtn.disabled = (items.length >= 10);
			};

			(v || []).forEach(function(bp)
			{
				addItem(bp.value, bp.color);
			});
			sync();

			return {rows: [h, list, addBtn], get: function()
			{
				return items.map(function(it)
				{
					return {value: parseFloat(it.value.value), color: it.color.getValue()};
				});
			}, validate: function()
			{
				if (items.length == 0)
				{
					return T('hmiLnkBreakPoints') + ': ' + T('hmiLnkNeedBreakPoint');
				}

				if (items.length > 10)
				{
					return T('hmiLnkBreakPoints') + ': ' + T('hmiLnkMaxBreakPoints');
				}

				var prev = null;

				for (var i = 0; i < items.length; i++)
				{
					var n = parseFloat(items[i].value.value);

					if (isNaN(n))
					{
						return T('hmiLnkBreakPoints') + ' ' + (i + 1) + ': ' + T('hmiLnkNumberRequired');
					}

					if (prev != null && n <= prev)
					{
						return T('hmiLnkBreakPoints') + ' ' + (i + 1) + ': ' + T('hmiLnkAscending');
					}

					if (!/^#[0-9A-F]{6}$/i.test(items[i].color.getValue()))
					{
						return T('hmiLnkBreakPoints') + ' ' + (i + 1) + ': ' + T('hmiLnkColorInvalid');
					}

					prev = n;
				}

				return null;
			}};
		};

		builders.alarmColors = function(f, v)
		{
			inlineRow = null;
			inlineName = null;
			var LABELS = {normal: 'hmiLnkNormalColor', lolo: 'hmiLnkLoLo', lo: 'hmiLnkLo',
				hi: 'hmiLnkHi', hihi: 'hmiLnkHiHi', minor: 'hmiLnkMinor', major: 'hmiLnkMajor',
				roc: 'hmiLnkRocColor'};
			var KEYS = {value: ['normal', 'lolo', 'lo', 'hi', 'hihi'],
				deviation: ['normal', 'minor', 'major'], roc: ['normal', 'roc']};
			var DEFAULTS = {normal: '#00C000', lolo: '#FF0000', lo: '#FFA500', hi: '#FFA500',
				hihi: '#FF0000', minor: '#FFD000', major: '#FF0000', roc: '#FF0000'};
			var store = {};
			var inputs = {};
			var holder = document.createElement('div');
			holder.style.marginTop = '6px';
			section.appendChild(holder);
			var current = null;
			var w = {rows: [holder]};

			for (var k in DEFAULTS)
			{
				store[k] = (v != null && v[k]) ? v[k] : DEFAULTS[k];
			}

			function render(type)
			{
				for (var key in inputs)
				{
					store[key] = inputs[key].getValue() || store[key];
				}

				holder.innerHTML = '';
				inputs = {};
				current = type;
				var keys = KEYS[type] || KEYS.value;

				for (var i = 0; i < keys.length; i++)
				{
					var row = E.row(holder, T(LABELS[keys[i]]) + ':');
					labelHelp(row, fkeys('colors', keys[i]));
					row.style.marginTop = i > 0 ? '6px' : '0';
					var ci = E.colorInput(ui, store[keys[i]]);
					mark(ci.input, 'color_' + keys[i]);
					row.appendChild(ci);
					inputs[keys[i]] = ci;
				}
			};

			w.update = function(vals)
			{
				if (vals.alarmType != current)
				{
					render(vals.alarmType);
				}
			};
			w.get = function()
			{
				var o = {};

				for (var key in inputs)
				{
					o[key] = inputs[key].getValue();
				}

				return o;
			};
			w.validate = function()
			{
				for (var key in inputs)
				{
					if (!/^#[0-9A-F]{6}$/i.test(inputs[key].getValue()))
					{
						return T(LABELS[key]) + ': ' + T('hmiLnkColorInvalid');
					}
				}

				return null;
			};

			return w;
		};

		builders.scripts = function(f, v)
		{
			inlineRow = null;
			inlineName = null;
			var holder = document.createElement('div');
			section.appendChild(holder);
			var items = [];
			var addBtn = E.button(T('hmiLnkAddScript'), function()
			{
				addScript({condition: 'onLeftDown', script: ''});
			});
			addBtn.style.marginTop = '8px';
			mark(addBtn, 'addScript');
			section.appendChild(addBtn);

			function addScript(s)
			{
				var card = document.createElement('div');
				card.className = 'geHmiCard';
				card.setAttribute('data-role', 'script');
				var top = document.createElement('div');
				top.style.cssText = 'display:flex;align-items:center;column-gap:8px;margin-bottom:6px;';
				var cond = E.select(CONDITIONS.map(function(c)
				{
					return {value: c, label: T('hmiLnkCond_' + c)};
				}), s.condition || 'onLeftDown');
				cond.style.cssText = 'flex:1;min-width:0;';
				mark(cond, 'condition');
				var perLbl = document.createElement('span');
				perLbl.className = 'geDialogHint';
				mxUtils.write(perLbl, T('hmiLnkEvery'));
				var period = E.numberInput(s.period != null ? s.period : 500);
				period.style.cssText = 'width:70px;flex:0 0 70px;';
				mark(period, 'period');
				var ms = document.createElement('span');
				ms.className = 'geDialogHint';
				mxUtils.write(ms, 'ms');
				var del = E.button('✕', function()
				{
					items.splice(items.indexOf(item), 1);
					card.parentNode.removeChild(card);
				});
				del.style.cssText = 'margin:0;flex:0 0 34px;width:34px;min-width:0;padding:0;';
				del.setAttribute('title', mxResources.get('delete'));
				top.appendChild(cond);
				addHelp(top, fkeys('scripts', 'condition'));
				top.appendChild(perLbl);
				addHelp(perLbl, fkeys('scripts', 'period'));
				top.appendChild(period);
				top.appendChild(ms);
				top.appendChild(del);
				card.appendChild(top);

				var sb = scriptBox(E, s.script || '', 7, fkeys('scripts', 'script'));
				var area = sb.area;
				card.appendChild(sb.el);

				var item = {cond: cond, period: period, area: area};
				items.push(item);
				holder.appendChild(card);

				function sync()
				{
					var isWhile = cond.value.indexOf('while') == 0;
					perLbl.style.display = period.style.display = ms.style.display = isWhile ? '' : 'none';
				};

				mxEvent.addListener(cond, 'change', sync);
				sync();
			};

			(v || [{condition: 'onLeftDown', script: ''}]).forEach(addScript);

			return {rows: [holder, addBtn], get: function()
			{
				return items.map(function(it)
				{
					var o = {condition: it.cond.value};

					if (it.cond.value.indexOf('while') == 0)
					{
						o.period = parseInt(it.period.value, 10) || 500;
					}

					o.script = it.area.value;

					return o;
				});
			}, validate: function()
			{
				if (items.length == 0)
				{
					return T('hmiLnkNeedScript');
				}

				for (var i = 0; i < items.length; i++)
				{
					var it = items[i];

					if (trim(it.area.value) === '')
					{
						return T('hmiLnkScript') + ' ' + (i + 1) + ': ' + T('hmiLnkRequired');
					}

					if (it.cond.value.indexOf('while') == 0)
					{
						var p = parseInt(it.period.value, 10);

						if (isNaN(p) || p < 10)
						{
							return T('hmiLnkScript') + ' ' + (i + 1) + ': ' + T('hmiLnkPeriodMin');
						}
					}

					var err = checkScript(it.area.value);

					if (err != null)
					{
						return T('hmiLnkScript') + ' ' + (i + 1) + ': ' + err;
					}
				}

				return null;
			}};
		};

		builders.windows = function(f, v)
		{
			inlineRow = null;
			inlineName = null;
			var graph = ui.editor.graph;
			var pages = (ui.pages != null && ui.pages.length > 0) ? ui.pages : [ui.currentPage];
			var chosen = {};
			(v || []).forEach(function(n)
			{
				chosen[n] = true;
			});
			var h = document.createElement('div');
			h.className = 'geDialogHint geHmiSubHead';
			mxUtils.write(h, T('hmiLnkWindows'));
			addHelp(h, fkeys('windows'));
			section.appendChild(h);
			var list = document.createElement('div');
			list.className = 'geHmiPick';
			list.style.maxHeight = '160px';
			section.appendChild(list);
			var cbs = [];

			function pageWindow(page)
			{
				try
				{
					if (page == ui.currentPage)
					{
						return Hmi.Model.getDocConfig(graph).window || {};
					}

					if (page.root == null && ui.updatePageRoot != null)
					{
						ui.updatePageRoot(page);
					}

					return (page.root != null && Hmi.Model.hasDocConfig(page.root)) ?
						(Hmi.Model.getDocConfigForRoot(page.root).window || {}) : {};
				}
				catch (e)
				{
					return {};
				}
			};

			var current = clone(pageWindow(ui.currentPage)) || {};

			pages.forEach(function(page, i)
			{
				var name = (page != null && page.getName != null) ? page.getName() : '';
				var row = document.createElement('div');
				row.className = 'geDialogCheckRow geHmiPickRow';
				row.style.cursor = 'default';
				var cb = document.createElement('input');
				cb.setAttribute('type', 'checkbox');
				cb.id = 'hmiWin' + i + '_' + Date.now();
				cb.checked = !!(chosen[name] || (page.getId != null && chosen[page.getId()]));
				mark(cb, 'window');
				cb.setAttribute('data-page', name);
				var lbl = document.createElement('label');
				lbl.setAttribute('for', cb.id);
				lbl.style.flex = '1';
				mxUtils.write(lbl, name);
				var type = document.createElement('span');
				type.className = 'geDialogHint';
				var win = (page == ui.currentPage) ? current : pageWindow(page);
				type.textContent = T('hmiLnkWin_' + (win.type || 'replace')) +
					((page == ui.currentPage) ? ' (' + T('hmiLnkCurrentPage') + ')' : '');
				row.appendChild(cb);
				row.appendChild(lbl);
				row.appendChild(type);
				list.appendChild(row);
				cbs.push({cb: cb, name: name, type: type});
			});

			// Window settings of the current page (undoable edit with the links)
			var wh = document.createElement('div');
			wh.className = 'geDialogHint geHmiSubHead';
			mxUtils.write(wh, T('hmiLnkWindowSettings').replace('{1}', ui.currentPage != null ?
				ui.currentPage.getName() : ''));
			addHelp(wh, fkeys('windows', 'settings'));
			section.appendChild(wh);
			var typeRow = E.row(section, T('hmiLnkWindowType') + ':');
			labelHelp(typeRow, fkeys('windows', 'type'));
			var typeSel = E.select(opts([['replace', 'hmiLnkWin_replace'],
				['overlay', 'hmiLnkWin_overlay'], ['popup', 'hmiLnkWin_popup']]), current.type || 'replace');
			mark(typeSel, 'windowType');
			typeRow.appendChild(typeSel);
			var geo1 = E.inlineFields(section);
			var wx = E.numberInput(current.x != null ? current.x : '');
			var wy = E.numberInput(current.y != null ? current.y : '');
			mark(wx, 'windowX');
			mark(wy, 'windowY');
			labelHelp(E.inlineField(geo1, 'X:', wx), fkeys('windows', 'x'));
			labelHelp(E.inlineField(geo1, 'Y:', wy), fkeys('windows', 'y'));
			var geo2 = E.inlineFields(section);
			var ww = E.numberInput(current.width != null ? current.width : '');
			var wht = E.numberInput(current.height != null ? current.height : '');
			mark(ww, 'windowWidth');
			mark(wht, 'windowHeight');
			labelHelp(E.inlineField(geo2, T('width') + ':', ww), fkeys('windows', 'width'));
			labelHelp(E.inlineField(geo2, T('height') + ':', wht), fkeys('windows', 'height'));
			var titleRow = E.row(section, T('hmiLnkWindowTitle') + ':');
			labelHelp(titleRow, fkeys('windows', 'title'));
			var wtitle = E.textInput(current.title || '');
			mark(wtitle, 'windowTitle');
			titleRow.appendChild(wtitle);
			var note = document.createElement('div');
			note.className = 'geDialogHint';
			note.style.marginTop = '6px';
			mxUtils.write(note, T('hmiLnkWindowOtherPages'));
			section.appendChild(note);

			function currentWindow()
			{
				var o = clone(current) || {};
				o.type = typeSel.value;

				[['x', wx], ['y', wy], ['width', ww], ['height', wht]].forEach(function(p)
				{
					var n = parseFloat(p[1].value);

					if (isNaN(n))
					{
						delete o[p[0]];
					}
					else
					{
						o[p[0]] = n;
					}
				});

				if (wtitle.value !== '')
				{
					o.title = wtitle.value;
				}
				else
				{
					delete o.title;
				}

				return o;
			};

			function sync()
			{
				var geoOn = (typeSel.value != 'replace');
				[wx, wy, ww, wht, wtitle].forEach(function(el)
				{
					el.disabled = !geoOn;
				});
			};

			mxEvent.addListener(typeSel, 'change', sync);
			sync();

			return {rows: [h, list, wh, typeRow, note], get: function()
			{
				var names = [];

				for (var i = 0; i < cbs.length; i++)
				{
					if (cbs[i].cb.checked)
					{
						names.push(cbs[i].name);
					}
				}

				return names;
			}, validate: function()
			{
				var any = false;

				for (var i = 0; i < cbs.length; i++)
				{
					any = any || cbs[i].cb.checked;
				}

				return any ? null : T('hmiLnkNeedWindow');
			}, extras: function()
			{
				var o = currentWindow();
				var before = JSON.stringify(pageWindow(ui.currentPage) || {});

				return (JSON.stringify(o) != before && !(before == '{}' && o.type == 'replace' &&
					Object.keys(o).length == 1)) ? {page: ui.currentPage, window: o} : null;
			}};
		};

		builders.script = function(f, v)
		{
			inlineRow = null;
			inlineName = null;
			var h = document.createElement('div');
			h.className = 'geDialogHint geHmiSubHead';
			mxUtils.write(h, T(f.label));
			addHelp(h, fkeys(f.key));
			section.appendChild(h);
			var sb = scriptBox(E, v || '', f.rows || 4);
			mark(sb.area, f.key);
			section.appendChild(sb.el);

			return {rows: [h, sb.el], get: function()
			{
				return sb.area.value;
			}, validate: function()
			{
				if (trim(sb.area.value) === '')
				{
					return f.optional ? null : T(f.label) + ': ' + T('hmiLnkRequired');
				}

				var err = checkScript(sb.area.value);

				return (err != null) ? T(f.label) + ': ' + err : null;
			}};
		};

		builders.valueText = function(f, v)
		{
			var input = E.textInput(v != null ? String(v) : '');
			mark(input, f.key);
			var row = place(f, input);
			row.appendChild(input);

			return {rows: [row], get: function()
			{
				return textValue(input.value);
			}, validate: function()
			{
				return (trim(input.value) === '') ? T(f.label) + ': ' + T('hmiLnkRequired') : null;
			}};
		};

		builders.roles = function(f, v)
		{
			var input = E.textInput((v || []).join(', '), T('hmiLnkRolesHint'));
			mark(input, f.key);
			var row = place(f, input);
			row.appendChild(input);

			return {rows: [row], get: function()
			{
				return input.value.split(',').map(trim).filter(function(r)
				{
					return r !== '';
				});
			}};
		};

		builders.states = function(f, v)
		{
			inlineRow = null;
			inlineName = null;

			return listEditor(E, section, {label: f.label, helpKeys: fkeys('states'),
				role: 'state', addKey: 'addState',
				addLabel: 'hmiLnkAddState', items: v || [], tall: true, emptyKey: 'hmiLnkNeedState',
				blank: function()
				{
					return {match: ''};
				}, build: function(content, s)
				{
					var r1 = cardRow(content);
					var match = E.textInput(s.match != null ? String(s.match) : '', T('hmiLnkMatchHint'));
					mark(match, 'stMatch');
					labelHelp(E.inlineField(r1, T('hmiLnkMatch') + ':', match), fkeys('states', 'match'));
					var label = E.textInput(s.label || '');
					mark(label, 'stLabel');
					labelHelp(E.inlineField(r1, T('hmiLnkLabel') + ':', label), fkeys('states', 'label'));

					var r2 = cardRow(content);
					var cols = {};
					[['fillColor', 'hmiLnkFillColor'], ['lineColor', 'hmiLnkLineColor'],
						['textColor', 'hmiLnkTextColor']].forEach(function(c)
					{
						cols[c[0]] = E.colorInput(ui, s[c[0]] || '');
						mark(cols[c[0]].input, 'st_' + c[0]);
						labelHelp(E.inlineField(r2, T(c[1]) + ':', cols[c[0]]), fkeys('states', c[0]));
					});

					var r3 = cardRow(content);
					var image = E.textInput(s.image || '');
					mark(image, 'stImage');
					labelHelp(E.inlineField(r3, T('hmiLnkImage') + ':', image), fkeys('states', 'image'));
					var op = E.numberInput(s.opacity != null ? s.opacity : '');
					op.setAttribute('step', 'any');
					op.style.maxWidth = '70px';
					mark(op, 'stOpacity');
					labelHelp(E.inlineField(r3, T('hmiLnkOpacity') + ':', op), fkeys('states', 'opacity'));

					var r4 = cardRow(content);
					var vis = E.select([{value: '', label: T('hmiLnkKeep')},
						{value: 'true', label: T('hmiLnkVisible')},
						{value: 'false', label: T('hmiLnkHidden')}],
						s.visible === true ? 'true' : (s.visible === false ? 'false' : ''));
					mark(vis, 'stVisible');
					labelHelp(E.inlineField(r4, T('hmiLnkVisibility') + ':', vis), fkeys('states', 'visible'));
					var blink = E.checkbox(T('hmiLnkBlink'), s.blink === true);
					blink.style.minHeight = '0';
					mark(blink.input, 'stBlink');
					addHelp(blink, fkeys('states', 'blink'));
					E.inlineField(r4, null, blink);

					// Align the label columns of the four rows
					[r1, r2, r3, r4].forEach(function(r)
					{
						var l = r.children[0].querySelector('.geDialogFormLabel');
						l.style.minWidth = '96px';
					});
					[r1, r3].forEach(function(r)
					{
						r.children[1].querySelector('.geDialogFormLabel').style.minWidth = '76px';
					});

					return {get: function()
					{
						var o = {match: trim(match.value)};

						['fillColor', 'lineColor', 'textColor'].forEach(function(k)
						{
							if (cols[k].getValue() !== '')
							{
								o[k] = cols[k].getValue();
							}
						});

						if (label.value !== '')
						{
							o.label = label.value;
						}

						if (trim(image.value) !== '')
						{
							o.image = trim(image.value);
						}

						var n = parseFloat(op.value);

						if (!isNaN(n))
						{
							o.opacity = n;
						}

						if (vis.value !== '')
						{
							o.visible = (vis.value == 'true');
						}

						if (blink.input.checked)
						{
							o.blink = true;
						}

						return o;
					}, validate: function()
					{
						if (trim(match.value) === '')
						{
							return T('hmiLnkMatch') + ': ' + T('hmiLnkRequired');
						}

						for (var k in cols)
						{
							var c = cols[k].getValue();

							if (c !== '' && !isColor(c))
							{
								return T('hmiLnk' + k.charAt(0).toUpperCase() + k.substring(1)) +
									': ' + T('hmiLnkColorInvalid');
							}
						}

						var n = parseFloat(op.value);

						if (op.value !== '' && (isNaN(n) || n < 0 || n > 100))
						{
							return T('hmiLnkOpacity') + ': ' + T('hmiLnkOutOfRange') + ' [0, 100]';
						}

						return null;
					}};
				}});
		};

		builders.propItems = function(f, v)
		{
			inlineRow = null;
			inlineName = null;

			return listEditor(E, section, {label: f.label, helpKeys: fkeys('items'),
				legend: [['hmiLnkTarget', fkeys('items', 'target')],
				['hmiLnkExpression', fkeys('items', 'expr')]], role: 'property', addKey: 'addProperty',
				addLabel: 'hmiLnkAddProperty', items: v || [], emptyKey: 'hmiLnkNeedProperty',
				blank: function()
				{
					return {target: '', expr: ''};
				}, build: function(content, it)
				{
					var top = document.createElement('div');
					top.style.cssText = 'display:flex;align-items:center;column-gap:8px;';
					var choices = [{value: '', label: T('hmiLnkCommonTargets')}];
					var known = false;
					PROP_TARGETS.forEach(function(t)
					{
						choices.push({value: t, label: t});
						known = known || (t == it.target);
					});
					var pick = E.select(choices, known ? it.target : '');
					pick.style.cssText = 'flex:0 0 150px;width:150px;min-width:0;';
					mark(pick, 'propPick');
					var target = E.textInput(it.target || '', T('hmiLnkTargetHint'));
					target.style.cssText = 'flex:1;min-width:0;';
					mark(target, 'propTarget');
					top.appendChild(pick);
					top.appendChild(target);
					content.appendChild(top);
					mxEvent.addListener(pick, 'change', function()
					{
						if (pick.value !== '')
						{
							target.value = pick.value;
							target.focus();
							target.dispatchEvent(new Event('input', {bubbles: true}));
						}
					});

					var ex = E.tagPicker(ui, it.expr || '', {expression: true,
						placeholder: T('hmiLnkExprHint')});
					mark(ex.input, 'propExpr');
					ex.style.cssText = 'display:flex;margin-top:6px;';
					content.appendChild(ex);

					return {get: function()
					{
						return {target: trim(target.value), expr: trim(ex.input.value)};
					}, validate: function()
					{
						if (trim(target.value) === '')
						{
							return T('hmiLnkTarget') + ': ' + T('hmiLnkRequired');
						}

						if (!/^(style:.+|attr:.+|prop:.+|label|tooltip|visible)$/.test(trim(target.value)))
						{
							return T('hmiLnkTarget') + ': ' + T('hmiLnkTargetInvalid');
						}

						if (trim(ex.input.value) === '')
						{
							return T('hmiLnkExpression') + ': ' + T('hmiLnkRequired');
						}

						try
						{
							compileExpr(trim(ex.input.value));
						}
						catch (e)
						{
							return T('hmiLnkExpression') + ': ' + e.message;
						}

						return null;
					}};
				}});
		};

		builders.series = function(f, v)
		{
			inlineRow = null;
			inlineName = null;

			return listEditor(E, section, {label: f.label, helpKeys: fkeys('series'),
				legend: [['hmiLnkTagname', fkeys('series', 'tag')], ['hmiLnkSeriesName', fkeys('series', 'name')],
				['hmiLnkMaxPoints', fkeys('series', 'maxPoints')]], role: 'series', addKey: 'addSeries',
				addLabel: 'hmiLnkAddSeries', items: v || [],
				blank: function()
				{
					return {tag: '', name: '', maxPoints: 600};
				}, build: function(content, it)
				{
					var line = document.createElement('div');
					line.style.cssText = 'display:flex;align-items:center;column-gap:8px;';
					var tag = E.tagPicker(ui, it.tag || '');
					mark(tag.input, 'seriesTag');
					var name = E.textInput(it.name || '', T('hmiLnkSeriesName'));
					name.style.cssText = 'flex:0 0 110px;width:110px;min-width:0;';
					mark(name, 'seriesName');
					var max = E.numberInput(it.maxPoints != null ? it.maxPoints : 600);
					max.setAttribute('title', T('hmiLnkMaxPoints'));
					max.setAttribute('min', '1');
					max.style.cssText = 'flex:0 0 76px;width:76px;min-width:0;';
					mark(max, 'seriesMax');
					line.appendChild(tag);
					line.appendChild(name);
					line.appendChild(max);
					content.appendChild(line);

					return {get: function()
					{
						var o = {tag: trim(tag.input.value)};

						if (trim(name.value) !== '')
						{
							o.name = trim(name.value);
						}

						var n = parseInt(max.value, 10);
						o.maxPoints = isNaN(n) ? 600 : n;

						return o;
					}, validate: function()
					{
						if (trim(tag.input.value) === '')
						{
							return T('hmiLnkTagname') + ': ' + T('hmiLnkRequired');
						}

						var n = parseInt(max.value, 10);

						return (max.value !== '' && (isNaN(n) || n < 1)) ?
							T('hmiLnkMaxPoints') + ': ' + T('hmiLnkOutOfRange') + ' [1, ∞]' : null;
					}};
				}});
		};

		builders.choices = function(f, v)
		{
			inlineRow = null;
			inlineName = null;

			return listEditor(E, section, {label: f.label, helpKeys: fkeys('options'),
				legend: [['hmiLnkLabel', fkeys('options', 'label')], ['hmiLnkValue', fkeys('options', 'value')]],
				role: 'choice', addKey: 'addChoice',
				addLabel: 'hmiLnkAddChoice', items: v || [], emptyKey: 'hmiLnkNeedChoice',
				blank: function()
				{
					return {label: '', value: ''};
				}, build: function(content, it)
				{
					var line = document.createElement('div');
					line.style.cssText = 'display:flex;align-items:center;column-gap:8px;';
					var label = E.textInput(it.label != null ? String(it.label) : '', T('hmiLnkLabel'));
					label.style.cssText = 'flex:1;min-width:0;';
					mark(label, 'choiceLabel');
					var value = E.textInput(it.value != null ? String(it.value) : '', T('hmiLnkValue'));
					value.style.cssText = 'flex:1;min-width:0;';
					mark(value, 'choiceValue');
					line.appendChild(label);
					line.appendChild(value);
					content.appendChild(line);

					return {get: function()
					{
						return {label: label.value, value: textValue(value.value)};
					}, validate: function()
					{
						if (trim(label.value) === '')
						{
							return T('hmiLnkLabel') + ': ' + T('hmiLnkRequired');
						}

						return (trim(value.value) === '') ? T('hmiLnkValue') + ': ' + T('hmiLnkRequired') : null;
					}};
				}});
		};

		builders.commands = function(f, v)
		{
			inlineRow = null;
			inlineName = null;

			return listEditor(E, section, {label: f.label, helpKeys: fkeys('commands'),
				legend: [['hmiLnkColObject', fkeys('commands', 'object')],
				['hmiLnkColCommand', fkeys('commands', 'command')],
				['hmiLnkColAnimation', fkeys('commands', 'animation')]],
				role: 'command', addKey: 'addCommand',
				addLabel: 'hmiLnkAddCommand', items: v || [], emptyKey: 'hmiLnkNeedCommand',
				blank: function()
				{
					return {object: '', command: 'startAnimation'};
				}, build: function(content, it)
				{
					var line = document.createElement('div');
					line.style.cssText = 'display:flex;align-items:center;column-gap:8px;';
					var obj = E.textInput(it.object || '', T('hmiLnkObjectHint'));
					obj.style.cssText = 'flex:1 1 120px;min-width:0;';
					mark(obj, 'cmdObject');
					var cmd = E.select(CONTROL_COMMANDS.map(function(c)
					{
						return {value: c, label: T('hmiLnkCmd_' + c)};
					}), it.command || 'startAnimation');
					cmd.style.cssText = 'flex:0 0 170px;width:170px;min-width:0;';
					mark(cmd, 'cmdCommand');
					var anim = E.textInput(it.animation || '', T('hmiLnkAnimName'));
					anim.style.cssText = 'flex:1 1 110px;min-width:0;';
					mark(anim, 'cmdAnimation');
					line.appendChild(obj);
					line.appendChild(cmd);
					line.appendChild(anim);
					content.appendChild(line);

					function sync()
					{
						anim.disabled = (cmd.value.indexOf('Animation') < 0);
					};

					mxEvent.addListener(cmd, 'change', sync);
					sync();

					return {get: function()
					{
						var o = {object: trim(obj.value), command: cmd.value};

						if (!anim.disabled && trim(anim.value) !== '')
						{
							o.animation = trim(anim.value);
						}

						return o;
					}, validate: function()
					{
						return null;
					}};
				}});
		};

		for (var i = 0; i < spec.fields.length; i++)
		{
			var f = spec.fields[i];
			var init = (value[f.key] !== undefined) ? value[f.key] : clone(f.def);
			var w = builders[f.type](f, init);
			w.field = f;
			w.shown = true;
			widgets.push(w);
		}

		function fit()
		{
			E.fitDialog(container);
		};

		mxEvent.addListener(container, 'input', refresh);
		mxEvent.addListener(container, 'change', function()
		{
			refresh();
			fit();
		});
		mxEvent.addListener(container, 'click', function(evt)
		{
			// Adding or removing rows (break points, scripts) changes the height
			if (mxEvent.getSource(evt).tagName == 'BUTTON' || mxEvent.getSource(evt).tagName == 'INPUT')
			{
				window.setTimeout(fit, 0);
			}
		});
		refresh();

		form.validate = function()
		{
			for (var i = 0; i < widgets.length; i++)
			{
				if (widgets[i].shown && widgets[i].validate != null)
				{
					var err = widgets[i].validate();

					if (err != null)
					{
						return err;
					}
				}
			}

			return LinksDialog.validateLink(spec, form.getValue());
		};

		form.getValue = function()
		{
			var o = {};

			for (var k in spec.fixed)
			{
				o[k] = spec.fixed[k];
			}

			for (var i = 0; i < widgets.length; i++)
			{
				var w = widgets[i];

				if (w.field.key != null && w.get != null && w.shown)
				{
					var v = w.get();

					if (v !== undefined && !(w.field.optional && v === ''))
					{
						o[w.field.key] = v;
					}
				}
			}

			return o;
		};

		form.getExtras = function()
		{
			var out = {};

			for (var i = 0; i < widgets.length; i++)
			{
				if (widgets[i].extras != null)
				{
					var e = widgets[i].extras();

					if (e != null)
					{
						out.windowEdit = e;
					}
				}
			}

			return out;
		};

		return form;
	};

	function checkScript(src)
	{
		if (Hmi.QuickScript == null || Hmi.QuickScript.compile == null)
		{
			return null;
		}

		try
		{
			Hmi.QuickScript.compile(src);
		}
		catch (e)
		{
			return (e.line != null && String(e.message).indexOf(String(e.line)) < 0 ?
				T('hmiLnkLine') + ' ' + e.line + ': ' : '') + e.message;
		}

		return null;
	};

	/**
	 * Cross-field validation of a single link value. Returns an error
	 * string or null.
	 */
	LinksDialog.validateLink = function(spec, v)
	{
		if (spec.id == 'inputAnalog' && typeof v.min === 'number' && typeof v.max === 'number' &&
			v.max <= v.min)
		{
			return T('hmiLnkMaximum') + ': ' + T('hmiLnkMaxGreaterMin');
		}

		if (spec.id == 'tooltip' && v.mode == 'static' && (v.text == null || trim(v.text) === ''))
		{
			return T('hmiLnkTooltipText') + ': ' + T('hmiLnkRequired');
		}

		if (spec.id == 'tooltip' && v.mode == 'expression' && trim(v.expr) === '')
		{
			return T('hmiLnkExpression') + ': ' + T('hmiLnkRequired');
		}

		if (spec.id == 'inputString' && v.echo == 'password' && (v.passwordChar == null ||
			v.passwordChar === ''))
		{
			return T('hmiLnkPasswordChar') + ': ' + T('hmiLnkRequired');
		}

		if (spec.id == 'pushValue' && (v.action == 'add' || v.action == 'subtract') &&
			typeof v.value !== 'number')
		{
			return T('hmiLnkValue') + ': ' + T('hmiLnkNumberRequired');
		}

		if (spec.id == 'pushValue' && typeof v.min === 'number' && typeof v.max === 'number' &&
			v.max <= v.min)
		{
			return T('hmiLnkMaximum') + ': ' + T('hmiLnkMaxGreaterMin');
		}

		if (spec.id == 'openUrl' && LinksDialog.urlError(v.url) != null)
		{
			return T('hmiLnkUrl') + ': ' + T(LinksDialog.urlError(v.url));
		}

		if (spec.id == 'animation' && v.preset == 'custom' && trim(v.name) === '')
		{
			return T('hmiLnkAnimName') + ': ' + T('hmiLnkRequired');
		}

		if (spec.id == 'widgetData' && trim(v.expr) === '' && (v.series || []).length == 0)
		{
			return T('hmiLnkNeedWidgetData');
		}

		if (spec.id == 'condition' && ['onTrue', 'onFalse', 'whileTrue', 'whileFalse'].every(function(k)
		{
			return trim(v[k]) === '';
		}))
		{
			return T('hmiLnkNeedConditionScript');
		}

		if (Hmi.Schema != null && Hmi.Schema.validate != null && LinksDialog.schemaSupportsLinks())
		{
			var holder = {};
			var top = spec.id.split(':')[0];
			holder[top] = v;
			var errs = Hmi.Schema.validate('links', holder);

			if (errs != null && errs.length > 0)
			{
				return errs.join('; ');
			}
		}

		return null;
	};

	/**
	 * Returns a resource key describing why an openUrl link target is not
	 * allowed (empty, or a scheme other than http/https), else null.
	 * Relative URLs and ${var} placeholders at the start are accepted.
	 */
	LinksDialog.urlError = function(url)
	{
		var u = trim(url);

		if (u === '')
		{
			return 'hmiLnkRequired';
		}

		var m = /^([a-z][a-z0-9+.\-]*):/i.exec(u.replace(/[\u0000-\u0020]/g, ''));

		return (m != null && m[1].toLowerCase() != 'http' && m[1].toLowerCase() != 'https') ?
			'hmiLnkUrlScheme' : null;
	};

	var schemaChecked = null;

	/**
	 * True once Hmi.Schema knows the 'links' kind.
	 */
	LinksDialog.schemaSupportsLinks = function()
	{
		if (schemaChecked == null || !schemaChecked)
		{
			try
			{
				schemaChecked = !!(Hmi.Schema != null && Hmi.Schema.validate != null &&
					Hmi.Schema.validate('links', {}).join(' ').indexOf('unknown schema kind') < 0);
			}
			catch (e)
			{
				schemaChecked = false;
			}
		}

		return schemaChecked;
	};

	/**
	 * Applies Hmi.Schema defaults when available.
	 */
	LinksDialog.withDefaults = function(links)
	{
		if (LinksDialog.schemaSupportsLinks() && Hmi.Schema.defaults != null)
		{
			try
			{
				return Hmi.Schema.defaults('links', links) || links;
			}
			catch (e)
			{
				return links;
			}
		}

		return links;
	};

	/**
	 * Returns the default value of a link spec.
	 */
	LinksDialog.defaultsOf = function(id)
	{
		var spec = SPECS[id];
		var o = {};

		for (var k in spec.fixed)
		{
			o[k] = spec.fixed[k];
		}

		for (var i = 0; i < spec.fields.length; i++)
		{
			var f = spec.fields[i];

			if (f.key != null && f.def !== undefined && f.def !== '' && f.def !== null)
			{
				o[f.key] = clone(f.def);
			}
		}

		return o;
	};

	/**
	 * Opens the settings dialog of one link. onSave(value, extras) is
	 * called after validation; onCancel() when the dialog is cancelled.
	 */
	LinksDialog.configure = function(ui, id, value, onSave, onCancel)
	{
		var spec = SPECS[id];
		var form = buildForm(ui, spec, value);
		var div = document.createElement('div');
		var hd = document.createElement('h3');
		mxUtils.write(hd, spec.title);
		addHelp(hd, 'link.' + id);
		div.appendChild(hd);
		div.appendChild(form.el);

		var saved = false;
		var dlg = new CustomDialog(ui, div, function()
		{
			var err = form.validate();

			if (err != null)
			{
				return err;
			}

			saved = true;
			onSave(form.getValue(), form.getExtras());
		}, function()
		{
			if (onCancel != null)
			{
				onCancel();
			}
		}, mxResources.get('ok'), null, null, false, null, true);
		ui.showDialog(dlg.container, spec.width, null, true, true, function()
		{
			if (!saved && onCancel != null)
			{
				onCancel();
			}
		});
		div.setAttribute('data-dialog', 'link-' + id);

		return dlg;
	};

	// ---------------------------------------------------------------
	// Summary
	// ---------------------------------------------------------------

	function shorten(s, n)
	{
		s = trim(s);

		return (s.length > n) ? s.substring(0, n - 1) + '…' : s;
	};

	/**
	 * Returns one human-readable line per configured link, e.g.
	 * "Fill Color: Analog (TankLevel, 4 break points)".
	 */
	function summaryEntries(links)
	{
		var out = [];

		if (links == null)
		{
			return out;
		}

		var labels = {valueDiscrete: ['hmiLnkValueDisplay', 'hmiLnkDiscrete'],
			valueAnalog: ['hmiLnkValueDisplay', 'hmiLnkAnalog'],
			valueString: ['hmiLnkValueDisplay', 'hmiLnkString'],
			locationH: ['hmiLnkLocation', 'hmiLnkHorizontal'],
			locationV: ['hmiLnkLocation', 'hmiLnkVertical'],
			sizeHeight: ['hmiLnkObjectSize', 'hmiLnkHeight'],
			sizeWidth: ['hmiLnkObjectSize', 'hmiLnkWidth'],
			sizeScale: ['hmiLnkObjectSize', 'hmiLnkScale'],
			fillVertical: ['hmiLnkPercentFill', 'hmiLnkVertical'],
			fillHorizontal: ['hmiLnkPercentFill', 'hmiLnkHorizontal'],
			visibility: ['hmiLnkMiscellaneous', 'hmiLnkVisibility'],
			blink: ['hmiLnkMiscellaneous', 'hmiLnkBlink'],
			orientation: ['hmiLnkMiscellaneous', 'hmiLnkOrientation'],
			disable: ['hmiLnkMiscellaneous', 'hmiLnkDisable'],
			tooltip: ['hmiLnkMiscellaneous', 'hmiLnkTooltip'],
			inputDiscrete: ['hmiLnkUserInputs', 'hmiLnkDiscrete'],
			inputAnalog: ['hmiLnkUserInputs', 'hmiLnkAnalog'],
			inputString: ['hmiLnkUserInputs', 'hmiLnkString'],
			sliderV: ['hmiLnkSliders', 'hmiLnkVertical'],
			sliderH: ['hmiLnkSliders', 'hmiLnkHorizontal'],
			pushDiscrete: ['hmiLnkTouchPushbuttons', 'hmiLnkDiscreteValue'],
			pushAction: ['hmiLnkTouchPushbuttons', 'hmiLnkAction'],
			showWindow: ['hmiLnkTouchPushbuttons', 'hmiLnkShowWindow'],
			hideWindow: ['hmiLnkTouchPushbuttons', 'hmiLnkHideWindow'],
			opacity: ['hmiLnkMiscellaneous', 'hmiLnkOpacity'],
			alarmMarker: ['hmiLnkMiscellaneous', 'hmiLnkAlarmMarker'],
			smooth: ['hmiLnkAnimationGroup', 'hmiLnkSmooth'],
			states: ['hmiLnkStatesProps', 'hmiLnkMultiState'],
			properties: ['hmiLnkStatesProps', 'hmiLnkProperties'],
			widgetData: ['hmiLnkStatesProps', 'hmiLnkWidgetData'],
			animation: ['hmiLnkAnimationGroup', 'hmiLnkAnimation'],
			flow: ['hmiLnkAnimationGroup', 'hmiLnkFlow'],
			media: ['hmiLnkAnimationGroup', 'hmiLnkMedia'],
			inputChoice: ['hmiLnkUserInputs', 'hmiLnkChoice'],
			pushValue: ['hmiLnkTouchPushbuttons', 'hmiLnkAnalogStringValue'],
			openUrl: ['hmiLnkActions', 'hmiLnkOpenUrl'],
			sendMessage: ['hmiLnkActions', 'hmiLnkSendMessage'],
			control: ['hmiLnkActions', 'hmiLnkControl'],
			touchOptions: ['hmiLnkActions', 'hmiLnkTouchOptions'],
			dataChange: ['hmiLnkObjectScripts', 'hmiLnkDataChange'],
			condition: ['hmiLnkObjectScripts', 'hmiLnkCondition']};
		var colorKinds = {discrete: 'hmiLnkDiscrete', analog: 'hmiLnkAnalog',
			discreteAlarm: 'hmiLnkDiscreteAlarm', analogAlarm: 'hmiLnkAnalogAlarm'};
		var colorLabels = {lineColor: 'hmiLnkLineColor', fillColor: 'hmiLnkFillColor',
			textColor: 'hmiLnkTextColor'};
		var done = {};
		var keys = ORDER.concat(Object.keys(links));

		for (var i = 0; i < keys.length; i++)
		{
			var type = keys[i];
			var l = links[type];

			if (done[type] || l == null || typeof l !== 'object')
			{
				continue;
			}

			done[type] = true;
			var label;
			var detail = '';

			if (colorLabels[type] != null)
			{
				label = T(colorLabels[type]) + ': ' + T(colorKinds[l.kind] || 'hmiLnkDiscrete');

				if (l.kind == 'analog')
				{
					var n = (l.breakpoints || []).length;
					detail = shorten(l.expr || '', 24) + ', ' + n + ' ' + T(n == 1 ?
						'hmiLnkBreakPointSingular' : 'hmiLnkBreakPointPlural');
				}
				else if (l.kind == 'analogAlarm')
				{
					detail = shorten(l.tag || '', 24) + ', ' + T('hmiLnkAlarm_' + (l.alarmType || 'value'));
				}
				else
				{
					detail = shorten(l.expr || l.tag || '', 28);
				}
			}
			else if (labels[type] != null)
			{
				label = T(labels[type][0]) + ': ' + T(labels[type][1]);

				if (type == 'pushAction')
				{
					var sc = (l.scripts || []).length;
					detail = sc + ' ' + T(sc == 1 ? 'hmiLnkScriptSingular' : 'hmiLnkScriptPlural');
				}
				else if (type == 'showWindow' || type == 'hideWindow')
				{
					detail = shorten((l.windows || []).join(', '), 30);
				}
				else if (type == 'states')
				{
					var ns = (l.states || []).length;
					detail = shorten(l.expr || '', 20) + ', ' + ns + ' ' + T(ns == 1 ?
						'hmiLnkStateSingular' : 'hmiLnkStatePlural');
				}
				else if (type == 'properties')
				{
					detail = shorten((l.items || []).map(function(it)
					{
						return it.target;
					}).join(', '), 40);
				}
				else if (type == 'widgetData')
				{
					var nr = (l.series || []).length;
					detail = shorten(l.expr || '', 20) + (nr > 0 ? (l.expr ? ', ' : '') + nr + ' ' +
						T(nr == 1 ? 'hmiLnkSeriesSingular' : 'hmiLnkSeriesPlural') : '');
				}
				else if (type == 'animation')
				{
					detail = T('hmiLnkAnim_' + (l.preset || 'spin')) + (l.expr ? ', ' + shorten(l.expr, 20) : '');
				}
				else if (type == 'flow')
				{
					detail = T('hmiLnkFlow_' + (l.type || 'dash')) + (l.expr ? ', ' + shorten(l.expr, 20) : '');
				}
				else if (type == 'smooth')
				{
					detail = (l.duration > 0) ? l.duration + ' ms' : T('hmiLnkSmoothOff');
				}
				else if (type == 'alarmMarker')
				{
					detail = T(l.show == 'hide' ? 'hmiLnkMarkerHideOpt' : 'hmiLnkMarkerShowOpt') +
						(l.tag ? ', ' + shorten(l.tag, 20) : '');
				}
				else if (type == 'media')
				{
					detail = T(l.mode == 'pause' ? 'hmiLnkMediaPause' : 'hmiLnkMediaPlay') + ', ' +
						shorten(l.expr || '', 20);
				}
				else if (type == 'inputChoice')
				{
					var no = (l.options || []).length;
					detail = shorten(l.tag || '', 20) + ', ' + no + ' ' + T(no == 1 ?
						'hmiLnkOptionSingular' : 'hmiLnkOptionPlural');
				}
				else if (type == 'pushValue')
				{
					detail = shorten(l.tag || '', 20) + ', ' + (l.action == 'expression' ?
						shorten(l.expr || '', 16) : T('hmiLnkPush' + String(l.action || 'set').charAt(0).toUpperCase() +
						String(l.action || 'set').substring(1)) + ' ' + shorten(String(l.value != null ? l.value : ''), 12));
				}
				else if (type == 'openUrl')
				{
					detail = shorten(l.url || '', 32);
				}
				else if (type == 'sendMessage')
				{
					detail = shorten(l.name || '', 24) + ', ' + T('hmiLnkTo' + String(l.to || 'page').charAt(0).toUpperCase() +
						String(l.to || 'page').substring(1));
				}
				else if (type == 'control')
				{
					var nc = (l.commands || []).length;
					detail = nc + ' ' + T(nc == 1 ? 'hmiLnkCommandSingular' : 'hmiLnkCommandPlural');
				}
				else if (type == 'touchOptions')
				{
					var parts = [];

					if (l.confirm)
					{
						parts.push(T('hmiLnkConfirm'));
					}

					if (l.roles != null && l.roles.length > 0)
					{
						parts.push(T('hmiLnkRoles') + ' ' + shorten(l.roles.join('/'), 20));
					}

					if (l.delay > 0)
					{
						parts.push(T('hmiLnkDelay') + ' ' + l.delay + ' ms');
					}

					detail = parts.join(', ');
				}
				else if (type == 'dataChange')
				{
					detail = shorten(l.expr || '', 28);
				}
				else if (type == 'condition')
				{
					detail = shorten(l.expr || '', 28);
				}
				else if (type == 'tooltip')
				{
					detail = (l.mode == 'expression') ? shorten(l.expr || '', 28) : shorten(l.text || '', 28);
				}
				else
				{
					detail = shorten(l.expr || l.tag || '', 28);
				}
			}
			else
			{
				continue;
			}

			out.push({id: (colorLabels[type] != null) ? type + ':' + (l.kind || 'discrete') : type,
				text: label + (detail !== '' ? ' (' + detail + ')' : '')});
		}

		return out;
	};

	LinksDialog.summary = function(links)
	{
		return summaryEntries(links).map(function(e)
		{
			return e.text;
		});
	};

	/**
	 * Tab, position and tab order of every link id (by GROUPS).
	 */
	var layoutCache = null;

	function layout()
	{
		if (layoutCache == null)
		{
			layoutCache = {tab: {}, pos: {}, tabs: []};
			var tabId = null;
			var n = 0;

			GROUPS.forEach(function(g)
			{
				if (g.band != null)
				{
					tabId = TAB_OF_BAND[g.band][0];
					layoutCache.tabs.push(tabId);

					return;
				}

				var ids = (g.color != null) ? COLOR_KINDS.map(function(k)
				{
					return g.color + ':' + k[0];
				}) : g.items.map(function(it)
				{
					return it[0];
				});
				ids.forEach(function(id)
				{
					layoutCache.tab[id] = tabId;
					layoutCache.pos[id] = n++;
				});
			});
		}

		return layoutCache;
	};

	/**
	 * One entry {id, tab, text} for every link configured on the cell
	 * (hmiLinks and the storages of INTOUCH_LINKS.md §12.1), in the order
	 * of the tabs and groups of the Animation Links dialog.
	 */
	LinksDialog.objectSummary = function(cell)
	{
		var lay = layout();
		var out = [];

		if (cell == null)
		{
			return out;
		}

		summaryEntries(Hmi.Model.getCellConfig(cell).links).forEach(function(e)
		{
			out.push({id: e.id, tab: lay.tab[e.id] || 'display', text: e.text});
		});
		var store = readStore(cell);

		STORE_IDS.forEach(function(id)
		{
			if (storeOn(store, id))
			{
				out.push({id: id, tab: lay.tab[id], text: storeSummary(store, id)});
			}
		});

		return out.map(function(e, i)
		{
			return {e: e, i: i};
		}).sort(function(a, b)
		{
			var pa = (lay.pos[a.e.id] != null) ? lay.pos[a.e.id] : 1e6;
			var pb = (lay.pos[b.e.id] != null) ? lay.pos[b.e.id] : 1e6;

			return (pa != pb) ? pa - pb : a.i - b.i;
		}).map(function(x)
		{
			return x.e;
		});
	};

	// ---------------------------------------------------------------
	// Links that live outside hmiLinks (INTOUCH_LINKS.md §12.1)
	// ---------------------------------------------------------------

	var STORE_IDS = ['bindings', 'keyframes', 'events', 'security', 'hoverHalo', 'triggers',
		'stateMachines'];

	var STORE_LABEL = {bindings: 'hmiLnkBindings', keyframes: 'hmiLnkKeyframes',
		events: 'hmiLnkEvents', security: 'hmiLnkSecurity', hoverHalo: 'hmiLnkHoverHalo',
		triggers: 'hmiLnkTriggers', stateMachines: 'hmiLnkStateMachines'};

	// Storage group of a link: the links triggers and stateMachines share hmiTriggers
	var STORE_GROUP = {bindings: 'bindings', keyframes: 'animations', events: 'events',
		security: 'security', hoverHalo: 'hoverHalo', triggers: 'triggers',
		stateMachines: 'triggers'};

	var HALO_STYLES = [['default', 'hmiHaloPageDefault'], ['glow', 'hmiHaloGlow'],
		['outline', 'hmiHaloOutline'], ['glowOutline', 'hmiHaloGlowOutline'],
		['off', 'hmiHaloPreset_off']];

	var HALO_OUTLINES = [['default', 'hmiHaloPageDefault'], ['rect', 'hmiHaloOutlineRect'],
		['shape', 'hmiHaloOutlineShape']];

	var EVENT_TYPES = ['click', 'dblclick', 'mousedown', 'mouseup', 'enter', 'leave',
		'contextmenu', 'longpress', 'change', 'valueChange', 'message', 'pageOpen', 'pageClose'];

	var OPERATORS = ['==', '!=', '>', '<', '>=', '<=', 'range', '!range', 'in', '!in',
		'changed', 'isBad', 'true'];

	var NO_VALUE_OPS = ['changed', 'isBad', 'true'];

	var ANIM_PRESETS_STORE = ['blink', 'pulse', 'spin', 'shake', 'colorCycle', 'fadeInOut'];

	var EASINGS = ['linear', 'ease-in', 'ease-out', 'ease-in-out'];

	function isStore(id)
	{
		return STORE_LABEL[id] != null;
	};

	function isMachine(t)
	{
		return t != null && Array.isArray(t.states);
	};

	function cellAttr(cell, name)
	{
		var v = (cell != null) ? cell.value : null;

		return (v != null && typeof v === 'object' && v.getAttribute != null) ?
			v.getAttribute(name) : null;
	};

	function styleValue(cell, key)
	{
		var parts = (cell != null && cell.style != null) ? String(cell.style).split(';') : [];

		for (var i = 0; i < parts.length; i++)
		{
			var p = parts[i].indexOf('=');

			if (p > 0 && parts[i].substring(0, p) == key)
			{
				return parts[i].substring(p + 1);
			}
		}

		return null;
	};

	function haloStyleIds()
	{
		return HALO_STYLES.map(function(s)
		{
			return s[0];
		});
	};

	/**
	 * Reads the storages of the links of §12.1 from the cell.
	 */
	function readStore(cell)
	{
		var cfg = Hmi.Model.getCellConfig(cell);
		var style = (styleValue(cell, 'hmiHalo') == '0') ? 'off' : styleValue(cell, 'hmiHaloStyle');
		var outline = styleValue(cell, 'hmiHaloOutline');

		return {bindings: clone(cfg.bindings) || [], animations: clone(cfg.animations) || [],
			events: clone(cfg.events) || [], triggers: clone(cfg.triggers) || [],
			roles: (cfg.roles || []).slice(),
			rolesMode: (cellAttr(cell, 'hmiRolesMode') == 'disable') ? 'disable' : '',
			halo: {style: (haloStyleIds().indexOf(style) >= 0) ? style : 'default',
				outline: (outline == 'rect' || outline == 'shape') ? outline : 'default',
				color: styleValue(cell, 'hmiHaloColor') || ''}};
	};

	function storeOn(store, id)
	{
		switch (id)
		{
			case 'bindings':
				return store.bindings.length > 0;

			case 'keyframes':
				return store.animations.length > 0;

			case 'events':
				return store.events.length > 0;

			case 'security':
				return store.roles.length > 0 || store.rolesMode == 'disable';

			case 'hoverHalo':
				return store.halo.style != 'default' || store.halo.outline != 'default' ||
					store.halo.color !== '';

			case 'triggers':
				return store.triggers.some(function(t)
				{
					return !isMachine(t);
				});

			case 'stateMachines':
				return store.triggers.some(isMachine);
		}

		return false;
	};

	function clearStore(store, id)
	{
		switch (id)
		{
			case 'bindings':
				store.bindings = [];
				break;

			case 'keyframes':
				store.animations = [];
				break;

			case 'events':
				store.events = [];
				break;

			case 'security':
				store.roles = [];
				store.rolesMode = '';
				break;

			case 'hoverHalo':
				store.halo = {style: 'default', outline: 'default', color: ''};
				break;

			case 'triggers':
				store.triggers = store.triggers.filter(isMachine);
				break;

			case 'stateMachines':
				store.triggers = store.triggers.filter(function(t)
				{
					return !isMachine(t);
				});
				break;
		}
	};

	/**
	 * Writes the storage groups in the dirty map (inside the caller's
	 * model update).
	 */
	function writeStore(graph, cells, store, dirty)
	{
		var M = Hmi.Model;

		if (dirty.bindings)
		{
			M.setCellConfig(graph, cells, 'bindings', store.bindings);
		}

		if (dirty.animations)
		{
			M.setCellConfig(graph, cells, 'animations', store.animations);
		}

		if (dirty.events)
		{
			M.setCellConfig(graph, cells, 'events', store.events);
		}

		if (dirty.triggers)
		{
			M.setCellConfig(graph, cells, 'triggers', store.triggers);
		}

		if (dirty.security)
		{
			M.setCellConfig(graph, cells, 'roles', store.roles);

			for (var i = 0; i < cells.length; i++)
			{
				graph.setAttributeForCell(cells[i], 'hmiRolesMode',
					(store.rolesMode == 'disable' && store.roles.length > 0) ? 'disable' : null);
			}
		}

		if (dirty.hoverHalo)
		{
			var h = store.halo;
			graph.setCellStyles('hmiHalo', (h.style == 'off') ? '0' : null, cells);
			graph.setCellStyles('hmiHaloStyle', (h.style == 'off' || h.style == 'default') ?
				null : h.style, cells);
			graph.setCellStyles('hmiHaloOutline', (h.outline == 'default') ? null : h.outline, cells);
			graph.setCellStyles('hmiHaloColor', (h.color !== '') ? h.color : null, cells);
		}
	};

	// ---------------------------------------------------------------
	// One-line texts of the items
	// ---------------------------------------------------------------

	function actionsText(list)
	{
		return (list || []).map(function(a)
		{
			return a.type;
		}).join(', ');
	};

	function conditionText(c)
	{
		var right = (c.valueTag != null && c.valueTag !== '') ? c.valueTag :
			((c.value != null && NO_VALUE_OPS.indexOf(c.operator) < 0) ? String(c.value) : '');

		return (c.tag || c.expr || '?') + ' ' + (c.operator || '==') + (right !== '' ? ' ' + right : '');
	};

	function conditionsText(list, type)
	{
		return (list || []).map(conditionText).join(type == 'or' ? ' OR ' : ' AND ');
	};

	function bindingText(b)
	{
		return (b.tag || b.expr || '?') + ' → ' + (b.target || '?') +
			((b.transform != null && b.transform.kind != null) ? ' (' + b.transform.kind + ')' : '');
	};

	function animationText(a)
	{
		var kind = (a.preset != null && a.preset !== '') ? a.preset :
			((a.frames || []).length + ' ' + T('hmiLnkFrames'));

		return (a.name || '?') + ' (' + kind + (a.autoPlay ? ', ' + T('hmiAutoPlay') : '') + ')';
	};

	function eventText(e)
	{
		return (e.on || '?') + (e.on == 'message' && e.message ? ' "' + e.message + '"' : '') +
			' → ' + (actionsText(e.actions) || '-');
	};

	function triggerText(t)
	{
		var when = conditionsText(t.conditions, t.conditionType);

		return (t.name ? t.name + ': ' : '') + (when !== '' ? when : T('hmiLnkAlways')) +
			' → ' + (actionsText(t.actions) || '-') +
			((t.elseActions || []).length > 0 ? ' / ' + actionsText(t.elseActions) : '');
	};

	function machineText(t)
	{
		return (t.name ? t.name + ': ' : '') + (t.states || []).map(function(s)
		{
			return s.name;
		}).join(' → ');
	};

	var STORE_ITEM_TEXT = {bindings: bindingText, keyframes: animationText, events: eventText,
		triggers: triggerText, stateMachines: machineText};

	function storeItems(store, id)
	{
		switch (id)
		{
			case 'bindings':
				return store.bindings;

			case 'keyframes':
				return store.animations;

			case 'events':
				return store.events;

			case 'triggers':
				return store.triggers.filter(function(t)
				{
					return !isMachine(t);
				});

			case 'stateMachines':
				return store.triggers.filter(isMachine);
		}

		return [];
	};

	/**
	 * Detail of the summary line of a link: "3: Level → style:fillColor, …".
	 */
	function storeDetail(store, id)
	{
		if (id == 'security')
		{
			return shorten(store.roles.join('/'), 28) + (store.roles.length > 0 ? ', ' : '') +
				T(store.rolesMode == 'disable' ? 'hmiLnkSecDisable' : 'hmiLnkSecHide');
		}

		if (id == 'hoverHalo')
		{
			var h = store.halo;
			var parts = [];

			for (var i = 0; i < HALO_STYLES.length; i++)
			{
				if (HALO_STYLES[i][0] == h.style)
				{
					parts.push(T(HALO_STYLES[i][1]));
				}
			}

			if (h.outline != 'default')
			{
				parts.push(T(h.outline == 'rect' ? 'hmiHaloOutlineRect' : 'hmiHaloOutlineShape'));
			}

			if (h.color !== '')
			{
				parts.push(h.color);
			}

			return parts.join(', ');
		}

		var items = storeItems(store, id);

		return items.length + ': ' + shorten(items.map(STORE_ITEM_TEXT[id]).join('; '), 52);
	};

	function storeSummary(store, id)
	{
		return T(STORE_LABEL[id]) + ' (' + storeDetail(store, id) + ')';
	};

	// ---------------------------------------------------------------
	// Item editors of the list links
	// ---------------------------------------------------------------

	function schemaError(kind, value)
	{
		if (Hmi.Schema == null || Hmi.Schema.validate == null)
		{
			return null;
		}

		var errs = Hmi.Schema.validate(kind, [value]);

		return (errs != null && errs.length > 0) ? errs.join('; ') : null;
	};

	function fkeys2(id, key)
	{
		return ['field.' + id + '.' + key, 'field.' + key];
	};

	/**
	 * Card of one condition: tag or expression, operator, value or value tag.
	 */
	function conditionCard(ui, id)
	{
		return function(content, item)
		{
			var E = Hmi.Editors;
			item = item || {};
			var useExpr = item.expr != null && item.expr !== '';
			var r1 = E.inlineFields(content);
			var tag = E.tagPicker(ui, useExpr ? '' : (item.tag || ''));
			mark(tag.input, 'condTag');
			E.inlineField(r1, T('hmiTag') + ':', tag, fkeys2(id, 'conditions.tag'));
			var expression = E.textInput(item.expr || '', 'tag("a")>0');
			mark(expression, 'condExpr');
			E.inlineField(r1, T('hmiExpr') + ':', expression, fkeys2(id, 'conditions.expr'));
			var r2 = E.inlineFields(content);
			r2.style.marginTop = '6px';
			var op = E.select(OPERATORS, item.operator || '==');
			mark(op, 'condOperator');
			E.inlineField(r2, T('hmiOperator') + ':', op, fkeys2(id, 'conditions.operator'));
			var value = E.textInput((item.value != null) ? (Array.isArray(item.value) ?
				item.value.join(',') : item.value) : '');
			mark(value, 'condValue');
			var valueField = E.inlineField(r2, T('hmiValue') + ':', value,
				fkeys2(id, 'conditions.value'));
			var valueTag = E.tagPicker(ui, item.valueTag || '');
			mark(valueTag.input, 'condValueTag');
			var valueTagField = E.inlineField(r2, T('hmiLnkValueTag') + ':', valueTag,
				fkeys2(id, 'conditions.valueTag'));

			function sync()
			{
				var none = NO_VALUE_OPS.indexOf(op.value) >= 0;
				valueField.style.display = none ? 'none' : '';
				valueTagField.style.display = none ? 'none' : '';
			};

			mxEvent.addListener(op, 'change', sync);
			sync();

			return {get: function()
			{
				var c = clone(item);
				['tag', 'expr', 'operator', 'value', 'valueTag'].forEach(function(k)
				{
					delete c[k];
				});

				if (trim(expression.value) !== '')
				{
					c.expr = trim(expression.value);
				}
				else if (trim(tag.getValue()) !== '')
				{
					c.tag = trim(tag.getValue());
				}

				c.operator = op.value;

				if (NO_VALUE_OPS.indexOf(op.value) < 0)
				{
					if (trim(valueTag.getValue()) !== '')
					{
						c.valueTag = trim(valueTag.getValue());
					}
					else if (trim(value.value) !== '')
					{
						c.value = textValue(value.value);
					}
				}

				return c;
			}, validate: function()
			{
				if (trim(expression.value) === '' && trim(tag.getValue()) === '' && op.value != 'true')
				{
					return T('hmiTag') + ' / ' + T('hmiExpr') + ': ' + T('hmiLnkRequired');
				}

				if (trim(expression.value) !== '' && Hmi.Expr != null && Hmi.Expr.compile != null)
				{
					try
					{
						Hmi.Expr.compile(trim(expression.value));
					}
					catch (e)
					{
						return T('hmiExpr') + ': ' + (e.message || String(e));
					}
				}

				return null;
			}};
		};
	};

	function conditionsList(ui, section, id, items)
	{
		return listEditor(Hmi.Editors, section, {label: 'hmiConditions', role: 'condition',
			addKey: 'addCondition', addLabel: 'hmiLnkAddCondition', items: items || [],
			helpKeys: fkeys2(id, 'conditions'), tall: true,
			blank: function()
			{
				return {tag: '', operator: '=='};
			}, build: conditionCard(ui, id)});
	};

	/**
	 * Heading + the stacked action list editor (every action type).
	 */
	function actionsBlock(ui, section, labelKey, helpKeys, actions)
	{
		var h = document.createElement('div');
		h.className = 'geDialogHint geHmiSubHead';
		mxUtils.write(h, T(labelKey));
		addHelp(h, helpKeys);
		section.appendChild(h);
		var editor = Hmi.FormatPanel.buildActionsListEditor(ui, actions || []);
		editor.setAttribute('data-role', 'actions');
		section.appendChild(editor);

		return editor;
	};

	function andOr(value)
	{
		return Hmi.Editors.select([{value: 'and', label: T('hmiLnkAnd')},
			{value: 'or', label: T('hmiLnkOr')}], value || 'and');
	};

	function numField(row, label, value, key, id)
	{
		var input = Hmi.Editors.numberInput(value);
		input.setAttribute('min', '0');
		mark(input, key);
		Hmi.Editors.inlineField(row, T(label) + ':', input, fkeys2(id, key));

		return input;
	};

	function numberOrNull(input)
	{
		var v = parseFloat(input.value);

		return isNaN(v) ? null : v;
	};

	function blendKeys(target, source, managed)
	{
		for (var k in source)
		{
			if (managed.indexOf(k) < 0 && target[k] === undefined)
			{
				target[k] = clone(source[k]);
			}
		}

		return target;
	};

	function buildSimpleTrigger(ui, value)
	{
		var E = Hmi.Editors;
		value = value || {};
		var container = document.createElement('div');
		container.className = 'geHmiItemForm';
		var nameRow = E.row(container, T('hmiName') + ':', fkeys2('triggers', 'name'));
		var name = E.textInput(value.name || '');
		mark(name, 'name');
		nameRow.appendChild(name);
		var typeRow = E.row(container, T('hmiConditionType') + ':', fkeys2('triggers', 'conditionType'));
		var type = andOr(value.conditionType);
		mark(type, 'conditionType');
		typeRow.appendChild(type);
		var conds = conditionsList(ui, container, 'triggers', value.conditions);
		var actions = actionsBlock(ui, container, 'hmiActions', fkeys2('triggers', 'actions'),
			value.actions);
		var elses = actionsBlock(ui, container, 'hmiElseActions', fkeys2('triggers', 'elseActions'),
			value.elseActions);
		var timing = E.inlineFields(container);
		timing.style.marginTop = '10px';
		var deadband = numField(timing, 'hmiLnkDeadband', value.deadband, 'deadband', 'triggers');
		var onDelay = numField(timing, 'hmiLnkOnDelay', value.onDelay, 'onDelay', 'triggers');
		var offDelay = numField(timing, 'hmiLnkOffDelay', value.offDelay, 'offDelay', 'triggers');

		container.getValue = function()
		{
			var t = {};

			if (trim(name.value) !== '')
			{
				t.name = trim(name.value);
			}

			t.conditions = conds.get();
			t.conditionType = type.value;
			t.actions = actions.getValue();

			if (elses.getValue().length > 0)
			{
				t.elseActions = elses.getValue();
			}

			[['deadband', deadband], ['onDelay', onDelay], ['offDelay', offDelay]].forEach(function(p)
			{
				var n = numberOrNull(p[1]);

				if (n != null && n > 0)
				{
					t[p[0]] = n;
				}
			});

			return blendKeys(t, value, ['name', 'conditions', 'conditionType', 'actions',
				'elseActions', 'deadband', 'onDelay', 'offDelay']);
		};

		container.validate = function()
		{
			var err = conds.validate();

			if (err == null && actions.getValue().length == 0 && elses.getValue().length == 0)
			{
				err = T('hmiActions') + ': ' + T('hmiLnkNeedAction');
			}

			['deadband', 'onDelay', 'offDelay'].forEach(function(k)
			{
				var n = numberOrNull({deadband: deadband, onDelay: onDelay, offDelay: offDelay}[k]);

				if (err == null && n != null && n < 0)
				{
					err = T('hmiLnkDeadband') + ': ' + T('hmiLnkNotNegative');
				}
			});

			return err || schemaError('triggers', container.getValue());
		};

		return container;
	};

	function buildStateMachine(ui, value)
	{
		var E = Hmi.Editors;
		value = value || {};
		var container = document.createElement('div');
		container.className = 'geHmiItemForm';
		var nameRow = E.row(container, T('hmiName') + ':', fkeys2('stateMachines', 'name'));
		var name = E.textInput(value.name || '');
		mark(name, 'name');
		nameRow.appendChild(name);

		var states = listEditor(E, container, {label: 'hmiLnkSmStates', role: 'state',
			addKey: 'addState', addLabel: 'hmiLnkAddState', items: value.states || [],
			helpKeys: fkeys2('stateMachines', 'states'), tall: true, emptyKey: 'hmiLnkNeedState',
			blank: function()
			{
				return {name: '', conditions: [], conditionType: 'and', actions: []};
			}, build: function(content, item)
			{
				var r = E.inlineFields(content);
				var sname = E.textInput(item.name || '');
				mark(sname, 'stateName');
				E.inlineField(r, T('hmiName') + ':', sname, fkeys2('stateMachines', 'states.name'));
				var stype = andOr(item.conditionType);
				mark(stype, 'conditionType');
				E.inlineField(r, T('hmiConditionType') + ':', stype,
					fkeys2('stateMachines', 'states.conditionType'));
				var inner = document.createElement('div');
				content.appendChild(inner);
				var conds = conditionsList(ui, inner, 'stateMachines', item.conditions);
				var acts = actionsBlock(ui, inner, 'hmiActions',
					fkeys2('stateMachines', 'states.actions'), item.actions);

				return {get: function()
				{
					return blendKeys({name: trim(sname.value), conditions: conds.get(),
						conditionType: stype.value, actions: acts.getValue()}, item,
						['name', 'conditions', 'conditionType', 'actions']);
				}, validate: function()
				{
					if (trim(sname.value) === '')
					{
						return T('hmiName') + ': ' + T('hmiLnkRequired');
					}

					return conds.validate();
				}};
			}});

		container.getValue = function()
		{
			var t = {};

			if (trim(name.value) !== '')
			{
				t.name = trim(name.value);
			}

			t.states = states.get();

			return blendKeys(t, value, ['name', 'states']);
		};

		container.validate = function()
		{
			return states.validate() || schemaError('triggers', container.getValue());
		};

		return container;
	};

	function buildEventHandler(ui, value)
	{
		var E = Hmi.Editors;
		value = value || {};
		var container = document.createElement('div');
		container.className = 'geHmiItemForm';
		var r1 = E.inlineFields(container);
		var on = E.select(EVENT_TYPES, value.on || 'click');
		mark(on, 'on');
		E.inlineField(r1, T('hmiOn') + ':', on, fkeys2('events', 'on'));
		var message = E.textInput(value.message || '');
		mark(message, 'message');
		var messageField = E.inlineField(r1, T('hmiMessageName') + ':', message,
			fkeys2('events', 'message'));
		var r2 = E.inlineFields(container);
		r2.style.marginTop = '6px';
		var type = andOr(value.conditionType);
		mark(type, 'conditionType');
		E.inlineField(r2, T('hmiConditionType') + ':', type, fkeys2('events', 'conditionType'));
		var delay = numField(r2, 'hmiLnkDelay', value.delay, 'delay', 'events');
		var r3 = E.inlineFields(container);
		r3.style.marginTop = '6px';
		var confirm = E.checkbox(T('hmiConfirm'), !!value.confirm, fkeys2('events', 'confirm'));
		mark(confirm.input, 'confirm');
		r3.appendChild(confirm);
		var stop = E.checkbox(T('hmiLnkStopOnError'), !!value.stopOnError, fkeys2('events', 'stopOnError'));
		mark(stop.input, 'stopOnError');
		r3.appendChild(stop);

		function sync()
		{
			messageField.style.display = (on.value == 'message') ? '' : 'none';
		};

		mxEvent.addListener(on, 'change', sync);
		sync();
		var conds = conditionsList(ui, container, 'events', value.conditions);
		var actions = actionsBlock(ui, container, 'hmiActions', fkeys2('events', 'actions'),
			value.actions);

		container.getValue = function()
		{
			var e = {on: on.value};

			if (on.value == 'message')
			{
				e.message = trim(message.value);
			}

			var list = conds.get();

			if (list.length > 0)
			{
				e.conditions = list;
				e.conditionType = type.value;
			}

			e.actions = actions.getValue();

			if (confirm.input.checked)
			{
				e.confirm = (value.confirm != null && typeof value.confirm === 'object') ?
					value.confirm : true;
			}

			var d = numberOrNull(delay);

			if (d != null && d > 0)
			{
				e.delay = d;
			}

			if (stop.input.checked)
			{
				e.stopOnError = true;
			}

			return blendKeys(e, value, ['on', 'message', 'conditions', 'conditionType', 'actions',
				'confirm', 'delay', 'stopOnError']);
		};

		container.validate = function()
		{
			if (on.value == 'message' && trim(message.value) === '')
			{
				return T('hmiMessageName') + ': ' + T('hmiLnkRequired');
			}

			if (actions.getValue().length == 0)
			{
				return T('hmiActions') + ': ' + T('hmiLnkNeedAction');
			}

			return conds.validate() || schemaError('events', container.getValue());
		};

		return container;
	};

	var FRAME_NUMBERS = [['rotation', 'hmiLnkFrameRotation'], ['opacity', 'hmiLnkFrameOpacity'],
		['scale', 'hmiLnkFrameScale'], ['dx', 'hmiLnkFrameDx'], ['dy', 'hmiLnkFrameDy'],
		['hmiLevel', 'hmiLnkFrameLevel']];

	var FRAME_COLORS = [['fillColor', 'hmiLnkFrameFill'], ['strokeColor', 'hmiLnkFrameStroke'],
		['fontColor', 'hmiLnkFrameFont']];

	function frameCard(ui)
	{
		return function(content, item)
		{
			var E = Hmi.Editors;
			item = item || {};
			var props = item.props || {};
			var r1 = E.inlineFields(content);
			var duration = numField(r1, 'hmiDuration', item.duration, 'frameDuration', 'keyframes');
			var visible = E.select([{value: '', label: T('hmiLnkKeep')},
				{value: 'true', label: T('hmiLnkVisible')}, {value: 'false', label: T('hmiLnkHidden')}],
				(props.visible === true) ? 'true' : ((props.visible === false) ? 'false' : ''));
			mark(visible, 'frameVisible');
			E.inlineField(r1, T('hmiLnkVisibility') + ':', visible, fkeys2('keyframes', 'frames.visible'));
			var inputs = {};
			var r2 = E.inlineFields(content);
			r2.style.marginTop = '6px';
			var r3 = E.inlineFields(content);
			r3.style.marginTop = '6px';
			FRAME_NUMBERS.forEach(function(f, i)
			{
				var input = E.numberInput(props[f[0]]);
				mark(input, 'frame_' + f[0]);
				E.inlineField(i < 3 ? r2 : r3, T(f[1]) + ':', input, fkeys2('keyframes', 'frames.' + f[0]));
				inputs[f[0]] = input;
			});
			var r4 = E.inlineFields(content);
			r4.style.marginTop = '6px';
			var colors = {};
			FRAME_COLORS.forEach(function(f)
			{
				var c = E.colorInput(ui, props[f[0]] || '');
				E.inlineField(r4, T(f[1]) + ':', c, fkeys2('keyframes', 'frames.' + f[0]));
				colors[f[0]] = c;
			});

			return {get: function()
			{
				var p = clone(props);
				var frame = clone(item);
				FRAME_NUMBERS.forEach(function(f)
				{
					var n = numberOrNull(inputs[f[0]]);

					if (n != null)
					{
						p[f[0]] = n;
					}
					else
					{
						delete p[f[0]];
					}
				});
				FRAME_COLORS.forEach(function(f)
				{
					if (colors[f[0]].getValue() !== '')
					{
						p[f[0]] = colors[f[0]].getValue();
					}
					else
					{
						delete p[f[0]];
					}
				});

				if (visible.value !== '')
				{
					p.visible = (visible.value == 'true');
				}
				else
				{
					delete p.visible;
				}

				frame.duration = numberOrNull(duration) != null ? numberOrNull(duration) : 500;
				frame.props = p;

				return frame;
			}, validate: function()
			{
				var d = numberOrNull(duration);

				return (d != null && d < 0) ? T('hmiDuration') + ': ' + T('hmiLnkNotNegative') : null;
			}};
		};
	};

	function buildKeyframes(ui, value)
	{
		var E = Hmi.Editors;
		value = value || {};
		var params = value.params || {};
		var container = document.createElement('div');
		container.className = 'geHmiItemForm';
		var r1 = E.inlineFields(container);
		var name = E.textInput(value.name || '');
		mark(name, 'name');
		E.inlineField(r1, T('hmiName') + ':', name, fkeys2('keyframes', 'name'));
		var preset = E.select([{value: '', label: T('hmiLnkFramesOnly')}].concat(ANIM_PRESETS_STORE.map(
			function(p)
			{
				return {value: p, label: T('hmiLnkAnim_' + p)};
			})), value.preset || '');
		mark(preset, 'preset');
		E.inlineField(r1, T('hmiPreset') + ':', preset, fkeys2('keyframes', 'preset'));
		var r2 = E.inlineFields(container);
		r2.style.marginTop = '6px';
		var duration = numField(r2, 'hmiDuration', (value.duration != null) ? value.duration : 1000,
			'duration', 'keyframes');
		var easing = E.select(EASINGS.map(function(e)
		{
			return {value: e, label: T('hmiLnkEase_' + e.replace(/-/g, '_'))};
		}), value.easing || 'linear');
		mark(easing, 'easing');
		E.inlineField(r2, T('hmiLnkEasing') + ':', easing, fkeys2('keyframes', 'easing'));
		var cycles = numField(r2, 'hmiLnkCycles', value.cycles, 'cycles', 'keyframes');
		cycles.setAttribute('placeholder', T('hmiLnkInfinite'));
		var r3 = E.inlineFields(container);
		r3.style.marginTop = '6px';
		var autoPlay = E.checkbox(T('hmiAutoPlay'), !!value.autoPlay, fkeys2('keyframes', 'autoPlay'));
		mark(autoPlay.input, 'autoPlay');
		r3.appendChild(autoPlay);
		var keepState = E.checkbox(T('hmiLnkKeepState'), !!value.keepState, fkeys2('keyframes', 'keepState'));
		mark(keepState.input, 'keepState');
		r3.appendChild(keepState);
		var r4 = E.inlineFields(container);
		r4.style.marginTop = '6px';
		var rpm = numField(r4, 'hmiRpm', params.rpm, 'rpm', 'keyframes');
		var rpmTag = E.tagPicker(ui, params.rpmTag || '');
		mark(rpmTag.input, 'rpmTag');
		var rpmTagField = E.inlineField(r4, T('hmiRpmTag') + ':', rpmTag, fkeys2('keyframes', 'rpmTag'));
		var colorsInput = E.textInput((params.colors || []).join(','), '#FF0000,#00C000');
		mark(colorsInput, 'colors');
		var colorsField = E.inlineField(r4, T('hmiLnkColors') + ':', colorsInput,
			fkeys2('keyframes', 'colors'));

		function sync()
		{
			rpm.parentNode.style.display = rpmTagField.style.display = (preset.value == 'spin') ? '' : 'none';
			colorsField.style.display = (preset.value == 'colorCycle') ? '' : 'none';
			r4.style.display = (preset.value == 'spin' || preset.value == 'colorCycle') ? '' : 'none';
		};

		mxEvent.addListener(preset, 'change', sync);
		sync();
		var r5 = E.row(container, T('hmiLnkNextAnimation') + ':', fkeys2('keyframes', 'next'));
		var nextName = E.textInput((value.next || {}).name || '');
		mark(nextName, 'nextName');
		r5.appendChild(nextName);
		var nextTarget = E.targetSpecEditor(ui, (value.next || {}).target);
		container.appendChild(nextTarget);
		var frames = listEditor(E, container, {label: 'hmiLnkFrames', role: 'frame',
			addKey: 'addFrame', addLabel: 'hmiLnkAddFrame', items: value.frames || [],
			helpKeys: fkeys2('keyframes', 'frames'), tall: true,
			blank: function()
			{
				return {duration: 500, props: {}};
			}, build: frameCard(ui)});

		container.getValue = function()
		{
			var a = {name: trim(name.value) || preset.value};

			if (preset.value !== '')
			{
				a.preset = preset.value;
			}

			var p = clone(params);
			['rpm', 'rpmTag', 'colors'].forEach(function(k)
			{
				delete p[k];
			});

			if (preset.value == 'spin')
			{
				if (numberOrNull(rpm) != null)
				{
					p.rpm = numberOrNull(rpm);
				}

				if (trim(rpmTag.getValue()) !== '')
				{
					p.rpmTag = trim(rpmTag.getValue());
				}
			}

			if (preset.value == 'colorCycle' && trim(colorsInput.value) !== '')
			{
				p.colors = colorsInput.value.split(',').map(trim).filter(function(c)
				{
					return c !== '';
				});
			}

			a.params = p;
			a.autoPlay = autoPlay.input.checked;
			a.duration = (numberOrNull(duration) != null) ? numberOrNull(duration) : 1000;
			a.easing = easing.value;

			if (numberOrNull(cycles) != null)
			{
				a.cycles = Math.max(0, Math.round(numberOrNull(cycles)));
			}

			if (keepState.input.checked)
			{
				a.keepState = true;
			}

			if (trim(nextName.value) !== '')
			{
				a.next = {target: nextTarget.getValue(), name: trim(nextName.value)};
			}

			var list = frames.get();

			if (list.length > 0)
			{
				a.frames = list;
			}

			return blendKeys(a, value, ['name', 'preset', 'params', 'autoPlay', 'duration', 'easing',
				'cycles', 'keepState', 'next', 'frames']);
		};

		container.validate = function()
		{
			if (trim(name.value) === '' && preset.value === '')
			{
				return T('hmiName') + ': ' + T('hmiLnkRequired');
			}

			if (preset.value === '' && frames.get().length == 0)
			{
				return T('hmiPreset') + ' / ' + T('hmiLnkFrames') + ': ' + T('hmiLnkRequired');
			}

			return frames.validate() || schemaError('animations', container.getValue());
		};

		return container;
	};

	function buildBindingItem(ui, value)
	{
		var el = Hmi.FormatPanel.buildBindingEditor(ui, value);
		el.className = 'geHmiItemForm';
		el.validate = function()
		{
			return schemaError('bindings', el.getValue());
		};

		return el;
	};

	/**
	 * Definition of the list links: where the items live, how a row reads and
	 * which item editor opens.
	 */
	var LIST_LINKS = {
		bindings: {heading: 'hmiBindings', kind: 'bindings', width: 560, build: buildBindingItem,
			blank: function()
			{
				return {tag: '', target: 'style:fillColor'};
			}},
		keyframes: {heading: 'hmiAnimations', kind: 'animations', width: 640, build: buildKeyframes,
			blank: function()
			{
				return {name: '', preset: 'blink', params: {}, duration: 1000, autoPlay: false};
			}},
		events: {heading: 'hmiEvents', kind: 'events', width: 680, build: buildEventHandler,
			blank: function()
			{
				return {on: 'click', actions: []};
			}},
		triggers: {heading: 'hmiLnkTriggers', kind: 'triggers', width: 700, build: buildSimpleTrigger,
			blank: function()
			{
				return {name: '', conditions: [], conditionType: 'and', actions: []};
			}},
		stateMachines: {heading: 'hmiLnkStateMachines', kind: 'triggers', width: 740,
			build: buildStateMachine, blank: function()
			{
				return {name: '', states: []};
			}}
	};

	function setItems(store, id, items)
	{
		switch (id)
		{
			case 'bindings':
				store.bindings = items;
				break;

			case 'keyframes':
				store.animations = items;
				break;

			case 'events':
				store.events = items;
				break;

			case 'triggers':
				store.triggers = items.concat(store.triggers.filter(isMachine));
				break;

			case 'stateMachines':
				store.triggers = store.triggers.filter(function(t)
				{
					return !isMachine(t);
				}).concat(items);
				break;
		}
	};

	/**
	 * Body of the settings dialog of a list link.
	 */
	function buildListConfig(ui, id, store, dlgRef)
	{
		var E = Hmi.Editors;
		var def = LIST_LINKS[id];
		var items = clone(storeItems(store, id));
		var section = document.createElement('div');
		section.className = 'geDialogSection';
		E.head(section, T(def.heading), fkeys2(id, 'items'));
		var listDiv = document.createElement('div');
		listDiv.setAttribute('data-role', 'list');
		section.appendChild(listDiv);

		function render()
		{
			E.renderItemList({ui: ui, container: listDiv, items: items, kind: def.kind,
				helpKey: fkeys2(id, 'item'), itemLabel: STORE_ITEM_TEXT[id], buildEditor: def.build,
				newItem: def.blank, width: def.width, dialogId: 'item-' + id,
				emptyText: T('hmiNoItems'), addTitle: T('hmiAddItem'), editTitle: T('edit'),
				onChange: function(list)
				{
					items = list;
					render();
					E.fitDialog(section);
				}});
		};

		render();

		return {el: section, get: function()
		{
			return items;
		}};
	};

	// ---------------------------------------------------------------
	// Security and hover halo
	// ---------------------------------------------------------------

	function buildSecurityConfig(ui, store)
	{
		var E = Hmi.Editors;
		var section = document.createElement('div');
		section.className = 'geDialogSection';
		var r1 = E.row(section, T('hmiLnkRoles') + ':', fkeys2('security', 'roles'));
		var roles = E.textInput(store.roles.join(', '), 'op, eng');
		mark(roles, 'roles');
		r1.appendChild(roles);
		var r2 = E.row(section, T('hmiLnkSecMode') + ':', fkeys2('security', 'mode'));
		var mode = E.select([{value: 'hide', label: T('hmiLnkSecHide')},
			{value: 'disable', label: T('hmiLnkSecDisable')}], store.rolesMode == 'disable' ? 'disable' : 'hide');
		mark(mode, 'mode');
		r2.appendChild(mode);
		var hint = document.createElement('div');
		hint.className = 'geDialogHint';
		mxUtils.write(hint, T('hmiLnkSecHint'));
		section.appendChild(hint);

		return {el: section, apply: function(target)
		{
			target.roles = roles.value.split(',').map(trim).filter(function(r)
			{
				return r !== '';
			});
			target.rolesMode = (mode.value == 'disable') ? 'disable' : '';
		}};
	};

	function buildHaloConfig(ui, store)
	{
		var E = Hmi.Editors;
		var section = document.createElement('div');
		section.className = 'geDialogSection';
		var r1 = E.row(section, T('hmiHaloStyle') + ':', ['field.hoverHalo.style', 'halo.object.style']);
		var style = E.select(HALO_STYLES.map(function(s)
		{
			return {value: s[0], label: T(s[1])};
		}), store.halo.style);
		mark(style, 'style');
		r1.appendChild(style);
		var r2 = E.row(section, T('hmiHaloOutlineFollows') + ':',
			['field.hoverHalo.outline', 'halo.object.outlineShape']);
		var outline = E.select(HALO_OUTLINES.map(function(s)
		{
			return {value: s[0], label: T(s[1])};
		}), store.halo.outline);
		mark(outline, 'outline');
		r2.appendChild(outline);
		var r3 = E.row(section, T('color') + ':', ['field.hoverHalo.color', 'halo.object.color']);
		var color = E.colorInput(ui, store.halo.color);
		mark(color.input, 'color');
		color.input.setAttribute('placeholder', T('hmiHaloPageDefault'));
		r3.appendChild(color);

		return {el: section, apply: function(target)
		{
			target.halo = {style: style.value, outline: outline.value, color: color.getValue()};
		}};
	};

	/**
	 * Opens the settings dialog of one of the links of §12.1. The edits go
	 * to the in-memory store (not to the cell) when OK is pressed:
	 * onSave(), onCancel().
	 */
	LinksDialog.configureStore = function(ui, id, store, onSave, onCancel)
	{
		var div = document.createElement('div');
		div.setAttribute('data-dialog', 'link-' + id);
		var hd = document.createElement('h3');
		mxUtils.write(hd, T(STORE_LABEL[id]));
		addHelp(hd, 'link.' + id);
		div.appendChild(hd);
		var body;

		if (LIST_LINKS[id] != null)
		{
			body = buildListConfig(ui, id, store);
		}
		else if (id == 'security')
		{
			body = buildSecurityConfig(ui, store);
		}
		else
		{
			body = buildHaloConfig(ui, store);
		}

		div.appendChild(body.el);
		var saved = false;
		var dlg = new CustomDialog(ui, div, function()
		{
			if (body.get != null)
			{
				setItems(store, id, body.get());
			}
			else
			{
				body.apply(store);
			}

			saved = true;
			onSave();
		}, function()
		{
			if (onCancel != null)
			{
				onCancel();
			}
		}, mxResources.get('ok'), null, null, false, null, true);
		ui.showDialog(dlg.container, (LIST_LINKS[id] != null) ? 520 : 420, null, true, true, function()
		{
			if (!saved && onCancel != null)
			{
				onCancel();
			}
		});
		Hmi.Editors.autoFit(div);

		return dlg;
	};

	// ---------------------------------------------------------------
	// Main dialog
	// ---------------------------------------------------------------

	/**
	 * Tab of every band: [tab id, label resource key].
	 */
	var TAB_OF_BAND = {hmiLnkDisplayLinks: ['display', 'hmiLnkTabDisplay'],
		hmiLnkAnimationLinks: ['animation', 'hmiLnkTabAnimation'],
		hmiLnkTouchLinks: ['touch', 'hmiLnkTabTouch'],
		hmiLnkScriptsBand: ['scripts', 'hmiLnkTabScripts']};

	// The tab used last in this session
	var lastTab = null;

	function editableCells(ui, cells)
	{
		var model = ui.editor.graph.model;

		return (cells || []).filter(function(c)
		{
			return c != null && (model.isVertex(c) || model.isEdge(c));
		});
	};

	/**
	 * Shows the "Animation Links" dialog for the given cells (default: the
	 * selection). Links apply to all given cells. opts.tab selects a tab
	 * (display, animation, touch, scripts), opts.link a link id: the dialog
	 * opens on its tab and opens its settings dialog (INTOUCH_LINKS.md §12.2).
	 */
	LinksDialog.show = function(ui, cells, opts)
	{
		opts = opts || {};
		var graph = ui.editor.graph;
		Hmi.Editors.installStyle();

		if (SPECS.valueDiscrete == null)
		{
			buildSpecs();
		}

		cells = editableCells(ui, cells || graph.getSelectionCells());

		if (cells.length == 0)
		{
			ui.showError(mxResources.get('error'), T('hmiLnkSelectCell'), mxResources.get('ok'));

			return null;
		}

		var links = clone(Hmi.Model.getCellConfig(cells[0]).links) || {};
		var store = readStore(cells[0]);
		var dirty = {};
		var pendingWindows = [];

		var div = document.createElement('div');
		div.setAttribute('data-dialog', 'animation-links');
		var hd = document.createElement('h3');
		mxUtils.write(hd, T('hmiAnimationLinks'));
		div.appendChild(hd);

		var rows = {};
		var tabs = [];
		var tablist = document.createElement('div');
		tablist.className = 'geHmiTabs';
		tablist.setAttribute('role', 'tablist');
		tablist.setAttribute('aria-label', T('hmiLnkTabs'));
		var panels = document.createElement('div');
		panels.className = 'geHmiTabPanels';
		var selected = null;

		function isOn(id)
		{
			if (isStore(id))
			{
				return storeOn(store, id);
			}

			var p = id.split(':');

			return links[p[0]] != null && (p.length == 1 || links[p[0]].kind == p[1]);
		};

		function refreshRows()
		{
			for (var id in rows)
			{
				var on = isOn(id);
				rows[id].cb.checked = on;
				rows[id].row.className = 'geDialogCheckRow geHmiLinkRow' + (on ? '' : ' geHmiOff');
				var p = id.split(':');
				var s = !on ? '' : (isStore(id) ? storeSummary(store, id) :
					LinksDialog.summary((function()
				{
					var o = {};
					o[p[0]] = links[p[0]];

					return o;
				})())[0]);
				rows[id].row.setAttribute('title', s || rows[id].label);
			}

			refreshTabs();
		};

		// Count badge of every tab: number of enabled links
		function refreshTabs()
		{
			for (var i = 0; i < tabs.length; i++)
			{
				var n = 0;

				for (var j = 0; j < tabs[i].ids.length; j++)
				{
					n += isOn(tabs[i].ids[j]) ? 1 : 0;
				}

				tabs[i].count = n;
				tabs[i].countEl.textContent = '(' + n + ')';
				tabs[i].countEl.className = 'geHmiTabCount' + (n > 0 ? ' geHmiHas' : '');
				tabs[i].button.setAttribute('data-count', String(n));
			}
		};

		function selectTab(tab, focus)
		{
			selected = tab;
			lastTab = tab.id;

			for (var i = 0; i < tabs.length; i++)
			{
				var on = (tabs[i] == tab);
				tabs[i].button.setAttribute('aria-selected', on ? 'true' : 'false');
				tabs[i].button.setAttribute('tabindex', on ? '0' : '-1');
				tabs[i].wrap.className = 'geHmiTabWrap' + (on ? ' geHmiSel' : '');
				tabs[i].panel.hidden = !on;
			}

			if (focus)
			{
				tab.button.focus();
			}
		};

		function openConfig(id, cancelUncheck)
		{
			if (isStore(id))
			{
				var snapshot = JSON.stringify(store);
				LinksDialog.configureStore(ui, id, store, function()
				{
					// A settings dialog that changed nothing leaves the cells alone
					dirty[STORE_GROUP[id]] = dirty[STORE_GROUP[id]] || (JSON.stringify(store) != snapshot);
					refreshRows();
				}, function()
				{
					refreshRows();
				});

				return;
			}

			var p = id.split(':');
			var existing = isOn(id) ? clone(links[p[0]]) : LinksDialog.defaultsOf(id);
			LinksDialog.configure(ui, id, existing, function(value, extras)
			{
				links[p[0]] = value;

				if (extras != null && extras.windowEdit != null)
				{
					pendingWindows = pendingWindows.filter(function(w)
					{
						return w.page != extras.windowEdit.page;
					});
					pendingWindows.push(extras.windowEdit);
				}

				refreshRows();
			}, function()
			{
				refreshRows();
			});
		};

		function addRow(section, id, labelKey, tab)
		{
			var row = document.createElement('div');
			row.className = 'geDialogCheckRow geHmiLinkRow';
			row.setAttribute('data-link', id);
			var cb = document.createElement('input');
			cb.setAttribute('type', 'checkbox');
			cb.setAttribute('id', 'hmiLnk_' + id.replace(':', '_'));
			var lbl = document.createElement('label');
			lbl.setAttribute('for', cb.id);
			mxUtils.write(lbl, T(labelKey));
			var btn = Hmi.Editors.button('…', function()
			{
				openConfig(id);
			});
			btn.setAttribute('title', T('hmiLnkConfigure'));
			btn.setAttribute('data-role', 'configure');
			cb.setAttribute('data-role', 'check');
			row.appendChild(cb);
			row.appendChild(lbl);
			addHelp(row, 'link.' + id);
			row.appendChild(btn);
			section.appendChild(row);
			rows[id] = {row: row, cb: cb, label: T(labelKey)};
			tab.ids.push(id);

			mxEvent.addListener(cb, 'change', function()
			{
				var p = id.split(':');

				if (cb.checked)
				{
					openConfig(id, true);
				}
				else if (isStore(id))
				{
					clearStore(store, id);
					dirty[STORE_GROUP[id]] = true;
					refreshRows();
				}
				else
				{
					delete links[p[0]];
					refreshRows();
				}
			});
		};

		var grid = null;
		var tab = null;

		GROUPS.forEach(function(g)
		{
			if (g.band != null)
			{
				var tabInfo = TAB_OF_BAND[g.band];
				tab = {id: tabInfo[0], ids: [], count: 0};
				var wrap = document.createElement('div');
				wrap.className = 'geHmiTabWrap';
				wrap.setAttribute('role', 'presentation');
				var button = document.createElement('button');
				button.setAttribute('type', 'button');
				button.className = 'geHmiTab';
				button.setAttribute('role', 'tab');
				button.setAttribute('id', 'hmiLnkTab_' + tabInfo[0]);
				button.setAttribute('aria-controls', 'hmiLnkPanel_' + tabInfo[0]);
				button.setAttribute('data-tab', tabInfo[0]);
				var label = document.createElement('span');
				label.className = 'geHmiTabLabel';
				mxUtils.write(label, T(tabInfo[1]));
				button.appendChild(label);
				tab.countEl = document.createElement('span');
				tab.countEl.className = 'geHmiTabCount';
				button.appendChild(tab.countEl);
				wrap.appendChild(button);
				addHelp(wrap, 'tab.' + tabInfo[0], T(tabInfo[1]));
				tablist.appendChild(wrap);
				tab.button = button;
				tab.wrap = wrap;
				tab.panel = document.createElement('div');
				tab.panel.className = 'geHmiTabPanel';
				tab.panel.setAttribute('role', 'tabpanel');
				tab.panel.setAttribute('id', 'hmiLnkPanel_' + tabInfo[0]);
				tab.panel.setAttribute('aria-labelledby', button.id);
				tab.panel.setAttribute('data-panel', tabInfo[0]);
				tab.panel.hidden = true;
				grid = document.createElement('div');
				grid.className = 'geHmiMasonry';
				tab.panel.appendChild(grid);
				panels.appendChild(tab.panel);
				tabs.push(tab);

				(function(t)
				{
					mxEvent.addListener(t.button, 'click', function()
					{
						selectTab(t, false);
					});
					mxEvent.addListener(t.button, 'keydown', function(evt)
					{
						var i = tabs.indexOf(t);
						var key = evt.key;
						var next = (key == 'ArrowRight' || key == 'ArrowDown') ? (i + 1) % tabs.length :
							((key == 'ArrowLeft' || key == 'ArrowUp') ? (i + tabs.length - 1) % tabs.length :
							((key == 'Home') ? 0 : ((key == 'End') ? tabs.length - 1 : -1)));

						if (next >= 0)
						{
							mxEvent.consume(evt);
							selectTab(tabs[next], true);
						}
					});
				})(tab);

				return;
			}

			var section = document.createElement('div');
			section.className = 'geDialogSection';
			var title = document.createElement('div');
			title.className = 'geHmiGroupTitle';
			mxUtils.write(title, T(g.title));
			addHelp(title, 'group.' + g.title);
			section.appendChild(title);
			grid.appendChild(section);

			if (g.color != null)
			{
				COLOR_KINDS.forEach(function(k)
				{
					addRow(section, g.color + ':' + k[0], k[1], tab);
				});
			}
			else
			{
				g.items.forEach(function(it)
				{
					addRow(section, it[0], it[1], tab);
				});
			}
		});

		div.appendChild(tablist);
		div.appendChild(panels);

		// Opens on the tab of the first enabled link, else on the last one used
		var first = null;

		for (var ti = 0; ti < tabs.length && first == null; ti++)
		{
			for (var tj = 0; tj < tabs[ti].ids.length; tj++)
			{
				if (isOn(tabs[ti].ids[tj]))
				{
					first = tabs[ti];
					break;
				}
			}
		}

		var initial = tabs[0];

		for (var tk = 0; tk < tabs.length; tk++)
		{
			if (tabs[tk].id == lastTab)
			{
				initial = tabs[tk];
			}
		}

		if (opts.tab != null || opts.link != null)
		{
			var want = (opts.link != null) ? layout().tab[opts.link] : opts.tab;

			for (var tw = 0; tw < tabs.length; tw++)
			{
				if (tabs[tw].id == want)
				{
					initial = tabs[tw];
					first = null;
				}
			}
		}

		if (first != null)
		{
			var keep = false;

			for (var tm = 0; tm < initial.ids.length; tm++)
			{
				keep = keep || isOn(initial.ids[tm]);
			}

			initial = keep ? initial : first;
		}

		refreshRows();
		selectTab(initial, false);
		LinksDialog.decorate(ui, true);

		var removeAll = Hmi.Editors.button(T('hmiLnkRemoveAll'), function()
		{
			links = {};

			STORE_IDS.forEach(function(id)
			{
				clearStore(store, id);
				dirty[STORE_GROUP[id]] = true;
			});

			refreshRows();
		});
		removeAll.style.cssText = 'float:left;margin-left:0;';
		removeAll.setAttribute('data-role', 'remove-all');

		var dlg = new CustomDialog(ui, div, function()
		{
			var out = LinksDialog.withDefaults(clone(links));

			graph.model.beginUpdate();
			try
			{
				Hmi.Model.setCellConfig(graph, cells, 'links', out);
				writeStore(graph, cells, store, dirty);

				for (var i = 0; i < pendingWindows.length; i++)
				{
					if (pendingWindows[i].page == ui.currentPage)
					{
						var cfg = Hmi.Model.getDocConfig(graph);
						cfg.window = pendingWindows[i].window;
						Hmi.Model.setDocConfig(graph, cfg);
					}
				}
			}
			finally
			{
				graph.model.endUpdate();
			}
		}, null, mxResources.get('ok'), null, removeAll, false, null, false);

		ui.showDialog(dlg.container, 1000, null, true, true, function()
		{
			if (!(ui.format != null && ui.format.hmiTabActive))
			{
				LinksDialog.decorate(ui, false);
			}
		});

		// Fixed size: the panel area gets the height of the tallest tab
		var tallest = 0;

		for (var tn = 0; tn < tabs.length; tn++)
		{
			for (var to = 0; to < tabs.length; to++)
			{
				tabs[to].panel.hidden = (to != tn);
			}

			tallest = Math.max(tallest, panels.offsetHeight);
		}

		for (var tp = 0; tp < tabs.length; tp++)
		{
			tabs[tp].panel.hidden = (tabs[tp] != selected);
		}

		panels.style.minHeight = tallest + 'px';
		Hmi.Editors.fitDialog(div);

		if (opts.link != null && rows[opts.link] != null)
		{
			openConfig(opts.link);
		}

		return dlg;
	};

	// ---------------------------------------------------------------
	// Link badge (design-time, never touches the model)
	// ---------------------------------------------------------------

	var BADGE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">' +
		'<rect x="0.5" y="0.5" width="15" height="15" rx="4" fill="#0071e3" stroke="#ffffff" stroke-width="1"/>' +
		'<g fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round">' +
		'<path d="M6.8 9.2l2.4-2.4"/><path d="M7.4 5.6l.8-.8a2.1 2.1 0 013 3l-.8.8"/>' +
		'<path d="M8.6 10.4l-.8.8a2.1 2.1 0 01-3-3l.8-.8"/></g></svg>';

	function badgeImage()
	{
		var uri = 'data:image/svg+xml;base64,' + (root.btoa != null ? root.btoa(BADGE_SVG) : '');

		return new mxImage(uri, 16, 16);
	};

	function hasLinks(cell)
	{
		var v = cell.value;
		var s = (v != null && typeof v === 'object' && v.getAttribute != null) ?
			v.getAttribute('hmiLinks') : null;

		return s != null && s !== '' && s !== '{}';
	};

	/**
	 * Shows (on=true) or removes (on=false) a small chain badge in the top
	 * right corner of every cell on the current page that has hmiLinks.
	 * Uses cell overlays only; the model is never modified.
	 */
	LinksDialog.decorate = function(ui, on)
	{
		var graph = ui.editor.graph;
		var st = ui.hmiLinkBadges;

		if (st == null)
		{
			st = ui.hmiLinkBadges = {on: false, timer: null, listener: null, pageListener: null};
		}

		function clear()
		{
			var cells = graph.model.cells;

			for (var id in cells)
			{
				var c = cells[id];

				if (c.overlays != null)
				{
					for (var i = c.overlays.length - 1; i >= 0; i--)
					{
						if (c.overlays[i].hmiLinkBadge)
						{
							graph.removeCellOverlay(c, c.overlays[i]);
						}
					}
				}
			}
		};

		function update()
		{
			st.timer = null;

			if (!st.on)
			{
				return;
			}

			clear();
			var cells = graph.model.cells;
			var image = badgeImage();

			for (var id in cells)
			{
				var c = cells[id];

				if (c != graph.model.getRoot() && hasLinks(c) && graph.model.contains(c))
				{
					var overlay = new mxCellOverlay(image, T('hmiAnimationLinks'),
						mxConstants.ALIGN_RIGHT, mxConstants.ALIGN_TOP, new mxPoint(-7, 7));
					overlay.hmiLinkBadge = true;
					overlay.cursor = 'pointer';
					overlay.addListener(mxEvent.CLICK, (function(cell)
					{
						return function()
						{
							LinksDialog.show(ui, [cell]);
						};
					})(c));
					graph.addCellOverlay(c, overlay);
				}
			}
		};

		function schedule()
		{
			if (st.timer == null)
			{
				st.timer = window.setTimeout(update, 60);
			}
		};

		if (on && !st.on)
		{
			st.on = true;
			st.listener = schedule;
			graph.model.addListener(mxEvent.CHANGE, st.listener);
			st.pageListener = schedule;
			ui.editor.addListener('pageSelected', st.pageListener);
			update();
		}
		else if (!on && st.on)
		{
			st.on = false;
			graph.model.removeListener(st.listener);
			ui.editor.removeListener(st.pageListener);

			if (st.timer != null)
			{
				window.clearTimeout(st.timer);
				st.timer = null;
			}

			clear();
		}
		else if (on)
		{
			update();
		}
	};

	LinksDialog.SPECS = SPECS;

	// Trigger and state machine editors, also used by the Page Triggers tab
	// of Screen Settings (returns an element with getValue and validate)
	LinksDialog.buildSimpleTrigger = function(ui, value)
	{
		return buildSimpleTrigger(ui, value);
	};

	LinksDialog.buildStateMachine = function(ui, value)
	{
		return buildStateMachine(ui, value);
	};
	LinksDialog.GROUPS = GROUPS;
	LinksDialog.ensureSpecs = function()
	{
		if (SPECS.valueDiscrete == null)
		{
			buildSpecs();
		}

		return SPECS;
	};

	Hmi.LinksDialog = LinksDialog;
})();
