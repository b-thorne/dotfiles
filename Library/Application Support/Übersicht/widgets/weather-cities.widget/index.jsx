// Weather for San Francisco, Portola Valley, and London.
// Data: Open-Meteo (no API key required).

const LOCATIONS = [
  {
    name: "San Francisco",
    shortName: "San Francisco",
    latitude: 37.7749,
    longitude: -122.4194,
    timezone: "America/Los_Angeles",
  },
  {
    name: "Portola Valley",
    shortName: "Portola Valley",
    latitude: 37.3841,
    longitude: -122.2352,
    timezone: "America/Los_Angeles",
  },
  {
    name: "London",
    shortName: "London",
    latitude: 51.5074,
    longitude: -0.1278,
    timezone: "Europe/London",
  },
];

const SEP = "@@WEATHER@@";
const REFRESH_MS = 10 * 60 * 1000;

const endpoint = ({ latitude, longitude, timezone }) => {
  const params = [
    `latitude=${latitude}`,
    `longitude=${longitude}`,
    "current=temperature_2m,apparent_temperature,weather_code,is_day",
    "daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    "temperature_unit=fahrenheit",
    "forecast_days=1",
    `timezone=${encodeURIComponent(timezone)}`,
  ].join("&");
  return `https://api.open-meteo.com/v1/forecast?${params}`;
};

const request = (location) =>
  `curl -fsS --max-time 12 "${endpoint(location)}" || printf '{}'`;

export const command = LOCATIONS.map(request).join(
  `; printf '\n${SEP}\n'; `,
);
export const refreshFrequency = REFRESH_MS;

const parse = (value) => {
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
};

const rounded = (value) =>
  Number.isFinite(value) ? Math.round(value) : null;

const conditionFor = (code, isDay) => {
  if (code === 0) return { icon: isDay ? "☀" : "☾", label: "Clear" };
  if (code === 1) return { icon: isDay ? "◒" : "☾", label: "Mostly clear" };
  if (code === 2) return { icon: "◒", label: "Partly cloudy" };
  if (code === 3) return { icon: "☁", label: "Overcast" };
  if (code === 45 || code === 48) return { icon: "≋", label: "Fog" };
  if ([51, 53, 55, 56, 57].includes(code)) {
    return { icon: "☂", label: "Drizzle" };
  }
  if ([61, 63, 65, 66, 67].includes(code)) {
    return { icon: "☂", label: "Rain" };
  }
  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    return { icon: "✦", label: "Snow" };
  }
  if ([80, 81, 82].includes(code)) {
    return { icon: "☂", label: "Showers" };
  }
  if ([95, 96, 99].includes(code)) {
    return { icon: "ϟ", label: "Thunderstorms" };
  }
  return { icon: "–", label: "Unavailable" };
};

const buildRow = (location, payload) => {
  const current = payload && payload.current;
  const daily = payload && payload.daily;
  if (!current || !daily) {
    return { ...location, available: false };
  }

  return {
    ...location,
    available: true,
    localTime: (current.time || "").split("T")[1] || "—",
    temperature: rounded(current.temperature_2m),
    apparent: rounded(current.apparent_temperature),
    high: rounded((daily.temperature_2m_max || [])[0]),
    low: rounded((daily.temperature_2m_min || [])[0]),
    rain: rounded((daily.precipitation_probability_max || [])[0]),
    condition: conditionFor(current.weather_code, current.is_day === 1),
  };
};

const degree = (value) => (value === null ? "—" : `${value}°`);
const percent = (value) => (value === null ? "—" : `${value}%`);

export const render = ({ output }) => {
  const payloads = (output || "").split(SEP).map(parse);
  const rows = LOCATIONS.map((location, index) =>
    buildRow(location, payloads[index]),
  );
  const online = rows.filter((row) => row.available).length;

  return (
    <div className="panel">
      <div className="head">
        <span className="title">weather</span>
        <span className="sub">
          <span className={`dot ${online === LOCATIONS.length ? "ok" : "warn"}`} />
          {online}/{LOCATIONS.length} cities · °F
        </span>
      </div>

      <div className="cities">
        {rows.map((row) => (
          <div className={`city ${row.available ? "" : "offline"}`} key={row.name}>
            <div className="cityhead">
              <span className="cityname">{row.shortName}</span>
              <span className="localtime">
                {row.available ? `${row.localTime} local` : "unavailable"}
              </span>
            </div>

            {row.available ? (
              <div className="weatherline">
                <span className="conditionicon">{row.condition.icon}</span>
                <span className="temperature">{degree(row.temperature)}</span>
                <span className="condition">
                  {row.condition.label}
                  {row.apparent !== row.temperature && (
                    <small>feels {degree(row.apparent)}</small>
                  )}
                </span>
                <span className="forecast">
                  <b>H {degree(row.high)}</b>
                  <span>L {degree(row.low)}</span>
                  <span>rain {percent(row.rain)}</span>
                </span>
              </div>
            ) : (
              <div className="unavailable">Open-Meteo could not be reached</div>
            )}
          </div>
        ))}
      </div>

      <div className="foot">Open-Meteo · updates every 10 minutes</div>
    </div>
  );
};

export const className = `
  top: 234px;
  right: 28px;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  color: #dde3e9;
  -webkit-font-smoothing: antialiased;

  .panel {
    width: 300px;
    padding: 14px 16px 11px;
    background: rgba(13, 15, 19, 0.68);
    backdrop-filter: blur(18px);
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 10px;
  }

  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding-bottom: 10px;
    margin-bottom: 2px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .title {
    color: #8b95a1;
    font-size: 11px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
  }

  .sub { color: #8b95a1; font-size: 9px; }

  .dot {
    display: inline-block;
    width: 5px;
    height: 5px;
    margin-right: 7px;
    border-radius: 50%;
  }
  .dot.ok { background: #7fbf9e; }
  .dot.warn { background: #e2b04a; }

  .city {
    padding: 10px 0 9px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.075);
  }
  .city:last-child { border-bottom: 0; padding-bottom: 8px; }
  .city.offline { opacity: 0.58; }

  .cityhead {
    display: flex;
    align-items: baseline;
    margin-bottom: 5px;
  }
  .cityname { color: #e8edf2; font-size: 11px; }
  .localtime {
    margin-left: auto;
    color: #6b7480;
    font-size: 9px;
    font-variant-numeric: tabular-nums;
  }

  .weatherline { display: flex; align-items: center; min-height: 32px; }
  .conditionicon {
    width: 26px;
    color: #8fb4d9;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 19px;
    line-height: 1;
  }
  .temperature {
    width: 49px;
    color: #f1f4f6;
    font-size: 21px;
    font-weight: 500;
    letter-spacing: -0.06em;
    font-variant-numeric: tabular-nums;
  }
  .condition {
    max-width: 86px;
    color: #aab3bd;
    font-size: 9px;
    line-height: 1.2;
  }
  .condition small {
    display: block;
    margin-top: 2px;
    color: #6b7480;
    font-size: 8px;
  }
  .forecast {
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin-left: auto;
    color: #6b7480;
    font-size: 8px;
    line-height: 1.2;
    text-align: right;
    white-space: nowrap;
  }
  .forecast b { color: #9ba5af; font-weight: 500; }

  .unavailable {
    padding: 6px 0 3px 26px;
    color: #e2b04a;
    font-size: 9px;
  }

  .foot {
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    color: #59616b;
    font-size: 8px;
    letter-spacing: 0.04em;
    text-align: right;
    text-transform: uppercase;
  }
`;
