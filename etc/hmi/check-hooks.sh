#!/bin/sh
# Verifies the HMI core hooks after merging an upstream draw.io release
# (docs/hmi/IMPLEMENTATION_PLAN.md §8). Exits non-zero on any problem.
#
# Usage: etc/hmi/check-hooks.sh   (from the repository root)

cd "$(dirname "$0")/../.." || exit 2
WEB=src/main/webapp
FAIL=0

fail()
{
	echo "FAIL: $1"
	FAIL=1
}

# file|expected number of "// HMI: begin" markers|signature that must exist
while IFS='|' read -r file count signature
do
	[ -z "$file" ] && continue

	if [ ! -f "$file" ]
	then
		fail "$file missing"
		continue
	fi

	begins=$(grep -c "HMI: begin" "$file")
	ends=$(grep -c "HMI: end" "$file")

	if [ "$begins" -lt "$count" ]
	then
		fail "$file: expected $count HMI hook(s), found $begins"
	fi

	if [ "$begins" != "$ends" ]
	then
		fail "$file: unbalanced HMI markers ($begins begin, $ends end)"
	fi

	if ! grep -qF "$signature" "$file"
	then
		fail "$file: signature not found: $signature"
	fi
done <<LIST
$WEB/js/grapheditor/Graph.js|6|Graph.prototype.addFlowAnimationToNode = function(node, style, scale, id)
$WEB/js/grapheditor/Graph.js|6|mxShape.prototype.paint = function(canvas)
$WEB/js/grapheditor/Graph.js|6|Graph.prototype.replacePlaceholders = function(cell, str, vars, translate)
$WEB/js/grapheditor/Graph.js|6|Graph.prototype.getLabel = function(cell)
$WEB/js/diagramly/Editor.js|3|Graph.prototype.postProcessCellStyle = function(cell, style)
$WEB/js/diagramly/Editor.js|3|Graph.prototype.executeCustomActions = function(actions, done, cell)
$WEB/js/diagramly/EditorUi.js|1|EditorUi.prototype.installMessageHandler = function(fn)
$WEB/js/diagramly/App.js|3|App.pluginRegistry = {
$WEB/js/diagramly/Init.js|2|window.ALLOW_CUSTOM_PLUGINS
$WEB/js/diagramly/Devel.js|2|var csp = hashes + directives;
$WEB/js/bootstrap.js|2|mxIsElectron
$WEB/js/diagramly/sidebar/Sidebar.js|3|Sidebar.prototype.configuration
LIST

# Hooks called by the plugin must still exist in the core
for fn in "Graph.prototype.redrawTransientStyle" "Graph.prototype.getTooltipForCell" \
	"mxGraphView.prototype.updateCellState" "EditorUi.prototype.updatePageRoot" \
	"Graph.prototype.setAttributeForCell" "Graph.prototype.getCellsForTags"
do
	if ! grep -rqF "$fn = function" $WEB/js/grapheditor $WEB/js/diagramly $WEB/mxgraph/src
	then
		fail "core function missing: $fn"
	fi
done

# The build list must match the plugin load order (Hmi.FILES)
node -e '
var fs = require("fs");
var src = fs.readFileSync(process.argv[1], "utf8");
var files = eval("[" + /Hmi\.FILES = \[([\s\S]*?)\];/.exec(src)[1] + "]");
var xml = fs.readFileSync(process.argv[2], "utf8");
var block = /<!-- HMI: files begin -->([\s\S]*?)<!-- HMI: files end -->/.exec(xml);
if (block == null) { console.log("FAIL: build.xml has no HMI file list"); process.exit(1); }
var listed = [], re = /name="([^"]+)"/g, m;
while ((m = re.exec(block[1])) != null) listed.push(m[1]);
if (JSON.stringify(listed) != JSON.stringify(files))
{
	console.log("FAIL: build.xml HMI file list differs from Hmi.FILES");
	console.log("  Hmi.FILES: " + files.join(", "));
	console.log("  build.xml: " + listed.join(", "));
	process.exit(1);
}
' $WEB/plugins/hmi/hmi.js etc/build/build.xml || FAIL=1

if [ "$FAIL" = 0 ]
then
	echo "HMI hooks OK"
fi

exit $FAIL
