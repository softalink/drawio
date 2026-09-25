/**
 * Runtime animations (SRS §3.8). Presets use CSS animations on the cell's
 * SVG nodes (no per-frame JS). Keyframe animations and colorCycle are
 * interpolated per frame into the overlay 'anim' layer.
 *
 * Keyframe interpolation follows meta2d.js setNodeAnimateProcess (MIT, le5le).
 */
(function()
{
	var root = (typeof globalThis !== 'undefined') ? globalThis : window;
	var Hmi = root.Hmi = root.Hmi || {};

	var LAYER = 'anim';
	var cssInstalled = false;

	var EASING = {
		'linear': function(t)
		{
			return t;
		},
		'ease-in': function(t)
		{
			return t * t;
		},
		'ease-out': function(t)
		{
			return t * (2 - t);
		},
		'ease-in-out': function(t)
		{
			return (t < 0.5) ? 2 * t * t : -1 + (4 - 2 * t) * t;
		}
	};

	/**
	 * Preset definitions: css (keyframes name + default duration) or js.
	 */
	var PRESETS = {
		blink: {css: 'hmi-blink', duration: 1000, timing: 'steps(1, end)'},
		pulse: {css: 'hmi-pulse', duration: 1000, timing: 'ease-in-out', origin: true},
		spin: {css: 'hmi-spin', duration: 2000, timing: 'linear', origin: true},
		shake: {css: 'hmi-shake', duration: 400, timing: 'linear'},
		fadeInOut: {css: 'hmi-fade', duration: 2000, timing: 'ease-in-out'},
		colorCycle: {js: true, duration: 3000}
	};

	function installCss()
	{
		if (!cssInstalled && typeof document !== 'undefined')
		{
			cssInstalled = true;
			var style = document.createElement('style');
			style.setAttribute('data-hmi', 'animations');
			style.innerHTML = '@keyframes hmi-blink { 0% { opacity: 1; } 50% { opacity: 0.1; } }\n' +
				'@keyframes hmi-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.08); } }\n' +
				'@keyframes hmi-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }\n' +
				'@keyframes hmi-shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-3px); } ' +
				'75% { transform: translateX(3px); } }\n' +
				'@keyframes hmi-fade { 0%, 100% { opacity: 1; } 50% { opacity: 0.2; } }\n' +
				'.geHmiReducedMotion { outline: 3px solid #FF6F00; }';
			document.getElementsByTagName('head')[0].appendChild(style);
		}
	};

	function Animator(rt)
	{
		this.rt = rt;
		this.instances = {};
		this.paused = false;
		this.reducedMotion = false;

		try
		{
			this.reducedMotion = root.matchMedia != null &&
				root.matchMedia('(prefers-reduced-motion: reduce)').matches;
		}
		catch (e)
		{
			// ignore
		}

		installCss();

		var self = this;
		rt.overlay.afterRedraw = function(state)
		{
			self.reapplyCss(state.cell.id);
		};
	};

	Animator.PRESETS = PRESETS;

	function key(cellId, name)
	{
		return cellId + '\u0000' + (name || '');
	};

	/**
	 * Returns the animation definition for the cell.
	 */
	Animator.prototype.getDefinition = function(cellId, name)
	{
		var cfg = (this.rt.index != null) ? this.rt.index.cells[cellId] : null;

		if (cfg != null)
		{
			for (var i = 0; i < cfg.animations.length; i++)
			{
				var anim = cfg.animations[i];

				if (name == null || anim.name == name)
				{
					return anim;
				}
			}
		}

		// Ad-hoc preset by name (e.g. startAnimation with name 'blink')
		if (name != null && PRESETS[name] != null)
		{
			return {name: name, preset: name, params: {}};
		}

		return null;
	};

	/**
	 * Starts all autoPlay animations of the page.
	 */
	Animator.prototype.autoPlay = function()
	{
		if (this.rt.index == null)
		{
			return;
		}

		for (var id in this.rt.index.cells)
		{
			var list = this.rt.index.cells[id].animations;

			for (var i = 0; i < list.length; i++)
			{
				if (list[i].autoPlay)
				{
					this.start(id, list[i].name);
				}
			}
		}
	};

	Animator.prototype.start = function(cellId, name)
	{
		var def = this.getDefinition(cellId, name);

		if (def == null)
		{
			this.rt.log('warn', 'animation', 'Animation ' + (name || '') +
				' not found on ' + cellId);

			return;
		}

		var k = key(cellId, def.name);
		var inst = this.instances[k];

		if (inst != null)
		{
			// Resumes a paused instance
			if (inst.pausedAt != null)
			{
				inst.start += Date.now() - inst.pausedAt;
				inst.pausedAt = null;
				this.applyCss(inst);
			}

			return;
		}

		inst = {cellId: cellId, def: def, start: Date.now(), cycle: 0,
			preset: (def.preset != null) ? PRESETS[def.preset] : null};
		this.instances[k] = inst;

		if (inst.preset != null && inst.preset.css != null)
		{
			this.applyCss(inst);
		}
		else if (def.frames != null && def.frames.length > 0 || (inst.preset != null && inst.preset.js))
		{
			inst.base = this.getBaseStyle(cellId);
			inst.js = true;
		}

		this.rt.requestFlush();
	};

	Animator.prototype.pause = function(cellId, name)
	{
		var def = this.getDefinition(cellId, name);
		var inst = (def != null) ? this.instances[key(cellId, def.name)] : null;

		if (inst != null && inst.pausedAt == null)
		{
			inst.pausedAt = Date.now();
			this.applyCss(inst);
		}
	};

	Animator.prototype.stop = function(cellId, name)
	{
		var def = this.getDefinition(cellId, name);
		var inst = (def != null) ? this.instances[key(cellId, def.name)] : null;

		if (inst != null)
		{
			this.finish(inst, false);
		}
	};

	Animator.prototype.stopAll = function()
	{
		for (var k in this.instances)
		{
			this.finish(this.instances[k], false);
		}

		this.instances = {};
	};

	/**
	 * Ends an instance. completed is true when cycles ran out.
	 */
	Animator.prototype.finish = function(inst, completed)
	{
		delete this.instances[key(inst.cellId, inst.def.name)];
		this.removeCss(inst);

		if (inst.js && !(completed && inst.def.keepState))
		{
			this.rt.overlay.clearLayer(LAYER, inst.cellId);
		}

		this.rt.requestFlush();

		if (completed)
		{
			var cell = this.rt.getCell(inst.cellId);

			if (cell != null && this.rt.events != null)
			{
				this.rt.events.fire(cell, 'animationEnd', {name: inst.def.name});
			}

			var next = inst.def.next;

			if (next != null)
			{
				var targets = this.rt.resolveTargets(next.target || 'self', cell);

				for (var i = 0; i < targets.length; i++)
				{
					this.start(targets[i].id, next.name);
				}
			}
		}
	};

	Animator.prototype.isAnimating = function()
	{
		if (this.paused)
		{
			return false;
		}

		for (var k in this.instances)
		{
			if (this.instances[k].js && this.instances[k].pausedAt == null)
			{
				return true;
			}
		}

		return false;
	};

	Animator.prototype.setPaused = function(paused)
	{
		if (this.paused != paused)
		{
			var now = Date.now();
			this.paused = paused;

			for (var k in this.instances)
			{
				var inst = this.instances[k];

				if (paused)
				{
					inst.hiddenAt = now;
				}
				else if (inst.hiddenAt != null)
				{
					inst.start += now - inst.hiddenAt;
					inst.hiddenAt = null;
				}

				this.applyCss(inst);
			}

			if (!paused)
			{
				this.rt.requestFlush();
			}
		}
	};

	/**
	 * Returns the design-time style of the cell without animation values.
	 */
	Animator.prototype.getBaseStyle = function(cellId)
	{
		var cell = this.rt.getCell(cellId);
		var state = (cell != null) ? this.rt.graph.view.getState(cell) : null;

		return (state != null && state.style != null) ? mxUtils.clone(state.style) : {};
	};

	/**
	 * Returns the SVG nodes of the cell.
	 */
	Animator.prototype.getNodes = function(cellId)
	{
		var cell = this.rt.getCell(cellId);
		var state = (cell != null) ? this.rt.graph.view.getState(cell) : null;
		var nodes = [];

		if (state != null)
		{
			if (state.shape != null && state.shape.node != null)
			{
				nodes.push(state.shape.node);
			}

			if (state.text != null && state.text.node != null)
			{
				nodes.push(state.text.node);
			}
		}

		return {state: state, nodes: nodes};
	};

	/**
	 * Returns the preset duration, honoring rpm for spin.
	 */
	Animator.prototype.getPresetDuration = function(inst)
	{
		var params = inst.def.params || {};

		if (inst.def.preset == 'spin')
		{
			var rpm = params.rpm;

			if (params.rpmTag != null && this.rt.tags != null)
			{
				rpm = parseFloat(this.rt.tags.getValue(params.rpmTag));
			}

			if (rpm != null && !isNaN(rpm))
			{
				return (Math.abs(rpm) > 0.01) ? Math.round(60000 / Math.abs(rpm)) : 0;
			}
		}

		if (params.rate != null && params.rate > 0)
		{
			return Math.round(1000 / params.rate);
		}

		return inst.def.duration || inst.preset.duration;
	};

	Animator.prototype.applyCss = function(inst)
	{
		if (inst.preset == null || inst.preset.css == null)
		{
			return;
		}

		var info = this.getNodes(inst.cellId);
		var duration = this.getPresetDuration(inst);
		var cycles = (inst.def.cycles > 0) ? inst.def.cycles : 'infinite';
		var paused = this.paused || inst.pausedAt != null || duration == 0;

		if (this.reducedMotion && inst.def.preset != 'spin')
		{
			for (var i = 0; i < info.nodes.length; i++)
			{
				info.nodes[i].classList.add('geHmiReducedMotion');
			}

			return;
		}

		var params = inst.def.params || {};
		var reverse = inst.def.preset == 'spin' && (params.reverse ||
			(params.rpm != null && params.rpm < 0));

		for (var i = 0; i < info.nodes.length; i++)
		{
			var node = info.nodes[i];

			// Only the shape spins, labels stay readable
			if (inst.preset.origin && i > 0)
			{
				continue;
			}

			node.style.animation = inst.preset.css + ' ' + Math.max(1, duration) + 'ms ' +
				inst.preset.timing + ' ' + cycles + (reverse ? ' reverse' : '');
			node.style.animationPlayState = paused ? 'paused' : 'running';

			if (inst.preset.origin && info.state != null)
			{
				node.style.transformOrigin = info.state.getCenterX() + 'px ' +
					info.state.getCenterY() + 'px';
				node.style.transformBox = 'view-box';
			}
		}

		inst.cssDuration = duration;

		// Ends finite CSS animations
		if (cycles != 'infinite' && inst.endTimer == null)
		{
			var self = this;
			inst.endTimer = setTimeout(function()
			{
				inst.endTimer = null;

				if (self.instances[key(inst.cellId, inst.def.name)] == inst)
				{
					self.finish(inst, true);
				}
			}, duration * cycles);
		}
	};

	Animator.prototype.removeCss = function(inst)
	{
		if (inst.endTimer != null)
		{
			clearTimeout(inst.endTimer);
			inst.endTimer = null;
		}

		if (inst.preset != null && inst.preset.css != null)
		{
			var info = this.getNodes(inst.cellId);

			for (var i = 0; i < info.nodes.length; i++)
			{
				info.nodes[i].style.animation = '';
				info.nodes[i].style.transformOrigin = '';
				info.nodes[i].classList.remove('geHmiReducedMotion');
			}
		}
	};

	/**
	 * Re-applies CSS animations after a cell was redrawn or the view changed.
	 */
	Animator.prototype.reapplyCss = function(cellId)
	{
		for (var k in this.instances)
		{
			var inst = this.instances[k];

			if ((cellId == null || inst.cellId == cellId) && inst.preset != null &&
				inst.preset.css != null)
			{
				this.applyCss(inst);
			}
		}
	};

	/**
	 * Updates rpm-bound spin speeds for changed tags.
	 */
	Animator.prototype.tagsChanged = function(names)
	{
		var changed = {};

		for (var i = 0; i < names.length; i++)
		{
			changed[names[i]] = true;
		}

		for (var k in this.instances)
		{
			var inst = this.instances[k];
			var params = inst.def.params;

			if (params != null && params.rpmTag != null && changed[params.rpmTag] &&
				this.getPresetDuration(inst) != inst.cssDuration)
			{
				this.applyCss(inst);
			}
		}
	};

	function parseColor(color)
	{
		if (color == null || color == 'none')
		{
			return null;
		}

		var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(color).trim());

		if (m != null)
		{
			var hex = m[1];

			if (hex.length == 3)
			{
				hex = hex.charAt(0) + hex.charAt(0) + hex.charAt(1) + hex.charAt(1) +
					hex.charAt(2) + hex.charAt(2);
			}

			return [parseInt(hex.substring(0, 2), 16), parseInt(hex.substring(2, 4), 16),
				parseInt(hex.substring(4, 6), 16)];
		}

		return null;
	};

	function toHex(rgb)
	{
		var result = '#';

		for (var i = 0; i < 3; i++)
		{
			var v = Math.max(0, Math.min(255, Math.round(rgb[i]))).toString(16);
			result += (v.length < 2) ? '0' + v : v;
		}

		return result.toUpperCase();
	};

	/**
	 * Interpolates two property values.
	 */
	Animator.interpolate = function(from, to, t, key)
	{
		if (key == 'visible')
		{
			return (t < 1) ? from : to;
		}

		var a = parseColor(from);
		var b = parseColor(to);

		if (a != null && b != null)
		{
			return toHex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t,
				a[2] + (b[2] - a[2]) * t]);
		}

		var na = parseFloat(from);
		var nb = parseFloat(to);

		if (!isNaN(na) && !isNaN(nb))
		{
			return na + (nb - na) * t;
		}

		return (t < 1) ? from : to;
	};

	var DEFAULTS = {rotation: 0, opacity: 100, dx: 0, dy: 0, scale: 1};

	/**
	 * Returns the start value of an animated property.
	 */
	Animator.prototype.getBaseValue = function(inst, prop)
	{
		if (DEFAULTS[prop] != null)
		{
			return (inst.base[prop] != null && prop != 'dx' && prop != 'dy' &&
				prop != 'scale') ? inst.base[prop] : DEFAULTS[prop];
		}

		if (prop == 'visible')
		{
			return true;
		}

		return inst.base[prop];
	};

	/**
	 * Advances JS-driven animations.
	 */
	Animator.prototype.step = function(now)
	{
		if (this.paused)
		{
			return;
		}

		for (var k in this.instances)
		{
			var inst = this.instances[k];

			if (inst.js && inst.pausedAt == null)
			{
				try
				{
					this.stepInstance(inst, now);
				}
				catch (e)
				{
					this.rt.log('error', 'animation', 'Animation ' + inst.def.name +
						' failed: ' + e.message);
					this.finish(inst, false);
				}
			}
		}
	};

	Animator.prototype.getFrames = function(inst)
	{
		if (inst.frames == null)
		{
			var def = inst.def;

			if (def.preset == 'colorCycle')
			{
				var colors = (def.params != null && def.params.colors != null) ?
					def.params.colors : ['#E53935', '#FDD835', '#43A047'];
				var d = (def.duration || 3000) / colors.length;
				inst.frames = [];

				for (var i = 0; i < colors.length; i++)
				{
					inst.frames.push({duration: d, props: {fillColor: colors[i]}});
				}

				inst.frames.push({duration: d, props: {fillColor: colors[0]}});
			}
			else
			{
				inst.frames = def.frames || [];
			}
		}

		return inst.frames;
	};

	Animator.prototype.stepInstance = function(inst, now)
	{
		var frames = this.getFrames(inst);
		var total = 0;

		for (var i = 0; i < frames.length; i++)
		{
			total += Math.max(1, frames[i].duration || 0);
		}

		if (total == 0)
		{
			return;
		}

		var elapsed = now - inst.start;
		var cycles = inst.def.cycles || 0;
		var cycle = Math.floor(elapsed / total);

		if (cycles > 0 && cycle >= cycles)
		{
			this.applyProps(inst, frames[frames.length - 1].props, frames, frames.length - 1, 1);
			this.finish(inst, true);

			return;
		}

		var t = elapsed - cycle * total;
		var acc = 0;
		var index = 0;

		for (index = 0; index < frames.length; index++)
		{
			var d = Math.max(1, frames[index].duration || 0);

			if (t < acc + d)
			{
				break;
			}

			acc += d;
		}

		index = Math.min(index, frames.length - 1);
		var progress = (t - acc) / Math.max(1, frames[index].duration || 0);
		var ease = EASING[inst.def.easing || 'linear'] || EASING['linear'];
		this.applyProps(inst, frames[index].props, frames, index, ease(Math.min(1, progress)));
	};

	/**
	 * Writes interpolated props for frame index at progress t.
	 */
	Animator.prototype.applyProps = function(inst, props, frames, index, t)
	{
		var overlay = this.rt.overlay;
		var id = inst.cellId;
		var prev = (index > 0) ? frames[index - 1].props : null;
		var geo = null;

		for (var prop in props)
		{
			var from = (prev != null && prev[prop] != null) ? prev[prop] :
				this.getBaseValue(inst, prop);
			var value = Animator.interpolate(from, props[prop], t, prop);

			if (prop == 'dx' || prop == 'dy')
			{
				geo = geo || {dx: 0, dy: 0, dw: 0, dh: 0};
				geo[prop] = value;
			}
			else if (prop == 'scale')
			{
				var cell = this.rt.getCell(id);
				var g = (cell != null) ? this.rt.graph.getCellGeometry(cell) : null;

				if (g != null)
				{
					geo = geo || {dx: 0, dy: 0, dw: 0, dh: 0};
					geo.dw = g.width * (value - 1);
					geo.dh = g.height * (value - 1);
					geo.dx -= geo.dw / 2;
					geo.dy -= geo.dh / 2;
				}
			}
			else if (prop == 'visible')
			{
				overlay.setVisible(id, Hmi.BindingEngine.toBool(value), LAYER);
			}
			else
			{
				overlay.setStyle(id, prop, (typeof value === 'number') ?
					Math.round(value * 100) / 100 : value, LAYER);
			}
		}

		if (geo != null)
		{
			overlay.setGeo(id, geo, LAYER);
		}
	};

	Hmi.Animator = Animator;
})();
