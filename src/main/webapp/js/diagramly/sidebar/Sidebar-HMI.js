/**
 * Copyright (c) 2025-2026, JGraph Holdings Ltd
 * Copyright (c) 2025-2026, draw.io AG
 *
 * HMI/SCADA sidebar palette. Adds mxgraph.hmi.* widget/chart/equipment
 * shapes (shapes/hmi/*.js, lazily loaded via mxStencilRegistry.libraries.hmi,
 * see js/diagramly/Editor.js) plus pipe edge presets and a generic
 * "Tank with level" cylinder entry.
 */
(function()
{
	Sidebar.prototype.addHmiPalette = function()
	{
		this.setCurrentSearchEntryLibrary('hmi', 'hmiDisplays');
		this.addHmiDisplaysPalette();
		this.setCurrentSearchEntryLibrary('hmi', 'hmiControls');
		this.addHmiControlsPalette();
		this.setCurrentSearchEntryLibrary('hmi', 'hmiCharts');
		this.addHmiChartsPalette();
		this.setCurrentSearchEntryLibrary('hmi', 'hmiEquipment');
		this.addHmiEquipmentPalette();
		this.setCurrentSearchEntryLibrary('hmi', 'hmiPipes');
		this.addHmiPipesPalette();
		this.setCurrentSearchEntryLibrary();
	};

	var dt = 'hmi scada plant process ';

	//======================================================================
	// Displays
	//======================================================================

	Sidebar.prototype.addHmiDisplaysPalette = function()
	{
		var s = 'html=1;whiteSpace=wrap;shadow=0;' + mxConstants.STYLE_SHAPE + '=mxgraph.hmi.';

		this.addPaletteFunctions('hmiDisplays', 'HMI / Displays', true,
		[
			this.createVertexTemplateEntry(s + 'numDisplay;fillColor=#ffffff;strokeColor=#90a4ae;fontColor=#263238;' +
				'hmiValue=42.5;hmiDecimals=1;hmiUnit=%C2%B0C;hmiAlign=center;', 100, 44, '', 'Numeric Display',
				null, null, dt + 'value label number readout'),
			this.createVertexTemplateEntry(s + 'numDisplay;fillColor=#0b1f14;strokeColor=#37474f;fontColor=#39ff6a;' +
				'hmiValue=1234;hmiDecimals=0;hmiUnit=;hmiLcd=1;', 100, 44, '', 'LCD Display',
				null, null, dt + 'value label number readout lcd digital'),
			this.createVertexTemplateEntry(s + 'radialGauge;fillColor=none;strokeColor=#cfd8dc;fontColor=#37474f;' +
				'hmiValue=65;hmiMin=0;hmiMax=100;hmiBands=0:60:%232ecc71,60:85:%23f1c40f,85:100:%23e74c3c;',
				140, 140, 'Pressure', 'Radial Gauge', null, null, dt + 'gauge dial meter analog round'),
			this.createVertexTemplateEntry(s + 'linearGauge;fillColor=#eceff1;strokeColor=#90a4ae;fontColor=#37474f;' +
				'hmiOrientation=vertical;hmiValue=65;hmiFillColor=%232e86de;', 44, 140, '', 'Linear Gauge (Vertical)',
				null, null, dt + 'gauge bar meter level vertical'),
			this.createVertexTemplateEntry(s + 'linearGauge;fillColor=#eceff1;strokeColor=#90a4ae;fontColor=#37474f;' +
				'hmiOrientation=horizontal;hmiValue=65;hmiFillColor=%232e86de;', 160, 44, '', 'Linear Gauge (Horizontal)',
				null, null, dt + 'gauge bar meter level horizontal'),
			this.createVertexTemplateEntry(s + 'tank;fillColor=#eceff1;strokeColor=#607d8b;fontColor=#263238;' +
				'tankType=vertical;hmiValue=60;hmiLiquidColor=%233a8ee6;', 90, 150, '', 'Tank (Vertical)',
				null, null, dt + 'tank vessel level cylinder'),
			this.createVertexTemplateEntry(s + 'tank;fillColor=#eceff1;strokeColor=#607d8b;fontColor=#263238;' +
				'tankType=horizontal;hmiValue=60;hmiLiquidColor=%233a8ee6;', 150, 90, '', 'Tank (Horizontal)',
				null, null, dt + 'tank vessel level cylinder horizontal'),
			this.createVertexTemplateEntry(s + 'tank;fillColor=#eceff1;strokeColor=#607d8b;fontColor=#263238;' +
				'tankType=sphere;hmiValue=60;hmiLiquidColor=%233a8ee6;', 130, 130, '', 'Tank (Sphere)',
				null, null, dt + 'tank vessel level sphere ball'),
			this.createVertexTemplateEntry(s + 'tank;fillColor=#eceff1;strokeColor=#607d8b;fontColor=#263238;' +
				'tankType=coneBottom;hmiValue=60;hmiLiquidColor=%233a8ee6;', 110, 150, '', 'Tank (Cone Bottom)',
				null, null, dt + 'tank vessel level cone silo hopper'),
			this.createVertexTemplateEntry(s + 'lamp;strokeColor=#263238;hmiValue=1;hmiOnColor=%232ecc71;' +
				'hmiOffColor=%23546e7a;hmiShape=round;', 34, 34, '', 'Indicator Lamp',
				null, null, dt + 'led light indicator status round'),
			this.createVertexTemplateEntry(s + 'clock;fillColor=none;strokeColor=#37474f;fontColor=#263238;' +
				'hmiFormat=HH:mm:ss;', 110, 34, '', 'Clock (Digital)',
				null, null, dt + 'clock time date'),
			this.createVertexTemplateEntry(s + 'clock;fillColor=none;strokeColor=#37474f;fontColor=#263238;' +
				'hmiAnalog=1;', 90, 90, '', 'Clock (Analog)',
				null, null, dt + 'clock time date analog'),
			this.createVertexTemplateEntry(s + 'statusIndicator;fillColor=none;strokeColor=none;fontColor=#263238;' +
				'hmiValue=connected;', 120, 26, '', 'Connection Status',
				null, null, dt + 'connection status source online offline'),
			this.createVertexTemplateEntry(s + 'alarmBanner;fillColor=#263238;strokeColor=none;', 320, 60, '',
				'Alarm Banner', null, null, dt + 'alarm banner list warning critical'),
			this.createVertexTemplateEntry('html=1;whiteSpace=wrap;shadow=0;' + mxConstants.STYLE_SHAPE + '=mxgraph.hmi.trendChart;' +
				'fillColor=#ffffff;strokeColor=#cfd8dc;fontColor=#455a64;hmiLineColor=%231976d2;',
				260, 140, 'Temperature', 'Trend Chart', null, null, dt + 'trend chart line graph history')
		]);
	};

	//======================================================================
	// Controls
	//======================================================================

	Sidebar.prototype.addHmiControlsPalette = function()
	{
		var s = 'html=1;whiteSpace=wrap;shadow=0;' + mxConstants.STYLE_SHAPE + '=mxgraph.hmi.';

		this.addPaletteFunctions('hmiControls', 'HMI / Controls', true,
		[
			this.createVertexTemplateEntry(s + 'switch;strokeColor=#37474f;hmiValue=1;hmiOnColor=%232ecc71;' +
				'hmiOffColor=%23b0bec5;', 70, 32, '', 'Toggle Switch',
				null, null, dt + 'switch toggle on off control'),
			this.createVertexTemplateEntry(s + 'button;fontColor=#ffffff;hmiMode=momentary;hmiOffColor=%233f8ae0;',
				90, 40, 'PUSH', 'Push Button (Momentary)', null, null, dt + 'button push momentary control'),
			this.createVertexTemplateEntry(s + 'button;fontColor=#ffffff;hmiMode=latched;hmiValue=1;hmiOnColor=%232ecc71;' +
				'hmiOffColor=%233f8ae0;', 90, 40, 'START', 'Push Button (Latched)', null, null,
				dt + 'button push latched control'),
			this.createVertexTemplateEntry(s + 'slider;strokeColor=none;hmiValue=50;hmiOrientation=horizontal;' +
				'hmiThumbColor=%231976d2;', 160, 40, '', 'Slider (Horizontal)', null, null,
				dt + 'slider setpoint control range'),
			this.createVertexTemplateEntry(s + 'slider;strokeColor=none;hmiValue=50;hmiOrientation=vertical;' +
				'hmiThumbColor=%231976d2;', 40, 160, '', 'Slider (Vertical)', null, null,
				dt + 'slider setpoint control range vertical'),
			this.createVertexTemplateEntry(s + 'numInput;fillColor=#ffffff;strokeColor=#1976d2;fontColor=#263238;' +
				'hmiValue=0;hmiEditable=1;', 100, 32, '', 'Numeric Input', null, null,
				dt + 'input number entry keyboard'),
			this.createVertexTemplateEntry(s + 'dropdown;fillColor=#ffffff;strokeColor=#90a4ae;fontColor=#263238;' +
				'hmiValue=1;hmiOptions=0:Off,1:Auto,2:Manual;', 120, 32, '', 'Dropdown Selector', null, null,
				dt + 'dropdown select list options mode')
		]);
	};

	//======================================================================
	// Charts
	//======================================================================

	Sidebar.prototype.addHmiChartsPalette = function()
	{
		var s = 'html=1;whiteSpace=wrap;shadow=0;' + mxConstants.STYLE_SHAPE + '=mxgraph.hmi.';

		this.addPaletteFunctions('hmiCharts', 'HMI / Charts', false,
		[
			this.createVertexTemplateEntry(s + 'trendChart;fillColor=#ffffff;strokeColor=#cfd8dc;fontColor=#455a64;' +
				'hmiLineColor=%231976d2;hmiFillArea=1;', 260, 140, 'Flow Rate', 'Trend Chart (Filled)', null, null,
				dt + 'trend chart line graph history area'),
			this.createVertexTemplateEntry(s + 'barChart;fillColor=#ffffff;strokeColor=#cfd8dc;fontColor=#455a64;' +
				'hmiBarColor=%231976d2;hmiOrientation=vertical;', 220, 140, '', 'Bar Chart', null, null,
				dt + 'bar chart graph histogram'),
			this.createVertexTemplateEntry(s + 'barChart;fillColor=#ffffff;strokeColor=#cfd8dc;fontColor=#455a64;' +
				'hmiBarColor=%231976d2;hmiOrientation=horizontal;', 220, 140, '', 'Bar Chart (Horizontal)', null, null,
				dt + 'bar chart graph histogram horizontal'),
			this.createVertexTemplateEntry(s + 'pieChart;fillColor=#ffffff;strokeColor=none;fontColor=#455a64;',
				200, 150, '', 'Pie Chart (Donut)', null, null, dt + 'pie chart donut graph proportion'),
			this.createVertexTemplateEntry(s + 'pieChart;fillColor=#ffffff;strokeColor=none;fontColor=#455a64;hmiDonut=0;',
				200, 150, '', 'Pie Chart', null, null, dt + 'pie chart graph proportion')
		]);
	};

	//======================================================================
	// Equipment
	//======================================================================

	Sidebar.prototype.addHmiEquipmentPalette = function()
	{
		var s = 'html=1;whiteSpace=wrap;shadow=0;' + mxConstants.STYLE_SHAPE + '=mxgraph.hmi.';

		this.addPaletteFunctions('hmiEquipment', 'HMI / Equipment', false,
		[
			this.createVertexTemplateEntry(s + 'pump;strokeColor=#37474f;hmiValue=1;', 90, 70, '', 'Pump (Running)',
				null, null, dt + 'pump centrifugal equipment motor'),
			this.createVertexTemplateEntry(s + 'pump;strokeColor=#37474f;hmiValue=0;', 90, 70, '', 'Pump (Stopped)',
				null, null, dt + 'pump centrifugal equipment motor stopped'),
			this.createVertexTemplateEntry(s + 'fan;strokeColor=#37474f;hmiValue=1;', 80, 80, '', 'Fan',
				null, null, dt + 'fan blower equipment ventilation'),
			this.createVertexTemplateEntry(s + 'motor;strokeColor=#37474f;hmiValue=1;', 70, 70, '', 'Motor',
				null, null, dt + 'motor equipment drive'),
			this.createVertexTemplateEntry(s + 'agitator;strokeColor=#37474f;hmiValue=1;', 60, 130, '', 'Agitator / Mixer',
				null, null, dt + 'agitator mixer stirrer equipment'),
			this.createVertexTemplateEntry(s + 'valve;strokeColor=#37474f;hmiValue=1;valveType=gate;', 60, 90, '',
				'Gate Valve (Open)', null, null, dt + 'valve gate open close piping'),
			this.createVertexTemplateEntry(s + 'valve;strokeColor=#37474f;hmiValue=0;valveType=gate;', 60, 90, '',
				'Gate Valve (Closed)', null, null, dt + 'valve gate open close piping'),
			this.createVertexTemplateEntry(s + 'valve;strokeColor=#37474f;hmiValue=1;valveType=butterfly;', 60, 90, '',
				'Butterfly Valve', null, null, dt + 'valve butterfly piping'),
			this.createVertexTemplateEntry(s + 'valve;strokeColor=#37474f;hmiValue=1;valveType=ball;', 60, 90, '',
				'Ball Valve', null, null, dt + 'valve ball piping'),
			this.createVertexTemplateEntry(s + 'conveyor;strokeColor=#37474f;hmiValue=1;', 160, 40, '', 'Conveyor (Running)',
				null, null, dt + 'conveyor belt equipment material handling'),
			this.createVertexTemplateEntry(s + 'conveyor;strokeColor=#37474f;hmiValue=0;', 160, 40, '', 'Conveyor (Stopped)',
				null, null, dt + 'conveyor belt equipment material handling stopped'),
			this.createVertexTemplateEntry(s + 'heatExchanger;strokeColor=#37474f;hmiValue=1;', 140, 60, '',
				'Heat Exchanger', null, null, dt + 'heat exchanger shell tube equipment'),
			this.createVertexTemplateEntry(s + 'pipeTee;strokeColor=#546e7a;', 40, 40, '', 'Pipe Tee',
				null, null, dt + 'pipe tee fitting junction'),
			this.createVertexTemplateEntry(s + 'pipeElbow;strokeColor=#546e7a;', 40, 40, '', 'Pipe Elbow',
				null, null, dt + 'pipe elbow fitting bend')
		]);
	};

	//======================================================================
	// Pipes (edges)
	//======================================================================

	Sidebar.prototype.addHmiPipesPalette = function()
	{
		this.addPaletteFunctions('hmiPipes', 'HMI / Pipes', false,
		[
			this.createEdgeTemplateEntry('endArrow=none;html=1;strokeWidth=8;strokeColor=#90a4ae;rounded=0;', 100, 0,
				'', 'Pipe', null, dt + 'pipe line edge plain'),
			this.createEdgeTemplateEntry('endArrow=none;html=1;strokeWidth=8;strokeColor=#5b9bd5;rounded=0;' +
				'flowAnimation=1;flowAnimationType=dash;', 100, 0, '', 'Pipe (Flowing, Dashes)', null,
				dt + 'pipe line edge flow animation dash'),
			this.createEdgeTemplateEntry('endArrow=none;html=1;strokeWidth=8;strokeColor=#5b9bd5;rounded=0;' +
				'flowAnimation=1;flowAnimationType=dots;', 100, 0, '', 'Pipe (Flowing, Dots)', null,
				dt + 'pipe line edge flow animation dots'),
			this.createEdgeTemplateEntry('endArrow=block;html=1;strokeWidth=8;strokeColor=#5b9bd5;rounded=0;' +
				'flowAnimation=1;flowAnimationType=arrows;startArrow=none;', 100, 0, '', 'Pipe (Flowing, Arrows)', null,
				dt + 'pipe line edge flow animation arrows'),
			this.createEdgeTemplateEntry('endArrow=none;html=1;strokeWidth=10;strokeColor=#3a8ee6;rounded=0;' +
				'flowAnimation=1;flowAnimationType=liquid;', 100, 0, '', 'Pipe (Flowing, Liquid)', null,
				dt + 'pipe line edge flow animation liquid'),
			this.createEdgeTemplateEntry('endArrow=none;html=1;shape=pipe;strokeWidth=14;strokeColor=#90a4ae;' +
				'fillColor=#cfd8dc;rounded=0;', 100, 0, '', 'Pipe (3D)', null, dt + 'pipe line edge 3d shaded'),
			this.createEdgeTemplateEntry('endArrow=none;html=1;strokeWidth=8;strokeColor=#5b9bd5;rounded=0;' +
				'flowAnimation=1;flowAnimationType=dash;flowAnimationReverse=1;', 100, 0, '', 'Pipe (Flowing, Reverse)',
				null, dt + 'pipe line edge flow animation reverse'),
			this.createVertexTemplateEntry('shape=cylinder3;html=1;whiteSpace=wrap;boundedLbl=1;backgroundOutline=1;' +
				'size=15;fillColor=#eceff1;strokeColor=#607d8b;hmiLevel=60;hmiLevelMin=0;hmiLevelMax=100;' +
				'hmiLevelColor=#3a8ee6;', 90, 150, 'Tank', 'Tank with Level (generic)', null, null,
				dt + 'tank vessel level cylinder generic core shape')
		]);
	};

})();
