#!/bin/sh
# Installs the command e500, the VS Code extension and the PC-E500 emulator on Linux and macOS,
# in the user's own folders; run again, it brings them up to date. ROMs and programs are kept.
#
#   sh install.sh [--rom FILE] [--vscode] [--no-emulator] [--vsix FILE] [--emulator FILE]
set -eu

HOME_DIR=${POCKECOM_HOME:-$HOME/pockecom}
BIN_DIR=$HOME/.local/bin
NODE_LINE=latest-v22.x

case "${E500_LANG:-${LC_ALL:-${LC_MESSAGES:-${LANG:-}}}}" in ja*) JA=1 ;; *) JA= ;; esac
say() { if [ -n "$JA" ]; then printf '%s\n' "$1"; else printf '%s\n' "$2"; fi; }
die() { say "$1" "$2" >&2; exit 1; }

usage() {
  say "sh install.sh [--rom ファイル] [--vscode] [--no-emulator] [--vsix ファイル] [--emulator ファイル]
  --rom ファイル       自分の ROM をエミュレータの rom フォルダにコピーする
  --vscode             VS Code がなければ入れる（Linux では管理者のパスワードを聞かれる）
  --no-emulator        エミュレータと .NET を入れない（書く、変換するだけのとき）
  --vsix ファイル      取ってくる代わりに、手元の .vsix を使う
  --emulator ファイル  取ってくる代わりに、手元の .tar.gz を使う" \
      "sh install.sh [--rom FILE] [--vscode] [--no-emulator] [--vsix FILE] [--emulator FILE]
  --rom FILE       Copy a ROM of yours into the emulator's rom folder
  --vscode         Install VS Code if it is not there (asks for the administrator's password on Linux)
  --no-emulator    Without the emulator and .NET (to write and convert only)
  --vsix FILE      Use this .vsix instead of the latest one
  --emulator FILE  Use this .tar.gz instead of the latest one"
}

# fetch URL [FILE]: to the file, or to standard output.
fetch() {
  if command -v curl >/dev/null 2>&1; then
    if [ $# -gt 1 ]; then curl -fL --progress-bar -o "$2" "$1"; else curl -fsSL "$1"; fi
  elif command -v wget >/dev/null 2>&1; then
    if [ $# -gt 1 ]; then wget -nv -O "$2" "$1"; else wget -nv -O - "$1"; fi
  else die "curl か wget が要ります。" "curl or wget is needed."; fi
}

# latest REPOSITORY ENDING FILE: the file of the latest release whose name ends so.
latest() {
  releases=$(fetch "https://api.github.com/repos/litchi-gh/$1/releases/latest") || die "GitHub から最新のリリースを調べられません。ネットワークを確かめて、もう一度実行してください。" "Cannot ask GitHub for the latest release. Check the network and run this again."
  asset=$(printf '%s\n' "$releases" | grep -o '"browser_download_url": *"[^"]*"' | cut -d'"' -f4 | grep -F -- "$2" | head -n 1) || asset=
  [ -n "$asset" ] || die "最新のリリースに、名前が $2 で終わるファイルがありません: https://github.com/litchi-gh/$1/releases" "The latest release has no file that ends in $2: https://github.com/litchi-gh/$1/releases"
  say "取得: $asset" "Getting $asset"
  fetch "$asset" "$3"
}

# unpack_zip FILE FOLDER
unpack_zip() {
  if command -v unzip >/dev/null 2>&1; then unzip -q -o "$1" -d "$2"
  elif command -v python3 >/dev/null 2>&1; then python3 -m zipfile -e "$1" "$2"
  else tar -xf "$1" -C "$2"; fi
}

# Node.js 20.12 or later?
node_ok() { "$1" -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>20||a===20&&b>=12?0:1)' >/dev/null 2>&1; }

install_node() {
  if command -v node >/dev/null 2>&1 && node_ok node; then return; fi
  if [ -x "$HOME_DIR/node/bin/node" ] && node_ok "$HOME_DIR/node/bin/node"; then return; fi
  say "Node.js を入れます（$HOME_DIR/node）。" "Installing Node.js ($HOME_DIR/node)."
  fetch "https://nodejs.org/dist/$NODE_LINE/SHASUMS256.txt" > "$WORK/sums"
  line=$(grep "node-v[0-9.]*-$SYSTEM-$ARCH\.tar\.gz\$" "$WORK/sums" | head -n 1)
  [ -n "$line" ] || die "この PC 用の Node.js が見つかりません。" "There is no Node.js for this computer."
  file=${line##* }
  fetch "https://nodejs.org/dist/$NODE_LINE/$file" "$WORK/$file"
  if command -v sha256sum >/dev/null 2>&1; then sum=$(sha256sum "$WORK/$file"); else sum=$(shasum -a 256 "$WORK/$file"); fi
  [ "${sum%% *}" = "${line%% *}" ] || die "Node.js のファイルが壊れています。もう一度実行してください。" "The Node.js file is damaged. Run this again."
  mkdir "$WORK/node"
  tar -xzf "$WORK/$file" -C "$WORK/node" --strip-components=1
  rm -rf "$HOME_DIR/node"
  mv "$WORK/node" "$HOME_DIR/node"
}

dotnet_ok() { "$1" --list-runtimes 2>/dev/null | grep -q '^Microsoft\.NETCore\.App 10\.'; }

install_dotnet() {
  if command -v dotnet >/dev/null 2>&1 && dotnet_ok dotnet; then return; fi
  if [ -x "$HOME_DIR/dotnet/dotnet" ] && dotnet_ok "$HOME_DIR/dotnet/dotnet"; then return; fi
  say ".NET 10 ランタイムを入れます（$HOME_DIR/dotnet）。" "Installing the .NET 10 runtime ($HOME_DIR/dotnet)."
  fetch https://dot.net/v1/dotnet-install.sh "$WORK/dotnet-install.sh"
  bash "$WORK/dotnet-install.sh" --channel 10.0 --runtime dotnet --install-dir "$HOME_DIR/dotnet" --no-path
}

install_extension() {
  if [ -n "$VSIX" ]; then cp "$VSIX" "$WORK/devtools.vsix"; else latest pc-e500_tools .vsix "$WORK/devtools.vsix"; fi
  mkdir "$WORK/devtools"
  unpack_zip "$WORK/devtools.vsix" "$WORK/devtools"
  [ -f "$WORK/devtools/extension/bin/e500" ] || die "コマンド e500 の入っていない .vsix です。" "The .vsix has no command e500."
  mkdir -p "$HOME_DIR/devtools"
  rm -rf "$HOME_DIR/devtools/extension"
  mv "$WORK/devtools/extension" "$HOME_DIR/devtools/extension"
}

install_emulator() {
  if [ -n "$EMULATOR" ]; then cp "$EMULATOR" "$WORK/emulator.tar.gz"
  elif [ "$SYSTEM" = linux ]; then latest pc-e500_emulator_pockecom "linux-$ARCH.tar.gz" "$WORK/emulator.tar.gz"
  else latest pc-e500_emulator_pockecom "osx-$ARCH.tar.gz" "$WORK/emulator.tar.gz"; fi
  # Over what is there: the ROMs and the X: drive are not in the archive.
  mkdir "$WORK/Emulator"
  tar -xzf "$WORK/emulator.tar.gz" -C "$WORK/Emulator" --strip-components=1
  mkdir -p "$HOME_DIR/Emulator/rom"
  cp -R "$WORK/Emulator/." "$HOME_DIR/Emulator/"
  if [ "$SYSTEM" = darwin ]; then xattr -dr com.apple.quarantine "$HOME_DIR/Emulator" 2>/dev/null || true; fi
}

install_vscode() {
  if [ "$SYSTEM" = darwin ]; then
    say "VS Code を入れます（/Applications）。" "Installing VS Code (/Applications)."
    fetch https://update.code.visualstudio.com/latest/darwin-universal/stable "$WORK/vscode.zip"
    ditto -xk "$WORK/vscode.zip" /Applications
  elif command -v apt-get >/dev/null 2>&1; then
    say "VS Code を入れます。自分のパスワードを聞かれたら打ちます（表示されません）。" "Installing VS Code. Type your password if you are asked for it (it is not shown)."
    case $ARCH in x64) deb=linux-deb-x64 ;; *) deb=linux-deb-arm64 ;; esac
    fetch "https://update.code.visualstudio.com/latest/$deb/stable" "$WORK/vscode.deb"
    chmod 755 "$WORK"; chmod 644 "$WORK/vscode.deb"
    sudo apt-get install -y "$WORK/vscode.deb"
  else say "VS Code は https://code.visualstudio.com/ から入れてください。" "Install VS Code from https://code.visualstudio.com/."; fi
}

# Prints the command code of VS Code, if there is one.
vscode() {
  if command -v code >/dev/null 2>&1; then command -v code; return; fi
  app="/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
  if [ -x "$app" ]; then printf '%s\n' "$app"; fi
}

write_command() {
  mkdir -p "$BIN_DIR"
  {
    printf '%s\n' '#!/bin/sh' '# Written by install.sh of pc-e500_tools.' "base='$(printf %s "$HOME_DIR" | sed "s/'/'\\\\''/g")'"
    cat <<'EOF'
if [ -x "$base/dotnet/dotnet" ]; then
  export DOTNET_ROOT="$base/dotnet" PATH="$base/dotnet:$PATH"
  # The runtime alone does not bring the libraries for the languages.
  export DOTNET_SYSTEM_GLOBALIZATION_INVARIANT="${DOTNET_SYSTEM_GLOBALIZATION_INVARIANT:-1}"
fi
if [ -x "$base/node/bin/node" ]; then PATH="$base/node/bin:$PATH"; fi
if [ -z "${PCE500_EMULATOR:-}" ] && [ -d "$base/Emulator" ]; then export PCE500_EMULATOR="$base/Emulator"; fi
exec sh "$base/devtools/extension/bin/e500" "$@"
EOF
  } > "$BIN_DIR/e500.new"
  chmod +x "$BIN_DIR/e500.new"
  # Another program of that name is kept.
  if [ -f "$BIN_DIR/e500" ] && ! grep -q 'bin/e500' "$BIN_DIR/e500"; then mv "$BIN_DIR/e500" "$BIN_DIR/e500.old"; fi
  mv -f "$BIN_DIR/e500.new" "$BIN_DIR/e500"
}

# A ROM of the same name with other contents is kept; a failure here stops nothing.
copy_rom() {
  to=$HOME_DIR/Emulator/rom/${ROM##*/}
  if cmp -s "$ROM" "$to"; then return; fi
  if [ -e "$to" ]; then say "中身の違う ROM があるので、コピーしませんでした: $to" "Another ROM of that name is there, and was kept: $to"; return; fi
  cp "$ROM" "$to" || say "ROM をコピーできませんでした: $to" "The ROM could not be copied to $to"
}

# ~/.local/bin on PATH, in the file the shell reads; once.
add_path() {
  case ":$PATH:" in *":$BIN_DIR:"*) return ;; esac
  case "${SHELL:-}" in
    */zsh) profile=$HOME/.zshrc ;;
    */fish)
      mkdir -p "$HOME/.config/fish/conf.d"
      printf '%s\n' '# pc-e500_tools' 'fish_add_path "$HOME/.local/bin"' > "$HOME/.config/fish/conf.d/pc-e500_tools.fish"
      REOPEN=1
      return ;;
    */bash)
      profile=$HOME/.bashrc
      # A terminal of macOS starts bash as a login shell.
      if [ "$SYSTEM" = darwin ]; then
        profile=$HOME/.bash_profile
        if [ ! -f "$profile" ] && [ -f "$HOME/.profile" ]; then profile=$HOME/.profile; fi
      fi ;;
    *) profile=$HOME/.profile ;;
  esac
  # shellcheck disable=SC2016
  path='export PATH="$HOME/.local/bin:$PATH"'
  if ! { [ -f "$profile" ] && grep -qF "$path" "$profile"; }; then printf '\n# pc-e500_tools\n%s\n' "$path" >> "$profile"; fi
  REOPEN=1
}

main() {
  ROM=; VSIX=; EMULATOR=; WITH_EMULATOR=1; WITH_VSCODE=; REOPEN=
  while [ $# -gt 0 ]; do
    case $1 in
      --rom|--vsix|--emulator)
        [ $# -gt 1 ] || die "$1 にファイルの名前がありません。" "$1 needs a file name."
        [ -f "$2" ] || die "ファイルがありません: $2" "There is no file $2"
        case $1 in --rom) ROM=$2 ;; --vsix) VSIX=$2 ;; *) EMULATOR=$2 ;; esac
        shift ;;
      --no-emulator) WITH_EMULATOR= ;;
      --vscode) WITH_VSCODE=1 ;;
      -h|--help) usage; exit 0 ;;
      *) usage >&2; exit 2 ;;
    esac
    shift
  done
  case $(uname -s) in Linux) SYSTEM=linux ;; Darwin) SYSTEM=darwin ;; *) die "Linux と macOS 用です。" "This is for Linux and macOS." ;; esac
  case $(uname -m) in x86_64|amd64) ARCH=x64 ;; arm64|aarch64) ARCH=arm64 ;; *) die "対応していない CPU です: $(uname -m)" "This CPU is not supported: $(uname -m)" ;; esac
  if [ -n "$ROM" ] && [ -z "$WITH_EMULATOR" ]; then die "--rom と --no-emulator は一緒に使えません。" "--rom and --no-emulator cannot be used together."; fi
  [ "$(id -u)" != 0 ] || [ -n "${E500_AS_ROOT:-}" ] || die "sudo を付けずに実行してください（自分のフォルダに入れます）。" "Run this without sudo: it installs into your own folder."

  mkdir -p "$HOME_DIR"
  HOME_DIR=$(CDPATH= cd -- "$HOME_DIR" && pwd)
  WORK=$(mktemp -d "${TMPDIR:-/tmp}/pockecom.XXXXXX")
  trap 'rm -rf "$WORK"' EXIT
  trap 'exit 130' INT TERM

  install_node
  install_extension
  if [ -n "$WITH_EMULATOR" ]; then
    install_dotnet
    install_emulator
  fi
  write_command
  add_path
  if [ -n "$ROM" ]; then copy_rom; fi
  if [ -n "$WITH_VSCODE" ] && [ -z "$(vscode)" ]; then install_vscode; fi
  code=$(vscode)
  # On macOS the command code is only inside the application.
  case $code in /Applications/*) [ -e "$BIN_DIR/code" ] || ln -s "$code" "$BIN_DIR/code" ;; esac
  if [ -n "$code" ]; then
    "$code" --install-extension "$WORK/devtools.vsix" --force || say "VS Code に拡張機能を入れられませんでした。" "The extension could not be installed into VS Code."
    if [ -n "$JA" ] && [ -n "$WITH_VSCODE" ]; then "$code" --install-extension MS-CEINTL.vscode-language-pack-ja || true; fi
  fi

  say "" ""
  "$BIN_DIR/e500" --version
  if [ -n "$WITH_EMULATOR" ]; then
    if ls "$HOME_DIR/Emulator/rom/"*.[Rr][Oo][Mm] >/dev/null 2>&1; then "$BIN_DIR/e500" check || say "上の error の行を直してください。" "See the error line above."
    else say "自分の ROM を $HOME_DIR/Emulator/rom に置いて、e500 check で確かめてください。" "Put your ROM into $HOME_DIR/Emulator/rom and check with: e500 check"; fi
  fi
  if [ -n "$REOPEN" ]; then say "新しい端末（ターミナル）を開くと、e500 が使えます。" "Open a new terminal to use e500."
  else say "入りました。e500 が使えます。" "Done. e500 is ready."; fi
}

# At the end, so that nothing runs when only a part of the script has come.
main "$@"
