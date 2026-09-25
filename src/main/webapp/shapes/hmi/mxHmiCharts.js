/**
 * Copyright (c) 2025-2026, JGraph Holdings Ltd
 * Copyright (c) 2025-2026, draw.io AG
 *
 * HMI/SCADA chart widgets: trend (line), bar and pie chart, all painted
 * through the mxAbstractCanvas2D API only (see shapes/hmi/README.md).
 *
 * The trend chart is ported in spirit from meta2d.js's le5le-charts
 * `lineChart.ts` (MIT licensed, https://github.com/le5le-com/meta2d.js) --
 * time-windowed rolling buffer, optional area fill, auto y-range -- redrawn
 * from scratch against mxAbstractCanvas2D since that package renders to a
 * plain HTML canvas.
 */
(function()
{
	var Hmi = (typeof globalThis !== 'undefined' ? globalThis : window).Hmi =
		(typeof globalThis !== 'undefined' ? globalThis : window).Hmi || {};
	var HmiUtil = Hmi.ShapeUtil;
	var mxShapeHmiBase = Hmi.ShapeHmiBase;

	// Distinguishable default palette for unlabelled multi-series data.
	var PALETTE = ['#1976d2', '#e74c3c', '#2ecc71', '#f39c12', '#8e44ad', '#16a085', '#e91e63', '#607d8b'];

	/**
	 * Generates a smooth, deterministic design-time sample series so the
	 * chart never looks empty/blank while designing a screen.
	 */
	function sampleSeries(n, phase)
	{
		var out = [];
		var now = Date.now();

		for (var i = 0; i < n; i++)
		{
			var t = now - (n - i) * 2000;
			var v = 50 + 35 * Math.sin((i / n) * Math.PI * 2 + (phase || 0)) + 6 * Math.sin(i * 1.7);
			out.push([t, v]);
		}

		return out;
	}

	function getOverlaySeries(shape)
	{
		try
		{
			if (shape.state != null && shape.state.view != null && shape.state.view.graph != null &&
				shape.state.view.graph.hmiOverlay != null && shape.state.cell != null)
			{
				return shape.state.view.graph.hmiOverlay.getSeries(shape.state.cell.id);
			}
		}
		catch (e)
		{
			// Ignore -- design time / no runtime overlay attached.
		}

		return null;
	}

	//======================================================================
	// 11. Trend chart (line)  (HMI-WGT-11)
	//======================================================================

	function mxShapeHmiTrendChart()
	{
		mxShapeHmiBase.apply(this, arguments);
	};

	mxUtils.extend(mxShapeHmiTrendChart, mxShapeHmiBase);

	mxShapeHmiTrendChart.prototype.cst = {SHAPE: 'mxgraph.hmi.trendChart'};

	mxShapeHmiTrendChart.prototype.customProperties = [
		{name: 'hmiTimeWindow', dispName: 'Time Window (ms)', type: 'int', defVal: 300000},
		{name: 'hmiYMin', dispName: 'Y Min (blank = auto)', type: 'string', defVal: ''},
		{name: 'hmiYMax', dispName: 'Y Max (blank = auto)', type: 'string', defVal: ''},
		{name: 'hmiLineColor', dispName: 'Line Color', type: 'color', defVal: '#1976d2'},
		{name: 'hmiGridColor', dispName: 'Grid Color', type: 'color', defVal: '#e0e0e0'},
		{name: 'hmiShowLegend', dispName: 'Show Legend', type: 'bool', defVal: true},
		{name: 'hmiFillArea', dispName: 'Fill Area', type: 'bool', defVal: false}
	];

	mxShapeHmiTrendChart.prototype.paintWidget = function(c, w, h)
	{
		var timeWindow = HmiUtil.int(this.style, 'hmiTimeWindow', '300000');
		var yMinStr = HmiUtil.str(this.style, 'hmiYMin', '');
		var yMaxStr = HmiUtil.str(this.style, 'hmiYMax', '');
		var lineColor = HmiUtil.str(this.style, 'hmiLineColor', '#1976d2');
		var gridColor = HmiUtil.str(this.style, 'hmiGridColor', '#e0e0e0');
		var showLegend = HmiUtil.bool(this.style, 'hmiShowLegend', '1');
		var fillArea = HmiUtil.bool(this.style, 'hmiFillArea', '0');
		var fill = mxUtils.getValue(this.style, mxConstants.STYLE_FILLCOLOR, '#ffffff');
		var stroke = mxUtils.getValue(this.style, mxConstants.STYLE_STROKECOLOR, '#cfd8dc');
		var fontColor = mxUtils.getValue(this.style, mxConstants.STYLE_FONTCOLOR, '#455a64');

		var raw = getOverlaySeries(this);
		var series; // {name: [[ts, v], ...], ...}

		if (raw == null)
		{
			var label = HmiUtil.getLabel(this) || 'Value';
			series = {};
			series[label] = sampleSeries(60, 0);
		}
		else if (raw.length != null && (raw.length == 0 || raw[0] instanceof Array || (raw[0] && raw[0].length == 2)))
		{
			// Plain [[ts, v], ...] array -> single unnamed series.
			series = {Value: raw};
		}
		else
		{
			// Already {name: [[ts, v], ...]}
			series = raw;
		}

		var names = [];

		for (var k in series)
		{
			names.push(k);
		}

		// Chrome
		c.setFillColor(fill);
		c.setStrokeColor(stroke);
		c.begin();
		c.rect(0, 0, w, h);
		c.fillAndStroke();

		var padL = 42, padR = 8, padT = 10, padB = showLegend ? 26 : 18;
		var plotX = padL, plotY = padT, plotW = Math.max(1, w - padL - padR), plotH = Math.max(1, h - padT - padB);

		// Determine time range.
		var now = 0;

		for (var s = 0; s < names.length; s++)
		{
			var pts = series[names[s]] || [];

			for (var i = 0; i < pts.length; i++)
			{
				if (pts[i][0] > now)
				{
					now = pts[i][0];
				}
			}
		}

		if (now == 0)
		{
			now = Date.now();
		}

		var tMin = now - timeWindow;

		// Determine y range.
		var yMin = parseFloat(yMinStr);
		var yMax = parseFloat(yMaxStr);
		var autoMin = isNaN(yMin);
		var autoMax = isNaN(yMax);

		if (autoMin || autoMax)
		{
			var lo = Infinity, hi = -Infinity;

			for (var s2 = 0; s2 < names.length; s2++)
			{
				var pts2 = series[names[s2]] || [];

				for (var i2 = 0; i2 < pts2.length; i2++)
				{
					if (pts2[i2][0] >= tMin)
					{
						lo = Math.min(lo, pts2[i2][1]);
						hi = Math.max(hi, pts2[i2][1]);
					}
				}
			}

			if (!isFinite(lo) || !isFinite(hi))
			{
				lo = 0;
				hi = 100;
			}

			if (lo == hi)
			{
				lo -= 1;
				hi += 1;
			}

			var margin = (hi - lo) * 0.1;

			if (autoMin)
			{
				yMin = lo - margin;
			}

			if (autoMax)
			{
				yMax = hi + margin;
			}
		}

		if (yMax <= yMin)
		{
			yMax = yMin + 1;
		}

		var xOf = function(t)
		{
			return plotX + plotW * ((t - tMin) / timeWindow);
		};

		var yOf = function(v)
		{
			return plotY + plotH * (1 - (v - yMin) / (yMax - yMin));
		};

		// Grid + y labels
		c.setStrokeColor(gridColor);
		c.setStrokeWidth(1);
		c.setFontColor(fontColor);
		c.setFontSize(Math.max(7, Math.min(11, plotH * 0.09)));

		var ySteps = 4;

		for (var g = 0; g <= ySteps; g++)
		{
			var gv = yMin + (yMax - yMin) * (g / ySteps);
			var gy = yOf(gv);
			c.begin();
			c.moveTo(plotX, gy);
			c.lineTo(plotX + plotW, gy);
			c.stroke();
			c.text(plotX - 5, gy, 0, 0, HmiUtil.format(gv, (yMax - yMin) < 5 ? 1 : 0), mxConstants.ALIGN_RIGHT, mxConstants.ALIGN_MIDDLE, 0);
		}

		var xSteps = 4;

		for (var gx = 0; gx <= xSteps; gx++)
		{
			var gt = tMin + timeWindow * (gx / xSteps);
			var gxp = xOf(gt);
			c.begin();
			c.moveTo(gxp, plotY);
			c.lineTo(gxp, plotY + plotH);
			c.stroke();
		}

		c.setStrokeColor(stroke);
		c.begin();
		c.rect(plotX, plotY, plotW, plotH);
		c.stroke();

		// Series lines
		for (var s3 = 0; s3 < names.length; s3++)
		{
			var color = (names.length == 1) ? lineColor : PALETTE[s3 % PALETTE.length];
			var pts3 = series[names[s3]] || [];
			var visible = [];

			for (var i3 = 0; i3 < pts3.length; i3++)
			{
				if (pts3[i3][0] >= tMin - timeWindow * 0.02)
				{
					visible.push(pts3[i3]);
				}
			}

			if (visible.length == 0)
			{
				continue;
			}

			if (fillArea)
			{
				c.setFillColor(color);
				c.setAlpha(0.15);
				c.begin();
				c.moveTo(xOf(visible[0][0]), yOf(yMin));

				for (var p = 0; p < visible.length; p++)
				{
					c.lineTo(xOf(visible[p][0]), yOf(visible[p][1]));
				}

				c.lineTo(xOf(visible[visible.length - 1][0]), yOf(yMin));
				c.close();
				c.fill();
				c.setAlpha(1);
			}

			c.setStrokeColor(color);
			c.setStrokeWidth(2);
			c.begin();
			c.moveTo(xOf(visible[0][0]), yOf(visible[0][1]));

			for (var p2 = 1; p2 < visible.length; p2++)
			{
				c.lineTo(xOf(visible[p2][0]), yOf(visible[p2][1]));
			}

			c.stroke();

			// Last-value marker
			var last = visible[visible.length - 1];
			c.setFillColor(color);
			c.setStrokeColor('#ffffff');
			c.setStrokeWidth(1);
			c.begin();
			c.ellipse(xOf(last[0]) - 3, yOf(last[1]) - 3, 6, 6);
			c.fillAndStroke();
		}

		if (showLegend && names.length > 0)
		{
			var lx = plotX;
			var ly = h - 12;
			c.setFontSize(Math.max(7, Math.min(10, plotH * 0.08)));

			for (var s4 = 0; s4 < names.length; s4++)
			{
				var color2 = (names.length == 1) ? lineColor : PALETTE[s4 % PALETTE.length];
				c.setFillColor(color2);
				c.begin();
				c.rect(lx, ly - 5, 10, 4);
				c.fill();
				c.setFontColor(fontColor);
				c.text(lx + 14, ly - 3, 0, 0, names[s4], mxConstants.ALIGN_LEFT, mxConstants.ALIGN_MIDDLE, 0);
				lx += 14 + names[s4].length * 6 + 14;
			}
		}
	};

	mxCellRenderer.registerShape(mxShapeHmiTrendChart.prototype.cst.SHAPE, mxShapeHmiTrendChart);

	//======================================================================
	// 12. Bar / pie chart  (HMI-WGT-12)
	//======================================================================

	/**
	 * Parses hmiValue as either a JSON array of numbers, a JSON object of
	 * {label: value}, or falls back to a design-time sample.
	 */
	function parseCategorical(raw, sampleLabels)
	{
		if (raw != null && raw.length > 0)
		{
			try
			{
				var v = JSON.parse(raw);

				if (Object.prototype.toString.call(v) == '[object Array]')
				{
					var out = [];

					for (var i = 0; i < v.length; i++)
					{
						out.push({label: sampleLabels[i] || ('S' + (i + 1)), value: parseFloat(v[i]) || 0});
					}

					return out;
				}
				else if (typeof v == 'object' && v != null)
				{
					var out2 = [];

					for (var k in v)
					{
						out2.push({label: k, value: parseFloat(v[k]) || 0});
					}

					return out2;
				}
			}
			catch (e)
			{
				// fall through to sample data
			}
		}

		return [
			{label: 'Mon', value: 42}, {label: 'Tue', value: 58}, {label: 'Wed', value: 35},
			{label: 'Thu', value: 67}, {label: 'Fri', value: 51}
		];
	}

	function mxShapeHmiBarChart()
	{
		mxShapeHmiBase.apply(this, arguments);
	};

	mxUtils.extend(mxShapeHmiBarChart, mxShapeHmiBase);

	mxShapeHmiBarChart.prototype.cst = {SHAPE: 'mxgraph.hmi.barChart'};

	mxShapeHmiBarChart.prototype.customProperties = [
		{name: 'hmiValue', dispName: 'Value (JSON array or {label:value})', type: 'string',
			defVal: '{"Mon":42,"Tue":58,"Wed":35,"Thu":67,"Fri":51}'},
		{name: 'hmiBarColor', dispName: 'Bar Color', type: 'color', defVal: '#1976d2'},
		{name: 'hmiOrientation', dispName: 'Orientation', type: 'enum', defVal: 'vertical',
			enumList: [{val: 'vertical', dispName: 'Vertical'}, {val: 'horizontal', dispName: 'Horizontal'}]}
	];

	mxShapeHmiBarChart.prototype.paintWidget = function(c, w, h)
	{
		var raw = HmiUtil.str(this.style, 'hmiValue', '');
		var barColor = HmiUtil.str(this.style, 'hmiBarColor', '#1976d2');
		var vertical = HmiUtil.str(this.style, 'hmiOrientation', 'vertical') != 'horizontal';
		var fill = mxUtils.getValue(this.style, mxConstants.STYLE_FILLCOLOR, '#ffffff');
		var stroke = mxUtils.getValue(this.style, mxConstants.STYLE_STROKECOLOR, '#cfd8dc');
		var fontColor = mxUtils.getValue(this.style, mxConstants.STYLE_FONTCOLOR, '#455a64');

		var data = parseCategorical(raw, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);

		c.setFillColor(fill);
		c.setStrokeColor(stroke);
		c.begin();
		c.rect(0, 0, w, h);
		c.fillAndStroke();

		if (data.length == 0)
		{
			return;
		}

		var maxV = 0;

		for (var i = 0; i < data.length; i++)
		{
			maxV = Math.max(maxV, data[i].value);
		}

		if (maxV <= 0)
		{
			maxV = 1;
		}

		var padL = vertical ? 30 : 44, padR = 10, padT = 10, padB = vertical ? 20 : 10;
		var plotX = padL, plotY = padT, plotW = Math.max(1, w - padL - padR), plotH = Math.max(1, h - padT - padB);

		c.setStrokeColor(stroke);
		c.setStrokeWidth(1);
		c.begin();
		c.moveTo(plotX, plotY);
		c.lineTo(plotX, plotY + plotH);
		c.lineTo(plotX + plotW, plotY + plotH);
		c.stroke();

		var n = data.length;
		var gap = 0.28;

		if (vertical)
		{
			var slot = plotW / n;
			var barW = slot * (1 - gap);

			for (var j = 0; j < n; j++)
			{
				var bh = plotH * (data[j].value / maxV);
				var bx = plotX + slot * j + (slot - barW) / 2;
				var by = plotY + plotH - bh;

				c.setFillColor(barColor);
				c.begin();
				c.rect(bx, by, barW, bh);
				c.fill();

				c.setFontColor(fontColor);
				c.setFontSize(Math.max(7, Math.min(10, slot * 0.28)));
				c.text(bx + barW / 2, plotY + plotH + 4, 0, 0, data[j].label, mxConstants.ALIGN_CENTER, mxConstants.ALIGN_TOP, 0);
				c.setFontStyle(mxConstants.FONT_BOLD);
				c.text(bx + barW / 2, by - 2, 0, 0, HmiUtil.format(data[j].value, 0), mxConstants.ALIGN_CENTER, mxConstants.ALIGN_BOTTOM, 0);
				c.setFontStyle(0);
			}
		}
		else
		{
			var slotH = plotH / n;
			var barH = slotH * (1 - gap);

			for (var j2 = 0; j2 < n; j2++)
			{
				var bw = plotW * (data[j2].value / maxV);
				var by2 = plotY + slotH * j2 + (slotH - barH) / 2;

				c.setFillColor(barColor);
				c.begin();
				c.rect(plotX, by2, bw, barH);
				c.fill();

				c.setFontColor(fontColor);
				c.setFontSize(Math.max(7, Math.min(10, slotH * 0.32)));
				c.text(plotX - 6, by2 + barH / 2, 0, 0, data[j2].label, mxConstants.ALIGN_RIGHT, mxConstants.ALIGN_MIDDLE, 0);
				c.text(plotX + bw + 4, by2 + barH / 2, 0, 0, HmiUtil.format(data[j2].value, 0), mxConstants.ALIGN_LEFT, mxConstants.ALIGN_MIDDLE, 0);
			}
		}
	};

	mxCellRenderer.registerShape(mxShapeHmiBarChart.prototype.cst.SHAPE, mxShapeHmiBarChart);

	function mxShapeHmiPieChart()
	{
		mxShapeHmiBase.apply(this, arguments);
	};

	mxUtils.extend(mxShapeHmiPieChart, mxShapeHmiBase);

	mxShapeHmiPieChart.prototype.cst = {SHAPE: 'mxgraph.hmi.pieChart'};

	mxShapeHmiPieChart.prototype.customProperties = [
		{name: 'hmiValue', dispName: 'Value (JSON array or {label:value})', type: 'string',
			defVal: '{"Running":62,"Idle":25,"Fault":13}'},
		{name: 'hmiShowLegend', dispName: 'Show Legend', type: 'bool', defVal: true},
		{name: 'hmiDonut', dispName: 'Donut Style', type: 'bool', defVal: true}
	];

	mxShapeHmiPieChart.prototype.paintWidget = function(c, w, h)
	{
		var raw = HmiUtil.str(this.style, 'hmiValue', '');
		var showLegend = HmiUtil.bool(this.style, 'hmiShowLegend', '1');
		var donut = HmiUtil.bool(this.style, 'hmiDonut', '1');
		var fontColor = mxUtils.getValue(this.style, mxConstants.STYLE_FONTCOLOR, '#455a64');

		var data = parseCategorical(raw, ['Running', 'Idle', 'Fault']);
		var total = 0;

		for (var i = 0; i < data.length; i++)
		{
			total += Math.max(0, data[i].value);
		}

		if (total <= 0)
		{
			total = 1;
		}

		var legendW = (showLegend && w > 140) ? Math.min(110, w * 0.4) : 0;
		var cx = (w - legendW) / 2;
		var cy = h / 2;
		var r = Math.max(4, Math.min(cx, cy) - 6);

		var start = -90;

		for (var j = 0; j < data.length; j++)
		{
			var frac = Math.max(0, data[j].value) / total;
			var sweep = frac * 360;
			var end = start + sweep;
			var color = PALETTE[j % PALETTE.length];

			if (sweep <= 0.001)
			{
				continue;
			}

			var p0 = new mxPoint(cx + r * Math.cos(start * HmiUtil.PI180), cy + r * Math.sin(start * HmiUtil.PI180));
			var p1 = new mxPoint(cx + r * Math.cos(end * HmiUtil.PI180), cy + r * Math.sin(end * HmiUtil.PI180));

			c.setFillColor(color);
			c.setStrokeColor('#ffffff');
			c.setStrokeWidth(1);
			c.begin();
			c.moveTo(cx, cy);
			c.lineTo(p0.x, p0.y);
			c.arcTo(r, r, 0, (sweep > 180) ? 1 : 0, 1, p1.x, p1.y);
			c.close();
			c.fillAndStroke();

			start = end;
		}

		if (donut)
		{
			var innerR = r * 0.55;
			var bg = mxUtils.getValue(this.style, mxConstants.STYLE_FILLCOLOR, '#ffffff');
			c.setFillColor((bg == null || bg == 'none') ? '#ffffff' : bg);
			c.begin();
			c.ellipse(cx - innerR, cy - innerR, innerR * 2, innerR * 2);
			c.fill();

			c.setFontColor(fontColor);
			c.setFontStyle(mxConstants.FONT_BOLD);
			c.setFontSize(Math.max(9, innerR * 0.35));
			c.text(cx, cy, 0, 0, HmiUtil.format(total, 0), mxConstants.ALIGN_CENTER, mxConstants.ALIGN_MIDDLE, 0);
		}

		if (showLegend && legendW > 0)
		{
			var lx = w - legendW + 6;
			var ly = Math.max(10, cy - (data.length * 16) / 2);
			c.setFontSize(Math.max(8, Math.min(11, h * 0.08)));

			for (var k = 0; k < data.length; k++)
			{
				var color2 = PALETTE[k % PALETTE.length];
				c.setFillColor(color2);
				c.begin();
				c.rect(lx, ly, 9, 9);
				c.fill();
				c.setFontColor(fontColor);
				c.setFontStyle(0);
				var pct = Math.round((Math.max(0, data[k].value) / total) * 100);
				c.text(lx + 13, ly + 4, 0, 0, data[k].label + ' (' + pct + '%)', mxConstants.ALIGN_LEFT, mxConstants.ALIGN_MIDDLE, 0);
				ly += 18;
			}
		}
	};

	mxCellRenderer.registerShape(mxShapeHmiPieChart.prototype.cst.SHAPE, mxShapeHmiPieChart);

})();
