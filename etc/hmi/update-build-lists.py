#!/usr/bin/env python3
"""Regenerates the HMI file lists in etc/build/build.xml from Hmi.FILES in
src/main/webapp/plugins/hmi/hmi.js (run after adding a module)."""
import os
import re

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
HMI_JS = os.path.join(ROOT, 'src/main/webapp/plugins/hmi/hmi.js')
BUILD = os.path.join(ROOT, 'etc/build/build.xml')

# Editor-only modules left out of the standalone viewer bundle
VIEWER_EXCLUDE = re.compile(r'^ui/(?!HmiResources\.js|HmiFaceplate\.js)')

files = re.findall(r"'([^']+\.js)'", re.search(r'Hmi\.FILES = \[(.*?)\];',
	open(HMI_JS).read(), re.S).group(1))
viewer = [f for f in files if not VIEWER_EXCLUDE.match(f)] + ['viewer/HmiViewer.js']

def block(name, items, indent):
	lines = ['<!-- HMI: %s begin -->' % name]
	lines += ['<file name="%s" />' % f for f in items]
	lines += ['<!-- HMI: %s end -->' % name]
	return ('\n' + indent).join(lines)

xml = open(BUILD).read()

for name, items in (('files', files), ('viewer files', viewer)):
	pattern = re.compile(r'([ \t]*)<!-- HMI: %s begin -->.*?<!-- HMI: %s end -->' %
		(re.escape(name), re.escape(name)), re.S)
	match = pattern.search(xml)

	if match is None:
		raise SystemExit('build.xml: missing HMI %s block' % name)

	xml = xml[:match.start()] + match.group(1) + block(name, items, match.group(1)) + \
		xml[match.end():]

open(BUILD, 'w').write(xml)
print('Updated %d plugin and %d viewer files' % (len(files), len(viewer)))
