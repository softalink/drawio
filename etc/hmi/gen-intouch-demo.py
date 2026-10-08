#!/usr/bin/env python3
"""Generates templates/hmi/intouch_links_demo.xml.

The demo shows every InTouch animation link (plugins/hmi/INTOUCH_LINKS.md)
on six pages: display links, touch links, meta2d extensions, features from
grafana-flowcharting, an overlay window and a popup window. Run from the repository root:

    python3 etc/hmi/gen-intouch-demo.py
"""

import json
import os
from xml.sax.saxutils import quoteattr

OUT = os.path.join('src', 'main', 'webapp', 'templates', 'hmi', 'intouch_links_demo.xml')

TAGS = [
    # Display link sources (simulated)
    {'name': 'Level', 'type': 'number', 'access': 'r', 'min': 0, 'max': 100, 'decimals': 1,
     'initial': 50, 'sim': {'kind': 'sine', 'min': 0, 'max': 100, 'period': 12000, 'interval': 250}},
    {'name': 'Angle', 'type': 'number', 'access': 'r', 'min': 0, 'max': 100, 'initial': 0,
     'sim': {'kind': 'ramp', 'min': 0, 'max': 100, 'step': 2, 'interval': 200}},
    {'name': 'Pump', 'type': 'boolean', 'access': 'r', 'initial': True,
     'sim': {'kind': 'toggle', 'interval': 2500}},
    {'name': 'Mode', 'type': 'string', 'access': 'r', 'initial': 'AUTO',
     'sim': {'kind': 'list', 'values': ['AUTO', 'MANUAL', 'OFF'], 'interval': 3000}},
    {'name': 'Temp', 'type': 'number', 'access': 'r', 'unit': 'C', 'min': 0, 'max': 120,
     'decimals': 1, 'initial': 50, 'alarms': {'lolo': 10, 'lo': 25, 'hi': 80, 'hihi': 100},
     'sim': {'kind': 'sine', 'min': 0, 'max': 115, 'period': 24000, 'interval': 250}},
    {'name': 'Pressure', 'type': 'number', 'access': 'r', 'min': 0, 'max': 100, 'decimals': 1,
     'initial': 50, 'alarms': {'target': 50, 'minorDev': 12, 'majorDev': 25},
     'sim': {'kind': 'sine', 'min': 15, 'max': 85, 'period': 16000, 'interval': 250}},
    {'name': 'Flow', 'type': 'number', 'access': 'r', 'min': 0, 'max': 100, 'decimals': 1,
     'initial': 0, 'alarms': {'roc': 20},
     'sim': {'kind': 'sine', 'min': 0, 'max': 100, 'period': 9000, 'interval': 250}},
    {'name': 'HighAlarm', 'type': 'boolean', 'access': 'r', 'initial': False,
     'alarms': {'bool': True}, 'sim': {'kind': 'toggle', 'interval': 4000}},
    # Operator controlled (local, writable)
    {'name': 'Enable', 'type': 'boolean', 'access': 'rw', 'local': True, 'initial': True},
    {'name': 'Show', 'type': 'boolean', 'access': 'rw', 'local': True, 'initial': True},
    {'name': 'SetPoint', 'type': 'number', 'access': 'rw', 'local': True, 'min': 0, 'max': 100,
     'initial': 50},
    {'name': 'Speed', 'type': 'number', 'access': 'rw', 'local': True, 'min': 0, 'max': 1500,
     'initial': 750},
    {'name': 'Operator', 'type': 'string', 'access': 'rw', 'local': True, 'initial': 'Operator'},
    {'name': 'Password', 'type': 'string', 'access': 'rw', 'local': True, 'initial': ''},
    {'name': 'Cmd', 'type': 'boolean', 'access': 'rw', 'local': True, 'initial': False},
    {'name': 'SliderX', 'type': 'number', 'access': 'rw', 'local': True, 'min': 0, 'max': 100,
     'initial': 50},
    {'name': 'SliderY', 'type': 'number', 'access': 'rw', 'local': True, 'min': 0, 'max': 100,
     'initial': 50},
    {'name': 'PbDirect', 'type': 'boolean', 'access': 'rw', 'local': True, 'initial': False},
    {'name': 'PbReverse', 'type': 'boolean', 'access': 'rw', 'local': True, 'initial': True},
    {'name': 'PbToggle', 'type': 'boolean', 'access': 'rw', 'local': True, 'initial': False},
    {'name': 'PbLatch', 'type': 'boolean', 'access': 'rw', 'local': True, 'initial': False},
    {'name': 'Counter', 'type': 'number', 'access': 'rw', 'local': True, 'initial': 0},
    {'name': 'Held', 'type': 'number', 'access': 'rw', 'local': True, 'initial': 0},
    {'name': 'Hover', 'type': 'boolean', 'access': 'rw', 'local': True, 'initial': False},
    # meta2d extension links
    {'name': 'Rpm', 'type': 'number', 'access': 'r', 'min': 0, 'max': 60, 'initial': 30,
     'sim': {'kind': 'sine', 'min': 0, 'max': 60, 'period': 20000, 'interval': 500}},
    {'name': 'Status', 'type': 'integer', 'access': 'r', 'initial': 0,
     'sim': {'kind': 'list', 'values': [0, 1, 2, 3], 'interval': 3000}},
    {'name': 'FlowOn', 'type': 'boolean', 'access': 'r', 'initial': True,
     'sim': {'kind': 'toggle', 'interval': 6000}},
    {'name': 'Recipe', 'type': 'string', 'access': 'rw', 'local': True, 'initial': 'A'},
    {'name': 'Batch', 'type': 'number', 'access': 'rw', 'local': True, 'min': 0, 'max': 10,
     'initial': 5},
    {'name': 'Changes', 'type': 'number', 'access': 'rw', 'local': True, 'initial': 0},
    {'name': 'HighCount', 'type': 'number', 'access': 'rw', 'local': True, 'initial': 0},
    {'name': 'Animate', 'type': 'boolean', 'access': 'rw', 'local': True, 'initial': True},
    # Features from grafana-flowcharting
    {'name': 'Step', 'type': 'number', 'access': 'r', 'min': 0, 'max': 100, 'initial': 10,
     'sim': {'kind': 'list', 'values': [10, 90, 35, 75, 50], 'interval': 2500}},
    {'name': 'Sensor', 'type': 'number', 'access': 'r', 'min': 0, 'max': 100, 'initial': 42,
     'sim': {'kind': 'list', 'values': [42, 47, 44, 51], 'interval': 8000}},
    {'name': 'Manual', 'type': 'number', 'access': 'rw', 'local': True, 'initial': 0},
    {'name': 'Message', 'type': 'string', 'access': 'r', 'initial': 'Pump OK',
     'sim': {'kind': 'list', 'values': ['Pump OK', 'Pump WARNING: vibration', 'Valve ALARM: stuck',
                                         'Valve ok'], 'interval': 3000}},
]

RUNTIME = {'fit': 'page', 'panZoom': True, 'nav': 'tabs', 'maxRate': 30, 'quality': 'outline',
           'theme': 'default', 'width': 1280, 'height': 720,
           'blink': {'slow': 1000, 'medium': 500, 'fast': 250}}


class Page(object):
    def __init__(self, pid, name, doc, width=1280, height=720):
        self.pid = pid
        self.name = name
        self.doc = doc
        self.width = width
        self.height = height
        self.cells = []
        self.seq = 0

    def nid(self):
        self.seq += 1
        return '%s-%d' % (self.pid, self.seq)

    def add(self, x, y, w, h, style, label='', links=None, cid=None, extra=None):
        cid = cid or self.nid()
        geo = '<mxGeometry x="%s" y="%s" width="%s" height="%s" as="geometry"/>' % (x, y, w, h)
        cell = '<mxCell style=%s vertex="1" parent="1">%s</mxCell>' % (quoteattr(style), geo)

        if links is not None or extra is not None:
            attrs = 'label=%s' % quoteattr(label)

            if links is not None:
                attrs += ' hmiLinks=%s' % quoteattr(json.dumps(links, separators=(',', ':')))

            for k, v in (extra or {}).items():
                attrs += ' %s=%s' % (k, quoteattr(v))

            self.cells.append('<object id=%s %s>%s</object>' % (quoteattr(cid), attrs, cell))
        else:
            self.cells.append('<mxCell id=%s value=%s style=%s vertex="1" parent="1">%s</mxCell>' % (
                quoteattr(cid), quoteattr(label), quoteattr(style), geo))

        return cid

    def text(self, x, y, w, h, label, size=11, bold=False, color='#455A64', align='left'):
        return self.add(x, y, w, h, 'text;html=1;whiteSpace=wrap;align=%s;verticalAlign=middle;'
                        'fontSize=%d;fontColor=%s;%s' % (align, size, color,
                                                        'fontStyle=1;' if bold else ''), label)

    def tile(self, x, y, w, h, title, note=None):
        self.add(x, y, w, h, 'rounded=1;arcSize=4;html=1;fillColor=#F5F7F8;strokeColor=#CFD8DC;')
        self.text(x + 8, y + 4, w - 16, 18, title, 12, True, '#263238')

        if note:
            self.text(x + 8, y + h - 20, w - 16, 16, note, 9, False, '#78909C')

    def xml(self):
        doc = json.dumps(self.doc, separators=(',', ':'))
        return ('<diagram id=%s name=%s><mxGraphModel dx="1400" dy="800" grid="1" gridSize="10" '
                'guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" '
                'pageWidth="%d" pageHeight="%d" math="0" shadow="0"><root>'
                '<object id="0" hmi=%s><mxCell/></object><mxCell id="1" parent="0"/>%s'
                '</root></mxGraphModel></diagram>') % (
            quoteattr(self.pid), quoteattr(self.name), self.width, self.height,
            quoteattr(doc), ''.join(self.cells))


BOX = 'rounded=0;html=1;whiteSpace=wrap;fillColor=#90CAF9;strokeColor=#1565C0;strokeWidth=2;'
LABEL = 'rounded=1;html=1;whiteSpace=wrap;fillColor=#FFFFFF;strokeColor=#90A4AE;fontSize=14;'
BUTTON = ('rounded=1;html=1;whiteSpace=wrap;fillColor=#1E88E5;strokeColor=#1565C0;'
          'fontColor=#FFFFFF;fontSize=12;fontStyle=1;')


def display_page():
    doc = {'version': 1, 'sim': 'only', 'runtime': RUNTIME, 'scripts': 'inherit',
           'sources': [], 'tags': TAGS, 'triggers': []}
    p = Page('itd-display', 'Display Links', doc)
    p.text(20, 8, 900, 30, 'InTouch animation links: display links', 20, True, '#263238')
    p.text(20, 36, 1200, 18, 'Each tile shows one link of AVEVA InTouch Visualization Guide '
           'chapter 4. Select an object and choose Animation Links... to see its configuration.',
           11)

    W, H, X0, Y0, DX, DY = 300, 155, 20, 64, 312, 163

    def pos(c, r):
        return X0 + c * DX, Y0 + r * DY

    # Row 0: value displays
    x, y = pos(0, 0)
    p.tile(x, y, W, H, 'Value Display: Discrete', 'Pump: On/Off messages')
    p.add(x + 60, y + 50, 180, 50, LABEL, 'Pump ?', {
        'valueDiscrete': {'expr': 'Pump', 'onMessage': 'RUNNING', 'offMessage': 'STOPPED'}},
        cid='itd-value-discrete')

    x, y = pos(1, 0)
    p.tile(x, y, W, H, 'Value Display: Analog', 'Field text "Level = #.# %" is the mask')
    p.add(x + 40, y + 50, 220, 50, LABEL, 'Level = #.# %', {
        'valueAnalog': {'expr': 'Level', 'format': {'mode': 'text'}}}, cid='itd-value-analog')

    x, y = pos(2, 0)
    p.tile(x, y, W, H, 'Value Display: String', 'Expression with string functions')
    p.add(x + 40, y + 50, 220, 50, LABEL, 'Mode', {
        'valueString': {'expr': '"Mode: " + StrUpper(Mode)'}}, cid='itd-value-string')

    x, y = pos(3, 0)
    p.tile(x, y, W, H, 'Advanced Formatting', 'Fixed decimal / exponential / hex')
    p.add(x + 10, y + 40, 135, 30, LABEL + 'fontSize=12;', '###.##', {
        'valueAnalog': {'expr': 'Level', 'format': {'mode': 'fixed', 'precision': 2}}},
        cid='itd-format-fixed')
    p.add(x + 155, y + 40, 135, 30, LABEL + 'fontSize=12;', '0.0E+00', {
        'valueAnalog': {'expr': 'Level * 1000', 'format': {'mode': 'exponential', 'precision': 2}}},
        cid='itd-format-exp')
    p.add(x + 10, y + 80, 135, 30, LABEL + 'fontSize=12;', 'HEX', {
        'valueAnalog': {'expr': 'Int(Level)', 'format': {'mode': 'hex', 'bitsFrom': 0, 'bitsTo': 15}}},
        cid='itd-format-hex')
    p.add(x + 155, y + 80, 135, 30, LABEL + 'fontSize=12;', 'BIN', {
        'valueAnalog': {'expr': 'Int(Level)', 'format': {'mode': 'binary', 'bitsFrom': 0, 'bitsTo': 7}}},
        cid='itd-format-bin')

    # Row 1: location, orientation, size
    x, y = pos(0, 1)
    p.tile(x, y, W, H, 'Location: Horizontal and Vertical', 'Level moves the box 0..220 px / 0..80 px')
    p.add(x + 20, y + 110, 30, 20, BOX, '', {
        'locationH': {'expr': 'Level', 'atLeft': 0, 'atRight': 100, 'toLeft': 0, 'toRight': 230}},
        cid='itd-location-h')
    p.add(x + 260, y + 105, 20, 20, BOX + 'fillColor=#FFCC80;strokeColor=#EF6C00;', '', {
        'locationV': {'expr': 'Level', 'atTop': 100, 'atBottom': 0, 'up': 75, 'down': 0}},
        cid='itd-location-v')

    x, y = pos(1, 1)
    p.tile(x, y, W, H, 'Orientation', 'Angle 0..100 rotates 0..360 deg about an offset centre')
    p.add(x + 100, y + 34, 100, 100, 'ellipse;html=1;fillColor=#FFFFFF;strokeColor=#B0BEC5;')
    p.add(x + 143, y + 40, 14, 50, 'triangle;direction=north;html=1;fillColor=#EF5350;'
          'strokeColor=#B71C1C;', '', {
              'orientation': {'expr': 'Angle', 'valueAtMaxCCW': 0, 'valueAtMaxCW': 100,
                              'ccwRotation': 0, 'cwRotation': 360, 'offsetX': 0, 'offsetY': 19}},
          cid='itd-orientation')
    p.add(x + 145, y + 79, 10, 10, 'ellipse;html=1;fillColor=#263238;strokeColor=none;')

    x, y = pos(2, 1)
    p.tile(x, y, W, H, 'Object Size: Height and Width', 'Height anchored bottom, width anchored left')
    p.add(x + 30, y + 30, 50, 100, BOX, '', {
        'sizeHeight': {'expr': 'Level', 'valueAtMin': 0, 'valueAtMax': 100, 'minPercent': 10,
                       'maxPercent': 100, 'anchor': 'bottom'}}, cid='itd-size-height')
    p.add(x + 110, y + 70, 170, 30, BOX + 'fillColor=#A5D6A7;strokeColor=#2E7D32;', '', {
        'sizeWidth': {'expr': 'Level', 'valueAtMin': 0, 'valueAtMax': 100, 'minPercent': 5,
                      'maxPercent': 100, 'anchor': 'left'}}, cid='itd-size-width')

    x, y = pos(3, 1)
    p.tile(x, y, W, H, 'Percent Fill: Vertical and Horizontal',
           'Fills with the object colour over the background')
    p.add(x + 30, y + 30, 70, 100, 'shape=cylinder3;html=1;boundedLbl=1;size=8;'
          'fillColor=#42A5F5;strokeColor=#1565C0;', '', {
              'fillVertical': {'expr': 'Level', 'valueAtMin': 0, 'valueAtMax': 100, 'minPercent': 0,
                               'maxPercent': 100, 'direction': 'up', 'backgroundColor': '#ECEFF1'}},
          cid='itd-fill-vertical')
    p.add(x + 120, y + 65, 160, 30, 'rounded=0;html=1;fillColor=#66BB6A;strokeColor=#2E7D32;', '', {
        'fillHorizontal': {'expr': 'Level', 'valueAtMin': 0, 'valueAtMax': 100, 'minPercent': 0,
                           'maxPercent': 100, 'direction': 'right', 'backgroundColor': '#FFFFFF'}},
        cid='itd-fill-horizontal')

    # Row 2: colours
    x, y = pos(0, 2)
    p.tile(x, y, W, H, 'Fill Colour: Discrete and Analog', 'Pump on/off; Level breakpoints')
    p.add(x + 20, y + 40, 120, 70, 'rounded=1;html=1;fillColor=#9E9E9E;strokeColor=#424242;'
          'fontColor=#FFFFFF;fontStyle=1;', 'PUMP', {
              'fillColor': {'kind': 'discrete', 'expr': 'Pump', 'offColor': '#9E9E9E',
                            'onColor': '#43A047'}}, cid='itd-color-discrete')
    p.add(x + 160, y + 40, 120, 70, 'rounded=1;html=1;fillColor=#9E9E9E;strokeColor=#424242;'
          'fontStyle=1;', 'LEVEL', {
              'fillColor': {'kind': 'analog', 'expr': 'Level', 'breakpoints': [
                  {'value': 0, 'color': '#E3F2FD'}, {'value': 20, 'color': '#90CAF9'},
                  {'value': 40, 'color': '#42A5F5'}, {'value': 60, 'color': '#1E88E5'},
                  {'value': 80, 'color': '#E53935'}]}}, cid='itd-color-analog')

    x, y = pos(1, 2)
    p.tile(x, y, W, H, 'Line and Text Colour: Alarms', 'Discrete alarm; value alarm (5 colours)')
    p.add(x + 20, y + 40, 120, 70, 'rounded=1;html=1;fillColor=#FFFFFF;strokeColor=#9E9E9E;'
          'strokeWidth=4;', 'HighAlarm', {
              'lineColor': {'kind': 'discreteAlarm', 'tag': 'HighAlarm', 'normalColor': '#9E9E9E',
                            'alarmColor': '#E53935'}}, cid='itd-color-discrete-alarm')
    p.add(x + 160, y + 40, 120, 70, LABEL + 'fontStyle=1;fontSize=16;', 'Temp ###.# C', {
        'valueAnalog': {'expr': 'Temp', 'format': {'mode': 'text'}},
        'textColor': {'kind': 'analogAlarm', 'tag': 'Temp', 'alarmType': 'value', 'colors': {
            'normal': '#2E7D32', 'lolo': '#6A1B9A', 'lo': '#1565C0', 'hi': '#EF6C00',
            'hihi': '#C62828'}}}, cid='itd-color-value-alarm')

    x, y = pos(2, 2)
    p.tile(x, y, W, H, 'Analog Alarm: Deviation and ROC', 'Pressure vs 50 (12/25); Flow rate > 20/s')
    p.add(x + 20, y + 40, 120, 70, 'rounded=1;html=1;fillColor=#A5D6A7;strokeColor=#424242;', 'Pressure', {
        'fillColor': {'kind': 'analogAlarm', 'tag': 'Pressure', 'alarmType': 'deviation',
                      'colors': {'normal': '#A5D6A7', 'minor': '#FFE082', 'major': '#EF9A9A'}}},
        cid='itd-color-deviation')
    p.add(x + 160, y + 40, 120, 70, 'rounded=1;html=1;fillColor=#A5D6A7;strokeColor=#424242;', 'Flow', {
        'fillColor': {'kind': 'analogAlarm', 'tag': 'Flow', 'alarmType': 'roc',
                      'colors': {'normal': '#A5D6A7', 'roc': '#CE93D8'}}}, cid='itd-color-roc')

    x, y = pos(3, 2)
    p.tile(x, y, W, H, 'Blink', 'Invisible (fast) / colours (slow) while HighAlarm')
    p.add(x + 20, y + 40, 120, 70, 'ellipse;html=1;fillColor=#E53935;strokeColor=#B71C1C;'
          'fontColor=#FFFFFF;fontStyle=1;', 'ALARM', {
              'blink': {'expr': 'HighAlarm', 'mode': 'invisible', 'speed': 'fast'}},
          cid='itd-blink-invisible')
    p.add(x + 160, y + 40, 120, 70, 'rounded=1;html=1;fillColor=#FFFFFF;strokeColor=#424242;'
          'fontColor=#212121;fontStyle=1;', 'WARNING', {
              'blink': {'expr': 'HighAlarm', 'mode': 'visible', 'speed': 'slow',
                        'textColor': '#FFFFFF', 'lineColor': '#F57F17', 'fillColor': '#FBC02D'}},
          cid='itd-blink-visible')

    # Row 3: visibility, disable, tooltip
    x, y = pos(0, 3)
    p.tile(x, y, W, H, 'Visibility', 'Visible while Show = 1 (toggle on Touch Links)')
    p.add(x + 70, y + 40, 160, 70, 'rounded=1;html=1;fillColor=#FFF59D;strokeColor=#F9A825;fontStyle=1;',
          'I am visible', {'visibility': {'expr': 'Show', 'visibleState': 'on'}},
          cid='itd-visibility')

    x, y = pos(1, 3)
    p.tile(x, y, W, H, 'Disable', 'Touch disabled while Enable = 0')
    p.add(x + 70, y + 40, 160, 70, BUTTON, 'Toggle Cmd', {
        'pushDiscrete': {'tag': 'Cmd', 'action': 'toggle'},
        'disable': {'expr': 'Enable', 'disabledState': 'off'},
        'fillColor': {'kind': 'discrete', 'expr': 'Enable', 'offColor': '#B0BEC5',
                      'onColor': '#1E88E5'}}, cid='itd-disable')

    x, y = pos(2, 3)
    p.tile(x, y, W, H, 'Tooltip', 'Static text and expression tooltips')
    p.add(x + 20, y + 40, 120, 70, LABEL, 'Hover me', {
        'tooltip': {'mode': 'static', 'text': 'Static tooltip text'}}, cid='itd-tooltip-static')
    p.add(x + 160, y + 40, 120, 70, LABEL, 'Hover me too', {
        'tooltip': {'mode': 'expression', 'expr': '"Level is " + Text(Level, "#.0") + " %"'}},
        cid='itd-tooltip-expr')

    x, y = pos(3, 3)
    p.tile(x, y, W, H, 'Combined links', 'Location + fill colour + value on one object')
    p.add(x + 20, y + 50, 90, 50, 'rounded=1;html=1;fillColor=#90CAF9;strokeColor=#1565C0;fontStyle=1;',
          '###', {
              'locationH': {'expr': 'Level', 'atLeft': 0, 'atRight': 100, 'toLeft': 0, 'toRight': 170},
              'fillColor': {'kind': 'analog', 'expr': 'Level', 'breakpoints': [
                  {'value': 0, 'color': '#90CAF9'}, {'value': 75, 'color': '#EF9A9A'}]},
              'valueAnalog': {'expr': 'Level', 'format': {'mode': 'text'}}}, cid='itd-combined')
    return p


def touch_page():
    p = Page('itd-touch', 'Touch Links', {'version': 1, 'sources': [], 'tags': [], 'triggers': []})
    p.text(20, 8, 900, 30, 'InTouch animation links: touch links', 20, True, '#263238')
    p.text(20, 36, 1200, 18, 'Run the screen to operate these objects. Key equivalents are '
           'shown in brackets.', 11)

    W, H, X0, Y0, DX, DY = 300, 205, 20, 64, 312, 215

    def pos(c, r):
        return X0 + c * DX, Y0 + r * DY

    # Row 0: user inputs
    x, y = pos(0, 0)
    p.tile(x, y, W, H, 'User Input: Discrete', 'Set/Reset prompt; label shows the state [Ctrl+D]')
    p.add(x + 50, y + 40, 200, 50, LABEL, 'Cmd', {
        'inputDiscrete': {'tag': 'Cmd', 'key': {'key': 'D', 'ctrl': True, 'shift': False},
                          'message': 'Set the command', 'setPrompt': 'Start', 'resetPrompt': 'Stop',
                          'onMessage': 'Cmd: ON', 'offMessage': 'Cmd: OFF', 'inputOnly': False}},
        cid='itd-input-discrete')
    p.add(x + 50, y + 110, 200, 50, LABEL, 'Show', {
        'inputDiscrete': {'tag': 'Show', 'message': 'Show the object on Display Links?',
                          'setPrompt': 'Show', 'resetPrompt': 'Hide', 'onMessage': 'Visible: YES',
                          'offMessage': 'Visible: NO'}}, cid='itd-input-show')

    x, y = pos(1, 0)
    p.tile(x, y, W, H, 'User Input: Analog', 'Inline editor / keypad, limits 0..100 / 0..1500')
    p.add(x + 50, y + 40, 200, 50, LABEL, 'SP ###.#', {
        'inputAnalog': {'tag': 'SetPoint', 'keypad': False, 'message': 'Set point', 'min': 0,
                        'max': 100, 'format': {'mode': 'text'}}}, cid='itd-input-analog')
    p.add(x + 50, y + 110, 200, 50, LABEL, 'Speed #### rpm', {
        'inputAnalog': {'tag': 'Speed', 'key': {'key': 'F2', 'ctrl': False, 'shift': False},
                        'keypad': True, 'message': 'Motor speed', 'min': 0, 'max': 'Speed.MaxEU',
                        'format': {'mode': 'text'}}}, cid='itd-input-keypad')

    x, y = pos(2, 0)
    p.tile(x, y, W, H, 'User Input: String', 'Keyboard / password echo (stored as SHA-256)')
    p.add(x + 50, y + 40, 200, 50, LABEL, 'Operator', {
        'inputString': {'tag': 'Operator', 'keypad': True, 'message': 'Operator name', 'echo': 'yes'}},
        cid='itd-input-string')
    p.add(x + 50, y + 110, 200, 50, LABEL, 'Password', {
        'inputString': {'tag': 'Password', 'keypad': False, 'message': 'Password', 'echo': 'password',
                        'passwordChar': '*', 'encrypt': True}}, cid='itd-input-password')

    x, y = pos(3, 0)
    p.tile(x, y, W, H, 'Enable / Disable', 'Writes Enable for the Disable demo')
    p.add(x + 50, y + 40, 200, 50, BUTTON, 'Enable = 1', {
        'pushDiscrete': {'tag': 'Enable', 'action': 'set'}}, cid='itd-enable-set')
    p.add(x + 50, y + 110, 200, 50, BUTTON + 'fillColor=#757575;strokeColor=#424242;', 'Enable = 0', {
        'pushDiscrete': {'tag': 'Enable', 'action': 'reset'}}, cid='itd-enable-reset')

    # Row 1: sliders and pushbuttons
    x, y = pos(0, 1)
    p.tile(x, y, W, H, 'Slider: Horizontal', 'Drag the knob: SliderX 0..100')
    p.add(x + 30, y + 90, 240, 6, 'rounded=1;html=1;fillColor=#B0BEC5;strokeColor=none;')
    p.add(x + 20, y + 78, 20, 30, 'rounded=1;html=1;fillColor=#1E88E5;strokeColor=#0D47A1;', '', {
        'sliderH': {'tag': 'SliderX', 'atLeft': 0, 'atRight': 100, 'toLeft': 0, 'toRight': 240,
                    'reference': 'center'}}, cid='itd-slider-h')
    p.add(x + 90, y + 130, 120, 30, LABEL, 'X = ###.#', {
        'valueAnalog': {'expr': 'SliderX', 'format': {'mode': 'text'}}}, cid='itd-slider-h-value')

    x, y = pos(1, 1)
    p.tile(x, y, W, H, 'Slider: Vertical', 'Drag the knob: SliderY 0..100')
    p.add(x + 77, y + 35, 6, 150, 'rounded=1;html=1;fillColor=#B0BEC5;strokeColor=none;')
    p.add(x + 65, y + 175, 30, 20, 'rounded=1;html=1;fillColor=#43A047;strokeColor=#1B5E20;', '', {
        'sliderV': {'tag': 'SliderY', 'atTop': 100, 'atBottom': 0, 'up': 150, 'down': 0,
                    'reference': 'middle'}}, cid='itd-slider-v')
    p.add(x + 140, y + 90, 120, 30, LABEL, 'Y = ###.#', {
        'valueAnalog': {'expr': 'SliderY', 'format': {'mode': 'text'}}}, cid='itd-slider-v-value')

    x, y = pos(2, 1)
    p.tile(x, y, W, H, 'Pushbuttons: Discrete Value', 'Direct / Reverse / Toggle / Set / Reset')
    specs = [('Direct', 'PbDirect', 'direct', 'itd-push-direct', None),
             ('Reverse', 'PbReverse', 'reverse', 'itd-push-reverse', None),
             ('Toggle', 'PbToggle', 'toggle', 'itd-push-toggle', {'key': 'T', 'ctrl': True, 'shift': False}),
             ('Set', 'PbLatch', 'set', 'itd-push-set', None),
             ('Reset', 'PbLatch', 'reset', 'itd-push-reset', None)]

    for i, (label, tag, action, cid, key) in enumerate(specs):
        bx = x + 10 + (i % 3) * 95
        by = y + 35 + (i // 3) * 80
        p.add(bx, by, 85, 34, BUTTON, label, {'pushDiscrete': {'tag': tag, 'action': action, 'key': key}},
              cid=cid)
        p.add(bx + 30, by + 40, 24, 24, 'ellipse;html=1;fillColor=#9E9E9E;strokeColor=#424242;', '', {
            'fillColor': {'kind': 'discrete', 'expr': tag, 'offColor': '#9E9E9E',
                          'onColor': '#43A047'}}, cid=cid + '-lamp')

    x, y = pos(3, 1)
    p.tile(x, y, W, H, 'Action Scripts', 'On down / while down / mouse over [Shift+F3]')
    p.add(x + 20, y + 35, 120, 50, BUTTON, 'Counter + 1', {
        'pushAction': {'key': {'key': 'F3', 'ctrl': False, 'shift': True}, 'scripts': [
            {'condition': 'onLeftDown', 'script': 'Counter = Counter + 1;'}]}}, cid='itd-action-click')
    p.add(x + 160, y + 35, 120, 50, BUTTON, 'Hold me', {
        'pushAction': {'scripts': [
            {'condition': 'whileLeftDown', 'period': 200, 'script': 'Held = Held + 1;'},
            {'condition': 'onLeftUp', 'script': 'LogMessage("held " + Text(Held, "#"));'}]}},
        cid='itd-action-while')
    p.add(x + 20, y + 100, 120, 50, LABEL, 'Hover', {
        'pushAction': {'scripts': [
            {'condition': 'onMouseOver', 'script': 'Hover = 1;'},
            {'condition': 'onMouseLeave', 'script': 'Hover = 0;'}]},
        'fillColor': {'kind': 'discrete', 'expr': 'Hover', 'offColor': '#FFFFFF',
                      'onColor': '#FFF59D'}}, cid='itd-action-hover')
    p.add(x + 160, y + 100, 120, 50, LABEL, 'C=#  H=#', {
        'valueString': {'expr': '"C=" + Text(Counter, "#") + "  H=" + Text(Held, "#")'}},
        cid='itd-action-value')
    p.add(x + 20, y + 160, 260, 30, LABEL + 'fontSize=11;', 'IF script: reset counters', {
        'pushAction': {'scripts': [{'condition': 'onLeftUp', 'script':
                                    'IF Counter > 0 OR Held > 0 THEN\n  Counter = 0;\n  Held = 0;\n'
                                    'ELSE\n  LogMessage("nothing to reset");\nENDIF;'}]}},
        cid='itd-action-reset')

    # Row 2: windows
    x, y = pos(0, 2)
    p.tile(x, y, 2 * W + 12, H - 20, 'Show / Hide Window',
           'Overlay and popup windows are pages with a window type')
    p.add(x + 20, y + 40, 130, 44, BUTTON, 'Show Overlay', {
        'showWindow': {'key': {'key': 'F4', 'ctrl': False, 'shift': False}, 'windows': ['Overlay Window']}},
        cid='itd-show-overlay')
    p.add(x + 160, y + 40, 130, 44, BUTTON + 'fillColor=#757575;strokeColor=#424242;', 'Hide Overlay', {
        'hideWindow': {'windows': ['Overlay Window']}}, cid='itd-hide-overlay')
    p.add(x + 300, y + 40, 130, 44, BUTTON, 'Show Popup', {
        'showWindow': {'windows': ['Popup Window']}}, cid='itd-show-popup')
    p.add(x + 440, y + 40, 150, 44, BUTTON, 'ShowAt (script)', {
        'pushAction': {'scripts': [{'condition': 'onLeftUp',
                                    'script': 'ShowTopLeftAt("Overlay Window", $ObjHor, $ObjVer);'}]}},
        cid='itd-showat')
    p.add(x + 20, y + 100, 270, 44, BUTTON + 'fillColor=#6D4C41;strokeColor=#3E2723;',
          'Go to Display Links (replace)', {'showWindow': {'windows': ['Display Links']}},
          cid='itd-show-replace')
    p.add(x + 300, y + 100, 290, 44, BUTTON + 'fillColor=#00897B;strokeColor=#004D40;',
          'DialogValueEntry (script)', {'pushAction': {'scripts': [{
              'condition': 'onLeftUp',
              'script': 'DIM rc AS INTEGER;\nrc = DialogValueEntry("SetPoint", 0, 100, "New set point");'}]}},
          cid='itd-dialog-entry')

    x, y = pos(2, 2)
    p.tile(x, y, 2 * W + 12, H - 20, 'Key equivalents', '')
    p.text(x + 12, y + 30, 2 * W - 12, 120,
           'Ctrl+D: discrete input &nbsp; F2: speed keypad &nbsp; Ctrl+T: toggle pushbutton<br>'
           'Shift+F3: counter script &nbsp; F4: show overlay window<br>'
           'Tab moves the focus between touch objects, Enter activates the focused object.', 12)
    return p


def meta2d_page():
    p = Page('itd-meta2d', 'meta2d Extensions', {'version': 1, 'sources': [], 'tags': [],
                                                 'triggers': []})
    p.text(20, 8, 900, 30, 'Extension links from meta2d', 20, True, '#263238')
    p.text(20, 36, 1200, 18, 'Links that meta2d has and InTouch does not, configured in the same '
           'Animation Links dialog (Animation, Actions and Scripts groups).', 11)

    W, H, X0, Y0, DX, DY = 300, 205, 20, 64, 312, 215

    def pos(c, r):
        return X0 + c * DX, Y0 + r * DY

    # Row 0: display
    x, y = pos(0, 0)
    p.tile(x, y, W, H, 'Multi-State', 'Status 0..3: colour, label and blink per state')
    p.add(x + 50, y + 45, 200, 70, 'rounded=1;html=1;fillColor=#9E9E9E;strokeColor=#424242;'
          'fontColor=#FFFFFF;fontStyle=1;fontSize=14;', 'STATE', {
              'states': {'expr': 'Status', 'states': [
                  {'match': '0', 'fillColor': '#9E9E9E', 'label': 'STOPPED'},
                  {'match': '1', 'fillColor': '#43A047', 'label': 'RUNNING'},
                  {'match': '2', 'fillColor': '#FB8C00', 'label': 'WARNING'},
                  {'match': '3..', 'fillColor': '#E53935', 'label': 'FAULT #', 'blink': True},
                  {'match': '*', 'fillColor': '#607D8B', 'label': '?'}]}},
          cid='itd-m2d-states')

    x, y = pos(1, 0)
    p.tile(x, y, W, H, 'Opacity and Properties', 'Opacity follows Level; flip and dash by expression')
    p.add(x + 20, y + 45, 120, 70, 'rounded=1;html=1;fillColor=#1E88E5;strokeColor=#0D47A1;'
          'fontColor=#FFFFFF;fontStyle=1;', 'OPACITY', {
              'opacity': {'expr': 'Level', 'valueAtMin': 0, 'valueAtMax': 100, 'minPercent': 15,
                          'maxPercent': 100}}, cid='itd-m2d-opacity')
    p.add(x + 160, y + 45, 120, 70, 'shape=triangle;direction=east;html=1;fillColor=#FFCC80;'
          'strokeColor=#EF6C00;', '', {
              'properties': {'items': [
                  {'target': 'style:flipH', 'expr': 'IF(Pump, 1, 0)'},
                  {'target': 'style:dashed', 'expr': 'IF(Level > 50, 1, 0)'},
                  {'target': 'tooltip', 'expr': '"Pump " + IF(Pump, "on", "off")'}]}},
          cid='itd-m2d-properties')

    x, y = pos(2, 0)
    p.tile(x, y, 2 * W + 12, H, 'Widget Data', 'Gauge value and trend series from links')
    p.add(x + 20, y + 30, 160, 160, 'shape=mxgraph.hmi.radialGauge;html=1;noLabel=1;hmiMin=0;'
          'hmiMax=100;hmiUnit=%;hmiValue=0;', 'Level', {'widgetData': {'expr': 'Level'}},
          cid='itd-m2d-gauge')
    p.add(x + 200, y + 30, 390, 160, 'shape=mxgraph.hmi.trendChart;html=1;noLabel=1;', 'Trend', {
        'widgetData': {'series': [{'tag': 'Level', 'name': 'Level', 'maxPoints': 600},
                                  {'tag': 'Rpm', 'name': 'Rpm', 'maxPoints': 600}]}},
        cid='itd-m2d-trend')

    # Row 1: animation
    x, y = pos(0, 1)
    p.tile(x, y, W, H, 'Animation: Spin and Glow', 'Fan spins at Rpm; glow while HighAlarm')
    p.add(x + 40, y + 45, 90, 90, 'shape=mxgraph.hmi.fan;html=1;noLabel=1;fillColor=#90A4AE;', '', {
        'animation': {'expr': 'Animate', 'preset': 'spin', 'rateExpr': 'Rpm'}},
        cid='itd-m2d-spin')
    p.add(x + 170, y + 55, 90, 70, 'ellipse;html=1;fillColor=#FFFFFF;strokeColor=#E53935;'
          'strokeWidth=2;fontStyle=1;', 'ALERT', {
              'animation': {'expr': 'HighAlarm', 'preset': 'glow', 'color': '#E53935'}},
          cid='itd-m2d-glow')

    x, y = pos(1, 1)
    p.tile(x, y, W, H, 'Animation: Bounce and Sway', 'Preset animations while Animate')
    p.add(x + 40, y + 60, 80, 60, 'rounded=1;html=1;fillColor=#A5D6A7;strokeColor=#2E7D32;', 'Bounce', {
        'animation': {'expr': 'Animate', 'preset': 'bounce', 'rateExpr': '60'}},
        cid='itd-m2d-bounce')
    p.add(x + 170, y + 60, 80, 60, 'rounded=1;html=1;fillColor=#CE93D8;strokeColor=#6A1B9A;', 'Sway', {
        'animation': {'expr': 'Animate', 'preset': 'sway'}}, cid='itd-m2d-sway')

    x, y = pos(2, 1)
    p.tile(x, y, W, H, 'Flow', 'Pipe flow while FlowOn, speed and direction by expression')
    p.cells.append(('<object id="itd-m2d-flow" label="" hmiLinks=%s><mxCell style="endArrow=none;'
                    'html=1;strokeWidth=8;strokeColor=#90CAF9;flowAnimationDuration=600;" edge="1" '
                    'parent="1"><mxGeometry relative="1" as="geometry"><mxPoint x="%d" y="%d" '
                    'as="sourcePoint"/><mxPoint x="%d" y="%d" as="targetPoint"/></mxGeometry>'
                    '</mxCell></object>') % (quoteattr(json.dumps({'flow': {
                        'expr': 'FlowOn', 'type': 'dash', 'speedExpr': '0.5 + Level / 50',
                        'reverseExpr': 'Level > 80', 'color': '#0D47A1', 'width': 4}},
                        separators=(',', ':'))), x + 20, y + 110, x + 280, y + 110))

    x, y = pos(3, 1)
    p.tile(x, y, W, H, 'Object Scripts', 'Data change counts Status changes; condition on Temp')
    p.add(x + 20, y + 45, 260, 50, LABEL, 'Changes', {
        'dataChange': {'expr': 'Status', 'script': 'Changes = Changes + 1;'},
        'valueString': {'expr': '"Status changes: " + Text(Changes, "#")'}}, cid='itd-m2d-datachange')
    p.add(x + 20, y + 110, 260, 50, LABEL, 'High', {
        'condition': {'expr': 'Temp > 80', 'onTrue': 'HighCount = HighCount + 1;',
                      'onFalse': 'ShowMessage("Temp back to normal");'},
        'valueString': {'expr': '"Temp > 80 count: " + Text(HighCount, "#")'}},
        cid='itd-m2d-condition')

    # Row 2: touch
    x, y = pos(0, 2)
    p.tile(x, y, W, H - 20, 'Choice Input and Value Pushbuttons', 'Recipe choice; Batch -1 / +1')
    p.add(x + 20, y + 35, 260, 44, LABEL, 'Recipe', {
        'inputChoice': {'tag': 'Recipe', 'message': 'Select the recipe', 'options': [
            {'label': 'Recipe A', 'value': 'A'}, {'label': 'Recipe B', 'value': 'B'},
            {'label': 'Recipe C', 'value': 'C'}]},
        'valueString': {'expr': '"Recipe " + Recipe'}}, cid='itd-m2d-choice')
    p.add(x + 20, y + 95, 70, 44, BUTTON, '-1', {
        'pushValue': {'tag': 'Batch', 'action': 'subtract', 'value': 1, 'min': 0, 'max': 10}},
        cid='itd-m2d-minus')
    p.add(x + 100, y + 95, 100, 44, LABEL, 'Batch #', {
        'valueAnalog': {'expr': 'Batch', 'format': {'mode': 'text'}}}, cid='itd-m2d-batch')
    p.add(x + 210, y + 95, 70, 44, BUTTON, '+1', {
        'pushValue': {'tag': 'Batch', 'action': 'add', 'value': 1, 'min': 0, 'max': 10}},
        cid='itd-m2d-plus')

    x, y = pos(1, 2)
    p.tile(x, y, W, H - 20, 'Actions', 'Open URL, send message, control animations')
    p.add(x + 20, y + 35, 120, 44, BUTTON, 'Open URL', {
        'openUrl': {'url': 'https://www.drawio.com', 'target': 'blank'}}, cid='itd-m2d-url')
    p.add(x + 160, y + 35, 120, 44, BUTTON, 'Send Message', {
        'sendMessage': {'name': 'hello', 'payloadExpr': 'Level', 'to': 'both'}}, cid='itd-m2d-message')
    p.add(x + 20, y + 95, 120, 44, BUTTON, 'Pause fan', {
        'control': {'commands': [{'object': 'itd-m2d-spin', 'command': 'pauseAnimation'}]}},
        cid='itd-m2d-pause')
    p.add(x + 160, y + 95, 120, 44, BUTTON, 'Resume fan', {
        'control': {'commands': [{'object': 'itd-m2d-spin', 'command': 'startAnimation'}]}},
        cid='itd-m2d-resume')

    x, y = pos(2, 2)
    p.tile(x, y, 2 * W + 12, H - 20, 'Touch Options and new script functions',
           'Confirmation before acting; scripts can open URLs, show messages, control animations')
    p.add(x + 20, y + 35, 200, 44, BUTTON + 'fillColor=#C62828;strokeColor=#8E0000;',
          'Reset Batch (confirm)', {
              'pushValue': {'tag': 'Batch', 'action': 'set', 'value': 0},
              'touchOptions': {'confirm': 'Reset the batch counter?', 'confirmTitle': 'Batch'}},
          cid='itd-m2d-confirm')
    p.add(x + 240, y + 35, 200, 44, BUTTON + 'fillColor=#00897B;strokeColor=#004D40;',
          'Script: toggle animations', {
              'pushAction': {'scripts': [{'condition': 'onLeftUp', 'script':
                  'IF Animate THEN\n  Animate = 0;\n  StopAnimation("itd-m2d-bounce");\n'
                  'ELSE\n  Animate = 1;\nENDIF;\nShowMessage("Animate = " + Text(Animate, "#"));'}]}},
          cid='itd-m2d-script')
    p.add(x + 460, y + 35, 130, 44, BUTTON + 'fillColor=#6D4C41;strokeColor=#3E2723;',
          'Operators only', {
              'pushValue': {'tag': 'Batch', 'action': 'set', 'value': 10},
              'touchOptions': {'roles': ['operator']}}, cid='itd-m2d-roles')
    return p


def flowcharting_page():
    p = Page('itd-fc', 'Flowcharting Features', {'version': 1, 'sources': [], 'tags': [],
                                                  'triggers': []})
    p.text(20, 8, 900, 30, 'Features from grafana-flowcharting', 20, True, '#263238')
    p.text(20, 36, 1240, 18, 'Smooth changes, blended colours, alarm markers, tooltip trends, data age '
           'and regular expression states (INTOUCH_LINKS.md section 13). Page-wide options are in '
           'Screen Settings, Runtime.', 11)

    W, H, X0, Y0, DX, DY = 400, 310, 20, 64, 420, 322

    def pos(c, r):
        return X0 + c * DX, Y0 + r * DY

    tank = 'rounded=0;html=1;fillColor=#42A5F5;strokeColor=#1565C0;strokeWidth=2;fontStyle=1;'
    level = {'expr': 'Step', 'valueAtMin': 0, 'valueAtMax': 100, 'minPercent': 0, 'maxPercent': 100,
             'direction': 'up', 'backgroundColor': '#FFFFFF'}
    ramp = [{'value': 0, 'color': '#43A047'}, {'value': 50, 'color': '#FDD835'},
            {'value': 100, 'color': '#E53935'}]

    # Smooth changes: the same links without and with smoothing
    x, y = pos(0, 0)
    p.tile(x, y, W, H, 'Smooth Changes', 'Step jumps every 2.5 s; right: Smooth Changes 800 ms')
    for i, (name, smooth) in enumerate([('Instant', None), ('Smooth', {'duration': 800})]):
        links = {'fillVertical': dict(level),
                 'fillColor': {'kind': 'analog', 'expr': 'Step', 'breakpoints': ramp, 'blend': True},
                 'valueAnalog': {'expr': 'Step', 'format': {'mode': 'text'}}}
        mover = {'locationH': {'expr': 'Step', 'atLeft': 0, 'atRight': 100, 'toLeft': 0,
                               'toRight': 130}}
        if smooth:
            links['smooth'] = smooth
            mover['smooth'] = smooth
        cx = x + 30 + i * 200
        p.text(cx, y + 30, 150, 18, name, 11, True, '#37474F')
        p.add(cx + 30, y + 52, 90, 150, tank, '##', links, cid='itd-fc-tank-' + name.lower())
        p.add(cx, y + 220, 20, 20, 'ellipse;html=1;fillColor=#5E35B1;strokeColor=#311B92;', '', mover,
              cid='itd-fc-move-' + name.lower())
        p.add(cx, y + 248, 150, 2, 'rounded=0;html=1;fillColor=#B0BEC5;strokeColor=none;')

    # Blended colours: stepped and blended analog colour links on Level
    x, y = pos(1, 0)
    p.tile(x, y, W, H, 'Blended Colours', 'Break points green 0, yellow 50, red 100; Level as value')
    for i, (name, blend) in enumerate([('Steps', False), ('Blend', True)]):
        ty = y + 50 + i * 110
        p.text(x + 20, ty, 300, 18, name + (' (Blend between break points)' if blend else ' (default)'),
               11, True, '#37474F')
        p.add(x + 20, ty + 22, 360, 60, 'rounded=1;html=1;strokeColor=#455A64;fontStyle=1;fontSize=14;',
              'Level ##.#', {'fillColor': {'kind': 'analog', 'expr': 'Level', 'breakpoints': ramp,
                                           'blend': blend},
                             'valueAnalog': {'expr': 'Level', 'format': {'mode': 'text'}}},
              cid='itd-fc-' + name.lower())

    # Alarm markers on objects
    x, y = pos(2, 0)
    p.tile(x, y, W, H, 'Alarm Marker', 'Warning triangle while in alarm; blinks until acknowledged')
    p.add(x + 40, y + 60, 140, 70, LABEL, 'Temp ##.# C', {
        'valueAnalog': {'expr': 'Temp', 'format': {'mode': 'text'}},
        'alarmMarker': {'show': 'show'}}, cid='itd-fc-marker-temp')
    p.add(x + 220, y + 60, 140, 70, LABEL, 'HighAlarm', {
        'valueDiscrete': {'expr': 'HighAlarm', 'onMessage': 'ALARM', 'offMessage': 'normal'},
        'alarmMarker': {'show': 'show', 'tag': 'HighAlarm'}}, cid='itd-fc-marker-bool')
    p.text(x + 20, y + 150, 360, 110, 'Temp has value alarms (Lo 25, Hi 80, HiHi 100): orange for '
           'medium, red for high severity. HighAlarm is a boolean alarm. Acknowledge in the alarm list '
           'of the status bar to stop the blinking. Screen Settings, Runtime, "Alarm markers on '
           'objects" adds markers to every object of the page.', 10)

    # Tooltip trend
    x, y = pos(0, 1)
    p.tile(x, y, W, H, 'Tooltip Trend', 'Rest the mouse on an object to see its recent values')
    p.add(x + 20, y + 60, 170, 80, LABEL + 'fillColor=#E3F2FD;', 'Level ##.#', {
        'valueAnalog': {'expr': 'Level', 'format': {'mode': 'text'}},
        'tooltip': {'mode': 'static', 'text': 'Tank level (%)', 'trend': True, 'trendTag': 'Level',
                    'trendSeconds': 60}}, cid='itd-fc-trend-level')
    p.add(x + 210, y + 60, 170, 80, LABEL + 'fillColor=#FFF3E0;', 'Temp ##.#', {
        'valueAnalog': {'expr': 'Temp', 'format': {'mode': 'text'}},
        'tooltip': {'mode': 'expression', 'expr': '"Temperature " + Text(Temp, "#.0") + " C"',
                    'trend': True, 'trendSeconds': 30}}, cid='itd-fc-trend-temp')
    p.text(x + 20, y + 160, 360, 60, 'Left: 60 s of Level with a fixed text. Right: 30 s of the '
           'first tag of the tooltip expression (Temp).', 10)

    # Data age
    x, y = pos(1, 1)
    p.tile(x, y, W, H, 'Data Age', 'Stale after 5 s: grey colour or the "stale" state')
    p.add(x + 20, y + 50, 170, 80, 'rounded=1;html=1;fontStyle=1;fontSize=13;strokeColor=#455A64;'
          'fillColor=#43A047;fontColor=#FFFFFF;', 'SENSOR', {
              'states': {'expr': 'Sensor', 'staleSeconds': 5, 'states': [
                  {'match': 'stale', 'fillColor': '#9E9E9E', 'label': 'NO DATA'},
                  {'match': '*', 'fillColor': '#43A047', 'label': 'Sensor #.#'}]}},
          cid='itd-fc-stale-state')
    p.add(x + 210, y + 50, 170, 80, 'rounded=1;html=1;fontStyle=1;fontSize=13;strokeColor=#455A64;',
          'Manual #', {
              'valueAnalog': {'expr': 'Manual', 'format': {'mode': 'text'}},
              'fillColor': {'kind': 'discrete', 'expr': 'Manual >= 0', 'onColor': '#FFFFFF', 'offColor': '#FFFFFF',
                            'staleSeconds': 5, 'staleColor': '#BDBDBD'}}, cid='itd-fc-stale-color')
    p.add(x + 230, y + 145, 130, 40, BUTTON, 'Update', {
        'pushValue': {'tag': 'Manual', 'action': 'add', 'value': 1}}, cid='itd-fc-stale-update')
    p.text(x + 20, y + 200, 360, 70, 'Left: Sensor updates every 8 s, so it shows NO DATA for 3 s of '
           'every 8. Right: the colour link turns grey 5 s after the last press of Update.', 10)

    # Regular expression states
    x, y = pos(2, 1)
    p.tile(x, y, W, H, 'Regular Expression States', 'Multi-State matches such as /warn/i')
    p.add(x + 20, y + 50, 360, 60, 'rounded=1;html=1;fontStyle=1;fontSize=13;strokeColor=#455A64;'
          'fontColor=#FFFFFF;fillColor=#43A047;', 'Message', {
              'states': {'expr': 'Message', 'states': [
                  {'match': '/alarm/i', 'fillColor': '#E53935'},
                  {'match': '/warn/i', 'fillColor': '#FB8C00'},
                  {'match': '*', 'fillColor': '#43A047'}]},
              'valueString': {'expr': 'Message'}}, cid='itd-fc-regex-message')
    p.add(x + 20, y + 130, 360, 60, 'rounded=1;html=1;fontStyle=1;fontSize=13;strokeColor=#455A64;'
          'fontColor=#FFFFFF;fillColor=#607D8B;', 'Mode', {
              'states': {'expr': 'Mode', 'states': [
                  {'match': '/^auto/i', 'fillColor': '#1E88E5', 'label': 'Automatic'},
                  {'match': '/^man/i', 'fillColor': '#FB8C00', 'label': 'Manual'},
                  {'match': '*', 'fillColor': '#607D8B', 'label': 'Off'}]}}, cid='itd-fc-regex-mode')
    p.text(x + 20, y + 205, 360, 60, 'Top: red for any message with "alarm", orange with "warn". '
           'Bottom: /^auto/i and /^man/i on Mode, ignoring case.', 10)
    return p


def window_page(pid, name, wtype, x, y):
    doc = {'version': 1, 'sources': [], 'tags': [], 'triggers': [],
           'window': {'type': wtype, 'x': x, 'y': y, 'width': 360, 'height': 260,
                      'title': name}}
    p = Page(pid, name, doc, 320, 220)
    p.add(0, 0, 320, 220, 'rounded=0;html=1;fillColor=#ECEFF1;strokeColor=#90A4AE;')
    p.text(10, 6, 300, 24, name + ' (' + wtype + ')', 14, True, '#263238')
    p.add(20, 40, 280, 40, LABEL, 'Level = ##.# %', {
        'valueAnalog': {'expr': 'Level', 'format': {'mode': 'text'}}}, cid=pid + '-value')
    p.add(20, 90, 280, 30, 'rounded=0;html=1;fillColor=#42A5F5;strokeColor=#1565C0;', '', {
        'fillHorizontal': {'expr': 'Level', 'valueAtMin': 0, 'valueAtMax': 100, 'minPercent': 0,
                           'maxPercent': 100, 'direction': 'right', 'backgroundColor': '#FFFFFF'}},
        cid=pid + '-fill')
    p.add(20, 140, 130, 40, BUTTON, 'Toggle Cmd', {'pushDiscrete': {'tag': 'Cmd', 'action': 'toggle'},
                                                   'fillColor': {'kind': 'discrete', 'expr': 'Cmd',
                                                                 'offColor': '#757575',
                                                                 'onColor': '#43A047'}},
          cid=pid + '-toggle')
    p.add(170, 140, 130, 40, BUTTON + 'fillColor=#C62828;strokeColor=#8E0000;', 'Close', {
        'pushAction': {'scripts': [{'condition': 'onLeftUp', 'script': 'HideSelf();'}]}},
        cid=pid + '-close')
    return p


def main():
    pages = [display_page(), touch_page(), meta2d_page(), flowcharting_page(),
             window_page('itd-overlay', 'Overlay Window', 'overlay', 860, 120),
             window_page('itd-popup', 'Popup Window', 'popup', None, None)]
    xml = ('<mxfile host="app.diagrams.net" agent="hmi-template-generator" version="24.0.0" '
           'type="device">%s</mxfile>\n') % ''.join(p.xml() for p in pages)

    with open(OUT, 'w') as f:
        f.write(xml)

    print('Wrote ' + OUT)


if __name__ == '__main__':
    main()
