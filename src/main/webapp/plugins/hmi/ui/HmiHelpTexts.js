/**
 * Hmi.HelpTexts: English help texts of the HMI dialogs (see ui/HmiHelp.js
 * for the text format). A resource hmiHelp_<key> (non-word characters
 * replaced by "_") overrides the text of a key.
 *
 * Key scheme:
 * - tab.<id>, group.<group title resource key>, link.<link id>
 * - field.<spec id>.<field key>, falling back to field.<field key>
 * - field.<spec id>.<list key>.<column key>, falling back to field.<list key>.<column key>
 * - heading.<heading resource key>
 * - halo.<name> and halo.object.<name>
 * - sources.*, source.<field>, credentials.* (Data Sources)
 * - tags.*, tag.<field>, tag.sim.*, tag.write.*, tag.alarms.* (Tags)
 * - tagBrowser.*, substitute.*, define.*, validator.*, diag.*, alarmList.*
 * - hmiTab.* (HMI tab), quick.*, binding.*, transform.*, event.*, trigger.*,
 *   condition.*, action.*, target.*, animation.*, item.json
 *
 * Only the editor needs these texts, they are not part of the viewer bundle.
 */
(function()
{
	var root = (typeof globalThis !== 'undefined') ? globalThis : window;
	var Hmi = root.Hmi = root.Hmi || {};

	var T = {};

	// H(key, title, line, ...): one paragraph per line, "- " starts a bullet
	function H(key, title)
	{
		T[key] = {title: title, text: Array.prototype.slice.call(arguments, 2).join('\n')};
	};

	var BROWSE = 'Double-click the field to browse the tags.';
	var DISCRETE = 'Zero, empty text, `false`, `off` and `no` count as false, anything else as true.';

	// ---------------------------------------------------------------
	// Tabs and groups
	// ---------------------------------------------------------------

	H('tab.display', 'Display links',
		'Display links change how the object looks in the running screen: value text, position, size, rotation, colours, fill level, blinking, visibility and more.',
		'Each link is driven by a tag or an expression. Several links can be combined on one object.');
	H('tab.animation', 'Animation links',
		'Animation links run continuous effects while a condition is true:',
		'- built-in animations such as spin, pulse and glow',
		'- flow along a pipe or edge',
		'- play or pause of a video or audio widget');
	H('tab.touch', 'Touch links',
		'Touch links let the operator act on the object with a click, touch or key: enter values, drag sliders, press buttons, open windows or URLs.',
		'- They only work in an interactive running screen.',
		'- Disabled and hidden objects ignore them.',
		'- Touch Options (confirmation, roles, delay) apply to all touch links of the object.');
	H('tab.scripts', 'Object scripts',
		'Object scripts run QuickScript code by themselves when a value changes or a condition becomes true or false. Use them for logic that no ready-made link covers.');

	H('group.hmiLnkValueDisplay', 'Value Display',
		'Shows a tag value as the text of the object, as a discrete (On/Off message), analog (number) or string expression.',
		'For analog values, put a mask such as `#.#` in the text of the object. The value replaces the mask.');
	H('group.hmiLnkLocation', 'Location',
		'Moves the object horizontally or vertically, in pixels, according to an expression. The movement is linear between two reference values and stops at them.');
	H('group.hmiLnkObjectSize', 'Object Size',
		'Scales the height or the width of the object as a percentage of its design size, driven by an expression.');
	H('group.hmiLnkLineColor', 'Line Color',
		'Changes the line colour of the object. Choose the kind:',
		'- Discrete: two colours for false and true',
		'- Analog: colour bands by value',
		'- Discrete / Analog alarm: colours follow the alarm state of a tag');
	H('group.hmiLnkFillColor', 'Fill Color',
		'Changes the fill colour of the object. Choose the kind:',
		'- Discrete: two colours for false and true',
		'- Analog: colour bands by value',
		'- Discrete / Analog alarm: colours follow the alarm state of a tag');
	H('group.hmiLnkTextColor', 'Text Color',
		'Changes the text colour of the object. Choose the kind:',
		'- Discrete: two colours for false and true',
		'- Analog: colour bands by value',
		'- Discrete / Analog alarm: colours follow the alarm state of a tag');
	H('group.hmiLnkPercentFill', 'Percent Fill',
		'Fills the object from one edge in proportion to a value, like the level of a tank.',
		'The filled part uses the colour of the object, the unfilled part the background colour of the link.');
	H('group.hmiLnkMiscellaneous', 'Miscellaneous',
		'More display effects: visibility, blinking, rotation (Orientation), disabling touch input, a tooltip and transparency (Opacity).');
	H('group.hmiLnkStatesProps', 'States and Properties',
		'Extension links from meta2d:',
		'- Multi-State: a look per matching value',
		'- Properties: set any style or attribute from an expression',
		'- Widget Data: feed gauges, tables and trend charts');
	H('group.hmiLnkAnimationGroup', 'Animation',
		'- Animation: spin, pulse, glow and other effects',
		'- Flow: moving dashes or dots along a pipe or edge',
		'- Media: play or pause a video or audio widget');
	H('group.hmiLnkUserInputs', 'User Inputs',
		'Clicking the object opens an input and writes the entered value to a tag.',
		'- Discrete: set or reset',
		'- Analog: a number',
		'- String: text',
		'- Choice: pick one option from a list');
	H('group.hmiLnkSliders', 'Sliders',
		'The object follows the value of a tag along a track and can be dragged by the operator. Dragging writes the tag.');
	H('group.hmiLnkTouchPushbuttons', 'Touch Pushbuttons',
		'Buttons that write a tag when pressed and released (Discrete Value), run scripts (Action), show or hide windows, or set, add or subtract a value (Analog/String Value).');
	H('group.hmiLnkActions', 'Actions',
		'Actions that need no tag: open a URL, send a message, start or stop animations and media.',
		'Touch Options adds confirmation, user roles and a delay to every touch link of the object.');
	H('group.hmiLnkObjectScripts', 'Object Scripts',
		'QuickScripts that run when a value changes (Data Change) or when a condition becomes true or false (Condition).');

	// ---------------------------------------------------------------
	// Links
	// ---------------------------------------------------------------

	H('link.valueDiscrete', 'Value Display: Discrete',
		'Shows one of two messages as the text of the object, depending on a discrete expression.',
		'Example: expression `Pump1/Run` with On message "Running" and Off message "Stopped".');
	H('link.valueAnalog', 'Value Display: Analog',
		'Shows the number of an analog expression as the text of the object.',
		'Format it with a mask in the text of the object (`#.#` gives one decimal, `000.0` pads with zeros) or with the advanced formatting (fixed, exponential, hex, binary).');
	H('link.valueString', 'Value Display: String',
		'Shows a string expression as the text of the object. Example: `Mode` or `StrUpper(Mode)`.');
	H('link.locationH', 'Location: Horizontal',
		'Moves the object left and right.',
		'- At the "At left" value of the expression the object is "To left" pixels left of its design position.',
		'- At the "At right" value it is "To right" pixels to the right.',
		'Between the two values it moves linearly.');
	H('link.locationV', 'Location: Vertical',
		'Moves the object up and down.',
		'- At the "At top" value of the expression the object is "Up" pixels above its design position.',
		'- At the "At bottom" value it is "Down" pixels below.',
		'Between the two values it moves linearly.');
	H('link.sizeHeight', 'Object Size: Height',
		'Changes the height of the object. The expression is mapped linearly from the minimum and maximum values to the height percentages (of the design height).',
		'The anchor decides which edge stays in place.');
	H('link.sizeWidth', 'Object Size: Width',
		'Changes the width of the object. The expression is mapped linearly from the minimum and maximum values to the width percentages (of the design width).',
		'The anchor decides which edge stays in place.');

	var TARGETS = [['lineColor', 'line', 'Line Color'], ['fillColor', 'fill', 'Fill Color'],
		['textColor', 'text', 'Text Color']];

	TARGETS.forEach(function(t)
	{
		H('link.' + t[0] + ':discrete', t[2] + ': Discrete',
			'Switches the ' + t[1] + ' colour between two colours: the Off colour while the discrete expression is false, the On colour while it is true.');
		H('link.' + t[0] + ':analog', t[2] + ': Analog',
			'Picks the ' + t[1] + ' colour from break points: the colour of the last break point whose value is not above the expression value. Below the first break point the first colour is used.',
			'Up to 10 break points, in ascending order.');
		H('link.' + t[0] + ':discreteAlarm', t[2] + ': Discrete alarm',
			'Uses the Alarm colour while the discrete tag is in alarm and the Normal colour otherwise. Needs only the tag name.');
		H('link.' + t[0] + ':analogAlarm', t[2] + ': Analog alarm',
			'The ' + t[1] + ' colour follows the alarm level of an analog tag. The alarm type selects the levels:',
			'- Value: Lo Lo, Lo, Hi and Hi Hi limits of the tag',
			'- Deviation: minor and major deviation from a target',
			'- Rate of change: change per second above a limit',
			'The limits come from the tag definition.');
	});

	H('link.fillVertical', 'Percent Fill: Vertical',
		'Fills the object from the bottom up (or from the top down) in proportion to the expression, like a tank level.',
		'The filled part uses the colour of the object, the rest the background colour of the link.');
	H('link.fillHorizontal', 'Percent Fill: Horizontal',
		'Fills the object from left to right (or right to left) in proportion to the expression, like a progress bar.',
		'The filled part uses the colour of the object, the rest the background colour of the link.');
	H('link.visibility', 'Visibility',
		'Shows or hides the object depending on a discrete expression. A hidden object gets no touch input and its key equivalents are inactive.');
	H('link.blink', 'Blink',
		'Makes the object blink while a discrete expression is true. Either it alternates between visible and invisible, or it alternates between its colours and the blink colours.',
		'All blinking objects of one speed blink in step.');
	H('link.orientation', 'Orientation',
		'Rotates the object according to an expression, between a counter-clockwise and a clockwise angle. The rotation point can be moved away from the centre of the object.',
		'Good for needles, valves and wheels.');
	H('link.disable', 'Disable',
		'Disables touch input of the object depending on a discrete expression.',
		'Disabled objects, and the objects inside them, ignore clicks, events and key equivalents. The cursor shows "not allowed".');
	H('link.tooltip', 'Tooltip',
		'Sets the tooltip that appears when the mouse rests on the object: a fixed text (up to 131 characters) or the value of an expression.');
	H('link.opacity', 'Opacity',
		'Changes the transparency of the object from an expression: 0 % is invisible, 100 % is fully opaque.');
	H('link.states', 'Multi-State',
		'Gives the object a different look for each value of one expression.',
		'- The states are checked from top to bottom. The first match wins.',
		'- A state can change colours, text, image, opacity, visibility and blinking. Empty settings keep the design.',
		'- Put a state with `*` last as the default.');
	H('link.properties', 'Properties',
		'Sets any property of the object from an expression, with one row per property: style keys (`style:fillColor`), attributes, the label, the tooltip or the visibility.');
	H('link.widgetData', 'Widget Data',
		'Feeds a gauge, tank, table or chart widget. The expression sets the value of the widget; each series adds samples of a tag to a trend chart.');
	H('link.animation', 'Animation',
		'Runs an animation while a condition holds: spin, pulse, shake, fade, blink, colour cycle, bounce, sway, glow or a named custom animation.',
		'Optional expressions control the speed and the direction.');
	H('link.flow', 'Flow',
		'Animates the flow along a pipe or edge while a condition holds, as dashes, dots, beads, arrows or liquid. Optional expressions set the speed and reverse the direction.');
	H('link.media', 'Media',
		'Plays or pauses a video or audio widget while a discrete expression is true.');
	H('link.inputDiscrete', 'User Input: Discrete',
		'Clicking the object opens a small dialog with a Set and a Reset button that write 1 or 0 to the tag.',
		'Unless "Input only" is checked, the text of the object shows the On or Off message of the tag.');
	H('link.inputAnalog', 'User Input: Analog',
		'Clicking the object opens an input for a number: an inline editor, or the on-screen keypad. The value is checked against the minimum and maximum and then written to the tag.',
		'Unless "Input only" is checked, the text of the object shows the formatted value.');
	H('link.inputString', 'User Input: String',
		'Clicking the object opens an input for text: an inline editor, or the on-screen keyboard. The text is written to the tag.',
		'Echo can hide the typed text (password). Unless "Input only" is checked, the text of the object shows the value.');
	H('link.inputChoice', 'User Input: Choice',
		'Clicking the object opens a list of options. The value of the chosen option is written to the tag.');
	H('link.sliderV', 'Slider: Vertical',
		'The object follows the value of the tag up and down, like a vertical location link, and the operator can drag it. Dragging writes the value to the tag.');
	H('link.sliderH', 'Slider: Horizontal',
		'The object follows the value of the tag left and right, like a horizontal location link, and the operator can drag it. Dragging writes the value to the tag.');
	H('link.pushDiscrete', 'Pushbutton: Discrete Value',
		'Writes a discrete tag when the mouse button is pressed and again when it is released. The action selects the values: Direct, Reverse, Toggle, Reset or Set.');
	H('link.pushAction', 'Pushbutton: Action',
		'Runs QuickScripts on mouse events: left or right button down, up and double click, mouse over and mouse leave.',
		'Add several scripts for different conditions. The "while" conditions repeat at the chosen period.');
	H('link.showWindow', 'Pushbutton: Show Window',
		'Shows the chosen windows when the object is touched. Windows are pages. The window type of the current page (replace, overlay or popup) can also be set here.');
	H('link.hideWindow', 'Pushbutton: Hide Window',
		'Hides the chosen windows when the object is touched. Windows are pages.');
	H('link.pushValue', 'Pushbutton: Analog/String Value',
		'Pushbutton for analog and string tags. It writes a fixed value, adds to or subtracts from the current value (kept within a minimum and maximum), or writes the result of an expression.');
	H('link.openUrl', 'Open URL',
		'Opens a web address when the object is touched, in a new tab, in the same tab or in a dialog window.',
		'Only `http`, `https` and relative URLs are allowed.');
	H('link.sendMessage', 'Send Message',
		'Sends a named message when the object is touched: to the page (HMI message events), to the embedding web page, or to both. An optional expression adds a payload.');
	H('link.control', 'Animation/Media Control',
		'Starts, pauses or stops animations and media of objects when this object is touched.');
	H('link.touchOptions', 'Touch Options',
		'Settings for every touch link of this object:',
		'- ask for a confirmation first',
		'- limit the object to certain user roles',
		'- delay the action',
		'Sliders honour the roles only.');
	H('link.dataChange', 'Data Change script',
		'Runs a QuickScript whenever the value of an expression changes by more than the deadband. It also runs once when the page opens.');
	H('link.condition', 'Condition script',
		'Runs QuickScripts when an expression becomes true, becomes false, or repeatedly while it is true or false.');

	// ---------------------------------------------------------------
	// Headings
	// ---------------------------------------------------------------

	H('heading.hmiLnkExprValue', 'Expression value',
		'The two values of the expression that match the two ends of the effect. Between them the effect is linear. Beyond them it stays at its limit.');
	H('heading.hmiLnkMovePixels', 'Move distance',
		'How far the object is moved, in pixels from its design position, at the two expression values above.');
	H('heading.hmiLnkRotationDegrees', 'Rotation',
		'The angle in degrees (0 to 360) the object is turned at each of the two expression values.');
	H('heading.hmiLnkRotationPoint', 'Rotation point',
		'The point the object turns around, given as an offset in pixels from the centre of the object. 0 and 0 is the centre.');
	H('heading.hmiLnkHeightPercent', 'Height percent',
		'Height of the object at the minimum and maximum value, as a percentage of its design height.');
	H('heading.hmiLnkWidthPercent', 'Width percent',
		'Width of the object at the minimum and maximum value, as a percentage of its design width.');
	H('heading.hmiLnkFillPercent', 'Fill percent',
		'How much of the object is filled at the minimum and maximum value, in percent. 0 is empty and 100 is full.');
	H('heading.hmiLnkOpacityPercent', 'Opacity percent',
		'Opacity at the minimum and maximum value, in percent. 0 is invisible and 100 is opaque.');
	H('heading.hmiLnkAdvancedFormatting', 'Advanced formatting',
		'Controls how the number is turned into text. Plain "Text" uses the mask in the text of the object, for example `Level = #.# %`.');

	// ---------------------------------------------------------------
	// Fields shared by many links
	// ---------------------------------------------------------------

	H('field.expr', 'Expression',
		'The expression that drives this link. It can be a tag name, a comparison or a calculation, for example `TankLevel`, `TankLevel > 75` or `Tank_CV * 0.06`.',
		'Operators `AND`, `OR`, `NOT`, `MOD` and `<>` work, as do functions such as `IF(c, a, b)` and `Text(x, "#.0")`. ' + BROWSE);
	H('field.valueDiscrete.expr', 'Discrete expression',
		'True shows the On message, false the Off message. Example: `Pump1/Run` or `TankLevel > 75`.',
		DISCRETE);
	H('field.valueAnalog.expr', 'Analog expression',
		'The number to show. Example: `TankLevel` or `Tank_CV * 0.06`. It is formatted by the mask in the text of the object or by the advanced format below.');
	H('field.valueString.expr', 'String expression',
		'The text to show. Example: `Mode`, or `StrUpper(Mode)` for capitals. A `+` joins texts.');
	H('field.locationH.expr', 'Analog expression',
		'The value that decides where the object is horizontally. Example: `PumpPos`.');
	H('field.locationV.expr', 'Analog expression',
		'The value that decides where the object is vertically. Example: `LiftHeight`.');
	H('field.orientation.expr', 'Analog expression',
		'The value that decides the angle of the object. Example: `Gauge1`.');

	['visibility', 'blink', 'disable', 'media', 'animation', 'flow', 'condition'].forEach(function(id)
	{
		var what = {visibility: 'The object is visible while this is true (or false, as chosen below).',
			blink: 'The object blinks while this is true.',
			disable: 'Touch input is disabled while this is true (or false, as chosen below).',
			media: 'The media plays (or pauses, as chosen below) while this is true.',
			animation: 'The animation runs while this is true. Leave it empty to run always.',
			flow: 'The flow runs while this is true. Leave it empty to run always.',
			condition: 'The scripts below run when this changes between true and false.'}[id];
		H('field.' + id + '.expr', 'Discrete expression',
			what + ' Example: `Pump1/Run` or `TankLevel > 75`.', DISCRETE);
	});

	H('field.fillColor:discrete.expr', 'Discrete expression',
		'Decides between the two colours: false gives the Off colour, true the On colour. Example: `Pump1/Run`.', DISCRETE);
	H('field.lineColor:discrete.expr', 'Discrete expression',
		'Decides between the two colours: false gives the Off colour, true the On colour. Example: `Pump1/Run`.', DISCRETE);
	H('field.textColor:discrete.expr', 'Discrete expression',
		'Decides between the two colours: false gives the Off colour, true the On colour. Example: `Pump1/Run`.', DISCRETE);
	H('field.states.expr', 'Expression',
		'The value that is compared with the Match of each state. Example: `PumpState` with states `0`, `1` and `*`.');
	H('field.widgetData.expr', 'Expression',
		'Sets the value of the widget, for example the pointer of a gauge. Arrays and objects are accepted for table, bar and pie widgets. Optional.');
	H('field.dataChange.expr', 'Watched expression',
		'The script runs whenever the value of this expression changes. Example: `TankLevel`.');
	H('field.tooltip.expr', 'Tooltip expression',
		'The value of this expression is the tooltip text. Example: `"Level: " + TankLevel`.');

	H('field.tag', 'Tagname',
		'The tag this link reads or writes. For alarm colours it is the tag whose alarm state selects the colour; the limits come from the tag definition.',
		BROWSE + ' Wildcards such as `Tank*` and `Pump?` filter the list.');
	H('field.message', 'Message',
		'A prompt shown in the input dialog or keypad to tell the operator what to enter. Optional.');
	H('field.inputOnly', 'Input only',
		'When checked, the object only accepts input. Its text is not replaced by the value of the tag.');
	H('field.keypad', 'On-screen keypad',
		'Uses the on-screen keypad (or keyboard) instead of an inline editor on the object. Useful on touch screens.');
	H('field.inputString.keypad', 'On-screen keyboard',
		'Uses the on-screen keyboard instead of an inline editor on the object. Useful on touch screens.');
	H('field.inputAnalog.keypad', 'On-screen keypad',
		'Uses the on-screen numeric keypad instead of an inline editor on the object. Useful on touch screens.');

	// Value ranges
	H('field.valueAtMin', 'Value at minimum',
		'The expression value that gives the minimum percentage. Example: 0.');
	H('field.valueAtMax', 'Value at maximum',
		'The expression value that gives the maximum percentage. Example: 100. Values beyond the two are clamped.');
	H('field.minPercent', 'Minimum percent',
		'The percentage (of the design size, the fill level or the opacity) at the minimum value. Example: 0.');
	H('field.maxPercent', 'Maximum percent',
		'The percentage at the maximum value. Example: 100.');
	H('field.anchor', 'Anchor',
		'The part of the object that stays in place while it grows or shrinks.',
		'- Height: top, middle or bottom (default bottom)',
		'- Width: left, center or right (default left)');
	H('field.direction', 'Fill direction',
		'The direction the fill grows in. Vertical: up (from the bottom) or down. Horizontal: right (from the left edge) or left.');
	H('field.backgroundColor', 'Background color',
		'The colour of the unfilled part, as #RRGGBB. The filled part keeps the colour of the object.');

	// Location and slider
	H('field.atLeft', 'At left',
		'The expression (or tag) value at which the object is moved fully to the left. Example: 0. Pixels are set under "To left".');
	H('field.atRight', 'At right',
		'The expression (or tag) value at which the object is moved fully to the right. Example: 100. Pixels are set under "To right".');
	H('field.atTop', 'At top',
		'The expression (or tag) value at which the object is moved fully up. Example: 100. Pixels are set under "Up".');
	H('field.atBottom', 'At bottom',
		'The expression (or tag) value at which the object is moved fully down. Example: 0. Pixels are set under "Down".');
	H('field.toLeft', 'To left',
		'Pixels the object is moved to the left of its design position at the "At left" value. Not negative.');
	H('field.toRight', 'To right',
		'Pixels the object is moved to the right of its design position at the "At right" value. Not negative.');
	H('field.up', 'Up',
		'Pixels the object is moved up from its design position at the "At top" value. Not negative.');
	H('field.down', 'Down',
		'Pixels the object is moved down from its design position at the "At bottom" value. Not negative.');
	H('field.reference', 'Reference point',
		'The point of the object that sits at the mouse while it is dragged: left, center or right (horizontal), top, middle or bottom (vertical).');

	// Orientation
	H('field.valueAtMaxCCW', 'Value at max CCW',
		'The expression value at which the object is turned fully counter-clockwise.');
	H('field.valueAtMaxCW', 'Value at max CW',
		'The expression value at which the object is turned fully clockwise.');
	H('field.ccwRotation', 'CCW rotation',
		'The angle in degrees (0 to 360) the object is turned counter-clockwise at the "max CCW" value.');
	H('field.cwRotation', 'CW rotation',
		'The angle in degrees (0 to 360) the object is turned clockwise at the "max CW" value.');
	H('field.offsetX', 'Rotation point X',
		'Horizontal offset in pixels of the rotation point from the centre of the object. 0 turns around the centre.');
	H('field.offsetY', 'Rotation point Y',
		'Vertical offset in pixels of the rotation point from the centre of the object. 0 turns around the centre.');

	// Messages
	H('field.valueDiscrete.onMessage', 'On message',
		'The text shown while the expression is true. Example: `Running`.');
	H('field.valueDiscrete.offMessage', 'Off message',
		'The text shown while the expression is false. Example: `Stopped`.');
	H('field.inputDiscrete.onMessage', 'On message',
		'The text the object shows while the tag is 1 (unless "Input only" is checked).');
	H('field.inputDiscrete.offMessage', 'Off message',
		'The text the object shows while the tag is 0 (unless "Input only" is checked).');
	H('field.setPrompt', 'Set prompt',
		'The caption of the button that writes 1 to the tag. Default: On.');
	H('field.resetPrompt', 'Reset prompt',
		'The caption of the button that writes 0 to the tag. Default: Off.');

	// Format
	H('field.format.mode', 'Formatting',
		'How the number becomes text:',
		'- Text: uses the mask in the text of the object, for example `#.#`',
		'- Real: the number as it is, up to 6 decimals',
		'- Fixed: always Precision decimals',
		'- Integer: rounded',
		'- Exponential: for example `1.5E+3`',
		'- Hex, Binary: the bits From to To of the value');
	H('field.format.precision', 'Precision',
		'The number of decimals, 0 to 8. Used by Fixed and Exponential.');
	H('field.format.bitsFrom', 'Bits from',
		'The first bit, 0 to 31, shown by Hex and Binary. A single bit when From and To are equal.');
	H('field.format.bitsTo', 'Bits to',
		'The last bit, 0 to 31, shown by Hex and Binary. The order of From and To does not matter.');
	H('field.format.fixedWidth', 'Fixed width',
		'Keeps the output within the length of the text of the object. A longer result is replaced by `*` characters. Not available for Text.');

	// Colours
	H('field.offColor', 'Off color',
		'The colour (#RRGGBB) used while the expression is false. Click the swatch to pick a colour.');
	H('field.onColor', 'On color',
		'The colour (#RRGGBB) used while the expression is true. Click the swatch to pick a colour.');
	H('field.normalColor', 'Normal color',
		'The colour (#RRGGBB) used while the tag has no active alarm.');
	H('field.alarmColor', 'Alarm color',
		'The colour (#RRGGBB) used while the tag has an active alarm.');
	H('field.alarmType', 'Alarm type',
		'Which alarm levels select the colour:',
		'- Value: Lo Lo, Lo, Hi and Hi Hi limits of the tag',
		'- Deviation: minor and major deviation from the target of the tag',
		'- Rate of change: a rate above the limit of the tag');
	H('field.breakpoints', 'Break points',
		'Pairs of a value and a colour, in ascending order of value. The colour of the last break point whose value is not above the expression value is used. Below the first value the first colour is used. Up to 10.');
	H('field.breakpoints.value', 'Break point value',
		'The expression value from which this colour applies. Each value must be larger than the one above.');
	H('field.breakpoints.color', 'Break point color',
		'The colour (#RRGGBB) used from this value on.');
	H('field.colors.normal', 'Normal color', 'The colour used while the tag has no alarm.');
	H('field.colors.lolo', 'Lo Lo color', 'The colour used while the value is below the Lo Lo limit of the tag.');
	H('field.colors.lo', 'Lo color', 'The colour used while the value is below the Lo limit of the tag.');
	H('field.colors.hi', 'Hi color', 'The colour used while the value is above the Hi limit of the tag.');
	H('field.colors.hihi', 'Hi Hi color', 'The colour used while the value is above the Hi Hi limit of the tag.');
	H('field.colors.minor', 'Minor color', 'The colour used while the value deviates from the target by at least the minor deviation.');
	H('field.colors.major', 'Major color', 'The colour used while the value deviates from the target by at least the major deviation.');
	H('field.colors.roc', 'Rate of change color', 'The colour used while the value changes faster than the rate of change limit of the tag.');

	// Blink
	H('field.blink.mode', 'Blink mode',
		'- Invisible: the object alternates between visible and invisible.',
		'- Visible: the object stays visible and alternates between its design colours and the colours below.');
	H('field.blink.speed', 'Blink speed',
		'Slow, medium or fast. The default half-periods are 1000, 500 and 250 ms.');
	H('field.blink.textColor', 'Blink text color',
		'The text colour while it blinks (visible mode). Empty leaves the text colour alone.');
	H('field.blink.lineColor', 'Blink line color',
		'The line colour while it blinks (visible mode). Empty leaves the line colour alone.');
	H('field.blink.fillColor', 'Blink fill color',
		'The fill colour while it blinks (visible mode). Empty leaves the fill colour alone.');

	// Visibility, disable, tooltip
	H('field.visibleState', 'Visible when',
		'"True" shows the object while the expression is true. "False" shows it while the expression is false.');
	H('field.disabledState', 'Disabled when',
		'"True" disables touch input while the expression is true. "False" disables it while the expression is false.');
	H('field.tooltip.mode', 'Tooltip source',
		'"Static text" uses a fixed text. "Expression" shows the current value of an expression.');
	H('field.tooltip.text', 'Tooltip text',
		'The fixed tooltip text, up to 131 characters.');

	// Input
	H('field.inputAnalog.min', 'Minimum',
		'The lowest value the operator may enter. A number, or the name of a tag that holds the limit. Default 1.',
		'If the tag cannot be read, the limits of the tag definition are used.');
	H('field.inputAnalog.max', 'Maximum',
		'The highest value the operator may enter. A number, or the name of a tag that holds the limit. Default 100. It must be larger than the minimum.');
	H('field.echo', 'Echo',
		'How typed characters are shown: Yes shows them, No shows nothing, Password hides them behind the password character.');
	H('field.passwordChar', 'Password character',
		'The single character that hides the typed text. Default `*`.');
	H('field.encrypt', 'Encrypt',
		'Writes a SHA-256 hash (hex) of the text to the tag instead of the text itself.');

	// Pushbuttons
	H('field.pushDiscrete.action', 'Action',
		'What the button writes to the tag:',
		'- Direct: 1 when pressed, 0 when released',
		'- Reverse: 0 when pressed, 1 when released',
		'- Toggle: flips the value when pressed',
		'- Reset: writes 0 when pressed',
		'- Set: writes 1 when pressed');
	H('field.pushValue.action', 'Action',
		'What the button does when pressed:',
		'- Set: writes the value',
		'- Add / Subtract: changes the current value by the value, within Minimum and Maximum',
		'- Expression: writes the result of an expression');
	H('field.pushValue.value', 'Value',
		'The number or text to write, or the amount to add or subtract. Numbers are written as numbers.');
	H('field.pushValue.expr', 'Expression',
		'The result of this expression is written to the tag. Example: `Setpoint * 2` or `IF(Mode, 10, 0)`.');
	H('field.pushValue.min', 'Minimum',
		'The result of Add and Subtract is not set below this number. Optional.');
	H('field.pushValue.max', 'Maximum',
		'The result of Add and Subtract is not set above this number. Optional.');

	// Key equivalent
	H('field.key', 'Key equivalent',
		'A key that activates this link from the keyboard, like a click. Choose F1 to F16, a letter, a digit or a named key such as Enter. "None" turns it off.',
		'- Only visible and enabled objects of the current page react.',
		'- If several objects use the same key, the topmost one wins.');
	H('field.key.ctrl', 'Ctrl', 'The key only works while Ctrl is held down.');
	H('field.key.shift', 'Shift', 'The key only works while Shift is held down.');

	// Scripts of pushbuttons
	H('field.scripts.condition', 'Condition',
		'When the script runs: on or while the left or right button is down, on release, on double click, on mouse over or when the mouse leaves.',
		'"While" conditions repeat at the period below.');
	H('field.scripts.period', 'Period',
		'How often a "while" script repeats, in milliseconds. At least 10, default 500.');
	H('field.scripts.script', 'QuickScript',
		'The script to run. It can assign tags, use `IF ... THEN ... ENDIF` and `FOR ... NEXT`, and call functions such as `Show("Details")`, `Hide("Details")` and `LogMessage("text")`.',
		'Example: `Setpoint = Setpoint + 1;`. "Check" validates the syntax.');

	// Windows
	H('field.windows', 'Windows',
		'The windows (pages) this link works on. Tick one or more.');
	H('field.windows.settings', 'Window settings',
		'How the current page behaves as a window when another page shows it. The settings are saved with this page and can be undone.');
	H('field.windows.type', 'Window type',
		'- Replace: navigates to the page.',
		'- Overlay: opens it in a floating window.',
		'- Popup: opens it in a modal floating window.');
	H('field.windows.x', 'Window X', 'The horizontal position of a floating window, in pixels. Empty centres it.');
	H('field.windows.y', 'Window Y', 'The vertical position of a floating window, in pixels. Empty centres it.');
	H('field.windows.width', 'Window width', 'The width of a floating window, in pixels. Empty uses the size of the page.');
	H('field.windows.height', 'Window height', 'The height of a floating window, in pixels. Empty uses the size of the page.');
	H('field.windows.title', 'Window title', 'The title of a floating window. Empty uses the name of the page.');

	// States and properties
	H('field.states', 'States',
		'One state per value to react to. The states are checked from top to bottom and the first match wins, so put specific matches first and `*` last as the default.');
	H('field.states.match', 'Match',
		'Which values select this state:',
		'- A single value: `1`',
		'- A range: `10..20` (from 10 up to, but not including, 20)',
		'- A list: `1,3,5..8`',
		'- `*`: any value',
		'Numbers compare as numbers, other values as text without regard to case.');
	H('field.states.label', 'Label',
		'The text of the object in this state. A `#` mask is replaced by the value, for example `Level #.#`. Empty keeps the design text.');
	H('field.states.fillColor', 'Fill color', 'The fill colour (#RRGGBB) in this state. Empty keeps the design colour.');
	H('field.states.lineColor', 'Line color', 'The line colour (#RRGGBB) in this state. Empty keeps the design colour.');
	H('field.states.textColor', 'Text color', 'The text colour (#RRGGBB) in this state. Empty keeps the design colour.');
	H('field.states.image', 'Image', 'The URL of an image to show in this state. Empty keeps the design image.');
	H('field.states.opacity', 'Opacity', 'The opacity in percent, 0 to 100, in this state. Empty keeps the design value.');
	H('field.states.visible', 'Visibility', 'Keep the design visibility, or force the object visible or hidden in this state.');
	H('field.states.blink', 'Blink', 'Makes the object blink in this state.');
	H('field.items', 'Properties',
		'One row per property. On every update the value of the expression is written to the target.');
	H('field.items.target', 'Target',
		'The property to set:',
		'- `style:<key>`, for example `style:fillColor`, `style:rotation` or `style:flipH`',
		'- `attr:<name>` or `prop:<name>`',
		'- `label`, `tooltip` or `visible`',
		'The list offers the common targets.');
	H('field.items.expr', 'Expression',
		'The expression whose value is written to the target. Example: `IF(Level > 80, "#FF0000", "#00AA00")` for `style:fillColor`.');
	H('field.series', 'Series',
		'Tags to record for a trend chart. Every update of a tag adds a sample to the chart of the widget.');
	H('field.series.tag', 'Series tag', 'The tag to record.');
	H('field.series.name', 'Series name', 'The name of the series in the chart. Optional.');
	H('field.series.maxPoints', 'Max points', 'How many samples are kept before the oldest are dropped. Default 600.');

	// Animation and flow
	H('field.preset', 'Animation',
		'The built-in animation: spin, pulse, shake, fade in and out, blink, colour cycle, bounce (up and down), sway (left and right), glow, or a custom animation by name.');
	H('field.animation.name', 'Animation name',
		'The name of a keyframe animation defined for this object. Used by the Custom preset.');
	H('field.animation.color', 'Glow color',
		'The colour of the glow (#RRGGBB). Optional.');
	H('field.rateExpr', 'Rate',
		'An expression for the speed. For spin it is the revolutions per minute, for the other presets the cycles per minute. A value of 0 or less pauses the animation. Optional.');
	H('field.reverseExpr', 'Reverse when',
		'While this expression is true the direction is reversed. Optional.');
	H('field.flow.type', 'Flow type',
		'How the flow looks: dashes, dots, beads, arrows or liquid.');
	H('field.flow.color', 'Flow color',
		'The colour of the flow (#RRGGBB). Empty keeps the line colour.');
	H('field.flow.width', 'Line width',
		'The width of the flow line in pixels. Empty keeps the line width of the object.');
	H('field.speedExpr', 'Speed',
		'An expression for the speed. 1 is normal, 2 is twice as fast. A value of 0 or less stops the flow. Optional.');
	H('field.media.mode', 'Media mode',
		'"Play" plays while the expression is true. "Pause" pauses while it is true.');

	// Inputs, actions
	H('field.options', 'Options',
		'The choices the operator can pick from, in the order shown.');
	H('field.options.label', 'Option label', 'The text shown to the operator.');
	H('field.options.value', 'Option value', 'The value written to the tag when this option is picked. Numbers are written as numbers.');
	H('field.url', 'URL',
		'The address to open, for example `https://example.com/manual.pdf`. Only `http`, `https` and relative URLs are allowed. `${var}` placeholders are replaced.');
	H('field.target', 'Open in',
		'"New tab" and "Same tab" open the browser. "Dialog" opens a floating window inside the screen.');
	H('field.openUrl.title', 'Window title', 'The title of the dialog window. Optional.');
	H('field.openUrl.width', 'Dialog width', 'The width of the dialog window in pixels. Default 640.');
	H('field.openUrl.height', 'Dialog height', 'The height of the dialog window in pixels. Default 480.');
	H('field.sendMessage.name', 'Message name',
		'The name of the message. Receivers (HMI message events or the embedding page) react to this name.');
	H('field.payloadExpr', 'Payload',
		'An expression evaluated when the object is touched. Its value is sent along with the message. Optional.');
	H('field.to', 'Send to',
		'- Page: HMI message events of this page',
		'- Host: the web page that embeds the screen (postMessage)',
		'- Both');
	H('field.commands', 'Commands',
		'What happens to which object when this object is touched. Commands run in the order shown.');
	H('field.commands.object', 'Target object',
		'Which object the command is for:',
		'- empty or `Me`: this object',
		'- an object id',
		'- `tag:<name>`: every object that has this draw.io tag');
	H('field.commands.command', 'Command',
		'Start, pause or stop an animation, or play, pause or stop a video or audio widget.');
	H('field.commands.animation', 'Animation name',
		'The animation the command is for. Empty uses the preset of the Animation link of the target, or its first named animation. Only for the animation commands.');
	H('field.confirm', 'Confirmation',
		'A text that is shown for confirmation before any touch link of this object acts. Empty asks nothing. Pushbuttons ask when pressed; if refused, nothing is written.');
	H('field.confirmTitle', 'Confirmation title', 'The title of the confirmation window. Optional.');
	H('field.roles', 'Roles',
		'Only users with one of these roles can use the touch links of this object. Others see it as disabled. Separate roles with commas, for example `operator, admin`. Empty allows everybody.');
	H('field.delay', 'Delay',
		'Waits this many milliseconds, after any confirmation, before the touch action is done. 0 acts at once.');

	// Scripts
	H('field.deadband', 'Deadband',
		'For numbers, the script runs again only after the value changed by more than this amount. 0 runs on every change.');
	H('field.script', 'QuickScript',
		'The script to run. It can assign tags, use `IF ... THEN ... ENDIF` and `FOR ... NEXT`, and call functions such as `Show("Details")` and `LogMessage("text")`.',
		'Example: `Alarmed = TankLevel > 90;`. "Check" validates the syntax.');
	H('field.onTrue', 'On true', 'Runs once when the expression changes from false to true.');
	H('field.onFalse', 'On false', 'Runs once when the expression changes from true to false.');
	H('field.whileTrue', 'While true', 'Runs repeatedly, at the period below, while the expression is true.');
	H('field.whileFalse', 'While false', 'Runs repeatedly, at the period below, while the expression is false.');
	H('field.period', 'Period',
		'How often the "while" scripts repeat, in milliseconds. At least 100, default 1000.');

	// ---------------------------------------------------------------
	// Hover Halo
	// ---------------------------------------------------------------

	H('halo.dialog', 'Hover Halo',
		'How interactive objects are highlighted in a running screen: when the mouse is over them, when they have keyboard focus and while they are pressed.',
		'The settings belong to this page. Single objects can override style, outline and colour in the HMI tab.');
	H('halo.presets', 'Presets',
		'Ready-made looks: soft, subtle and strong glow, crisp, shape and dashed outline, glow with outline, or off.',
		'A preset keeps your colour and the pressed settings.');
	H('halo.preview', 'Preview',
		'Shows the halo on a light and a dark background. Point at or press the samples to see the hover and pressed looks.');
	H('halo.enabled', 'Show hover halo',
		'Turns the halo on or off for the whole page. Objects can still turn it off individually.');
	H('halo.style', 'Style',
		'- Glow: a soft light that follows the shape of the object.',
		'- Outline: a crisp line around the object.',
		'- Glow and outline: both.');
	H('halo.color', 'Color',
		'The colour of the glow and the outline, as #RRGGBB. Default `#1E88E5`.');
	H('halo.size', 'Glow size',
		'How far the glow reaches, 1 to 40 px. Default 6 px.');
	H('halo.intensity', 'Glow intensity',
		'How strong the glow is, 10 to 100 %. Default 100 %.');
	H('halo.width', 'Outline width',
		'The thickness of the outline, 1 to 8 px. Default 2 px.');
	H('halo.outlineShape', 'Outline shape',
		'- Rectangle: the outline surrounds the bounds of the object.',
		'- Follow the shape: the outline keeps a fixed distance from the outline of the object, so a round lamp gets a round ring.');
	H('halo.padding', 'Outline padding',
		'The gap between the object and its outline, 0 to 20 px. Default 3 px.');
	H('halo.radius', 'Corner radius',
		'The roundness of the corners of a rectangle outline, 0 to 20 px. Default 4 px. Not used when the outline follows the shape.');
	H('halo.dashed', 'Dashed outline',
		'Draws the rectangle outline as dashes. Not used when the outline follows the shape.');
	H('halo.press', 'Stronger halo while pressed',
		'Makes the halo stronger while the mouse button is held down on the object.');
	H('halo.pressColor', 'Pressed color',
		'A separate colour (#RRGGBB) while the object is pressed. Empty uses the same colour.');
	H('halo.object.style', 'Halo style of the objects',
		'Overrides the page setting for the selected objects: Glow, Outline, Glow and outline, or Off. "Page default" uses the page setting.');
	H('halo.object.outlineShape', 'Outline shape of the objects',
		'Overrides the outline shape for the selected objects: Rectangle or Follow the shape. "Page default" uses the page setting.');
	H('halo.object.color', 'Halo color of the objects',
		'Overrides the halo colour (#RRGGBB) for the selected objects. Empty uses the colour of the page.');

	// ---------------------------------------------------------------
	// Data Sources dialog and source editor
	// ---------------------------------------------------------------

	H('sources.dialog', 'Data Sources',
		'Data sources are the connections that deliver tag values (MQTT, WebSocket, HTTP polling, Server-Sent Events) or receive them from the host page.',
		'- Connections open only in a running screen or in Live Preview, never while you edit.',
		'- Click a source to edit it, tick or clear the box to enable or disable it.',
		'- OK saves the list with the document.');
	H('sources.list', 'Source list',
		'One row per source: the enabled box, the name, the type and the URL.',
		'- Click the name to edit the source.',
		'- Test Connection opens a temporary connection for 5 seconds and shows the state and the messages. It does not touch the real tag values.',
		'- Delete removes the source from the list. It takes effect when you click OK.',
		'A disabled source is kept in the file but never connects.');
	H('sources.add', 'Add Source',
		'Adds a new MQTT source with a generated id. Choose the type in the editor that opens.');

	H('source.dialog', 'Edit source',
		'The settings of one data source. The fields below the URL depend on the type.',
		'- The tag values are mapped from the payload as set under Format.',
		'- A lost connection is retried automatically, first after 1 s, then with growing delays up to 30 s.',
		'- Settings that this dialog has no field for (headers, protocol version, reconnect limit, MQTT QoS, JSON paths) are kept as they are.');
	H('source.name', 'Name',
		'The display name of the source in the lists, in Diagnostics and in the status bar of a running screen. Not used in tag names.');
	H('source.type', 'Type',
		'How the source gets its data:',
		'- `mqtt`: a broker, over WebSocket (`ws://` or `wss://`), subscribed to topic filters.',
		'- `ws`: a WebSocket that sends messages.',
		'- `http`: polls a URL at a fixed interval.',
		'- `sse`: Server-Sent Events from a URL.',
		'- `host`: no connection. The page that embeds draw.io pushes the values in with `hmiSetValues`.');
	H('source.scope', 'Scope',
		'- `file`: connects once and stays connected on every page of the file.',
		'- `page`: connects when the page that holds the source opens and disconnects when the page closes.');
	H('source.prefix', 'Tag prefix',
		'Text put in front of every tag name from this source, so that equal names from two sources do not clash.',
		'Example: prefix `plant1/` turns the payload key `Tank1/Level` into the tag `plant1/Tank1/Level`. Empty means no prefix.');
	H('source.url', 'URL',
		'The address of the source. A running screen may connect only to hosts that the server allows (CSP `connect-src` and `allowedEndpoints`).');
	H('source.url.mqtt', 'Broker URL',
		'The WebSocket address of the MQTT broker, `ws://` or `wss://`. Plain `mqtt://` and TCP ports do not work in a browser.',
		'Example: `wss://broker.example.com:8884/mqtt`');
	H('source.url.ws', 'WebSocket URL',
		'The address of the WebSocket, `ws://` or `wss://`. Every message received is read with the payload format below.',
		'Example: `wss://gateway.example.com/hmi`');
	H('source.url.http', 'HTTP URL',
		'The address that is requested every poll interval. The response is read with the payload format below. `https://` is needed when the page itself uses https.',
		'Example: `https://gateway.example.com/api/tags`');
	H('source.url.sse', 'SSE URL',
		'The address of the event stream. Every event of the listed event names is read with the payload format below.',
		'Example: `https://gateway.example.com/events`');
	H('source.mqtt.clientId', 'Client ID',
		'The MQTT client id. Empty creates a random id for every connection.',
		'Two clients with the same id push each other off the broker, so leave it empty for screens that run on several computers.');
	H('source.mqtt.keepalive', 'Keep-alive',
		'Seconds between the pings that keep the MQTT connection open. Default 30.');
	H('source.mqtt.topics', 'Topic filters',
		'The topics to subscribe to, separated by commas. Wildcards:',
		'- `+` matches one level: `plant/+/temp`',
		'- `#` matches all levels below, at the end only: `plant/#`',
		'Example: `plant/+/temp,plant/alarms/#`');
	H('source.mqtt.cleanSession', 'Clean session',
		'On (default): the broker forgets the subscriptions and the queued messages when the connection closes.',
		'Off: the broker keeps them for the client id, so the messages sent while the screen was closed arrive later. This needs a fixed client id.');
	H('source.ws.initMessage', 'Initial message',
		'Text that is sent right after the connection opens, for example a subscription request.',
		'Example: `{"subscribe": ["Tank1/Level"]}`. Empty sends nothing.');
	H('source.http.method', 'Method',
		'The HTTP method of every poll: `GET` (default), `POST` or `PUT`. `POST` and `PUT` send the request body.');
	H('source.http.interval', 'Poll interval',
		'Milliseconds between two requests. Default 1000, the lowest value used is 250.',
		'A new request is not started while the previous one is still running.');
	H('source.http.body', 'Request body',
		'The text sent with every `POST` or `PUT` request, for example `{"tags": ["Tank1/Level"]}`. Empty sends no body.');
	H('source.sse.events', 'Event names',
		'The names of the server events to listen to, separated by commas. Default `message`.',
		'Example: `message,alarm`');
	H('source.format', 'Payload format',
		'How a received message is turned into tag values:',
		'- `auto`: detects the format from the message (default).',
		'- `flat`: a JSON object with a tag per key, `{"Tank1/Level": 42.1}`.',
		'- `array`: a list of `{tag, value, ts, quality}` objects.',
		'- `topic`: the tag name comes from the MQTT topic, the payload is the value.',
		'- `jsonpath`: a list of tag and path pairs, read from the payload.',
		'- `drawio-update-xml`: the update format of the older draw.io `update.js` plugin.');
	H('source.format.template', 'Topic template',
		'For the `topic` format: the pattern of the topic. `{tag}` marks the part that is the tag name.',
		'Example: with `plant/{tag}` the topic `plant/Tank1/Level` sets the tag `Tank1/Level`. Without a template the whole topic is the tag name.');
	H('source.scripts', 'Scripts',
		'Parser and pre-connect scripts run only if the script policy allows scripts. The document setting Scripts (in Tags) can switch them off, and the server policy can too.');
	H('source.parser', 'Parser script',
		'Code that turns a received message into tag values, instead of the payload format.',
		'- It gets `message` and `context`.',
		'- It returns the updates (for example `[{tag: "T1", value: 5}]`), or `false` to drop the message.');
	H('source.preConnect', 'Pre-connect script',
		'Code that runs before every connection attempt and may change the connection. It gets `source` and may return an object with `url`, `headers`, `username`, `password` or `token`.',
		'Use it to add a session token to the URL.');
	H('source.credentials', 'Credentials',
		'How the user name and password reach the source:',
		'- `none`: no credentials.',
		'- `save`: stored in the diagram file. Anyone who can open the file can read them.',
		'- `prompt`: the operator is asked once per session. Nothing is stored.',
		'- `param`: read at run time from a screen variable, a URL parameter or the deployment config.');
	H('source.credentials.username', 'User name',
		'The user name that is sent to the source. It is saved in the file, as the mode is Save.');
	H('source.credentials.password', 'Password',
		'The password that is sent to the source. It is saved in the file in clear text, as the mode is Save. Use Prompt instead if the file is shared.');
	H('source.credentials.param', 'Parameter name',
		'The name of the parameter that holds the credentials. It is looked up as `${name}` in the screen variables, the URL parameters, `localStorage` and `DRAWIO_CONFIG.hmi.params`.');
	H('source.test', 'Test Connection',
		'Connects the source for 5 seconds with a temporary tag store and shows what happens. The real tags of the screen are not touched.',
		'Close ends the test.');
	H('source.test.status', 'Connection status',
		'The state (`disconnected`, `connecting`, `connected`, `error`) with the number of messages received and of errors. The lines below are the log of the connection.');
	H('credentials.dialog', 'Credentials',
		'The data source asks for credentials. They are used for this session only and are not saved in the file.');
	H('credentials.username', 'User name', 'The user name for the data source.');
	H('credentials.password', 'Password', 'The password for the data source. It is sent only to this source.');
	H('credentials.token', 'Token', 'An access token (for example a bearer token) for sources that do not use a user name and password. Leave it empty if not needed.');

	// ---------------------------------------------------------------
	// Tags dialog and tag editor
	// ---------------------------------------------------------------

	H('tags.dialog', 'Tags',
		'The tag catalogue of the page and the settings of the running screen.',
		'- A tag is a named value. Tags that are used but not declared still work, with the type taken from the values.',
		'- Declare a tag to add a unit, limits, alarms, a simulation or a write target.',
		'- OK saves the settings and the list with the document.');
	H('tags.sim', 'Simulation mode',
		'Whether tags with a Simulation run in the screen:',
		'- `off`: never (default).',
		'- `on`: simulated tags run next to the real sources.',
		'- `only`: no real connection is opened, only simulated and screen variables run.',
		'A URL parameter `hmi-sim` overrides this in a running screen.');
	H('tags.scripts', 'Scripts',
		'- `inherit`: the script policy of the server applies (default).',
		'- `off`: no scripts run in this document (transforms, parsers, simulations, actions).',
		'A document can only restrict the server policy, not relax it.');
	H('tags.fit', 'Fit',
		'How the running screen is scaled to the window, again when the window changes size:',
		'- `page`: the whole page is visible, in its proportions (default).',
		'- `width`: fits the width, the height may need scrolling.',
		'- `none`: no automatic zoom.',
		'- `stretch`: behaves like `page` in this version.',
		'A URL parameter `hmi-fit` overrides this.');
	H('tags.nav', 'Navigation',
		'- `tabs`: the navigation bar with the pages of the file is shown in the running screen (default).',
		'- `none`: the bar is hidden. Pages change only with navigate actions.');
	H('tags.maxRate', 'Maximum update rate',
		'The most screen updates per second, in Hz. Default 30. A lower value saves CPU on large screens. The runtime lowers the rate by itself when frames run late.');
	H('tags.quality', 'Quality display',
		'How a value with bad or stale quality is shown:',
		'- `outline`: a dashed grey border and a small badge (default).',
		'- `none`: no mark.');
	H('tags.panZoom', 'Pan and zoom',
		'Lets the operator move and zoom the running screen with the mouse wheel and by dragging. On by default.');
	H('tags.width', 'Design width',
		'The width of the design area in pixels. It is used only if the height is set too: the screen is then fitted to this area instead of to the objects on the page. Empty uses the objects.');
	H('tags.height', 'Design height',
		'The height of the design area in pixels. It is used only if the width is set too. Empty uses the objects.');
	H('tags.add', 'Add Tag',
		'Opens the tag editor for a new tag.');
	H('tags.exchange', 'Import and export',
		'Move the tag list in and out of the document:',
		'- CSV: one tag per line. Columns `name,type,unit,min,max,decimals,access,initial,staleMs,simKind,simMin,simMax,simPeriod`.',
		'- JSON: the complete tag list with every setting, including alarms and write targets.',
		'Imported tags are added to the list.');
	H('tags.list', 'Tag list',
		'The declared tags of this page. Click a row to edit the tag. Delete removes it from the list (it is gone when you click OK).');
	H('tags.col.name', 'Name', 'The name of the tag, as used in bindings, links and expressions.');
	H('tags.col.type', 'Type', 'The data type: number, integer, boolean, string or object.');
	H('tags.col.unit', 'Unit', 'The engineering unit, for example `%` or `bar`.');
	H('tags.col.access', 'Access', '`r` is read-only, `rw` can also be written by the operator.');

	H('tag.dialog', 'Edit tag',
		'The definition of one tag. Only the name is needed, the other fields are optional.',
		'The settings that this dialog has no field for (alarm messages and severities, write headers) are kept as they are.');
	H('tag.name', 'Name',
		'The name of the tag. Bindings, links, conditions and expressions refer to it, so it has to be unique.',
		'Examples: `Tank1.Level`, `Plant/Tank1/Level`. Avoid spaces, quotes, braces and parentheses.');
	H('tag.type', 'Type',
		'- `number`: any number (default).',
		'- `integer`: a whole number.',
		'- `boolean`: true or false.',
		'- `string`: text.',
		'- `object`: a JSON value, for tables and charts.',
		'A value that does not fit the type is not taken over. The tag gets bad quality and keeps its last good value.');
	H('tag.unit', 'Unit',
		'The engineering unit, for example `%`, `bar` or `°C`. It is shown by Show unit in a binding and in the Tag Browser.');
	H('tag.access', 'Access',
		'- `r`: read-only. Writes are refused.',
		'- `rw`: can be written by the operator, through the write target.',
		'A screen variable can always be written.');
	H('tag.description', 'Description',
		'A note for the screen designer. It is shown in the details view of the Tag Browser.');
	H('tag.min', 'Minimum',
		'The lowest value of the engineering range. Written values below it are refused.');
	H('tag.max', 'Maximum',
		'The highest value of the range. Written values above it are refused.');
	H('tag.decimals', 'Decimals',
		'The number of decimal places when the value is shown, for example `1` shows `42.1`. Empty shows the value as it is.');
	H('tag.format', 'Format pattern',
		'Alternative to Decimals: a pattern whose digits after the point give the decimal places.',
		'Examples: `0.0` (one decimal), `0.00` (two), `#,##0` (thousands separator, none after the point). Decimals wins if both are set.');
	H('tag.initial', 'Initial value',
		'The value that the tag has before the first update arrives. Empty means no value, shown as `--`.');
	H('tag.staleMs', 'Stale after',
		'Milliseconds. If no update arrives for this long, the quality of the tag becomes `stale` and bound objects show the quality mark. Empty never goes stale.');
	H('tag.local', 'Screen variable',
		'The tag has no data source. Writes only change its value in the screen. Use it for local state such as a selected view or a switch, or for values that you wire to a source later.');
	H('tag.expr', 'Derived expression',
		'Makes this a derived tag: its value is calculated from other tags and recalculated when one of them changes. It has no source of its own.',
		'Example: `(T1 + T2) / 2`. A tag name with special characters is written `tag("Plant/T1")`.');
	H('tag.roles', 'Write roles',
		'Roles that are needed to write this tag, separated by commas. The operator needs all of them. Empty means no restriction.',
		'Example: `eng` or `op,eng`. Roles of the user come from the URL parameter `hmi-role`, the config or the host page.');

	H('tag.sim', 'Simulation',
		'Generates values for the tag without a data source, to design and test a screen. It runs when the Simulation mode of the page is `on` or `only`.',
		'Choose a kind. The fields below change with it. No kind means no simulation.');
	H('tag.sim.kind', 'Simulation kind',
		'- `random`: a random value between Min and Max.',
		'- `sine`: a sine wave between Min and Max.',
		'- `ramp`: steps up by Step and starts again at Min after Max.',
		'- `list`: cycles through the Values.',
		'- `toggle`: switches between true and false.',
		'- `constant`: a fixed value, the first of Values.',
		'- `script`: a value from your own code.');
	H('tag.sim.min', 'Simulation minimum', 'The lowest value. Default 0.');
	H('tag.sim.max', 'Simulation maximum', 'The highest value. Default 100.');
	H('tag.sim.period', 'Sine period',
		'The time of one full wave in milliseconds. Default 60000 (one minute).',
		'Example: Min 10, Max 90 and Period 20000 fill and empty a tank every 20 seconds.');
	H('tag.sim.step', 'Ramp step',
		'How much the value rises at every update. Default 1. A negative step counts down and starts again at Max.');
	H('tag.sim.interval', 'Update interval',
		'Milliseconds between two simulated values. Default 1000.');
	H('tag.sim.values', 'Simulation values',
		'Values separated by commas. Numbers stay numbers, `true` and `false` become booleans.',
		'- `list`: the values are used one after the other, then it starts again.',
		'- `constant`: the first value is used.',
		'Example: `0,25,50,75,100`');
	H('tag.sim.integer', 'Integers only', 'Rounds the random values to whole numbers.');
	H('tag.sim.code', 'Simulation script',
		'Code that returns the next value, called at every interval with the tag name in `tag`. It runs only if scripts are allowed.');

	H('tag.write', 'Write target',
		'Where a value goes when the operator or an action writes this tag to a data source. The tag also needs Access `rw`. Empty keeps the write in the screen only.',
		'Simulated tags and screen variables take the value at once, without a target.');
	H('tag.write.source', 'Target source',
		'The id of the data source that receives the write, as shown in the list of sources. Ids are in the form `src1a2b3c`.');
	H('tag.write.topic', 'Target topic',
		'For an MQTT source: the topic to publish to. `${tag}` is replaced by the name of the tag.',
		'Example: `plant/cmd/${tag}`');
	H('tag.write.payload', 'Write payload',
		'The message that is sent. Placeholders: `${value}`, `${tag}` and `${ts}` (milliseconds).',
		'Default `{"value":${value}}`. A text value is put in quotes, unless the placeholder already sits inside quotes.');
	H('tag.write.mode', 'Write mode',
		'- `confirmed`: the screen waits until the source reports the new value (up to 5 seconds), then marks the write as confirmed or unconfirmed.',
		'- `optimistic`: the new value shows at once and goes back to the old one if the source does not confirm it in time.');

	H('tag.alarms', 'Alarms',
		'Alarm limits of the tag. Active alarms show in the alarm list of the running screen, where the operator acknowledges them.',
		'- Limits: HIHI, HI, LO, LOLO.',
		'- For on/off tags: Alarm when.',
		'- Deviation from a target, and rate of change.',
		'Several alarm kinds can be set. The most severe one is reported. Empty fields are not checked.');
	H('tag.alarms.hihi', 'HIHI limit',
		'The alarm is active when the value is at or above this limit. Critical by default (severity 1).');
	H('tag.alarms.hi', 'HI limit',
		'The alarm is active when the value is at or above this limit. High by default (severity 2).');
	H('tag.alarms.lo', 'LO limit',
		'The alarm is active when the value is at or below this limit. High by default (severity 2).');
	H('tag.alarms.lolo', 'LOLO limit',
		'The alarm is active when the value is at or below this limit. Critical by default (severity 1).');
	H('tag.alarms.deadband', 'Deadband',
		'How far the value has to move back before an alarm of the limits ends, in the unit of the tag. It stops an alarm from switching on and off at the limit.',
		'Example: HI 85 with deadband 2 ends at 83. Default 0.');
	H('tag.alarms.bool', 'Alarm when',
		'For boolean tags: the value that raises the alarm, `true` or `false`. `none` switches this check off. Critical by default.');
	H('tag.alarms.target', 'Deviation target',
		'The value that the tag should have: a number, or the name of another tag, so that the target can change while running.',
		'Needed for the minor and major deviation. Example: `50` or `Tank1.Setpoint`.');
	H('tag.alarms.minorDev', 'Minor deviation',
		'A minor alarm is active when the value differs from the target by this amount or more, in either direction.');
	H('tag.alarms.majorDev', 'Major deviation',
		'A major alarm is active when the value differs from the target by this amount or more, in either direction. It goes before a minor alarm.');
	H('tag.alarms.roc', 'Rate of change',
		'A rate alarm is active while the value changes faster than this limit, in units per second, up or down. It is checked between two updates.');

	// ---------------------------------------------------------------
	// Tag Browser
	// ---------------------------------------------------------------

	H('tagBrowser.window', 'Tag Browser',
		'A list of all declared tags and all tags seen at run time. While Live Preview or a run is going it shows the live value and quality, refreshed four times a second.',
		'- Drag a row onto an object to bind it. The target depends on the object: an edge gets `style:flowAnimation`, an HMI widget `prop:value`, a tank or cylinder `style:hmiLevel`, any other `label`.',
		'- The pencil writes a value into the running tag, to test triggers and alarms.');
	H('tagBrowser.filter', 'Filter',
		'Shows only the tags that match.',
		'- Plain text: tags that contain it, ignoring case. `tank` finds `Tank1.Level`.',
		'- With wildcards the whole name has to match: `*` stands for any text, `?` for one character. `Tank*` finds names that begin with Tank, `Pump?` finds `Pump1` but not `Pump10`.');
	H('tagBrowser.view', 'View',
		'- Details: a table with the name, the value, the quality and the override button.',
		'- List: only the names, in columns. You can still drag them.');
	H('tagBrowser.col.name', 'Name', 'The name of the tag. Drag the row onto an object to bind the tag to it.');
	H('tagBrowser.col.value', 'Value',
		'The current value, `--` if there is none. It is live only while a screen runs.');
	H('tagBrowser.col.quality', 'Quality',
		'`good`, `bad` (the last value failed the type check), `uncertain` or `stale` (no update within the stale time). Empty while no screen runs.');
	H('tagBrowser.col.override', 'Manual override',
		'The pencil asks for a new value and writes it straight into the running tag, and into the simulator if the tag is simulated. It is for testing only and is not sent to a data source. Available while a screen runs.');
	H('tagBrowser.select', 'Select tag',
		'Choose a tag by name. Double-click a row, or select it and click OK.',
		'Tags that are used but not declared are listed too.');
	H('tagBrowser.select.filter', 'Filter',
		'Narrows the list while you type.',
		'- Plain text: names that contain it.',
		'- `*` (any text) and `?` (one character) match the whole name: `Tank*`, `Pump?`.');
	H('tagBrowser.select.view', 'View',
		'Details shows the type, unit and description of each tag. List shows only the names, in columns.');
	H('tagBrowser.pick.name', 'Name', 'The name of the tag.');
	H('tagBrowser.pick.type', 'Type', 'The data type from the tag definition. Empty for tags that are not declared.');
	H('tagBrowser.pick.unit', 'Unit', 'The engineering unit from the tag definition.');
	H('tagBrowser.pick.description', 'Description', 'The description from the tag definition.');

	// ---------------------------------------------------------------
	// Substitute Tags and Define Missing Tags
	// ---------------------------------------------------------------

	H('substitute.dialog', 'Substitute Tags',
		'Renames the tags used by the selected objects (or by the whole page when nothing is selected) in one undoable step. It changes links, bindings, events, triggers and animations.',
		'Use it to reuse a graphic for another unit: copy it, then replace `Pump1.*` by `Pump2.*`.',
		'A name may not contain spaces, quotes, braces or parentheses.');
	H('substitute.old', 'Current tag',
		'Every tag that the objects use, with the number of places where it is used (×3). A tag with a dot field such as `Tank.MaxEU` counts as `Tank`.');
	H('substitute.new', 'New tag',
		'The name that replaces the current one. Empty keeps the tag. Double-click the field or use the button to choose from the Tag Browser.');
	H('define.dialog', 'Define Missing Tags',
		'Adds the tags that the page uses but the catalogue does not have. Tags whose name starts with `$` are system tags and are left out.',
		'Tags that are written are made writable (access `rw`). You can edit them later in Tags.');
	H('define.col.use', 'Define', 'Tick the tags that should be added to the catalogue.');
	H('define.col.name', 'Name', 'The name of the tag as used on the page.');
	H('define.col.type', 'Type',
		'The type of the new tag, taken from the way the page uses it (a flag is a boolean, a text a string). Change it if it is wrong.');

	// ---------------------------------------------------------------
	// Validator and Diagnostics
	// ---------------------------------------------------------------

	H('validator.window', 'Validate',
		'A static check of the HMI settings of the current page. It does not need a running screen.');
	H('validator.summary', 'Result',
		'The number of errors and warnings found.',
		'- Errors: settings that cannot work, such as an invalid expression, a write to a read-only tag, a missing page or a schema violation.',
		'- Warnings: probably unintended, such as a tag that is not declared, a script while scripts are off, or a source without topics or URL.');
	H('validator.list', 'Findings',
		'One line per finding, with the kind (ERROR or WARNING) and a message.',
		'Click a line to select the object and scroll to it. A line without an object, such as one from a page trigger, cannot be selected.');
	H('diag.window', 'Diagnostics',
		'The state of the running screen: sources, update rate, log and writes. It needs a running screen (Live Preview or a run). Ctrl+Shift+D opens it in a running screen.');
	H('diag.tab.sources', 'Sources',
		'One row per data source with its connection state and counters.',
		'Click a row to see the last messages of the source below (up to 100, secrets removed).');
	H('diag.tab.rate', 'Rate', 'Counters of the screen engine since it started.');
	H('diag.tab.log', 'Log',
		'The diagnostics log: warnings and errors of sources, bindings, scripts and writes. Filter by level and category.');
	H('diag.tab.writes', 'Writes', 'The log of every write to a tag, newest at the bottom.');
	H('diag.sources.name', 'Name', 'The name of the source.');
	H('diag.sources.type', 'Type', 'The protocol: mqtt, ws, http, sse or host.');
	H('diag.sources.state', 'State',
		'- `disconnected`: not connected (or stopped).',
		'- `connecting`: connecting or reconnecting.',
		'- `connected`: connected.',
		'- `error`: the last attempt failed.');
	H('diag.sources.received', 'Received', 'The number of messages received since the source connected.');
	H('diag.sources.errors', 'Errors', 'The number of errors, such as failed connections and messages that could not be read.');
	H('diag.sources.lastMessage', 'Last message', 'The time of the last message received.');
	H('diag.sources.lastError', 'Last error', 'The text of the last error. Empty if there was none.');
	H('diag.rate.frames', 'Frames', 'The number of render frames since the screen started. Its growth per second is the update rate.');
	H('diag.rate.updates', 'Updates', 'The number of tag updates that were processed.');
	H('diag.rate.flushed', 'Cells flushed', 'The number of times an object was redrawn because of a new value.');
	H('diag.log.level', 'Level',
		'Shows only entries of this level: `debug`, `info`, `warn` or `error`. `all` shows everything.');
	H('diag.log.category', 'Category',
		'Shows only entries whose category contains this text, for example `hmi-src` for the sources.');
	H('diag.writes.list', 'Write log',
		'Each line: the time, the tag, the value and the result of the write, such as `confirmed`, `unconfirmed` or an error.');
	H('alarmList.window', 'Alarm list',
		'The active alarms of the running screen. The state is `active-unack` (active, not acknowledged), `active-ack` (active, acknowledged) or `cleared-unack` (ended, not acknowledged).');
	H('alarmList.ackAll', 'Acknowledge all',
		'Acknowledges every alarm in the list. Use Acknowledge on a line for one alarm.');

	// ---------------------------------------------------------------
	// HMI tab of the Format panel
	// ---------------------------------------------------------------

	H('hmiTab.document', 'HMI settings of the page',
		'Shown when nothing is selected. It holds the settings of the whole page: data sources, tags, the Tag Browser, Hover Halo, page triggers and Live Preview.',
		'Select an object to see its own links, bindings, events, triggers and animations.');
	H('hmiTab.summary', 'Summary', 'The number of data sources and declared tags of the page.');
	H('hmiTab.sources', 'Data Sources',
		'Opens the list of data sources (MQTT, WebSocket, HTTP, SSE, host).');
	H('hmiTab.tags', 'Tags',
		'Opens the tag catalogue with the run settings of the page: simulation mode, scripts, fit, navigation, update rate and quality display.');
	H('hmiTab.tagBrowser', 'Tag Browser',
		'Opens the floating Tag Browser with live values. Drag a tag onto an object to bind it.');
	H('hmiTab.substitute', 'Substitute Tags',
		'Renames tags in the objects that are selected, or on the whole page when nothing is selected. One undoable step.');
	H('hmiTab.defineMissing', 'Define Missing Tags',
		'Adds the tags that the page uses but did not declare to the catalogue.');
	H('hmiTab.haloPage', 'Hover Halo',
		'Opens the page settings of the highlight of interactive objects (style, colour, size, pressed look).');
	H('hmiTab.livePreview', 'Live Preview',
		'Runs the screen in the editor: sources connect and values flow. Press it again to stop. Interactive Preview in the HMI menu also lets clicks run events.');
	H('hmiTab.docTriggers', 'Page Triggers',
		'Triggers that belong to the page, not to an object. They run page-wide logic, such as opening a window on an alarm.',
		'A trigger runs its actions when its conditions become true and its else actions when they become false.');

	H('hmiTab.object', 'HMI settings of the object',
		'The links, bindings, events, triggers, animations and roles of the selected objects. With several objects selected, a change is applied to all of them, and the first one is shown.');
	H('hmiTab.links', 'Animation Links',
		'The animation links of the object: how its look and behaviour follow tags (colours, size, blinking, input, buttons, scripts).',
		'The lines show what is set on the first selected object.');
	H('hmiTab.linksButton', 'Animation Links',
		'Opens the Animation Links dialog for the selected objects. Alt+double-click on an object does the same.');
	H('hmiTab.quickAdd', 'Quick Add',
		'One click adds a ready binding or animation to every selected object. `Tag{id}` becomes `Tag` plus the id of each object, so each object gets its own tag name. Rename them with Substitute Tags or in the binding.');
	H('quick.level', 'Level',
		'Adds a binding of a tag to `style:hmiLevel`: the fill level of the object, 0 to 100 by default. It suits tanks and cylinders.');
	H('quick.value', 'Value',
		'Adds a binding of a tag to `prop:value`: the value of an HMI widget such as a gauge, a display or a lamp.');
	H('quick.label', 'Label', 'Adds a binding of a tag to `label`: the text of the object shows the value.');
	H('quick.color', 'Color',
		'Adds a binding of a tag to `style:fillColor` with a map: value 1 gives green (`#4CAF50`), anything else grey (`#B0BEC5`). Edit the colours in the binding.');
	H('quick.visible', 'Visible', 'Adds a binding of a tag to `visible`: the object is shown while the tag is true and hidden while it is false.');
	H('quick.preset', 'Animation preset',
		'The animation that Add Animation adds: blink, spin, pulse, shake, fade in/out or colour cycle.');
	H('quick.animation', 'Add Animation',
		'Adds the chosen preset as a named animation that starts when the page opens. A spin animation turns at 10 RPM. Change the settings in the animation.');
	H('hmiTab.bindings', 'Bindings',
		'A binding sets one property of the object from a tag or an expression: its text, a style such as the fill colour, its size or position, or its visibility.',
		'Click a binding to edit it. The arrows change the order, the cross deletes it.');
	H('hmiTab.events', 'Events',
		'An event handler runs actions when something happens to the object: a click, hover, a value change, a page opening or a message.',
		'Events run in a running screen, or in the editor when Live Preview and Interactive are both on.');
	H('hmiTab.triggers', 'Triggers',
		'A trigger watches conditions on tags and runs actions when they turn true, and else actions when they turn false. It does this on the change, not on every update.');
	H('hmiTab.animations', 'Animations',
		'Named animations of the object: a preset such as blink, spin or pulse. Start and stop them from triggers and events, or let them play automatically.');
	H('hmiTab.roles', 'Roles',
		'Roles that the user needs to see this object, separated by commas. The user needs all of them. An object without roles is always visible.',
		'Example: `eng` or `op,eng`. In a running screen an object that the user may not see is hidden (or dimmed and disabled, if the server is set to disable). The change applies when you leave the field.');
	H('hmiTab.halo', 'Hover Halo',
		'The highlight of this object when the mouse is over it in a running screen. Page default follows the page settings.');
	H('halo.pageButton', 'Page Hover Halo Settings',
		'Opens the page settings of the hover halo, which all objects follow unless they set their own.');
	H('hmiTab.flow', 'Flow',
		'Settings of the flow animation along an edge, such as a pipe.');
	H('hmiTab.flowQuick', 'Flow from a tag',
		'Adds a binding of a tag to `style:flowAnimation` and turns the flow animation on. The flow runs while the tag is true.');
	H('flow.type', 'Flow type',
		'How the flow is drawn: `dash` (the draw.io flow), `dots`, `beads`, `arrows` or `liquid`. It is set as the style `flowAnimationType` of the edge.');

	H('item.json', 'JSON',
		'Shows the settings as JSON for details that the form has no field for. It is checked against the schema when you click OK. While it is open, it replaces the form.');

	// ---------------------------------------------------------------
	// Item editors of the HMI tab: binding, event, trigger, animation
	// ---------------------------------------------------------------

	H('binding.dialog', 'Binding',
		'A binding sets one property of the object from a tag or an expression, with an optional transform and number format.',
		'Example: tag `Tank1.Level` to target `style:hmiLevel` fills the tank to the level.');
	H('binding.tag', 'Tag',
		'The tag that supplies the value. Use either a tag or an expression. If both are filled in, the expression is used.');
	H('binding.expr', 'Expression',
		'A calculation instead of a single tag. It can use several tags, written `tag("Name")`, and the functions `min`, `max`, `abs`, `round`, `clamp`, `if(c,a,b)` and others.',
		'Example: `tag("T1")+tag("T2")`');
	H('binding.target', 'Target',
		'The property that is set:',
		'- `label`, `tooltip`: the text of the object, the tooltip.',
		'- `visible`: shows or hides the object.',
		'- `attr:` name: an attribute of the object, for `%name%` in its text.',
		'- `style:` key: any style key, for example `style:fillColor`, `style:strokeColor`, `style:opacity`, `style:rotation`, `style:hmiLevel`, `style:flowAnimation`.',
		'- `geo:x`, `geo:y`, `geo:width`, `geo:height`: moves or resizes the object, relative to its design value.',
		'- `prop:` name: a property of an HMI widget. `prop:value` is the value of a gauge or display.',
		'Choose a prefix to enter the key in the field next to it.');
	H('binding.decimals', 'Decimals',
		'The number of decimal places when the value is shown in a `label`, `tooltip` or `attr:` target. Empty uses the decimals of the tag.');
	H('binding.unit', 'Show unit',
		'Adds the unit of the tag (from the catalogue) after the value in a `label`, `tooltip` or `attr:` target.');

	H('transform.kind', 'Transform',
		'Changes the value before it is applied:',
		'- `scale`: maps one range linearly to another.',
		'- `map`: replaces values by other values, for example 1 by a colour.',
		'- `invert`: flips a boolean.',
		'- `expr`: a calculation with `value`.',
		'- `script`: your own code, if scripts are allowed.',
		'None applies the value as it is.');
	H('transform.in', 'Input range',
		'The lowest and the highest input value. The first field is the lowest, the second the highest. Default 0 and 100.');
	H('transform.out', 'Output range',
		'The values that the lowest and the highest input value are mapped to. The first field is for the lowest input, the second for the highest. Values outside the input range are clamped. Default 0 and 100.',
		'Example: input 0 to 100 to output 0 to 1 gives a fraction.');
	H('transform.entries', 'Map entries',
		'Rules separated by semicolons, in the form `operator:value=output`. The first rule that matches wins.',
		'Example: `==:1=Running;==:0=Stopped`',
		'Operators are the same as for conditions: `==`, `!=`, `>`, `<`, `>=`, `<=`, `range`, `in`.');
	H('transform.default', 'Default output', 'The output when no rule matches.');
	H('transform.expr', 'Transform expression',
		'A calculation in which `value` is the input.',
		'Example: `value*1.8+32` converts degrees Celsius to Fahrenheit.');
	H('transform.script', 'Transform script',
		'Code that returns the transformed value. `value` is the input. It runs only if scripts are allowed.');

	H('event.dialog', 'Event',
		'An event handler: it waits for an event on the object, checks the conditions and then runs its actions one after the other.');
	H('event.on', 'Event',
		'What triggers the handler:',
		'- `click`, `dblclick`, `mousedown`, `mouseup`, `contextmenu` (right click), `longpress` (touch).',
		'- `enter`, `leave`: the mouse moves onto or off the object.',
		'- `valueChange`: a tag bound to the object changed.',
		'- `pageOpen`, `pageClose`: the page opens or closes.',
		'- `message`: a named message sent by an Emit action.',
		'- `change`: a control widget committed a value.',
		'Hidden and disabled objects ignore events. An event that the object does not handle goes to its parent group.');
	H('event.message', 'Message name',
		'For the `message` event: the name of the message to react to, as given in the Emit action. Empty reacts to every message.');
	H('event.confirm', 'Confirm',
		'Asks the operator to confirm before the actions run. Use it for actions that write to a process.');
	H('event.actions', 'Actions',
		'The actions that run, in order. A failing action is logged and the rest still run. Each action may have a delay.');

	H('trigger.dialog', 'Trigger',
		'A trigger checks conditions on tags and runs actions when the result changes: Actions when it turns true, Else actions when it turns false. It does not run on every update.');
	H('trigger.name', 'Name', 'The name of the trigger, shown in the list. It is also used in diagnostics.');
	H('trigger.conditionType', 'Combine conditions',
		'- `and`: all conditions have to be true.',
		'- `or`: one true condition is enough.',
		'A trigger without conditions is always true.');
	H('trigger.conditions', 'Conditions',
		'The tests on tags, such as `Tank1.Level > 90`. They are checked whenever one of their tags changes.');
	H('trigger.actions', 'Actions', 'The actions that run when the conditions change from false to true.');
	H('trigger.elseActions', 'Else actions', 'The actions that run when the conditions change from true to false.');

	H('condition.dialog', 'Condition',
		'A test on a tag or an expression: operator and value.');
	H('condition.tag', 'Tag', 'The tag to test. Use either a tag or an expression. If both are filled in, the expression is used.');
	H('condition.expr', 'Expression',
		'A calculation to test instead of one tag, for example `tag("a")>0`.');
	H('condition.operator', 'Operator',
		'- `==`, `!=`, `>`, `<`, `>=`, `<=`: compare with the value.',
		'- `range`, `!range`: inside or outside the range from `a` up to, but not including, `b`. Value `0,10`.',
		'- `in`, `!in`: one of a list. Value `1,3,5..8`.',
		'- `changed`: the tag has a new value.',
		'- `isBad`: the quality of the tag is not good.',
		'- `true`: always true, for a final "else" state.');
	H('condition.value', 'Value',
		'The value to compare with. A number, `true`/`false` or text. For `range` and `in`: a list separated by commas. Not used by `changed`, `isBad` and `true`.');

	H('action.dialog', 'Action',
		'One step of an event or a trigger. The fields depend on the type.');
	H('action.type', 'Action type',
		'- Write Tag, Toggle Tag, Pulse Tag: change a tag.',
		'- Set Properties: change the look of objects (transient, not saved in the file).',
		'- Navigate, Open URL, Dialog: go to a page, open a link, or show a page or URL in a window.',
		'- Start / Pause / Stop Animation, Play Media: control animations and video or audio.',
		'- Emit, Send, Post Message: send a message to events, to a data source or to the host page.',
		'- Notify: show a message to the operator.',
		'- Script, draw.io Action: run code or a draw.io link action.',
		'- Acknowledge Alarms: acknowledge one or all alarms.');
	H('action.delay', 'Delay',
		'Milliseconds to wait before this action runs. Default 0.');
	H('action.tag', 'Tag',
		'The tag that the action works on. For Acknowledge Alarms: the tag whose alarm is acknowledged, empty acknowledges all.');
	H('action.value', 'Value',
		'The value to write. `true` and `false` are booleans, numbers are numbers, anything else is text. `${name}` is replaced by a screen variable. Pulse Tag writes it first, then the reset value.'
		);
	H('action.expr', 'Expression',
		'A calculation whose result is written instead of the Value. If it is filled in, the Value is not used.',
		'Example: `tag("Setpoint")+1`');
	H('action.reset', 'Reset value', 'The value that is written after the duration. Default 0.');
	H('action.duration', 'Duration', 'Milliseconds between writing the value and writing the reset value. Default 500.');
	H('action.page', 'Page',
		'The page to go to or to show: its name or id. Navigate switches the page, Dialog shows it read-only in a floating window with the live tags. If a page is set, the URL is not used.');
	H('action.url', 'URL',
		'An address. Navigate opens it in the same window, Open URL in a new tab, Dialog shows it in a window. Only links that draw.io allows are opened.');
	H('action.dialogTitle', 'Dialog title', 'The title of the window.');
	H('action.width', 'Width', 'The width of the window in pixels. Preset to 480.');
	H('action.height', 'Height', 'The height of the window in pixels. Preset to 360.');
	H('action.animationName', 'Animation name',
		'The name of the animation to start, pause or stop, as given in the Animations of the target objects.');
	H('action.label', 'Label', 'A new text for the target objects. Empty leaves the text as it is.');
	H('action.styleJson', 'Style (JSON)',
		'Style keys to change, as a JSON object, for example `{"fillColor":"#FF0000","opacity":50}`. Not saved in the file.');
	H('action.command', 'Command', 'What the media widget does: `play`, `pause` or `stop`.');
	H('action.eventName', 'Event name',
		'The name of the message. Events of type `message` with this name run.');
	H('action.payload', 'Payload',
		'The data of the message. For Send: the text that is published or sent to the data source. `${name}` is replaced by a screen variable.');
	H('action.sourceId', 'Source id', 'The id of the data source that receives the message, as shown in the list of sources.');
	H('action.topic', 'Topic', 'The MQTT topic to publish to.');
	H('action.text', 'Text', 'The message that is shown to the operator.');
	H('action.level', 'Level', 'How the message looks: `info`, `warn` or `error`.');
	H('action.postTo', 'Post to',
		'Where the message goes: `parent` (the page that embeds draw.io) or the id of an object that holds an iframe.');
	H('action.data', 'Data', 'The data that is posted.');
	H('action.script', 'Script', 'Code that runs, in the script sandbox. It runs only if scripts are allowed.');
	H('action.drawioAction', 'draw.io action (JSON)',
		'An action of the draw.io custom links as JSON, for example `{"toggle": {"cells": ["id1"]}}`. The change is transient.');
	H('target.kind', 'Target',
		'The objects that the action works on:',
		'- `self`: the object that has the event or trigger.',
		'- `cells`: objects with the given ids.',
		'- `tags`: objects that carry one of the given draw.io tags.',
		'- `layers`: objects on the given layers.');
	H('target.value', 'Target value',
		'The ids, tags or layers, separated by commas. Example for cells: `cell-id-1, cell-id-2`.');

	H('animation.dialog', 'Animation',
		'A named animation of the object. Start, pause and stop it with actions, or let it play when the page opens.');
	H('animation.name', 'Name',
		'The name that actions use to refer to this animation. Default: the name of the preset.');
	H('animation.preset', 'Preset',
		'The effect: `blink`, `pulse`, `spin`, `shake`, `colorCycle` (changes the colour) or `fadeInOut`.');
	H('animation.duration', 'Duration', 'The length of one cycle in milliseconds. Default 1000.');
	H('animation.autoPlay', 'Autoplay', 'Starts the animation when the page opens. Otherwise an action has to start it.');
	H('animation.rpm', 'RPM',
		'For `spin`: revolutions per minute. Example: 30 turns half a turn per second.');
	H('animation.rpmTag', 'RPM tag',
		'For `spin`: a tag that supplies the speed in RPM, so that the speed follows the value live. It wins over the fixed RPM.');

	// ---------------------------------------------------------------
	// Links stored outside hmiLinks (bindings, keyframes, events, security,
	// hover halo, triggers, state machines)
	// ---------------------------------------------------------------

	H('group.hmiLnkTriggersGroup', 'Triggers',
		'Triggers run actions when conditions on tags become true or false, without a user action.',
		'- A simple trigger has conditions, actions and else actions.',
		'- A state machine has an ordered list of states; the first state whose conditions hold is the current state.');

	H('link.bindings', 'Bindings',
		'A binding connects a tag or an expression to a property of the object: a style, the label, the tooltip, visibility, an attribute and more.',
		'- Each binding can scale, map or invert the value and format it.',
		'- Use the Display links for the usual cases and bindings for everything else.');
	H('link.keyframes', 'Keyframe animations',
		'Named animations of the object: a preset such as spin or pulse, or your own keyframes (frames).',
		'- Start, pause and stop them with actions, or let them play when the page opens.',
		'- An animation can start another one when it ends.');
	H('link.events', 'Event handlers',
		'Runs actions when something happens to the object in a running screen: click, double-click, mouse down or up, enter, leave, long press, a value change, a message or the page opening or closing.',
		'- Handlers can have conditions, a confirmation and a delay.');
	H('link.security', 'Security',
		'Limits the object to users with one of the roles.',
		'- Hide (default): users without the role do not see the object.',
		'- Disable: they see it, but cannot use it.',
		'Touch Options roles only guard the touch links of the object.');
	H('link.hoverHalo', 'Hover halo',
		'How this object is highlighted when the mouse is over it or it has the keyboard focus in a running screen. Every setting can follow the page default (Screen Settings, Hover Halo).');
	H('link.triggers', 'Simple triggers',
		'A trigger watches conditions. When they become true it runs its actions, when they become false it runs its else actions.',
		'- Conditions compare a tag or an expression with a value or another tag.',
		'- Deadband and delays keep the trigger from chattering.');
	H('link.stateMachines', 'State machines',
		'A trigger with several named states. The first state whose conditions hold becomes the current state, and its actions run once when it is entered.',
		'Use it for sequences such as Stopped, Starting, Running and Fault.');

	H('field.conditions', 'Conditions',
		'The tests of this item. Add one or more; the condition type decides whether all or any of them must hold. With no condition the item is always true.');
	H('field.conditions.tag', 'Tag', 'The tag to test. ' + BROWSE + ' An expression, if given, wins over the tag.');
	H('field.conditions.expr', 'Expression',
		'A calculation to test instead of a single tag, for example `tag("Level") > 50`. It wins over the tag.');
	H('field.conditions.operator', 'Operator',
		'How the value is compared:',
		'- `==`, `!=`, `>`, `<`, `>=`, `<=`: ordinary comparison.',
		'- `range` / `!range`: inside or outside a range `min,max` (including min, excluding max).',
		'- `in` / `!in`: in or not in a list such as `1,2,5..8`.',
		'- `changed`: the tag changed since the last check.',
		'- `isBad`: the quality of the tag is not good.',
		'- `true`: always true.');
	H('field.conditions.value', 'Value',
		'The constant to compare with. For a range, `min,max`. For `in`, a comma separated list. Ignored when a value tag is given.');
	H('field.conditions.valueTag', 'Value tag',
		'Compare with the current value of this tag instead of a constant. ' + BROWSE);
	H('field.conditionType', 'Condition type',
		'`AND`: all conditions must hold. `OR`: one condition is enough.');
	H('field.actions', 'Actions',
		'What happens, in order. Every action type is available: write a tag, set object properties (including styles such as `hmiLevel`), navigate, start an animation, run a script and more.');

	H('field.bindings.items', 'Bindings', 'The bindings of the object. Click a line to edit it; use the arrows to reorder.');
	H('field.bindings.item', 'Binding', 'One binding: source (tag or expression), target property, transform and format.');

	H('field.keyframes.items', 'Animations', 'The named animations of the object. Click a line to edit it.');
	H('field.keyframes.item', 'Keyframe animation', 'One named animation: a preset or your own frames.');
	H('field.keyframes.name', 'Name',
		'The name that actions use to start, pause or stop this animation. Default: the name of the preset.');
	H('field.keyframes.preset', 'Preset',
		'A ready-made effect, or `frames only` to use just the frames below.');
	H('field.keyframes.duration', 'Duration', 'The length of one cycle in milliseconds.');
	H('field.keyframes.easing', 'Easing', 'How the speed changes during a cycle or frame.');
	H('field.keyframes.cycles', 'Cycles', 'How often the animation repeats. Empty or 0 means forever.');
	H('field.keyframes.autoPlay', 'Autoplay', 'Starts the animation when the page opens.');
	H('field.keyframes.keepState', 'Keep end state', 'The object keeps the look of the last frame when the animation ends.');
	H('field.keyframes.rpm', 'RPM', 'For `spin`: revolutions per minute.');
	H('field.keyframes.rpmTag', 'RPM tag',
		'For `spin`: a tag that supplies the speed in RPM. It wins over the fixed RPM. ' + BROWSE);
	H('field.keyframes.colors', 'Colors', 'For `colorCycle`: the colours that are shown one after the other, comma separated, such as `#FF0000,#00C000`.');
	H('field.keyframes.next', 'Then start',
		'The name of an animation that starts when this one ends. Choose the object it belongs to below.');
	H('field.keyframes.frames', 'Frames',
		'The keyframes in order. Each frame moves the object to the given look within its duration. Empty fields stay as they are.');
	H('field.keyframes.frameDuration', 'Frame duration', 'The time in milliseconds to reach this frame.');
	H('field.keyframes.frames.visible', 'Visibility', 'Shows or hides the object in this frame, or keeps it as it is.');
	H('field.keyframes.frames.rotation', 'Rotation', 'The rotation of the object in degrees.');
	H('field.keyframes.frames.opacity', 'Opacity', 'The opacity from 0 (invisible) to 100.');
	H('field.keyframes.frames.scale', 'Scale', 'The size factor. 1 is the normal size.');
	H('field.keyframes.frames.dx', 'Move X', 'The horizontal shift in pixels.');
	H('field.keyframes.frames.dy', 'Move Y', 'The vertical shift in pixels.');
	H('field.keyframes.frames.hmiLevel', 'Level', 'The fill level in percent for objects that use the `hmiLevel` style.');
	H('field.keyframes.frames.fillColor', 'Fill', 'The fill colour in this frame.');
	H('field.keyframes.frames.strokeColor', 'Line', 'The line colour in this frame.');
	H('field.keyframes.frames.fontColor', 'Text', 'The text colour in this frame.');

	H('field.events.items', 'Event handlers', 'The handlers of the object. Click a line to edit it.');
	H('field.events.item', 'Event handler', 'One handler: the event, optional conditions and the actions to run.');
	H('field.events.on', 'Event',
		'What triggers the handler: a mouse or touch event of the object, a change of its value, a named message, or the opening or closing of the page.');
	H('field.events.message', 'Message name', 'The name of the message that triggers the handler (event `message`).');
	H('field.events.conditionType', 'Condition type', 'AND: all conditions must hold. OR: one is enough. Only used with conditions.');
	H('field.events.delay', 'Delay', 'Waits this many milliseconds before the actions start.');
	H('field.events.confirm', 'Confirm', 'Asks the operator to confirm before the actions run.');
	H('field.events.stopOnError', 'Stop on error', 'Stops the remaining actions when one action fails.');
	H('field.events.actions', 'Actions', 'The actions that run in order when the event happens and the conditions hold.');

	H('field.security.roles', 'Roles',
		'The roles that may use the object, comma separated, for example `op, eng`. Empty: no restriction.');
	H('field.security.mode', 'Without the role',
		'Hide: users without the role do not see the object. Disable: they see it, but cannot use it.');

	H('field.triggers.items', 'Simple triggers', 'The triggers of the object. Click a line to edit it.');
	H('field.triggers.item', 'Trigger', 'One trigger with conditions, actions and else actions.');
	H('field.triggers.name', 'Name', 'A name to recognise the trigger in lists and in the validator.');
	H('field.triggers.conditionType', 'Condition type', '`AND`: all conditions must hold. `OR`: one is enough.');
	H('field.triggers.actions', 'Actions', 'Run when the conditions become true.');
	H('field.triggers.elseActions', 'Else actions', 'Run when the conditions become false again.');
	H('field.triggers.deadband', 'Deadband',
		'For `>`, `<`, `>=` and `<=`: once true, the trigger only becomes false when the value is this far on the other side of the limit. Avoids chattering.');
	H('field.triggers.onDelay', 'On delay', 'The conditions must hold this many milliseconds before the trigger becomes true.');
	H('field.triggers.offDelay', 'Off delay', 'The conditions must be false this many milliseconds before the trigger becomes false.');

	H('field.stateMachines.items', 'State machines', 'The state machines of the object. Click a line to edit it.');
	H('field.stateMachines.item', 'State machine', 'One state machine with a name and ordered states.');
	H('field.stateMachines.name', 'Name', 'A name to recognise the state machine.');
	H('field.stateMachines.states', 'States',
		'The states in priority order. The first state whose conditions hold is the current state.');
	H('field.stateMachines.states.name', 'State name', 'The name of the state, for example `Running`.');
	H('field.stateMachines.states.conditionType', 'Condition type', '`AND`: all conditions of the state must hold. `OR`: one is enough.');
	H('field.stateMachines.states.actions', 'Actions', 'Run once when the state is entered.');

	Hmi.HelpTexts = T;
})();
