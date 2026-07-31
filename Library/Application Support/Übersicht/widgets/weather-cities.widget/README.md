# Weather, RSS, and to-do widget

A tabbed Übersicht dashboard in the right-hand desktop stack.

## Tabs

- **Weather** shows current conditions, local time, apparent temperature,
  daily high/low, and precipitation probability for San Francisco, Portola
  Valley, and London. Open-Meteo requires no API key.
- **RSS** aggregates the newest articles from the subscriptions in
  `~/.config/newsboat/urls`. Feed parsing uses only Python's standard library;
  clicking an article opens it in the default browser. A short-lived cache in
  `~/Library/Caches/uebersicht-weather-cities/` avoids duplicate fetches during
  manual reloads and gives the tab a stale-data fallback when feeds are offline.
- **To-do** supports adding, completing, renaming, and deleting tasks. Task text
  is saved atomically in
  `~/Library/Application Support/Übersicht/weather-cities-todos.json` and is
  deliberately not managed by chezmoi.

The dashboard refreshes weather and RSS every ten minutes. The 334 × 274 px
panel preserves the right-hand stack's outer width and leaves a gap above the
Renaissance gallery.

Übersicht's interaction shortcut must be held to click tabs, open articles,
type tasks, or scroll a long to-do list.

The canonical widget code is managed by chezmoi at:

```text
~/.local/share/chezmoi/Library/Application Support/Übersicht/widgets/weather-cities.widget/
```
