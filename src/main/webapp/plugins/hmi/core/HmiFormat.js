/**
 * Hmi.Format: number/text formatting and type coercion for tag values.
 * DOM-free (ARCHITECTURE.md §1).
 */
(function()
{
	var Hmi = (typeof globalThis !== 'undefined' ? globalThis : window).Hmi =
		(typeof globalThis !== 'undefined' ? globalThis : window).Hmi || {};

	/**
	 * coerce(value, type) -> {ok, value}. Bad coercions return {ok:false},
	 * caller keeps the previous value and sets quality 'bad' (HMI-TAG-3).
	 */
	function coerce(value, type)
	{
		if (type == null || type === '')
		{
			return { ok: true, value: value };
		}

		switch (type)
		{
			case 'number':
				if (typeof value === 'number' && !isNaN(value))
				{
					return { ok: true, value: value };
				}

				if (typeof value === 'boolean')
				{
					return { ok: true, value: value ? 1 : 0 };
				}

				var n = parseFloat(value);

				if (value == null || value === '' || isNaN(n))
				{
					return { ok: false, value: value };
				}

				return { ok: true, value: n };

			case 'integer':
				if (typeof value === 'boolean')
				{
					return { ok: true, value: value ? 1 : 0 };
				}

				var i = parseFloat(value);

				if (value == null || value === '' || isNaN(i))
				{
					return { ok: false, value: value };
				}

				return { ok: true, value: Math.round(i) };

			case 'boolean':
				if (typeof value === 'boolean')
				{
					return { ok: true, value: value };
				}

				if (typeof value === 'number')
				{
					return { ok: true, value: value !== 0 };
				}

				if (typeof value === 'string')
				{
					var s = value.toLowerCase();

					if (s === 'true' || s === '1' || s === 'on' || s === 'yes')
					{
						return { ok: true, value: true };
					}

					if (s === 'false' || s === '0' || s === 'off' || s === 'no' || s === '')
					{
						return { ok: true, value: false };
					}

					return { ok: false, value: value };
				}

				return { ok: false, value: value };

			case 'string':
				if (value == null)
				{
					return { ok: true, value: value };
				}

				if (typeof value === 'object')
				{
					try
					{
						return { ok: true, value: JSON.stringify(value) };
					}
					catch (e)
					{
						return { ok: false, value: value };
					}
				}

				return { ok: true, value: String(value) };

			case 'object':
				return { ok: true, value: value };

			default:
				return { ok: true, value: value };
		}
	};

	/**
	 * Apply thousands separators to the integer part of a fixed-point string.
	 */
	function addThousands(s)
	{
		var neg = s.charAt(0) === '-';

		if (neg)
		{
			s = s.substring(1);
		}

		var parts = s.split('.');
		var intPart = parts[0];
		var out = '';

		for (var i = 0; i < intPart.length; i++)
		{
			if (i > 0 && (intPart.length - i) % 3 === 0)
			{
				out += ',';
			}

			out += intPart.charAt(i);
		}

		if (parts.length > 1)
		{
			out += '.' + parts[1];
		}

		return (neg ? '-' : '') + out;
	};

	/**
	 * parsePattern('0.00') / parsePattern('#,##0.0') -> {decimals, thousands}
	 */
	function parsePattern(pattern)
	{
		var thousands = pattern.indexOf(',') >= 0;
		var dot = pattern.indexOf('.');
		var decimals = 0;

		if (dot >= 0)
		{
			var frac = pattern.substring(dot + 1);
			decimals = frac.length;
		}

		return { decimals: decimals, thousands: thousands };
	};

	/**
	 * format(value, fmt, tagDef) -> string
	 * fmt: { decimals, pattern, unit: true|false, thousands }  (any subset; also a plain pattern string)
	 */
	function format(value, fmt, tagDef)
	{
		if (value == null)
		{
			return '--';
		}

		fmt = fmt || {};

		if (typeof fmt === 'string')
		{
			fmt = { pattern: fmt };
		}

		var decimals = fmt.decimals;
		var thousands = fmt.thousands === true;

		if (fmt.pattern != null)
		{
			var parsed = parsePattern(fmt.pattern);

			if (decimals == null)
			{
				decimals = parsed.decimals;
			}

			thousands = thousands || parsed.thousands;
		}

		if (decimals == null && tagDef != null && tagDef.decimals != null)
		{
			decimals = tagDef.decimals;
		}

		if (decimals == null && tagDef != null && tagDef.format != null)
		{
			decimals = parsePattern(tagDef.format).decimals;
		}

		var out;

		if (typeof value === 'boolean')
		{
			out = value ? 'true' : 'false';
		}
		else if (typeof value === 'number')
		{
			if (isNaN(value))
			{
				return '--';
			}

			out = (decimals != null) ? value.toFixed(decimals) : String(value);

			if (thousands)
			{
				out = addThousands(out);
			}
		}
		else if (typeof value === 'object')
		{
			try
			{
				out = JSON.stringify(value);
			}
			catch (e)
			{
				out = String(value);
			}
		}
		else
		{
			out = String(value);
		}

		if (fmt.unit !== false && tagDef != null && tagDef.unit &&
			(typeof value === 'number' || typeof value === 'boolean'))
		{
			out += ' ' + tagDef.unit;
		}

		return out;
	};

	/**
	 * parseSpec('Name|0.0') -> {name, fmt}   (placeholder %tag:<name>|<fmt>%, HMI-BND-5)
	 */
	function parseSpec(spec)
	{
		if (spec == null)
		{
			return { name: '', fmt: null };
		}

		var idx = spec.indexOf('|');

		if (idx < 0)
		{
			return { name: spec, fmt: null };
		}

		return { name: spec.substring(0, idx), fmt: spec.substring(idx + 1) };
	};

	/**
	 * formatSpec(value, 'Name|0.0', tagDef) -> string, convenience wrapper
	 * combining parseSpec + format for a placeholder-style spec string.
	 */
	function formatSpec(value, spec, tagDef)
	{
		var parsed = parseSpec(spec);

		return format(value, parsed.fmt, tagDef);
	};

	// ---------------------------------------------------------------
	// InTouch text masks and advanced formatting (INTOUCH_LINKS.md §3)
	// ---------------------------------------------------------------

	/**
	 * Rounds |x| half away from zero to the given number of decimals and
	 * returns the fixed-point string without sign handling.
	 */
	function roundFixed(abs, decimals)
	{
		var str = String(abs);
		var rounded;

		if (str.indexOf('e') >= 0 || decimals > 20)
		{
			var f = Math.pow(10, decimals);
			rounded = Math.round(abs * f) / f;
		}
		else
		{
			rounded = Number(Math.round(Number(str + 'e' + decimals)) + 'e-' + decimals);
		}

		return rounded.toFixed(Math.min(decimals, 20));
	};

	function toNum(value)
	{
		if (typeof value === 'boolean')
		{
			return value ? 1 : 0;
		}

		if (value == null || value === '')
		{
			return NaN;
		}

		return Number(value);
	};

	function repeatChar(ch, n)
	{
		var out = '';

		for (var i = 0; i < n; i++)
		{
			out += ch;
		}

		return out;
	};

	/**
	 * Formats the number by a single mask run such as '0,000.#'.
	 */
	function formatByMask(mask, num)
	{
		var dot = mask.indexOf('.');
		var intMask = (dot < 0) ? mask : mask.substring(0, dot);
		var decMask = (dot < 0) ? '' : mask.substring(dot + 1);
		var decimals = 0;
		var minInt = 0;
		var i;

		for (i = 0; i < decMask.length; i++)
		{
			if (decMask.charAt(i) === '#' || decMask.charAt(i) === '0')
			{
				decimals++;
			}
		}

		for (i = 0; i < intMask.length; i++)
		{
			if (intMask.charAt(i) === '0')
			{
				minInt++;
			}
		}

		var neg = num < 0;
		var fixed = roundFixed(Math.abs(num), decimals);
		var parts = fixed.split('.');
		var intDigits = parts[0];

		while (intDigits.length < minInt)
		{
			intDigits = '0' + intDigits;
		}

		if (intMask.indexOf(',') >= 0)
		{
			intDigits = addThousands(intDigits);
		}

		var out = intDigits + (parts.length > 1 ? '.' + parts[1] : '');

		if (neg && /[1-9]/.test(out))
		{
			out = '-' + out;
		}

		return out;
	};

	/**
	 * applyMask(text, value) -> string. Replaces the first run of [#0,.]
	 * characters that contains a # or 0 with the formatted value.
	 */
	function applyMask(text, value)
	{
		text = (text == null) ? '' : String(text);

		var re = /[#0,.]+/g;
		var m;

		while ((m = re.exec(text)) != null)
		{
			if (/[#0]/.test(m[0]))
			{
				var num = toNum(value);
				var rep;

				if (isNaN(num) || !isFinite(num))
				{
					rep = (value == null) ? '' : String(value);
				}
				else
				{
					rep = formatByMask(m[0], num);
				}

				return text.substring(0, m.index) + rep + text.substring(m.index + m[0].length);
			}
		}

		return (value == null) ? '' : String(value);
	};

	function bitString(num, from, to, radix)
	{
		var lo = Math.max(0, Math.min(31, Math.floor(Math.min(from, to))));
		var hi = Math.max(0, Math.min(31, Math.floor(Math.max(from, to))));
		var n = hi - lo + 1;
		var u = (num < 0 ? Math.ceil(num) : Math.floor(num)) >>> 0;
		var bits = Math.floor(u / Math.pow(2, lo)) % Math.pow(2, n);

		return bits.toString(radix).toUpperCase();
	};

	/**
	 * advanced(value, format, fieldText, opts) -> string
	 * opts: {tooLargeChar: '*', globalPrecision: 6, type: 'integer'|'real'|'discrete'}
	 */
	function advanced(value, fmt, fieldText, opts)
	{
		fmt = fmt || {};
		opts = opts || {};

		var mode = fmt.mode || 'text';
		var field = (fieldText == null) ? '' : String(fieldText);

		if (mode === 'text')
		{
			return applyMask(field, value);
		}

		var num = toNum(value);
		var precision = Math.max(0, Math.min(8, Math.floor(Number(fmt.precision) || 0)));
		var out;

		if (isNaN(num) || !isFinite(num))
		{
			out = '';
		}
		else if (mode === 'real')
		{
			var gp = (opts.globalPrecision != null) ? opts.globalPrecision : 6;
			out = String(Number(roundFixed(Math.abs(num), gp)) * (num < 0 ? -1 : 1));
		}
		else if (mode === 'fixed')
		{
			var type = opts.type;

			if (type == null)
			{
				type = (typeof value === 'boolean') ? 'discrete' :
					((Math.floor(num) === num) ? 'integer' : 'real');
			}

			if (type === 'real')
			{
				out = (num < 0 && /[1-9]/.test(roundFixed(-num, precision)) ? '-' : '') +
					roundFixed(Math.abs(num), precision);
			}
			else
			{
				out = (type === 'discrete') ? (num ? '1' : '0') : roundFixed(Math.abs(num), 0);

				if (type !== 'discrete' && num < 0 && out !== '0')
				{
					out = '-' + out;
				}

				out += repeatChar(' ', precision > 0 ? precision + 1 : 0);
			}
		}
		else if (mode === 'integer')
		{
			out = roundFixed(Math.abs(num), 0);

			if (num < 0 && out !== '0')
			{
				out = '-' + out;
			}
		}
		else if (mode === 'exponential')
		{
			out = num.toExponential(precision).toUpperCase();
		}
		else if (mode === 'hex' || mode === 'binary')
		{
			out = bitString(num, Number(fmt.bitsFrom) || 0,
				(fmt.bitsTo == null) ? 31 : Number(fmt.bitsTo), (mode === 'hex') ? 16 : 2);
		}
		else
		{
			out = String(value);
		}

		if (fmt.fixedWidth === true)
		{
			if (field.length === 0)
			{
				return '';
			}

			if (out.length > field.length)
			{
				var ch = (opts.tooLargeChar != null && opts.tooLargeChar !== '') ? String(opts.tooLargeChar).charAt(0) : '*';
				out = repeatChar(ch, field.length);
			}
		}

		return out;
	};

	Hmi.Format = {
		format: format,
		coerce: coerce,
		parseSpec: parseSpec,
		formatSpec: formatSpec,
		applyMask: applyMask,
		advanced: advanced
	};
})();
