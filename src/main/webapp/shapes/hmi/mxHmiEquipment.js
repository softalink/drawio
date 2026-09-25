/**
 * Copyright (c) 2025-2026, JGraph Holdings Ltd
 * Copyright (c) 2025-2026, draw.io AG
 *
 * State-aware HMI/SCADA equipment symbols: pump, fan, motor, agitator,
 * valve (gate/butterfly/ball), conveyor, heat exchanger and simple pipe
 * fittings (tee, elbow). ISA-101 flat vector look: light fills, dark
 * outlines, colour reserved for state (HMI-USA-2/3).
 *
 * All state colouring follows the same convention: the numeric/string
 * value in style key `hmiValue` (or `hmiState`, an alias) is looked up in
 * the `hmiStates` map (default "0:#9e9e9e,1:#2ecc71,2:#e74c3c,3:#f1c40f",
 * i.e. 0 stopped/grey, 1 running/green, 2 fault/red, 3 transit-warn/amber).
 */
(function()
{
	var Hmi = (typeof globalThis !== 'undefined' ? globalThis : window).Hmi =
		(typeof globalThis !== 'undefined' ? globalThis : window).Hmi || {};
	var HmiUtil = Hmi.ShapeUtil;
	var mxShapeHmiBase = Hmi.ShapeHmiBase;

	var DEFAULT_STATES = '0:#9e9e9e,1:#2ecc71,2:#e74c3c,3:#f1c40f';

	/**
	 * Resolves the equipment state colour from hmiValue/hmiState + hmiStates.
	 */
	function stateColor(style)
	{
		var raw = mxUtils.getValue(style, 'hmiValue', mxUtils.getValue(style, 'hmiState', '1'));
		var map = HmiUtil.parseMap(HmiUtil.str(style, 'hmiStates', DEFAULT_STATES)).map;
		var color = map[String(raw)];

		if (color == null)
		{
			var lower = String(raw).toLowerCase();

			if (lower == 'run' || lower == 'running' || lower == 'open' || lower == 'true')
			{
				color = map['1'] || '#2ecc71';
			}
			else if (lower == 'fault' || lower == 'error' || lower == 'trip')
			{
				color = map['2'] || '#e74c3c';
			}
			else if (lower == 'transit' || lower == 'warn' || lower == 'warning')
			{
				color = map['3'] || '#f1c40f';
			}
			else
			{
				color = map['0'] || '#9e9e9e';
			}
		}

		return color;
	}

	var STATE_PROP = {name: 'hmiValue', dispName: 'State (0 stopped, 1 running, 2 fault, 3 transit)', type: 'string', defVal: '1'};
	var STATES_PROP = {name: 'hmiStates', dispName: 'State Colour Map', type: 'string', defVal: DEFAULT_STATES};

	//======================================================================
	// Pump (centrifugal)
	//======================================================================

	function mxShapeHmiPump()
	{
		mxShapeHmiBase.apply(this, arguments);
	};

	mxUtils.extend(mxShapeHmiPump, mxShapeHmiBase);

	mxShapeHmiPump.prototype.cst = {SHAPE: 'mxgraph.hmi.pump'};

	mxShapeHmiPump.prototype.customProperties = [STATE_PROP, STATES_PROP,
		{name: 'hmiSpin', dispName: 'Spin (design preview)', type: 'bool', defVal: false}
	];

	mxShapeHmiPump.prototype.paintWidget = function(c, w, h)
	{
		var color = stateColor(this.style);
		var stroke = mxUtils.getValue(this.style, mxConstants.STYLE_STROKECOLOR, '#37474f');
		var cx = w * 0.42, cy = h * 0.5, r = Math.min(w, h) * 0.42;

		// Discharge nozzle (top)
		c.setFillColor('#eceff1');
		c.setStrokeColor(stroke);
		c.setStrokeWidth(2);
		c.begin();
		c.rect(cx - r * 0.28, 0, r * 0.56, cy - r * 0.55);
		c.fillAndStroke();

		// Suction nozzle (left)
		c.begin();
		c.rect(0, cy - r * 0.28, cx - r * 0.55, r * 0.56);
		c.fillAndStroke();

		// Casing (state coloured)
		c.setFillColor(color);
		c.setStrokeColor(stroke);
		c.setStrokeWidth(2.5);
		c.begin();
		c.ellipse(cx - r, cy - r, r * 2, r * 2);
		c.fillAndStroke();

		// Impeller (drawn as a distinct inner layer -- this is the part a
		// spin animation rotates; the runtime spins the whole cell via a
		// style 'rotation' overlay rather than a nested DOM node, per the
		// DOM-free painting contract).
		c.setStrokeColor('#ffffff');
		c.setStrokeWidth(Math.max(1.5, r * 0.09));
		var blades = 3;

		for (var i = 0; i < blades; i++)
		{
			var a0 = (i * (360 / blades)) * HmiUtil.PI180;
			var a1 = a0 + 100 * HmiUtil.PI180;
			var p0 = new mxPoint(cx + r * 0.12 * Math.cos(a0), cy + r * 0.12 * Math.sin(a0));
			var p1 = new mxPoint(cx + r * 0.62 * Math.cos(a1), cy + r * 0.62 * Math.sin(a1));
			c.begin();
			c.moveTo(p0.x, p0.y);
			c.quadTo(cx, cy, p1.x, p1.y);
			c.stroke();
		}

		c.setFillColor('#ffffff');
		c.begin();
		c.ellipse(cx - r * 0.14, cy - r * 0.14, r * 0.28, r * 0.28);
		c.fill();

		// Motor block, right side
		var mx = cx + r * 0.75, mw = w - mx;

		if (mw > 4)
		{
			c.setFillColor('#cfd8dc');
			c.setStrokeColor(stroke);
			c.setStrokeWidth(2);
			c.begin();
			c.roundrect(mx, cy - r * 0.55, mw, r * 1.1, 3, 3);
			c.fillAndStroke();
		}
	};

	mxCellRenderer.registerShape(mxShapeHmiPump.prototype.cst.SHAPE, mxShapeHmiPump);

	//======================================================================
	// Fan
	//======================================================================

	function mxShapeHmiFan()
	{
		mxShapeHmiBase.apply(this, arguments);
	};

	mxUtils.extend(mxShapeHmiFan, mxShapeHmiBase);

	mxShapeHmiFan.prototype.cst = {SHAPE: 'mxgraph.hmi.fan'};

	mxShapeHmiFan.prototype.customProperties = [STATE_PROP, STATES_PROP];

	mxShapeHmiFan.prototype.paintWidget = function(c, w, h)
	{
		var color = stateColor(this.style);
		var stroke = mxUtils.getValue(this.style, mxConstants.STYLE_STROKECOLOR, '#37474f');
		var cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 2;

		c.setFillColor('#eceff1');
		c.setStrokeColor(stroke);
		c.setStrokeWidth(2);
		c.begin();
		c.ellipse(cx - r, cy - r, r * 2, r * 2);
		c.fillAndStroke();

		var blades = 5;

		for (var i = 0; i < blades; i++)
		{
			var a = (i * (360 / blades)) * HmiUtil.PI180;
			var tip = new mxPoint(cx + r * 0.78 * Math.cos(a), cy + r * 0.78 * Math.sin(a));
			var w0 = a + 28 * HmiUtil.PI180;
			var w1 = a - 28 * HmiUtil.PI180;
			var base0 = new mxPoint(cx + r * 0.16 * Math.cos(w0), cy + r * 0.16 * Math.sin(w0));
			var base1 = new mxPoint(cx + r * 0.16 * Math.cos(w1), cy + r * 0.16 * Math.sin(w1));

			c.setFillColor(color);
			c.setStrokeColor(stroke);
			c.setStrokeWidth(1);
			c.begin();
			c.moveTo(base0.x, base0.y);
			c.quadTo(tip.x, tip.y, base1.x, base1.y);
			c.quadTo(cx, cy, base0.x, base0.y);
			c.close();
			c.fillAndStroke();
		}

		c.setFillColor('#cfd8dc');
		c.setStrokeColor(stroke);
		c.begin();
		c.ellipse(cx - r * 0.16, cy - r * 0.16, r * 0.32, r * 0.32);
		c.fillAndStroke();
	};

	mxCellRenderer.registerShape(mxShapeHmiFan.prototype.cst.SHAPE, mxShapeHmiFan);

	//======================================================================
	// Motor
	//======================================================================

	function mxShapeHmiMotor()
	{
		mxShapeHmiBase.apply(this, arguments);
	};

	mxUtils.extend(mxShapeHmiMotor, mxShapeHmiBase);

	mxShapeHmiMotor.prototype.cst = {SHAPE: 'mxgraph.hmi.motor'};

	mxShapeHmiMotor.prototype.customProperties = [STATE_PROP, STATES_PROP];

	mxShapeHmiMotor.prototype.paintWidget = function(c, w, h)
	{
		var color = stateColor(this.style);
		var stroke = mxUtils.getValue(this.style, mxConstants.STYLE_STROKECOLOR, '#37474f');
		var cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 2;

		c.setFillColor(color);
		c.setStrokeColor(stroke);
		c.setStrokeWidth(2.5);
		c.begin();
		c.ellipse(cx - r, cy - r, r * 2, r * 2);
		c.fillAndStroke();

		// Cooling fins on top
		c.setStrokeColor(stroke);
		c.setStrokeWidth(1.5);

		for (var i = -2; i <= 2; i++)
		{
			var fx = cx + i * r * 0.28;
			c.begin();
			c.moveTo(fx, cy - r * 0.98);
			c.lineTo(fx, cy - r * 1.2);
			c.stroke();
		}

		c.setFontColor('#ffffff');
		c.setFontStyle(mxConstants.FONT_BOLD);
		c.setFontSize(Math.max(10, r * 0.85));
		c.text(cx, cy, 0, 0, 'M', mxConstants.ALIGN_CENTER, mxConstants.ALIGN_MIDDLE, 0);

		// Shaft
		c.setStrokeColor(stroke);
		c.setStrokeWidth(3);
		c.begin();
		c.moveTo(cx + r, cy);
		c.lineTo(cx + r * 1.3, cy);
		c.stroke();
	};

	mxCellRenderer.registerShape(mxShapeHmiMotor.prototype.cst.SHAPE, mxShapeHmiMotor);

	//======================================================================
	// Agitator / mixer
	//======================================================================

	function mxShapeHmiAgitator()
	{
		mxShapeHmiBase.apply(this, arguments);
	};

	mxUtils.extend(mxShapeHmiAgitator, mxShapeHmiBase);

	mxShapeHmiAgitator.prototype.cst = {SHAPE: 'mxgraph.hmi.agitator'};

	mxShapeHmiAgitator.prototype.customProperties = [STATE_PROP, STATES_PROP];

	mxShapeHmiAgitator.prototype.paintWidget = function(c, w, h)
	{
		var color = stateColor(this.style);
		var stroke = mxUtils.getValue(this.style, mxConstants.STYLE_STROKECOLOR, '#37474f');
		var motorR = Math.min(w, h) * 0.16;
		var cx = w / 2;

		// Motor
		c.setFillColor(color);
		c.setStrokeColor(stroke);
		c.setStrokeWidth(2);
		c.begin();
		c.roundrect(cx - motorR, 0, motorR * 2, motorR * 1.4, 3, 3);
		c.fillAndStroke();

		// Shaft
		var shaftBottom = h * 0.82;
		c.setStrokeColor(stroke);
		c.setStrokeWidth(2.5);
		c.begin();
		c.moveTo(cx, motorR * 1.4);
		c.lineTo(cx, shaftBottom);
		c.stroke();

		// Paddles (two levels)
		var levels = [shaftBottom * 0.55, shaftBottom * 0.85];
		var pw = w * 0.34;

		for (var i = 0; i < levels.length; i++)
		{
			var y = levels[i];
			c.setStrokeColor(stroke);
			c.setStrokeWidth(2.5);
			c.begin();
			c.moveTo(cx - pw, y - 4);
			c.lineTo(cx + pw, y + 4);
			c.stroke();
			c.begin();
			c.moveTo(cx - pw, y + 4);
			c.lineTo(cx + pw, y - 4);
			c.stroke();
		}
	};

	mxCellRenderer.registerShape(mxShapeHmiAgitator.prototype.cst.SHAPE, mxShapeHmiAgitator);

	//======================================================================
	// Valve (gate / butterfly / ball)
	//======================================================================

	function mxShapeHmiValve()
	{
		mxShapeHmiBase.apply(this, arguments);
	};

	mxUtils.extend(mxShapeHmiValve, mxShapeHmiBase);

	mxShapeHmiValve.prototype.cst = {SHAPE: 'mxgraph.hmi.valve'};

	mxShapeHmiValve.prototype.customProperties = [
		{name: 'hmiValue', dispName: 'State (0 closed, 1 open, 2 fault, 3 transit)', type: 'string', defVal: '1'},
		STATES_PROP,
		{name: 'valveType', dispName: 'Valve Type', type: 'enum', defVal: 'gate',
			enumList: [{val: 'gate', dispName: 'Gate'}, {val: 'butterfly', dispName: 'Butterfly'}, {val: 'ball', dispName: 'Ball'}]},
		{name: 'hmiOpenFraction', dispName: 'Open Fraction (0-1, optional)', type: 'string', defVal: ''}
	];

	mxShapeHmiValve.prototype.paintWidget = function(c, w, h)
	{
		var color = stateColor(this.style);
		var stroke = mxUtils.getValue(this.style, mxConstants.STYLE_STROKECOLOR, '#37474f');
		var type = HmiUtil.str(this.style, 'valveType', 'gate');
		var openFracStr = HmiUtil.str(this.style, 'hmiOpenFraction', '');
		var rawState = String(mxUtils.getValue(this.style, 'hmiValue', '1'));
		var openFrac = (openFracStr.length > 0) ? HmiUtil.clamp(parseFloat(openFracStr), 0, 1) :
			((rawState == '1' || rawState.toLowerCase() == 'open') ? 1 : (rawState == '0' || rawState.toLowerCase() == 'closed') ? 0 : 0.5);

		var cy = h * 0.55, bodyH = h * 0.55, bodyR = Math.min(w * 0.42, bodyH * 0.55);
		var cx = w / 2;

		// Bowtie flow-path body (standard P&ID valve symbol).
		c.setFillColor('#eceff1');
		c.setStrokeColor(stroke);
		c.setStrokeWidth(2);
		c.begin();
		c.moveTo(cx - bodyR, cy - bodyR);
		c.lineTo(cx + bodyR, cy + bodyR);
		c.lineTo(cx + bodyR, cy - bodyR);
		c.lineTo(cx - bodyR, cy + bodyR);
		c.close();
		c.fillAndStroke();

		// State-coloured disc/ball/wedge in the centre.
		if (type == 'ball')
		{
			c.setFillColor(color);
			c.setStrokeColor(stroke);
			c.setStrokeWidth(1.5);
			c.begin();
			c.ellipse(cx - bodyR * 0.42, cy - bodyR * 0.42, bodyR * 0.84, bodyR * 0.84);
			c.fillAndStroke();
			c.setStrokeColor('#ffffff');
			c.setStrokeWidth(2);
			var ang = openFrac * 90 * HmiUtil.PI180;
			c.begin();
			c.moveTo(cx - bodyR * 0.35 * Math.cos(ang), cy - bodyR * 0.35 * Math.sin(ang));
			c.lineTo(cx + bodyR * 0.35 * Math.cos(ang), cy + bodyR * 0.35 * Math.sin(ang));
			c.stroke();
		}
		else if (type == 'butterfly')
		{
			c.setStrokeColor(color);
			c.setStrokeWidth(3);
			c.begin();
			c.ellipse(cx - bodyR * 0.5, cy - bodyR * 0.5, bodyR, bodyR);
			c.stroke();
			var ang2 = (0.15 + openFrac * 0.75) * Math.PI;
			var rx = bodyR * 0.48 * Math.cos(ang2);
			var ry = bodyR * 0.48;
			c.setStrokeColor(stroke);
			c.setStrokeWidth(2.5);
			c.begin();
			c.moveTo(cx - rx, cy - ry * Math.sin(ang2));
			c.lineTo(cx + rx, cy + ry * Math.sin(ang2));
			c.stroke();
		}
		else
		{
			c.setFillColor(color);
			c.setStrokeColor(stroke);
			c.setStrokeWidth(1.5);
			c.begin();
			c.ellipse(cx - bodyR * 0.34, cy - bodyR * 0.34, bodyR * 0.68, bodyR * 0.68);
			c.fillAndStroke();
		}

		// Stem + handwheel/actuator, position reflects openFrac.
		var stemTop = cy - bodyR - h * 0.18;
		c.setStrokeColor(stroke);
		c.setStrokeWidth(2.5);
		c.begin();
		c.moveTo(cx, cy - bodyR);
		c.lineTo(cx, stemTop);
		c.stroke();

		var wheelR = Math.min(w, h) * 0.14;
		c.setFillColor('#eceff1');
		c.setStrokeColor(stroke);
		c.setStrokeWidth(2);
		c.begin();
		c.ellipse(cx - wheelR, stemTop - wheelR, wheelR * 2, wheelR * 2);
		c.fillAndStroke();
		c.begin();
		c.moveTo(cx - wheelR, stemTop);
		c.lineTo(cx + wheelR, stemTop);
		c.moveTo(cx, stemTop - wheelR);
		c.lineTo(cx, stemTop + wheelR);
		c.stroke();
	};

	mxCellRenderer.registerShape(mxShapeHmiValve.prototype.cst.SHAPE, mxShapeHmiValve);

	//======================================================================
	// Conveyor
	//======================================================================

	function mxShapeHmiConveyor()
	{
		mxShapeHmiBase.apply(this, arguments);
	};

	mxUtils.extend(mxShapeHmiConveyor, mxShapeHmiBase);

	mxShapeHmiConveyor.prototype.cst = {SHAPE: 'mxgraph.hmi.conveyor'};

	mxShapeHmiConveyor.prototype.customProperties = [STATE_PROP, STATES_PROP];

	mxShapeHmiConveyor.prototype.paintWidget = function(c, w, h)
	{
		var color = stateColor(this.style);
		var stroke = mxUtils.getValue(this.style, mxConstants.STYLE_STROKECOLOR, '#37474f');
		var running = (String(mxUtils.getValue(this.style, 'hmiValue', '1')) == '1');
		var rollerR = Math.min(h * 0.32, w * 0.06);
		var beltY0 = rollerR, beltY1 = h - rollerR;
		var beltH = beltY1 - beltY0;

		// Frame
		c.setFillColor('#eceff1');
		c.setStrokeColor(stroke);
		c.setStrokeWidth(2);
		c.begin();
		c.roundrect(rollerR, beltY0, w - 2 * rollerR, beltH, 2, 2);
		c.fillAndStroke();

		// Rollers
		c.setFillColor('#cfd8dc');
		c.setStrokeColor(stroke);
		c.setStrokeWidth(1.5);
		c.begin();
		c.ellipse(0, h / 2 - rollerR, rollerR * 2, rollerR * 2);
		c.fillAndStroke();
		c.begin();
		c.ellipse(w - rollerR * 2, h / 2 - rollerR, rollerR * 2, rollerR * 2);
		c.fillAndStroke();

		// State strip along the top of the belt.
		c.setFillColor(color);
		c.begin();
		c.rect(rollerR, beltY0, w - 2 * rollerR, Math.max(2, beltH * 0.14));
		c.fill();

		// Chevrons indicating motion when running.
		if (running)
		{
			var n = Math.max(3, Math.round((w - 2 * rollerR) / (h * 0.5)));
			var step = (w - 2 * rollerR) / n;
			c.setStrokeColor(stroke);
			c.setStrokeWidth(2);

			for (var i = 0; i < n; i++)
			{
				var x = rollerR + step * (i + 0.5);
				c.begin();
				c.moveTo(x - step * 0.22, beltY0 + beltH * 0.7);
				c.lineTo(x, beltY0 + beltH * 0.4);
				c.lineTo(x + step * 0.22, beltY0 + beltH * 0.7);
				c.stroke();
			}
		}
	};

	mxCellRenderer.registerShape(mxShapeHmiConveyor.prototype.cst.SHAPE, mxShapeHmiConveyor);

	//======================================================================
	// Heat exchanger (simple shell-and-tube)
	//======================================================================

	function mxShapeHmiHeatExchanger()
	{
		mxShapeHmiBase.apply(this, arguments);
	};

	mxUtils.extend(mxShapeHmiHeatExchanger, mxShapeHmiBase);

	mxShapeHmiHeatExchanger.prototype.cst = {SHAPE: 'mxgraph.hmi.heatExchanger'};

	mxShapeHmiHeatExchanger.prototype.customProperties = [STATE_PROP, STATES_PROP];

	mxShapeHmiHeatExchanger.prototype.paintWidget = function(c, w, h)
	{
		var color = stateColor(this.style);
		var stroke = mxUtils.getValue(this.style, mxConstants.STYLE_STROKECOLOR, '#37474f');
		var capW = Math.min(w * 0.1, h * 0.3);

		c.setFillColor('#eceff1');
		c.setStrokeColor(stroke);
		c.setStrokeWidth(2);
		c.begin();
		c.moveTo(capW, 0);
		c.lineTo(w - capW, 0);
		c.arcTo(capW, h / 2, 0, 0, 1, w - capW, h);
		c.lineTo(capW, h);
		c.arcTo(capW, h / 2, 0, 0, 1, capW, 0);
		c.close();
		c.fillAndStroke();

		// State indicator band
		c.setFillColor(color);
		c.begin();
		c.rect(capW, h * 0.06, w - 2 * capW, Math.max(2, h * 0.1));
		c.fill();

		// Zig-zag tube bundle
		c.setStrokeColor(stroke);
		c.setStrokeWidth(1.5);
		var rows = 3;

		for (var r = 0; r < rows; r++)
		{
			var y = h * (0.35 + r * 0.22);
			var segs = 6;
			var segW = (w - 2 * capW) / segs;
			c.begin();
			c.moveTo(capW, y);

			for (var i = 0; i < segs; i++)
			{
				var x = capW + segW * (i + 1);
				var yy = (i % 2 == 0) ? y - h * 0.06 : y + h * 0.06;
				c.lineTo(x, i == segs - 1 ? y : yy);
			}

			c.stroke();
		}
	};

	mxCellRenderer.registerShape(mxShapeHmiHeatExchanger.prototype.cst.SHAPE, mxShapeHmiHeatExchanger);

	//======================================================================
	// Pipe fittings: tee, elbow
	//======================================================================

	function mxShapeHmiPipeTee()
	{
		mxShapeHmiBase.apply(this, arguments);
	};

	mxUtils.extend(mxShapeHmiPipeTee, mxShapeHmiBase);

	mxShapeHmiPipeTee.prototype.cst = {SHAPE: 'mxgraph.hmi.pipeTee'};

	mxShapeHmiPipeTee.prototype.customProperties = [
		{name: 'hmiPipeColor', dispName: 'Pipe Color', type: 'color', defVal: '#90a4ae'},
		{name: 'hmiPipeWidth', dispName: 'Pipe Width (fraction)', type: 'float', min: 0.1, max: 0.9, defVal: 0.4}
	];

	mxShapeHmiPipeTee.prototype.paintWidget = function(c, w, h)
	{
		var color = HmiUtil.str(this.style, 'hmiPipeColor', '#90a4ae');
		var stroke = mxUtils.getValue(this.style, mxConstants.STYLE_STROKECOLOR, '#546e7a');
		var pf = HmiUtil.clamp(HmiUtil.num(this.style, 'hmiPipeWidth', '0.4'), 0.1, 0.9);
		var pw = Math.min(w, h) * pf;

		c.setFillColor(color);
		c.setStrokeColor(stroke);
		c.setStrokeWidth(1.5);
		c.begin();
		c.rect(0, h / 2 - pw / 2, w, pw);
		c.fillAndStroke();
		c.begin();
		c.rect(w / 2 - pw / 2, 0, pw, h / 2 + pw / 2);
		c.fillAndStroke();
	};

	mxCellRenderer.registerShape(mxShapeHmiPipeTee.prototype.cst.SHAPE, mxShapeHmiPipeTee);

	function mxShapeHmiPipeElbow()
	{
		mxShapeHmiBase.apply(this, arguments);
	};

	mxUtils.extend(mxShapeHmiPipeElbow, mxShapeHmiBase);

	mxShapeHmiPipeElbow.prototype.cst = {SHAPE: 'mxgraph.hmi.pipeElbow'};

	mxShapeHmiPipeElbow.prototype.customProperties = [
		{name: 'hmiPipeColor', dispName: 'Pipe Color', type: 'color', defVal: '#90a4ae'},
		{name: 'hmiPipeWidth', dispName: 'Pipe Width (fraction)', type: 'float', min: 0.1, max: 0.9, defVal: 0.4}
	];

	mxShapeHmiPipeElbow.prototype.paintWidget = function(c, w, h)
	{
		var color = HmiUtil.str(this.style, 'hmiPipeColor', '#90a4ae');
		var stroke = mxUtils.getValue(this.style, mxConstants.STYLE_STROKECOLOR, '#546e7a');
		var pf = HmiUtil.clamp(HmiUtil.num(this.style, 'hmiPipeWidth', '0.4'), 0.1, 0.9);
		var pw = Math.min(w, h) * pf;

		c.setFillColor(color);
		c.setStrokeColor(stroke);
		c.setStrokeWidth(1.5);
		c.begin();
		c.moveTo(w / 2 - pw / 2, h);
		c.lineTo(w / 2 - pw / 2, h / 2 - pw / 2);
		c.arcTo(pw / 2, pw / 2, 0, 0, 1, w / 2 + pw / 2, h / 2 - pw / 2);
		c.lineTo(w, h / 2 - pw / 2);
		c.lineTo(w, h / 2 + pw / 2);
		c.lineTo(w / 2 + pw / 2, h / 2 + pw / 2);
		c.lineTo(w / 2 + pw / 2, h);
		c.close();
		c.fillAndStroke();
	};

	mxCellRenderer.registerShape(mxShapeHmiPipeElbow.prototype.cst.SHAPE, mxShapeHmiPipeElbow);

})();
