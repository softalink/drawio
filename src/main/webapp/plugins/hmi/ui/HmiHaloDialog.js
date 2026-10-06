/**
 * Hover Halo settings of the current page (runtime.hoverHalo, see
 * runtime/HmiHalo.js): presets, style (glow, outline or both), colour,
 * glow size and intensity, outline width/padding/radius/dashes and the
 * pressed effect, with a live preview that reacts to hover and press.
 */
(function()
{
	var root = (typeof globalThis !== 'undefined') ? globalThis : window;
	var Hmi = root.Hmi = root.Hmi || {};

	var HaloDialog = {};

	var SVG_NS = 'http://www.w3.org/2000/svg';

	/**
	 * Preset keys in display order (Hmi.Halo.PRESETS plus 'off').
	 */
	HaloDialog.PRESETS = ['softGlow', 'subtleGlow', 'strongGlow', 'crispOutline', 'shapeOutline',
		'dashedOutline', 'glowOutline', 'off'];

	/**
	 * Returns the stored value for the settings: false when off, otherwise
	 * an object with the values that differ from the defaults.
	 */
	HaloDialog.toConfig = function(settings, enabled)
	{
		if (!enabled)
		{
			return false;
		}

		var result = {};
		var defaults = Hmi.Halo.DEFAULTS;

		for (var key in defaults)
		{
			if (settings[key] != null && settings[key] !== '' && settings[key] !== defaults[key])
			{
				result[key] = settings[key];
			}
		}

		return result;
	};

	function el(tag, className, text)
	{
		var e = document.createElement(tag);

		if (className != null)
		{
			e.className = className;
		}

		if (text != null)
		{
			mxUtils.write(e, text);
		}

		return e;
	};

	function svg(tag, attrs)
	{
		var e = document.createElementNS(SVG_NS, tag);

		for (var key in attrs)
		{
			e.setAttribute(key, attrs[key]);
		}

		return e;
	};

	/**
	 * A range slider with its value shown next to it.
	 */
	function slider(min, max, step, value, unit)
	{
		var wrap = el('span', 'geHmiHaloSlider');
		var input = document.createElement('input');
		input.setAttribute('type', 'range');
		input.setAttribute('min', min);
		input.setAttribute('max', max);
		input.setAttribute('step', step);
		input.value = value;
		var out = el('span', 'geHmiHaloValue');
		wrap.appendChild(input);
		wrap.appendChild(out);

		var sync = function()
		{
			out.textContent = input.value + (unit || '');
		};

		mxEvent.addListener(input, 'input', sync);
		sync();
		wrap.input = input;
		wrap.getValue = function()
		{
			return parseFloat(input.value);
		};
		wrap.setValue = function(v)
		{
			input.value = v;
			sync();
		};

		return wrap;
	};

	function addHelp(parent, key)
	{
		return (Hmi.Help != null) ? Hmi.Help.attach(parent, key) : null;
	};

	function formRow(parent, label, input, helpKey)
	{
		var row = el('div', 'geDialogFormRow');
		var lbl = el('span', 'geDialogFormLabel', label + ':');
		addHelp(lbl, helpKey);
		row.appendChild(lbl);
		row.appendChild(input);
		parent.appendChild(row);

		return row;
	};

	HaloDialog.installStyle = function()
	{
		if (document.getElementById('geHmiHaloDialogStyle') != null)
		{
			return;
		}

		var style = document.createElement('style');
		style.id = 'geHmiHaloDialogStyle';
		style.textContent =
			'.geHmiHaloPresets{display:flex;flex-wrap:wrap;gap:6px;}' +
			'.geHmiHaloPresets .geBtn{margin:0;padding:0 10px;height:28px;}' +
			'.geHmiHaloPresets .geBtn.geHmiSel{border-color:light-dark(var(--focus-color),var(--dark-focus-color));' +
				'box-shadow:0 0 0 1px light-dark(var(--focus-color),var(--dark-focus-color)) inset;}' +
			'.geHmiHaloForm .geDialogFormLabel{min-width:140px;}' +
			'.geHmiHaloSlider{display:flex;align-items:center;gap:8px;flex:1;min-width:0;}' +
			'.geHmiHaloSlider input{flex:1;min-width:0;}' +
			'.geHmiHaloValue{min-width:44px;text-align:right;font-variant-numeric:tabular-nums;}' +
			'.geHmiHaloPreview{border:1px solid light-dark(var(--field-border-color),var(--dark-field-border-color));' +
				'border-radius:6px;overflow:hidden;display:flex;}' +
			'.geHmiHaloPreview svg{display:block;flex:1;}' +
			'.geHmiHaloPreview g[data-sample]{cursor:pointer;}' +
			'.geHmiHaloPreview [data-glow]{transition:filter 120ms ease-out;}';
		document.head.appendChild(style);
	};

	/**
	 * Live preview: three samples (button, lamp, text) on a light and on a
	 * dark background. The first sample shows hover, the second pressed;
	 * every sample also reacts to the mouse.
	 */
	function createPreview()
	{
		var wrap = el('div', 'geHmiHaloPreview');
		var panels = [];

		var backgrounds = [{fill: '#FFFFFF', text: '#263238'}, {fill: '#263238', text: '#ECEFF1'}];

		for (var b = 0; b < backgrounds.length; b++)
		{
			var bg = backgrounds[b];
			var s = svg('svg', {viewBox: '0 0 300 110', height: '110'});
			s.style.background = bg.fill;
			s.appendChild(svg('rect', {x: 0, y: 0, width: 300, height: 110, fill: bg.fill}));

			var samples = [];

			// Button (hover)
			var g1 = svg('g', {'data-sample': 'button'});
			var btn = svg('rect', {x: 22, y: 34, width: 96, height: 36, rx: 6, fill: '#1E88E5',
				stroke: '#1565C0', 'data-glow': '1'});
			g1.appendChild(btn);
			var t1 = svg('text', {x: 70, y: 57, 'text-anchor': 'middle', fill: '#FFFFFF',
				'font-size': 12, 'font-family': 'Helvetica, Arial, sans-serif', 'font-weight': 'bold'});
			t1.textContent = mxResources.get('hmiHaloHover');
			g1.appendChild(t1);
			s.appendChild(g1);
			samples.push({g: g1, shape: btn, x: 22, y: 34, w: 96, h: 36, state: 'hover'});

			// Lamp (pressed)
			var g2 = svg('g', {'data-sample': 'lamp'});
			var lamp = svg('circle', {cx: 170, cy: 52, r: 20, fill: '#43A047', stroke: '#1B5E20',
				'data-glow': '1'});
			g2.appendChild(lamp);
			s.appendChild(g2);
			var t2 = svg('text', {x: 170, y: 92, 'text-anchor': 'middle', fill: bg.text,
				'font-size': 11, 'font-family': 'Helvetica, Arial, sans-serif'});
			t2.textContent = mxResources.get('hmiHaloPressed');
			s.appendChild(t2);
			samples.push({g: g2, shape: lamp, x: 150, y: 32, w: 40, h: 40, state: 'pressed'});

			// Text-only object (idle until hovered)
			var g3 = svg('g', {'data-sample': 'text'});
			var t3 = svg('text', {x: 255, y: 57, 'text-anchor': 'middle', fill: bg.text,
				'font-size': 14, 'font-family': 'Helvetica, Arial, sans-serif', 'data-glow': '1'});
			t3.textContent = '42.5 %';
			g3.appendChild(svg('rect', {x: 215, y: 38, width: 80, height: 26, fill: 'transparent'}));
			g3.appendChild(t3);
			s.appendChild(g3);
			samples.push({g: g3, shape: t3, x: 222, y: 41, w: 66, h: 20, state: 'idle'});

			for (var i = 0; i < samples.length; i++)
			{
				(function(sample)
				{
					var initial = sample.state;
					mxEvent.addListener(sample.g, 'mouseenter', function()
					{
						sample.state = 'hover';
						wrap.refresh();
					});
					mxEvent.addListener(sample.g, 'mouseleave', function()
					{
						sample.state = initial;
						wrap.refresh();
					});
					mxEvent.addListener(sample.g, 'mousedown', function()
					{
						sample.state = 'pressed';
						wrap.refresh();
					});
					mxEvent.addListener(sample.g, 'mouseup', function()
					{
						sample.state = 'hover';
						wrap.refresh();
					});
				})(samples[i]);
			}

			panels.push({svg: s, samples: samples});
			wrap.appendChild(s);
		}

		wrap.settings = null;
		wrap.refresh = function()
		{
			var cfg = wrap.settings;

			for (var p = 0; p < panels.length; p++)
			{
				var old = panels[p].svg.querySelectorAll('[data-outline],filter');

				for (var k = 0; k < old.length; k++)
				{
					old[k].parentNode.removeChild(old[k]);
				}

				for (var i = 0; i < panels[p].samples.length; i++)
				{
					var sample = panels[p].samples[i];
					var active = cfg != null && sample.state != 'idle';
					var pressed = sample.state == 'pressed' && cfg != null && cfg.press !== false;

					var parts = [];
					var shapeOutline = active && cfg.style != 'glow' && cfg.outlineShape == 'shape';

					if (shapeOutline)
					{
						var f = Hmi.Halo.createShapeOutlineFilter(document, cfg, pressed,
							{x: sample.x, y: sample.y, width: sample.w, height: sample.h});
						panels[p].svg.appendChild(f);
						parts.push('url(#' + f.getAttribute('id') + ')');
					}

					if (active && cfg.style != 'outline')
					{
						parts.push(Hmi.Halo.filterFor(cfg, pressed));
					}

					sample.shape.style.filter = parts.join(' ');

					if (active && cfg.style != 'glow' && !shapeOutline)
					{
						var width = cfg.width + (pressed ? 1 : 0);
						var r = svg('rect', {x: sample.x - cfg.padding + 0.5, y: sample.y - cfg.padding + 0.5,
							width: sample.w + 2 * cfg.padding, height: sample.h + 2 * cfg.padding,
							rx: cfg.radius, ry: cfg.radius, fill: 'none',
							stroke: Hmi.Halo.colorFor(cfg, pressed), 'stroke-width': width,
							'pointer-events': 'none', 'data-outline': '1'});

						if (cfg.dashed)
						{
							r.setAttribute('stroke-dasharray', (width * 3) + ' ' + (width * 2));
						}

						panels[p].svg.appendChild(r);
					}
				}
			}
		};

		return wrap;
	};

	/**
	 * Shows the dialog for the current page.
	 */
	HaloDialog.show = function(ui)
	{
		HaloDialog.installStyle();
		var graph = ui.editor.graph;
		var cfg = Hmi.Model.getDocConfig(graph);
		cfg.runtime = cfg.runtime || {};
		var stored = cfg.runtime.hoverHalo;
		var settings = Hmi.Halo.normalize([stored === false ? {} : stored]);
		var enabled = stored !== false;

		var div = el('div');
		var title = el('h3', null, mxResources.get('hmiHoverHalo'));
		addHelp(title, 'halo.dialog');
		div.appendChild(title);

		var hint = el('div', 'geDialogHint', mxResources.get('hmiHaloHint'));
		hint.style.marginBottom = '10px';
		div.appendChild(hint);

		// Presets
		var presetSection = el('div', 'geDialogSection');
		div.appendChild(presetSection);
		var presetHead = el('div', 'geDialogHint geHmiSubHead', mxResources.get('hmiHaloPresets'));
		addHelp(presetHead, 'halo.presets');
		presetSection.appendChild(presetHead);
		var presets = el('div', 'geHmiHaloPresets');
		presetSection.appendChild(presets);
		var presetButtons = {};

		// Preview
		var previewHead = el('div', 'geDialogHint geHmiSubHead', mxResources.get('hmiHaloPreview'));
		addHelp(previewHead, 'halo.preview');
		presetSection.appendChild(previewHead);
		var preview = createPreview();
		presetSection.appendChild(preview);

		// Basic settings
		var basic = el('div', 'geDialogSection geHmiHaloForm');
		div.appendChild(basic);

		var enabledCb = Hmi.Editors.checkbox(mxResources.get('hmiHaloEnabled'), enabled);
		addHelp(enabledCb, 'halo.enabled');
		basic.appendChild(enabledCb);

		var styleSelect = document.createElement('select');
		var styles = [['glow', 'hmiHaloGlow'], ['outline', 'hmiHaloOutline'],
			['glowOutline', 'hmiHaloGlowOutline']];

		for (var i = 0; i < styles.length; i++)
		{
			var opt = document.createElement('option');
			opt.value = styles[i][0];
			mxUtils.write(opt, mxResources.get(styles[i][1]));
			styleSelect.appendChild(opt);
		}

		var styleRow = formRow(basic, mxResources.get('hmiHaloStyle'), styleSelect, 'halo.style');
		var color = Hmi.Editors.colorInput(ui, settings.color);
		var colorRow = formRow(basic, mxResources.get('color'), color, 'halo.color');
		var size = slider(1, 40, 1, settings.size, ' px');
		var sizeRow = formRow(basic, mxResources.get('hmiHaloGlowSize'), size, 'halo.size');
		var intensity = slider(10, 100, 5, settings.intensity, ' %');
		var intensityRow = formRow(basic, mxResources.get('hmiHaloIntensity'), intensity, 'halo.intensity');
		var width = slider(1, 8, 1, settings.width, ' px');
		var widthRow = formRow(basic, mxResources.get('hmiHaloLineWidth'), width, 'halo.width');
		var outlineShape = document.createElement('select');
		var shapes = [['rect', 'hmiHaloOutlineRect'], ['shape', 'hmiHaloOutlineShape']];

		for (var i = 0; i < shapes.length; i++)
		{
			var o = document.createElement('option');
			o.value = shapes[i][0];
			mxUtils.write(o, mxResources.get(shapes[i][1]));
			outlineShape.appendChild(o);
		}

		outlineShape.className = 'geHmiHaloOutlineShape';
		var outlineShapeRow = formRow(basic, mxResources.get('hmiHaloOutlineFollows'), outlineShape, 'halo.outlineShape');

		var padding = slider(0, 20, 1, settings.padding, ' px');
		var paddingRow = formRow(basic, mxResources.get('hmiHaloPadding'), padding, 'halo.padding');
		var radius = slider(0, 20, 1, settings.radius, ' px');
		var radiusRow = formRow(basic, mxResources.get('hmiHaloRadius'), radius, 'halo.radius');
		var dashed = Hmi.Editors.checkbox(mxResources.get('hmiHaloDashed'), settings.dashed);
		addHelp(dashed, 'halo.dashed');
		basic.appendChild(dashed);
		var press = Hmi.Editors.checkbox(mxResources.get('hmiHaloPress'), settings.press !== false);
		addHelp(press, 'halo.press');
		basic.appendChild(press);
		var pressColor = Hmi.Editors.colorInput(ui, settings.pressColor || '');
		pressColor.input.setAttribute('placeholder', mxResources.get('hmiHaloSameColor'));
		var pressColorRow = formRow(basic, mxResources.get('hmiHaloPressColor'), pressColor, 'halo.pressColor');

		var read = function()
		{
			return Hmi.Halo.normalize([{style: styleSelect.value, outlineShape: outlineShape.value,
				color: color.getValue() || Hmi.Halo.DEFAULTS.color,
				size: size.getValue(), intensity: intensity.getValue(), width: width.getValue(),
				padding: padding.getValue(), radius: radius.getValue(), dashed: dashed.input.checked,
				press: press.input.checked, pressColor: pressColor.getValue() || null}]);
		};

		var write = function(s)
		{
			styleSelect.value = s.style;
			outlineShape.value = s.outlineShape;
			color.setValue(s.color);
			size.setValue(s.size);
			intensity.setValue(s.intensity);
			width.setValue(s.width);
			padding.setValue(s.padding);
			radius.setValue(s.radius);
			dashed.input.checked = s.dashed;
			press.input.checked = s.press !== false;
			pressColor.setValue(s.pressColor || '');
		};

		// Rows that do not apply to the current style or state are disabled
		var update = function()
		{
			var on = enabledCb.input.checked;
			var s = read();
			var glow = s.style != 'outline';
			var line = s.style != 'glow';
			var rect = line && s.outlineShape == 'rect';
			var rows = [[styleRow, on], [colorRow, on], [sizeRow, on && glow],
				[intensityRow, on && glow], [widthRow, on && line], [outlineShapeRow, on && line],
				[paddingRow, on && line], [radiusRow, on && rect], [dashed, on && rect], [press, on],
				[pressColorRow, on && press.input.checked]];

			for (var i = 0; i < rows.length; i++)
			{
				rows[i][0].style.opacity = rows[i][1] ? '' : '0.45';
				var inputs = rows[i][0].querySelectorAll('input,select,button');

				for (var j = 0; j < inputs.length; j++)
				{
					// The help icons stay usable
					if (!inputs[j].hasAttribute('data-help'))
					{
						inputs[j].disabled = !rows[i][1];
					}
				}
			}

			// Highlights the matching preset
			for (var key in presetButtons)
			{
				var match = (key == 'off') ? !on : on && matchesPreset(s, key);
				presetButtons[key].className = 'geBtn' + (match ? ' geHmiSel' : '');
			}

			preview.settings = on ? s : null;
			preview.refresh();
		};

		var matchesPreset = function(s, key)
		{
			var p = Hmi.Halo.normalize([{preset: key, color: s.color, press: s.press,
				pressColor: s.pressColor}]);

			for (var k in p)
			{
				if (p[k] !== s[k])
				{
					return false;
				}
			}

			return true;
		};

		for (var i = 0; i < HaloDialog.PRESETS.length; i++)
		{
			(function(key)
			{
				var btn = mxUtils.button(mxResources.get('hmiHaloPreset_' + key), function()
				{
					if (key == 'off')
					{
						enabledCb.input.checked = false;
					}
					else
					{
						enabledCb.input.checked = true;
						var current = read();
						write(Hmi.Halo.normalize([{preset: key, color: current.color,
							press: current.press, pressColor: current.pressColor}]));
					}

					update();
				});
				btn.className = 'geBtn';
				btn.setAttribute('data-preset', key);
				presetButtons[key] = btn;
				presets.appendChild(btn);
			})(HaloDialog.PRESETS[i]);
		}

		write(settings);

		var controls = div.querySelectorAll('input,select');

		for (var i = 0; i < controls.length; i++)
		{
			mxEvent.addListener(controls[i], 'input', update);
			mxEvent.addListener(controls[i], 'change', update);
		}

		// Colour picker changes do not fire input events
		var colorSync = setInterval(function()
		{
			if (colorSync.started && !document.body.contains(div))
			{
				clearInterval(colorSync);
			}
			else
			{
				colorSync.started = true;
				var key = color.getValue() + '|' + pressColor.getValue();

				if (key != colorSync.last)
				{
					colorSync.last = key;
					update();
				}
			}
		}, 300);

		update();

		var resetBtn = mxUtils.button(mxResources.get('reset'), function()
		{
			enabledCb.input.checked = true;
			write(Hmi.Halo.normalize([]));
			update();
		});
		resetBtn.className = 'geBtn';

		var dlg = new CustomDialog(ui, div, function()
		{
			clearInterval(colorSync);
			var value = HaloDialog.toConfig(read(), enabledCb.input.checked);
			var next = Hmi.Model.getDocConfig(graph);
			next.runtime = next.runtime || {};

			if (value !== false && Object.keys(value).length == 0)
			{
				delete next.runtime.hoverHalo;
			}
			else
			{
				next.runtime.hoverHalo = value;
			}

			Hmi.Model.setDocConfig(graph, next);
		}, function()
		{
			clearInterval(colorSync);
		}, mxResources.get('ok'), null, resetBtn, null, null, true);
		ui.showDialog(dlg.container, 560, null, true, true);
	};

	Hmi.HaloDialog = HaloDialog;
})();
