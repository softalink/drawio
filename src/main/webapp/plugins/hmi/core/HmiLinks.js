/**
 * Hmi.Links: pure, DOM-free evaluation of InTouch animation links
 * (INTOUCH_LINKS.md §4). The runtime turns the results into overlay
 * changes. Functions return null for invalid or unknown values so that the
 * runtime keeps the design state.
 */
(function()
{
	var Hmi = (typeof globalThis !== 'undefined' ? globalThis : window).Hmi =
		(typeof globalThis !== 'undefined' ? globalThis : window).Hmi || {};

	// ---------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------

	/**
	 * Discrete truthiness: false for 0, false, '', 'false', 'off', 'no',
	 * '0' (case-insensitive), null/undefined and NaN; true otherwise.
	 */
	function isTrue(v)
	{
		if (v == null || v === false || v === 0 || v === '')
		{
			return false;
		}

		if (typeof v === 'number')
		{
			return !isNaN(v);
		}

		if (typeof v === 'string')
		{
			var s = v.toLowerCase();

			return !(s === 'false' || s === 'off' || s === 'no' || s === '0');
		}

		return true;
	};

	/**
	 * Converts a value to a finite number, or NaN.
	 */
	function toNum(v)
	{
		if (typeof v === 'boolean')
		{
			return v ? 1 : 0;
		}

		if (v == null || v === '' || (typeof v !== 'number' && typeof v !== 'string'))
		{
			return NaN;
		}

		var n = Number(v);

		return isFinite(n) ? n : NaN;
	};

	/**
	 * Returns the number n or the default when n is not a finite number.
	 */
	function num(n, def)
	{
		var x = toNum(n);

		return isNaN(x) ? def : x;
	};

	/**
	 * Avoids -0 in results.
	 */
	function norm(x)
	{
		return x + 0;
	};

	/**
	 * Linear map of v from [v0, v1] to [o0, o1], clamped to the output
	 * interval (whatever its order). v0 == v1 returns o0.
	 */
	function lerp(v, v0, v1, o0, o1)
	{
		if (v0 === v1)
		{
			return o0;
		}

		var r = o0 + (v - v0) / (v1 - v0) * (o1 - o0);
		var lo = Math.min(o0, o1);
		var hi = Math.max(o0, o1);

		return Math.min(hi, Math.max(lo, r));
	};

	/**
	 * Numeric value of an expression result, or null.
	 */
	function numberOrNull(v)
	{
		var n = toNum(v);

		return isNaN(n) ? null : n;
	};

	// ---------------------------------------------------------------
	// Location, orientation, size, fill
	// ---------------------------------------------------------------

	function locationH(link, v)
	{
		var n = numberOrNull(v);

		if (link == null || n == null)
		{
			return null;
		}

		var toLeft = num(link.toLeft, 0);
		var toRight = num(link.toRight, 100);

		return { dx: norm(lerp(n, num(link.atLeft, 0), num(link.atRight, 100), -toLeft, toRight)) };
	};

	function locationV(link, v)
	{
		var n = numberOrNull(v);

		if (link == null || n == null)
		{
			return null;
		}

		var up = num(link.up, 100);
		var down = num(link.down, 0);

		return { dy: norm(lerp(n, num(link.atBottom, 0), num(link.atTop, 100), down, -up)) };
	};

	/**
	 * Rotation about the point (offsetX, offsetY) relative to the cell
	 * centre. draw.io rotates the cell about its own centre, so the cell is
	 * moved by d = P - R(P) (R: clockwise rotation in screen coordinates,
	 * y down), which is R(-P) + P.
	 */
	function orientation(link, v, w, h)
	{
		var n = numberOrNull(v);

		if (link == null || n == null)
		{
			return null;
		}

		var angle = lerp(n, num(link.valueAtMaxCCW, 0), num(link.valueAtMaxCW, 100),
			-num(link.ccwRotation, 0), num(link.cwRotation, 360));
		var px = num(link.offsetX, 0);
		var py = num(link.offsetY, 0);
		var rad = angle * Math.PI / 180;
		var cos = Math.cos(rad);
		var sin = Math.sin(rad);

		// R(P) with R = [[cos, -sin], [sin, cos]] (clockwise on screen)
		var rx = px * cos - py * sin;
		var ry = px * sin + py * cos;

		return { rotation: norm(angle), dx: norm(px - rx), dy: norm(py - ry) };
	};

	/**
	 * Fraction (0 = left or top, 1 = right or bottom) of a size of the
	 * point that stays in place: an anchor name, or 'offset' with a pixel
	 * offset from the centre (as the rotation point of Orientation).
	 */
	function anchorFraction(anchor, offset, size)
	{
		if (anchor === 'offset')
		{
			return (size > 0) ? 0.5 + num(offset, 0) / size : 0.5;
		}

		if (anchor === 'middle' || anchor === 'center')
		{
			return 0.5;
		}

		return (anchor === 'bottom' || anchor === 'right') ? 1 : 0;
	};

	function sizePercent(link, n)
	{
		return lerp(n, num(link.valueAtMin, 0), num(link.valueAtMax, 100),
			num(link.minPercent, 0), num(link.maxPercent, 100));
	};

	/**
	 * Returns {dw, dx} (isWidth) or {dh, dy}. The anchor (or the point at
	 * offsetX / offsetY from the centre with anchor 'offset') stays in place.
	 */
	function size(link, v, isWidth, w, h)
	{
		var n = numberOrNull(v);

		if (link == null || n == null)
		{
			return null;
		}

		var pct = sizePercent(link, n);
		var base = isWidth ? num(w, 0) : num(h, 0);
		var delta = base * pct / 100 - base;
		var anchor = link.anchor || (isWidth ? 'left' : 'bottom');
		var shift = -delta * anchorFraction(anchor, isWidth ? link.offsetX : link.offsetY, base);

		return isWidth ? { dw: norm(delta), dx: norm(shift) } : { dh: norm(delta), dy: norm(shift) };
	};

	/**
	 * Scale link: changes width and height by the same percentage. Returns
	 * {dw, dh, dx, dy}. The anchor is one of center (default), top, bottom,
	 * left, right, topLeft, topRight, bottomLeft, bottomRight or offset
	 * (offsetX / offsetY in pixels from the centre).
	 */
	var SCALE_ANCHORS = {
		center: [0.5, 0.5], top: [0.5, 0], bottom: [0.5, 1], left: [0, 0.5], right: [1, 0.5],
		topLeft: [0, 0], topRight: [1, 0], bottomLeft: [0, 1], bottomRight: [1, 1]
	};

	function scale(link, v, w, h)
	{
		var n = numberOrNull(v);

		if (link == null || n == null)
		{
			return null;
		}

		var k = sizePercent(link, n) / 100;
		var bw = num(w, 0);
		var bh = num(h, 0);
		var dw = bw * k - bw;
		var dh = bh * k - bh;
		var anchor = link.anchor || 'center';
		var f = (anchor === 'offset') ? [anchorFraction('offset', link.offsetX, bw),
			anchorFraction('offset', link.offsetY, bh)] : (SCALE_ANCHORS[anchor] || SCALE_ANCHORS.center);

		return { dw: norm(dw), dh: norm(dh), dx: norm(-dw * f[0]), dy: norm(-dh * f[1]) };
	};

	/**
	 * Percent fill; the optional third argument selects the horizontal
	 * default direction ('right') for fillHorizontal links without one.
	 */
	function fill(link, v, horizontal)
	{
		var n = numberOrNull(v);

		if (link == null || n == null)
		{
			return null;
		}

		var pct = lerp(n, num(link.valueAtMin, 0), num(link.valueAtMax, 100),
			num(link.minPercent, 0), num(link.maxPercent, 100));

		return {
			percent: norm(Math.min(100, Math.max(0, pct))),
			direction: link.direction || (horizontal ? 'right' : 'up')
		};
	};

	// ---------------------------------------------------------------
	// Colours
	// ---------------------------------------------------------------

	function colorOrNull(c)
	{
		return (c == null) ? null : c;
	};

	function color(link, v, alarm, ageMs)
	{
		if (link == null)
		{
			return null;
		}

		var kind = link.kind;
		var c;

		if (isStale(link, ageMs) && link.staleColor != null && link.staleColor !== '')
		{
			return link.staleColor;
		}

		if (kind === 'discrete')
		{
			if (v == null)
			{
				return null;
			}

			return colorOrNull(isTrue(v) ? link.onColor : link.offColor);
		}

		if (kind === 'analog')
		{
			var n = numberOrNull(v);
			var bps = link.breakpoints;

			if (n == null || !(bps instanceof Array) || bps.length === 0)
			{
				return null;
			}

			var sorted = bps.slice().sort(function(a, b)
			{
				return num(a.value, 0) - num(b.value, 0);
			});

			c = sorted[0].color;

			for (var i = 0; i < sorted.length; i++)
			{
				if (num(sorted[i].value, 0) <= n)
				{
					c = sorted[i].color;

					// Blend: mixes towards the next breakpoint's colour
					if (link.blend === true && i + 1 < sorted.length &&
						num(sorted[i + 1].value, 0) > n)
					{
						var v0 = num(sorted[i].value, 0);
						var v1 = num(sorted[i + 1].value, 0);
						var mixed = mixColor(c, sorted[i + 1].color, (n - v0) / (v1 - v0));

						if (mixed != null)
						{
							c = mixed;
						}
					}
				}
				else
				{
					break;
				}
			}

			return colorOrNull(c);
		}

		if (kind === 'discreteAlarm')
		{
			return colorOrNull((alarm != null && alarm.active) ? link.alarmColor : link.normalColor);
		}

		if (kind === 'analogAlarm')
		{
			var colors = link.colors || {};
			var type = link.alarmType || 'value';
			var level = (alarm != null && alarm.active) ? alarm.level : null;
			var allowed = { value: ['lolo', 'lo', 'hi', 'hihi'], deviation: ['minor', 'major'], roc: ['roc'] };
			var list = allowed[type] || [];

			if (level != null && list.indexOf(level) >= 0 && colors[level] != null)
			{
				return colors[level];
			}

			return colorOrNull(colors.normal);
		}

		return null;
	};

	// ---------------------------------------------------------------
	// Visibility, disable, value text
	// ---------------------------------------------------------------

	function visible(link, v)
	{
		if (link == null || v == null)
		{
			return null;
		}

		var t = isTrue(v);

		return (link.visibleState === 'off') ? !t : t;
	};

	function disabled(link, v)
	{
		if (link == null || v == null)
		{
			return null;
		}

		var t = isTrue(v);

		return (link.disabledState === 'off') ? !t : t;
	};

	function valueText(linkType, link, v, fieldText)
	{
		if (link == null || v == null)
		{
			return null;
		}

		if (linkType === 'valueDiscrete')
		{
			if (isTrue(v))
			{
				return (link.onMessage != null) ? String(link.onMessage) : 'On';
			}

			return (link.offMessage != null) ? String(link.offMessage) : 'Off';
		}

		if (linkType === 'valueAnalog' && Hmi.Format != null && typeof Hmi.Format.advanced === 'function')
		{
			return Hmi.Format.advanced(v, link.format, fieldText);
		}

		return String(v);
	};

	// ---------------------------------------------------------------
	// Touch helpers
	// ---------------------------------------------------------------

	/**
	 * Inverse of the location mapping. `offsetPx` is the displacement from
	 * the design position (the dx / dy that locationH / locationV return).
	 */
	function sliderValue(link, offsetPx, isVertical)
	{
		var d = numberOrNull(offsetPx);

		if (link == null || d == null)
		{
			return null;
		}

		if (isVertical)
		{
			return norm(lerp(d, num(link.down, 0), -num(link.up, 100),
				num(link.atBottom, 0), num(link.atTop, 100)));
		}

		return norm(lerp(d, -num(link.toLeft, 0), num(link.toRight, 100),
			num(link.atLeft, 0), num(link.atRight, 100)));
	};

	/**
	 * Values written on mouse down / mouse up (undefined: no write).
	 */
	function pushValues(action, current)
	{
		switch (action)
		{
			case 'reverse':
				return { down: 0, up: 1 };

			case 'toggle':
				return { down: isTrue(current) ? 0 : 1, up: undefined };

			case 'set':
				return { down: 1, up: undefined };

			case 'reset':
				return { down: 0, up: undefined };

			default:
				return { down: 1, up: 0 };
		}
	};

	// ---------------------------------------------------------------
	// Extension links (INTOUCH_LINKS.md 11)
	// ---------------------------------------------------------------

	/**
	 * Opacity in percent (0..100) or null.
	 */
	function opacity(link, v)
	{
		var n = numberOrNull(v);

		if (link == null || n == null)
		{
			return null;
		}

		var pct = lerp(n, num(link.valueAtMin, 0), num(link.valueAtMax, 100),
			num(link.minPercent, 0), num(link.maxPercent, 100));

		return norm(Math.min(100, Math.max(0, pct)));
	};

	/**
	 * Strictly numeric value (number or numeric string, no booleans), or NaN.
	 */
	function strictNum(v)
	{
		if (typeof v === 'number')
		{
			return isFinite(v) ? v : NaN;
		}

		if (typeof v === 'string')
		{
			var s = v.replace(/^\s+|\s+$/g, '');

			if (s !== '')
			{
				var n = Number(s);

				return isFinite(n) ? n : NaN;
			}
		}

		return NaN;
	};

	function matchPart(part, v)
	{
		var t = part.replace(/^\s+|\s+$/g, '');

		if (t === '')
		{
			return false;
		}

		if (t === '*')
		{
			return true;
		}

		if (v == null)
		{
			return false;
		}

		var dots = t.indexOf('..');

		if (dots >= 0)
		{
			var n = strictNum(v);

			if (isNaN(n))
			{
				return false;
			}

			var a = t.substring(0, dots).replace(/^\s+|\s+$/g, '');
			var b = t.substring(dots + 2).replace(/^\s+|\s+$/g, '');
			var lo = (a === '') ? -Infinity : strictNum(a);
			var hi = (b === '') ? Infinity : strictNum(b);

			if (isNaN(lo) || isNaN(hi))
			{
				return false;
			}

			return lo <= n && n < hi;
		}

		var low = t.toLowerCase();

		if (typeof v === 'boolean')
		{
			return v ? (low === '1' || low === 'true' || low === 'on') :
				(low === '0' || low === 'false' || low === 'off');
		}

		var nv = strictNum(v);
		var nt = strictNum(t);

		if (!isNaN(nv) && !isNaN(nt))
		{
			return nv === nt;
		}

		return String(v).replace(/^\s+|\s+$/g, '').toLowerCase() === low;
	};

	/**
	 * True when v matches the State match: a value, a range a..b (a <= v < b,
	 * either end optional), a comma list of these, or * (default).
	 */
	function matchState(match, v, stale)
	{
		if (match == null)
		{
			return false;
		}

		var trimmed = String(match).replace(/^\s+|\s+$/g, '');

		// Data age: the reserved match 'stale' holds only for old data
		if (trimmed.toLowerCase() === 'stale')
		{
			return stale === true;
		}

		// Regular expression /pattern/flags on the text of the value
		var re = regexOf(trimmed);

		if (re !== undefined)
		{
			return re != null && v != null && re.test(String(v));
		}

		var parts = String(match).split(',');

		for (var i = 0; i < parts.length; i++)
		{
			if (matchPart(parts[i], v))
			{
				return true;
			}
		}

		return false;
	};

	/**
	 * First State of link.states that matches v, or null.
	 */
	function state(link, v, ageMs)
	{
		if (link == null || !(link.states instanceof Array))
		{
			return null;
		}

		var stale = isStale(link, ageMs);

		// A 'stale' state wins over the value states while the data is old
		for (var i = 0; stale && i < link.states.length; i++)
		{
			var st = link.states[i];

			if (st != null && st.match != null &&
				String(st.match).replace(/^\s+|\s+$/g, '').toLowerCase() === 'stale')
			{
				return st;
			}
		}

		for (var i = 0; i < link.states.length; i++)
		{
			var st = link.states[i];

			if (st != null && matchState(st.match, v, stale))
			{
				return st;
			}
		}

		return null;
	};

	/**
	 * RegExp of a /pattern/flags match, null for an invalid pattern and
	 * undefined when the text is not a regular expression.
	 */
	function regexOf(text)
	{
		var m = /^\/(.+)\/([gimsuy]*)$/.exec(text);

		if (m == null)
		{
			return undefined;
		}

		try
		{
			return new RegExp(m[1], m[2].replace(/g/g, ''));
		}
		catch (e)
		{
			return null;
		}
	};

	/**
	 * True when link.staleSeconds > 0 and the data is older than that.
	 */
	function isStale(link, ageMs)
	{
		var sec = (link != null) ? toNum(link.staleSeconds) : NaN;

		return !isNaN(sec) && sec > 0 && ageMs != null && ageMs > sec * 1000;
	};

	// ---------------------------------------------------------------
	// Colours and smooth transitions
	// ---------------------------------------------------------------

	var NAMED_COLORS = {black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000',
		blue: '#0000ff', yellow: '#ffff00', orange: '#ffa500', gray: '#808080', grey: '#808080',
		lime: '#00ff00', cyan: '#00ffff', magenta: '#ff00ff', purple: '#800080',
		transparent: 'rgba(0,0,0,0)'};

	/**
	 * Parses #rgb, #rrggbb, #rrggbbaa, rgb() and rgba() and a few colour
	 * names into [r, g, b, a], or null.
	 */
	function parseColor(c)
	{
		if (c == null || typeof c !== 'string')
		{
			return null;
		}

		var s = c.replace(/^\s+|\s+$/g, '').toLowerCase();

		if (Object.prototype.hasOwnProperty.call(NAMED_COLORS, s))
		{
			s = NAMED_COLORS[s];
		}

		var m = /^#([0-9a-f]{3})$/.exec(s);

		if (m != null)
		{
			return [parseInt(m[1].charAt(0) + m[1].charAt(0), 16), parseInt(m[1].charAt(1) + m[1].charAt(1), 16),
				parseInt(m[1].charAt(2) + m[1].charAt(2), 16), 1];
		}

		m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(s);

		if (m != null)
		{
			return [parseInt(m[1].substring(0, 2), 16), parseInt(m[1].substring(2, 4), 16),
				parseInt(m[1].substring(4, 6), 16), (m[2] != null) ? parseInt(m[2], 16) / 255 : 1];
		}

		m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(s);

		if (m != null)
		{
			return [Number(m[1]), Number(m[2]), Number(m[3]), (m[4] != null) ? Number(m[4]) : 1];
		}

		return null;
	};

	function hex2(n)
	{
		var h = Math.max(0, Math.min(255, Math.round(n))).toString(16);

		return (h.length < 2) ? '0' + h : h;
	};

	/**
	 * Mixes two colours, t = 0 gives a and t = 1 gives b. Returns #rrggbb
	 * (rgba() with transparency) or null when a colour cannot be parsed.
	 */
	function mixColor(a, b, t)
	{
		var ca = parseColor(a);
		var cb = parseColor(b);

		if (ca == null || cb == null)
		{
			return null;
		}

		t = Math.max(0, Math.min(1, Number(t) || 0));
		var r = ca[0] + (cb[0] - ca[0]) * t;
		var g = ca[1] + (cb[1] - ca[1]) * t;
		var bl = ca[2] + (cb[2] - ca[2]) * t;
		var al = ca[3] + (cb[3] - ca[3]) * t;

		if (al < 1)
		{
			return 'rgba(' + Math.round(r) + ',' + Math.round(g) + ',' + Math.round(bl) + ',' +
				(Math.round(al * 1000) / 1000) + ')';
		}

		return '#' + hex2(r) + hex2(g) + hex2(bl);
	};

	/**
	 * Intermediate value of a smooth transition: numbers are interpolated,
	 * colours mixed. Other values switch at the end (t = 1). Returns
	 * undefined when the pair cannot be interpolated.
	 */
	function tween(from, to, t)
	{
		if (t >= 1)
		{
			return to;
		}

		var a = strictNum(from);
		var b = strictNum(to);

		if (!isNaN(a) && !isNaN(b))
		{
			return Math.round((a + (b - a) * t) * 1000) / 1000;
		}

		var c = mixColor(from, to, t);

		return (c != null) ? c : undefined;
	};

	/**
	 * Milliseconds per cycle for a rate in cycles per minute: undefined when
	 * there is no (numeric) rate, null when the rate is <= 0 (paused).
	 */
	function animationDuration(preset, rate)
	{
		var n = strictNum(rate);

		if (isNaN(n))
		{
			return undefined;
		}

		return (n <= 0) ? null : 60000 / n;
	};

	/**
	 * Value written by a pushValue link or undefined.
	 */
	function pushValue(link, current, evalExpr)
	{
		if (link == null)
		{
			return undefined;
		}

		var action = link.action || 'set';

		if (action === 'set')
		{
			var val = link.value;

			if (val == null)
			{
				return undefined;
			}

			if (typeof val === 'number')
			{
				return val;
			}

			var n = strictNum(val);

			return isNaN(n) ? String(val) : n;
		}

		if (action === 'add' || action === 'subtract')
		{
			var d = strictNum(link.value);

			if (isNaN(d))
			{
				return undefined;
			}

			var cur = strictNum(current);
			var r = (isNaN(cur) ? 0 : cur) + (action === 'add' ? d : -d);
			var min = strictNum(link.min);
			var max = strictNum(link.max);

			if (!isNaN(max))
			{
				r = Math.min(max, r);
			}

			if (!isNaN(min))
			{
				r = Math.max(min, r);
			}

			return norm(r);
		}

		if (action === 'expression')
		{
			return (typeof evalExpr === 'function') ? evalExpr() : undefined;
		}

		return undefined;
	};

	/**
	 * True when a data change script should run.
	 */
	function changed(prev, next, deadband)
	{
		if (prev === undefined)
		{
			return next !== undefined;
		}

		if (typeof prev === 'number' && typeof next === 'number')
		{
			if (isNaN(prev) || isNaN(next))
			{
				return !(isNaN(prev) && isNaN(next));
			}

			return Math.abs(next - prev) > num(deadband, 0);
		}

		if (prev !== null && next !== null && typeof prev === 'object' && typeof next === 'object')
		{
			try
			{
				return JSON.stringify(prev) !== JSON.stringify(next);
			}
			catch (e)
			{
				return prev !== next;
			}
		}

		return prev !== next;
	};

	// ---------------------------------------------------------------
	// Dependencies
	// ---------------------------------------------------------------

	/**
	 * True when x names a tag: a non-empty string that is not a number
	 * (including exponential notation such as 1e3 or -2.5E-3).
	 */
	function isTagName(x)
	{
		if (typeof x !== 'string')
		{
			return false;
		}

		var s = x.replace(/^\s+|\s+$/g, '');

		return s !== '' && isNaN(Number(s));
	};

	function addRef(out, name)
	{
		if (typeof name === 'string' && name !== '' && out.indexOf(name) < 0)
		{
			out.push(name);
		}
	};

	function addExprRefs(out, src)
	{
		if (typeof src !== 'string' || src === '' || Hmi.Expr == null)
		{
			return;
		}

		try
		{
			var refs = Hmi.Expr.compile(src, { intouch: true }).refs;

			for (var i = 0; i < refs.length; i++)
			{
				addRef(out, refs[i]);
			}
		}
		catch (e)
		{
			// invalid expressions have no dependencies
		}
	};

	function addScriptRefs(out, src)
	{
		if (typeof src !== 'string' || src === '' || Hmi.QuickScript == null)
		{
			return;
		}

		try
		{
			var c = Hmi.QuickScript.compile(src);
			var i;
			var locals = (c.locals || []).map(function(n) { return n.toLowerCase(); });

			for (i = 0; i < c.refs.length; i++)
			{
				if (locals.indexOf(c.refs[i].toLowerCase()) < 0)
				{
					addRef(out, c.refs[i]);
				}
			}

			for (i = 0; c.writes != null && i < c.writes.length; i++)
			{
				addRef(out, c.writes[i]);
			}
		}
		catch (e)
		{
			// invalid scripts have no dependencies
		}
	};

	function refs(links)
	{
		var out = [];

		if (links == null || typeof links !== 'object')
		{
			return out;
		}

		for (var type in links)
		{
			if (!Object.prototype.hasOwnProperty.call(links, type))
			{
				continue;
			}

			var link = links[type];

			if (link == null || typeof link !== 'object')
			{
				continue;
			}

			addExprRefs(out, link.expr);
			addRef(out, link.tag);
			addRef(out, link.trendTag);

			if (type === 'properties' && link.items instanceof Array)
			{
				for (var pi = 0; pi < link.items.length; pi++)
				{
					addExprRefs(out, link.items[pi] != null ? link.items[pi].expr : null);
				}
			}
			else if (type === 'widgetData' && link.series instanceof Array)
			{
				for (var si = 0; si < link.series.length; si++)
				{
					addRef(out, link.series[si] != null ? link.series[si].tag : null);
				}
			}
			else if (type === 'animation' || type === 'flow')
			{
				addExprRefs(out, link.rateExpr);
				addExprRefs(out, link.speedExpr);
				addExprRefs(out, link.reverseExpr);
			}
			else if (type === 'sendMessage')
			{
				addExprRefs(out, link.payloadExpr);
			}
			else if (type === 'dataChange')
			{
				addScriptRefs(out, link.script);
			}
			else if (type === 'condition')
			{
				addScriptRefs(out, link.onTrue);
				addScriptRefs(out, link.onFalse);
				addScriptRefs(out, link.whileTrue);
				addScriptRefs(out, link.whileFalse);
			}

			if (type === 'inputAnalog')
			{
				if (isTagName(link.min))
				{
					addRef(out, link.min.replace(/^\s+|\s+$/g, ''));
				}

				if (isTagName(link.max))
				{
					addRef(out, link.max.replace(/^\s+|\s+$/g, ''));
				}
			}
		}

		return out;
	};

	/**
	 * Limits of an analog input (pages 71-72). min/max are numbers or tag
	 * names; bad references fall back to the tag definition, else 1 / 100.
	 */
	function inputLimits(link, getValue, getDef)
	{
		link = link || {};

		function resolve(x, which, dflt)
		{
			var n = toNum(x);

			if (typeof x === 'number' || (typeof x === 'string' && !isNaN(n) && x !== ''))
			{
				return isNaN(n) ? dflt : n;
			}

			if (!isTagName(x))
			{
				return dflt;
			}

			var val = (typeof getValue === 'function') ? numberOrNull(getValue(x.replace(/^\s+|\s+$/g, ''))) : null;

			if (val != null)
			{
				return val;
			}

			var def = (typeof getDef === 'function' && link.tag != null) ? getDef(link.tag) : null;
			var d = (def != null) ? numberOrNull(def[which]) : null;

			return (d != null) ? d : dflt;
		};

		return { min: resolve(link.min, 'min', 1), max: resolve(link.max, 'max', 100) };
	};

	Hmi.Links = {
		isTrue: isTrue,
		lerp: lerp,
		locationH: locationH,
		locationV: locationV,
		orientation: orientation,
		size: size,
		scale: scale,
		color: color,
		fill: fill,
		visible: visible,
		disabled: disabled,
		valueText: valueText,
		sliderValue: sliderValue,
		pushValues: pushValues,
		refs: refs,
		inputLimits: inputLimits,
		isTagName: isTagName,
		opacity: opacity,
		matchState: matchState,
		state: state,
		isStale: isStale,
		parseColor: parseColor,
		mixColor: mixColor,
		tween: tween,
		animationDuration: animationDuration,
		pushValue: pushValue,
		changed: changed
	};
})();
