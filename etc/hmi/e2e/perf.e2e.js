// Performance benchmark (SRS HMI-PERF-1/4, plan M6.3).
// Run: node --test --test-concurrency=1 etc/hmi/e2e/perf.e2e.js
// Soak: HMI_SOAK_MINUTES=1440 node --test etc/hmi/e2e/perf.e2e.js
var test = require('node:test');
var assert = require('node:assert');
var util = require('./util.js');

var browser = null;
var web = null;

test.before(async function()
{
	web = await util.startStatic(0);
	browser = await util.launch();
});

test.after(async function()
{
	await browser.close();
	web.server.close();
});

// Builds N bound cells, pushes `rate` updates/s for `seconds` through the
// host source and measures update-to-render latency and main thread load.
async function bench(page, cells, rate, seconds, mix, zoom)
{
	return page.evaluate(async function(args)
	{
		// 0: level, 1: gauge, 2: label. 'uniform' cycles all three, 'typical'
		// is 20% levels, 10% gauges and 70% labels
		Hmi.benchKind = function(i, mix)
		{
			if (mix == 'typical')
			{
				var m = i % 10;

				return (m < 2) ? 0 : ((m < 3) ? 1 : 2);
			}

			return i % 3;
		};

		var ui = Hmi.ui;
		var graph = ui.editor.graph;
		var model = graph.model;
		var parent = graph.getDefaultParent();
		var cols = Math.ceil(Math.sqrt(args.cells));
		var list = [];
		model.beginUpdate();

		try
		{
			for (var i = 0; i < args.cells; i++)
			{
				var kind = Hmi.benchKind(i, args.mix);
				var style = (kind == 0) ? 'shape=cylinder3;size=6;' : ((kind == 1) ?
					'shape=mxgraph.hmi.radialGauge;' : 'text;html=1;');
				var cell = graph.insertVertex(parent, 'c' + i, '', (i % cols) * 70,
					Math.floor(i / cols) * 70, 60, 60, style);
				list.push(cell);
			}

			Hmi.Model.setDocConfig(graph, {version: 1, sim: 'off', triggers: [], tags: [],
				sources: [{id: 'h', name: 'Host', type: 'host', enabled: true}]});

			for (var i = 0; i < list.length; i++)
			{
				var kind = Hmi.benchKind(i, args.mix);
				Hmi.Model.setCellConfig(graph, [list[i]], 'bindings', [{tag: 'T' + i,
					target: (kind == 0) ? 'style:hmiLevel' : ((kind == 1) ? 'prop:value' : 'label'),
					format: (kind == 2) ? {decimals: 1} : undefined}]);
			}
		}
		finally
		{
			model.endUpdate();
		}

		graph.zoomTo(args.zoom);
		var rt = ui.hmi.run({mode: 'run', interactive: false});
		var pushed = {};
		var latencies = [];
		var redraw = rt.overlay.redrawState;

		rt.overlay.redrawState = function(state)
		{
			redraw.apply(this, arguments);
			var t = pushed[state.cell.id];

			if (t != null)
			{
				latencies.push(performance.now() - t);
				delete pushed[state.cell.id];
			}
		};

		var busy = 0;
		var observer = null;

		try
		{
			observer = new PerformanceObserver(function(list)
			{
				list.getEntries().forEach(function(e)
				{
					busy += e.duration;
				});
			});
			observer.observe({entryTypes: ['longtask']});
		}
		catch (e)
		{
			// longtask not supported
		}

		// Latency is measured for cells in the viewport (others are deferred)
		var visible = {};
		var rect = rt.overlay.getVisibleRect();

		for (var i = 0; i < list.length; i++)
		{
			var st = graph.view.getState(list[i]);
			visible[i] = st != null && mxUtils.intersects(rect, st);
		}

		var heap = function()
		{
			if (window.gc != null)
			{
				window.gc();
			}

			return (performance.memory != null) ? performance.memory.usedJSHeapSize : 0;
		};

		// Warm-up so caches and JIT settle before the baseline
		await new Promise(function(r)
		{
			setTimeout(r, 1000);
		});
		var heapStart = heap();
		var heapSamples = [];
		var tick = 50;
		var perTick = Math.max(1, Math.round(args.rate * tick / 1000));
		var next = 0;
		var start = performance.now();

		await new Promise(function(resolve)
		{
			var timer = setInterval(function()
			{
				var values = {};
				var now = performance.now();

				for (var i = 0; i < perTick; i++)
				{
					var idx = (next++) % list.length;
					values['T' + idx] = Math.random() * 100;

					if (pushed['c' + idx] == null && visible[idx])
					{
						pushed['c' + idx] = now;
					}
				}

				rt.setValues(values);

				if (args.seconds > 60 && Math.floor((now - start) / 30000) > heapSamples.length)
				{
					heapSamples.push(Math.round((heap() - heapStart) / 10485.76) / 100);
				}

				if (now - start > args.seconds * 1000)
				{
					clearInterval(timer);
					setTimeout(resolve, 300);
				}
			}, tick);
		});

		var elapsed = performance.now() - start;

		if (observer != null)
		{
			observer.disconnect();
		}

		ui.hmi.stop();
		latencies.sort(function(a, b)
		{
			return a - b;
		});

		return {
			samples: latencies.length,
			p50: latencies[Math.floor(latencies.length * 0.5)],
			p95: latencies[Math.floor(latencies.length * 0.95)],
			busyPct: 100 * busy / elapsed,
			heapDeltaMb: (heap() - heapStart) / 1048576,
			heapSamples: heapSamples,
			frames: rt.diag.counters.frames,
			rate: rt.diag.counters.rate,
			updates: rt.diag.counters.updates
		};
	}, {cells: cells, rate: rate, seconds: seconds, mix: mix || 'uniform', zoom: zoom || 1});
}

test('500 cells at 200 updates/s: p95 latency <= 100 ms (HMI-PERF-1)', async function()
{
	var page = await util.openEditor(browser, web.url);
	var r = await bench(page, 500, 200, 8, 'uniform', 0.4);
	console.log('perf 500/200: ' + JSON.stringify(r));
	assert.ok(r.samples > 300, 'enough samples');
	assert.ok(r.p95 <= 100, 'p95 ' + r.p95.toFixed(1) + ' ms');
	await page.close();
});

test('2000 cells at 1000 updates/s stays interactive (HMI-PERF-4)', async function()
{
	var page = await util.openEditor(browser, web.url);
	var r = await bench(page, 2000, 1000, 8, 'typical', 1);
	console.log('perf 2000/1000 typical: ' + JSON.stringify(r));
	assert.ok(r.busyPct < 50, 'main thread long tasks ' + r.busyPct.toFixed(1) + '%');
	await page.close();
});

test('stress: 2000 widgets all visible degrade gracefully (adaptive rate)', async function()
{
	var page = await util.openEditor(browser, web.url);
	var r = await bench(page, 2000, 1000, 8, 'uniform', 0.25);
	console.log('perf 2000/1000 stress: ' + JSON.stringify(r));

	// Informational: rendering 2000 visible gauges is paint bound; the
	// adaptive rate must keep updates flowing (p50 under 1s)
	assert.ok(r.p50 < 1000, 'p50 ' + r.p50.toFixed(0) + ' ms');
	await page.close();
});

test('soak (set HMI_SOAK_MINUTES to enable)', {skip: process.env.HMI_SOAK_MINUTES == null},
	async function()
{
	var minutes = parseFloat(process.env.HMI_SOAK_MINUTES);
	var page = await util.openEditor(browser, web.url, 'enable-memory-info=1');
	var r = await bench(page, 500, 200, minutes * 60);
	var perHour = r.heapDeltaMb / (minutes / 60);
	console.log('soak: ' + JSON.stringify(r) + ' heap MB/h: ' + perHour);
	assert.ok(perHour < 10, 'heap growth ' + perHour.toFixed(2) + ' MB/h');
	await page.close();
});
