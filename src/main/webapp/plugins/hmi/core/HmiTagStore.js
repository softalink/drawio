/**
 * Hmi.TagStore: in-memory tag value store (SRS HMI-TAG-1..7).
 * DOM-free (ARCHITECTURE.md §1).
 */
(function()
{
	var Hmi = (typeof globalThis !== 'undefined' ? globalThis : window).Hmi =
		(typeof globalThis !== 'undefined' ? globalThis : window).Hmi || {};

	function defaultLog(level, category, message, data)
	{
		if (typeof console !== 'undefined' && console[level])
		{
			console[level]('[' + category + '] ' + message, data || '');
		}
	};

	/**
	 * new TagStore({log})
	 */
	function TagStore(opts)
	{
		opts = opts || {};
		this.log = opts.log || defaultLog;
		this.defs = {};       // name -> TagDef
		this.entries = {};    // name -> {value, quality, ts, source, prev}
		this.listeners = [];
		this.dirty = {};      // name -> true, cleared by takeDirty()
		this.evaluating = {}; // cycle guard for derived tags
	};

	TagStore.prototype.define = function(tagDefs)
	{
		if (tagDefs == null)
		{
			return;
		}

		for (var i = 0; i < tagDefs.length; i++)
		{
			var def = tagDefs[i];

			if (def == null || def.name == null || def.name === '')
			{
				continue;
			}

			this.defs[def.name] = def;

			if (!Object.prototype.hasOwnProperty.call(this.entries, def.name) && def.initial !== undefined)
			{
				this.entries[def.name] = {
					value: def.initial,
					quality: 'good',
					ts: Date.now(),
					source: 'initial',
					prev: undefined
				};
			}
		}

		// Recompute derived tags whose defs just changed, once all defs are in.
		for (var j = 0; j < tagDefs.length; j++)
		{
			var d = tagDefs[j];

			if (d != null && d.expr != null && d.expr !== '')
			{
				this.recomputeDerived(d.name);
			}
		}
	};

	TagStore.prototype.getDef = function(name)
	{
		return this.defs[name] || null;
	};

	/**
	 * Finds derived tag defs that reference `changedName`, directly, and
	 * recomputes them (guarding against cycles).
	 */
	TagStore.prototype.propagateDerived = function(changedNames, seen)
	{
		seen = seen || {};

		for (var name in this.defs)
		{
			if (!Object.prototype.hasOwnProperty.call(this.defs, name))
			{
				continue;
			}

			var def = this.defs[name];

			if (def.expr == null || def.expr === '')
			{
				continue;
			}

			if (seen[name])
			{
				continue;
			}

			var refs = this.exprRefs(def.expr);

			for (var i = 0; i < changedNames.length; i++)
			{
				if (refs.indexOf(changedNames[i]) >= 0)
				{
					seen[name] = true;
					this.recomputeDerived(name, seen);
					break;
				}
			}
		}
	};

	TagStore.prototype.exprRefs = function(expr)
	{
		try
		{
			return Hmi.Expr.compile(expr).refs;
		}
		catch (e)
		{
			this.log('warn', 'tagstore', 'invalid derived-tag expression', { expr: expr, error: String(e) });

			return [];
		}
	};

	TagStore.prototype.recomputeDerived = function(name, seen)
	{
		if (this.evaluating[name])
		{
			this.log('warn', 'tagstore', 'derived tag cycle detected', { tag: name });

			return;
		}

		var def = this.defs[name];

		if (def == null || def.expr == null || def.expr === '')
		{
			return;
		}

		this.evaluating[name] = true;

		try
		{
			var store = this;

			var env = {
				tag: function(n) { return store.getValue(n); },
				vars: {}
			};

			var value = Hmi.Expr.evaluate(def.expr, env);
			var changed = this.setInternal(name, value, { quality: 'good', source: 'derived' }, true);

			if (changed)
			{
				this.propagateDerived([name], seen);
			}
		}
		catch (e)
		{
			this.log('warn', 'tagstore', 'derived tag evaluation failed', { tag: name, error: String(e) });
		}
		finally
		{
			this.evaluating[name] = false;
		}
	};

	TagStore.prototype.setInternal = function(name, value, opts, isDerived)
	{
		opts = opts || {};
		var def = this.defs[name];
		var quality = opts.quality || 'good';
		var coercedValue = value;

		if (def != null && def.type != null && value !== undefined)
		{
			var result = Hmi.Format.coerce(value, def.type);

			if (result.ok)
			{
				coercedValue = result.value;
			}
			else
			{
				quality = 'bad';
				var existing = this.entries[name];
				coercedValue = existing ? existing.value : value;
			}
		}

		var prevEntry = this.entries[name];
		var prevValue = prevEntry ? prevEntry.value : undefined;

		var changed = !prevEntry || prevEntry.value !== coercedValue || prevEntry.quality !== quality;

		this.entries[name] = {
			value: coercedValue,
			quality: quality,
			ts: opts.ts != null ? opts.ts : Date.now(),
			source: opts.source,
			prev: prevValue
		};

		if (changed)
		{
			this.dirty[name] = true;
			this.notify(name, this.entries[name]);
		}

		return changed;
	};

	/**
	 * set(name, value, {quality, ts, source}) -> bool changed
	 */
	TagStore.prototype.set = function(name, value, opts)
	{
		var changed = this.setInternal(name, value, opts, false);

		if (changed)
		{
			this.propagateDerived([name]);
		}

		return changed;
	};

	/**
	 * setMany([{tag, value, quality, ts, source}]) -> [changedNames]
	 */
	TagStore.prototype.setMany = function(updates)
	{
		var changedNames = [];

		if (updates == null)
		{
			return changedNames;
		}

		for (var i = 0; i < updates.length; i++)
		{
			var u = updates[i];

			if (u == null || u.tag == null)
			{
				continue;
			}

			var changed = this.setInternal(u.tag, u.value, { quality: u.quality, ts: u.ts, source: u.source }, false);

			if (changed)
			{
				changedNames.push(u.tag);
			}
		}

		if (changedNames.length > 0)
		{
			this.propagateDerived(changedNames);
		}

		return changedNames;
	};

	/**
	 * get(name) -> {value, quality, ts, source, prev} | null
	 */
	TagStore.prototype.get = function(name)
	{
		var e = this.entries[name];

		if (e == null)
		{
			return null;
		}

		return { value: e.value, quality: e.quality, ts: e.ts, source: e.source, prev: e.prev };
	};

	TagStore.prototype.getValue = function(name)
	{
		var e = this.entries[name];

		return e == null ? undefined : e.value;
	};

	TagStore.prototype.names = function()
	{
		var out = {};
		var name;

		for (name in this.defs)
		{
			if (Object.prototype.hasOwnProperty.call(this.defs, name))
			{
				out[name] = true;
			}
		}

		for (name in this.entries)
		{
			if (Object.prototype.hasOwnProperty.call(this.entries, name))
			{
				out[name] = true;
			}
		}

		var result = [];

		for (name in out)
		{
			if (Object.prototype.hasOwnProperty.call(out, name))
			{
				result.push(name);
			}
		}

		return result;
	};

	/**
	 * takeDirty() -> [names changed since the last call]
	 */
	TagStore.prototype.takeDirty = function()
	{
		var names = [];

		for (var name in this.dirty)
		{
			if (Object.prototype.hasOwnProperty.call(this.dirty, name))
			{
				names.push(name);
			}
		}

		this.dirty = {};

		return names;
	};

	TagStore.prototype.onChange = function(fn)
	{
		this.listeners.push(fn);
	};

	TagStore.prototype.offChange = function(fn)
	{
		var idx = this.listeners.indexOf(fn);

		if (idx >= 0)
		{
			this.listeners.splice(idx, 1);
		}
	};

	TagStore.prototype.notify = function(name, entry)
	{
		for (var i = 0; i < this.listeners.length; i++)
		{
			try
			{
				this.listeners[i](name, entry);
			}
			catch (e)
			{
				this.log('error', 'tagstore', 'onChange listener threw', { tag: name, error: String(e) });
			}
		}
	};

	/**
	 * checkStale(now) -> [names that became stale]
	 */
	TagStore.prototype.checkStale = function(now)
	{
		now = now != null ? now : Date.now();
		var staleNames = [];

		for (var name in this.defs)
		{
			if (!Object.prototype.hasOwnProperty.call(this.defs, name))
			{
				continue;
			}

			var def = this.defs[name];

			if (def.staleMs == null || def.staleMs <= 0)
			{
				continue;
			}

			var entry = this.entries[name];

			if (entry == null || entry.quality === 'stale')
			{
				continue;
			}

			if (now - entry.ts > def.staleMs)
			{
				entry.quality = 'stale';
				this.dirty[name] = true;
				staleNames.push(name);
				this.notify(name, this.get(name));
			}
		}

		return staleNames;
	};

	TagStore.prototype.clear = function()
	{
		this.defs = {};
		this.entries = {};
		this.dirty = {};
		this.evaluating = {};
	};

	Hmi.TagStore = TagStore;
})();
