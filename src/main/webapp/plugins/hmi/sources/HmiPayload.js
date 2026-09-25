/**
 * Hmi.Payload: maps incoming source messages to tag updates (SRS HMI-SRC,
 * meta2d compatibility). DOM-free (ARCHITECTURE.md §1); uses the global
 * TextDecoder (available in Node and browsers) to decode binary payloads.
 */
(function()
{
	var Hmi = (typeof globalThis !== 'undefined' ? globalThis : window).Hmi =
		(typeof globalThis !== 'undefined' ? globalThis : window).Hmi || {};

	function isPlainObject(v)
	{
		return v != null && typeof v === 'object' && !Array.isArray(v);
	};

	function decodeBytes(message)
	{
		var bytes = message;

		if (message instanceof ArrayBuffer)
		{
			bytes = new Uint8Array(message);
		}

		if (typeof TextDecoder !== 'undefined')
		{
			return new TextDecoder('utf-8').decode(bytes);
		}

		// Fallback (Node without global TextDecoder): decode manually.
		var str = '';

		for (var i = 0; i < bytes.length; i++)
		{
			str += String.fromCharCode(bytes[i]);
		}

		return decodeURIComponent(escape(str));
	};

	function tryParseJson(str)
	{
		try
		{
			return { ok: true, value: JSON.parse(str) };
		}
		catch (e)
		{
			return { ok: false, value: str };
		}
	};

	function coerceScalarString(str)
	{
		var trimmed = str.trim();

		if (trimmed === 'true')
		{
			return true;
		}

		if (trimmed === 'false')
		{
			return false;
		}

		if (trimmed !== '' && !isNaN(trimmed))
		{
			return parseFloat(trimmed);
		}

		return str;
	};

	/**
	 * normalizeMessage(message) -> {kind: 'json'|'scalar'|'object', value}
	 * Decodes strings/binary, parses JSON where possible, and classifies the
	 * result.
	 */
	function normalizeMessage(message)
	{
		var str = null;

		if (message instanceof ArrayBuffer || (typeof Uint8Array !== 'undefined' && message instanceof Uint8Array))
		{
			str = decodeBytes(message);
		}
		else if (typeof message === 'string')
		{
			str = message;
		}
		else if (isPlainObject(message) || Array.isArray(message))
		{
			return { kind: 'object', value: message };
		}
		else
		{
			return { kind: 'scalar', value: message };
		}

		var trimmed = str.trim();

		if (trimmed.charAt(0) === '{' || trimmed.charAt(0) === '[')
		{
			var parsed = tryParseJson(trimmed);

			if (parsed.ok)
			{
				return { kind: 'object', value: parsed.value };
			}
		}

		return { kind: 'scalar', value: coerceScalarString(str) };
	};

	function makeUpdate(tag, value, extra)
	{
		var u = { tag: tag, value: value };

		if (extra != null)
		{
			if (extra.ts != null) u.ts = extra.ts;
			if (extra.quality != null) u.quality = extra.quality;
		}

		return u;
	};

	// ---------------------------------------------------------------
	// flat: { tagA: value, tagB: value, ... } -> one update per key
	// ---------------------------------------------------------------

	function mapFlat(obj)
	{
		var updates = [];

		for (var key in obj)
		{
			if (Object.prototype.hasOwnProperty.call(obj, key))
			{
				updates.push(makeUpdate(key, obj[key]));
			}
		}

		return updates;
	};

	// ---------------------------------------------------------------
	// array: [{tag|id|dataId, value, ts, quality}, ...]
	// ---------------------------------------------------------------

	function itemTagName(item)
	{
		if (item.tag != null) return item.tag;
		if (item.id != null) return item.id;
		if (item.dataId != null) return item.dataId;

		return undefined;
	};

	function mapArray(arr)
	{
		var updates = [];

		for (var i = 0; i < arr.length; i++)
		{
			var item = arr[i];

			if (!isPlainObject(item))
			{
				continue;
			}

			var tag = itemTagName(item);

			if (tag == null)
			{
				continue;
			}

			updates.push(makeUpdate(tag, item.value, item));
		}

		return updates;
	};

	// ---------------------------------------------------------------
	// auto: flat object without id/dataId/tag+value keys, array, or scalar
	// (meta2d socketCallback rules)
	// ---------------------------------------------------------------

	function looksLikeSingleRecord(obj)
	{
		return (obj.id != null || obj.dataId != null || (obj.tag != null && Object.prototype.hasOwnProperty.call(obj, 'value')));
	};

	function mapAuto(message, ctx)
	{
		var norm = normalizeMessage(message);

		if (norm.kind === 'scalar')
		{
			if (ctx != null && ctx.topic != null)
			{
				return [makeUpdate(ctx.topic, norm.value)];
			}

			return [];
		}

		var value = norm.value;

		if (Array.isArray(value))
		{
			return mapArray(value);
		}

		if (isPlainObject(value))
		{
			if (looksLikeSingleRecord(value))
			{
				return mapArray([value]);
			}

			return mapFlat(value);
		}

		return [];
	};

	// ---------------------------------------------------------------
	// topic: template like 'plant/{tag}' or 'plant/{area}/{tag}'
	// ---------------------------------------------------------------

	function mapTopic(message, fmt, ctx)
	{
		var template = (fmt && fmt.template) || '{tag}';
		var topic = (ctx && ctx.topic) || '';

		// Build a regex from the template: '{name}' -> capture group; the
		// LAST placeholder is greedy so it can capture remaining segments
		// (e.g. 'plant/{tag}' on 'plant/a/b' -> tag = 'a/b').
		var names = [];
		var reStr = '^';
		var i = 0;

		while (i < template.length)
		{
			var ch = template.charAt(i);

			if (ch === '{')
			{
				var close = template.indexOf('}', i);
				var name = template.substring(i + 1, close);
				names.push(name);
				var isLast = (template.indexOf('{', close) < 0);
				reStr += isLast ? '(.+)' : '([^/]+)';
				i = close + 1;
			}
			else
			{
				reStr += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
				i++;
			}
		}

		reStr += '$';

		var re = new RegExp(reStr);
		var m = re.exec(topic);

		if (m == null)
		{
			return [];
		}

		var tagParts = [];

		for (var j = 0; j < names.length; j++)
		{
			if (names[j] === 'tag')
			{
				tagParts.push(m[j + 1]);
			}
		}

		var tagName;

		if (tagParts.length > 0)
		{
			tagName = tagParts.join('/');
		}
		else if (names.length > 0)
		{
			// No explicit {tag}: join all captures.
			var all = [];

			for (var k = 0; k < names.length; k++)
			{
				all.push(m[k + 1]);
			}

			tagName = all.join('/');
		}
		else
		{
			tagName = topic;
		}

		var norm = normalizeMessage(message);
		var value = norm.value;
		var extra = null;

		if (norm.kind === 'object' && isPlainObject(value) && Object.prototype.hasOwnProperty.call(value, 'value'))
		{
			extra = value;
			value = value.value;
		}

		return [makeUpdate(tagName, value, extra)];
	};

	// ---------------------------------------------------------------
	// jsonpath: subset. paths: [{tag, path}]. path like $.a.b[0].c, $['x']
	// ---------------------------------------------------------------

	function parsePathSegments(path)
	{
		// Strip leading '$'
		var p = path.charAt(0) === '$' ? path.substring(1) : path;
		var segs = [];
		var re = /\.([A-Za-z_$][\w$]*)|\[(\d+)\]|\['([^']*)'\]|\["([^"]*)"\]/g;
		var m;

		while ((m = re.exec(p)) != null)
		{
			if (m[1] != null) segs.push(m[1]);
			else if (m[2] != null) segs.push(parseInt(m[2], 10));
			else if (m[3] != null) segs.push(m[3]);
			else if (m[4] != null) segs.push(m[4]);
		}

		return segs;
	};

	function getByPath(obj, path)
	{
		var segs = parsePathSegments(path);
		var cur = obj;

		for (var i = 0; i < segs.length; i++)
		{
			if (cur == null)
			{
				return undefined;
			}

			cur = cur[segs[i]];
		}

		return cur;
	};

	function mapJsonPath(message, fmt)
	{
		var norm = normalizeMessage(message);

		if (norm.kind !== 'object')
		{
			return [];
		}

		var paths = (fmt && fmt.paths) || [];
		var updates = [];

		for (var i = 0; i < paths.length; i++)
		{
			var p = paths[i];
			var value = getByPath(norm.value, p.path);

			if (value !== undefined)
			{
				updates.push(makeUpdate(p.tag, value));
			}
		}

		return updates;
	};

	// ---------------------------------------------------------------
	// drawio-update-xml: <updates><update id="cellId" value="..."/></updates>
	// Tiny regex/attribute parser, no DOM (ARCHITECTURE.md §1).
	// ---------------------------------------------------------------

	function parseAttrs(tagStr)
	{
		var attrs = {};
		var re = /([\w:-]+)\s*=\s*"([^"]*)"|([\w:-]+)\s*=\s*'([^']*)'/g;
		var m;

		while ((m = re.exec(tagStr)) != null)
		{
			if (m[1] != null)
			{
				attrs[m[1]] = decodeXmlEntities(m[2]);
			}
			else
			{
				attrs[m[3]] = decodeXmlEntities(m[4]);
			}
		}

		return attrs;
	};

	function decodeXmlEntities(s)
	{
		return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
			.replace(/&quot;/g, '"').replace(/&apos;/g, '\'').replace(/&amp;/g, '&');
	};

	function mapUpdateXml(message)
	{
		var str = (typeof message === 'string') ? message : decodeBytes(message);
		var updates = [];
		var re = /<update\b([^>]*?)\/?>/g;
		var m;

		while ((m = re.exec(str)) != null)
		{
			var attrs = parseAttrs(m[1]);
			var tag = attrs.id != null ? attrs.id : attrs.tag;

			if (tag == null)
			{
				continue;
			}

			updates.push({ tag: tag, value: attrs.value, xml: true, attrs: attrs });
		}

		return updates;
	};

	// ---------------------------------------------------------------
	// public API
	// ---------------------------------------------------------------

	/**
	 * map(message, format, ctx) -> [{tag, value, ts, quality}]
	 * format: {kind, template, paths}; ctx: {topic, source}
	 */
	function map(message, format, ctx)
	{
		var fmt = format || { kind: 'auto' };
		var kind = fmt.kind || 'auto';
		ctx = ctx || {};

		switch (kind)
		{
			case 'flat':
				var normFlat = normalizeMessage(message);

				return (normFlat.kind === 'object' && isPlainObject(normFlat.value)) ? mapFlat(normFlat.value) : [];

			case 'array':
				var normArr = normalizeMessage(message);

				return (normArr.kind === 'object' && Array.isArray(normArr.value)) ? mapArray(normArr.value) : [];

			case 'topic':
				return mapTopic(message, fmt, ctx);

			case 'jsonpath':
				return mapJsonPath(message, fmt);

			case 'drawio-update-xml':
				return mapUpdateXml(message);

			case 'auto':
			default:
				return mapAuto(message, ctx);
		}
	};

	Hmi.Payload = {
		map: map
	};
})();
