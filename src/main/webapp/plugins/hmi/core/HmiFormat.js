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

	Hmi.Format = {
		format: format,
		coerce: coerce,
		parseSpec: parseSpec,
		formatSpec: formatSpec
	};
})();
