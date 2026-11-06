// Shared by extension.js and prefs.js: only GLib, no Shell/Clutter imports.
import GLib from 'gi://GLib';

// [id, prefs label, hint label | null, only-in view ('windows'|'apps'|undefined)]
export const BUTTON_ACTIONS = [
    ['none', 'Nothing', null],
    ['overview', 'Overview (twice: app grid)', 'Close overview'],
    ['app-grid', 'Toggle app grid', 'App grid / windows'],
    ['activate', 'Launch (Enter)', 'Launch'],
    ['back', 'Back (Esc)', 'Back'],
    ['context-menu', 'Context menu', 'Menu'],
    ['close-window', 'Close selected window', 'Close window', 'windows'],
    ['dock', 'Dock (press again to go back)', 'Dock'],
    ['next', 'Next item', 'Next item'],
    ['previous', 'Previous item', 'Previous item'],
    ['scroll-prev', 'Prev. page / workspace', 'Previous {page}'],
    ['scroll-next', 'Next page / workspace', 'Next {page}'],
    ['page-up', 'Page up', 'Page up'],
    ['page-down', 'Page down', 'Page down'],
    ['home', 'First item', 'First item'],
    ['end', 'Last item', 'Last item'],
];

export const STICK_ACTIONS = [
    ['arrows', 'Arrow keys', 'Move'],
    ['scroll', 'Pages / workspaces', 'Switch {page}'],
    ['pages', 'Page up / down', 'Page up / down'],
    ['none', 'Nothing', null],
];

// [settings key suffix, evdev codes]. Digital ZL/ZR (312/313) are only used
// by pads without analog triggers (Switch); see Gamepad.hasAnalogTriggers.
export const BUTTONS = [
    ['a', [304]], ['b', [305]], ['x', [307]], ['y', [308]],
    ['lb', [310]], ['rb', [311]], ['lt', [312]], ['rt', [313]],
    ['back', [314]], ['start', [315]], ['l3', [317]], ['r3', [318]],
];
export const GUIDE = ['guide', [316]];

export const STICKS = ['dpad', 'left-stick', 'right-stick'];

export const FAMILIES = [
    ['auto', 'Automatic (from the connected controller)'],
    ['xbox', 'Xbox'],
    ['playstation', 'PlayStation'],
    ['nintendo', 'Nintendo'],
];

// Button names per family, keyed by evdev code position (not by label!):
// e.g. code 307 is X on Xbox but Triangle on PlayStation.
export const NAMES = {
    xbox: {
        a: 'A', b: 'B', x: 'X', y: 'Y', lb: 'LB', rb: 'RB', lt: 'LT', rt: 'RT',
        back: 'View (Back)', start: 'Menu (Start)', guide: 'Xbox button',
    },
    playstation: {
        a: 'Cross ✕', b: 'Circle ○', x: 'Triangle △', y: 'Square □',
        lb: 'L1', rb: 'R1', lt: 'L2', rt: 'R2',
        back: 'Share / Create', start: 'Options', guide: 'PS button',
    },
    nintendo: {
        a: 'B', b: 'A', x: 'X', y: 'Y', lb: 'L', rb: 'R', lt: 'ZL', rt: 'ZR',
        back: 'Minus (−)', start: 'Plus (+)', guide: 'Home',
    },
};
const COMMON_NAMES = {
    'l3': 'Left stick click (L3)', 'r3': 'Right stick click (R3)',
    'dpad': 'D-pad', 'left-stick': 'Left stick', 'right-stick': 'Right stick',
};
export function buttonName(family, key) {
    return NAMES[family]?.[key] ?? COMMON_NAMES[key] ?? key;
}

export const HINT_POSITIONS = [
    ['bottom-right', 'Bottom right'],
    ['bottom-left', 'Bottom left'],
    ['top-right', 'Top right'],
    ['top-left', 'Top left'],
];

// USB vendor IDs
const VENDOR_FAMILY = {
    0x054c: 'playstation', // Sony
    0x057e: 'nintendo',
    0x045e: 'xbox', // Microsoft
};

function readText(path) {
    const [, bytes] = GLib.file_get_contents(path);
    return new TextDecoder().decode(bytes).trim();
}

// event node basename ("event23") -> joystick?
export function isJoystick(name) {
    try {
        const minor = readText(`/sys/class/input/${name}/dev`).split(':')[1];
        return readText(`/run/udev/data/c13:${minor}`).includes('E:ID_INPUT_JOYSTICK=1');
    } catch {
        return false;
    }
}

export function deviceFamily(name) {
    try {
        const vendor = parseInt(readText(`/sys/class/input/${name}/device/id/vendor`), 16);
        if (VENDOR_FAMILY[vendor])
            return VENDOR_FAMILY[vendor];
        const product = readText(`/sys/class/input/${name}/device/name`).toLowerCase();
        if (/dualsense|dualshock|playstation|ps[345]/.test(product))
            return 'playstation';
        if (/nintendo|switch|joy-con|pro controller/.test(product))
            return 'nintendo';
    } catch {}
    return 'xbox'; // most generic pads use the Xbox layout
}

// true if the device reports ABS_Z (analog left trigger)
export function hasAnalogTriggers(name) {
    try {
        const words = readText(`/sys/class/input/${name}/device/capabilities/abs`).split(' ');
        return (parseInt(words[words.length - 1], 16) & (1 << 2)) !== 0;
    } catch {
        return true;
    }
}

// First connected joystick's family, for prefs and 'auto'.
export function detectFamily() {
    try {
        const dir = GLib.Dir.open('/dev/input', 0);
        let name;
        const found = [];
        while ((name = dir.read_name()) !== null) {
            if (/^event\d+$/.test(name) && isJoystick(name))
                found.push(name);
        }
        dir.close();
        found.sort();
        return found.length ? deviceFamily(found[0]) : null;
    } catch {
        return null;
    }
}
