/**
 * Standalone HMI viewer (SRS HMI-RUN-9): runs HMI screens inside the
 * draw.io GraphViewer (viewer.min.js) for embedding in third-party pages.
 *
 * Usage (built bundle js/hmi-viewer.min.js):
 *
 *   <div class="mxgraph" data-mxgraph='{"xml": "...", "hmi": {"sim": "only"}}'></div>
 *   <script src="https://your-host/js/hmi-viewer.min.js"></script>
 *
 * The "hmi" config may be true or {sim, interactive, roles, config}, where
 * config is merged into DRAWIO_CONFIG.hmi (allowedEndpoints, scripts, ...).
 * The runtime API is available as viewer.hmi (see Hmi.Api).
 */
(function()
{
	var root = (typeof globalThis !== 'undefined') ? globalThis : window;
	var Hmi = root.Hmi = root.Hmi || {};

	// Resolves the plugin base path from the bundle location so lazy
	// libraries (lib/mqtt.min.js) load from the same host
	try
	{
		var script = document.currentScript;

		if (script != null && script.src != null && script.src != '')
		{
			Hmi.basePath = script.src.substring(0, script.src.lastIndexOf('/') + 1) +
				'../plugins/hmi/';
		}
	}
	catch (e)
	{
		// ignore
	}

	/**
	 * Minimal EditorUi adapter over a GraphViewer for the HMI runtime.
	 */
	function ViewerUi(viewer)
	{
		var self = this;
		this.viewer = viewer;
		this.editor = new mxEventSource();
		this.editor.graph = viewer.graph;
		this.editor.isChromelessView = function()
		{
			return true;
		};
		this.pages = [];
		this.currentPage = null;
		this.updatePages();

		// Page changes from the viewer toolbar or navigate actions
		var selectPage = viewer.selectPage;

		if (selectPage != null)
		{
			viewer.selectPage = function(number)
			{
				selectPage.apply(this, arguments);
				self.updatePages();
				self.editor.fireEvent(new mxEventObject('pageSelected'));
			};
		}
	};

	/**
	 * Creates page descriptors for the viewer's diagrams.
	 */
	ViewerUi.prototype.updatePages = function()
	{
		var viewer = this.viewer;
		var diagrams = viewer.diagrams || [];
		var pages = [];

		for (var i = 0; i < diagrams.length; i++)
		{
			(function(node, index)
			{
				pages.push({
					node: node,
					index: index,
					root: null,
					getId: function()
					{
						return node.getAttribute('id');
					},
					getName: function()
					{
						return node.getAttribute('name');
					}
				});
			})(diagrams[i], i);
		}

		if (pages.length == 0)
		{
			pages.push({index: 0, root: null, getId: function()
			{
				return 'page';
			}, getName: function()
			{
				return '';
			}});
		}

		this.pages = pages;
		this.currentPage = pages[Math.min(viewer.currentPage || 0, pages.length - 1)];
		this.currentPage.root = viewer.graph.model.getRoot();
	};

	ViewerUi.prototype.updatePageRoot = function(page)
	{
		if (page.root == null && page.node != null)
		{
			var node = Editor.parseDiagramNode(page.node);

			if (node != null)
			{
				page.root = new mxCodec(node.ownerDocument).decode(node).root;
			}
		}

		return page;
	};

	ViewerUi.prototype.selectPage = function(page)
	{
		if (this.viewer.selectPage != null && page.index != null)
		{
			this.viewer.selectPage(page.index);
		}
	};

	ViewerUi.prototype.confirm = function(msg, okFn, cancelFn)
	{
		if (window.confirm(msg))
		{
			okFn();
		}
		else if (cancelFn != null)
		{
			cancelFn();
		}
	};

	ViewerUi.prototype.getCurrentFile = function()
	{
		var viewer = this.viewer;

		return {
			getHash: function()
			{
				return 'viewer:' + window.location.pathname;
			},
			getTitle: function()
			{
				return (viewer.graphConfig != null && viewer.graphConfig.title != null) ?
					viewer.graphConfig.title : document.title;
			}
		};
	};

	ViewerUi.prototype.showDialog = function()
	{
		// Dialogs are not available in the viewer (prompt falls back below)
	};

	var Viewer = {};

	Viewer.ViewerUi = ViewerUi;

	/**
	 * Starts the HMI runtime for the given GraphViewer.
	 */
	Viewer.attach = function(viewer, options)
	{
		if (viewer.graph == null || viewer.hmi != null)
		{
			return null;
		}

		options = (options != null && typeof options === 'object') ? options : {};

		if (options.config != null)
		{
			root.DRAWIO_CONFIG = root.DRAWIO_CONFIG || {};
			root.DRAWIO_CONFIG.hmi = mxUtils.clone(options.config);
		}

		if (Hmi.Resources != null)
		{
			Hmi.Resources.install();
		}

		Hmi.Overlay.install();
		Hmi.LevelFill.install();
		Hmi.Flow.install();
		Graph.customActionHandler = Hmi.Actions.handleCustomAction;

		var graph = viewer.graph;
		graph.enableFlowAnimation = true;
		graph.hmiOverlay = new Hmi.Overlay(graph);

		var ui = new ViewerUi(viewer);
		ui.hmiRoles = options.roles;
		ui.hmi = new Hmi.Api(ui);
		viewer.hmi = ui.hmi;
		graph.refresh();

		ui.hmi.run({mode: 'run', interactive: options.interactive !== false,
			sim: options.sim});

		return ui.hmi;
	};

	/**
	 * Hooks GraphViewer initialization for data-mxgraph configs with "hmi".
	 */
	Viewer.install = function()
	{
		if (typeof GraphViewer === 'undefined' || Viewer.installed)
		{
			return;
		}

		Viewer.installed = true;
		var graphViewerInit = GraphViewer.prototype.init;

		GraphViewer.prototype.init = function(container, xmlNode, graphConfig)
		{
			graphViewerInit.apply(this, arguments);

			if (graphConfig != null && graphConfig.hmi != null && graphConfig.hmi !== false)
			{
				var viewer = this;

				window.setTimeout(function()
				{
					try
					{
						Viewer.attach(viewer, graphConfig.hmi);
					}
					catch (e)
					{
						if (window.console != null)
						{
							console.error('HMI viewer:', e);
						}
					}
				}, 0);
			}
		};
	};

	Hmi.Viewer = Viewer;
	Viewer.install();
})();
