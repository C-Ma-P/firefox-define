# Define — Firefox extension

A deliberately tiny Firefox extension:

1. Select a word or phrase.
2. Right-click.
3. Click **Define**, or press **Ctrl+Shift+F**.
4. A small popup appears beside the selection with English definitions from Wiktionary.

## Phrase behavior

The selected text is treated as one dictionary term after whitespace normalization.

Examples that have Wiktionary entries can work directly:

- `kick the bucket`
- `under the weather`
- other fixed phrases and idioms present in Wiktionary

There is intentionally no fuzzy NLP fallback in this prototype. If the exact phrase does not have an English Wiktionary entry, the popup says so rather than guessing a different phrase.

## Install temporarily in Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Select this folder's `manifest.json`

Temporary add-ons disappear when Firefox exits.

## Permanent installation

The ZIP/XPI is unsigned. Normal Firefox release builds require an add-on to be signed before permanent installation. For personal use, submit it to Mozilla Add-ons as an unlisted add-on and install the signed XPI they return.

## Permissions

- `contextMenus`: adds the **Define** menu item.
- `activeTab` + `scripting`: injects the popup only after you explicitly click **Define**.
- `https://en.wiktionary.org/*`: fetches the selected term's definition.

The selected word or phrase is sent to en.wiktionary.org only when you invoke Define, because that is required to retrieve the definition. The extension does not store it.

## Data source

Definitions come from:

`https://en.wiktionary.org/api/rest_v1/page/definition/<term>`

Wiktionary content is provided by Wiktionary contributors under its applicable Creative Commons license. The popup links back to the source entry.

## Keyboard shortcut

`Ctrl+Shift+F` defines the current selection. It also handles selected text inside normal `<input>` and `<textarea>` fields.

Firefox lets users change extension shortcuts from **Add-ons and themes → Manage Extension Shortcuts**.

## Context-menu separator

Firefox WebExtensions do not let a single top-level extension item be preceded by an extension-owned separator without also creating a second menu item; Firefox then collapses the extension items into a submenu. The prototype therefore keeps **Define** as the single top-level row rather than introducing a redundant submenu.


## Signing

This package is prepared for Mozilla unlisted/self-distributed signing. It declares the required `websiteContent` data transmission because the selected text is sent to Wiktionary for lookup.

## Icon

The extension manifest includes a compact Wiktionary-style icon, which Firefox also uses for the top-level context-menu item.
