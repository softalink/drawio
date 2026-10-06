/**
 * Hmi.Help: quick help for the HMI dialogs. Hmi.Help.icon(key) returns a
 * small round "i" button that toggles a popover with the help text of the
 * key. Texts come from the resources hmiHelp_<key> (non-word characters
 * replaced by "_") and otherwise from Hmi.HelpTexts (ui/HmiHelpTexts.js).
 *
 * Text format: paragraphs are separated by line breaks, lines starting with
 * "- " are bullets and `code` is shown in a monospace font.
 *
 * DOM-bound; not part of the DOM-free module set (ARCHITECTURE.md §1).
 */
(function()
{
	var root = (typeof globalThis !== 'undefined') ? globalThis : window;
	var Hmi = root.Hmi = root.Hmi || {};

	var Help = {};

	/**
	 * Keys that were requested by icon() but have no help text (used by the
	 * tests to make sure every key of the dialogs has a text).
	 */
	Help.missing = {};

	var popover = null;
	var current = null;
	var listening = false;

	function resourceName(key)
	{
		return 'hmiHelp_' + String(key).replace(/\W/g, '_');
	};

	function resource(name)
	{
		var value = (typeof mxResources !== 'undefined' && mxResources.resources != null) ?
			mxResources.resources[name] : null;

		return (value != null && value !== '') ? value : null;
	};

	/**
	 * Returns {title, text} for the key or null.
	 */
	Help.text = function(key)
	{
		var name = resourceName(key);
		var defaults = (Hmi.HelpTexts != null) ? Hmi.HelpTexts[key] : null;
		var text = resource(name);

		if (text != null)
		{
			return {title: resource('hmiHelpTitle_' + name.substring(8)) ||
				(defaults != null ? defaults.title : ''), text: text};
		}

		return (defaults != null && defaults.text != null && defaults.text !== '') ?
			{title: defaults.title || '', text: defaults.text} : null;
	};

	/**
	 * Returns the first of the given keys (a key or an array of keys) that
	 * has a text, or null.
	 */
	Help.resolve = function(keys)
	{
		keys = (typeof keys === 'string') ? [keys] : keys;

		for (var i = 0; i < keys.length; i++)
		{
			if (Help.text(keys[i]) != null)
			{
				return keys[i];
			}
		}

		return null;
	};

	Help.installStyle = function()
	{
		if (document.getElementById('geHmiHelpStyle') != null)
		{
			return;
		}

		var accent = 'light-dark(var(--focus-color),var(--dark-focus-color))';
		var muted = 'light-dark(var(--secondary-text-color),var(--dark-secondary-text-color))';
		var strong = 'light-dark(var(--strong-text-color),var(--dark-strong-text-color))';
		var border = 'light-dark(var(--field-border-color),var(--dark-field-border-color))';
		var style = document.createElement('style');
		style.setAttribute('id', 'geHmiHelpStyle');
		style.textContent =
			// The negative vertical margins keep the icon from growing the line box of its label
			'.geHmiHelp{display:inline-flex;align-items:center;justify-content:center;' +
				'box-sizing:border-box;width:16px;height:16px;min-width:16px;padding:0;' +
				'margin:-4px 0 -4px 5px;vertical-align:middle;flex:0 0 auto;cursor:pointer;' +
				'border-radius:50%;border:1px solid ' + muted + ';background:transparent;' +
				'color:' + muted + ';font-size:11px;font-weight:700;font-style:normal;' +
				'line-height:1;opacity:0.85;}' +
			'.geHmiHelp::before{content:"i";}' +
			'.geHmiHelp.geHmiHelp:hover,.geHmiHelp.geHmiHelp:focus-visible,' +
				'.geHmiHelp.geHmiHelp[aria-expanded="true"]{opacity:1;color:' + accent + ';' +
				'border-color:' + accent + ';background-color:' +
				'color-mix(in srgb,' + accent + ' 14%,transparent);}' +
			'.geHmiHelp:focus-visible{outline:2px solid ' + accent + ';outline-offset:1px;}' +
			'.geHmiHelpPop{position:fixed;z-index:2147483000;box-sizing:border-box;' +
				'max-width:320px;padding:10px 12px;border-radius:8px;border:1px solid ' + border + ';' +
				'background:light-dark(var(--card-color),var(--dark-card-color));color:' + strong + ';' +
				'box-shadow:0 6px 24px rgba(0,0,0,0.28);font-size:13px;line-height:1.4;' +
				'text-align:left;overflow:auto;}' +
			'.geHmiHelpPop .geHmiHelpTitle{font-weight:600;margin-bottom:4px;line-height:1.3;}' +
			'.geHmiHelpPop p{margin:0 0 6px 0;line-height:1.4;}' +
			'.geHmiHelpPop p:last-child,.geHmiHelpPop ul:last-child{margin-bottom:0;}' +
			'.geHmiHelpPop ul{margin:0 0 6px 0;padding:0 0 0 18px;list-style:disc;}' +
			'.geHmiHelpPop li{margin:0 0 2px 0;line-height:1.4;}' +
			'.geHmiHelpPop code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;' +
				'font-size:12px;padding:0 3px;border-radius:3px;' +
				'background:light-dark(rgba(0,0,0,0.06),rgba(255,255,255,0.12));}';
		document.getElementsByTagName('head')[0].appendChild(style);
	};

	function inline(parent, text)
	{
		var parts = String(text).split('`');

		for (var i = 0; i < parts.length; i++)
		{
			if (parts[i] === '')
			{
				continue;
			}

			if (i % 2 == 1 && i < parts.length - 1)
			{
				var code = document.createElement('code');
				code.textContent = parts[i];
				parent.appendChild(code);
			}
			else
			{
				parent.appendChild(document.createTextNode((i % 2 == 1) ? '`' + parts[i] : parts[i]));
			}
		}
	};

	/**
	 * Renders paragraphs and bullet lists into the element.
	 */
	function render(el, text)
	{
		var lines = String(text).split('\n');
		var list = null;

		for (var i = 0; i < lines.length; i++)
		{
			var line = lines[i];

			if (/^\s*- /.test(line))
			{
				if (list == null)
				{
					list = document.createElement('ul');
					el.appendChild(list);
				}

				var li = document.createElement('li');
				inline(li, line.replace(/^\s*- /, ''));
				list.appendChild(li);
			}
			else if (line.replace(/\s+/g, '') !== '')
			{
				list = null;
				var p = document.createElement('p');
				inline(p, line);
				el.appendChild(p);
			}
		}
	};

	function position(icon)
	{
		var r = icon.getBoundingClientRect();
		var vw = document.documentElement.clientWidth || window.innerWidth;
		var vh = document.documentElement.clientHeight || window.innerHeight;
		var margin = 8;
		popover.style.maxHeight = (vh - 2 * margin) + 'px';
		var w = popover.offsetWidth;
		var h = popover.offsetHeight;
		var left = r.left + r.width / 2 - 24;
		left = Math.max(margin, Math.min(left, vw - w - margin));
		var top = r.bottom + 6;

		if (top + h > vh - margin)
		{
			var above = r.top - 6 - h;
			top = (above >= margin) ? above : Math.max(margin, vh - h - margin);
		}

		popover.style.left = left + 'px';
		popover.style.top = top + 'px';
	};

	/**
	 * Closes the open popover (if any).
	 */
	Help.close = function()
	{
		if (popover != null)
		{
			if (popover.parentNode != null)
			{
				popover.parentNode.removeChild(popover);
			}

			popover = null;
		}

		if (current != null)
		{
			current.setAttribute('aria-expanded', 'false');
			current = null;
		}
	};

	function listen()
	{
		if (listening)
		{
			return;
		}

		listening = true;

		// Capture phase: the popover closes before the dialog or the editor see the event
		document.addEventListener('keydown', function(evt)
		{
			if (popover != null && (evt.key == 'Escape' || evt.keyCode == 27))
			{
				var icon = current;
				evt.stopPropagation();
				evt.preventDefault();
				Help.close();

				if (icon != null && icon.focus != null)
				{
					icon.focus();
				}
			}
		}, true);

		document.addEventListener('mousedown', function(evt)
		{
			if (popover != null && !popover.contains(evt.target) &&
				!(current != null && current.contains(evt.target)))
			{
				Help.close();
			}
		}, true);

		document.addEventListener('scroll', function(evt)
		{
			if (popover != null && evt.target != popover && !popover.contains(evt.target))
			{
				Help.close();
			}
		}, true);

		window.addEventListener('resize', function()
		{
			Help.close();
		});
	};

	/**
	 * Opens the popover of the key below the icon.
	 */
	Help.show = function(icon, key, title)
	{
		var info = Help.text(key);

		if (info == null)
		{
			return;
		}

		Help.close();
		Help.installStyle();
		listen();
		popover = document.createElement('div');
		popover.className = 'geHmiHelpPop';
		popover.setAttribute('role', 'dialog');
		popover.setAttribute('data-help-popover', key);
		var heading = info.title || title;

		if (heading != null && heading !== '')
		{
			var h = document.createElement('div');
			h.className = 'geHmiHelpTitle';
			h.textContent = heading;
			popover.appendChild(h);
			popover.setAttribute('aria-label', heading);
		}

		render(popover, info.text);
		popover.style.visibility = 'hidden';
		document.body.appendChild(popover);
		current = icon;
		icon.setAttribute('aria-expanded', 'true');
		position(icon);
		popover.style.visibility = '';
	};

	/**
	 * Returns the help icon for the key (a key or an array of keys, the
	 * first one with a text wins), or null if there is no text.
	 */
	Help.icon = function(keys, title)
	{
		if (keys == null)
		{
			return null;
		}

		var key = Help.resolve(keys);

		if (key == null)
		{
			var first = (typeof keys === 'string') ? keys : keys[0];
			Help.missing[first] = true;

			return null;
		}

		Help.installStyle();
		var info = Help.text(key);
		var label = title || info.title || key;
		var btn = document.createElement('button');
		btn.setAttribute('type', 'button');
		btn.className = 'geHmiHelp';
		btn.setAttribute('tabindex', '0');
		btn.setAttribute('data-help', key);
		btn.setAttribute('aria-haspopup', 'dialog');
		btn.setAttribute('aria-expanded', 'false');
		btn.setAttribute('aria-label', (mxResources.get('hmiHelpLabel') || 'Help: {1}').replace('{1}', label));

		btn.addEventListener('click', function(evt)
		{
			// Never toggles the checkbox or switches the tab next to the icon
			evt.stopPropagation();
			evt.preventDefault();

			if (current == btn)
			{
				Help.close();
			}
			else
			{
				Help.show(btn, key, label);
			}
		});

		// The dialog must not treat Enter or Space on the icon as OK or a drag
		btn.addEventListener('keydown', function(evt)
		{
			if (evt.key == 'Enter' || evt.key == ' ')
			{
				evt.stopPropagation();
			}
		});

		return btn;
	};

	/**
	 * Appends the icon of the key to the parent (nothing if there is no
	 * text) and returns it.
	 */
	Help.attach = function(parent, keys, title)
	{
		var icon = Help.icon(keys, title);

		if (icon != null && parent != null)
		{
			parent.appendChild(icon);
		}

		return icon;
	};

	Hmi.Help = Help;
})();
