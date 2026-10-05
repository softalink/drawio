#!/usr/bin/env python3
"""Generates templates/hmi/intouch_links_demo.xml.

The demo shows every InTouch animation link (plugins/hmi/INTOUCH_LINKS.md)
on four pages: display links, touch links, an overlay window and a popup
window. Run from the repository root:

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
    pages = [display_page(), touch_page(),
             window_page('itd-overlay', 'Overlay Window', 'overlay', 860, 120),
             window_page('itd-popup', 'Popup Window', 'popup', None, None)]
    xml = ('<mxfile host="app.diagrams.net" agent="hmi-template-generator" version="24.0.0" '
           'type="device">%s</mxfile>\n') % ''.join(p.xml() for p in pages)

    with open(OUT, 'w') as f:
        f.write(xml)

    print('Wrote ' + OUT)


if __name__ == '__main__':
    main()
