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

	Hmi.HelpTexts = T;
})();
