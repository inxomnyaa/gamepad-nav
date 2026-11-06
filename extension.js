// Gamepad Navigation: reads joystick evdev nodes directly (logind grants the
// session user an ACL on them) and turns controller input into overview
// navigation via a Clutter virtual keyboard.
//
// Only the Guide button works outside the overview (and not over fullscreen
// windows unless enabled), so nothing leaks into games or apps.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GioUnix from 'gi://GioUnix';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {
    BUTTONS, GUIDE, STICKS, BUTTON_ACTIONS, STICK_ACTIONS,
    isJoystick, deviceFamily, hasAnalogTriggers, detectFamily,
} from './actions.js';

const EV_KEY = 1, EV_ABS = 3;
const EVENT_SIZE = 24; // struct input_event on 64-bit

const ABS = {X: 0, Y: 1, Z: 2, RX: 3, RY: 4, RZ: 5, HAT0X: 16, HAT0Y: 17};
const AXIS_MAX = 32768;               // xpad sticks are signed 16-bit
const TRIGGER_ON = 160, TRIGGER_OFF = 100; // 0..255

// D-pad as buttons: BTN_DPAD_* (current xpad) and BTN_TRIGGER_HAPPY1-4 (older)
const DPAD_BUTTONS = {
    544: 'up', 545: 'down', 546: 'left', 547: 'right',
    706: 'up', 707: 'down', 704: 'left', 705: 'right',
};

const KEY_ACTIONS = {
    'activate': [Clutter.KEY_Return],
    'back': [Clutter.KEY_Escape],
    'context-menu': [Clutter.KEY_Menu],
    'next': [Clutter.KEY_Tab],
    'previous': [Clutter.KEY_Shift_L, Clutter.KEY_Tab],
    'page-up': [Clutter.KEY_Page_Up],
    'page-down': [Clutter.KEY_Page_Down],
    'home': [Clutter.KEY_Home],
    'end': [Clutter.KEY_End],

};

const DIR_KEYS = {
    arrows: {up: Clutter.KEY_Up, down: Clutter.KEY_Down, left: Clutter.KEY_Left, right: Clutter.KEY_Right},
    pages: {up: Clutter.KEY_Page_Up, down: Clutter.KEY_Page_Down, left: Clutter.KEY_Page_Up, right: Clutter.KEY_Page_Down},
};

function toggleAppGrid() {
    // showApps() is a no-op once the overview is open, so flip the dash button.
    const button = Main.overview.dash.showAppsButton;
    if (Main.overview.visible)
        button.checked = !button.checked;
    else
        Main.overview.showApps();
}

// Merged when a pair of buttons does opposite halves of one thing.
const PAIRS = [['lb', 'rb'], ['lt', 'rt']];
const PAIR_LABELS = {
    'scroll-prev scroll-next': 'Switch {page}',
    'previous next': 'Previous / next item',
    'page-up page-down': 'Page up / down',
};
const HINT_ORDER = ['a', 'b', 'x', 'y', 'lb', 'rb', 'lt', 'rt', 'dpad',
    'left-stick', 'right-stick', 'start', 'back', 'l3', 'r3', 'guide'];
const HINT_MARGIN = 24;
const GLYPH_HEIGHT = 26; // px; icons are 32 px tall SVGs, scaled
const DIGITAL_TRIGGERS = new Set([312, 313]);

class Gamepad {
    constructor(path, owner) {
        this.path = path;
        this._owner = owner;
        const name = GLib.path_get_basename(path);
        this.family = deviceFamily(name);
        this.analogTriggers = hasAnalogTriggers(name);
        this._channel = GLib.IOChannel.new_file(path, 'r');
        const fd = this._channel.unix_get_fd();
        this._stream = new GioUnix.InputStream({fd, closeFd: false});
        this._cancellable = new Gio.Cancellable();
        this._read();
    }

    _read() {
        this._stream.read_bytes_async(EVENT_SIZE * 64, GLib.PRIORITY_DEFAULT,
            this._cancellable, (stream, res) => {
                let bytes;
                try {
                    bytes = stream.read_bytes_finish(res);
                } catch (e) {
                    if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                        this._owner.removePad(this.path);
                    return;
                }
                if (bytes.get_size() === 0) {
                    this._owner.removePad(this.path);
                    return;
                }
                const data = bytes.toArray();
                const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
                for (let o = 0; o + EVENT_SIZE <= view.byteLength; o += EVENT_SIZE) {
                    const type = view.getUint16(o + 16, true);
                    const code = view.getUint16(o + 18, true);
                    const value = view.getInt32(o + 20, true);
                    if (type === EV_KEY || type === EV_ABS)
                        this._owner.handleEvent(this, type, code, value);
                }
                this._read();
            });
    }

    destroy() {
        this._cancellable.cancel();
        try {
            this._channel.shutdown(false);
        } catch {}
    }
}

export default class GamepadNavExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._pads = new Map();
        this._pending = new Map();
        this._dirSources = new Set(); // "path|source|dir" -> held
        this._held = {};              // "stickId|dir" -> bool
        this._repeat = {};            // "stickId|dir" -> source id
        this._triggers = {};

        this._codeToKey = new Map();
        for (const [key, codes] of [...BUTTONS, GUIDE]) {
            for (const c of codes)
                this._codeToKey.set(c, key);
        }

        const seat = global.stage.context.get_backend().get_default_seat();
        this._vkbd = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
        this._glyphWidths = new Map();

        this._monitor = Gio.File.new_for_path('/dev/input')
            .monitor_directory(Gio.FileMonitorFlags.NONE, null);
        this._monitor.connect('changed', (_m, file, _o, ev) => {
            if (!/^event\d+$/.test(file.get_basename()))
                return;
            if (ev === Gio.FileMonitorEvent.CREATED || ev === Gio.FileMonitorEvent.ATTRIBUTE_CHANGED)
                this._scheduleProbe(file.get_path());
            else if (ev === Gio.FileMonitorEvent.DELETED)
                this.removePad(file.get_path());
        });

        this._overviewHiddenId = Main.overview.connect('hidden', () => {
            this._stopAllRepeats();
            this._setBeforeDock(null);
        });
        this._createHints();
        this._scanAll();
    }

    disable() {
        Main.overview.disconnect(this._overviewHiddenId);
        this._setBeforeDock(null);
        this._destroyHints();
        this._monitor.cancel();
        this._monitor = null;
        for (const id of this._pending.values())
            GLib.source_remove(id);
        this._pending = null;
        this._stopAllRepeats();
        if (this._refocusId)
            GLib.source_remove(this._refocusId);
        for (const pad of this._pads.values())
            pad.destroy();
        this._pads = null;
        this._vkbd = null;
        this._settings = null;
    }

    // ---- device discovery ----

    _scanAll() {
        const en = Gio.File.new_for_path('/dev/input').enumerate_children(
            'standard::name', Gio.FileQueryInfoFlags.NONE, null);
        let info;
        while ((info = en.next_file(null))) {
            if (/^event\d+$/.test(info.get_name()))
                this._probe(`/dev/input/${info.get_name()}`);
        }
        en.close(null);
    }

    _scheduleProbe(path) {
        // udev applies the ACL and writes its db shortly after the node appears.
        if (this._pending.has(path))
            GLib.source_remove(this._pending.get(path));
        this._pending.set(path, GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
            this._pending.delete(path);
            this._probe(path);
            return GLib.SOURCE_REMOVE;
        }));
    }

    _probe(path) {
        if (this._pads.has(path) || !isJoystick(GLib.path_get_basename(path)))
            return;
        try {
            this._pads.set(path, new Gamepad(path, this));
            this._lastPad = path;
            this._rebuildHints(); // glyphs may change with the controller family
        } catch (e) {
            console.debug(`gamepad-nav: cannot open ${path}: ${e.message}`);
        }
    }

    removePad(path) {
        const pad = this._pads?.get(path);
        if (!pad)
            return;
        pad.destroy();
        this._pads.delete(path);
        this._rebuildHints();
        for (const key of [...this._dirSources]) {
            if (key.startsWith(`${path}|`))
                this._dirSources.delete(key);
        }
        this._updateDirections(false);
    }

    // ---- button hint overlay ----

    _createHints() {
        this._hints = new St.BoxLayout({
            style_class: 'gamepad-nav-hints',
            orientation: Clutter.Orientation.VERTICAL,
            reactive: false,
        });
        Main.layoutManager.overviewGroup.add_child(this._hints);
        this._hints.connect('notify::size', () => this._placeHints());
        this._monitorsChangedId = Main.layoutManager.connect('monitors-changed',
            () => this._placeHints());
        this._settingsChangedId = this._settings.connect('changed', () => this._rebuildHints());
        this._showAppsId = Main.overview.dash.showAppsButton.connect('notify::checked',
            () => this._rebuildHints());
        this._rebuildHints();
    }

    _destroyHints() {
        Main.overview.dash.showAppsButton.disconnect(this._showAppsId);
        Main.layoutManager.disconnect(this._monitorsChangedId);
        this._settings.disconnect(this._settingsChangedId);
        this._hints.destroy();
        this._hints = null;
    }

    _syncHintsVisible() {
        if (!this._hints)
            return;
        this._hints.visible = this._settings.get_boolean('show-hints') && this._pads.size > 0;
    }

    _placeHints() {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor || !this._hints)
            return;
        const [w, h] = this._hints.get_size();
        const pos = this._settings.get_string('hints-position');
        const x = pos.endsWith('left')
            ? monitor.x + HINT_MARGIN : monitor.x + monitor.width - w - HINT_MARGIN;
        const y = pos.startsWith('top')
            ? monitor.y + Main.panel.height + HINT_MARGIN
            : monitor.y + monitor.height - h - HINT_MARGIN;
        this._hints.set_position(Math.round(x), Math.round(y));
    }

    _family() {
        const style = this._settings.get_string('glyph-style');
        if (style !== 'auto')
            return style;
        return this._pads.get(this._lastPad)?.family ??
            [...this._pads.values()][0]?.family ?? detectFamily() ?? 'xbox';
    }

    _glyph(family, key) {
        const file = `${this.path}/icons/${family}/${key}.svg`;
        if (!this._glyphWidths.has(file)) {
            let w = 32;
            try {
                const [, bytes] = GLib.file_get_contents(file);
                w = Number(/width='(\d+)'/.exec(new TextDecoder().decode(bytes))[1]);
            } catch {}
            this._glyphWidths.set(file, w);
        }
        const width = Math.round(this._glyphWidths.get(file) * GLYPH_HEIGHT / 32);
        return new St.Widget({
            style_class: 'gamepad-nav-glyph',
            style: `background-image: url("file://${file}"); ` +
                `width: ${width}px; height: ${GLYPH_HEIGHT}px;`,
            y_align: Clutter.ActorAlign.CENTER,
        });
    }

    _hintRows() {
        const inApps = Main.overview.dash.showAppsButton.checked;
        const fill = label => label.replace('{page}', inApps ? 'page' : 'workspace');
        const actionOf = key => STICKS.includes(key)
            ? this._settings.get_string(key)
            : this._settings.get_string(`button-${key}`);
        const labelOf = key => {
            const list = STICKS.includes(key) ? STICK_ACTIONS : BUTTON_ACTIONS;
            const entry = list.find(([id]) => id === actionOf(key));
            if (!entry?.[2] || (entry[3] === 'windows' && inApps) || (entry[3] === 'apps' && !inApps))
                return null;
            return fill(entry[2]);
        };

        // label -> glyph keys, in display order; equal labels share a row
        const rows = new Map();
        const add = (label, keys) => {
            if (!label)
                return;
            if (!rows.has(label))
                rows.set(label, []);
            rows.get(label).push(...keys);
        };
        const merged = new Set();
        for (const key of HINT_ORDER) {
            if (merged.has(key))
                continue;
            const pair = PAIRS.find(p => p[0] === key);
            const pairLabel = pair && PAIR_LABELS[`${actionOf(pair[0])} ${actionOf(pair[1])}`];
            if (pairLabel) {
                add(fill(pairLabel), pair);
                merged.add(pair[1]);
            } else {
                add(labelOf(key), [key]);
            }
        }
        return rows;
    }

    _rebuildHints() {
        if (!this._hints)
            return;
        this._hints.destroy_all_children();
        const family = this._family();
        const columns = [];
        for (const [label, keys] of this._hintRows()) {
            const row = new St.BoxLayout({style_class: 'gamepad-nav-hint-row'});
            const glyphs = new St.BoxLayout({style_class: 'gamepad-nav-hint-glyphs'});
            for (const key of keys)
                glyphs.add_child(this._glyph(family, key));
            row.add_child(glyphs);
            columns.push(glyphs);
            row.add_child(new St.Label({
                text: label,
                style_class: 'gamepad-nav-hint-label',
                y_align: Clutter.ActorAlign.CENTER,
            }));
            this._hints.add_child(row);
        }
        // one glyph column as wide as its widest row, so labels line up
        const width = Math.max(0, ...columns.map(c => c.get_preferred_width(-1)[1]));
        columns.forEach(c => (c.width = width));
        this._syncHintsVisible();
        this._placeHints();
    }

    // ---- input handling ----

    handleEvent(pad, type, code, value) {
        const inOverview = Main.overview.visible;

        if (type === EV_KEY && DPAD_BUTTONS[code]) {
            this._setDir(pad, 'dpad', `b${code}`, DPAD_BUTTONS[code], value !== 0);
        } else if (type === EV_KEY) {
            if (DIGITAL_TRIGGERS.has(code) && pad.analogTriggers)
                return; // same press already arrives as ABS_Z / ABS_RZ
            const key = this._codeToKey.get(code);
            if (key && value === 1)
                this._onButton(key, inOverview);
        } else if (code === ABS.Z || code === ABS.RZ) {
            const was = this._triggers[code] ?? false;
            const now = was ? value > TRIGGER_OFF : value > TRIGGER_ON;
            this._triggers[code] = now;
            if (now && !was)
                this._onButton(code === ABS.Z ? 'lt' : 'rt', inOverview);
        } else if (code === ABS.HAT0X || code === ABS.HAT0Y) {
            const [neg, pos] = code === ABS.HAT0X ? ['left', 'right'] : ['up', 'down'];
            this._setDir(pad, 'dpad', 'hat', neg, value < 0, false);
            this._setDir(pad, 'dpad', 'hat', pos, value > 0);
        } else if (code in {[ABS.X]: 1, [ABS.Y]: 1, [ABS.RX]: 1, [ABS.RY]: 1}) {
            const stick = code === ABS.X || code === ABS.Y ? 'left-stick' : 'right-stick';
            const [neg, pos] = code === ABS.X || code === ABS.RX ? ['left', 'right'] : ['up', 'down'];
            const on = this._settings.get_int('stick-threshold') / 100 * AXIS_MAX;
            const off = on * 0.65; // hysteresis
            const held = d => this._dirSources.has(`${pad.path}|${stick}|axis|${d}`);
            this._setDir(pad, stick, 'axis', neg, value < -(held(neg) ? off : on), false);
            this._setDir(pad, stick, 'axis', pos, value > (held(pos) ? off : on));
        }
    }

    _onButton(key, inOverview) {
        const action = this._settings.get_string(`button-${key}`);
        if (action === 'none')
            return;

        if (!inOverview) {
            // Only the Guide button may open the shell from outside.
            if (key !== 'guide' || !['overview', 'app-grid'].includes(action))
                return;
            if (global.display.focus_window?.is_fullscreen() &&
                !this._settings.get_boolean('guide-in-fullscreen'))
                return;
        }

        if (action === 'overview')
            this._tap([Clutter.KEY_Super_L]); // GNOME's own: twice quickly = app grid
        else if (action === 'dock')
            this._toggleDock();
        else if (action === 'close-window')
            this._closeFocusedWindow();
        else if (action === 'app-grid')
            toggleAppGrid();
        else if (action === 'scroll-prev' || action === 'scroll-next')
            this._scrollPage(action === 'scroll-prev' ? -1 : 1);
        else if (KEY_ACTIONS[action])
            this._tap(KEY_ACTIONS[action]);
    }

    _setDir(pad, stick, src, dir, on, update = true) {
        const key = `${pad.path}|${stick}|${src}|${dir}`;
        if (on)
            this._dirSources.add(key);
        else
            this._dirSources.delete(key);
        if (update)
            this._updateDirections(Main.overview.visible);
    }

    _updateDirections(act) {
        const now = {};
        for (const k of this._dirSources) {
            const parts = k.split('|');
            now[`${parts[1]}|${parts[3]}`] = true;
        }
        for (const id of new Set([...Object.keys(now), ...Object.keys(this._held)])) {
            const isHeld = now[id] ?? false;
            if (isHeld === (this._held[id] ?? false))
                continue;
            this._held[id] = isHeld;
            this._stopRepeat(id);
            // Holding a stick while the overview opens does nothing until re-pressed.
            if (isHeld && act)
                this._startRepeat(id);
        }
    }

    _dirKey(id) {
        const [stick, dir] = id.split('|');
        return DIR_KEYS[this._settings.get_string(stick)]?.[dir] ?? null;
    }

    _startRepeat(id) {
        const tap = () => {
            const [stick, dir] = id.split('|');
            if (this._settings.get_string(stick) === 'scroll') {
                this._scrollPage(dir === 'up' || dir === 'left' ? -1 : 1);
                return;
            }
            const k = this._dirKey(id);
            if (k !== null)
                this._tap([k]);
        };
        tap();
        this._repeat[id] = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
            this._settings.get_int('repeat-delay'), () => {
                tap();
                this._repeat[id] = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
                    this._settings.get_int('repeat-interval'), () => {
                        if (!Main.overview.visible) {
                            delete this._repeat[id];
                            return GLib.SOURCE_REMOVE;
                        }
                        tap();
                        return GLib.SOURCE_CONTINUE;
                    });
                return GLib.SOURCE_REMOVE;
            });
    }

    _stopRepeat(id) {
        if (this._repeat[id]) {
            GLib.source_remove(this._repeat[id]);
            delete this._repeat[id];
        }
    }

    _stopAllRepeats() {
        for (const id of Object.keys(this._repeat))
            this._stopRepeat(id);
    }

    // Like the scroll wheel, but via keys: Page Up/Down flips app grid pages,
    // Super+Page Up/Down is GNOME's default switch-to-workspace shortcut.
    _scrollPage(delta) {
        const key = delta < 0 ? Clutter.KEY_Page_Up : Clutter.KEY_Page_Down;
        if (Main.overview.dash.showAppsButton.checked)
            this._tap([key]);
        else
            this._tap([Clutter.KEY_Super_L, key]);
    }

    // Pinned apps only live in the dash (GNOME leaves them out of the app
    // grid), and no key reaches it reliably: Ctrl+Alt+Tab's order changes
    // with the view. So focus it directly, and jump back to where we were.
    _toggleDock() {
        const dash = Main.overview.dash;
        const focus = global.stage.key_focus;
        if (focus && dash.contains(focus)) {
            const back = this._beforeDock;
            this._setBeforeDock(null);
            if (back?.mapped)
                back.grab_key_focus();
            return;
        }
        this._setBeforeDock(focus);
        dash.navigate_focus(null, St.DirectionType.TAB_FORWARD, false);
    }

    _setBeforeDock(actor) {
        this._beforeDock?.disconnectObject(this);
        this._beforeDock = actor;
        actor?.connectObject('destroy', () => (this._beforeDock = null), this);
    }

    // GNOME has no key for the close button on window previews, so this is
    // the one place that looks at what is focused: a window preview carries
    // its Meta.Window (public Mutter API) as .metaWindow.
    _closeFocusedWindow() {
        let actor = global.stage.key_focus;
        while (actor && !actor.metaWindow)
            actor = actor.get_parent();
        const win = actor?.metaWindow;
        if (!win?.can_close())
            return;
        // The preview vanishes with its window, leaving nothing selected; once
        // it is gone, select the first remaining window in the same view.
        const view = actor.get_parent()?.get_parent();
        win.connectObject('unmanaged', () => {
            win.disconnectObject(this);
            this._refocusId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 350, () => {
                this._refocusId = 0;
                if (Main.overview.visible && !global.stage.key_focus && view?.mapped)
                    view.navigate_focus(null, St.DirectionType.TAB_FORWARD, false);
                return GLib.SOURCE_REMOVE;
            });
        }, this);
        win.delete(global.get_current_time());
    }

    // Press keys in order, release in reverse (for modifier combos).
    _tap(keyvals) {
        const t = GLib.get_monotonic_time();
        for (const k of keyvals)
            this._vkbd.notify_keyval(t, k, Clutter.KeyState.PRESSED);
        for (const k of [...keyvals].reverse())
            this._vkbd.notify_keyval(t, k, Clutter.KeyState.RELEASED);
    }
}
