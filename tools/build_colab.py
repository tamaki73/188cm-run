"""Generate an offline-complete Colab notebook and the equivalent three-cell Python file."""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parent.parent


def bundle_html():
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    html = html.replace('<link rel="stylesheet" href="style.css">', '<style>\n' + (ROOT / 'style.css').read_text(encoding='utf-8') + '\n</style>')
    for filename in ('game-engine.js', 'game.js'):
        source = (ROOT / filename).read_text(encoding='utf-8')
        html = html.replace(f'<script src="{filename}"></script>', '<script>\n' + source + '\n</script>')
    return html


def build():
    html = bundle_html()
    cells = [
        '# セル1：完成版ゲームのHTMLファイルを生成します。\n'
        'from pathlib import Path\n'
        'GAME_DIR = Path.cwd() / "188cm_run_game"\n'
        'GAME_DIR.mkdir(exist_ok=True)\n'
        f'GAME_HTML = {html!r}\n'
        '(GAME_DIR / "index.html").write_text(GAME_HTML, encoding="utf-8")\n'
        'print("ゲームファイルを生成しました。次のセルを実行してください。")\n',
        '# セル2：HTTPサーバーを起動します。再実行時は前のサーバーを停止します。\n'
        'from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler\n'
        'from functools import partial\n'
        'import threading\n'
        'if "GAME_SERVER" in globals():\n'
        '    GAME_SERVER.shutdown()\n'
        '    GAME_SERVER.server_close()\n'
        '    GAME_THREAD.join(timeout=2)\n'
        'class GameHandler(SimpleHTTPRequestHandler):\n'
        '    def log_message(self, format, *args):\n'
        '        pass\n'
        'GAME_SERVER = ThreadingHTTPServer(("0.0.0.0", 0), partial(GameHandler, directory=str(GAME_DIR)))\n'
        'GAME_PORT = GAME_SERVER.server_address[1]\n'
        'GAME_THREAD = threading.Thread(target=GAME_SERVER.serve_forever, daemon=True)\n'
        'GAME_THREAD.start()\n'
        'print(f"ゲームサーバーを起動しました（ポート {GAME_PORT}）。次のセルを実行してください。")\n',
        '# セル3：Google Colabの出力欄にゲーム画面を表示します。\n'
        'from google.colab import output\n'
        'output.serve_kernel_port_as_iframe(GAME_PORT, height=850)\n'
        'print("ゲーム画面を一度クリックすると、キーボードで操作できます。")\n'
    ]
    markdown = ('# 188cm RUN\n\n身長188cmの日常を走り抜ける、オリジナルのブラウザゲーム。\n\n'
                '**上から3つのコードセルを順番に実行**し、表示されたゲーム画面を一度クリックしてください。\n'
                '初回は7ステップのチュートリアルが始まります。↓ / Shift：長押しでしゃがむ、Space：ジャンプ、E：取得、Enter：再挑戦。\n\n'
                '外部API・キー・追加のインストールは不要です。画面から離れると一時停止します。\n'
                'ブラウザやiframeが保存領域を制限していると、チュートリアル設定と自己ベストは次回に引き継がれません。\n'
                '公開ページ： https://tamaki73.github.io/188cm-run/\n')
    notebook = {
        'nbformat': 4, 'nbformat_minor': 5,
        'metadata': {'colab': {'name': '188cm_RUN.ipynb', 'provenance': []}, 'kernelspec': {'name': 'python3', 'display_name': 'Python 3'}, 'language_info': {'name': 'python'}},
        'cells': [{'cell_type': 'markdown', 'id': 'instructions', 'metadata': {}, 'source': markdown.splitlines(keepends=True)}] + [
            {'cell_type': 'code', 'id': f'game-cell-{i+1}', 'metadata': {}, 'execution_count': None, 'outputs': [], 'source': code.splitlines(keepends=True)}
            for i, code in enumerate(cells)
        ]
    }
    (ROOT / '188cm_RUN.ipynb').write_text(json.dumps(notebook, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (ROOT / 'colab_cells.py').write_text('\n\n'.join('# %%\n' + cell for cell in cells), encoding='utf-8')
    print('Generated 188cm_RUN.ipynb and colab_cells.py (complete game embedded).')


if __name__ == '__main__':
    build()
