"""Execute the generated notebook locally, with only Colab's iframe API mocked."""
import json
from pathlib import Path
import tempfile
from urllib.request import urlopen
import types
import sys

root = Path(__file__).resolve().parent.parent
nb = json.loads((root / '188cm_RUN.ipynb').read_text(encoding='utf-8'))
cells = [''.join(c['source']) for c in nb['cells'] if c['cell_type'] == 'code']
assert len(cells) == 3
for cell in cells:
    compile(cell, '<colab-cell>', 'exec')

import os
previous_dir = Path.cwd()
with tempfile.TemporaryDirectory() as directory:
    os.chdir(directory)
    namespace = {}
    try:
        exec(cells[0], namespace)
        exec(cells[1], namespace)
        port = namespace['GAME_PORT']
        with urlopen(f'http://127.0.0.1:{port}/index.html') as response:
            html = response.read().decode('utf-8')
            assert response.status == 200
            assert 'class GameModel' in html
            assert '<script src=' not in html
            assert 'href="style.css"' not in html
        calls = []
        google = types.ModuleType('google')
        colab = types.ModuleType('google.colab')
        colab.output = types.SimpleNamespace(serve_kernel_port_as_iframe=lambda p, **kwargs: calls.append((p, kwargs)))
        sys.modules['google'] = google
        sys.modules['google.colab'] = colab
        exec(cells[2], namespace)
        assert calls == [(port, {'height': 850})]
        old_server = namespace['GAME_SERVER']
        old_thread = namespace['GAME_THREAD']
        exec(cells[1], namespace)
        assert not old_thread.is_alive()
        assert old_server.fileno() == -1
        with urlopen(f'http://127.0.0.1:{namespace["GAME_PORT"]}/index.html') as response:
            assert response.status == 200
        (root / 'work/colab-bundle.html').write_text(html, encoding='utf-8')
        print('PASS: three complete cells compile; standalone HTML served; iframe API arguments; server rerun cleanup')
    finally:
        if 'GAME_SERVER' in namespace:
            namespace['GAME_SERVER'].shutdown()
            namespace['GAME_SERVER'].server_close()
            namespace['GAME_THREAD'].join(timeout=2)
        os.chdir(previous_dir)
