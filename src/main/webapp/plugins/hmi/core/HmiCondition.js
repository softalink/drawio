/**
 * Hmi.Condition: trigger/binding-map condition testing (SRS HMI-TRG-3).
 * Semantics ported from meta2d.js (MIT), le5le: `judgeCondition`,
 * `valueInRange`, `valueInArray` in packages/core/src/core.ts /
 * packages/core/src/utils/math.ts.
 *
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

	function looseEq(a, b)
	{
		if (a === b)
		{
			return true;
		}

		if (a == null || b == null)
		{
			return a == b;
		}

		var an = typeof a === 'number' || (typeof a === 'string' && a !== '' && !isNaN(a));
		var bn = typeof b === 'number' || (typeof b === 'string' && b !== '' && !isNaN(b));

		if (an && bn)
		{
			return Number(a) === Number(b);
		}

		return a == b;
	};

	/**
	 * Parses a range spec into [start, end]. Accepts an array [a,b], a
	 * "a,b" string, or a "a..b" string (meta2d ref: valueInRange).
	 */
	function parseRange(spec)
	{
		if (Array.isArray(spec))
		{
			return [Number(spec[0]), Number(spec[1])];
		}

		if (typeof spec === 'string')
		{
			var sep = (spec.indexOf('..') >= 0) ? '..' : ',';
			var parts = spec.split(sep);

			return [Number(parts[0]), Number(parts[1])];
		}

		return [NaN, NaN];
	};

	/**
	 * valueInRange(value, spec) -> bool, half-open [a, b) as per contract's
	 * `range` operator (a<=value<b).
	 */
	function valueInRange(value, spec)
	{
		var range = parseRange(spec);
		var v = toNumber(value);

		return v >= range[0] && v < range[1];
	};

	/**
	 * valueInArray(value, spec) -> bool. spec is an array or a comma string;
	 * items may be "a..b" ranges (meta2d ref: valueInArray).
	 */
	function valueInArray(value, spec)
	{
		var items;

		if (Array.isArray(spec))
		{
			items = spec;
		}
		else if (typeof spec === 'string')
		{
			items = spec.split(',');
		}
		else
		{
			return false;
		}

		for (var i = 0; i < items.length; i++)
		{
			var item = items[i];

			if (typeof item === 'string' && item.indexOf('..') >= 0)
			{
				var range = item.split('..');
				var v = toNumber(value);

				if (v >= Number(range[0]) && v <= Number(range[1]))
				{
					return true;
				}
			}
			else if (looseEq(value, (typeof item === 'string') ? item.trim() : item))
			{
				return true;
			}
		}

		return false;
	};

	/**
	 * resolveOperand(cond, ctx) -> the left-hand value: tag(cond.tag) or
	 * Hmi.Expr.evaluate(cond.expr, ctx.env).
	 */
	function resolveOperand(cond, ctx)
	{
		if (cond.expr != null && cond.expr !== '')
		{
			var env = ctx.env || {};

			return Hmi.Expr.evaluate(cond.expr, env);
		}

		return ctx.value(cond.tag);
	};

	function resolveCompareValue(cond, ctx)
	{
		if (cond.valueTag != null && cond.valueTag !== '')
		{
			return ctx.value(cond.valueTag);
		}

		return cond.value;
	};

	/**
	 * test(cond, ctx) -> bool
	 * ctx = {value(tag), quality(tag), changed(tag), env, deadbandState?}
	 */
	function test(cond, ctx)
	{
		if (cond == null)
		{
			return true;
		}

		var op = cond.operator;

		if (op === 'true' || op == null)
		{
			return true;
		}

		if (op === 'changed')
		{
			return !!ctx.changed(cond.tag);
		}

		if (op === 'isBad')
		{
			var q = ctx.quality(cond.tag);

			return q != null && q !== 'good';
		}

		var left = resolveOperand(cond, ctx);

		if (op === 'range')
		{
			return valueInRange(left, resolveCompareValue(cond, ctx));
		}

		if (op === '!range')
		{
			return !valueInRange(left, resolveCompareValue(cond, ctx));
		}

		if (op === 'in')
		{
			return valueInArray(left, resolveCompareValue(cond, ctx));
		}

		if (op === '!in')
		{
			return !valueInArray(left, resolveCompareValue(cond, ctx));
		}

		var right = resolveCompareValue(cond, ctx);

		switch (op)
		{
			case '==':
				return looseEq(left, right);

			case '!=':
				return !looseEq(left, right);

			case '>':
				return toNumber(left) > toNumber(right);

			case '<':
				return toNumber(left) < toNumber(right);

			case '>=':
				return toNumber(left) >= toNumber(right);

			case '<=':
				return toNumber(left) <= toNumber(right);

			default:
				return false;
		}
	};

	/**
	 * testAll(conds, conditionType, ctx) -> bool. Empty array means true
	 * (HMI-TRG-2).
	 */
	function testAll(conds, conditionType, ctx)
	{
		if (conds == null || conds.length === 0)
		{
			return true;
		}

		if (conditionType === 'or')
		{
			for (var i = 0; i < conds.length; i++)
			{
				if (test(conds[i], ctx))
				{
					return true;
				}
			}

			return false;
		}

		for (var j = 0; j < conds.length; j++)
		{
			if (!test(conds[j], ctx))
			{
				return false;
			}
		}

		return true;
	};

	/**
	 * refs(conds) -> [tag names] referenced by tag/valueTag or by embedded
	 * expr() calls, deduplicated.
	 */
	function refs(conds)
	{
		var out = [];

		if (conds == null)
		{
			return out;
		}

		for (var i = 0; i < conds.length; i++)
		{
			var c = conds[i];

			if (c.tag != null && c.tag !== '' && out.indexOf(c.tag) < 0)
			{
				out.push(c.tag);
			}

			if (c.valueTag != null && c.valueTag !== '' && out.indexOf(c.valueTag) < 0)
			{
				out.push(c.valueTag);
			}

			if (c.expr != null && c.expr !== '')
			{
				try
				{
					var compiled = Hmi.Expr.compile(c.expr);

					for (var j = 0; j < compiled.refs.length; j++)
					{
						if (out.indexOf(compiled.refs[j]) < 0)
						{
							out.push(compiled.refs[j]);
						}
					}
				}
				catch (e)
				{
					// invalid expression: no refs contributed
				}
			}
		}

		return out;
	};

	Hmi.Condition = {
		test: test,
		testAll: testAll,
		refs: refs,
		valueInRange: valueInRange,
		valueInArray: valueInArray
	};
})();
