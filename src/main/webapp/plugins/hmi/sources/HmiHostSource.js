/**
 * Hmi.HostSource: no live connection of its own (SRS HMI-SRC-14). Values
 * arrive only via Hmi.HostSource.push(mgr, updates), typically called by
 * the embed layer when it receives {action: "hmiSetValues"} from the host
 * page (HMI-EMB-1). Writes are forwarded to the host via a 'hostWrite'
 * event on the manager, for the embed layer to relay onward.
 */
(function()
{
	var Hmi = (typeof globalThis !== 'undefined' ? globalThis : window).Hmi =
		(typeof globalThis !== 'undefined' ? globalThis : window).Hmi || {};

	function HostSource(def, mgr)
	{
		this.def = def;
		this.mgr = mgr;
	};

	HostSource.prototype.onStatus = function(state, err) {};

	HostSource.prototype.connect = function()
	{
		// No connection to open; a host source is "connected" as soon as it
		// is started, so bindings show live (not stale) quality.
		this.onStatus('connected');
	};

	HostSource.prototype.disconnect = function()
	{
		// Nothing to close.
	};

	HostSource.prototype.write = function(req)
	{
		this.mgr.emit('hostWrite', req);

		return Promise.resolve();
	};

	/**
	 * Feeds host-pushed values (HMI-EMB-1 hmiSetValues) into the tag
	 * pipeline, exactly as any other source would via mgr.receive. Routes
	 * through every configured 'host' source (usually just one).
	 * updates: {tag: value, ...} | [{tag, value, ts, quality}]
	 */
	HostSource.push = function(mgr, updates)
	{
		var results = [];

		for (var id in mgr.sources)
		{
			if (!Object.prototype.hasOwnProperty.call(mgr.sources, id))
			{
				continue;
			}

			var def = mgr.sources[id];

			if (def.type === 'host')
			{
				results.push(mgr.receive(def, updates, {source: def}));
			}
		}

		return Promise.all(results);
	};

	Hmi.HostSource = HostSource;
	Hmi.SourceManager.types['host'] = HostSource;
})();
