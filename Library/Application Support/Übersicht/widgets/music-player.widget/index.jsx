import { run } from "uebersicht";

const AUDIO_ID = "proton-music-player-audio";
let nextStageRequest = 0;
const EMPTY_LIBRARY = {
  tracks: [],
  playlists: [],
  stats: { tracks: 0, artists: 0, albums: 0, playlists: 0 },
};

export const command = 'python3 "music-player.widget/library.py" index';
export const refreshFrequency = 5 * 60 * 1000;

export const initialState = {
  library: null,
  error: null,
  view: "artists",
  backView: "artists",
  selectedArtist: null,
  selectedAlbum: null,
  selectedPlaylist: null,
  search: "",
  loadingId: null,
  stageRequest: 0,
  currentId: null,
  audioUrl: null,
  queue: [],
  queueIndex: -1,
  playing: false,
  currentTime: 0,
  duration: 0,
  volume: 0.75,
};

const parseLibrary = (output) => {
  try {
    const library = JSON.parse(output);
    return Array.isArray(library.tracks) ? library : null;
  } catch (error) {
    return null;
  }
};

export const updateState = (event, previousState = initialState) => {
  if (Object.prototype.hasOwnProperty.call(event, "output")) {
    const library = parseLibrary(event.output);
    if (library) {
      const currentStillExists =
        !previousState.currentId ||
        library.tracks.some((track) => track.id === previousState.currentId);
      return currentStillExists
        ? { ...previousState, library, error: null }
        : {
            ...previousState,
            library,
            error: null,
            currentId: null,
            audioUrl: null,
            queue: [],
            queueIndex: -1,
            playing: false,
            currentTime: 0,
            duration: 0,
          };
    }
  }
  if (event.error) {
    return { ...previousState, error: String(event.error) };
  }

  switch (event.type) {
    case "NAVIGATE":
      return {
        ...previousState,
        view: event.view,
        backView: event.backView || event.view,
        selectedArtist: event.artist || null,
        selectedAlbum: event.album || null,
        selectedPlaylist: event.playlist || null,
        search: event.keepSearch ? previousState.search : "",
      };
    case "SEARCH":
      return { ...previousState, search: event.value };
    case "LOAD_TRACK":
      return {
        ...previousState,
        loadingId: event.id,
        stageRequest: event.requestId,
        error: null,
      };
    case "TRACK_STAGED":
      return event.requestId !== previousState.stageRequest
        ? previousState
        : {
            ...previousState,
            loadingId: null,
            currentId: event.id,
            audioUrl: event.url,
            queue: event.queue,
            queueIndex: event.queueIndex,
            currentTime: 0,
            duration: 0,
          };
    case "TRACK_FAILED":
      return event.requestId !== previousState.stageRequest
        ? previousState
        : { ...previousState, loadingId: null, error: event.error };
    case "AUDIO_PLAY":
      return { ...previousState, playing: true };
    case "AUDIO_PAUSE":
      return { ...previousState, playing: false };
    case "AUDIO_TIME":
      return { ...previousState, currentTime: event.value };
    case "AUDIO_DURATION":
      return { ...previousState, duration: event.value };
    case "VOLUME":
      return { ...previousState, volume: event.value };
    default:
      return previousState;
  }
};

const compare = (left, right) =>
  left.localeCompare(right, undefined, { sensitivity: "base" });

const formatDuration = (seconds) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "–:––";
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, "0")}`;
};

const countLabel = (count, noun) =>
  `${count.toLocaleString()} ${noun}${count === 1 ? "" : "s"}`;

const libraryMaps = (library) => {
  const tracksById = {};
  const artists = {};
  const albums = {};

  for (const track of library.tracks) {
    tracksById[track.id] = track;
    if (!artists[track.artist]) {
      artists[track.artist] = { name: track.artist, tracks: 0, albums: {} };
    }
    artists[track.artist].tracks += 1;
    artists[track.artist].albums[track.album] =
      (artists[track.artist].albums[track.album] || 0) + 1;

    const key = `${track.artist}\u0000${track.album}`;
    if (!albums[key]) {
      albums[key] = {
        key,
        artist: track.artist,
        album: track.album,
        tracks: [],
      };
    }
    albums[key].tracks.push(track);
  }

  return {
    tracksById,
    artists: Object.values(artists).sort((a, b) => compare(a.name, b.name)),
    albums: Object.values(albums).sort(
      (a, b) => compare(a.album, b.album) || compare(a.artist, b.artist),
    ),
  };
};

const stageTrack = (track, queueTracks, dispatch, selectedIndex = null) => {
  if (!track || !/^[0-9a-f]{16}$/.test(track.id)) return;
  const queue = queueTracks.map((item) => item.id);
  const queueIndex = selectedIndex === null
    ? Math.max(0, queue.indexOf(track.id))
    : selectedIndex;
  const requestId = ++nextStageRequest;
  dispatch({ type: "LOAD_TRACK", id: track.id, requestId });
  run(`python3 "music-player.widget/library.py" stage ${track.id}`)
    .then((output) => {
      const staged = JSON.parse(output);
      dispatch({
        type: "TRACK_STAGED",
        id: track.id,
        url: `${staged.url}?v=${Date.now()}`,
        queue,
        queueIndex,
        requestId,
      });
    })
    .catch((error) =>
      dispatch({
        type: "TRACK_FAILED",
        error: String(error),
        requestId,
      }),
    );
};

const queueTracks = (state, maps) =>
  state.queue.map((id) => maps.tracksById[id]).filter(Boolean);

const moveInQueue = (state, maps, dispatch, offset) => {
  const tracks = queueTracks(state, maps);
  if (!tracks.length) return;
  let index = state.queueIndex + offset;
  if (index < 0) index = tracks.length - 1;
  if (index >= tracks.length) index = 0;
  stageTrack(tracks[index], tracks, dispatch, index);
};

const togglePlayback = () => {
  const audio = document.getElementById(AUDIO_ID);
  if (!audio) return;
  if (audio.paused) audio.play();
  else audio.pause();
};

const ArtistRows = ({ artists, dispatch }) => (
  <div className="rows">
    {artists.map((artist) => (
      <button
        className="navrow"
        key={artist.name}
        onClick={() =>
          dispatch({ type: "NAVIGATE", view: "artist", artist: artist.name })
        }
      >
        <span className="primary">{artist.name}</span>
        <span className="secondary">
          {countLabel(Object.keys(artist.albums).length, "album")} · {countLabel(artist.tracks, "track")}
        </span>
        <span className="chevron">›</span>
      </button>
    ))}
  </div>
);

const AlbumRows = ({ albums, backView, dispatch }) => (
  <div className="rows">
    {albums.map((album) => (
      <button
        className="navrow"
        key={album.key}
        onClick={() =>
          dispatch({
            type: "NAVIGATE",
            view: "album",
            backView,
            artist: album.artist,
            album: album.album,
          })
        }
      >
        <span className="primary">{album.album}</span>
        <span className="secondary">{album.artist} · {countLabel(album.tracks.length, "track")}</span>
        <span className="chevron">›</span>
      </button>
    ))}
  </div>
);

const TrackRows = ({ tracks, state, dispatch }) => (
  <div className="rows tracks">
    {tracks.map((track, index) => (
      <button
        className={`trackrow ${state.currentId === track.id ? "current" : ""}`}
        key={`${track.id}-${index}`}
        onClick={() => stageTrack(track, tracks, dispatch, index)}
      >
        <span className="tracknumber">
          {state.loadingId === track.id
            ? "…"
            : track.disc > 1
              ? `${track.disc}.${track.track || index + 1}`
              : track.track || index + 1}
        </span>
        <span className="trackcopy">
          <span className="primary">{track.title}</span>
          <span className="secondary">{track.artist} · {track.album}</span>
        </span>
        <span className="tracktime">{formatDuration(track.duration)}</span>
      </button>
    ))}
  </div>
);

const Breadcrumb = ({ state, dispatch }) => {
  if (state.view === "artist") {
    return (
      <div className="crumbs">
        <button onClick={() => dispatch({ type: "NAVIGATE", view: "artists" })}>
          Artists
        </button>
        <span>›</span><b>{state.selectedArtist}</b>
      </div>
    );
  }
  if (state.view === "album") {
    const destination = state.backView === "artist" ? "artist" : "albums";
    return (
      <div className="crumbs">
        <button
          onClick={() =>
            dispatch({
              type: "NAVIGATE",
              view: destination,
              artist: destination === "artist" ? state.selectedArtist : null,
            })
          }
        >
          {destination === "artist" ? state.selectedArtist : "Albums"}
        </button>
        <span>›</span><b>{state.selectedAlbum}</b>
      </div>
    );
  }
  if (state.view === "playlist") {
    const playlist = (state.library.playlists || []).find(
      (item) => item.id === state.selectedPlaylist,
    );
    return (
      <div className="crumbs">
        <button onClick={() => dispatch({ type: "NAVIGATE", view: "playlists" })}>
          Playlists
        </button>
        <span>›</span><b>{playlist ? playlist.name : "Playlist"}</b>
      </div>
    );
  }
  return null;
};

const Browser = ({ state, maps, dispatch }) => {
  const library = state.library || EMPTY_LIBRARY;
  const query = state.search.trim().toLocaleLowerCase();
  if (query) {
    const results = library.tracks
      .filter((track) =>
        `${track.title} ${track.artist} ${track.album}`
          .toLocaleLowerCase()
          .includes(query),
      )
      .slice(0, 200);
    return (
      <div className="browser">
        <div className="resulthead">
          {results.length} result{results.length === 1 ? "" : "s"}
          {results.length === 200 && " · first 200"}
        </div>
        {results.length ? (
          <TrackRows tracks={results} state={state} dispatch={dispatch} />
        ) : (
          <div className="empty">No matching tracks, artists, or albums.</div>
        )}
      </div>
    );
  }

  let content;
  if (state.view === "artists") {
    content = <ArtistRows artists={maps.artists} dispatch={dispatch} />;
  } else if (state.view === "albums") {
    content = <AlbumRows albums={maps.albums} backView="albums" dispatch={dispatch} />;
  } else if (state.view === "artist") {
    const albums = maps.albums.filter(
      (album) => album.artist === state.selectedArtist,
    );
    content = <AlbumRows albums={albums} backView="artist" dispatch={dispatch} />;
  } else if (state.view === "album") {
    const key = `${state.selectedArtist}\u0000${state.selectedAlbum}`;
    const album = maps.albums.find((item) => item.key === key);
    content = album ? (
      <TrackRows tracks={album.tracks} state={state} dispatch={dispatch} />
    ) : (
      <div className="empty">Album no longer found.</div>
    );
  } else if (state.view === "playlists") {
    content = library.playlists.length ? (
      <div className="rows">
        {library.playlists.map((playlist) => (
          <button
            className="navrow"
            key={playlist.id}
            onClick={() =>
              dispatch({
                type: "NAVIGATE",
                view: "playlist",
                playlist: playlist.id,
              })
            }
          >
            <span className="primary">{playlist.name}</span>
            <span className="secondary">{countLabel(playlist.trackIds.length, "track")}</span>
            <span className="chevron">›</span>
          </button>
        ))}
      </div>
    ) : (
      <div className="empty">
        No playlist files found in the library’s playlists folder.
        <small>Add .m3u, .m3u8, or .pls files and refresh.</small>
      </div>
    );
  } else if (state.view === "playlist") {
    const playlist = library.playlists.find(
      (item) => item.id === state.selectedPlaylist,
    );
    const tracks = playlist
      ? playlist.trackIds.map((id) => maps.tracksById[id]).filter(Boolean)
      : [];
    content = tracks.length ? (
      <TrackRows tracks={tracks} state={state} dispatch={dispatch} />
    ) : (
      <div className="empty">This playlist has no matching local tracks.</div>
    );
  }

  return (
    <div className="browser">
      <Breadcrumb state={state} dispatch={dispatch} />
      {content}
    </div>
  );
};

const NowPlaying = ({ state, maps, dispatch }) => {
  const track = maps.tracksById[state.currentId];
  const elapsed = Math.min(state.currentTime, state.duration || state.currentTime);
  return (
    <div className="player">
      {state.audioUrl && (
        <audio
          id={AUDIO_ID}
          key={state.audioUrl}
          src={state.audioUrl}
          autoPlay
          onCanPlay={(event) => {
            event.currentTarget.volume = state.volume;
          }}
          onLoadedMetadata={(event) =>
            dispatch({ type: "AUDIO_DURATION", value: event.currentTarget.duration })
          }
          onTimeUpdate={(event) =>
            dispatch({ type: "AUDIO_TIME", value: event.currentTarget.currentTime })
          }
          onPlay={() => dispatch({ type: "AUDIO_PLAY" })}
          onPause={() => dispatch({ type: "AUDIO_PAUSE" })}
          onEnded={() => moveInQueue(state, maps, dispatch, 1)}
          onError={() =>
            dispatch({
              type: "TRACK_FAILED",
              error: "This track could not be played.",
              requestId: state.stageRequest,
            })
          }
        />
      )}

      <div className="nowrow">
        <div className="nowcopy">
          <span className="nowlabel">Now playing</span>
          <strong>{track ? track.title : "Choose a track"}</strong>
          <span>{track ? `${track.artist} · ${track.album}` : "Proton Drive library"}</span>
        </div>
        <div className="transport">
          <button
            disabled={!track}
            aria-label="Previous track"
            onClick={() => {
              const audio = document.getElementById(AUDIO_ID);
              if (audio && audio.currentTime > 4) audio.currentTime = 0;
              else moveInQueue(state, maps, dispatch, -1);
            }}
          >‹</button>
          <button
            className="play"
            disabled={!track}
            aria-label={state.playing ? "Pause" : "Play"}
            onClick={togglePlayback}
          >{state.playing ? "Ⅱ" : "▶"}</button>
          <button
            disabled={!track}
            aria-label="Next track"
            onClick={() => moveInQueue(state, maps, dispatch, 1)}
          >›</button>
        </div>
      </div>

      <div className="timeline">
        <span>{formatDuration(elapsed)}</span>
        <input
          type="range"
          min="0"
          max={state.duration || 1}
          step="0.1"
          value={elapsed || 0}
          disabled={!track}
          onInput={(event) => {
            const audio = document.getElementById(AUDIO_ID);
            if (audio) audio.currentTime = Number(event.target.value);
          }}
        />
        <span>{formatDuration(state.duration)}</span>
        <label>
          <span>vol</span>
          <input
            className="volume"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={state.volume}
            onInput={(event) => {
              const value = Number(event.target.value);
              const audio = document.getElementById(AUDIO_ID);
              if (audio) audio.volume = value;
              dispatch({ type: "VOLUME", value });
            }}
          />
        </label>
      </div>
    </div>
  );
};

export const render = (state, dispatch) => {
  if (!state.library) {
    return (
      <div className="panel loading">
        <span className="spinner" />
        <strong>Indexing Proton Drive</strong>
        <span>Reading artists, albums, and track metadata…</span>
        {state.error && <em>{state.error}</em>}
      </div>
    );
  }

  const maps = libraryMaps(state.library);
  const stats = state.library.stats || EMPTY_LIBRARY.stats;
  return (
    <section className="panel">
      <header>
        <div>
          <span className="title">Proton Library</span>
          <span className="subtitle">local music</span>
        </div>
        <span className="stats">{countLabel(stats.tracks, "track")}</span>
      </header>

      <nav className="tabs">
        {["artists", "albums", "playlists"].map((view) => (
          <button
            className={state.view === view || state.view === view.slice(0, -1) ? "active" : ""}
            key={view}
            onClick={() => dispatch({ type: "NAVIGATE", view })}
          >{view}</button>
        ))}
      </nav>

      <div className="searchbox">
        <span>⌕</span>
        <input
          type="text"
          value={state.search}
          placeholder="Filter tracks, artists, and albums"
          onInput={(event) => dispatch({ type: "SEARCH", value: event.target.value })}
        />
        {state.search && (
          <button onClick={() => dispatch({ type: "SEARCH", value: "" })}>×</button>
        )}
      </div>

      <Browser state={state} maps={maps} dispatch={dispatch} />
      {state.error && <div className="error">{state.error}</div>}
      <NowPlaying state={state} maps={maps} dispatch={dispatch} />
    </section>
  );
};

export const className = `
  left: 28px;
  bottom: 28px;
  width: 334px;
  color: #dde3e9;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  -webkit-font-smoothing: antialiased;

  * { box-sizing: border-box; }
  button, input { font: inherit; }
  button { cursor: pointer; }
  button:disabled { cursor: default; }

  .panel {
    display: flex;
    flex-direction: column;
    width: 334px;
    height: calc(45vh - 39.6px);
    padding: 14px 16px 13px;
    overflow: hidden;
    background: rgba(13, 15, 19, 0.78);
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 12px;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(22px) saturate(1.08);
  }

  .loading {
    align-items: center;
    justify-content: center;
    height: 190px;
    color: #77818c;
    font-size: 10px;
    gap: 8px;
  }
  .loading strong { color: #cfd6dd; font-size: 12px; font-weight: 500; }
  .loading em { max-width: 280px; color: #e2b04a; font-style: normal; text-align: center; }
  .spinner {
    width: 18px;
    height: 18px;
    margin-bottom: 5px;
    border: 2px solid rgba(133, 197, 218, 0.2);
    border-top-color: #85c5da;
    border-radius: 50%;
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding-bottom: 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }
  header > div { display: flex; align-items: baseline; gap: 10px; }
  .title {
    color: #aab4bf;
    font-size: 11px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
  }
  .subtitle, .stats { color: #626c77; font-size: 8px; }

  .tabs { display: flex; gap: 3px; padding: 9px 0 8px; }
  .tabs button {
    padding: 5px 10px;
    color: #6f7984;
    background: transparent;
    border: 0;
    border-radius: 5px;
    font-size: 9px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .tabs button.active {
    color: #dce3e9;
    background: rgba(133, 197, 218, 0.13);
  }

  .searchbox {
    display: flex;
    align-items: center;
    height: 30px;
    padding: 0 9px;
    margin-bottom: 8px;
    color: #59636e;
    background: rgba(255, 255, 255, 0.055);
    border: 1px solid rgba(255, 255, 255, 0.065);
    border-radius: 6px;
  }
  .searchbox > span { width: 20px; font-size: 16px; }
  .searchbox input {
    flex: 1;
    min-width: 0;
    color: #cfd6dd;
    background: transparent;
    border: 0;
    outline: 0;
    font-size: 9px;
  }
  .searchbox input::placeholder { color: #535c66; }
  .searchbox button {
    padding: 0 2px;
    color: #77818c;
    background: transparent;
    border: 0;
    font-size: 14px;
  }

  .browser {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: rgba(133, 197, 218, 0.25) transparent;
  }
  .browser::-webkit-scrollbar { width: 5px; }
  .browser::-webkit-scrollbar-thumb {
    background: rgba(133, 197, 218, 0.22);
    border-radius: 3px;
  }

  .crumbs, .resulthead {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    align-items: baseline;
    gap: 7px;
    min-height: 27px;
    padding: 5px 7px 7px;
    color: #5f6974;
    background: rgba(16, 18, 22, 0.96);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    font-size: 8px;
  }
  .crumbs button {
    padding: 0;
    color: #85c5da;
    background: transparent;
    border: 0;
  }
  .crumbs b { color: #9fa9b3; font-weight: 500; }

  .rows { padding-bottom: 4px; }
  .navrow, .trackrow {
    display: grid;
    width: 100%;
    min-height: 37px;
    padding: 6px 7px;
    color: inherit;
    text-align: left;
    background: transparent;
    border: 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }
  .navrow { grid-template-columns: minmax(0, 1fr) auto 14px; align-items: center; gap: 9px; }
  .navrow:hover, .trackrow:hover { background: rgba(133, 197, 218, 0.075); }
  .primary {
    overflow: hidden;
    color: #d5dce2;
    font-size: 10px;
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .secondary {
    overflow: hidden;
    color: #65707b;
    font-size: 8px;
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chevron { color: #56616d; font-size: 15px; text-align: right; }

  .trackrow {
    grid-template-columns: 27px minmax(0, 1fr) 34px;
    align-items: center;
    gap: 7px;
  }
  .trackrow.current { background: rgba(127, 191, 158, 0.08); }
  .trackrow.current .primary { color: #9ecbb4; }
  .tracknumber, .tracktime {
    color: #56616d;
    font-size: 8px;
    font-variant-numeric: tabular-nums;
  }
  .tracknumber { text-align: right; }
  .tracktime { text-align: right; }
  .trackcopy { display: flex; flex-direction: column; min-width: 0; gap: 2px; }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 150px;
    padding: 20px;
    color: #707a85;
    font-size: 9px;
    line-height: 1.6;
    text-align: center;
  }
  .empty small { color: #535c66; font-size: 8px; }

  .error {
    flex: none;
    padding: 6px 8px;
    overflow: hidden;
    color: #e2b04a;
    background: rgba(226, 176, 74, 0.07);
    font-size: 8px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .player {
    flex: none;
    padding-top: 10px;
    margin-top: 7px;
    border-top: 1px solid rgba(255, 255, 255, 0.09);
  }
  .player audio { display: none; }
  .nowrow { display: flex; align-items: center; min-height: 45px; }
  .nowcopy { display: flex; flex: 1; flex-direction: column; min-width: 0; gap: 2px; }
  .nowlabel {
    color: #5d6873;
    font-size: 7px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .nowcopy strong, .nowcopy > span:last-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .nowcopy strong { color: #e0e5e9; font-size: 11px; font-weight: 500; }
  .nowcopy > span:last-child { color: #6e7984; font-size: 8px; }

  .transport { display: flex; align-items: center; gap: 4px; margin-left: 14px; }
  .transport button {
    width: 27px;
    height: 27px;
    padding: 0;
    color: #9ca6b0;
    background: rgba(255, 255, 255, 0.055);
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 50%;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 17px;
    line-height: 1;
  }
  .transport button.play {
    width: 33px;
    height: 33px;
    color: #e4e9ed;
    background: rgba(133, 197, 218, 0.2);
    font-size: 12px;
  }
  .transport button:disabled { opacity: 0.28; }

  .timeline {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-top: 6px;
    color: #59636e;
    font-size: 7px;
    font-variant-numeric: tabular-nums;
  }
  .timeline > input { flex: 1; min-width: 90px; }
  input[type="range"] {
    height: 3px;
    margin: 0;
    appearance: none;
    background: rgba(255, 255, 255, 0.12);
    border-radius: 2px;
    outline: 0;
  }
  input[type="range"]::-webkit-slider-thumb {
    width: 8px;
    height: 8px;
    appearance: none;
    background: #85c5da;
    border: 0;
    border-radius: 50%;
  }
  .timeline label { display: flex; align-items: center; gap: 5px; margin-left: 4px; }
  .timeline label span { color: #515b65; text-transform: uppercase; }
  .timeline .volume { flex: none; width: 48px; }
`;
