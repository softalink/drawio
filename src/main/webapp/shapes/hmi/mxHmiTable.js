/**
 * Copyright (c) 2025-2026, JGraph Holdings Ltd
 * Copyright (c) 2025-2026, draw.io AG
 *
 * HMI/SCADA data table (HMI-WGT-13) and runtime-only media/chart widget
 * placeholders (HMI-WGT-19, HMI-WGT-20), all painted through the
 * mxAbstractCanvas2D API only (see shapes/hmi/README.md), so they render
 * identically at design time, in Live preview and in SVG/PNG/PDF export.
 *
 * mxgraph.hmi.iframe, mxgraph.hmi.video and mxgraph.hmi.echarts are only
 * "live" in the runtime, where plugins/hmi/runtime/HmiDomWidgets.js
 * overlays a real DOM element (an <iframe>, a <video> or an ECharts canvas)
 * on top of the cell. These shapes only paint the design-time/export
 * placeholder (a frame, an icon and the configured URL/option text) --
 * they never touch the DOM themselves (ARCHITECTURE.md 1).
 */
(function()
{
	var Hmi = (typeof globalThis !== 'undefined' ? globalThis : window).Hmi =
		(typeof globalThis !== 'undefined' ? globalThis : window).Hmi || {};
	var HmiUtil = Hmi.ShapeUtil;
	var mxShapeHmiBase = Hmi.ShapeHmiBase;

	//======================================================================
	// 13. Data table  (HMI-WGT-13)
	//======================================================================

	var SAMPLE_TABLE_VALUE = '[{"tag":"TT-101","desc":"Reactor Temp","value":72.4,"unit":"°C"},' +
		'{"tag":"PT-102","desc":"Feed Pressure","value":3.15,"unit":"bar"},' +
		'{"tag":"FT-103","desc":"Flow Rate","value":128,"unit":"L/min"},' +
		'{"tag":"LT-104","desc":"Tank Level","value":64.8,"unit":"%"},' +
		'{"tag":"AT-105","desc":"pH","value":6.9,"unit":""}]';

	/**
	 * Parses a "key:Header:width:format,..." column spec (hmiColumns) into
	 * [{key, header, width, decimals}, ...]. `width` and `format` are
	 * optional; `format` is a decimals pattern such as "0.0" (1 decimal).
	 */
	function parseColumns(str)
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
			var key = mxUtils.trim(vals[0]);
			var header = (vals.length > 1) ? mxUtils.trim(vals[1]) : key;
			var width = (vals.length > 2) ? parseFloat(vals[2]) : NaN;
			var decimals = NaN;

			if (vals.length > 3)
			{
				var m = /\.(\d+)/.exec(mxUtils.trim(vals[3]));
				decimals = (m != null) ? m[1].length : NaN;
			}

			result.push({key: key, header: header || key, width: isNaN(width) ? null : width,
				decimals: isNaN(decimals) ? null : decimals});
		}

		return result;
	}

	/**
	 * Builds {columns: [{key, header, width, decimals}], rows: [[cell, ...]]}
	 * from the parsed hmiValue JSON and the (optional) hmiColumns spec.
	 */
	function buildTable(raw, columnsSpec)
	{
		var columns = parseColumns(columnsSpec);
		var rows = [];
		var data = null;

		try
		{
			data = (raw != null && raw !== '') ? JSON.parse(raw) : null;
		}
		catch (e)
		{
			data = null;
		}

		if (data == null || Object.prototype.toString.call(data) != '[object Array]' || data.length == 0)
		{
			try
			{
				data = JSON.parse(SAMPLE_TABLE_VALUE);
			}
			catch (e2)
			{
				data = [];
			}
		}

		var isObjectRows = data.length > 0 && typeof data[0] === 'object' &&
			Object.prototype.toString.call(data[0]) != '[object Array]' && data[0] != null;

		if (isObjectRows)
		{
			if (columns.length == 0)
			{
				for (var k in data[0])
				{
					columns.push({key: k, header: k, width: null, decimals: null});
				}
			}

			for (var i = 0; i < data.length; i++)
			{
				var row = [];

				for (var c = 0; c < columns.length; c++)
				{
					row.push(data[i][columns[c].key]);
				}

				rows.push(row);
			}
		}
		else
		{
			// Array of arrays.
			if (columns.length == 0)
			{
				var headerRow = null;
				var startIdx = 0;
				var width = (data.length > 0 && data[0] != null) ? data[0].length : 0;

				for (var c2 = 0; c2 < width; c2++)
				{
					columns.push({key: String(c2), header: 'Col ' + (c2 + 1), width: null, decimals: null});
				}
			}

			for (var i2 = 0; i2 < data.length; i2++)
			{
				rows.push(data[i2] || []);
			}
		}

		return {columns: columns, rows: rows};
	}

	function formatCell(value, decimals)
	{
		if (value == null)
		{
			return '';
		}

		if (decimals != null)
		{
			var n = parseFloat(value);

			if (!isNaN(n))
			{
				return n.toFixed(decimals);
			}
		}

		return (typeof value === 'object') ? JSON.stringify(value) : String(value);
	}

	/**
	 * Truncates text with an ellipsis so it does not visibly overrun its
	 * column (mxAbstractCanvas2D has no clip(), see shapes/hmi/README.md).
	 */
	function truncate(text, colWidth, fontSize)
	{
		var charW = Math.max(4, fontSize * 0.62);
		var max = Math.max(1, Math.floor((colWidth - 8) / charW));

		if (text.length <= max)
		{
			return text;
		}

		return (max <= 1) ? text.charAt(0) : (text.substring(0, max - 1) + '…');
	}

	function mxShapeHmiTable()
	{
		mxShapeHmiBase.apply(this, arguments);
	};

	mxUtils.extend(mxShapeHmiTable, mxShapeHmiBase);

	mxShapeHmiTable.prototype.cst = {SHAPE: 'mxgraph.hmi.table'};

	mxShapeHmiTable.prototype.customProperties = [
		{name: 'hmiValue', dispName: 'Value (JSON rows)', type: 'string', defVal: SAMPLE_TABLE_VALUE},
		{name: 'hmiColumns', dispName: 'Columns (key:Header:width:format,...)', type: 'string', defVal: ''},
		{name: 'hmiHeader', dispName: 'Header Row', type: 'bool', defVal: true},
		{name: 'hmiStripe', dispName: 'Row Striping', type: 'bool', defVal: true},
		{name: 'stripeColor', dispName: 'Stripe Color', type: 'color', defVal: '#f5f7f8'},
		{name: 'headerColor', dispName: 'Header Color', type: 'color', defVal: '#eceff1'},
		{name: 'fontSize', dispName: 'Font Size', type: 'int', min: 6, max: 48, defVal: 12},
		{name: 'rowHeight', dispName: 'Row Height', type: 'int', min: 10, max: 200, defVal: 22},
		{name: 'hmiMaxRows', dispName: 'Max Visible Rows', type: 'int', min: 1, max: 200, defVal: 8},
		{name: 'hmiAutoScroll', dispName: 'Auto Scroll (runtime)', type: 'bool', defVal: false},
		{name: 'hmiScrollInterval', dispName: 'Scroll Interval (ms)', type: 'int', min: 100, max: 60000, defVal: 1500}
	];

	mxShapeHmiTable.prototype.paintWidget = function(c, w, h)
	{
		var raw = HmiUtil.str(this.style, 'hmiValue', SAMPLE_TABLE_VALUE);
		var columnsSpec = HmiUtil.str(this.style, 'hmiColumns', '');
		var header = HmiUtil.bool(this.style, 'hmiHeader', '1');
		var stripe = HmiUtil.bool(this.style, 'hmiStripe', '1');
		var stripeColor = HmiUtil.str(this.style, 'stripeColor', '#f5f7f8');
		var headerColor = HmiUtil.str(this.style, 'headerColor', '#eceff1');
		var fontSize = HmiUtil.num(this.style, mxConstants.STYLE_FONTSIZE, HmiUtil.num(this.style, 'fontSize', '12'));
		var rowHeight = HmiUtil.num(this.style, 'rowHeight', String(Math.max(16, fontSize * 1.8)));
		var maxRows = HmiUtil.int(this.style, 'hmiMaxRows', '8');
		var autoScroll = HmiUtil.bool(this.style, 'hmiAutoScroll', '0');
		var scrollOffset = autoScroll ? HmiUtil.int(this.style, 'hmiScrollOffset', '0') : 0;
		var fill = mxUtils.getValue(this.style, mxConstants.STYLE_FILLCOLOR, '#ffffff');
		var stroke = mxUtils.getValue(this.style, mxConstants.STYLE_STROKECOLOR, '#cfd8dc');
		var fontColor = mxUtils.getValue(this.style, mxConstants.STYLE_FONTCOLOR, '#263238');

		var table = buildTable(raw, columnsSpec);
		var columns = table.columns;
		var rows = table.rows;

		// Background + frame.
		c.setFillColor(fill);
		c.setStrokeColor(stroke);
		c.begin();
		c.rect(0, 0, w, h);
		c.fillAndStroke();

		if (columns.length == 0)
		{
			return;
		}

		// Column widths: explicit widths first, remaining space split evenly
		// among the rest (never below a small minimum).
		var fixed = 0;
		var flexCount = 0;

		for (var i = 0; i < columns.length; i++)
		{
			if (columns[i].width != null)
			{
				fixed += columns[i].width;
			}
			else
			{
				flexCount++;
			}
		}

		var remaining = Math.max(0, w - fixed);
		var flexWidth = (flexCount > 0) ? (remaining / flexCount) : 0;
		var colX = [];
		var colW = [];
		var x = 0;

		for (var i2 = 0; i2 < columns.length; i2++)
		{
			var cw = (columns[i2].width != null) ? columns[i2].width : flexWidth;
			colX.push(x);
			colW.push(Math.max(4, cw));
			x += cw;
		}

		var y = 0;
		c.setFontSize(fontSize);

		if (header && y + rowHeight <= h)
		{
			c.setFillColor(headerColor);
			c.begin();
			c.rect(0, y, w, rowHeight);
			c.fill();

			c.setFontColor(fontColor);
			c.setFontStyle(mxConstants.FONT_BOLD);

			for (var hc = 0; hc < columns.length; hc++)
			{
				c.text(colX[hc] + 6, y + rowHeight / 2, 0, 0,
					truncate(columns[hc].header, colW[hc], fontSize),
					mxConstants.ALIGN_LEFT, mxConstants.ALIGN_MIDDLE, 0);
			}

			c.setFontStyle(0);
			y += rowHeight;
		}

		var visibleRows = Math.max(0, Math.min(maxRows, Math.floor((h - y) / Math.max(1, rowHeight))));
		var n = rows.length;

		for (var r = 0; r < visibleRows && r < n; r++)
		{
			var rowIdx = (n > 0) ? ((scrollOffset + r) % n + n) % n : 0;
			var rowY = y + r * rowHeight;

			if (stripe && r % 2 == 1)
			{
				c.setFillColor(stripeColor);
				c.begin();
				c.rect(0, rowY, w, rowHeight);
				c.fill();
			}

			var rowData = rows[rowIdx] || [];
			c.setFontColor(fontColor);

			for (var cc = 0; cc < columns.length; cc++)
			{
				var text = formatCell(rowData[cc], columns[cc].decimals);
				c.text(colX[cc] + 6, rowY + rowHeight / 2, 0, 0,
					truncate(text, colW[cc], fontSize),
					mxConstants.ALIGN_LEFT, mxConstants.ALIGN_MIDDLE, 0);
			}
		}

		// Grid lines.
		c.setStrokeColor(stroke);
		c.setStrokeWidth(1);
		var gridBottom = y + Math.min(visibleRows, n) * rowHeight;

		for (var g = 1; g < columns.length; g++)
		{
			c.begin();
			c.moveTo(colX[g], 0);
			c.lineTo(colX[g], Math.max(gridBottom, header ? rowHeight : 0));
			c.stroke();
		}

		if (header)
		{
			c.begin();
			c.moveTo(0, rowHeight);
			c.lineTo(w, rowHeight);
			c.stroke();
		}
	};

	mxCellRenderer.registerShape(mxShapeHmiTable.prototype.cst.SHAPE, mxShapeHmiTable);

	//======================================================================
	// Shared placeholder painter for the runtime-only DOM widgets
	// (HMI-WGT-19, HMI-WGT-20). The real content is overlaid by
	// plugins/hmi/runtime/HmiDomWidgets.js only while the runtime is
	// running; these shapes exist so the cell looks meaningful at design
	// time and exports something sensible (a frame, an icon, a caption).
	//======================================================================

	function paintPlaceholderFrame(c, w, h, fill, stroke)
	{
		c.setFillColor(fill);
		c.setStrokeColor(stroke);
		c.begin();
		c.roundrect(0.5, 0.5, w - 1, h - 1, Math.min(6, Math.min(w, h) * 0.08), Math.min(6, Math.min(w, h) * 0.08));
		c.fillAndStroke();
	}

	function paintPlaceholderCaption(c, w, h, iconSize, title, subtitle, fontColor)
	{
		var cy = h / 2 - iconSize * 0.15;
		c.setFontColor(fontColor);
		c.setFontStyle(mxConstants.FONT_BOLD);
		c.setFontSize(Math.max(9, Math.min(13, h * 0.12)));
		c.text(w / 2, cy + iconSize * 0.85, 0, 0, title, mxConstants.ALIGN_CENTER, mxConstants.ALIGN_MIDDLE, 0);

		if (subtitle != null && subtitle !== '')
		{
			c.setFontStyle(0);
			c.setFontSize(Math.max(8, Math.min(11, h * 0.09)));
			c.text(w / 2, cy + iconSize * 0.85 + Math.max(9, Math.min(13, h * 0.12)) + 3, w - 16, 0,
				subtitle, mxConstants.ALIGN_CENTER, mxConstants.ALIGN_TOP, 1);
		}
	}

	//======================================================================
	// 19a. Embedded web content (iframe)  (HMI-WGT-19)
	//======================================================================

	function mxShapeHmiIframe()
	{
		mxShapeHmiBase.apply(this, arguments);
	};

	mxUtils.extend(mxShapeHmiIframe, mxShapeHmiBase);

	mxShapeHmiIframe.prototype.cst = {SHAPE: 'mxgraph.hmi.iframe'};

	mxShapeHmiIframe.prototype.customProperties = [
		{name: 'hmiUrl', dispName: 'URL', type: 'string', defVal: 'https://www.example.com/'},
		{name: 'hmiRefresh', dispName: 'Refresh (s, 0=never)', type: 'int', min: 0, max: 86400, defVal: 0},
		{name: 'hmiSandbox', dispName: 'Sandbox', type: 'string', defVal: 'allow-scripts allow-forms'}
	];

	mxShapeHmiIframe.prototype.paintWidget = function(c, w, h)
	{
		var url = HmiUtil.str(this.style, 'hmiUrl', '');
		var fill = mxUtils.getValue(this.style, mxConstants.STYLE_FILLCOLOR, '#f5f7f8');
		var stroke = mxUtils.getValue(this.style, mxConstants.STYLE_STROKECOLOR, '#90a4ae');
		var fontColor = mxUtils.getValue(this.style, mxConstants.STYLE_FONTCOLOR, '#546e7a');

		paintPlaceholderFrame(c, w, h, fill, stroke);

		// Browser-window glyph: title bar + 3 dots + page rectangle.
		var barH = Math.max(8, Math.min(h * 0.18, 16));
		var pad = Math.max(6, Math.min(w, h) * 0.06);

		c.setFillColor(stroke);
		c.setAlpha(0.35);
		c.begin();
		c.rect(pad, pad, w - 2 * pad, barH);
		c.fill();
		c.setAlpha(1);

		c.setFillColor(stroke);
		var dotR = Math.max(1.2, barH * 0.14);

		for (var i = 0; i < 3; i++)
		{
			c.begin();
			c.ellipse(pad + 5 + i * (dotR * 3), pad + barH / 2 - dotR, dotR * 2, dotR * 2);
			c.fill();
		}

		c.setStrokeColor(stroke);
		c.begin();
		c.rect(pad, pad + barH, w - 2 * pad, Math.max(0, h - 2 * pad - barH - 18));
		c.stroke();

		c.setFontColor(fontColor);
		c.setFontSize(Math.max(8, Math.min(11, h * 0.09)));
		c.text(w / 2, h - pad - 4, w - 2 * pad, 0, url || 'about:blank',
			mxConstants.ALIGN_CENTER, mxConstants.ALIGN_BOTTOM, 1);
	};

	mxCellRenderer.registerShape(mxShapeHmiIframe.prototype.cst.SHAPE, mxShapeHmiIframe);

	//======================================================================
	// 19b. Video stream  (HMI-WGT-19)
	//======================================================================

	function mxShapeHmiVideo()
	{
		mxShapeHmiBase.apply(this, arguments);
	};

	mxUtils.extend(mxShapeHmiVideo, mxShapeHmiBase);

	mxShapeHmiVideo.prototype.cst = {SHAPE: 'mxgraph.hmi.video'};

	mxShapeHmiVideo.prototype.customProperties = [
		{name: 'hmiUrl', dispName: 'URL', type: 'string', defVal: ''},
		{name: 'hmiAutoplay', dispName: 'Autoplay', type: 'bool', defVal: true},
		{name: 'hmiMuted', dispName: 'Muted', type: 'bool', defVal: true},
		{name: 'hmiLoop', dispName: 'Loop', type: 'bool', defVal: true}
	];

	mxShapeHmiVideo.prototype.paintWidget = function(c, w, h)
	{
		var url = HmiUtil.str(this.style, 'hmiUrl', '');
		var fill = mxUtils.getValue(this.style, mxConstants.STYLE_FILLCOLOR, '#263238');
		var stroke = mxUtils.getValue(this.style, mxConstants.STYLE_STROKECOLOR, '#546e7a');
		var fontColor = mxUtils.getValue(this.style, mxConstants.STYLE_FONTCOLOR, '#eceff1');

		paintPlaceholderFrame(c, w, h, fill, stroke);

		var r = Math.max(10, Math.min(w, h) * 0.18);
		var cx = w / 2, cy = h / 2 - r * 0.3;

		c.setFillColor('#ffffff');
		c.setAlpha(0.85);
		c.begin();
		c.ellipse(cx - r, cy - r, r * 2, r * 2);
		c.fill();
		c.setAlpha(1);

		c.setFillColor(fill);
		c.begin();
		c.moveTo(cx - r * 0.32, cy - r * 0.5);
		c.lineTo(cx - r * 0.32, cy + r * 0.5);
		c.lineTo(cx + r * 0.5, cy);
		c.close();
		c.fill();

		c.setFontColor(fontColor);
		c.setFontSize(Math.max(8, Math.min(11, h * 0.09)));
		c.text(w / 2, cy + r + 12, w - 16, 0, url || 'No source',
			mxConstants.ALIGN_CENTER, mxConstants.ALIGN_TOP, 1);
	};

	mxCellRenderer.registerShape(mxShapeHmiVideo.prototype.cst.SHAPE, mxShapeHmiVideo);

	//======================================================================
	// 20. ECharts widget  (HMI-WGT-20)
	//======================================================================

	function mxShapeHmiEcharts()
	{
		mxShapeHmiBase.apply(this, arguments);
	};

	mxUtils.extend(mxShapeHmiEcharts, mxShapeHmiBase);

	mxShapeHmiEcharts.prototype.cst = {SHAPE: 'mxgraph.hmi.echarts'};

	mxShapeHmiEcharts.prototype.customProperties = [
		{name: 'hmiOption', dispName: 'ECharts Option (JSON)', type: 'string',
			defVal: '{"xAxis":{"type":"time"},"yAxis":{"type":"value"},"series":[{"type":"line","data":[]}]}'},
		{name: 'hmiMaxPoints', dispName: 'Max Points', type: 'int', min: 1, max: 100000, defVal: 300}
	];

	mxShapeHmiEcharts.prototype.paintWidget = function(c, w, h)
	{
		var fill = mxUtils.getValue(this.style, mxConstants.STYLE_FILLCOLOR, '#ffffff');
		var stroke = mxUtils.getValue(this.style, mxConstants.STYLE_STROKECOLOR, '#cfd8dc');
		var fontColor = mxUtils.getValue(this.style, mxConstants.STYLE_FONTCOLOR, '#546e7a');

		paintPlaceholderFrame(c, w, h, fill, stroke);

		// Small bar-chart glyph.
		var pad = Math.max(10, Math.min(w, h) * 0.16);
		var plotX = pad, plotY = h * 0.28, plotW = w - 2 * pad, plotH = h * 0.4;
		var bars = [0.5, 0.8, 0.35, 0.95, 0.6];
		var n = bars.length;
		var slot = plotW / n;
		var barW = slot * 0.55;
		var palette = ['#1976d2', '#e74c3c', '#2ecc71', '#f39c12', '#8e44ad'];

		c.setStrokeColor(stroke);
		c.begin();
		c.moveTo(plotX, plotY);
		c.lineTo(plotX, plotY + plotH);
		c.lineTo(plotX + plotW, plotY + plotH);
		c.stroke();

		for (var i = 0; i < n; i++)
		{
			var bh = plotH * bars[i];
			c.setFillColor(palette[i % palette.length]);
			c.begin();
			c.rect(plotX + slot * i + (slot - barW) / 2, plotY + plotH - bh, barW, bh);
			c.fill();
		}

		c.setFontColor(fontColor);
		c.setFontSize(Math.max(9, Math.min(12, h * 0.1)));
		c.setFontStyle(mxConstants.FONT_BOLD);
		c.text(w / 2, plotY + plotH + 14, w - 16, 0, 'ECharts', mxConstants.ALIGN_CENTER, mxConstants.ALIGN_TOP, 0);
		c.setFontStyle(0);
	};

	mxCellRenderer.registerShape(mxShapeHmiEcharts.prototype.cst.SHAPE, mxShapeHmiEcharts);

})();
