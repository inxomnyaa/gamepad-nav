# GNOME keyboard navigation problems

Notes on problems found while building this extension. Each one also happens with a plain keyboard, so they are GNOME Shell problems and not caused by the extension. **None of these have been reported upstream yet.** Check for duplicates before filing.

Checked on GNOME Shell 51.1. The source references are to the JS inside `libshell-51.so`.

## 1. Arrow key reopens an app's context menu ⭐ probably a bug

**Steps** (keyboard only):
1. Press Super+A, then Down, then Right, to select an app icon.
2. Press the Menu key, then Esc to close the menu.
3. Press Right.

**Expected:** the selection moves to the next icon, as it did before step 2.
**Actual:** the context menu opens again. This happens every time Right is pressed on that icon, until the overview is closed.

**Cause:** in `ui/popupMenu.js`, the `PopupMenu` constructor adds a `Clutter.KeyController` to its `sourceActor` and never removes it. `_onKeyPress()` opens the menu when the "nav key" is pressed. The nav key is the arrow pointing away from the menu's arrow side. App grid menus are created lazily with `St.Side.LEFT` (`ui/appDisplay.js`, `popupMenuSide`), which makes the nav key **Right**. So once an icon's menu has been created, Right no longer navigates away from that icon. This makes sense for panel buttons, where Down opens the menu, but not for grid items that also use the arrow keys to move.

**Reproduced:** in a headless GNOME Shell with a plain virtual keyboard and the extension turned off.

**Related:** MR !277 "Improve keyboard navigation for popup menus" (2018) had a similar goal. No existing issue found.

**Workaround in the extension:** none so far. It could be done by stopping arrow keys from reaching the icon, but that relies on GNOME internals.

## 2. Page Up/Down leaves the selection on the old page ⭐ probably a bug

**Steps:**
1. Select an icon on page 1 of the app grid.
2. Press Page Down.

**Expected:** the selection moves to the new page, for example to its first icon.
**Actual:** page 2 is shown, but the selected icon is still the one on page 1. The next arrow key moves within page 1 and scrolls the grid back to it.

**Cause:** `AppDisplay`'s Page Up/Down/Home/End bindings in `ui/appDisplay.js` only call `goToPage()` and never move key focus.

**Reproduced:** with a plain virtual keyboard (selection stayed on "Weather" on page 1 after Page Down).

**Possibly related:** #4086, "Unable to switch between apps pages using keyboard" (GNOME 40).

## 3. No keyboard way to close a window in the overview (feature request)

In the window overview the close button (×) appears on the selected preview, but no key presses it. `WindowPreview` only binds Return (`ui/windowPreview.js`). Something like Delete would be the obvious choice. The Alt+Tab switcher already has Super+W / Alt+W for this.

**Workaround in the extension:** the "Close selected window" action finds the selected preview's window and closes it, then selects the next window.

## 4. App folders select the rename button first (design question)

When a folder opens, the first thing selected is the "edit name" button, not the first app. This is intentional: `AppFolderDialog.popup()` grabs with `focus: this._editButton`. It is awkward for controllers and keyboards alike, because it takes one extra press to reach the apps. Better raised as a question than as a bug.

## 5. No reliable keyboard way into the dash (minor)

Pinned apps are deliberately left out of the app grid (`ui/appDisplay.js`, `!this._appFavorites.isFavorite(…)`), so the dash is the only place to launch them. Arrow keys never move from the grid or the windows into the dash. The only key route is Ctrl+Alt+Tab, but a quick press always picks the *second* entry of a list sorted by screen position. That entry is the dash in the app grid but not in the window overview, and Ctrl+Alt+Shift+Tab did nothing in testing.

**Workaround in the extension:** the "Dock" action moves focus into the dash directly, and pressing it again returns to the item you were on.

## 6. Nothing is selected when the app grid opens (minor)

When the app grid opens, it has key focus but no icon is selected. Down or Right selects the first icon, while Up and Left do nothing at first. This is minor and mostly noticeable with a controller.
