/**
 * Hmi.SseSource: Server-Sent Events source (SRS HMI-SRC-5). Browser/Node 22
 * global EventSource. Read-only: write() rejects.
 */
(function()
{
	var Hmi = (typeof globalThis !== 'undefined' ? globalThis : window).Hmi =
		(typeof globalThis !== 'undefined' ? globalThis : window).Hmi || {};

	function SseSource(def, mgr)
	{
		this.def = def;
		this.mgr = mgr;
		this.es = null;
		this.closed = false;
		this.listeners = [];
	};

	SseSource.prototype.onStatus = function(state, err) {};

	SseSource.prototype.connect = function()
	{
		var self = this;
		var def = this.def;
		var es;

		try
		{
			es = new EventSource(def.url, {withCredentials: !!def.withCredentials});
		}
		catch (e)
		{
			this.onStatus('error', e);

			return;
		}

		this.es = es;

		es.onopen = function()
		{
			if (!self.closed)
			{
				self.onStatus('connected');
			}
		};

		var events = (def.events != null && def.events.length > 0) ? def.events : ['message'];

		for (var i = 0; i < events.length; i++)
		{
			(function(eventName)
			{
				var listener = function(e)
				{
					if (self.closed)
					{
						return;
					}

					self.mgr.receive(def, e.data, {source: def, event: eventName});
				};

				es.addEventListener(eventName, listener);
				self.listeners.push({name: eventName, fn: listener});
			})(events[i]);
		}

		es.onerror = function()
		{
			if (self.closed)
			{
				return;
			}

			self.onStatus('error', new Error('SSE connection error'));

			try
			{
				es.close();
			}
			catch (e)
			{
				// Ignore.
			}
		};
	};

	SseSource.prototype.disconnect = function()
	{
		this.closed = true;

		if (this.es != null)
		{
			try
			{
				for (var i = 0; i < this.listeners.length; i++)
				{
					this.es.removeEventListener(this.listeners[i].name, this.listeners[i].fn);
				}

				this.es.onopen = null;
				this.es.onerror = null;
				this.es.close();
			}
			catch (e)
			{
				// Ignore.
			}

			this.es = null;
		}

		this.listeners = [];
	};

	SseSource.prototype.write = function(req)
	{
		return Promise.reject(new Error('SSE is read-only'));
	};

	Hmi.SseSource = SseSource;
	Hmi.SourceManager.types['sse'] = SseSource;
})();
