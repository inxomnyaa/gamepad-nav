import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {
    BUTTON_ACTIONS, STICK_ACTIONS, BUTTONS, GUIDE, STICKS, HINT_POSITIONS,
    FAMILIES, buttonName, detectFamily,
} from './actions.js';

function comboRow(settings, key, title, choices, subtitle = '') {
    const row = new Adw.ComboRow({
        title,
        subtitle,
        model: Gtk.StringList.new(choices.map(([, label]) => label)),
    });
    const sync = () => {
        const i = choices.findIndex(([id]) => id === settings.get_string(key));
        row.selected = Math.max(i, 0);
    };
    sync();
    settings.connect(`changed::${key}`, sync);
    row.connect('notify::selected', () => {
        const id = choices[row.selected][0];
        if (settings.get_string(key) !== id)
            settings.set_string(key, id);
    });
    return row;
}

function spinRow(settings, key, title, subtitle, lower, upper, step) {
    const row = new Adw.SpinRow({
        title,
        subtitle,
        adjustment: new Gtk.Adjustment({lower, upper, step_increment: step, page_increment: step * 5}),
    });
    settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

export default class GamepadNavPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const style = settings.get_string('glyph-style');
        const family = style === 'auto' ? detectFamily() ?? 'xbox' : style;
        window._settings = settings;
        window.set_default_size(760, 860);

        const page = new Adw.PreferencesPage({title: 'Controls', icon_name: 'input-gaming-symbolic'});
        window.add(page);

        const guide = new Adw.PreferencesGroup({
            title: buttonName(family, 'guide'),
            description: 'The only button that works outside the overview.',
        });
        guide.add(comboRow(settings, `button-${GUIDE[0]}`, buttonName(family, GUIDE[0]), BUTTON_ACTIONS));
        const fs = new Adw.SwitchRow({
            title: 'Also over fullscreen apps',
            subtitle: 'Off: games keep the button (e.g. for the Steam overlay)',
        });
        settings.bind('guide-in-fullscreen', fs, 'active', Gio.SettingsBindFlags.DEFAULT);
        guide.add(fs);
        page.add(guide);

        const buttons = new Adw.PreferencesGroup({
            title: 'Buttons',
            description: 'Only active while the overview is open.',
        });
        for (const [key] of BUTTONS)
            buttons.add(comboRow(settings, `button-${key}`, buttonName(family, key), BUTTON_ACTIONS));
        page.add(buttons);

        const sticks = new Adw.PreferencesGroup({title: 'D-pad & sticks'});
        for (const key of STICKS)
            sticks.add(comboRow(settings, key, buttonName(family, key), STICK_ACTIONS));
        page.add(sticks);

        const hints = new Adw.PreferencesGroup({
            title: 'Button hints',
            description: 'Shown in the overview while a controller is connected.',
        });
        const showHints = new Adw.SwitchRow({title: 'Show button hints'});
        settings.bind('show-hints', showHints, 'active', Gio.SettingsBindFlags.DEFAULT);
        hints.add(showHints);
        const pos = comboRow(settings, 'hints-position', 'Position', HINT_POSITIONS);
        settings.bind('show-hints', pos, 'sensitive', Gio.SettingsBindFlags.GET);
        hints.add(pos);
        const glyphs = comboRow(settings, 'glyph-style', 'Button style', FAMILIES,
            'Button names in this window follow it after reopening');
        hints.add(glyphs);
        page.add(hints);

        const tuning = new Adw.PreferencesGroup({title: 'Feel'});
        tuning.add(spinRow(settings, 'stick-threshold', 'Stick sensitivity',
            'How far (percent) a stick must be pushed to count', 10, 90, 5));
        tuning.add(spinRow(settings, 'repeat-delay', 'Repeat delay',
            'Milliseconds before a held direction repeats', 100, 2000, 20));
        tuning.add(spinRow(settings, 'repeat-interval', 'Repeat speed',
            'Milliseconds between repeats', 30, 1000, 10));
        const reset = new Adw.ButtonRow({title: 'Reset all to defaults'});
        reset.connect('activated', () => {
            for (const k of settings.settings_schema.list_keys())
                settings.reset(k);
        });
        tuning.add(reset);
        page.add(tuning);
    }
}
