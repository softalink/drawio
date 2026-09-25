/**
 * Copyright (c) 2025-2026, JGraph Holdings Ltd
 * Copyright (c) 2025-2026, draw.io AG
 *
 * HMI/SCADA widget shape library. See shapes/hmi/README.md for the full
 * style key reference and docs/hmi/SRS.md 3.9 (HMI-WGT-1..23) for the
 * requirements these shapes implement.
 *
 * All shapes are DOM-free: they paint exclusively through the
 * mxAbstractCanvas2D API passed into paintVertexShape, so they render
 * identically in the SVG DOM, PNG/PDF export and headless export.
 *
 * The HMI runtime (plugins/hmi/*, out of scope for this file) writes the
 * live value into the cell style under the key 'hmiValue' (and other
 * 'hmi<Name>' keys per the 'prop:<name>' binding convention documented in
 * plugins/hmi/ARCHITECTURE.md 2.3) through the runtime overlay -- it never
 * edits the model. Each shape below simply reads those style keys with
 * mxUtils.getValue(this.style, 'hmiValue', <design-time default>), so the
 * exact same code renders correctly at design time (showing the default,
 * or whatever value a designer typed into the style) and at runtime
 * (showing the live overlay value).
 */
(function()
{
	//======================================================================
	// Shared helpers
	//======================================================================

	var HmiUtil = {};

	/**
	 * Returns the plain-text label of the shape's cell (user objects and
	 * HTML labels included) or null.
	 */
	HmiUtil.getLabel = function(shape)
	{
		var state = shape.state;

		if (state == null || state.cell == null)
		{
			return null;
		}

		var graph = state.view.graph;
		var label = graph.convertValueToString(state.cell);

		if (label != null && graph.isHtmlLabel(state.cell))
		{
			label = label.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '').
				replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').
				replace(/&quot;/g, '"').replace(/&amp;/g, '&');
		}

		return (label != null && label !== '') ? label : null;
	};

	/**
	 * Parses a float style value, always returning a finite number.
	 */
	HmiUtil.num = function(style, key, def)
	{
		var v = mxUtils.getValue(style, key, def);
		v = parseFloat(v);

		return isNaN(v) ? parseFloat(def) : v;
	};

	HmiUtil.int = function(style, key, def)
	{
		var v = mxUtils.getValue(style, key, def);
		v = parseInt(v, 10);

		return isNaN(v) ? parseInt(def, 10) : v;
	};

	HmiUtil.bool = function(style, key, def)
	{
		var v = mxUtils.getValue(style, key, def);

		return v == '1' || v === 1 || v === true || v == 'true';
	};

	HmiUtil.str = function(style, key, def)
	{
		var v = mxUtils.getValue(style, key, def);

		return (v == null) ? def : String(v);
	};

	/**
	 * Formats a numeric value with a fixed number of decimals, tolerant of
	 * NaN (renders '--').
	 */
	HmiUtil.format = function(value, decimals)
	{
		var n = parseFloat(value);

		if (isNaN(n))
		{
			return '--';
		}

		return n.toFixed(Math.max(0, decimals));
	};

	/**
	 * Clamps a value between min/max.
	 */
	HmiUtil.clamp = function(v, min, max)
	{
		return Math.max(min, Math.min(max, v));
	};

	/**
	 * Parses "min:max:color,min:max:color,..." band definitions
	 * (hmiBands) into [{min, max, color}, ...].
	 */
	HmiUtil.parseBands = function(str)
	{
		var result = [];

		if (str == null || str === '')
		{
			return result;
		}

		var parts = String(str).split(',');

		for (var i = 0; i < parts.length; i++)
		{
			var seg = mxUtils.trim(parts[i]);

			if (seg.length == 0)
			{
				continue;
			}

			var vals = seg.split(':');

			if (vals.length >= 3)
			{
				var min = parseFloat(vals[0]);
				var max = parseFloat(vals[1]);
				var color = mxUtils.trim(vals[2]);

				if (!isNaN(min) && !isNaN(max))
				{
					result.push({min: min, max: max, color: color});
				}
			}
		}

		return result;
	};

	/**
	 * Parses "key:value,key:value,..." maps (hmiStates, hmiOptions) into a
	 * plain object keyed by the (string) key, preserving insertion order in
	 * a parallel array.
	 */
	HmiUtil.parseMap = function(str)
	{
		var order = [];
		var map = {};

		if (str == null || str === '')
		{
			return {order: order, map: map};
		}

		var parts = String(str).split(',');

		for (var i = 0; i < parts.length; i++)
		{
			var seg = mxUtils.trim(parts[i]);

			if (seg.length == 0)
			{
				continue;
			}

			var idx = seg.indexOf(':');

			if (idx > 0)
			{
				var k = mxUtils.trim(seg.substring(0, idx));
				var v = mxUtils.trim(seg.substring(idx + 1));
				map[k] = v;
				order.push(k);
			}
		}

		return {order: order, map: map};
	};

	/**
	 * Returns the band color whose [min, max) range contains value, or null.
	 */
	HmiUtil.bandColorFor = function(bands, value)
	{
		for (var i = 0; i < bands.length; i++)
		{
			if (value >= bands[i].min && value <= bands[i].max)
			{
				return bands[i].color;
			}
		}

		return null;
	};

	/**
	 * Draws the small 'quality bad/stale' badge (a '?' bubble, top-right)
	 * used by several widgets, and returns whether the border should be
	 * dashed to reinforce the non-good quality (HMI-USA-2: never colour
	 * alone).
	 */
	HmiUtil.paintQualityBadge = function(c, w, h, quality)
	{
		if (quality != 'bad' && quality != 'stale')
		{
			return false;
		}

		var r = Math.max(7, Math.min(w, h) * 0.12);
		var cx = w - r - 2;
		var cy = r + 2;

		c.save();
		c.setShadow(false);
		c.setDashed(false);
		c.setFillColor(quality == 'bad' ? '#e74c3c' : '#f39c12');
		c.setStrokeColor('#ffffff');
		c.setStrokeWidth(1);
		c.begin();
		c.ellipse(cx - r, cy - r, 2 * r, 2 * r);
		c.fillAndStroke();
		c.setFontColor('#ffffff');
		c.setFontSize(Math.round(r * 1.3));
		c.setFontStyle(mxConstants.FONT_BOLD);
		c.text(cx, cy, 0, 0, '?', mxConstants.ALIGN_CENTER, mxConstants.ALIGN_MIDDLE, 0);
		c.restore();

		return true;
	};

	HmiUtil.PI180 = Math.PI / 180;

	//======================================================================
	// Base class: common style plumbing shared by every HMI widget.
	//======================================================================

	function mxShapeHmiBase(bounds, fill, stroke, strokewidth)
	{
		mxShape.call(this);
		this.bounds = bounds;
		this.fill = fill;
		this.stroke = stroke;
		this.strokewidth = (strokewidth != null) ? strokewidth : 1;
	};

	mxUtils.extend(mxShapeHmiBase, mxShape);

	mxShapeHmiBase.prototype.paintVertexShape = function(c, x, y, w, h)
	{
		c.translate(x, y);
		this.paintWidget(c, w, h);
	};

	mxShapeHmiBase.prototype.paintWidget = function(c, w, h)
	{
		// Overridden by subclasses.
	};

	//======================================================================
	// 1. Numeric display / value label  (HMI-WGT-1)
	//======================================================================

	function mxShapeHmiNumDisplay()
	{
		mxShapeHmiBase.apply(this, arguments);
	};

	mxUtils.extend(mxShapeHmiNumDisplay, mxShapeHmiBase);

	mxShapeHmiNumDisplay.prototype.cst = {SHAPE: 'mxgraph.hmi.numDisplay'};

	mxShapeHmiNumDisplay.prototype.customProperties = [
		{name: 'hmiValue', dispName: 'Value', type: 'float', defVal: 42.5},
		{name: 'hmiDecimals', dispName: 'Decimals', type: 'int', min: 0, max: 6, defVal: 1},
		{name: 'hmiUnit', dispName: 'Unit', type: 'string', defVal: '°C'},
		{name: 'hmiPrefix', dispName: 'Prefix', type: 'string', defVal: ''},
		{name: 'hmiAlign', dispName: 'Alignment', type: 'enum', defVal: 'center',
			enumList: [{val: 'left', dispName: 'Left'}, {val: 'center', dispName: 'Center'}, {val: 'right', dispName: 'Right'}]},
		{name: 'hmiLcd', dispName: 'LCD style', type: 'bool', defVal: false},
		{name: 'hmiQuality', dispName: 'Quality', type: 'enum', defVal: 'good',
			enumList: [{val: 'good', dispName: 'Good'}, {val: 'bad', dispName: 'Bad'}, {val: 'stale', dispName: 'Stale'}]}
	];

	mxShapeHmiNumDisplay.prototype.paintWidget = function(c, w, h)
	{
		var value = HmiUtil.num(this.style, 'hmiValue', '42.5');
		var decimals = HmiUtil.int(this.style, 'hmiDecimals', '1');
		var unit = HmiUtil.str(this.style, 'hmiUnit', '');
		var prefix = HmiUtil.str(this.style, 'hmiPrefix', '');
		var align = HmiUtil.str(this.style, 'hmiAlign', 'center');
		var lcd = HmiUtil.bool(this.style, 'hmiLcd', '0');
		var quality = HmiUtil.str(this.style, 'hmiQuality', 'good');
		var fill = mxUtils.getValue(this.style, mxConstants.STYLE_FILLCOLOR, lcd ? '#0b1f14' : '#ffffff');
		var stroke = mxUtils.getValue(this.style, mxConstants.STYLE_STROKECOLOR, '#90a4ae');
		var fontColor = mxUtils.getValue(this.style, mxConstants.STYLE_FONTCOLOR, lcd ? '#39ff6a' : '#263238');
		var fontSize = HmiUtil.num(this.style, mxConstants.STYLE_FONTSIZE, Math.max(10, h * 0.42));

		var bad = (quality == 'bad' || quality == 'stale');

		c.setFillColor(fill);
		c.setStrokeColor(stroke);
		c.setDashed(bad, false);
		c.roundrect(0.5, 0.5, w - 1, h - 1, Math.min(6, h * 0.15), Math.min(6, h * 0.15));
		c.fillAndStroke();

		if (lcd)
		{
			// Subtle inner bevel to read as an LCD/7-seg style readout.
			c.setShadow(false);
			c.save();
			c.setAlpha(0.5);
			c.setStrokeColor('#000000');
			c.begin();
			c.roundrect(2.5, 2.5, w - 5, h - 5, 4, 4);
			c.stroke();
			c.restore();
		}

		var text = prefix + HmiUtil.format(value, decimals) + (unit ? (' ' + unit) : '');
		var pad = 6;
		var tx = (align == 'left') ? pad : (align == 'right') ? (w - pad) : w / 2;
		var talign = (align == 'left') ? mxConstants.ALIGN_LEFT : (align == 'right') ? mxConstants.ALIGN_RIGHT : mxConstants.ALIGN_CENTER;

		c.setFontColor(fontColor);
		c.setFontSize(fontSize);
		c.setFontStyle(lcd ? mxConstants.FONT_BOLD : 0);
		c.setFontFamily(lcd ? 'Consolas, "Courier New", monospace' : mxConstants.DEFAULT_FONTFAMILY);
		c.text(tx, h / 2, 0, 0, text, talign, mxConstants.ALIGN_MIDDLE, 0);

		HmiUtil.paintQualityBadge(c, w, h, quality);
	};

	mxCellRenderer.registerShape(mxShapeHmiNumDisplay.prototype.cst.SHAPE, mxShapeHmiNumDisplay);

	//======================================================================
	// 2. Radial gauge  (HMI-WGT-2)  -- ported from meta2d.js le5le-charts
	// gauge.ts (MIT licensed) redrawn with the mxAbstractCanvas2D API.
	//======================================================================

	function mxShapeHmiRadialGauge()
	{
		mxShapeHmiBase.apply(this, arguments);
	};

	mxUtils.extend(mxShapeHmiRadialGauge, mxShapeHmiBase);

	mxShapeHmiRadialGauge.prototype.cst = {SHAPE: 'mxgraph.hmi.radialGauge'};

	mxShapeHmiRadialGauge.prototype.customProperties = [
		{name: 'hmiValue', dispName: 'Value', type: 'float', defVal: 65},
		{name: 'hmiMin', dispName: 'Min', type: 'float', defVal: 0},
		{name: 'hmiMax', dispName: 'Max', type: 'float', defVal: 100},
		{name: 'hmiStartAngle', dispName: 'Start Angle', type: 'float', defVal: 135},
		{name: 'hmiEndAngle', dispName: 'End Angle', type: 'float', defVal: 405},
		{name: 'hmiMajorTicks', dispName: 'Major Ticks', type: 'int', min: 2, max: 20, defVal: 5},
		{name: 'hmiMinorTicks', dispName: 'Minor Ticks', type: 'int', min: 0, max: 10, defVal: 4},
		{name: 'hmiBands', dispName: 'Bands', type: 'string', defVal: '0:60:#2ecc71,60:85:#f1c40f,85:100:#e74c3c'},
		{name: 'hmiNeedleColor', dispName: 'Needle Color', type: 'color', defVal: '#37474f'},
		{name: 'hmiUnit', dispName: 'Unit', type: 'string', defVal: '%'},
		{name: 'hmiShowValue', dispName: 'Show Value', type: 'bool', defVal: true},
		{name: 'hmiDecimals', dispName: 'Decimals', type: 'int', min: 0, max: 4, defVal: 0},
		{name: 'hmiQuality', dispName: 'Quality', type: 'enum', defVal: 'good',
			enumList: [{val: 'good', dispName: 'Good'}, {val: 'bad', dispName: 'Bad'}, {val: 'stale', dispName: 'Stale'}]}
	];

	// Angle 0 = 3 o'clock, increases clockwise (matches canvas convention).
	mxShapeHmiRadialGauge.prototype.pt = function(cx, cy, r, deg)
	{
		var rad = deg * HmiUtil.PI180;

		return new mxPoint(cx + r * Math.cos(rad), cy + r * Math.sin(rad));
	};

	mxShapeHmiRadialGauge.prototype.paintWidget = function(c, w, h)
	{
		var min = HmiUtil.num(this.style, 'hmiMin', '0');
		var max = HmiUtil.num(this.style, 'hmiMax', '100');
		var value = HmiUtil.clamp(HmiUtil.num(this.style, 'hmiValue', '65'), min, max);
		var startAngle = HmiUtil.num(this.style, 'hmiStartAngle', '135');
		var endAngle = HmiUtil.num(this.style, 'hmiEndAngle', '405');
		var majorTicks = Math.max(2, HmiUtil.int(this.style, 'hmiMajorTicks', '5'));
		var minorTicks = Math.max(0, HmiUtil.int(this.style, 'hmiMinorTicks', '4'));
		var bands = HmiUtil.parseBands(HmiUtil.str(this.style, 'hmiBands', '0:60:#2ecc71,60:85:#f1c40f,85:100:#e74c3c'));
		var needleColor = HmiUtil.str(this.style, 'hmiNeedleColor', '#37474f');
		var unit = HmiUtil.str(this.style, 'hmiUnit', '');
		var showValue = HmiUtil.bool(this.style, 'hmiShowValue', '1');
		var decimals = HmiUtil.int(this.style, 'hmiDecimals', '0');
		var quality = HmiUtil.str(this.style, 'hmiQuality', 'good');
		var trackColor = mxUtils.getValue(this.style, mxConstants.STYLE_STROKECOLOR, '#cfd8dc');
		var faceColor = mxUtils.getValue(this.style, mxConstants.STYLE_FILLCOLOR, 'none');
		var labelColor = mxUtils.getValue(this.style, mxConstants.STYLE_FONTCOLOR, '#37474f');

		var cx = w / 2;
		var cy = h / 2 + h * 0.06;
		var r = Math.min(w, h) * 0.44;
		var sweep = endAngle - startAngle;
		var ratio = (max > min) ? (value - min) / (max - min) : 0;
		var valueAngle = startAngle + sweep * ratio;

		if (faceColor != 'none')
		{
			c.setFillColor(faceColor);
			c.begin();
			c.ellipse(cx - r * 1.12, cy - r * 1.12, r * 2.24, r * 2.24);
			c.fill();
		}

		// Track (background arc)
		c.setShadow(false);
		c.setFillColor('none');
		c.setStrokeColor(trackColor);
		c.setStrokeWidth(Math.max(4, r * 0.16));
		var p0 = this.pt(cx, cy, r, startAngle);
		var p1 = this.pt(cx, cy, r, endAngle);
		c.begin();
		c.moveTo(p0.x, p0.y);
		c.arcTo(r, r, 0, (sweep > 180) ? 1 : 0, 1, p1.x, p1.y);
		c.stroke();

		// Colour bands, drawn just inside the track.
		var bandR = r;

		for (var i = 0; i < bands.length; i++)
		{
			var bMinRatio = HmiUtil.clamp((bands[i].min - min) / (max - min), 0, 1);
			var bMaxRatio = HmiUtil.clamp((bands[i].max - min) / (max - min), 0, 1);
			var a0 = startAngle + sweep * bMinRatio;
			var a1 = startAngle + sweep * bMaxRatio;

			if (a1 <= a0)
			{
				continue;
			}

			var b0 = this.pt(cx, cy, bandR, a0);
			var b1 = this.pt(cx, cy, bandR, a1);

			c.setStrokeColor(bands[i].color);
			c.setStrokeWidth(Math.max(4, r * 0.16));
			c.begin();
			c.moveTo(b0.x, b0.y);
			c.arcTo(bandR, bandR, 0, ((a1 - a0) > 180) ? 1 : 0, 1, b1.x, b1.y);
			c.stroke();
		}

		// Ticks and minor ticks.
		c.setStrokeColor(labelColor);
		c.setFontColor(labelColor);
		c.setFontSize(Math.max(8, r * 0.16));

		var totalMajor = majorTicks;

		for (var m = 0; m <= totalMajor; m++)
		{
			var ang = startAngle + sweep * (m / totalMajor);
			var oo = this.pt(cx, cy, r * 1.08, ang);
			var ii = this.pt(cx, cy, r * 0.86, ang);

			c.setStrokeWidth(1.5);
			c.begin();
			c.moveTo(oo.x, oo.y);
			c.lineTo(ii.x, ii.y);
			c.stroke();

			var lbl = min + (max - min) * (m / totalMajor);
			var lp = this.pt(cx, cy, r * 1.32, ang);
			c.text(lp.x, lp.y, 0, 0, HmiUtil.format(lbl, 0), mxConstants.ALIGN_CENTER, mxConstants.ALIGN_MIDDLE, 0);

			if (minorTicks > 0 && m < totalMajor)
			{
				for (var n = 1; n <= minorTicks; n++)
				{
					var mang = ang + (sweep / totalMajor) * (n / (minorTicks + 1));
					var mo = this.pt(cx, cy, r * 1.03, mang);
					var mi = this.pt(cx, cy, r * 0.92, mang);

					c.setStrokeWidth(0.75);
					c.begin();
					c.moveTo(mo.x, mo.y);
					c.lineTo(mi.x, mi.y);
					c.stroke();
				}
			}
		}

		// Needle
		var tip = this.pt(cx, cy, r * 0.78, valueAngle);
		var tailL = this.pt(cx, cy, r * 0.12, valueAngle + 90);
		var tailR = this.pt(cx, cy, r * 0.12, valueAngle - 90);

		c.setFillColor(needleColor);
		c.setStrokeColor(needleColor);
		c.setStrokeWidth(1);
		c.begin();
		c.moveTo(tip.x, tip.y);
		c.lineTo(tailL.x, tailL.y);
		c.lineTo(tailR.x, tailR.y);
		c.close();
		c.fillAndStroke();

		c.setFillColor(needleColor);
		c.begin();
		c.ellipse(cx - r * 0.09, cy - r * 0.09, r * 0.18, r * 0.18);
		c.fill();

		if (showValue)
		{
			c.setFontColor(labelColor);
			c.setFontSize(Math.max(10, r * 0.26));
			c.setFontStyle(mxConstants.FONT_BOLD);
			c.text(cx, cy + r * 0.5, 0, 0, HmiUtil.format(value, decimals) + (unit ? (' ' + unit) : ''),
				mxConstants.ALIGN_CENTER, mxConstants.ALIGN_MIDDLE, 0);
		}

		var label = HmiUtil.getLabel(this);

		if (label != null && typeof label == 'string' && label.length > 0)
		{
			c.setFontStyle(mxConstants.FONT_BOLD);
			c.setFontSize(Math.max(9, r * 0.18));
			c.text(cx, h * 0.06, 0, 0, label, mxConstants.ALIGN_CENTER, mxConstants.ALIGN_TOP, 0);
		}

		HmiUtil.paintQualityBadge(c, w, h, quality);
	};

	mxCellRenderer.registerShape(mxShapeHmiRadialGauge.prototype.cst.SHAPE, mxShapeHmiRadialGauge);

	//======================================================================
	// 3. Linear gauge / bar  (HMI-WGT-3)  -- ported from meta2d.js
	// form-diagram progress concept, redrawn with the canvas API.
	//======================================================================

	function mxShapeHmiLinearGauge()
	{
		mxShapeHmiBase.apply(this, arguments);
	};

	mxUtils.extend(mxShapeHmiLinearGauge, mxShapeHmiBase);

	mxShapeHmiLinearGauge.prototype.cst = {SHAPE: 'mxgraph.hmi.linearGauge'};

	mxShapeHmiLinearGauge.prototype.customProperties = [
		{name: 'hmiValue', dispName: 'Value', type: 'float', defVal: 65},
		{name: 'hmiMin', dispName: 'Min', type: 'float', defVal: 0},
		{name: 'hmiMax', dispName: 'Max', type: 'float', defVal: 100},
		{name: 'hmiOrientation', dispName: 'Orientation', type: 'enum', defVal: 'vertical',
			enumList: [{val: 'vertical', dispName: 'Vertical'}, {val: 'horizontal', dispName: 'Horizontal'}]},
		{name: 'hmiBands', dispName: 'Bands', type: 'string', defVal: '0:60:#2ecc71,60:85:#f1c40f,85:100:#e74c3c'},
		{name: 'hmiTicks', dispName: 'Ticks', type: 'int', min: 0, max: 20, defVal: 5},
		{name: 'hmiFillColor', dispName: 'Bar Color', type: 'color', defVal: '#2e86de'},
		{name: 'hmiUnit', dispName: 'Unit', type: 'string', defVal: '%'},
		{name: 'hmiDecimals', dispName: 'Decimals', type: 'int', min: 0, max: 4, defVal: 0},
		{name: 'hmiShowValue', dispName: 'Show Value', type: 'bool', defVal: true},
		{name: 'hmiQuality', dispName: 'Quality', type: 'enum', defVal: 'good',
			enumList: [{val: 'good', dispName: 'Good'}, {val: 'bad', dispName: 'Bad'}, {val: 'stale', dispName: 'Stale'}]}
	];

	mxShapeHmiLinearGauge.prototype.paintWidget = function(c, w, h)
	{
		var min = HmiUtil.num(this.style, 'hmiMin', '0');
		var max = HmiUtil.num(this.style, 'hmiMax', '100');
		var value = HmiUtil.clamp(HmiUtil.num(this.style, 'hmiValue', '65'), min, max);
		var vertical = HmiUtil.str(this.style, 'hmiOrientation', 'vertical') != 'horizontal';
		var bands = HmiUtil.parseBands(HmiUtil.str(this.style, 'hmiBands', ''));
		var ticks = Math.max(0, HmiUtil.int(this.style, 'hmiTicks', '5'));
		var fillColor = HmiUtil.str(this.style, 'hmiFillColor', '#2e86de');
		var unit = HmiUtil.str(this.style, 'hmiUnit', '');
		var decimals = HmiUtil.int(this.style, 'hmiDecimals', '0');
		var showValue = HmiUtil.bool(this.style, 'hmiShowValue', '1');
		var quality = HmiUtil.str(this.style, 'hmiQuality', 'good');
		var trackColor = mxUtils.getValue(this.style, mxConstants.STYLE_FILLCOLOR, '#eceff1');
		var strokeColor = mxUtils.getValue(this.style, mxConstants.STYLE_STROKECOLOR, '#90a4ae');
		var labelColor = mxUtils.getValue(this.style, mxConstants.STYLE_FONTCOLOR, '#37474f');
		var ratio = (max > min) ? (value - min) / (max - min) : 0;

		var scaleW = showValue ? (vertical ? w * 0.28 : 0) : 0;
		var scaleH = showValue ? (!vertical ? h * 0.32 : 0) : 0;
		var barX = 0, barY = 0, barW = w, barH = h;

		if (vertical)
		{
			barX = scaleW;
			barW = w - scaleW;
		}
		else
		{
			barY = 0;
			barH = h - scaleH;
		}

		// Track
		c.setFillColor(trackColor);
		c.setStrokeColor(strokeColor);
		c.setDashed(quality != 'good', false);
		c.roundrect(barX + 0.5, barY + 0.5, barW - 1, barH - 1, 3, 3);
		c.fillAndStroke();

		// Bands drawn as thin strip along the track edge.
		if (bands.length > 0)
		{
			var bw = vertical ? barW * 0.18 : barH * 0.18;

			for (var i = 0; i < bands.length; i++)
			{
				var r0 = HmiUtil.clamp((bands[i].min - min) / (max - min), 0, 1);
				var r1 = HmiUtil.clamp((bands[i].max - min) / (max - min), 0, 1);

				c.setFillColor(bands[i].color);
				c.begin();

				if (vertical)
				{
					var y1 = barY + barH * (1 - r1);
					var y0 = barY + barH * (1 - r0);
					c.rect(barX + barW - bw - 2, y1, bw, y0 - y1);
				}
				else
				{
					var x0 = barX + barW * r0;
					var x1 = barX + barW * r1;
					c.rect(x0, barY + barH - bw - 2, x1 - x0, bw);
				}

				c.fill();
			}
		}

		// Fill
		c.setFillColor(fillColor);
		c.setStrokeColor('none');
		c.begin();

		if (vertical)
		{
			var fh = barH * ratio;
			c.rect(barX + 2, barY + barH - fh, barW - 4, fh);
		}
		else
		{
			var fw = barW * ratio;
			c.rect(barX, barY + 2, fw, barH - 4);
		}

		c.fill();

		c.setStrokeColor(strokeColor);
		c.setDashed(quality != 'good', false);
		c.begin();
		c.roundrect(barX + 0.5, barY + 0.5, barW - 1, barH - 1, 3, 3);
		c.stroke();
		c.setDashed(false);

		// Ticks + scale labels
		if (ticks > 0)
		{
			c.setStrokeColor(labelColor);
			c.setFontColor(labelColor);
			c.setFontSize(Math.max(7, Math.min(barW, barH) * 0.09));

			for (var t = 0; t <= ticks; t++)
			{
				var tr = t / ticks;
				var lbl = min + (max - min) * (1 - tr);

				if (vertical)
				{
					var ty = barY + barH * tr;
					c.setStrokeWidth(1);
					c.begin();
					c.moveTo(barX - 3, ty);
					c.lineTo(barX, ty);
					c.stroke();

					if (showValue)
					{
						c.text(barX - 6, ty, 0, 0, HmiUtil.format(lbl, 0), mxConstants.ALIGN_RIGHT, mxConstants.ALIGN_MIDDLE, 0);
					}
				}
				else
				{
					var tlbl = min + (max - min) * tr;
					var tx = barX + barW * tr;
					c.setStrokeWidth(1);
					c.begin();
					c.moveTo(tx, barY + barH);
					c.lineTo(tx, barY + barH + 3);
					c.stroke();

					if (showValue)
					{
						c.text(tx, barY + barH + 6, 0, 0, HmiUtil.format(tlbl, 0), mxConstants.ALIGN_CENTER, mxConstants.ALIGN_TOP, 0);
					}
				}
			}
		}

		if (showValue)
		{
			c.setFontColor(labelColor);
			c.setFontStyle(mxConstants.FONT_BOLD);
			c.setFontSize(Math.max(9, Math.min(w, h) * 0.11));

			if (vertical)
			{
				c.text(barX + barW / 2, 10, 0, 0, HmiUtil.format(value, decimals) + (unit ? (' ' + unit) : ''),
					mxConstants.ALIGN_CENTER, mxConstants.ALIGN_MIDDLE, 0);
			}
			else
			{
				c.text(barX + barW / 2, barY + barH + scaleH - 8, 0, 0, HmiUtil.format(value, decimals) + (unit ? (' ' + unit) : ''),
					mxConstants.ALIGN_CENTER, mxConstants.ALIGN_MIDDLE, 0);
			}
		}

		HmiUtil.paintQualityBadge(c, w, h, quality);
	};

	mxCellRenderer.registerShape(mxShapeHmiLinearGauge.prototype.cst.SHAPE, mxShapeHmiLinearGauge);

	//======================================================================
	// 4. Tank / vessel  (HMI-WGT-4)
	//======================================================================

	function mxShapeHmiTank()
	{
		mxShapeHmiBase.apply(this, arguments);
	};

	mxUtils.extend(mxShapeHmiTank, mxShapeHmiBase);

	mxShapeHmiTank.prototype.cst = {SHAPE: 'mxgraph.hmi.tank'};

	mxShapeHmiTank.prototype.customProperties = [
		{name: 'hmiValue', dispName: 'Level', type: 'float', defVal: 60},
		{name: 'hmiMin', dispName: 'Min', type: 'float', defVal: 0},
		{name: 'hmiMax', dispName: 'Max', type: 'float', defVal: 100},
		{name: 'tankType', dispName: 'Tank Type', type: 'enum', defVal: 'vertical',
			enumList: [{val: 'vertical', dispName: 'Vertical Cylinder'}, {val: 'horizontal', dispName: 'Horizontal Cylinder'},
				{val: 'coneBottom', dispName: 'Cone Bottom'}, {val: 'sphere', dispName: 'Sphere'}]},
		{name: 'hmiLiquidColor', dispName: 'Liquid Color', type: 'color', defVal: '#3a8ee6'},
		{name: 'hmiShowScale', dispName: 'Show Scale', type: 'bool', defVal: true},
		{name: 'hmiShowValue', dispName: 'Show Value', type: 'bool', defVal: true},
		{name: 'hmiUnit', dispName: 'Unit', type: 'string', defVal: '%'},
		{name: 'hmiQuality', dispName: 'Quality', type: 'enum', defVal: 'good',
			enumList: [{val: 'good', dispName: 'Good'}, {val: 'bad', dispName: 'Bad'}, {val: 'stale', dispName: 'Stale'}]}
	];

	/**
	 * Clips to a shape outline path (already begun on c) and fills a
	 * horizontal liquid band up to fillY, then paints the glass highlight
	 * and outline. `outlinePath` and `fillPath` are functions(c) that
	 * emit the geometry (no fill/stroke calls).
	 */
	mxShapeHmiTank.prototype.paintWidget = function(c, w, h)
	{
		var min = HmiUtil.num(this.style, 'hmiMin', '0');
		var max = HmiUtil.num(this.style, 'hmiMax', '100');
		var value = HmiUtil.clamp(HmiUtil.num(this.style, 'hmiValue', '60'), min, max);
		var type = HmiUtil.str(this.style, 'tankType', 'vertical');
		var liquidColor = HmiUtil.str(this.style, 'hmiLiquidColor', '#3a8ee6');
		var showScale = HmiUtil.bool(this.style, 'hmiShowScale', '1');
		var showValue = HmiUtil.bool(this.style, 'hmiShowValue', '1');
		var unit = HmiUtil.str(this.style, 'hmiUnit', '%');
		var quality = HmiUtil.str(this.style, 'hmiQuality', 'good');
		var shellColor = mxUtils.getValue(this.style, mxConstants.STYLE_STROKECOLOR, '#607d8b');
		var bodyColor = mxUtils.getValue(this.style, mxConstants.STYLE_FILLCOLOR, '#eceff1');
		var labelColor = mxUtils.getValue(this.style, mxConstants.STYLE_FONTCOLOR, '#263238');
		var ratio = (max > min) ? (value - min) / (max - min) : 0;

		var scaleW = showScale ? Math.min(28, w * 0.16) : 0;
		var x0 = scaleW, ww = w - scaleW;

		c.setDashed(quality != 'good', false);

		if (type == 'horizontal')
		{
			this.paintHorizontal(c, x0, ww, h, ratio, bodyColor, shellColor, liquidColor);
		}
		else if (type == 'sphere')
		{
			this.paintSphere(c, x0, ww, h, ratio, bodyColor, shellColor, liquidColor);
		}
		else if (type == 'coneBottom')
		{
			this.paintConeBottom(c, x0, ww, h, ratio, bodyColor, shellColor, liquidColor);
		}
		else
		{
			this.paintVertical(c, x0, ww, h, ratio, bodyColor, shellColor, liquidColor);
		}

		c.setDashed(false);

		if (showScale)
		{
			c.setStrokeColor(labelColor);
			c.setFontColor(labelColor);
			c.setFontSize(Math.max(7, h * 0.055));

			var steps = 4;

			for (var i = 0; i <= steps; i++)
			{
				var ty = h * (i / steps);
				var lbl = max - (max - min) * (i / steps);
				c.setStrokeWidth(1);
				c.begin();
				c.moveTo(x0 - 4, ty);
				c.lineTo(x0, ty);
				c.stroke();
				c.text(x0 - 6, ty, 0, 0, HmiUtil.format(lbl, 0), mxConstants.ALIGN_RIGHT, mxConstants.ALIGN_MIDDLE, 0);
			}
		}

		if (showValue)
		{
			c.setFontColor(labelColor);
			c.setFontStyle(mxConstants.FONT_BOLD);
			c.setFontSize(Math.max(10, ww * 0.14));
			c.text(x0 + ww / 2, h / 2, 0, 0, HmiUtil.format(value, 0) + (unit ? (' ' + unit) : ''),
				mxConstants.ALIGN_CENTER, mxConstants.ALIGN_MIDDLE, 0);
		}

		HmiUtil.paintQualityBadge(c, w, h, quality);
	};

	// NOTE: the mxAbstractCanvas2D API has no path clipping primitive, so
	// every liquid fill below is built as an explicit closed path that
	// reuses the relevant part of the vessel's own outline (rather than
	// clipping a plain rectangle), keeping the fill exactly inside the
	// vessel at every level.

	mxShapeHmiTank.prototype.paintVertical = function(c, x0, w, h, ratio, bodyColor, shellColor, liquidColor)
	{
		var capH = Math.min(h * 0.08, w * 0.16);

		c.setFillColor(bodyColor);
		c.setStrokeColor(shellColor);
		c.begin();
		c.moveTo(x0, capH);
		c.arcTo(w / 2, capH, 0, 0, 1, x0 + w, capH);
		c.lineTo(x0 + w, h - capH);
		c.arcTo(w / 2, capH, 0, 0, 1, x0, h - capH);
		c.close();
		c.fillAndStroke();

		if (ratio > 0.001)
		{
			var liqTop = h - capH - (h - 2 * capH) * ratio;
			liqTop = Math.min(liqTop, capH);

			c.setFillColor(liquidColor);
			c.setStrokeColor('none');
			c.begin();
			c.moveTo(x0, liqTop);
			c.lineTo(x0 + w, liqTop);
			c.lineTo(x0 + w, h - capH);
			c.arcTo(w / 2, capH, 0, 0, 1, x0, h - capH);
			c.close();
			c.fill();

			// Glass highlight: a translucent vertical strip well inside
			// the straight-walled section of the body.
			c.setFillColor('#ffffff');
			c.setAlpha(0.22);
			c.begin();
			c.rect(x0 + w * 0.14, Math.max(liqTop, capH), w * 0.13, Math.max(0, h - capH - Math.max(liqTop, capH)));
			c.fill();
			c.setAlpha(1);
		}

		c.setStrokeColor(shellColor);
		c.setFillColor('none');
		c.begin();
		c.ellipse(x0, 0, w, capH * 2);
		c.stroke();
	};

	mxShapeHmiTank.prototype.paintHorizontal = function(c, x0, w, h, ratio, bodyColor, shellColor, liquidColor)
	{
		var capW = Math.min(w * 0.12, h * 0.4);

		c.setFillColor(bodyColor);
		c.setStrokeColor(shellColor);
		c.begin();
		c.moveTo(x0 + capW, 0);
		c.lineTo(x0 + w - capW, 0);
		c.arcTo(capW, h / 2, 0, 0, 1, x0 + w - capW, h);
		c.lineTo(x0 + capW, h);
		c.arcTo(capW, h / 2, 0, 0, 1, x0 + capW, 0);
		c.close();
		c.fillAndStroke();

		if (ratio > 0.001)
		{
			// Approximate the level line's intersection with the rounded
			// ends by insetting the fill rectangle near the top/bottom,
			// where the end caps taper in.
			var liqTop = h - h * ratio;
			var nearTop = liqTop < h * 0.18;
			var inset = nearTop ? capW * (1 - liqTop / (h * 0.18)) * 0.6 : 0;

			c.setFillColor(liquidColor);
			c.setStrokeColor('none');
			c.begin();
			c.rect(x0 + inset, liqTop, w - 2 * inset, h - liqTop);
			c.fill();

			c.setFillColor('#ffffff');
			c.setAlpha(0.22);
			c.begin();
			c.rect(x0 + capW, Math.max(liqTop, h * 0.08), Math.max(0, w - 2 * capW), h * 0.16);
			c.fill();
			c.setAlpha(1);
		}

		c.setStrokeColor(shellColor);
		c.setFillColor('none');
		c.begin();
		c.moveTo(x0 + capW, 0);
		c.lineTo(x0 + w - capW, 0);
		c.arcTo(capW, h / 2, 0, 0, 1, x0 + w - capW, h);
		c.lineTo(x0 + capW, h);
		c.arcTo(capW, h / 2, 0, 0, 1, x0 + capW, 0);
		c.stroke();
	};

	mxShapeHmiTank.prototype.paintSphere = function(c, x0, w, h, ratio, bodyColor, shellColor, liquidColor)
	{
		var d = Math.min(w, h) * 0.92;
		var cx = x0 + w / 2;
		var cy = h / 2;
		var r = d / 2;
		var legH = Math.min(h * 0.12, r * 0.4);

		c.setFillColor(bodyColor);
		c.setStrokeColor(shellColor);
		c.begin();
		c.ellipse(cx - r, cy - r, d, d);
		c.fillAndStroke();

		if (ratio > 0.001)
		{
			var liqTop = (cy + r) - d * ratio;
			liqTop = Math.max(cy - r, Math.min(cy + r, liqTop));
			var dx = Math.sqrt(Math.max(0, r * r - (liqTop - cy) * (liqTop - cy)));
			var left = new mxPoint(cx - dx, liqTop);
			var right = new mxPoint(cx + dx, liqTop);

			c.setFillColor(liquidColor);
			c.setStrokeColor('none');
			c.begin();
			c.moveTo(left.x, left.y);
			c.lineTo(right.x, right.y);
			// Long way around (through the bottom of the circle) back to
			// the left point, i.e. the lower "lens" of the circle.
			c.arcTo(r, r, 0, (ratio > 0.5) ? 1 : 0, 1, left.x, left.y);
			c.close();
			c.fill();
		}

		c.setStrokeColor(shellColor);
		c.setFillColor('none');
		c.begin();
		c.ellipse(cx - r, cy - r, d, d);
		c.stroke();

		c.begin();
		c.moveTo(cx - r * 0.35, cy + r - 2);
		c.lineTo(cx - r * 0.5, cy + r + legH);
		c.moveTo(cx + r * 0.35, cy + r - 2);
		c.lineTo(cx + r * 0.5, cy + r + legH);
		c.stroke();
	};

	mxShapeHmiTank.prototype.paintConeBottom = function(c, x0, w, h, ratio, bodyColor, shellColor, liquidColor)
	{
		var coneH = h * 0.28;
		var bodyH = h - coneH;

		c.setFillColor(bodyColor);
		c.setStrokeColor(shellColor);
		c.begin();
		c.moveTo(x0, 0);
		c.lineTo(x0 + w, 0);
		c.lineTo(x0 + w, bodyH);
		c.lineTo(x0 + w / 2, h);
		c.lineTo(x0, bodyH);
		c.close();
		c.fillAndStroke();

		if (ratio > 0.001)
		{
			var liqTop = h - h * ratio;

			c.setFillColor(liquidColor);
			c.setStrokeColor('none');
			c.begin();

			if (liqTop >= bodyH)
			{
				// Level surface is within the cone: a triangle down to the apex.
				var t = (h > bodyH) ? (liqTop - bodyH) / (h - bodyH) : 0;
				var leftX = x0 + t * (w / 2);
				var rightX = x0 + w - t * (w / 2);
				c.moveTo(leftX, liqTop);
				c.lineTo(rightX, liqTop);
				c.lineTo(x0 + w / 2, h);
				c.close();
			}
			else
			{
				// Level surface is within the straight-walled body: reuse
				// the lower part of the outline (body + cone) as-is.
				c.moveTo(x0, liqTop);
				c.lineTo(x0 + w, liqTop);
				c.lineTo(x0 + w, bodyH);
				c.lineTo(x0 + w / 2, h);
				c.lineTo(x0, bodyH);
				c.close();
			}

			c.fill();

			if (liqTop < bodyH)
			{
				c.setFillColor('#ffffff');
				c.setAlpha(0.22);
				c.begin();
				c.rect(x0 + w * 0.14, liqTop, w * 0.13, bodyH - liqTop);
				c.fill();
				c.setAlpha(1);
			}
		}

		c.setStrokeColor(shellColor);
		c.setFillColor('none');
		c.begin();
		c.moveTo(x0, 0);
		c.lineTo(x0 + w, 0);
		c.lineTo(x0 + w, bodyH);
		c.lineTo(x0 + w / 2, h);
		c.lineTo(x0, bodyH);
		c.close();
		c.stroke();
	};

	mxCellRenderer.registerShape(mxShapeHmiTank.prototype.cst.SHAPE, mxShapeHmiTank);

	//======================================================================
	// 5. Indicator lamp / LED  (HMI-WGT-5)  -- ported from meta2d.js
	// form-diagram switch.ts 'checked' indicator concept.
	//======================================================================

	function mxShapeHmiLamp()
	{
		mxShapeHmiBase.apply(this, arguments);
	};

	mxUtils.extend(mxShapeHmiLamp, mxShapeHmiBase);

	mxShapeHmiLamp.prototype.cst = {SHAPE: 'mxgraph.hmi.lamp'};

	mxShapeHmiLamp.prototype.customProperties = [
		{name: 'hmiValue', dispName: 'State', type: 'string', defVal: '1'},
		{name: 'hmiOnColor', dispName: 'On Color', type: 'color', defVal: '#2ecc71'},
		{name: 'hmiOffColor', dispName: 'Off Color', type: 'color', defVal: '#546e7a'},
		{name: 'hmiFaultColor', dispName: 'Fault Color', type: 'color', defVal: '#e74c3c'},
		{name: 'hmiStates', dispName: 'State Map', type: 'string', defVal: ''},
		{name: 'hmiShape', dispName: 'Shape', type: 'enum', defVal: 'round',
			enumList: [{val: 'round', dispName: 'Round'}, {val: 'square', dispName: 'Square'}]},
		{name: 'hmiQuality', dispName: 'Quality', type: 'enum', defVal: 'good',
			enumList: [{val: 'good', dispName: 'Good'}, {val: 'bad', dispName: 'Bad'}, {val: 'stale', dispName: 'Stale'}]}
	];

	mxShapeHmiLamp.prototype.paintWidget = function(c, w, h)
	{
		var value = HmiUtil.str(this.style, 'hmiValue', '1');
		var onColor = HmiUtil.str(this.style, 'hmiOnColor', '#2ecc71');
		var offColor = HmiUtil.str(this.style, 'hmiOffColor', '#546e7a');
		var faultColor = HmiUtil.str(this.style, 'hmiFaultColor', '#e74c3c');
		var statesStr = HmiUtil.str(this.style, 'hmiStates', '');
		var shapeType = HmiUtil.str(this.style, 'hmiShape', 'round');
		var quality = HmiUtil.str(this.style, 'hmiQuality', 'good');

		var color;
		var on;

		if (statesStr.length > 0)
		{
			var m = HmiUtil.parseMap(statesStr);
			color = m.map[value];
			on = (color != null && value != '0');

			if (color == null)
			{
				color = offColor;
			}
		}
		else
		{
			var lower = String(value).toLowerCase();

			if (lower == 'fault' || lower == 'error' || lower == '2')
			{
				color = faultColor;
				on = true;
			}
			else if (lower == '1' || lower == 'true' || lower == 'on')
			{
				color = onColor;
				on = true;
			}
			else
			{
				color = offColor;
				on = false;
			}
		}

		var cx = w / 2, cy = h / 2;
		var r = Math.min(w, h) / 2 - 3;

		c.save();

		if (on)
		{
			// Soft glow behind the lamp
			c.setShadow(false);
			c.setAlpha(0.35);
			c.setFillColor(color);
			c.begin();

			if (shapeType == 'square')
			{
				c.roundrect(cx - r * 1.35, cy - r * 1.35, r * 2.7, r * 2.7, r * 0.3, r * 0.3);
			}
			else
			{
				c.ellipse(cx - r * 1.35, cy - r * 1.35, r * 2.7, r * 2.7);
			}

			c.fill();
			c.setAlpha(1);
		}

		c.restore();

		c.setFillColor(color);
		c.setStrokeColor('#263238');
		c.setStrokeWidth(1.5);
		c.setDashed(quality != 'good', false);
		c.begin();

		if (shapeType == 'square')
		{
			c.roundrect(cx - r, cy - r, r * 2, r * 2, r * 0.25, r * 0.25);
		}
		else
		{
			c.ellipse(cx - r, cy - r, r * 2, r * 2);
		}

		c.fillAndStroke();
		c.setDashed(false);

		// Bevel highlight
		c.setFillColor('#ffffff');
		c.setAlpha(0.3);
		c.begin();
		c.ellipse(cx - r * 0.55, cy - r * 0.6, r * 0.9, r * 0.6);
		c.fill();

		var label = HmiUtil.getLabel(this);

		if (label != null && typeof label == 'string' && label.length > 0)
		{
			c.setFontColor(mxUtils.getValue(this.style, mxConstants.STYLE_FONTCOLOR, '#37474f'));
			c.setFontSize(Math.max(8, Math.min(w, h) * 0.16));
			c.text(cx, h + 2, 0, 0, label, mxConstants.ALIGN_CENTER, mxConstants.ALIGN_TOP, 0);
		}

		HmiUtil.paintQualityBadge(c, w, h, quality);
	};

	mxCellRenderer.registerShape(mxShapeHmiLamp.prototype.cst.SHAPE, mxShapeHmiLamp);

	//======================================================================
	// 6. Toggle switch  (HMI-WGT-6)  -- ported from meta2d.js
	// form-diagram switch.ts (MIT licensed) redrawn with the canvas API.
	//======================================================================

	function mxShapeHmiSwitch()
	{
		mxShapeHmiBase.apply(this, arguments);
	};

	mxUtils.extend(mxShapeHmiSwitch, mxShapeHmiBase);

	mxShapeHmiSwitch.prototype.cst = {SHAPE: 'mxgraph.hmi.switch'};

	mxShapeHmiSwitch.prototype.customProperties = [
		{name: 'hmiValue', dispName: 'Checked', type: 'bool', defVal: true},
		{name: 'hmiOnColor', dispName: 'On Color', type: 'color', defVal: '#2ecc71'},
		{name: 'hmiOffColor', dispName: 'Off Color', type: 'color', defVal: '#b0bec5'},
		{name: 'hmiDisabled', dispName: 'Disabled', type: 'bool', defVal: false},
		{name: 'hmiOnLabel', dispName: 'On Label', type: 'string', defVal: 'ON'},
		{name: 'hmiOffLabel', dispName: 'Off Label', type: 'string', defVal: 'OFF'}
	];

	mxShapeHmiSwitch.prototype.paintWidget = function(c, w, h)
	{
		var checked = HmiUtil.bool(this.style, 'hmiValue', '1');
		var onColor = HmiUtil.str(this.style, 'hmiOnColor', '#2ecc71');
		var offColor = HmiUtil.str(this.style, 'hmiOffColor', '#b0bec5');
		var disabled = HmiUtil.bool(this.style, 'hmiDisabled', '0');
		var onLabel = HmiUtil.str(this.style, 'hmiOnLabel', 'ON');
		var offLabel = HmiUtil.str(this.style, 'hmiOffLabel', 'OFF');

		var trackH = h * 0.62;
		var trackY = (h - trackH) / 2;
		var trackColor = checked ? onColor : offColor;

		c.save();

		if (disabled)
		{
			c.setAlpha(0.45);
		}

		c.setFillColor(trackColor);
		c.setStrokeColor('#37474f');
		c.setStrokeWidth(1);
		c.begin();
		c.roundrect(0.5, trackY, w - 1, trackH, trackH / 2, trackH / 2);
		c.fillAndStroke();

		if (checked)
		{
			c.setFontColor('#ffffff');
			c.setFontSize(Math.max(7, trackH * 0.34));
			c.setFontStyle(mxConstants.FONT_BOLD);
			c.text(w * 0.32, h / 2, 0, 0, onLabel, mxConstants.ALIGN_CENTER, mxConstants.ALIGN_MIDDLE, 0);
		}
		else
		{
			c.setFontColor('#455a64');
			c.setFontSize(Math.max(7, trackH * 0.34));
			c.setFontStyle(mxConstants.FONT_BOLD);
			c.text(w * 0.68, h / 2, 0, 0, offLabel, mxConstants.ALIGN_CENTER, mxConstants.ALIGN_MIDDLE, 0);
		}

		var knobR = trackH * 0.42;
		var knobX = checked ? (w - trackH / 2) : (trackH / 2);

		c.setFillColor('#ffffff');
		c.setStrokeColor('#37474f');
		c.setStrokeWidth(1);
		c.begin();
		c.ellipse(knobX - knobR, h / 2 - knobR, knobR * 2, knobR * 2);
		c.fillAndStroke();

		c.restore();
	};

	mxCellRenderer.registerShape(mxShapeHmiSwitch.prototype.cst.SHAPE, mxShapeHmiSwitch);

	//======================================================================
	// 7. Push button  (HMI-WGT-7)
	//======================================================================

	function mxShapeHmiButton()
	{
		mxShapeHmiBase.apply(this, arguments);
	};

	mxUtils.extend(mxShapeHmiButton, mxShapeHmiBase);

	mxShapeHmiButton.prototype.cst = {SHAPE: 'mxgraph.hmi.button'};

	mxShapeHmiButton.prototype.customProperties = [
		{name: 'hmiMode', dispName: 'Mode', type: 'enum', defVal: 'momentary',
			enumList: [{val: 'momentary', dispName: 'Momentary'}, {val: 'latched', dispName: 'Latched'}]},
		{name: 'hmiValue', dispName: 'Active (latched)', type: 'bool', defVal: false},
		{name: 'hmiPressed', dispName: 'Pressed (preview)', type: 'bool', defVal: false},
		{name: 'hmiOnColor', dispName: 'Active/On Color', type: 'color', defVal: '#2ecc71'},
		{name: 'hmiOffColor', dispName: 'Idle/Off Color', type: 'color', defVal: '#3f8ae0'},
		{name: 'hmiDisabled', dispName: 'Disabled', type: 'bool', defVal: false}
	];

	mxShapeHmiButton.prototype.paintWidget = function(c, w, h)
	{
		var mode = HmiUtil.str(this.style, 'hmiMode', 'momentary');
		var active = HmiUtil.bool(this.style, 'hmiValue', '0');
		var pressed = HmiUtil.bool(this.style, 'hmiPressed', '0');
		var onColor = HmiUtil.str(this.style, 'hmiOnColor', '#2ecc71');
		var offColor = HmiUtil.str(this.style, 'hmiOffColor', '#3f8ae0');
		var disabled = HmiUtil.bool(this.style, 'hmiDisabled', '0');

		var isActive = (mode == 'latched') ? active : pressed;
		var base = isActive ? onColor : offColor;
		var r = Math.min(6, Math.min(w, h) * 0.18);

		c.save();

		if (disabled)
		{
			c.setAlpha(0.5);
		}

		var offY = (pressed || isActive) ? Math.min(2, h * 0.06) : 0;

		// Drop shadow / 3D base
		c.setFillColor('#00000030');
		c.begin();
		c.roundrect(1, 1 + Math.min(3, h * 0.08), w - 2, h - 2, r, r);
		c.fill();

		var grad = (this.state != null) ? null : null;

		c.setGradient(this.lighten(base, 18), this.lighten(base, -12), 0, 0, w, h - offY, mxConstants.DIRECTION_SOUTH, 1, 1);
		c.setStrokeColor(this.lighten(base, -30));
		c.setStrokeWidth(1);
		c.begin();
		c.roundrect(1, offY, w - 2, h - 2 - offY, r, r);
		c.fillAndStroke();

		c.setFillColor('#ffffff');
		c.setAlpha(0.25);
		c.begin();
		c.roundrect(w * 0.1, offY + 2, w * 0.8, h * 0.28, r * 0.6, r * 0.6);
		c.fill();

		var label = HmiUtil.getLabel(this);

		if (label == null || typeof label != 'string' || label.length == 0)
		{
			label = (mode == 'latched') ? (active ? 'ON' : 'OFF') : 'PUSH';
		}

		c.setFontColor('#ffffff');
		c.setFontStyle(mxConstants.FONT_BOLD);
		c.setFontSize(Math.max(9, Math.min(w, h) * 0.2));
		c.text(w / 2, (h - offY) / 2 + offY / 2, 0, 0, label, mxConstants.ALIGN_CENTER, mxConstants.ALIGN_MIDDLE, 0);

		c.restore();
	};

	mxShapeHmiButton.prototype.lighten = function(hex, pct)
	{
		try
		{
			var rgb = this.hexToRgb(hex);

			if (rgb == null)
			{
				return hex;
			}

			var f = pct / 100;

			var adj = function(v)
			{
				var nv = (f >= 0) ? v + (255 - v) * f : v * (1 + f);

				return Math.max(0, Math.min(255, Math.round(nv)));
			};

			return this.rgbToHex(adj(rgb.r), adj(rgb.g), adj(rgb.b));
		}
		catch (e)
		{
			return hex;
		}
	};

	mxShapeHmiButton.prototype.hexToRgb = function(hex)
	{
		if (hex == null || hex.charAt(0) != '#')
		{
			return null;
		}

		var h = hex.substring(1);

		if (h.length == 3)
		{
			h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
		}

		if (h.length != 6)
		{
			return null;
		}

		return {r: parseInt(h.substring(0, 2), 16), g: parseInt(h.substring(2, 4), 16), b: parseInt(h.substring(4, 6), 16)};
	};

	mxShapeHmiButton.prototype.rgbToHex = function(r, g, b)
	{
		var h = function(v)
		{
			var s = v.toString(16);

			return (s.length == 1) ? ('0' + s) : s;
		};

		return '#' + h(r) + h(g) + h(b);
	};

	mxCellRenderer.registerShape(mxShapeHmiButton.prototype.cst.SHAPE, mxShapeHmiButton);

	//======================================================================
	// 8. Slider / set-point  (HMI-WGT-8)  -- ported from meta2d.js
	// form-diagram slider.ts (MIT licensed) redrawn with the canvas API.
	//======================================================================

	function mxShapeHmiSlider()
	{
		mxShapeHmiBase.apply(this, arguments);
	};

	mxUtils.extend(mxShapeHmiSlider, mxShapeHmiBase);

	mxShapeHmiSlider.prototype.cst = {SHAPE: 'mxgraph.hmi.slider'};

	mxShapeHmiSlider.prototype.customProperties = [
		{name: 'hmiValue', dispName: 'Value', type: 'float', defVal: 50},
		{name: 'hmiMin', dispName: 'Min', type: 'float', defVal: 0},
		{name: 'hmiMax', dispName: 'Max', type: 'float', defVal: 100},
		{name: 'hmiStep', dispName: 'Step', type: 'float', defVal: 1},
		{name: 'hmiUnit', dispName: 'Unit', type: 'string', defVal: ''},
		{name: 'hmiOrientation', dispName: 'Orientation', type: 'enum', defVal: 'horizontal',
			enumList: [{val: 'horizontal', dispName: 'Horizontal'}, {val: 'vertical', dispName: 'Vertical'}]},
		{name: 'hmiTrackColor', dispName: 'Track Color', type: 'color', defVal: '#cfd8dc'},
		{name: 'hmiThumbColor', dispName: 'Thumb Color', type: 'color', defVal: '#1976d2'},
		{name: 'hmiShowValue', dispName: 'Show Value', type: 'bool', defVal: true}
	];

	mxShapeHmiSlider.prototype.paintWidget = function(c, w, h)
	{
		var min = HmiUtil.num(this.style, 'hmiMin', '0');
		var max = HmiUtil.num(this.style, 'hmiMax', '100');
		var value = HmiUtil.clamp(HmiUtil.num(this.style, 'hmiValue', '50'), min, max);
		var unit = HmiUtil.str(this.style, 'hmiUnit', '');
		var vertical = HmiUtil.str(this.style, 'hmiOrientation', 'horizontal') == 'vertical';
		var trackColor = HmiUtil.str(this.style, 'hmiTrackColor', '#cfd8dc');
		var thumbColor = HmiUtil.str(this.style, 'hmiThumbColor', '#1976d2');
		var showValue = HmiUtil.bool(this.style, 'hmiShowValue', '1');
		var ratio = (max > min) ? (value - min) / (max - min) : 0;

		var pad = Math.min(w, h) * 0.22;
		var thumbR = Math.min(w, h) * 0.28;

		if (vertical)
		{
			var x = w / 2;
			var y0 = pad, y1 = h - pad;

			c.setStrokeColor(trackColor);
			c.setStrokeWidth(Math.max(4, w * 0.16));
			c.begin();
			c.moveTo(x, y0);
			c.lineTo(x, y1);
			c.stroke();

			var fy = y1 - (y1 - y0) * ratio;
			c.setStrokeColor(thumbColor);
			c.begin();
			c.moveTo(x, y1);
			c.lineTo(x, fy);
			c.stroke();

			c.setFillColor('#ffffff');
			c.setStrokeColor(thumbColor);
			c.setStrokeWidth(2);
			c.begin();
			c.ellipse(x - thumbR, fy - thumbR, thumbR * 2, thumbR * 2);
			c.fillAndStroke();

			if (showValue)
			{
				c.setFontColor(mxUtils.getValue(this.style, mxConstants.STYLE_FONTCOLOR, '#37474f'));
				c.setFontSize(Math.max(8, w * 0.28));
				c.setFontStyle(mxConstants.FONT_BOLD);
				c.text(x, y0 - 8, 0, 0, HmiUtil.format(value, 0) + (unit ? (' ' + unit) : ''), mxConstants.ALIGN_CENTER, mxConstants.ALIGN_BOTTOM, 0);
			}
		}
		else
		{
			var y = h / 2;
			var x0 = pad, x1 = w - pad;

			c.setStrokeColor(trackColor);
			c.setStrokeWidth(Math.max(4, h * 0.16));
			c.begin();
			c.moveTo(x0, y);
			c.lineTo(x1, y);
			c.stroke();

			var fx = x0 + (x1 - x0) * ratio;
			c.setStrokeColor(thumbColor);
			c.begin();
			c.moveTo(x0, y);
			c.lineTo(fx, y);
			c.stroke();

			c.setFillColor('#ffffff');
			c.setStrokeColor(thumbColor);
			c.setStrokeWidth(2);
			c.begin();
			c.ellipse(fx - thumbR, y - thumbR, thumbR * 2, thumbR * 2);
			c.fillAndStroke();

			if (showValue)
			{
				c.setFontColor(mxUtils.getValue(this.style, mxConstants.STYLE_FONTCOLOR, '#37474f'));
				c.setFontSize(Math.max(8, h * 0.28));
				c.setFontStyle(mxConstants.FONT_BOLD);
				c.text(fx, y - thumbR - 4, 0, 0, HmiUtil.format(value, 0) + (unit ? (' ' + unit) : ''), mxConstants.ALIGN_CENTER, mxConstants.ALIGN_BOTTOM, 0);
			}
		}
	};

	mxCellRenderer.registerShape(mxShapeHmiSlider.prototype.cst.SHAPE, mxShapeHmiSlider);

	//======================================================================
	// 9. Numeric / text input  (HMI-WGT-9)
	// The runtime overlays a real <input> for keyboard entry; this shape
	// only paints the design-time / non-interactive look.
	//======================================================================

	function mxShapeHmiNumInput()
	{
		mxShapeHmiBase.apply(this, arguments);
	};

	mxUtils.extend(mxShapeHmiNumInput, mxShapeHmiBase);

	mxShapeHmiNumInput.prototype.cst = {SHAPE: 'mxgraph.hmi.numInput'};

	mxShapeHmiNumInput.prototype.customProperties = [
		{name: 'hmiValue', dispName: 'Value', type: 'float', defVal: 0},
		{name: 'hmiUnit', dispName: 'Unit', type: 'string', defVal: ''},
		{name: 'hmiEditable', dispName: 'Editable', type: 'bool', defVal: true},
		{name: 'hmiDecimals', dispName: 'Decimals', type: 'int', min: 0, max: 6, defVal: 1}
	];

	mxShapeHmiNumInput.prototype.paintWidget = function(c, w, h)
	{
		var value = HmiUtil.num(this.style, 'hmiValue', '0');
		var unit = HmiUtil.str(this.style, 'hmiUnit', '');
		var editable = HmiUtil.bool(this.style, 'hmiEditable', '1');
		var decimals = HmiUtil.int(this.style, 'hmiDecimals', '1');
		var fill = mxUtils.getValue(this.style, mxConstants.STYLE_FILLCOLOR, '#ffffff');
		var stroke = mxUtils.getValue(this.style, mxConstants.STYLE_STROKECOLOR, editable ? '#1976d2' : '#b0bec5');
		var fontColor = mxUtils.getValue(this.style, mxConstants.STYLE_FONTCOLOR, '#263238');

		c.setFillColor(editable ? fill : '#f5f5f5');
		c.setStrokeColor(stroke);
		c.setStrokeWidth(1.5);
		c.begin();
		c.roundrect(0.5, 0.5, w - 1, h - 1, 3, 3);
		c.fillAndStroke();

		c.setFontColor(fontColor);
		c.setFontSize(Math.max(9, h * 0.45));
		c.text(8, h / 2, 0, 0, HmiUtil.format(value, decimals) + (unit ? (' ' + unit) : ''), mxConstants.ALIGN_LEFT, mxConstants.ALIGN_MIDDLE, 0);

		// Blinking caret hint / edit affordance drawn as a static pencil dash.
		if (editable)
		{
			c.setStrokeColor(stroke);
			c.setStrokeWidth(1.5);
			c.begin();
			c.moveTo(w - 14, h * 0.3);
			c.lineTo(w - 14, h * 0.7);
			c.stroke();
		}
	};

	mxCellRenderer.registerShape(mxShapeHmiNumInput.prototype.cst.SHAPE, mxShapeHmiNumInput);

	//======================================================================
	// 10. Dropdown / multi-state selector  (HMI-WGT-10)
	//======================================================================

	function mxShapeHmiDropdown()
	{
		mxShapeHmiBase.apply(this, arguments);
	};

	mxUtils.extend(mxShapeHmiDropdown, mxShapeHmiBase);

	mxShapeHmiDropdown.prototype.cst = {SHAPE: 'mxgraph.hmi.dropdown'};

	mxShapeHmiDropdown.prototype.customProperties = [
		{name: 'hmiValue', dispName: 'Value', type: 'string', defVal: '1'},
		{name: 'hmiOptions', dispName: 'Options', type: 'string', defVal: '0:Off,1:Auto,2:Manual'}
	];

	mxShapeHmiDropdown.prototype.paintWidget = function(c, w, h)
	{
		var value = HmiUtil.str(this.style, 'hmiValue', '1');
		var optStr = HmiUtil.str(this.style, 'hmiOptions', '0:Off,1:Auto,2:Manual');
		var opts = HmiUtil.parseMap(optStr);
		var fill = mxUtils.getValue(this.style, mxConstants.STYLE_FILLCOLOR, '#ffffff');
		var stroke = mxUtils.getValue(this.style, mxConstants.STYLE_STROKECOLOR, '#90a4ae');
		var fontColor = mxUtils.getValue(this.style, mxConstants.STYLE_FONTCOLOR, '#263238');

		c.setFillColor(fill);
		c.setStrokeColor(stroke);
		c.setStrokeWidth(1);
		c.begin();
		c.roundrect(0.5, 0.5, w - 1, h - 1, 3, 3);
		c.fillAndStroke();

		var label = opts.map[value];

		if (label == null)
		{
			label = value;
		}

		c.setFontColor(fontColor);
		c.setFontSize(Math.max(9, h * 0.42));
		c.text(8, h / 2, 0, 0, label, mxConstants.ALIGN_LEFT, mxConstants.ALIGN_MIDDLE, 0);

		// Drop-down arrow
		var ax = w - 14, ay = h / 2;
		c.setFillColor(fontColor);
		c.begin();
		c.moveTo(ax - 4, ay - 2);
		c.lineTo(ax + 4, ay - 2);
		c.lineTo(ax, ay + 3);
		c.close();
		c.fill();

		c.setStrokeColor(stroke);
		c.begin();
		c.moveTo(w - 24, 4);
		c.lineTo(w - 24, h - 4);
		c.stroke();
	};

	mxCellRenderer.registerShape(mxShapeHmiDropdown.prototype.cst.SHAPE, mxShapeHmiDropdown);

	//======================================================================
	// 17. Clock / date-time display  (HMI-WGT-17)  -- ported from
	// meta2d.js form-diagram time.ts (MIT licensed).
	//======================================================================

	function mxShapeHmiClock()
	{
		mxShapeHmiBase.apply(this, arguments);
	};

	mxUtils.extend(mxShapeHmiClock, mxShapeHmiBase);

	mxShapeHmiClock.prototype.cst = {SHAPE: 'mxgraph.hmi.clock'};

	mxShapeHmiClock.prototype.customProperties = [
		{name: 'hmiValue', dispName: 'Value (timestamp, optional)', type: 'string', defVal: ''},
		{name: 'hmiFormat', dispName: 'Format', type: 'string', defVal: 'HH:mm:ss'},
		{name: 'hmiAnalog', dispName: 'Analog Face', type: 'bool', defVal: false}
	];

	mxShapeHmiClock.prototype.pad2 = function(n)
	{
		return (n < 10 ? '0' : '') + n;
	};

	mxShapeHmiClock.prototype.formatDate = function(d, fmt)
	{
		var map = {
			'HH': this.pad2(d.getHours()),
			'mm': this.pad2(d.getMinutes()),
			'ss': this.pad2(d.getSeconds()),
			'YYYY': d.getFullYear(),
			'MM': this.pad2(d.getMonth() + 1),
			'DD': this.pad2(d.getDate())
		};

		var out = fmt;

		for (var key in map)
		{
			out = out.split(key).join(map[key]);
		}

		return out;
	};

	mxShapeHmiClock.prototype.paintWidget = function(c, w, h)
	{
		var rawValue = HmiUtil.str(this.style, 'hmiValue', '');
		var fmt = HmiUtil.str(this.style, 'hmiFormat', 'HH:mm:ss');
		var analog = HmiUtil.bool(this.style, 'hmiAnalog', '0');
		var fill = mxUtils.getValue(this.style, mxConstants.STYLE_FILLCOLOR, 'none');
		var stroke = mxUtils.getValue(this.style, mxConstants.STYLE_STROKECOLOR, '#37474f');
		var fontColor = mxUtils.getValue(this.style, mxConstants.STYLE_FONTCOLOR, '#263238');

		var d;

		if (rawValue.length == 0)
		{
			d = new Date();
		}
		else
		{
			var n = parseFloat(rawValue);
			d = (!isNaN(n) && String(n) == rawValue) ? new Date(n) : new Date(rawValue);

			if (isNaN(d.getTime()))
			{
				d = new Date();
			}
		}

		if (fill != 'none')
		{
			c.setFillColor(fill);
			c.setStrokeColor(stroke);
			c.begin();
			c.roundrect(0.5, 0.5, w - 1, h - 1, 4, 4);
			c.fillAndStroke();
		}

		if (analog)
		{
			var cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 4;

			c.setStrokeColor(stroke);
			c.setStrokeWidth(1.5);
			c.begin();
			c.ellipse(cx - r, cy - r, r * 2, r * 2);
			c.stroke();

			for (var i = 0; i < 12; i++)
			{
				var ang = i * 30 * HmiUtil.PI180 - Math.PI / 2;
				var o = new mxPoint(cx + r * 0.92 * Math.cos(ang), cy + r * 0.92 * Math.sin(ang));
				var ii = new mxPoint(cx + r * (i % 3 == 0 ? 0.78 : 0.85) * Math.cos(ang), cy + r * (i % 3 == 0 ? 0.78 : 0.85) * Math.sin(ang));
				c.setStrokeWidth(i % 3 == 0 ? 2 : 1);
				c.begin();
				c.moveTo(o.x, o.y);
				c.lineTo(ii.x, ii.y);
				c.stroke();
			}

			var hourAng = ((d.getHours() % 12) + d.getMinutes() / 60) * 30 * HmiUtil.PI180 - Math.PI / 2;
			var minAng = (d.getMinutes() + d.getSeconds() / 60) * 6 * HmiUtil.PI180 - Math.PI / 2;
			var secAng = d.getSeconds() * 6 * HmiUtil.PI180 - Math.PI / 2;

			c.setStrokeColor(fontColor);
			c.setStrokeWidth(3);
			c.begin();
			c.moveTo(cx, cy);
			c.lineTo(cx + r * 0.5 * Math.cos(hourAng), cy + r * 0.5 * Math.sin(hourAng));
			c.stroke();

			c.setStrokeWidth(2);
			c.begin();
			c.moveTo(cx, cy);
			c.lineTo(cx + r * 0.75 * Math.cos(minAng), cy + r * 0.75 * Math.sin(minAng));
			c.stroke();

			c.setStrokeColor('#e74c3c');
			c.setStrokeWidth(1);
			c.begin();
			c.moveTo(cx, cy);
			c.lineTo(cx + r * 0.8 * Math.cos(secAng), cy + r * 0.8 * Math.sin(secAng));
			c.stroke();

			c.setFillColor(fontColor);
			c.begin();
			c.ellipse(cx - 2, cy - 2, 4, 4);
			c.fill();
		}
		else
		{
			c.setFontColor(fontColor);
			c.setFontSize(Math.max(10, h * 0.5));
			c.setFontFamily('Consolas, "Courier New", monospace');
			c.text(w / 2, h / 2, 0, 0, this.formatDate(d, fmt), mxConstants.ALIGN_CENTER, mxConstants.ALIGN_MIDDLE, 0);
		}
	};

	mxCellRenderer.registerShape(mxShapeHmiClock.prototype.cst.SHAPE, mxShapeHmiClock);

	//======================================================================
	// 18. Connection status indicator  (HMI-WGT-18)
	//======================================================================

	function mxShapeHmiStatusIndicator()
	{
		mxShapeHmiBase.apply(this, arguments);
	};

	mxUtils.extend(mxShapeHmiStatusIndicator, mxShapeHmiBase);

	mxShapeHmiStatusIndicator.prototype.cst = {SHAPE: 'mxgraph.hmi.statusIndicator'};

	mxShapeHmiStatusIndicator.prototype.customProperties = [
		{name: 'hmiValue', dispName: 'Status', type: 'enum', defVal: 'connected',
			enumList: [{val: 'connected', dispName: 'Connected'}, {val: 'connecting', dispName: 'Connecting'},
				{val: 'error', dispName: 'Error'}, {val: 'disconnected', dispName: 'Disconnected'}]}
	];

	mxShapeHmiStatusIndicator.prototype.map = {
		connected: {color: '#2ecc71', text: 'Connected'},
		connecting: {color: '#f1c40f', text: 'Connecting...'},
		error: {color: '#e74c3c', text: 'Error'},
		disconnected: {color: '#90a4ae', text: 'Disconnected'}
	};

	mxShapeHmiStatusIndicator.prototype.paintWidget = function(c, w, h)
	{
		var value = HmiUtil.str(this.style, 'hmiValue', 'connected');
		var entry = this.map[value] || this.map.disconnected;
		var fontColor = mxUtils.getValue(this.style, mxConstants.STYLE_FONTCOLOR, '#263238');

		var r = Math.min(h * 0.32, 8);
		var cy = h / 2;

		c.setFillColor(entry.color);
		c.setStrokeColor('#ffffff');
		c.setStrokeWidth(1);
		c.begin();
		c.ellipse(r * 0.4, cy - r, r * 2, r * 2);
		c.fillAndStroke();

		if (value == 'connecting')
		{
			c.setStrokeColor(entry.color);
			c.setAlpha(0.5);
			c.setStrokeWidth(1.5);
			c.begin();
			c.ellipse(r * 0.4 - 2, cy - r - 2, r * 2 + 4, r * 2 + 4);
			c.stroke();
			c.setAlpha(1);
		}

		c.setFontColor(fontColor);
		c.setFontSize(Math.max(9, h * 0.4));
		c.text(r * 2 + 10, cy, 0, 0, entry.text, mxConstants.ALIGN_LEFT, mxConstants.ALIGN_MIDDLE, 0);
	};

	mxCellRenderer.registerShape(mxShapeHmiStatusIndicator.prototype.cst.SHAPE, mxShapeHmiStatusIndicator);

	//======================================================================
	// 14. Alarm banner  (HMI-WGT-14)  -- text-only rendering; blinking is
	// handled by the runtime overlay via style updates, not here.
	//======================================================================

	function mxShapeHmiAlarmBanner()
	{
		mxShapeHmiBase.apply(this, arguments);
	};

	mxUtils.extend(mxShapeHmiAlarmBanner, mxShapeHmiBase);

	mxShapeHmiAlarmBanner.prototype.cst = {SHAPE: 'mxgraph.hmi.alarmBanner'};

	mxShapeHmiAlarmBanner.prototype.customProperties = [
		{name: 'hmiValue', dispName: 'Value (JSON array or text)', type: 'string',
			defVal: '[{"severity":"critical","message":"Tank T-101 high level","state":"active-unack"},{"severity":"warning","message":"Pump P-3 running long","state":"active-ack"}]'}
	];

	mxShapeHmiAlarmBanner.prototype.sevColors = {
		critical: '#c62828', high: '#c62828', hihi: '#c62828', lolo: '#c62828',
		warning: '#ef6c00', hi: '#ef6c00', lo: '#ef6c00', medium: '#ef6c00',
		info: '#1565c0', low: '#1565c0'
	};

	mxShapeHmiAlarmBanner.prototype.parseAlarms = function(raw)
	{
		if (raw == null || raw.length == 0)
		{
			return [];
		}

		var trimmed = mxUtils.trim(raw);

		if (trimmed.charAt(0) == '[')
		{
			try
			{
				var arr = JSON.parse(trimmed);

				if (Object.prototype.toString.call(arr) == '[object Array]')
				{
					return arr;
				}
			}
			catch (e)
			{
				// fall through to plain text
			}
		}

		return [{severity: 'info', message: raw, state: 'active-unack'}];
	};

	mxShapeHmiAlarmBanner.prototype.defaultValue = '[{"severity":"critical","message":"Tank T-101 high level","state":"active-unack"},' +
		'{"severity":"warning","message":"Pump P-3 running long","state":"active-ack"}]';

	mxShapeHmiAlarmBanner.prototype.paintWidget = function(c, w, h)
	{
		var raw = HmiUtil.str(this.style, 'hmiValue', this.defaultValue);
		var alarms = this.parseAlarms(raw);
		var fill = mxUtils.getValue(this.style, mxConstants.STYLE_FILLCOLOR, '#263238');

		c.setFillColor(fill);
		c.begin();
		c.rect(0, 0, w, h);
		c.fill();

		if (alarms.length == 0)
		{
			c.setFontColor('#90a4ae');
			c.setFontSize(Math.max(9, h * 0.4));
			c.text(10, h / 2, 0, 0, 'No active alarms', mxConstants.ALIGN_LEFT, mxConstants.ALIGN_MIDDLE, 0);

			return;
		}

		var rowH = h / alarms.length;

		for (var i = 0; i < alarms.length; i++)
		{
			var a = alarms[i] || {};
			// Numeric runtime severities (1 = highest) map to names
			var sevNames = {1: 'critical', 2: 'warning', 3: 'medium', 4: 'info'};
			var sev = (typeof a.severity === 'number') ? (sevNames[a.severity] || 'info') :
				String(a.severity || 'info').toLowerCase();
			var color = this.sevColors[sev] || '#1565c0';
			var y = i * rowH;
			var acked = (a.state == 'active-ack' || a.state == 'cleared-unack');

			c.setFillColor(color);
			c.begin();
			c.rect(0, y, Math.max(4, w * 0.012), rowH);
			c.fill();

			c.setFontColor('#ffffff');
			c.setFontStyle(acked ? 0 : mxConstants.FONT_BOLD);
			c.setFontSize(Math.max(9, Math.min(rowH * 0.55, h * 0.28)));
			var text = (a.severity ? ('[' + sev.toUpperCase() + '] ') : '') + (a.message || '');
			c.text(12, y + rowH / 2, w - 24, rowH, text, mxConstants.ALIGN_LEFT, mxConstants.ALIGN_MIDDLE, 0);

			if (acked)
			{
				c.setFontColor('#90a4ae');
				c.setFontSize(Math.max(7, rowH * 0.35));
				c.text(w - 8, y + rowH / 2, 0, 0, 'ACK', mxConstants.ALIGN_RIGHT, mxConstants.ALIGN_MIDDLE, 0);
			}
		}
	};

	mxCellRenderer.registerShape(mxShapeHmiAlarmBanner.prototype.cst.SHAPE, mxShapeHmiAlarmBanner);

	// Expose helpers for the sibling HMI shape files (charts, equipment).
	var Hmi = (typeof globalThis !== 'undefined' ? globalThis : window).Hmi =
		(typeof globalThis !== 'undefined' ? globalThis : window).Hmi || {};
	Hmi.ShapeUtil = HmiUtil;
	Hmi.ShapeHmiBase = mxShapeHmiBase;

})();
