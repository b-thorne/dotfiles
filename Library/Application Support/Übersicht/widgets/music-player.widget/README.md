# Proton Drive music player prototype

An interactive Übersicht music browser and player for the locally synchronized
Proton Drive library.

## Features

- Scrollable artist, album, playlist, and track views with breadcrumbs.
- Library-wide filtering by track, artist, or album.
- Previous, play/pause, next, seek, and volume controls.
- Queue-based continuation within the selected album, playlist, or search result.
- Read-only `.m3u`, `.m3u8`, and `.pls` playlist support, plus playlist folders
  containing audio files.
- No album artwork.

Use Übersicht's interaction shortcut before clicking, typing, or scrolling in a
widget. The 334-pixel-wide player is positioned at the bottom left, matching the
visible width of every panel in the right-hand stack without conflicting with it.

## How it works

`library.py` discovers a `ProtonDrive-*-folder` containing a `music/Music`
directory, so no account name or email address is committed. Set
`PROTON_MUSIC_ROOT` to override discovery.

The first index reads Spotlight audio metadata with macOS `mdls` and caches the
result in `~/Library/Caches/uebersicht-music-player/library.json`. Later refreshes
scan a lightweight file fingerprint and reuse the cache if the library has not
changed.

Übersicht's static server cannot reliably serve symlinks into a File Provider
volume. When a track is selected, the helper creates an APFS clone under the
installed widget's `cache/` directory (falling back to a copy if needed). The
clone has a separate inode, so playback and cache timestamps cannot modify the
Proton source. Übersicht serves it with HTTP byte-range support, and the cache
is limited to the 24 most recently staged tracks.

The local library currently contains no `.m3u`, `.m3u8`, or `.pls` files, and its
`Music/playlists/` directory is empty. The Playlists tab will populate on the
next five-minute refresh after compatible definitions are added.

The canonical copy is managed by chezmoi at:

```text
~/.local/share/chezmoi/Library/Application Support/Übersicht/widgets/music-player.widget/
```
