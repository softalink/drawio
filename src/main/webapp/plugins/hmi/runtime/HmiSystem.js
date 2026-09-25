/**
 * Built-in system tags and alarm presentation (SRS HMI-ALM-2..5,
 * HMI-WGT-14, HMI-WGT-18).
 *
 * System tags (read-only, bindable like any tag):
 *   $alarms          JSON list of active alarms (for mxgraph.hmi.alarmBanner)
 *   $alarmCount      number of active alarms
 *   $alarmUnack      number of unacknowledged alarms
 *   $status/<id>     connection state of a data source (statusIndicator)
 *
 * Cells with style hmiAlarmIndicator=1 bound to an alarmed tag show the
 * severity colour and blink while unacknowledged. Optional audible alarms
 * (runtime.alarmSound) and acknowledgement publishing (runtime.ackTarget).
 */
(function()
{
	var root = (typeof globalThis !== 'undefined') ? globalThis : window;
	var Hmi = root.Hmi = root.Hmi || {};

	var SEVERITY_COLORS = {1: '#D32F2F', 2: '#F57C00', 3: '#FBC02D', 4: '#1976D2'};
	var LAYER = 'trigger';

	function System(rt)
	{
		this.rt = rt;
		this.indicated = {};
		this.audio = null;
	};

	System.SEVERITY_COLORS = SEVERITY_COLORS;

	System.prototype.install = function()
	{
		var self = this;
		var rt = this.rt;

		this.alarmListener = function(evt)
		{
			self.alarmsChanged(evt);
		};
		rt.on('alarm', this.alarmListener);

		this.statusListener = function(status)
		{
			self.statusChanged(status);
		};
		rt.on('status', this.statusListener);

		// Publishes acknowledgements (HMI-ALM-5)
		var ack = rt.alarms.ack;

		rt.alarms.ack = function(tag)
		{
			var changed = ack.apply(this, arguments);
			self.publishAck(tag, changed);

			return changed;
		};

		this.alarmsChanged(null);
		this.statusChanged(rt.sources.status());
	};

	System.prototype.uninstall = function()
	{
		this.rt.off('alarm', this.alarmListener);
		this.rt.off('status', this.statusListener);

		if (this.audio != null)
		{
			try
			{
				this.audio.close();
			}
			catch (e)
			{
				// ignore
			}

			this.audio = null;
		}
	};

	System.prototype.statusChanged = function(status)
	{
		if (status != null)
		{
			var updates = [];

			for (var i = 0; i < status.length; i++)
			{
				updates.push({tag: '$status/' + status[i].id, value: status[i].state,
					source: 'system'});
			}

			this.rt.tags.setMany(updates);
		}
	};

	System.prototype.alarmsChanged = function(evt)
	{
		var rt = this.rt;
		var list = rt.alarms.list();
		var unack = 0;

		list.sort(function(a, b)
		{
			return (a.severity - b.severity) || (b.ts - a.ts);
		});

		for (var i = 0; i < list.length; i++)
		{
			if (list[i].state != 'active-ack')
			{
				unack++;
			}
		}

		rt.tags.setMany([
			{tag: '$alarms', value: list, source: 'system'},
			{tag: '$alarmCount', value: list.length, source: 'system'},
			{tag: '$alarmUnack', value: unack, source: 'system'}
		]);

		this.updateIndicators(list);

		if (evt != null && evt.changed != null)
		{
			this.sound(list, evt.changed);
		}

		rt.requestFlush();
	};

	/**
	 * Applies severity colour and blinking to hmiAlarmIndicator cells.
	 */
	System.prototype.updateIndicators = function(list)
	{
		var rt = this.rt;

		if (rt.index == null)
		{
			return;
		}

		var byTag = {};

		for (var i = 0; i < list.length; i++)
		{
			byTag[list[i].tag] = list[i];
		}

		var seen = {};

		for (var tag in rt.index.tagToCells)
		{
			var cells = rt.index.tagToCells[tag];

			for (var j = 0; j < cells.length; j++)
			{
				var id = cells[j];
				var cell = rt.getCell(id);
				var state = (cell != null) ? rt.graph.view.getState(cell) : null;

				if (state == null || mxUtils.getValue(state.style, 'hmiAlarmIndicator', '0') != '1')
				{
					continue;
				}

				var alarm = byTag[tag];

				// Highest severity of all tags bound to the cell wins
				if (alarm != null && (seen[id] == null || alarm.severity < seen[id].severity))
				{
					seen[id] = alarm;
				}
			}
		}

		for (var id in this.indicated)
		{
			if (seen[id] == null)
			{
				rt.overlay.setStyles(id, {strokeColor: null, strokeWidth: null,
					hmiAlarmState: null}, LAYER);
				rt.animator.stop(id, 'blink');
			}
		}

		for (var id in seen)
		{
			var a = seen[id];
			rt.overlay.setStyles(id, {strokeColor: SEVERITY_COLORS[a.severity] || '#D32F2F',
				strokeWidth: 3, hmiAlarmState: a.state}, LAYER);

			if (a.state == 'active-ack')
			{
				rt.animator.stop(id, 'blink');
			}
			else
			{
				rt.animator.start(id, 'blink');
			}
		}

		this.indicated = seen;
	};

	/**
	 * Plays an alarm tone for new high-severity alarms (HMI-ALM-4). Browsers
	 * only allow audio after a user gesture on the page.
	 */
	System.prototype.sound = function(list, changed)
	{
		var cfg = this.rt.config.runtime.alarmSound;
		var gcfg = Hmi.Runtime.getGlobalConfig().alarmSound;

		if (cfg == null && gcfg == null || cfg === false || gcfg === false)
		{
			return;
		}

		var maxSeverity = (typeof (cfg || gcfg) === 'number') ? (cfg || gcfg) : 2;
		var play = false;

		for (var i = 0; i < list.length; i++)
		{
			if (changed.indexOf(list[i].tag) >= 0 && list[i].state == 'active-unack' &&
				list[i].severity <= maxSeverity)
			{
				play = true;
			}
		}

		if (!play)
		{
			return;
		}

		try
		{
			var Ctx = root.AudioContext || root.webkitAudioContext;

			if (Ctx == null)
			{
				return;
			}

			if (this.audio == null)
			{
				this.audio = new Ctx();
			}

			var ctx = this.audio;

			for (var k = 0; k < 3; k++)
			{
				var osc = ctx.createOscillator();
				var gain = ctx.createGain();
				osc.frequency.value = 880;
				gain.gain.value = 0.15;
				osc.connect(gain);
				gain.connect(ctx.destination);
				osc.start(ctx.currentTime + k * 0.4);
				osc.stop(ctx.currentTime + k * 0.4 + 0.25);
			}
		}
		catch (e)
		{
			this.rt.log('warn', 'alarm', 'Alarm sound failed: ' + e.message);
		}
	};

	/**
	 * Publishes acknowledgements to runtime.ackTarget = {source, topic,
	 * payload} with ${tag}, ${ts} and ${user} placeholders.
	 */
	System.prototype.publishAck = function(tag, changed)
	{
		var rt = this.rt;
		var target = rt.config.runtime.ackTarget;

		if (target == null || target.source == null || changed == null || changed.length == 0)
		{
			return;
		}

		for (var i = 0; i < changed.length; i++)
		{
			var name = changed[i];
			var fill = function(str)
			{
				return (str == null) ? str : String(str).replace(/\$\{tag\}/g, name).
					replace(/\$\{ts\}/g, String(Date.now())).
					replace(/\$\{user\}/g, rt.roles.join(','));
			};
			var payload = fill(target.payload || '{"tag":"${tag}","ack":true,"ts":${ts}}');

			rt.sources.write(target.source, {topic: fill(target.topic), payload: payload,
				message: payload, body: payload, url: fill(target.url), method: target.method,
				qos: target.qos})['catch'](function(e)
			{
				rt.log('warn', 'alarm', 'Acknowledgement publish failed: ' + e.message);
			});
		}
	};

	Hmi.System = System;
})();
