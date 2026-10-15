# 1ファイルで遊ぶ188cm RUN

`188cm-RUN.html` をGitHubで開き、右上の **Download raw file（下向き矢印）** から保存してください。保存したHTMLをChromeやEdgeで開くと遊べます。CSS・JavaScript・効果音・BGMの生成処理を内包しています。最初のクリックやキー操作で音声が有効になります。

オンラインランキングにはインターネット接続とFirebaseの認証が必要です。ローカルファイルでランキングが利用できない場合は、公開版 https://tamaki73.github.io/188cm-run/ を利用してください。

このファイルは難易度・複合障害物の改善版を1つにまとめたものです。ソースを変更した際は、リポジトリのルートで次を実行して再生成してください（Python 3が必要です）。

```sh
python3 -c "from pathlib import Path; from tools.build_colab import bundle_html; Path('downloads/188cm-RUN.html').write_text(bundle_html(), encoding='utf-8')"
```

ゲーム一式を取得する場合はリポジトリの **Code → Download ZIP** でも取得できます。ZIPを展開し、元の `index.html` とCSS・JSを同じフォルダーに保持してください。元の `index.html` だけを保存しても動作しません。
