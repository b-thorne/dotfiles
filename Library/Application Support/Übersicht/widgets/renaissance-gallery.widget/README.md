# Renaissance gallery widget

A large, bottom-right Übersicht widget that presents one work from a curated
sixteen-work Renaissance collection every ten minutes.

- Each label names the artist and date, explains the scene, and identifies the
  present collection.
- Images are public-domain files from Wikimedia Commons. The widget requests a
  1280-pixel thumbnail, enough for a sharp Retina display without fetching the
  much larger archival original.
- The 334-pixel outer width matches the installed Nomad panel. The entire
  composition is preserved with `object-fit: contain`; a blurred copy fills the
  surrounding image stage for unusually tall or wide works.
- The only command is `date +%s`, refreshed every ten minutes to advance the
  collection. No API key or background process is required.
- The source line links to the Commons file page when Übersicht's interaction
  shortcut is active.

The canonical copy is managed by chezmoi at:

```text
~/.local/share/chezmoi/Library/Application Support/Übersicht/widgets/renaissance-gallery.widget/
```
