#!/bin/sh
set -eu

code_bin=$(command -v code 2>/dev/null || true)
if [ -z "$code_bin" ]; then
  for candidate in \
    /opt/homebrew/bin/code \
    /usr/local/bin/code \
    "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"; do
    if [ -x "$candidate" ]; then
      code_bin=$candidate
      break
    fi
  done
fi
if [ -z "$code_bin" ]; then
  echo "Visual Studio Code is not installed" >&2
  exit 1
fi

mkdir -p "$HOME/.vscode/extensions"
for extension in \
  anotherglitchinthematrix.monochrome \
  arcticicestudio.nord-visual-studio-code \
  dracula-theme.theme-dracula \
  eamodio.gitlens \
  github.github-vscode-theme \
  github.vscode-github-actions \
  julialang.language-julia \
  mathematic.vscode-pdf \
  mhutchie.git-graph \
  ms-azuretools.vscode-docker \
  ms-vscode-remote.remote-containers \
  ms-vscode-remote.remote-ssh \
  ms-vscode-remote.remote-ssh-edit \
  ms-vscode.remote-explorer \
  ms-vscode.remote-server \
  quarto.quarto \
  rokoroku.vscode-theme-darcula \
  sdras.night-owl \
  tomoki1207.pdf \
  wesbos.theme-cobalt2 \
  zhuangtongfa.material-theme; do
  "$code_bin" --install-extension "$extension" --force
done
