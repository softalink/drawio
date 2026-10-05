/**
 * On-screen numeric keypad and keyboard (InTouch Visualization Guide pages
 * 76-79, see INTOUCH_LINKS.md §9). Works in the editor, the full-app
 * runtime and hmi-run.html (no draw.io dialog framework needed).
 *
 * Hmi.Keypad.numeric(opts) / Hmi.Keypad.keyboard(opts) → Promise<{ok, value}>
 * opts = {title, value, min, max, echo: 'yes'|'no'|'password', passwordChar,
 * type: 'standard'|'system'|'resizable'}
 */
(function()
{
	var root = (typeof globalThis !== 'undefined') ? globalThis : window;
	var Hmi = root.Hmi = root.Hmi || {};

	var Keypad = {};

	/**
	 * Returns the configured keyboard type (DRAWIO_CONFIG.hmi.keyboard).
	 */
	Keypad.getType = function(opts)
	{
		if (opts != null && opts.type != null)
		{
			return opts.type;
		}

		var cfg = (root.DRAWIO_CONFIG != null && root.DRAWIO_CONFIG.hmi != null) ?
			root.DRAWIO_CONFIG.hmi : {};

		return cfg.keyboard || 'standard';
	};

	var KEY_ROWS = [
		['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='],
		['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']'],
		['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', '\'', '/'],
		['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '_', '@', '#']
	];

	var NUM_ROWS = [['7', '8', '9'], ['4', '5', '6'], ['1', '2', '3'], ['0', '.', '-']];

	function el(tag, css, text)
	{
		var e = document.createElement(tag);

		if (css != null)
		{
			e.style.cssText = css;
		}

		if (text != null)
		{
			e.appendChild(document.createTextNode(text));
		}

		return e;
	};

	var BTN_CSS = 'min-width:44px;height:40px;margin:3px;border-radius:5px;border:1px solid #90A4AE;' +
		'background:#ECEFF1;color:#212121;font:15px -apple-system,Segoe UI,Helvetica,Arial,sans-serif;' +
		'cursor:pointer;flex:1 1 auto;';

	/**
	 * Shows the keypad/keyboard. numeric selects the layout.
	 */
	Keypad.show = function(opts, numeric)
	{
		opts = opts || {};
		var type = Keypad.getType(opts);

		return new Promise(function(resolve)
		{
			var back = el('div', 'position:fixed;inset:0;z-index:100001;display:flex;' +
				'align-items:center;justify-content:center;background:rgba(0,0,0,0.35);');
			back.className = 'geHmiKeypad';
			var box = el('div', 'background:#FAFAFA;color:#212121;border-radius:8px;padding:14px;' +
				'box-shadow:0 8px 24px rgba(0,0,0,0.35);box-sizing:border-box;' +
				'width:' + (numeric ? 260 : 620) + 'px;max-width:96vw;' +
				'font:14px -apple-system,Segoe UI,Helvetica,Arial,sans-serif;' +
				((type == 'resizable') ? 'resize:both;overflow:auto;min-width:220px;min-height:200px;' : ''));
			box.setAttribute('role', 'dialog');
			box.setAttribute('aria-label', opts.title || '');
			back.appendChild(box);

			if (opts.title)
			{
				box.appendChild(el('div', 'font-weight:600;margin:0 0 8px 2px;white-space:pre-wrap;', opts.title));
			}

			var echo = opts.echo || 'yes';
			var input = el('input', 'width:100%;box-sizing:border-box;font-size:18px;padding:6px 8px;' +
				'border:1px solid #90A4AE;border-radius:4px;margin-bottom:6px;' +
				((echo == 'no') ? 'color:transparent;caret-color:#212121;' : ''));
			input.type = (echo == 'password') ? 'password' : 'text';

			if (numeric)
			{
				input.setAttribute('inputmode', 'decimal');
			}

			input.value = (opts.value != null) ? String(opts.value) : '';
			box.appendChild(input);

			var hint = el('div', 'min-height:16px;font-size:12px;color:#C62828;margin:0 0 4px 2px;');
			box.appendChild(hint);

			if (numeric && (opts.min != null || opts.max != null))
			{
				hint.style.color = '#546E7A';
				hint.textContent = '[' + ((opts.min != null) ? opts.min : '') + ' .. ' +
					((opts.max != null) ? opts.max : '') + ']';
			}

			var done = function(ok)
			{
				var value = input.value;

				if (ok && numeric)
				{
					var num = parseFloat(value);

					if (value.trim() === '' || isNaN(num))
					{
						hint.style.color = '#C62828';
						hint.textContent = 'Invalid number';

						return;
					}

					if ((opts.min != null && num < opts.min) || (opts.max != null && num > opts.max))
					{
						hint.style.color = '#C62828';
						hint.textContent = 'Value must be between ' + opts.min + ' and ' + opts.max;

						return;
					}

					value = num;
				}

				if (back.parentNode != null)
				{
					back.parentNode.removeChild(back);
				}

				resolve({ok: ok, value: ok ? value : null});
			};

			var insert = function(text)
			{
				var start = (input.selectionStart != null) ? input.selectionStart : input.value.length;
				var end = (input.selectionEnd != null) ? input.selectionEnd : input.value.length;
				input.value = input.value.substring(0, start) + text + input.value.substring(end);
				var pos = start + text.length;
				input.focus();

				try
				{
					input.setSelectionRange(pos, pos);
				}
				catch (e)
				{
					// ignore (e.g. password inputs in some browsers)
				}
			};

			var shift = false;
			var keyButtons = [];

			if (type != 'system')
			{
				var rows = numeric ? NUM_ROWS : KEY_ROWS;

				for (var r = 0; r < rows.length; r++)
				{
					var row = el('div', 'display:flex;');

					for (var k = 0; k < rows[r].length; k++)
					{
						(function(ch)
						{
							var b = el('button', BTN_CSS, ch);
							b.type = 'button';
							b.setAttribute('data-key', ch);
							b.addEventListener('mousedown', function(evt)
							{
								evt.preventDefault();
							});
							b.addEventListener('click', function()
							{
								insert(shift ? ch.toUpperCase() : ch);
							});
							keyButtons.push(b);
							row.appendChild(b);
						})(rows[r][k]);
					}

					box.appendChild(row);
				}

				var bottom = el('div', 'display:flex;');

				var addKey = function(label, fn, flex)
				{
					var b = el('button', BTN_CSS + ((flex != null) ? 'flex:' + flex + ';' : ''), label);
					b.type = 'button';
					b.addEventListener('mousedown', function(evt)
					{
						evt.preventDefault();
					});
					b.addEventListener('click', fn);
					bottom.appendChild(b);

					return b;
				};

				if (!numeric)
				{
					var shiftKey = addKey('⇧', function()
					{
						shift = !shift;
						shiftKey.style.background = shift ? '#B0BEC5' : '#ECEFF1';

						for (var i = 0; i < keyButtons.length; i++)
						{
							var ch = keyButtons[i].getAttribute('data-key');
							keyButtons[i].textContent = shift ? ch.toUpperCase() : ch;
						}
					});
					addKey('Space', function()
					{
						insert(' ');
					}, '4 1 auto');
				}

				addKey('⌫', function()
				{
					var start = input.selectionStart, end = input.selectionEnd;

					if (start != null && start == end && start > 0)
					{
						input.value = input.value.substring(0, start - 1) + input.value.substring(end);
						input.setSelectionRange(start - 1, start - 1);
					}
					else if (start != null)
					{
						input.value = input.value.substring(0, start) + input.value.substring(end);
						input.setSelectionRange(start, start);
					}

					input.focus();
				});
				addKey('Clear', function()
				{
					input.value = '';
					input.focus();
				});
				box.appendChild(bottom);
			}

			var actions = el('div', 'display:flex;justify-content:flex-end;gap:8px;margin-top:10px;');
			var cancel = el('button', 'padding:7px 16px;border-radius:4px;border:1px solid #9E9E9E;' +
				'background:#fff;color:#212121;font:inherit;cursor:pointer;', 'Cancel');
			cancel.type = 'button';
			cancel.className = 'geHmiKeypadCancel';
			cancel.addEventListener('click', function()
			{
				done(false);
			});
			var ok = el('button', 'padding:7px 20px;border-radius:4px;border:1px solid #1565C0;' +
				'background:#1565C0;color:#fff;font:inherit;cursor:pointer;', 'OK');
			ok.type = 'button';
			ok.className = 'geHmiKeypadOk';
			ok.addEventListener('click', function()
			{
				done(true);
			});
			actions.appendChild(cancel);
			actions.appendChild(ok);
			box.appendChild(actions);

			input.addEventListener('keydown', function(evt)
			{
				if (evt.keyCode == 13)
				{
					evt.preventDefault();
					done(true);
				}
				else if (evt.keyCode == 27)
				{
					evt.preventDefault();
					done(false);
				}

				evt.stopPropagation();
			});

			document.body.appendChild(back);
			input.focus();
			input.select();
		});
	};

	Keypad.numeric = function(opts)
	{
		return Keypad.show(opts, true);
	};

	Keypad.keyboard = function(opts)
	{
		return Keypad.show(opts, false);
	};

	/**
	 * Small modal with a message and a set of buttons (discrete user input,
	 * page 70). Returns Promise<index of the clicked button or -1>.
	 */
	Keypad.choice = function(title, labels)
	{
		return new Promise(function(resolve)
		{
			var back = el('div', 'position:fixed;inset:0;z-index:100001;display:flex;' +
				'align-items:center;justify-content:center;background:rgba(0,0,0,0.35);');
			back.className = 'geHmiKeypad';
			var box = el('div', 'background:#FAFAFA;color:#212121;border-radius:8px;padding:18px 20px;' +
				'min-width:260px;box-shadow:0 8px 24px rgba(0,0,0,0.35);' +
				'font:14px -apple-system,Segoe UI,Helvetica,Arial,sans-serif;');
			box.setAttribute('role', 'dialog');
			back.appendChild(box);
			box.appendChild(el('div', 'margin-bottom:14px;white-space:pre-wrap;', title || ''));
			var row = el('div', 'display:flex;gap:8px;justify-content:flex-end;');
			box.appendChild(row);

			var close = function(index)
			{
				document.removeEventListener('keydown', keyHandler, true);

				if (back.parentNode != null)
				{
					back.parentNode.removeChild(back);
				}

				resolve(index);
			};

			var keyHandler = function(evt)
			{
				if (evt.keyCode == 27)
				{
					evt.preventDefault();
					close(-1);
				}
			};

			for (var i = 0; i < labels.length; i++)
			{
				(function(index)
				{
					var b = el('button', 'padding:7px 16px;border-radius:4px;font:inherit;cursor:pointer;' +
						'border:1px solid #1565C0;background:#1565C0;color:#fff;', labels[index]);
					b.type = 'button';
					b.className = 'geHmiChoice geHmiChoice' + index;
					b.addEventListener('click', function()
					{
						close(index);
					});
					row.appendChild(b);
				})(i);
			}

			var cancel = el('button', 'padding:7px 16px;border-radius:4px;font:inherit;cursor:pointer;' +
				'border:1px solid #9E9E9E;background:#fff;color:#212121;', 'Cancel');
			cancel.type = 'button';
			cancel.className = 'geHmiChoiceCancel';
			cancel.addEventListener('click', function()
			{
				close(-1);
			});
			row.appendChild(cancel);
			document.addEventListener('keydown', keyHandler, true);
			document.body.appendChild(back);
		});
	};

	Hmi.Keypad = Keypad;
})();
