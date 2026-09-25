/**
 * Hmi.Expr: a small, safe expression language for bindings, transforms and
 * conditions. Tokenizer + Pratt (precedence-climbing) parser + tree-walking
 * evaluator. No `eval` / `new Function` anywhere (SRS HMI-SEC-3).
 *
 * (function() { var Hmi = ...; })() wrapper per ARCHITECTURE.md §1.
 */
(function()
{
	var Hmi = (typeof globalThis !== 'undefined' ? globalThis : window).Hmi =
		(typeof globalThis !== 'undefined' ? globalThis : window).Hmi || {};

	var MAX_SRC_LEN = 4000;
	var MAX_DEPTH = 64;
	var MAX_STRING_LEN = 8000;
	var MAX_STEPS = 200000;

	var BLOCKED_KEYS = Object.create(null);
	BLOCKED_KEYS['__proto__'] = true;
	BLOCKED_KEYS.constructor = true;
	BLOCKED_KEYS.prototype = true;

	/**
	 * ExprError: thrown by compile()/evaluate() with a source position.
	 */
	function ExprError(message, pos)
	{
		this.name = 'Hmi.Expr.Error';
		this.message = message;
		this.pos = (pos == null ? -1 : pos);
	};

	ExprError.prototype = Object.create(Error.prototype);
	ExprError.prototype.constructor = ExprError;

	// ---------------------------------------------------------------
	// Tokenizer
	// ---------------------------------------------------------------

	var PUNCT = [
		'**', '&&', '||', '==', '!=', '>=', '<=', '?.', '..',
		'+', '-', '*', '/', '%', '(', ')', '[', ']', '.', ',', '?', ':', '!', '<', '>', '='
	];

	function isDigit(ch)
	{
		return ch >= '0' && ch <= '9';
	};

	function isIdentStart(ch)
	{
		return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_' || ch === '$';
	};

	function isIdentPart(ch)
	{
		return isIdentStart(ch) || isDigit(ch);
	};

	function tokenize(src)
	{
		if (src.length > MAX_SRC_LEN)
		{
			throw new ExprError('expression too long', 0);
		}

		var tokens = [];
		var i = 0;
		var n = src.length;

		while (i < n)
		{
			var ch = src.charAt(i);

			if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r')
			{
				i++;
				continue;
			}

			var start = i;

			if (ch === '\'' || ch === '"')
			{
				var quote = ch;
				var buf = '';
				i++;

				while (i < n && src.charAt(i) !== quote)
				{
					var c = src.charAt(i);

					if (c === '\\' && i + 1 < n)
					{
						var next = src.charAt(i + 1);

						if (next === 'n')
						{
							buf += '\n';
						}
						else if (next === 't')
						{
							buf += '\t';
						}
						else
						{
							buf += next;
						}

						i += 2;
					}
					else
					{
						buf += c;
						i++;
					}

					if (buf.length > MAX_STRING_LEN)
					{
						throw new ExprError('string literal too long', start);
					}
				}

				if (i >= n)
				{
					throw new ExprError('unterminated string', start);
				}

				i++; // closing quote
				tokens.push({ type: 'string', value: buf, pos: start });
				continue;
			}

			if (isDigit(ch) || (ch === '.' && isDigit(src.charAt(i + 1))))
			{
				var numStr = '';

				while (i < n && isDigit(src.charAt(i)))
				{
					numStr += src.charAt(i++);
				}

				if (src.charAt(i) === '.' && src.charAt(i + 1) !== '.')
				{
					numStr += src.charAt(i++);

					while (i < n && isDigit(src.charAt(i)))
					{
						numStr += src.charAt(i++);
					}
				}

				if (src.charAt(i) === 'e' || src.charAt(i) === 'E')
				{
					var save = i;
					var exp = src.charAt(i++);

					if (src.charAt(i) === '+' || src.charAt(i) === '-')
					{
						exp += src.charAt(i++);
					}

					if (isDigit(src.charAt(i)))
					{
						while (i < n && isDigit(src.charAt(i)))
						{
							exp += src.charAt(i++);
						}

						numStr += exp;
					}
					else
					{
						i = save;
					}
				}

				tokens.push({ type: 'number', value: parseFloat(numStr), pos: start });
				continue;
			}

			if (isIdentStart(ch))
			{
				var idStr = '';

				while (i < n && isIdentPart(src.charAt(i)))
				{
					idStr += src.charAt(i++);
				}

				tokens.push({ type: 'ident', value: idStr, pos: start });
				continue;
			}

			var matched = null;

			for (var p = 0; p < PUNCT.length; p++)
			{
				var op = PUNCT[p];

				if (src.substr(i, op.length) === op)
				{
					matched = op;
					break;
				}
			}

			if (matched == null)
			{
				throw new ExprError('unexpected character \'' + ch + '\'', start);
			}

			i += matched.length;
			tokens.push({ type: 'punct', value: matched, pos: start });
		}

		tokens.push({ type: 'eof', value: null, pos: n });

		return tokens;
	};

	// ---------------------------------------------------------------
	// Parser (Pratt / precedence climbing)
	// ---------------------------------------------------------------

	// Binary operator binding powers: [left, right]. Higher binds tighter.
	var BINOPS = {
		'||': [1, 2],
		'&&': [3, 4],
		'==': [5, 6], '!=': [5, 6],
		'<': [7, 8], '>': [7, 8], '<=': [7, 8], '>=': [7, 8],
		'+': [9, 10], '-': [9, 10],
		'*': [11, 12], '/': [11, 12], '%': [11, 12],
		'**': [14, 13] // right associative
	};

	var FUNCS = Object.create(null);
	var FUNC_NAMES = ['min', 'max', 'abs', 'round', 'floor', 'ceil', 'clamp', 'fmt',
		'str', 'num', 'bool', 'len', 'now', 'if', 'tag', 'prop'];

	for (var fi = 0; fi < FUNC_NAMES.length; fi++)
	{
		FUNCS[FUNC_NAMES[fi]] = true;
	}

	function Parser(tokens, src)
	{
		this.tokens = tokens;
		this.src = src;
		this.i = 0;
	};

	Parser.prototype.peek = function()
	{
		return this.tokens[this.i];
	};

	Parser.prototype.next = function()
	{
		return this.tokens[this.i++];
	};

	Parser.prototype.expectPunct = function(p)
	{
		var t = this.next();

		if (t.type !== 'punct' || t.value !== p)
		{
			throw new ExprError('expected \'' + p + '\'', t.pos);
		}

		return t;
	};

	Parser.prototype.isPunct = function(p)
	{
		var t = this.peek();

		return t.type === 'punct' && t.value === p;
	};

	Parser.prototype.parseExpression = function(minBp, depth)
	{
		if (depth > MAX_DEPTH)
		{
			throw new ExprError('expression too deeply nested', this.peek().pos);
		}

		var left = this.parseUnary(depth + 1);

		for (;;)
		{
			var t = this.peek();

			if (t.type !== 'punct')
			{
				break;
			}

			if (t.value === '?')
			{
				if (minBp > 0)
				{
					break;
				}

				this.next();
				var cons = this.parseExpression(0, depth + 1);
				this.expectPunct(':');
				var alt = this.parseExpression(0, depth + 1);
				left = { type: 'cond', test: left, cons: cons, alt: alt, pos: t.pos };
				continue;
			}

			var bp = BINOPS[t.value];

			if (bp == null || bp[0] < minBp)
			{
				break;
			}

			this.next();
			var right = this.parseExpression(bp[1], depth + 1);
			left = { type: 'bin', op: t.value, left: left, right: right, pos: t.pos };
		}

		return left;
	};

	Parser.prototype.parseUnary = function(depth)
	{
		var t = this.peek();

		if (t.type === 'punct' && (t.value === '-' || t.value === '!'))
		{
			this.next();
			var arg = this.parseUnary(depth + 1);

			return { type: 'unary', op: t.value, arg: arg, pos: t.pos };
		}

		return this.parsePostfix(depth);
	};

	Parser.prototype.parsePostfix = function(depth)
	{
		var node = this.parsePrimary(depth);

		for (;;)
		{
			if (this.isPunct('.'))
			{
				this.next();
				var t = this.next();

				if (t.type !== 'ident')
				{
					throw new ExprError('expected property name', t.pos);
				}

				node = { type: 'member', obj: node, key: { type: 'lit', value: t.value }, computed: false, pos: t.pos };
			}
			else if (this.isPunct('['))
			{
				var pos = this.next().pos;
				var key = this.parseExpression(0, depth + 1);
				this.expectPunct(']');
				node = { type: 'member', obj: node, key: key, computed: true, pos: pos };
			}
			else
			{
				break;
			}
		}

		return node;
	};

	Parser.prototype.parsePrimary = function(depth)
	{
		if (depth > MAX_DEPTH)
		{
			throw new ExprError('expression too deeply nested', this.peek().pos);
		}

		var t = this.next();

		if (t.type === 'number')
		{
			return { type: 'lit', value: t.value };
		}

		if (t.type === 'string')
		{
			return { type: 'lit', value: t.value };
		}

		if (t.type === 'punct' && t.value === '(')
		{
			var e = this.parseExpression(0, depth + 1);
			this.expectPunct(')');

			return e;
		}

		if (t.type === 'ident')
		{
			if (t.value === 'true')
			{
				return { type: 'lit', value: true };
			}

			if (t.value === 'false')
			{
				return { type: 'lit', value: false };
			}

			if (t.value === 'null')
			{
				return { type: 'lit', value: null };
			}

			if (this.isPunct('('))
			{
				this.next();
				var args = [];

				if (!this.isPunct(')'))
				{
					for (;;)
					{
						args.push(this.parseExpression(0, depth + 1));

						if (this.isPunct(','))
						{
							this.next();
							continue;
						}

						break;
					}
				}

				this.expectPunct(')');

				if (FUNCS[t.value] !== true)
				{
					throw new ExprError('unknown function \'' + t.value + '\'', t.pos);
				}

				return { type: 'call', name: t.value, args: args, pos: t.pos };
			}

			return { type: 'ident', name: t.value, pos: t.pos };
		}

		throw new ExprError('unexpected token', t.pos);
	};

	function parse(src)
	{
		var tokens = tokenize(src);
		var parser = new Parser(tokens, src);
		var node = parser.parseExpression(0, 0);

		if (parser.peek().type !== 'eof')
		{
			throw new ExprError('unexpected trailing input', parser.peek().pos);
		}

		return node;
	};

	// ---------------------------------------------------------------
	// refs() collection: literal tag("...") calls
	// ---------------------------------------------------------------

	function collectRefs(node, out)
	{
		if (node == null || typeof node !== 'object')
		{
			return;
		}

		if (node.type === 'call')
		{
			if (node.name === 'tag' && node.args.length === 1 && node.args[0].type === 'lit' &&
				typeof node.args[0].value === 'string')
			{
				if (out.indexOf(node.args[0].value) < 0)
				{
					out.push(node.args[0].value);
				}
			}

			for (var i = 0; i < node.args.length; i++)
			{
				collectRefs(node.args[i], out);
			}

			return;
		}

		if (node.type === 'bin')
		{
			collectRefs(node.left, out);
			collectRefs(node.right, out);
		}
		else if (node.type === 'unary')
		{
			collectRefs(node.arg, out);
		}
		else if (node.type === 'cond')
		{
			collectRefs(node.test, out);
			collectRefs(node.cons, out);
			collectRefs(node.alt, out);
		}
		else if (node.type === 'member')
		{
			collectRefs(node.obj, out);
			collectRefs(node.key, out);
		}
	};

	// ---------------------------------------------------------------
	// Evaluator
	// ---------------------------------------------------------------

	function isNumericLike(v)
	{
		return typeof v === 'number' || (typeof v === 'string' && v !== '' && !isNaN(v));
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

		if (isNumericLike(a) && isNumericLike(b))
		{
			return Number(a) === Number(b);
		}

		return a == b;
	};

	function toNumber(v)
	{
		if (v == null)
		{
			return NaN;
		}

		if (typeof v === 'boolean')
		{
			return v ? 1 : 0;
		}

		return Number(v);
	};

	function safeGet(obj, key)
	{
		if (obj == null)
		{
			return undefined;
		}

		var t = typeof key;
		var k = (t === 'number') ? key : String(key);

		if (typeof k === 'string' && BLOCKED_KEYS[k])
		{
			return undefined;
		}

		if (typeof obj !== 'object' && typeof obj !== 'string')
		{
			return undefined;
		}

		if (!Object.prototype.hasOwnProperty.call(Object(obj), k) &&
			!(Array.isArray(obj) && typeof key === 'number'))
		{
			return undefined;
		}

		return obj[k];
	};

	function Evaluator(env)
	{
		this.env = env || {};
		this.steps = 0;
	};

	Evaluator.prototype.tick = function(pos)
	{
		this.steps++;

		if (this.steps > MAX_STEPS)
		{
			throw new ExprError('expression evaluation limit exceeded', pos);
		}
	};

	Evaluator.prototype.evalNode = function(node)
	{
		this.tick(node.pos);

		switch (node.type)
		{
			case 'lit':
				return node.value;

			case 'ident':
				return this.evalIdent(node);

			case 'member':
				return this.evalMember(node);

			case 'unary':
				return this.evalUnary(node);

			case 'bin':
				return this.evalBin(node);

			case 'cond':
				return this.evalNode(node.test) ? this.evalNode(node.cons) : this.evalNode(node.alt);

			case 'call':
				return this.evalCall(node);
		}

		throw new ExprError('internal: unknown node ' + node.type, node.pos);
	};

	Evaluator.prototype.evalIdent = function(node)
	{
		var env = this.env;

		if (node.name === 'value')
		{
			return env.value;
		}

		if (env.vars != null && Object.prototype.hasOwnProperty.call(env.vars, node.name))
		{
			return env.vars[node.name];
		}

		return undefined;
	};

	Evaluator.prototype.evalMember = function(node)
	{
		var obj = this.evalNode(node.obj);
		var key = node.computed ? this.evalNode(node.key) : node.key.value;

		return safeGet(obj, key);
	};

	Evaluator.prototype.evalUnary = function(node)
	{
		var v = this.evalNode(node.arg);

		if (node.op === '-')
		{
			return -toNumber(v);
		}

		return !v;
	};

	Evaluator.prototype.evalBin = function(node)
	{
		if (node.op === '&&')
		{
			var l = this.evalNode(node.left);

			return l ? this.evalNode(node.right) : l;
		}

		if (node.op === '||')
		{
			var l2 = this.evalNode(node.left);

			return l2 ? l2 : this.evalNode(node.right);
		}

		var a = this.evalNode(node.left);
		var b = this.evalNode(node.right);

		switch (node.op)
		{
			case '+':
				if (typeof a === 'string' || typeof b === 'string')
				{
					return String(a == null ? '' : a) + String(b == null ? '' : b);
				}

				return toNumber(a) + toNumber(b);

			case '-':
				return toNumber(a) - toNumber(b);

			case '*':
				return toNumber(a) * toNumber(b);

			case '/':
				return toNumber(a) / toNumber(b);

			case '%':
				return toNumber(a) % toNumber(b);

			case '**':
				return Math.pow(toNumber(a), toNumber(b));

			case '==':
				return looseEq(a, b);

			case '!=':
				return !looseEq(a, b);

			case '<':
			case '>':
			case '<=':
			case '>=':
				var na, nb;

				if (typeof a === 'string' && typeof b === 'string' && !(isNumericLike(a) && isNumericLike(b)))
				{
					na = a;
					nb = b;
				}
				else
				{
					na = toNumber(a);
					nb = toNumber(b);
				}

				if (node.op === '<') return na < nb;
				if (node.op === '>') return na > nb;
				if (node.op === '<=') return na <= nb;
				return na >= nb;
		}

		throw new ExprError('internal: unknown operator ' + node.op, node.pos);
	};

	Evaluator.prototype.evalCall = function(node)
	{
		var env = this.env;
		var args = [];

		for (var i = 0; i < node.args.length; i++)
		{
			args.push(this.evalNode(node.args[i]));
		}

		switch (node.name)
		{
			case 'min':
				return Math.min.apply(Math, args.map(toNumber));

			case 'max':
				return Math.max.apply(Math, args.map(toNumber));

			case 'abs':
				return Math.abs(toNumber(args[0]));

			case 'round':
				if (args.length > 1)
				{
					var f = Math.pow(10, toNumber(args[1]));

					return Math.round(toNumber(args[0]) * f) / f;
				}

				return Math.round(toNumber(args[0]));

			case 'floor':
				return Math.floor(toNumber(args[0]));

			case 'ceil':
				return Math.ceil(toNumber(args[0]));

			case 'clamp':
				var v = toNumber(args[0]);
				var lo = toNumber(args[1]);
				var hi = toNumber(args[2]);

				return Math.min(Math.max(v, lo), hi);

			case 'fmt':
				return toNumber(args[0]).toFixed(args.length > 1 ? toNumber(args[1]) : 0);

			case 'str':
				return args[0] == null ? '' : String(args[0]);

			case 'num':
				return toNumber(args[0]);

			case 'bool':
				return !!args[0];

			case 'len':
				if (args[0] == null)
				{
					return 0;
				}

				return args[0].length != null ? args[0].length : 0;

			case 'now':
				return Date.now();

			case 'if':
				return args[0] ? args[1] : args[2];

			case 'tag':
				return (typeof env.tag === 'function') ? env.tag(args[0]) : undefined;

			case 'prop':
				return (typeof env.prop === 'function') ? env.prop(args[0]) : undefined;
		}

		throw new ExprError('unknown function \'' + node.name + '\'', node.pos);
	};

	// ---------------------------------------------------------------
	// Compiled expression cache + public API
	// ---------------------------------------------------------------

	var compileCache = {};
	var cacheKeys = [];
	var MAX_CACHE = 500;

	function compile(src)
	{
		if (typeof src !== 'string')
		{
			throw new ExprError('expression source must be a string', 0);
		}

		if (Object.prototype.hasOwnProperty.call(compileCache, src))
		{
			return compileCache[src];
		}

		var ast = parse(src);
		var refs = [];
		collectRefs(ast, refs);

		var compiled = {
			src: src,
			refs: refs,
			evaluate: function(env)
			{
				var evaluator = new Evaluator(env);

				return evaluator.evalNode(ast);
			}
		};

		compileCache[src] = compiled;
		cacheKeys.push(src);

		if (cacheKeys.length > MAX_CACHE)
		{
			var oldest = cacheKeys.shift();
			delete compileCache[oldest];
		}

		return compiled;
	};

	function evaluate(src, env)
	{
		return compile(src).evaluate(env);
	};

	Hmi.Expr = {
		compile: compile,
		evaluate: evaluate,
		Error: ExprError
	};
})();
