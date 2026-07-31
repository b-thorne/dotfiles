# Three-city weather widget

An Übersicht panel for current conditions and today's forecast in San Francisco,
Portola Valley, and London.

- Open-Meteo supplies current temperature, apparent temperature, WMO condition,
daily high/low, and maximum precipitation probability without an API key.
- All temperatures use Fahrenheit for direct comparison between cities.
- Each row displays the forecast location's local time.
- The widget refreshes every ten minutes and degrades per city if a request
fails.
- The panel is positioned in the right-hand stack between the Nomad and
Renaissance widgets and uses the same 300-pixel content width, padding,
typography, and visual treatment as the Nomad widget.

The canonical copy is managed by chezmoi at:

```text
~/.local/share/chezmoi/Library/Application Support/Übersicht/widgets/weather-cities.widget/
```
