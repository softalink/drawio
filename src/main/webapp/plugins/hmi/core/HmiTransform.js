/**
 * Hmi.Transform: binding value transforms (SRS HMI-BND-3).
 * DOM-free (ARCHITECTURE.md §1).
 */
(function()
{
	var Hmi = (typeof globalThis !== 'undefined' ? globalThis : window).Hmi =
		(typeof globalThis !== 'undefined' ? globalThis : window).Hmi || {};

	function toNumber(v)
	{
		if (typeof v === 'boolean')
		{
			return v ? 1 : 0;
		}

		return Number(v);
	};

	function applyScale(t, value)
	{
		var inMin = toNumber(t.inMin);
		var inMax = toNumber(t.inMax);
		var outMin = toNumber(t.outMin);
		var outMax = toNumber(t.outMax);
		var v = toNumber(value);

		var ratio = (inMax === inMin) ? 0 : (v - inMin) / (inMax - inMin);
		var out = outMin + ratio * (outMax - outMin);

		if (t.clamp)
		{
			var lo = Math.min(outMin, outMax);
			var hi = Math.max(outMin, outMax);
			out = Math.min(Math.max(out, lo), hi);
		}

		return out;
	};

	function mapCtx(value)
	{
		return {
			value: function() { return value; },
			quality: function() { return 'good'; },
			changed: function() { return false; }
		};
	};

	function applyMap(t, value)
	{
		var entries = t.entries || [];
		var ctx = mapCtx(value);

		for (var i = 0; i < entries.length; i++)
		{
			var e = entries[i];

			if (Hmi.Condition.test({ operator: e.operator, value: e.value, tag: '__value__' }, ctx))
			{
				return e.output;
			}
		}

		return t['default'];
	};

	function applyInvert(value)
	{
		return !value;
	};

	function applyExpr(t, value, env)
	{
		var e = env || {};
		e.value = value;

		return Hmi.Expr.evaluate(t.expr, e);
	};

	function applyScript(t, value, env)
	{
		var e = env || {};

		if (e.runScript)
		{
			return e.runScript(t.code, { value: value });
		}

		return value;
	};

	/**
	 * apply(transform, value, env) -> value | Promise<value> ('script' kind)
	 */
	function apply(transform, value, env)
	{
		if (transform == null || transform.kind == null)
		{
			return value;
		}

		switch (transform.kind)
		{
			case 'scale':
				return applyScale(transform, value);

			case 'map':
				return applyMap(transform, value);

			case 'invert':
				return applyInvert(value);

			case 'expr':
				return applyExpr(transform, value, env);

			case 'script':
				return applyScript(transform, value, env);

			default:
				return value;
		}
	};

	Hmi.Transform = {
		apply: apply
	};
})();
