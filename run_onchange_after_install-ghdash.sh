#!/bin/sh
set -eu

version=v4.25.2
case "$(uname -m)" in
  arm64)
    arch=arm64
    expected=a0e787ef5679e45e08c69edb34f25ed811aefc14157dd08f5721edcb5a3ec671
    ;;
  x86_64)
    arch=amd64
    expected=ced29d14d9cf4a7508ca3a7466f0a6867fe9694fc8c65cd354bc842f7f32c18a
    ;;
  *)
    echo "Unsupported architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

asset="gh-dash_${version}_darwin-${arch}"
tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT HUP INT TERM
curl -fsSL \
  "https://github.com/dlvhdr/gh-dash/releases/download/${version}/${asset}" \
  -o "$tmp_dir/gh-dash"
echo "$expected  $tmp_dir/gh-dash" | shasum -a 256 -c -

extension_dir="${XDG_DATA_HOME:-$HOME/.local/share}/gh/extensions/gh-dash"
mkdir -p "$extension_dir"
install -m 755 "$tmp_dir/gh-dash" "$extension_dir/gh-dash"
cat > "$extension_dir/manifest.yml" <<EOF
owner: dlvhdr
name: gh-dash
host: github.com
tag: $version
ispinned: true
path: $extension_dir/gh-dash
EOF
