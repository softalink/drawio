// Shared helpers for the HMI end-to-end tests (Playwright + node:test).
var http = require('http');
var fs = require('fs');
var path = require('path');

var WEBAPP = path.resolve(__dirname, '../../../src/main/webapp');

var TYPES = {'.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
	'.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json',
	'.xml': 'application/xml', '.txt': 'text/plain', '.gif': 'image/gif'};

function loadPlaywright()
{
	var candidates = [process.env.PLAYWRIGHT_MODULE, 'playwright',
		'/opt/node22/lib/node_modules/playwright'];

	for (var i = 0; i < candidates.length; i++)
	{
		if (candidates[i] == null)
		{
			continue;
		}

		try
		{
			return require(candidates[i]);
		}
		catch (e)
		{
			// try next
		}
	}

	throw new Error('Playwright not found (set PLAYWRIGHT_MODULE)');
}

// Static file server for the webapp (no caching)
function startStatic(port)
{
	return new Promise(function(resolve)
	{
		var server = http.createServer(function(req, res)
		{
			var url = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
			var file = path.join(WEBAPP, url == '/' ? 'index.html' : url);

			if (file.indexOf(WEBAPP) != 0)
			{
				res.writeHead(403);
				res.end();

				return;
			}

			fs.readFile(file, function(err, data)
			{
				if (err)
				{
					res.writeHead(404);
					res.end();
				}
				else
				{
					res.writeHead(200, {'Content-Type': TYPES[path.extname(file)] ||
						'application/octet-stream', 'Cache-Control': 'no-store'});
					res.end(data);
				}
			});
		});

		server.listen(port || 0, '127.0.0.1', function()
		{
			resolve({server: server, port: server.address().port,
				url: 'http://127.0.0.1:' + server.address().port});
		});
	});
}

var APP_PARAMS = 'splash=0&gapi=0&db=0&od=0&gh=0&gl=0&tr=0&mode=device&sync=none';

async function launch()
{
	var pw = loadPlaywright();
	var opts = {args: ['--js-flags=--expose-gc', '--enable-precise-memory-info']};
	var exe = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

	if (fs.existsSync(exe))
	{
		opts.executablePath = exe;
	}

	return pw.chromium.launch(opts);
}

// Opens the editor with the HMI plugin. extra: additional URL params
async function openEditor(browser, base, extra, hash)
{
	var page = await browser.newPage({viewport: {width: 1400, height: 900}});
	page.hmiErrors = [];
	page.on('pageerror', function(e)
	{
		page.hmiErrors.push(e.message);
	});
	page.on('console', function(m)
	{
		if (m.type() == 'error' && !/404|Failed to load resource|favicon/.test(m.text()))
		{
			page.hmiErrors.push(m.text());
		}
	});
	var dev = (process.env.HMI_E2E_BUNDLE == '1') ? '' : 'dev=1&';
	await page.goto(base + '/index.html?' + dev + 'p=hmi&' + APP_PARAMS +
		(extra ? '&' + extra : '') + (hash || ''), {waitUntil: 'load'});
	await page.waitForFunction(function()
	{
		return window.Hmi != null && Hmi.ui != null && Hmi.ui.hmi != null;
	}, null, {timeout: 60000});

	return page;
}

// Returns a function that waits until predicate() is true in the page
async function waitInPage(page, fn, arg, timeout)
{
	await page.waitForFunction(fn, arg, {timeout: timeout || 10000});
}

module.exports = {WEBAPP: WEBAPP, startStatic: startStatic, launch: launch,
	openEditor: openEditor, waitInPage: waitInPage, APP_PARAMS: APP_PARAMS};
