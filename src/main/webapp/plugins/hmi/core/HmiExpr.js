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

	// InTouch mode identifier characters (INTOUCH_LINKS.md §1)
	function isItStart(ch)
	{
		return isIdentStart(ch) || ch === '@' || ch === '#';
	};

	function isItPart(ch)
	{
		return isIdentPart(ch) || ch === '@' || ch === '#';
	};

	/**
	 * Reads an InTouch identifier at position i. Besides letters, digits and
	 * _ $ @ #, the characters . / \ ! % & are part of a name when the next
	 * character starts a new name segment (a letter, _ or $), so that
	 * 'Pump1/Run', 'Motor1.Cmd' and 'A\B' are single names while 'a/2', 'a % 2'
	 * and 'a != b' keep their operator meaning.
	 */
	function readItIdent(src, i)
	{
		var n = src.length;
		var start = i;

		while (i < n)
		{
			var ch = src.charAt(i);

			if (isItPart(ch))
			{
				i++;
			}
			else if ((ch === '.' || ch === '/' || ch === '\\' || ch === '!' || ch === '%' || ch === '&') &&
				i + 1 < n && isIdentStart(src.charAt(i + 1)))
			{
				i++;
			}
			else
			{
				break;
			}
		}

		return src.substring(start, i);
	};

	var IT_WORDS = { 'and': '&&', 'or': '||', 'not': '!', 'mod': '%' };

	function tokenize(src, intouch)
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

			if (intouch && ch === '{')
			{
				var close = src.indexOf('}', i + 1);

				if (close < 0)
				{
					throw new ExprError('unterminated comment', start);
				}

				i = close + 1;
				continue;
			}

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

						if (intouch && next !== 'n' && next !== 't' && next !== '\\' &&
							next !== '"' && next !== '\'')
						{
							buf += c;
							i++;
							continue;
						}

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

			if (intouch && isItStart(ch))
			{
				var itName = readItIdent(src, i);
				i += itName.length;
				var word = IT_WORDS[itName.toLowerCase()];

				if (word != null && Object.prototype.hasOwnProperty.call(IT_WORDS, itName.toLowerCase()))
				{
					tokens.push({ type: 'punct', value: word, pos: start });
				}
				else
				{
					tokens.push({ type: 'ident', value: itName, pos: start });
				}

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

			if (intouch && src.substr(i, 2) === '<>')
			{
				i += 2;
				tokens.push({ type: 'punct', value: '!=', pos: start });
				continue;
			}

			if (intouch && ch === '^')
			{
				i++;
				tokens.push({ type: 'punct', value: '**', pos: start });
				continue;
			}

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

			if (intouch && matched === '=')
			{
				matched = '==';
			}

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

	var IT_FUNC_NAMES = ['text', 'stringfromintg', 'stringfromreal', 'strlen', 'strupper',
		'strlower', 'strleft', 'strright', 'strmid', 'strtrim', 'strfromvalue', 'stringtointg',
		'stringtoreal', 'int', 'sqrt', 'exp', 'log', 'log10', 'trunc', 'sgn', 'sin', 'cos', 'tan',
		'arcsin', 'arccos', 'arctan', 'pi'];
	var IT_FUNCS = Object.create(null);

	for (var ifi = 0; ifi < FUNC_NAMES.length; ifi++)
	{
		IT_FUNCS[FUNC_NAMES[ifi]] = true;
	}

	for (var ifj = 0; ifj < IT_FUNC_NAMES.length; ifj++)
	{
		IT_FUNCS[IT_FUNC_NAMES[ifj]] = true;
	}

	function Parser(tokens, src, intouch)
	{
		this.intouch = intouch === true;
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
			var kw = this.intouch ? t.value.toLowerCase() : t.value;

			if (kw === 'true')
			{
				return { type: 'lit', value: true };
			}

			if (kw === 'false')
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

				var fname = this.intouch ? t.value.toLowerCase() : t.value;

				if ((this.intouch ? IT_FUNCS[fname] : FUNCS[fname]) !== true)
				{
					throw new ExprError('unknown function \'' + t.value + '\'', t.pos);
				}

				return { type: 'call', name: fname, args: args, pos: t.pos };
			}

			return { type: 'ident', name: t.value, pos: t.pos };
		}

		throw new ExprError('unexpected token', t.pos);
	};

	function parse(src, intouch)
	{
		var tokens = tokenize(src, intouch);
		var parser = new Parser(tokens, src, intouch);
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

	var DOTFIELDS = { 'value': 1, 'name': 1, 'quality': 1, 'mineu': 1, 'maxeu': 1, 'minraw': 1,
		'maxraw': 1, 'alarm': 1, 'ack': 1, 'timelastmodified': 1 };

	function isDotField(name)
	{
		return Object.prototype.hasOwnProperty.call(DOTFIELDS, String(name).toLowerCase());
	};

	function addRef(out, name)
	{
		if (out.indexOf(name) < 0)
		{
			out.push(name);
		}
	};

	function collectRefs(node, out, intouch)
	{
		if (node == null || typeof node !== 'object')
		{
			return;
		}

		if (intouch && node.type === 'ident')
		{
			var dot = node.name.indexOf('.');

			if (node.name === 'value' || (dot > 0 && node.name.substring(0, dot) === 'value'))
			{
				return;
			}

			addRef(out, node.name);

			var last = node.name.lastIndexOf('.');

			if (last > 0 && isDotField(node.name.substring(last + 1)))
			{
				addRef(out, node.name.substring(0, last));
			}

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
				collectRefs(node.args[i], out, intouch);
			}

			return;
		}

		if (node.type === 'bin')
		{
			collectRefs(node.left, out, intouch);
			collectRefs(node.right, out, intouch);
		}
		else if (node.type === 'unary')
		{
			collectRefs(node.arg, out, intouch);
		}
		else if (node.type === 'cond')
		{
			collectRefs(node.test, out, intouch);
			collectRefs(node.cons, out, intouch);
			collectRefs(node.alt, out, intouch);
		}
		else if (node.type === 'member')
		{
			collectRefs(node.obj, out, intouch);
			collectRefs(node.key, out, intouch);
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

	/**
	 * InTouch discrete truthiness (INTOUCH_LINKS.md §1).
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

	function Evaluator(env, intouch)
	{
		this.env = env || {};
		this.intouch = intouch === true;
		this.steps = 0;
	};

	function itTrunc(x)
	{
		return x < 0 ? Math.ceil(x) : Math.floor(x);
	};

	function itClean(x)
	{
		return Math.round(x * 1e12) / 1e12;
	};

	function itText(env, value, fmt)
	{
		var f = fmt == null ? '' : String(fmt);

		if (Hmi.Format != null && typeof Hmi.Format.applyMask === 'function')
		{
			return Hmi.Format.applyMask(f, value);
		}

		return String(value);
	};

	function itDigits(v, max)
	{
		var d = toNumber(v);

		if (isNaN(d) || d < 0)
		{
			return 0;
		}

		return Math.min(max, Math.floor(d));
	};

	function itStr(v)
	{
		return v == null ? '' : String(v);
	};

	function itStringFromReal(r, precision, type)
	{
		var x = toNumber(r);

		if (isNaN(x))
		{
			return '';
		}

		var p = itDigits(precision, 20);
		var t = type == null ? 'f' : String(type);

		if (t === 'e' || t === 'E')
		{
			var e = x.toExponential(p);

			return t === 'E' ? e.toUpperCase() : e;
		}

		if (t === 'g' || t === 'G')
		{
			var g = String(Number(x.toPrecision(Math.max(1, p || 6))));

			return t === 'G' ? g.toUpperCase() : g;
		}

		return x.toFixed(p);
	};

	function itRound(x, n)
	{
		var f = Math.pow(10, n == null ? 0 : toNumber(n));
		var v = toNumber(x);

		return (v < 0 ? -1 : 1) * Math.round(Math.abs(v) * f + 1e-9) / f;
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
				return (this.intouch ? isTrue(this.evalNode(node.test)) : this.evalNode(node.test)) ?
					this.evalNode(node.cons) : this.evalNode(node.alt);

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

		if (this.intouch)
		{
			return this.evalTagName(node.name);
		}

		if (env.vars != null && Object.prototype.hasOwnProperty.call(env.vars, node.name))
		{
			return env.vars[node.name];
		}

		return undefined;
	};

	/**
	 * Looks up a local variable (exact name first, then case-insensitive).
	 * Returns {found, value}.
	 */
	Evaluator.prototype.lookupVar = function(name)
	{
		var vars = this.env.vars;

		if (vars == null || typeof vars !== 'object')
		{
			return null;
		}

		if (Object.prototype.hasOwnProperty.call(vars, name))
		{
			return { value: vars[name] };
		}

		var lower = name.toLowerCase();

		for (var k in vars)
		{
			if (Object.prototype.hasOwnProperty.call(vars, k) && k.toLowerCase() === lower)
			{
				return { value: vars[k] };
			}
		}

		return null;
	};

	Evaluator.prototype.readTag = function(name)
	{
		if (BLOCKED_KEYS[name] || typeof this.env.tag !== 'function')
		{
			return undefined;
		}

		return this.env.tag(name);
	};

	/**
	 * InTouch bare identifier: local variable, 'value', tag, or dotted
	 * tag / dotfield.
	 */
	Evaluator.prototype.evalTagName = function(name)
	{
		var env = this.env;
		var dot = name.indexOf('.');
		var first = (dot < 0) ? name : name.substring(0, dot);

		var allSegs = name.split('.');

		for (var si = 0; si < allSegs.length; si++)
		{
			if (BLOCKED_KEYS[allSegs[si]] === true)
			{
				return undefined;
			}
		}

		var local = (first === 'value') ? { value: env.value } : this.lookupVar(first);

		if (local != null)
		{
			if (dot < 0)
			{
				return local.value;
			}

			var segs = name.substring(dot + 1).split('.');
			var obj = local.value;

			for (var i = 0; i < segs.length; i++)
			{
				obj = safeGet(obj, segs[i]);
			}

			return obj;
		}

		var v = this.readTag(name);

		if (v !== undefined || dot < 0)
		{
			return v;
		}

		var last = name.lastIndexOf('.');
		var field = name.substring(last + 1).toLowerCase();

		if (last <= 0 || !isDotField(field))
		{
			return undefined;
		}

		return this.dotField(name.substring(0, last), field);
	};

	Evaluator.prototype.dotField = function(prefix, field)
	{
		var env = this.env;
		var entry;

		switch (field)
		{
			case 'value':
				return this.readTag(prefix);

			case 'name':
				return prefix;

			case 'quality':
				entry = (typeof env.tagEntry === 'function') ? env.tagEntry(prefix) : null;

				return (entry != null && (entry.quality === 'good' || entry.quality === 192)) ? 192 : 0;

			case 'mineu':
			case 'minraw':
			case 'maxeu':
			case 'maxraw':
				var def = (typeof env.tagDef === 'function') ? env.tagDef(prefix) : null;

				if (def == null)
				{
					return undefined;
				}

				return (field === 'mineu' || field === 'minraw') ? def.min : def.max;

			case 'alarm':
				var a = (typeof env.alarmOf === 'function') ? env.alarmOf(prefix) : null;

				if (a == null)
				{
					return 0;
				}

				return (a.active !== undefined ? a.active : /^active/.test(String(a.state))) ? 1 : 0;

			case 'ack':
				var al = (typeof env.alarmOf === 'function') ? env.alarmOf(prefix) : null;

				if (al == null)
				{
					return 1;
				}

				if (al.state != null)
				{
					return (al.state === 'active-ack') ? 1 : 0;
				}

				return (al.active === false || al.acked) ? 1 : 0;

			case 'timelastmodified':
				entry = (typeof env.tagEntry === 'function') ? env.tagEntry(prefix) : null;

				return (entry != null) ? entry.ts : undefined;
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

		return this.intouch ? !isTrue(v) : !v;
	};

	Evaluator.prototype.evalBin = function(node)
	{
		if (this.intouch && (node.op === '&&' || node.op === '||'))
		{
			var il = isTrue(this.evalNode(node.left));

			if (node.op === '&&')
			{
				return il ? isTrue(this.evalNode(node.right)) : false;
			}

			return il ? true : isTrue(this.evalNode(node.right));
		}

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

	var NOT_HANDLED = {};

	Evaluator.prototype.evalItCall = function(name, args, env)
	{
		var a0 = args[0];
		var x;

		switch (name)
		{
			case 'text':
			case 'strfromvalue':
				return itText(env, a0, args[1]);

			case 'stringfromintg':
				x = toNumber(a0);
				var base = args.length > 1 ? toNumber(args[1]) : 10;

				if (isNaN(x) || isNaN(base) || base < 2 || base > 36)
				{
					return '';
				}

				return itTrunc(x).toString(Math.floor(base)).toUpperCase();

			case 'stringfromreal':
				return itStringFromReal(a0, args[1], args[2]);

			case 'strlen':
				return itStr(a0).length;

			case 'strupper':
				return itStr(a0).toUpperCase();

			case 'strlower':
				return itStr(a0).toLowerCase();

			case 'strleft':
				return itStr(a0).substring(0, Math.max(0, itTrunc(toNumber(args[1])) || 0));

			case 'strright':
				var rs = itStr(a0);
				var rn = Math.max(0, itTrunc(toNumber(args[1])) || 0);

				return rn === 0 ? '' : rs.substring(Math.max(0, rs.length - rn));

			case 'strmid':
				var ms = itStr(a0);
				var st = Math.max(1, itTrunc(toNumber(args[1])) || 1);
				var ln = args.length > 2 ? Math.max(0, itTrunc(toNumber(args[2])) || 0) : ms.length;

				return ms.substr(st - 1, ln);

			case 'strtrim':
				return itStr(a0).replace(/^\s+|\s+$/g, '');

			case 'stringtointg':
				x = parseFloat(itStr(a0));

				return isNaN(x) ? 0 : itTrunc(x);

			case 'stringtoreal':
				x = parseFloat(itStr(a0));

				return isNaN(x) ? 0 : x;

			case 'int':
			case 'trunc':
				return itTrunc(toNumber(a0));

			case 'round':
				return itRound(a0, args[1]);

			case 'sqrt':
				return Math.sqrt(toNumber(a0));

			case 'exp':
				return Math.exp(toNumber(a0));

			case 'log':
				return Math.log(toNumber(a0));

			case 'log10':
				return Math.log(toNumber(a0)) / Math.LN10;

			case 'sgn':
				x = toNumber(a0);

				return isNaN(x) ? NaN : (x > 0 ? 1 : (x < 0 ? -1 : 0));

			case 'sin':
				return itClean(Math.sin(toNumber(a0) * Math.PI / 180));

			case 'cos':
				return itClean(Math.cos(toNumber(a0) * Math.PI / 180));

			case 'tan':
				return itClean(Math.tan(toNumber(a0) * Math.PI / 180));

			case 'arcsin':
				return itClean(Math.asin(toNumber(a0)) * 180 / Math.PI);

			case 'arccos':
				return itClean(Math.acos(toNumber(a0)) * 180 / Math.PI);

			case 'arctan':
				return itClean(Math.atan(toNumber(a0)) * 180 / Math.PI);

			case 'pi':
				return Math.PI;

			case 'if':
				return isTrue(a0) ? args[1] : args[2];

			case 'bool':
				return isTrue(a0);
		}

		return NOT_HANDLED;
	};

	Evaluator.prototype.evalCall = function(node)
	{
		var env = this.env;
		var args = [];

		for (var i = 0; i < node.args.length; i++)
		{
			args.push(this.evalNode(node.args[i]));
		}

		if (this.intouch)
		{
			var r = this.evalItCall(node.name, args, env);

			if (r !== NOT_HANDLED)
			{
				return r;
			}
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

	function compile(src, opts)
	{
		if (typeof src !== 'string')
		{
			throw new ExprError('expression source must be a string', 0);
		}

		var intouch = opts != null && opts.intouch === true;
		var key = (intouch ? 'i:' : 'n:') + src;

		if (Object.prototype.hasOwnProperty.call(compileCache, key))
		{
			return compileCache[key];
		}

		var ast = parse(src, intouch);
		var refs = [];
		collectRefs(ast, refs, intouch);

		var compiled = {
			src: src,
			refs: refs,
			evaluate: function(env)
			{
				var evaluator = new Evaluator(env, intouch);

				return evaluator.evalNode(ast);
			}
		};

		compileCache[key] = compiled;
		cacheKeys.push(key);

		if (cacheKeys.length > MAX_CACHE)
		{
			var oldest = cacheKeys.shift();
			delete compileCache[oldest];
		}

		return compiled;
	};

	function evaluate(src, env, opts)
	{
		return compile(src, opts).evaluate(env);
	};

	Hmi.Expr = {
		compile: compile,
		evaluate: evaluate,
		isTrue: isTrue,
		Error: ExprError
	};
})();
