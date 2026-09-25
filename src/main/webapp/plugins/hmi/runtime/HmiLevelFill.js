/**
 * Level fill for any vertex shape (SRS HMI-ANI-4).
 *
 * Installed as mxShape.levelFillPainter and invoked by the paint hook in
 * Graph.js after a shape with an hmiLevel style has been painted. Draws a
 * rectangle through the canvas API (so it works for display and SVG
 * export) and clips it to the filled outline elements of the shape.
 *
 * Style keys: hmiLevel, hmiLevelMin (0), hmiLevelMax (100), hmiLevelColor
 * (#3A8EE6), hmiLevelDirection (up|down|left|right), hmiLevelOpacity (80).
 */
(function()
{
	var root = (typeof globalThis !== 'undefined') ? globalThis : window;
	var Hmi = root.Hmi = root.Hmi || {};

	var LevelFill = {};
	var counter = 0;

	LevelFill.defaultColor = '#3A8EE6';

	/**
	 * Returns the normalized level (0..1) or null if invalid.
	 */
	LevelFill.getFraction = function(style)
	{
		var value = parseFloat(style.hmiLevel);

		if (isNaN(value))
		{
			return null;
		}

		var min = parseFloat(mxUtils.getValue(style, 'hmiLevelMin', 0));
		var max = parseFloat(mxUtils.getValue(style, 'hmiLevelMax', 100));

		if (isNaN(min) || isNaN(max) || max == min)
		{
			return null;
		}

		return Math.max(0, Math.min(1, (value - min) / (max - min)));
	};

	function isFillNode(node)
	{
		if (node.nodeType != 1)
		{
			return false;
		}

		var name = node.nodeName.toLowerCase();

		if (name != 'path' && name != 'rect' && name != 'ellipse' &&
			name != 'circle' && name != 'polygon')
		{
			return false;
		}

		var fill = node.getAttribute('fill');

		return fill != null && fill != 'none' && fill != 'transparent' &&
			node.getAttribute('visibility') != 'hidden';
	};

	/**
	 * Paints the level for the given shape on the given canvas. startIndex
	 * is the number of child nodes of canvas.root before the shape painted.
	 */
	LevelFill.paint = function(shape, c, startIndex)
	{
		var style = shape.style;
		var fraction = LevelFill.getFraction(style);

		if (fraction == null || c.root == null || shape.bounds == null ||
			typeof mxSvgCanvas2D === 'undefined' || !(c instanceof mxSvgCanvas2D))
		{
			return;
		}

		var rootNode = c.root;
		var fills = [];
		var lastFill = null;

		for (var i = startIndex; i < rootNode.childNodes.length; i++)
		{
			var node = rootNode.childNodes[i];

			if (isFillNode(node))
			{
				fills.push(node);
				lastFill = node;
			}
		}

		if (fills.length == 0 || fraction <= 0)
		{
			return;
		}

		var s = shape.scale;
		var x = shape.bounds.x / s;
		var y = shape.bounds.y / s;
		var w = shape.bounds.width / s;
		var h = shape.bounds.height / s;

		if (shape.isPaintBoundsInverted())
		{
			var t = (w - h) / 2;
			x += t;
			y -= t;
			var tmp = w;
			w = h;
			h = tmp;
		}

		var dir = mxUtils.getValue(style, 'hmiLevelDirection', 'up');
		var lx = x, ly = y, lw = w, lh = h;

		if (dir == 'down')
		{
			lh = h * fraction;
		}
		else if (dir == 'left')
		{
			lw = w * fraction;
			lx = x + w - lw;
		}
		else if (dir == 'right')
		{
			lw = w * fraction;
		}
		else
		{
			lh = h * fraction;
			ly = y + h - lh;
		}

		var count = rootNode.childNodes.length;

		c.save();
		c.setShadow(false);
		c.setDashed(false);
		c.setAlpha(parseFloat(mxUtils.getValue(style, 'hmiLevelOpacity', 80)) / 100);
		c.setFillAlpha(1);
		c.setFillColor(mxUtils.getValue(style, 'hmiLevelColor', LevelFill.defaultColor));
		c.rect(lx, ly, lw, lh);
		c.fill();
		c.restore();

		if (rootNode.childNodes.length <= count)
		{
			return;
		}

		var levelNode = rootNode.childNodes[rootNode.childNodes.length - 1];
		levelNode.setAttribute('pointer-events', 'none');
		levelNode.setAttribute('data-hmi-level', '1');

		var doc = rootNode.ownerDocument;
		var ns = mxConstants.NS_SVG;
		var create = function(name)
		{
			return (doc.createElementNS != null) ? doc.createElementNS(ns, name) :
				doc.createElement(name);
		};

		var id = 'hmi-level-' + (++counter) + '-' + Math.round(Math.random() * 1e6);
		var clip = create('clipPath');
		clip.setAttribute('id', id);

		for (var i = 0; i < fills.length; i++)
		{
			var clone = fills[i].cloneNode(false);
			clone.removeAttribute('stroke');
			clone.removeAttribute('stroke-width');
			clone.removeAttribute('filter');
			clone.removeAttribute('style');
			clip.appendChild(clone);
		}

		var group = create('g');
		group.setAttribute('clip-path', 'url(#' + id + ')');
		group.setAttribute('pointer-events', 'none');
		group.appendChild(clip);
		rootNode.removeChild(levelNode);
		group.appendChild(levelNode);

		// Level is drawn above the fill but below later strokes and details
		if (lastFill.nextSibling != null)
		{
			rootNode.insertBefore(group, lastFill.nextSibling);
		}
		else
		{
			rootNode.appendChild(group);
		}
	};

	/**
	 * Installs the painter used by the core hook.
	 */
	LevelFill.install = function()
	{
		mxShape.levelFillPainter = LevelFill.paint;
	};

	Hmi.LevelFill = LevelFill;
})();
