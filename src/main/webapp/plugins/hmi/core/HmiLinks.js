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
	 * Returns {dw, dx} (isWidth) or {dh, dy}.
	 */
	function size(link, v, isWidth, w, h)
	{
		var n = numberOrNull(v);

		if (link == null || n == null)
		{
			return null;
		}

		var pct = lerp(n, num(link.valueAtMin, 0), num(link.valueAtMax, 100),
			num(link.minPercent, 0), num(link.maxPercent, 100));
		var base = isWidth ? num(w, 0) : num(h, 0);
		var delta = base * pct / 100 - base;
		var anchor = link.anchor || (isWidth ? 'left' : 'bottom');
		var shift;

		if (anchor === 'middle' || anchor === 'center')
		{
			shift = -delta / 2;
		}
		else if (anchor === 'bottom' || anchor === 'right')
		{
			shift = -delta;
		}
		else
		{
			shift = 0;
		}

		return isWidth ? { dw: norm(delta), dx: norm(shift) } : { dh: norm(delta), dy: norm(shift) };
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

	function color(link, v, alarm)
	{
		if (link == null)
		{
			return null;
		}

		var kind = link.kind;
		var c;

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
		color: color,
		fill: fill,
		visible: visible,
		disabled: disabled,
		valueText: valueText,
		sliderValue: sliderValue,
		pushValues: pushValues,
		refs: refs,
		inputLimits: inputLimits,
		isTagName: isTagName
	};
})();
