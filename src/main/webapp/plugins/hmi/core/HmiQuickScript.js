/**
 * Hmi.QuickScript: a small InTouch QuickScript interpreter for touch link
 * scripts (INTOUCH_LINKS.md §6). Tokenizer-free statement parser +
 * asynchronous interpreter; expressions are evaluated by Hmi.Expr in
 * InTouch mode. DOM-free, no eval.
 *
 * Usage: Hmi.QuickScript.compile(src).run(api, env) -> Promise
 *   api = {read(tag), write(tag, value) -> Promise, show, hide, hideSelf,
 *          showAt(name, x, y, 'center'|'topleft'), dialogValueEntry(tag, lo, hi, prompt),
 *          dialogStringEntry(tag, prompt), log(text), ack(tag)}
 *   env = {value, tagEntry, tagDef, alarmOf, prop} (optional extras for Hmi.Expr)
 *
 * Deviations from InTouch: function calls with a result (DialogValueEntry,
 * DialogStringEntry, GetTagValue) can only be used as a whole statement or as
 * the entire right-hand side of an assignment, not inside larger
 * expressions. A FOR loop variable that is not declared with DIM becomes an
 * implicit local. Assigning an undefined value writes nothing.
 */
(function()
{
	var Hmi = (typeof globalThis !== 'undefined' ? globalThis : window).Hmi =
		(typeof globalThis !== 'undefined' ? globalThis : window).Hmi || {};

	var MAX_ITERATIONS = 10000;
	var MAX_SRC_LEN = 100000;
	var RESERVED = { '__proto__': true, 'constructor': true, 'prototype': true };

	/**
	 * QuickScript error with a 1-based line number.
	 */
	function QsError(message, line)
	{
		this.name = 'Hmi.QuickScript.Error';
		this.line = (line == null ? 0 : line);
		this.message = message + (line ? ' (line ' + line + ')' : '');
		this.rawMessage = message;
	};

	QsError.prototype = Object.create(Error.prototype);
	QsError.prototype.constructor = QsError;

	// ---------------------------------------------------------------
	// Splitting into statements
	// ---------------------------------------------------------------

	/**
	 * Splits the source into segments at ';' and newlines (outside strings,
	 * comments and parentheses). Comments become blanks.
	 * Returns [{text, line}].
	 */
	function split(src)
	{
		var segs = [];
		var line = 1;
		var depth = 0;
		var buf = '';
		var bufLine = 0;
		var i = 0;
		var n = src.length;

		function flush()
		{
			var t = buf.replace(/^\s+|\s+$/g, '');

			if (t !== '')
			{
				segs.push({ text: t, line: bufLine });
			}

			buf = '';
			bufLine = 0;
		};

		while (i < n)
		{
			var ch = src.charAt(i);

			if (ch === '{')
			{
				var startLine = line;
				var close = src.indexOf('}', i + 1);

				if (close < 0)
				{
					throw new QsError('unterminated comment', startLine);
				}

				for (var c = i; c <= close; c++)
				{
					if (src.charAt(c) === '\n')
					{
						line++;
					}
				}

				buf += ' ';
				i = close + 1;
				continue;
			}

			if (ch === '"' || ch === '\'')
			{
				var j = i + 1;

				if (bufLine === 0)
				{
					bufLine = line;
				}

				while (j < n && src.charAt(j) !== ch)
				{
					if (src.charAt(j) === '\n')
					{
						throw new QsError('unterminated string', line);
					}

					if (src.charAt(j) === '\\' && (src.charAt(j + 1) === ch || src.charAt(j + 1) === '\\'))
					{
						j++;
					}

					j++;
				}

				if (j >= n)
				{
					throw new QsError('unterminated string', line);
				}

				buf += src.substring(i, j + 1);
				i = j + 1;
				continue;
			}

			if (ch === '(')
			{
				depth++;
			}
			else if (ch === ')' && depth > 0)
			{
				depth--;
			}

			if (ch === '\n')
			{
				line++;

				if (depth === 0)
				{
					flush();
				}
				else
				{
					buf += ' ';
				}

				i++;
				continue;
			}

			if (ch === ';' && depth === 0)
			{
				flush();
				i++;
				continue;
			}

			if (bufLine === 0 && !/\s/.test(ch))
			{
				bufLine = line;
			}

			buf += (ch === '\r' || ch === '\t') ? ' ' : ch;
			i++;
		}

		flush();

		return segs;
	};

	function isWordChar(ch)
	{
		return ch !== '' && /[A-Za-z0-9_$@#.\\\/]/.test(ch);
	};

	/**
	 * Finds the keyword `kw` as a whole word outside strings and
	 * parentheses. Returns the index or -1.
	 */
	function findKeyword(text, kw, from)
	{
		var depth = 0;
		var low = text.toLowerCase();

		for (var i = from || 0; i < text.length; i++)
		{
			var ch = text.charAt(i);

			if (ch === '"' || ch === '\'')
			{
				var j = i + 1;

				while (j < text.length && text.charAt(j) !== ch)
				{
					if (text.charAt(j) === '\\')
					{
						j++;
					}

					j++;
				}

				i = j;
				continue;
			}

			if (ch === '(')
			{
				depth++;
			}
			else if (ch === ')')
			{
				depth--;
			}
			else if (depth === 0 && low.substr(i, kw.length) === kw &&
				!isWordChar(i > 0 ? text.charAt(i - 1) : '') &&
				!isWordChar(i + kw.length < text.length ? text.charAt(i + kw.length) : ''))
			{
				return i;
			}
		}

		return -1;
	};

	/**
	 * Splits argument text at top-level commas.
	 */
	function splitArgs(text)
	{
		var out = [];

		if (text.replace(/\s+/g, '') === '')
		{
			return out;
		}

		var depth = 0;
		var buf = '';

		for (var i = 0; i < text.length; i++)
		{
			var ch = text.charAt(i);

			if (ch === '"' || ch === '\'')
			{
				var j = i + 1;

				while (j < text.length && text.charAt(j) !== ch)
				{
					if (text.charAt(j) === '\\')
					{
						j++;
					}

					j++;
				}

				buf += text.substring(i, j + 1);
				i = j;
				continue;
			}

			if (ch === '(')
			{
				depth++;
			}
			else if (ch === ')')
			{
				depth--;
			}

			if (ch === ',' && depth === 0)
			{
				out.push(buf);
				buf = '';
			}
			else
			{
				buf += ch;
			}
		}

		out.push(buf);

		return out;
	};

	/**
	 * If text is exactly one function call 'name(args)', returns
	 * {name, argText}, else null.
	 */
	function wholeCall(text)
	{
		var m = /^([A-Za-z_]\w*)\s*\(/.exec(text);

		if (m == null)
		{
			return null;
		}

		var depth = 0;

		for (var i = m[0].length - 1; i < text.length; i++)
		{
			var ch = text.charAt(i);

			if (ch === '"' || ch === '\'')
			{
				var j = i + 1;

				while (j < text.length && text.charAt(j) !== ch)
				{
					if (text.charAt(j) === '\\')
					{
						j++;
					}

					j++;
				}

				i = j;
				continue;
			}

			if (ch === '(')
			{
				depth++;
			}
			else if (ch === ')')
			{
				depth--;

				if (depth === 0)
				{
					if (i === text.length - 1)
					{
						return { name: m[1], argText: text.substring(m[0].length, i) };
					}

					return null;
				}
			}
		}

		return null;
	};

	// ---------------------------------------------------------------
	// Statement functions
	// ---------------------------------------------------------------

	// name -> {min, max, tagArg: index of an argument that names a tag (bare identifiers are not read)}
	var STMT_FUNCS = {
		'show': { min: 1, max: 1 },
		'hide': { min: 1, max: 1 },
		'hideself': { min: 0, max: 0 },
		'showat': { min: 3, max: 3 },
		'showtopleftat': { min: 3, max: 3 },
		'dialogvalueentry': { min: 4, max: 4, tagArg: 0 },
		'dialogstringentry': { min: 2, max: 2, tagArg: 0 },
		'logmessage': { min: 1, max: 1 },
		'playsound': { min: 0, max: 99 },
		'ack': { min: 1, max: 1, tagArg: 0 },
		'alarmack': { min: 1, max: 1, tagArg: 0 },
		'settagvalue': { min: 2, max: 2, tagArg: 0 },
		'gettagvalue': { min: 1, max: 1, tagArg: 0 }
	};

	var IDENT_RE = /^[A-Za-z_$@#][A-Za-z0-9_$@#.\\\/]*$/;

	// ---------------------------------------------------------------
	// Parser
	// ---------------------------------------------------------------

	function compileExpr(src, line, refs)
	{
		var text = src.replace(/^\s+|\s+$/g, '');

		if (text === '')
		{
			throw new QsError('missing expression', line);
		}

		try
		{
			var c = Hmi.Expr.compile(text, { intouch: true });

			for (var i = 0; i < c.refs.length; i++)
			{
				if (refs.indexOf(c.refs[i]) < 0)
				{
					refs.push(c.refs[i]);
				}
			}

			return { c: c, src: text };
		}
		catch (e)
		{
			throw new QsError('expression error: ' + e.message, line);
		}
	};

	function parseCall(name, argText, line, refs)
	{
		var low = name.toLowerCase();
		var spec = STMT_FUNCS[low];

		if (spec == null || !Object.prototype.hasOwnProperty.call(STMT_FUNCS, low))
		{
			throw new QsError('unknown function \'' + name + '\'', line);
		}

		var parts = splitArgs(argText);

		if (parts.length < spec.min || parts.length > spec.max)
		{
			throw new QsError('wrong number of arguments for ' + name, line);
		}

		var args = [];

		for (var i = 0; i < parts.length; i++)
		{
			var t = parts[i].replace(/^\s+|\s+$/g, '');

			if (spec.tagArg === i && IDENT_RE.test(t))
			{
				args.push({ name: t });
			}
			else
			{
				args.push(compileExpr(t, line, refs));
			}
		}

		return { type: 'call', fn: low, args: args, line: line };
	};

	function parse(src)
	{
		if (typeof src !== 'string')
		{
			throw new QsError('script source must be a string', 0);
		}

		if (src.length > MAX_SRC_LEN)
		{
			throw new QsError('script too long', 0);
		}

		var queue = split(src);
		var refs = [];
		var decls = [];
		var root = [];
		var stack = [{ kind: 'root', body: root }];

		function cur()
		{
			return stack[stack.length - 1];
		};

		function add(node)
		{
			cur().body.push(node);
		};

		while (queue.length > 0)
		{
			var seg = queue.shift();
			var text = seg.text;
			var line = seg.line;
			var wm = /^([A-Za-z_]\w*)/.exec(text);
			var word = wm != null ? wm[1].toLowerCase() : '';
			var rest = wm != null ? text.substring(wm[1].length) : text;
			var top = cur();
			var idx;

			if (word === 'if' && !/^\s*=/.test(rest))
			{
				idx = findKeyword(text, 'then', 2);

				if (idx < 0)
				{
					throw new QsError('IF without THEN', line);
				}

				var ifNode = { type: 'if', branches: [], line: line };
				var branch = { cond: compileExpr(text.substring(2, idx), line, refs), body: [], line: line };
				ifNode.branches.push(branch);
				add(ifNode);
				stack.push({ kind: 'if', node: ifNode, body: branch.body, line: line });
				var after = text.substring(idx + 4).replace(/^\s+/, '');

				if (after !== '')
				{
					queue.unshift({ text: after, line: line });
				}

				continue;
			}

			if (word === 'elseif' && !/^\s*=/.test(rest))
			{
				if (top.kind !== 'if' || top.sawElse)
				{
					throw new QsError('ELSEIF without IF', line);
				}

				idx = findKeyword(text, 'then', 6);

				if (idx < 0)
				{
					throw new QsError('ELSEIF without THEN', line);
				}

				var eb = { cond: compileExpr(text.substring(6, idx), line, refs), body: [], line: line };
				top.node.branches.push(eb);
				top.body = eb.body;
				var after2 = text.substring(idx + 4).replace(/^\s+/, '');

				if (after2 !== '')
				{
					queue.unshift({ text: after2, line: line });
				}

				continue;
			}

			if (word === 'else' && !/^\s*=/.test(rest))
			{
				if (top.kind !== 'if' || top.sawElse)
				{
					throw new QsError('ELSE without IF', line);
				}

				var elseBranch = { cond: null, body: [], line: line };
				top.node.branches.push(elseBranch);
				top.body = elseBranch.body;
				top.sawElse = true;
				var after3 = rest.replace(/^\s+/, '');

				if (after3 !== '')
				{
					queue.unshift({ text: after3, line: line });
				}

				continue;
			}

			if (word === 'endif' && rest.replace(/\s+/g, '') === '')
			{
				if (top.kind !== 'if')
				{
					throw new QsError('ENDIF without IF', line);
				}

				stack.pop();
				continue;
			}

			if (word === 'for' && !/^\s*=/.test(rest))
			{
				var fm = /^for\s+([A-Za-z_$@#][A-Za-z0-9_$@#.\\\/]*)\s*=([\s\S]*)$/i.exec(text);

				if (fm == null)
				{
					throw new QsError('invalid FOR statement', line);
				}

				var tail = fm[2];
				var toIdx = findKeyword(tail, 'to', 0);

				if (toIdx < 0)
				{
					throw new QsError('FOR without TO', line);
				}

				var stepIdx = findKeyword(tail, 'step', toIdx);
				var forNode = {
					type: 'for',
					name: fm[1],
					from: compileExpr(tail.substring(0, toIdx), line, refs),
					to: compileExpr(tail.substring(toIdx + 2, stepIdx < 0 ? tail.length : stepIdx), line, refs),
					step: stepIdx < 0 ? null : compileExpr(tail.substring(stepIdx + 4), line, refs),
					body: [],
					line: line
				};

				add(forNode);
				stack.push({ kind: 'for', node: forNode, body: forNode.body, line: line });
				continue;
			}

			if (word === 'next' && rest.replace(/\s+/g, '') === '')
			{
				if (top.kind !== 'for')
				{
					throw new QsError('NEXT without FOR', line);
				}

				stack.pop();
				continue;
			}

			if (word === 'return' && rest.replace(/\s+/g, '') === '')
			{
				add({ type: 'return', line: line });
				continue;
			}

			if (word === 'dim' && /^\s/.test(rest))
			{
				var dm = /^dim\s+([\s\S]+?)\s+as\s+(\w+)$/i.exec(text);

				if (dm == null)
				{
					throw new QsError('invalid DIM statement', line);
				}

				var type = dm[2].toLowerCase();

				if (type !== 'integer' && type !== 'real' && type !== 'discrete' && type !== 'message')
				{
					throw new QsError('unknown DIM type \'' + dm[2] + '\'', line);
				}

				var names = dm[1].split(',');

				for (var d = 0; d < names.length; d++)
				{
					var nm = names[d].replace(/^\s+|\s+$/g, '');

					if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(nm) || RESERVED[nm.toLowerCase()])
					{
						throw new QsError('invalid variable name \'' + nm + '\'', line);
					}

					decls.push({ name: nm, type: type });
				}

				continue;
			}

			var am = /^([A-Za-z_$@#][A-Za-z0-9_$@#.\\\/!%&]*)\s*=(?!=)([\s\S]*)$/.exec(text);

			if (am != null)
			{
				var rhs = am[2].replace(/^\s+|\s+$/g, '');
				var wc = wholeCall(rhs);
				var node;

				if (wc != null && STMT_FUNCS[wc.name.toLowerCase()] != null &&
					Object.prototype.hasOwnProperty.call(STMT_FUNCS, wc.name.toLowerCase()))
				{
					node = parseCall(wc.name, wc.argText, line, refs);
					node.assignTo = am[1];
				}
				else
				{
					node = { type: 'assign', target: am[1], expr: compileExpr(rhs, line, refs), line: line };
				}

				add(node);
				continue;
			}

			var cm = wholeCall(text);

			if (cm != null)
			{
				add(parseCall(cm.name, cm.argText, line, refs));
				continue;
			}

			throw new QsError('syntax error: \'' + text.substring(0, 30) + '\'', line);
		}

		if (stack.length > 1)
		{
			var open = cur();
			throw new QsError((open.kind === 'if' ? 'IF without ENDIF' : 'FOR without NEXT'), open.line);
		}

		return { body: root, decls: decls, refs: refs };
	};

	// ---------------------------------------------------------------
	// Interpreter
	// ---------------------------------------------------------------

	function isThenable(x)
	{
		return x != null && typeof x.then === 'function';
	};

	function Context(api, env, program)
	{
		this.api = api || {};
		this.env0 = env || {};
		this.iterations = 0;
		this.vars = Object.create(null);
		this.names = Object.create(null); // lower-case -> declared name

		for (var i = 0; i < program.decls.length; i++)
		{
			var d = program.decls[i];
			this.declare(d.name, d.type === 'message' ? '' : 0);
		}

		var self = this;
		var e = this.env0;

		this.env = {
			value: e.value,
			prop: e.prop,
			tagEntry: e.tagEntry,
			tagDef: e.tagDef,
			alarmOf: e.alarmOf,
			vars: this.vars,
			tag: function(name)
			{
				if (typeof self.api.read === 'function')
				{
					return self.api.read(name);
				}

				return (typeof e.tag === 'function') ? e.tag(name) : undefined;
			}
		};
	};

	Context.prototype.declare = function(name, value)
	{
		this.names[name.toLowerCase()] = name;
		this.vars[name] = value;
	};

	Context.prototype.localName = function(name)
	{
		var low = name.toLowerCase();

		return Object.prototype.hasOwnProperty.call(this.names, low) ? this.names[low] : null;
	};

	Context.prototype.evalExpr = function(ex, line)
	{
		try
		{
			return ex.c.evaluate(this.env);
		}
		catch (e)
		{
			throw new QsError('expression error: ' + e.message, line);
		}
	};

	Context.prototype.assign = function(target, value, line)
	{
		var local = this.localName(target);

		if (local != null)
		{
			this.vars[local] = value;
			return null;
		}

		if (value === undefined)
		{
			return null;
		}

		if (typeof this.api.write !== 'function')
		{
			throw new QsError('api.write is not available', line);
		}

		var r;

		try
		{
			r = this.api.write(target, value);
		}
		catch (e)
		{
			throw new QsError('write failed: ' + (e && e.message ? e.message : e), line);
		}

		if (isThenable(r))
		{
			return Promise.resolve(r).then(function()
			{
				return null;
			}, function(e)
			{
				throw new QsError('write failed: ' + (e && e.message ? e.message : e), line);
			});
		}

		return null;
	};

	/**
	 * Calls an api function; returns {value} or a Promise of {value}.
	 */
	Context.prototype.callApi = function(fn, args, line)
	{
		var api = this.api;
		var vals = [];

		for (var i = 0; i < args.length; i++)
		{
			vals.push(args[i].name != null ? args[i].name : this.evalExpr(args[i], line));
		}

		function need(name)
		{
			if (typeof api[name] !== 'function')
			{
				throw new QsError('api.' + name + ' is not available', line);
			}
		};

		var r;

		switch (fn)
		{
			case 'show':
				need('show');
				r = api.show(vals[0]);
				break;

			case 'hide':
				need('hide');
				r = api.hide(vals[0]);
				break;

			case 'hideself':
				need('hideSelf');
				r = api.hideSelf();
				break;

			case 'showat':
				need('showAt');
				r = api.showAt(vals[0], vals[1], vals[2], 'center');
				break;

			case 'showtopleftat':
				need('showAt');
				r = api.showAt(vals[0], vals[1], vals[2], 'topleft');
				break;

			case 'dialogvalueentry':
				need('dialogValueEntry');
				r = api.dialogValueEntry(vals[0], vals[1], vals[2], vals[3]);
				break;

			case 'dialogstringentry':
				need('dialogStringEntry');
				r = api.dialogStringEntry(vals[0], vals[1]);
				break;

			case 'logmessage':
				need('log');
				r = api.log(vals[0]);
				break;

			case 'playsound':
				if (typeof api.log === 'function')
				{
					api.log('PlaySound ignored');
				}

				r = undefined;
				break;

			case 'ack':
			case 'alarmack':
				need('ack');
				r = api.ack(vals[0]);
				break;

			case 'settagvalue':
				need('write');
				r = api.write(vals[0], vals[1]);
				break;

			case 'gettagvalue':
				need('read');
				r = api.read(vals[0]);
				break;
		}

		if (isThenable(r))
		{
			return Promise.resolve(r).then(function(v)
			{
				return { value: v };
			}, function(e)
			{
				if (e instanceof QsError)
				{
					throw e;
				}

				throw new QsError(fn + ' failed: ' + (e && e.message ? e.message : e), line);
			});
		}

		return { value: r };
	};

	/**
	 * Executes a statement list. Resolves to {ret: true} on RETURN, else null.
	 */
	function runList(list, ctx)
	{
		return new Promise(function(resolve, reject)
		{
			var i = 0;

			function step()
			{
				while (i < list.length)
				{
					var r;

					try
					{
						r = execStmt(list[i++], ctx);
					}
					catch (e)
					{
						reject(e);
						return;
					}

					if (isThenable(r))
					{
						r.then(function(sig)
						{
							if (sig)
							{
								resolve(sig);
							}
							else
							{
								step();
							}
						}, reject);

						return;
					}

					if (r)
					{
						resolve(r);
						return;
					}
				}

				resolve(null);
			};

			step();
		});
	};

	function execStmt(s, ctx)
	{
		switch (s.type)
		{
			case 'assign':
				return ctx.assign(s.target, ctx.evalExpr(s.expr, s.line), s.line);

			case 'return':
				return { ret: true };

			case 'call':
				var res = ctx.callApi(s.fn, s.args, s.line);

				if (isThenable(res))
				{
					return res.then(function(r)
					{
						if (s.assignTo != null)
						{
							return ctx.assign(s.assignTo, r.value, s.line);
						}

						return null;
					});
				}

				if (s.assignTo != null)
				{
					return ctx.assign(s.assignTo, res.value, s.line);
				}

				return null;

			case 'if':
				for (var b = 0; b < s.branches.length; b++)
				{
					var br = s.branches[b];

					if (br.cond == null || Hmi.Expr.isTrue(ctx.evalExpr(br.cond, br.line)))
					{
						return runList(br.body, ctx);
					}
				}

				return null;

			case 'for':
				return execFor(s, ctx);
		}

		throw new QsError('internal: unknown statement ' + s.type, s.line);
	};

	function execFor(s, ctx)
	{
		var from = Number(ctx.evalExpr(s.from, s.line));
		var to = Number(ctx.evalExpr(s.to, s.line));
		var step = s.step != null ? Number(ctx.evalExpr(s.step, s.line)) : 1;

		if (isNaN(from) || isNaN(to) || isNaN(step))
		{
			throw new QsError('FOR bounds must be numbers', s.line);
		}

		if (step === 0)
		{
			throw new QsError('FOR STEP must not be 0', s.line);
		}

		if (ctx.localName(s.name) == null)
		{
			ctx.declare(s.name, from);
		}

		var local = ctx.localName(s.name);
		var i = from;

		return new Promise(function(resolve, reject)
		{
			function next()
			{
				if (step > 0 ? i > to : i < to)
				{
					resolve(null);
					return;
				}

				ctx.iterations++;

				if (ctx.iterations > MAX_ITERATIONS)
				{
					reject(new QsError('loop iteration limit exceeded (' + MAX_ITERATIONS + ')', s.line));
					return;
				}

				ctx.vars[local] = i;

				runList(s.body, ctx).then(function(sig)
				{
					if (sig)
					{
						resolve(sig);
						return;
					}

					i += step;
					next();
				}, reject);
			};

			next();
		});
	};

	/**
	 * compile(src) -> {run(api, env) -> Promise, refs}. Throws
	 * Hmi.QuickScript.Error for syntax errors.
	 */
	function compile(src)
	{
		var program = parse(src);

		return {
			refs: program.refs,
			run: function(api, env)
			{
				var ctx;

				try
				{
					ctx = new Context(api, env, program);
				}
				catch (e)
				{
					return Promise.reject(e);
				}

				return runList(program.body, ctx).then(function()
				{
					return undefined;
				});
			}
		};
	};

	Hmi.QuickScript = {
		compile: compile,
		Error: QsError,
		MAX_ITERATIONS: MAX_ITERATIONS
	};
})();
