/**
 * Help texts of the Screen Settings dialog and of the HMI tab of the
 * Format panel (ui/HmiScreenSettings.js, ui/HmiFormatPanel.js). The file
 * adds keys to Hmi.HelpTexts (see ui/HmiHelpTexts.js for the key scheme and
 * ui/HmiHelp.js for the text format) and is loaded after it. A key that is
 * defined again here replaces the text of ui/HmiHelpTexts.js.
 *
 * Key scheme:
 * - screen.dialog, screen.tab.<tab id>, screen.triggers.*, screen.runtime.*
 * - runtime.* (theme, blink), window.* (window tab)
 * - sources.col.*, trigger.<timing field>, halo.reset
 * - hmiTab.screenSettings, hmiTab.validate, hmiTab.runScreen
 */
(function()
{
	var root = (typeof globalThis !== 'undefined') ? globalThis : window;
	var Hmi = root.Hmi = root.Hmi || {};

	var T = Hmi.HelpTexts = Hmi.HelpTexts || {};

	// H(key, title, line, ...): one paragraph per line, "- " starts a bullet
	function H(key, title)
	{
		T[key] = {title: title, text: Array.prototype.slice.call(arguments, 2).join('\n')};
	};

	// ---------------------------------------------------------------
	// Screen Settings dialog
	// ---------------------------------------------------------------

	H('screen.dialog', 'Screen Settings',
		'All settings of the current page and document in one place: data sources, tags, page triggers, run settings, hover halo and the window type of the page.',
		'- Changes in all tabs are saved together when you click OK, as one undoable step.',
		'- Cancel discards every change.',
		'The settings of one object are in the Animation Links dialog.');
	H('screen.tab.sources', 'Data Sources',
		'Where the values of the tags come from: MQTT, WebSocket, HTTP, SSE or the host page. The number in brackets is the number of sources.');
	H('screen.tab.tags', 'Tags',
		'The tag catalogue: declare tags with a type, unit, limits, alarms, a simulation or a write target. The number in brackets is the number of declared tags.');
	H('screen.tab.pageTriggers', 'Page Triggers',
		'Triggers that belong to the page, not to an object. The number in brackets is the number of triggers.');
	H('screen.tab.runtime', 'Runtime',
		'How the running screen behaves: simulation mode, scripts, scaling, navigation, update rate, quality display, pan and zoom, design size, theme and the blink half-periods.');
	H('screen.tab.hoverHalo', 'Hover Halo',
		'The highlight of interactive objects when the mouse is over them, when they have keyboard focus and while they are pressed.');
	H('screen.tab.window', 'Window',
		'How this page opens when another page shows it as a window: replacing the current page, as an overlay or as a popup, with position, size and title.');

	H('sources.col.enabled', 'On',
		'Untick to switch the source off without deleting it. A source that is off does not connect.');
	H('sources.col.source', 'Source',
		'The name, the type and the address of the source. Click the line to edit the source.');

	H('screen.triggers.list', 'Page trigger list',
		'The triggers of the page. Click a line or the pencil to edit it, the arrows change the order and the cross deletes it.',
		'Triggers run in a running screen, in the order of the list.');
	H('trigger.deadband', 'Deadband',
		'A number of units (not percent) that a value has to move past a limit before the condition changes back. It stops a trigger from flickering around a limit. Empty or 0 means no deadband.');
	H('trigger.onDelay', 'On delay',
		'The time in milliseconds that the conditions have to stay true before the actions run. Empty or 0 runs them at once.');
	H('trigger.offDelay', 'Off delay',
		'The time in milliseconds that the conditions have to stay false before the else actions run. Empty or 0 runs them at once.');

	// ---------------------------------------------------------------
	// Runtime tab
	// ---------------------------------------------------------------

	H('screen.runtime.dialog', 'Runtime settings',
		'These settings apply to the running screen of this page: Live Preview, Run Screen and the exported screen.',
		'URL parameters such as `hmi-sim` and `hmi-fit` override some of them.');
	H('screen.runtime.run', 'Run',
		'How the screen gets its values and how often it draws: simulation mode, script policy, the update rate and the quality display.');
	H('screen.runtime.display', 'Display',
		'How the screen is shown in the window: scaling, navigation bar, pan and zoom, design size and theme.');
	H('runtime.theme', 'Theme',
		'The look of the running screen:',
		'- Default: the background of the drawing.',
		'- ISA-101: a grey screen background (`#D4D4D4`) as the ISA-101 guideline for control rooms suggests, so that colour stands out for abnormal conditions.');
	H('runtime.blink', 'Blink half-periods',
		'The time in milliseconds that a blinking object stays visible, and then invisible. The Slow, Medium and Fast speed of the blink links use these values.',
		'Defaults: 1000, 500 and 250 ms.');
	H('runtime.blink.slow', 'Slow blink',
		'The half-period of the Slow speed, in milliseconds. Default 1000.');
	H('runtime.blink.medium', 'Medium blink',
		'The half-period of the Medium speed, in milliseconds. Default 500.');
	H('runtime.blink.fast', 'Fast blink',
		'The half-period of the Fast speed, in milliseconds. Default 250.');

	// ---------------------------------------------------------------
	// Hover halo tab
	// ---------------------------------------------------------------

	H('halo.reset', 'Reset',
		'Sets every hover halo setting back to its default and switches the halo on.');

	// ---------------------------------------------------------------
	// Window tab
	// ---------------------------------------------------------------

	H('window.dialog', 'Window of the page',
		'An InTouch window is a page. This tab sets how the page opens when a Show Window link or the `Show` function opens it.',
		'- Replace: the page takes the place of the current page.',
		'- Overlay and Popup: the page opens on top of the current page (a popup is modal), at the position and with the size below.');
	H('window.section.type', 'Window type',
		'The type of the window and its title.');
	H('window.section.geometry', 'Position and size',
		'Where an overlay or popup window opens and how large it is. Empty values use the defaults. A replace window ignores them.');
	H('window.type', 'Window type',
		'- Replace: opens in place of the current page (default).',
		'- Overlay: opens over the current page, which stays usable.',
		'- Popup: opens over the current page as a modal window: the page below cannot be used until it is closed.');
	H('window.title', 'Title',
		'The title shown in the title bar of an overlay or popup window. Empty uses the name of the page.');
	H('window.x', 'X position',
		'The distance from the left edge of the screen in pixels. Empty places the window by itself.');
	H('window.y', 'Y position',
		'The distance from the top edge of the screen in pixels. Empty places the window by itself.');
	H('window.width', 'Window width',
		'The width of the window in pixels. Empty uses the width of the page.');
	H('window.height', 'Window height',
		'The height of the window in pixels. Empty uses the height of the page.');

	// ---------------------------------------------------------------
	// HMI tab of the Format panel
	// ---------------------------------------------------------------

	H('hmiTab.document', 'HMI settings of the page',
		'Shown when nothing is selected. It summarises the page and opens the dialogs for the settings of the whole page: Screen Settings (data sources, tags, page triggers, run settings, hover halo, window), Tag Browser, Substitute Tags, Define Missing Tags, Validate, Live Preview and Run Screen.',
		'Select an object to see its own links.');
	H('hmiTab.summary', 'Summary',
		'The number of data sources, declared tags, objects that have links and page triggers. Click a line to open Screen Settings on that tab.');
	H('hmiTab.screenSettings', 'Screen Settings',
		'Opens the dialog for the page and the document: data sources, tags, page triggers, run settings, hover halo and window type. One OK saves all tabs as one undoable step.');
	H('hmiTab.validate', 'Validate',
		'Checks the HMI settings of the page for errors and warnings: expressions, undeclared tags, missing windows and duplicate keys.');
	H('hmiTab.runScreen', 'Run Screen',
		'Opens the page as a running screen in a new window.');

	H('hmiTab.object', 'HMI settings of the object',
		'Shown when objects are selected. It lists the links that are set on the first selected object. Click a line to edit that link in the Animation Links dialog.',
		'With several objects selected, the dialog applies its changes to all of them.');
	H('hmiTab.links', 'Configured links',
		'One line for each link that is set on the object, such as value display, colours, blinking, touch input, bindings, events, triggers, hover halo and security.',
		'Click a line to open the Animation Links dialog on that link.');
	H('hmiTab.linksButton', 'Animation Links',
		'Opens the Animation Links dialog for the selected objects, where every link of the object is set. Alt+double-click on an object does the same.');
})();
