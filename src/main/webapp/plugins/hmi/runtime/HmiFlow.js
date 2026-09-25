/**
 * Additional edge flow animation types (SRS HMI-ANI-3), installed into
 * Graph.flowAnimationRenderers (hook in Graph.addFlowAnimationToNode).
 *
 * Unlike the built-in 'dash' type, these draw an animated layer on top of
 * the edge stroke so the pipe itself keeps its appearance.
 *
 * Style keys: flowAnimationType (dash|dots|beads|arrows|liquid),
 * flowAnimationDuration (ms, default 500), flowAnimationReverse (0|1),
 * flowAnimationColor, flowAnimationWidth.
 *
 * Line animation types follow meta2d.js LineAnimateType (MIT, le5le).
 */
(function()
{
	var root = (typeof globalThis !== 'undefined') ? globalThis : window;
	var Hmi = root.Hmi = root.Hmi || {};

	var Flow = {};

	function createNode(parent, name)
	{
		var doc = parent.ownerDocument;

		return (doc.createElementNS != null) ?
			doc.createElementNS(mxConstants.NS_SVG, name) :
			doc.createElement(name);
	};

	function getDirection(style)
	{
		var dir = mxUtils.getValue(style, 'flowAnimationDirection', 'normal');

		if (mxUtils.getValue(style, 'flowAnimationReverse', '0') == '1')
		{
			dir = (dir == 'reverse') ? 'normal' : 'reverse';
		}

		return dir;
	};

	/**
	 * Adds a dashed, animated clone of the given path.
	 */
	function addDashLayer(node, style, scale, id, dash, gap, width, color, cap, opacity)
	{
		var clone = node.cloneNode(false);
		clone.removeAttribute('stroke-dasharray');
		clone.removeAttribute('marker-start');
		clone.removeAttribute('marker-end');
		clone.removeAttribute('visibility');
		clone.setAttribute('fill', 'none');
		clone.setAttribute('stroke', color);
		clone.setAttribute('stroke-width', Math.max(0.5, width * scale));
		clone.setAttribute('stroke-linecap', cap);
		clone.setAttribute('pointer-events', 'none');
		clone.setAttribute('data-hmi-flow', '1');

		if (opacity != null)
		{
			clone.setAttribute('stroke-opacity', opacity);
		}

		var d = Math.max(0.01, dash * scale);
		var g = Math.max(0.01, gap * scale);
		var sum = d + g;
		clone.setAttribute('stroke-dasharray', d + ' ' + g);

		// Speed in px/s relative to the built-in dash type (16px per duration)
		var duration = Math.max(50, parseInt(mxUtils.getValue(style,
			'flowAnimationDuration', 500)));
		var ms = Math.round((sum / scale / 16) * duration);

		clone.style.animation = id + ' ' + ms + 'ms linear infinite ' + getDirection(style);
		clone.style.strokeDashoffset = sum;

		if (node.nextSibling != null)
		{
			node.parentNode.insertBefore(clone, node.nextSibling);
		}
		else if (node.parentNode != null)
		{
			node.parentNode.appendChild(clone);
		}

		return clone;
	};

	function getWidth(style, def)
	{
		return parseFloat(mxUtils.getValue(style, 'flowAnimationWidth', def));
	};

	function getStrokeWidth(style)
	{
		return parseFloat(mxUtils.getValue(style, mxConstants.STYLE_STROKEWIDTH, 1));
	};

	Flow.renderers = {
		/**
		 * Built-in behaviour.
		 */
		dash: function()
		{
			return false;
		},
		/**
		 * Round dots moving along the line.
		 */
		dots: function(node, style, scale, id)
		{
			var sw = getStrokeWidth(style);
			var w = getWidth(style, Math.max(3, sw * 0.6));
			addDashLayer(node, style, scale, id, 0.01, w * 3, w,
				mxUtils.getValue(style, 'flowAnimationColor', '#FFFFFF'), 'round');
		},
		/**
		 * Larger beads (meta2d Beads).
		 */
		beads: function(node, style, scale, id)
		{
			var sw = getStrokeWidth(style);
			var w = getWidth(style, Math.max(4, sw * 0.8));
			addDashLayer(node, style, scale, id, 0.01, w * 2.2, w,
				mxUtils.getValue(style, 'flowAnimationColor', '#FFEB3B'), 'round');
		},
		/**
		 * Chevrons moving along the line.
		 */
		arrows: function(node, style, scale, id)
		{
			var sw = getStrokeWidth(style);
			var w = getWidth(style, Math.max(2, sw * 0.4));
			var color = mxUtils.getValue(style, 'flowAnimationColor', '#FFFFFF');
			var size = Math.max(6, sw * 1.2);

			// Short thick segments with square caps read as arrows when the
			// marker path is not available (e.g. in exports)
			var layer = addDashLayer(node, style, scale, id, size * 0.5, size * 1.5, w,
				color, 'butt');

			// Adds an arrowhead marker on each dash using a pattern of
			// repeated chevrons along a textPath when supported
			try
			{
				if (layer.getTotalLength != null && node.ownerDocument == document &&
					node.getAttribute('id') == null)
				{
					var len = node.getTotalLength();
					var pathId = 'hmi-flow-path-' + Math.round(Math.random() * 1e9);
					node.setAttribute('id', pathId);
					var text = createNode(node, 'text');
					text.setAttribute('font-size', Math.max(8, size * 1.6) * scale);
					text.setAttribute('fill', color);
					text.setAttribute('dominant-baseline', 'central');
					text.setAttribute('pointer-events', 'none');
					text.setAttribute('data-hmi-flow', '1');
					var textPath = createNode(node, 'textPath');
					textPath.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#' + pathId);
					textPath.setAttribute('href', '#' + pathId);
					var spacing = size * 3 * scale;
					var count = Math.max(1, Math.floor(len / spacing));
					var reverse = getDirection(style) == 'reverse';
					var chevron = reverse ? '‹' : '›';
					var str = '';

					for (var i = 0; i < count; i++)
					{
						str += chevron + '  ';
					}

					textPath.textContent = str;
					text.appendChild(textPath);

					var duration = Math.max(50, parseInt(mxUtils.getValue(style,
						'flowAnimationDuration', 500)));
					var anim = createNode(node, 'animate');
					anim.setAttribute('attributeName', 'startOffset');
					anim.setAttribute('from', reverse ? '0' : String(-spacing));
					anim.setAttribute('to', reverse ? String(-spacing) : '0');
					anim.setAttribute('dur', Math.round((spacing / scale / 16) * duration) + 'ms');
					anim.setAttribute('repeatCount', 'indefinite');
					textPath.appendChild(anim);

					layer.parentNode.removeChild(layer);
					node.parentNode.appendChild(text);
				}
			}
			catch (e)
			{
				// ignore, dash layer stays
			}
		},
		/**
		 * Soft translucent liquid segments inside a pipe.
		 */
		liquid: function(node, style, scale, id)
		{
			var sw = getStrokeWidth(style);
			var w = getWidth(style, Math.max(2, sw * 0.55));
			addDashLayer(node, style, scale, id, w * 4, w * 1.5, w,
				mxUtils.getValue(style, 'flowAnimationColor', '#B3E5FC'), 'round', 0.85);
		}
	};

	/**
	 * Installs the renderers.
	 */
	Flow.install = function()
	{
		Graph.flowAnimationRenderers = Graph.flowAnimationRenderers || {};

		for (var key in Flow.renderers)
		{
			Graph.flowAnimationRenderers[key] = Flow.renderers[key];
		}
	};

	Hmi.Flow = Flow;
})();
