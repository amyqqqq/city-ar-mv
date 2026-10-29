"""Verify deploy artifact and URL-prefix safety without touching vendor code."""
import hashlib
import json
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
    def handle_starttag(self, tag, attrs):
        for key,value in attrs:
            if key in ('src','href') and value:
                self.links.append(value)


def check():
    root = (DIST/'index.html').read_text(encoding='utf-8')
    assert 'url=ar.html' in root, 'Published root must open the actual AR entry'
    for name in ('index.html','ar.html','preview.html','acceptance.html'):
        parser = Links()
        parser.feed((DIST/name).read_text(encoding='utf-8'))
        for value in parser.links:
            if value.startswith(('https://','http://','#','data:')):
                continue
            assert not value.startswith('/'), f'Breaks GitHub project subpath: {name}: {value}'
            relative = value.split('?')[0].split('#')[0]
            assert (DIST/relative).exists(), f'Missing published link: {name}: {relative}'
    required = ['external/runtime/runtime.js','external/xr/xr.js','external/xr/xr-slam.js',
                'external/runtime/LICENSE','external/xr/LICENSE','image-targets/city_painting.json',
                'image-targets/city_painting_luminance.jpg','runtime/ecs-bridge.js','scene.json',
                'ar-app.js','ar.css','runtime/automatic-playback.js']
    manifest = json.loads((DIST/'manifest.json').read_text(encoding='utf-8'))
    required += list(manifest['assets'].values())
    for path in required:
        assert (DIST/path).is_file(), f'Missing AR runtime/asset: {path}'
    ar = (DIST/'ar.html').read_text(encoding='utf-8')
    assert 'external/runtime/runtime.js' in ar and 'external/xr/xr.js' in ar
    app = (DIST/'ar-app.js').read_text(encoding='utf-8')
    assert 'window.ecs.application.init(scene)' in app and 'imageTargetData: [target]' in app
    assert 'void initializeXR().catch(fail)' in app, 'AR must boot without a Start Camera button'
    assert "player.targetFound(manifest.target)" not in app, 'Production AR cannot simulate detection'
    assert "player.targetFound(manifest.target)" in (DIST/'app.js').read_text(encoding='utf-8'), 'Desktop preview remains separate'
    target = json.loads((DIST/'image-targets/city_painting.json').read_text(encoding='utf-8'))
    assert target['name'] == 'city_painting'
    for folder in ('.env','.venv','generated','reports','original_export','source_original'):
        assert not (DIST/folder).exists(), f'Private/build input included in Pages artifact: {folder}'
    paths = [{'path':path,'bytes':(DIST/path).stat().st_size,
              'sha256':hashlib.sha256((DIST/path).read_bytes()).hexdigest()} for path in required]
    result = {'status':'PASS','ar_entry':'ar.html','preview_entry':'preview.html','acceptance_entry':'acceptance.html',
              'relative_urls':True,'resources':paths,'phone_tracking':'NOT_TESTED'}
    (ROOT/'reports').mkdir(exist_ok=True)
    (ROOT/'reports/publish_paths.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(result,indent=2))


if __name__ == '__main__':
    check()
