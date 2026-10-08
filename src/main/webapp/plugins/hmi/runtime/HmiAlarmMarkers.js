/**
 * Hmi.AlarmMarkers: a warning marker at the top right corner of objects
 * whose tags are in alarm (INTOUCH_LINKS.md §13.3, after the
 * grafana-flowcharting overlay icon).
 *
 * The page option runtime.alarmMarkers switches markers on for every
 * object with tags. The alarmMarker link of an object overrides it: show
 * (optionally for one tag only) or hide. The marker is coloured by the
 * highest severity, blinks while an alarm is unacknowledged and lists the
 * alarm messages as its tooltip. Markers are mxCellOverlays: view state
 * only, never written to the model.
 */
(function()
{
	var root = (typeof globalThis !== 'undefined') ? globalThis : window;
	var Hmi = root.Hmi = root.Hmi || {};

	/**
	 * Marker colours per severity (1 = high, 2 = medium, 3 and more = low).
	 */
	var COLORS = {1: '#E53935', 2: '#FB8C00', 3: '#FDD835'};
	var SIZE = 16;

	function AlarmMarkers(rt)
	{
		this.rt = rt;
		this.cellTags = {};
		this.markers = {};
	};

	/**
	 * SVG data URI of the marker: a warning triangle, blinking (SMIL) while
	 * unacknowledged.
	 */
	AlarmMarkers.image = function(color, blink)
	{
		var anim = blink ? '<animate attributeName="opacity" values="1;0.15;1" dur="1s" ' +
			'repeatCount="indefinite"/>' : '';
		var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">' +
			'<g>' + anim + '<path d="M8 1 L15.5 14.5 L0.5 14.5 Z" fill="' + color +
			'" stroke="#FFFFFF" stroke-width="1" stroke-linejoin="round"/>' +
			'<rect x="7.1" y="5.2" width="1.8" height="5" rx="0.6" fill="#FFFFFF"/>' +
			'<circle cx="8" cy="12.3" r="1" fill="#FFFFFF"/></g></svg>';

		return 'data:image/svg+xml,' + encodeURIComponent(svg);
	};

	/**
	 * Collects the tags of the objects that get markers.
	 */
	AlarmMarkers.prototype.build = function(index)
	{
		this.clear();
		this.cellTags = {};

		if (index == null)
		{
			return;
		}

		var cfgRt = (this.rt.config != null) ? this.rt.config.runtime || {} : {};
		var pageOn = cfgRt.alarmMarkers === true;
		var tagsOf = {};

		for (var tag in index.tagToCells)
		{
			var list = index.tagToCells[tag];

			for (var i = 0; i < list.length; i++)
			{
				(tagsOf[list[i]] = tagsOf[list[i]] || []).push(tag);
			}
		}

		for (var id in index.cells)
		{
			var cfg = index.cells[id];
			var link = (cfg.links != null) ? cfg.links.alarmMarker : null;
			var show = (link != null) ? link.show !== 'hide' : pageOn;

			if (!show)
			{
				continue;
			}

			var tags = (link != null && link.tag) ? [link.tag] : (tagsOf[id] || []);

			if (tags.length > 0)
			{
				this.cellTags[id] = {cell: cfg.cell, tags: tags};
			}
		}

		this.update(null);
	};

	/**
	 * Refreshes the markers of the objects that use the given tags (all
	 * objects when names is null).
	 */
	AlarmMarkers.prototype.update = function(names)
	{
		var filter = null;

		if (names != null)
		{
			filter = {};

			for (var i = 0; i < names.length; i++)
			{
				filter[names[i]] = true;
			}
		}

		for (var id in this.cellTags)
		{
			var entry = this.cellTags[id];

			if (filter != null && !entry.tags.some(function(t) { return filter[t]; }))
			{
				continue;
			}

			this.refresh(id, entry);
		}
	};

	/**
	 * Highest-severity active alarm of the object's tags:
	 * {severity, unacked, messages} or null.
	 */
	AlarmMarkers.prototype.stateOf = function(entry)
	{
		var alarms = this.rt.alarms;

		if (alarms == null || alarms.stateOf == null)
		{
			return null;
		}

		var result = null;
		var list = (alarms.list != null) ? alarms.list() : [];

		for (var i = 0; i < entry.tags.length; i++)
		{
			var st = alarms.stateOf(entry.tags[i]);

			if (st != null && st.active)
			{
				var sev = (st.severity != null) ? st.severity : 2;

				if (result == null)
				{
					result = {severity: sev, unacked: false, messages: []};
				}

				result.severity = Math.min(result.severity, sev);
				result.unacked = result.unacked || !st.acked;

				for (var j = 0; j < list.length; j++)
				{
					if (list[j].tag == entry.tags[i] && list[j].message)
					{
						result.messages.push(list[j].message);
					}
				}
			}
		}

		return result;
	};

	AlarmMarkers.prototype.refresh = function(id, entry)
	{
		var graph = this.rt.graph;
		var st = this.stateOf(entry);
		var visible = this.rt.overlay == null || this.rt.overlay.getVisible == null ||
			this.rt.overlay.getVisible(entry.cell) !== false;
		var key = (st != null && visible) ? st.severity + ':' + (st.unacked ? 'u' : 'a') + ':' +
			st.messages.join('|') : null;
		var old = this.markers[id];

		if ((old != null ? old.key : null) === key)
		{
			return;
		}

		if (old != null)
		{
			graph.removeCellOverlay(entry.cell, old.overlay);
			delete this.markers[id];
		}

		if (key != null)
		{
			var color = COLORS[Math.max(1, Math.min(3, st.severity))] || COLORS[2];
			var img = new mxImage(AlarmMarkers.image(color, st.unacked), SIZE, SIZE);
			var tip = (st.messages.length > 0) ? st.messages.join('\n') : mxResources.get('hmiAlarm') || 'Alarm';
			var overlay = new mxCellOverlay(img, tip, mxConstants.ALIGN_RIGHT, mxConstants.ALIGN_TOP,
				new mxPoint(-2, 2), 'default');
			graph.addCellOverlay(entry.cell, overlay);

			var state = graph.view.getState(entry.cell);
			var shape = (state != null && state.overlays != null) ? state.overlays.get(overlay) : null;

			if (shape != null && shape.node != null)
			{
				shape.node.setAttribute('data-hmi-alarm-marker', st.unacked ? 'unacked' : 'acked');
				shape.node.setAttribute('data-hmi-severity', String(st.severity));
			}

			this.markers[id] = {key: key, overlay: overlay, cell: entry.cell};
		}
	};

	/**
	 * Removes all markers.
	 */
	AlarmMarkers.prototype.clear = function()
	{
		var graph = this.rt.graph;

		for (var id in this.markers)
		{
			graph.removeCellOverlay(this.markers[id].cell, this.markers[id].overlay);
		}

		this.markers = {};
	};

	/**
	 * Number of markers shown (diagnostics and tests).
	 */
	AlarmMarkers.prototype.count = function()
	{
		return Object.keys(this.markers).length;
	};

	Hmi.AlarmMarkers = AlarmMarkers;
})();
