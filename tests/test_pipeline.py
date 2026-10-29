import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from pipeline import common, jobs
from pipeline.baseline import BASELINE, verify_originals
from pipeline.compose import compose, validate, copy_vendor_tree
from pipeline.providers import ManualProvider, NotConfigured, PROVIDERS, Request, with_retry


class OriginalTests(unittest.TestCase):
    def test_original_backup_and_source_hashes(self):
        self.assertTrue(verify_originals())

    def test_target_geometry_preserved(self):
        target = common.read_json(BASELINE / 'image-targets/city_painting.json')
        self.assertEqual(target['name'], 'city_painting')
        self.assertEqual(target['properties'], {'top': 0, 'left': 71, 'width': 581, 'height': 775,
                         'isRotated': True, 'originalWidth': 724, 'originalHeight': 775})

    def test_composed_audio_and_vendor_integrity(self):
        result = validate()
        self.assertEqual(result['audio_duration'], 15)
        self.assertEqual(result['target_and_vendor'], 'byte-identical')

    def test_new_images_are_imported_byte_identically_with_real_alpha(self):
        manifest = common.read_json(common.ROOT / 'dist/manifest.json')
        self.assertEqual(manifest['mode'], 'generated')
        for kind, file, key in [('characters', 'trap_character.png', 'character'), ('backgrounds', 'trap_city.png', 'background')]:
            original = common.ROOT / 'new_assets' / file
            deployed = common.ROOT / 'dist' / manifest['assets'][key]
            self.assertEqual(common.digest(original), common.digest(deployed))
            self.assertEqual(manifest['metadata'][kind]['source_sha256'], common.digest(original))
            info = manifest['image_info'][kind]
            self.assertTrue(info['has_alpha'])
            self.assertEqual(info['alpha_range'], [0, 255])
            self.assertGreater(info['transparent_pixels'], 0)

    def test_image_target_transform_and_audio_remain_unchanged(self):
        before = common.read_json(common.ROOT / 'reports/original-scene.json')
        after = common.read_json(common.ROOT / 'dist/scene.json')
        target_id = next(key for key, obj in before['objects'].items() if obj.get('imageTarget', {}).get('name') == 'city_painting')
        for key in ('imageTarget', 'position', 'rotation', 'scale', 'parentId'):
            self.assertEqual(before['objects'][target_id][key], after['objects'][target_id][key])
        reference = common.read_json(common.ROOT / 'tests/fixtures/audio-reference.json')
        manifest = common.read_json(common.ROOT / 'dist/manifest.json')
        self.assertEqual(manifest['metadata']['music']['source_sha256'], reference['source_sha256'])
        self.assertEqual(common.digest(common.ROOT / 'dist/assets/trap_15s.m4a'), reference['encoded_sha256'])

    def test_compose_dry_run_never_extracts_or_runs_ffmpeg(self):
        with patch('pipeline.compose.extract', side_effect=AssertionError('mutation')), \
             patch('pipeline.compose.subprocess.run', side_effect=AssertionError('process')):
            self.assertEqual(compose(dry_run=True)['network_calls'], 0)


class ProviderTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / 'config').mkdir()
        (self.root / 'config/project.json').write_text('{}')
        self.source = self.root / 'music.wav'
        self.source.write_bytes(b'user-owned-audio')
        self.patches = [patch.object(jobs, 'ROOT', self.root), patch.object(common, 'ROOT', self.root),
                        patch.object(jobs, 'config', return_value={'style': 'trap', 'character': 'fictional adult'})]
        for item in self.patches:
            item.start()

    def tearDown(self):
        for item in reversed(self.patches):
            item.stop()
        self.temp.cleanup()

    def test_dry_run_has_no_provider_calls_or_media(self):
        with patch.object(PROVIDERS['external'], 'generate', side_effect=AssertionError('network')):
            result = jobs.generate('music', provider='external', dry_run=True)
        self.assertEqual(result['status'], 'PLANNED')
        self.assertFalse((self.root / result['output']).exists())
        self.assertFalse((self.root / 'generated/jobs.jsonl').exists())

    def test_missing_service_is_not_generated(self):
        result = jobs.generate('music', provider='comfyui')
        self.assertEqual(result['status'], 'NOT_CONFIGURED')
        self.assertFalse((self.root / result['output']).exists())

    def test_manual_license_required(self):
        result = jobs.generate('music', source=self.source)
        self.assertEqual(result['status'], 'FAILED')
        self.assertFalse((self.root / result['output']).exists())

    def test_manual_import_cache_and_corruption_recovery(self):
        first = jobs.generate('music', source=self.source, license='Local regression test only')
        self.assertEqual(first['status'], 'IMPORTED')
        self.assertEqual(jobs.generate('music', source=self.source, license='Local regression test only')['status'], 'CACHED')
        (self.root / first['output']).write_bytes(b'corrupted')
        recovered = jobs.generate('music', source=self.source, license='Local regression test only')
        self.assertEqual(recovered['status'], 'IMPORTED')
        self.assertEqual(common.digest(self.root / first['output']), common.digest(self.source))

    def test_cache_key_changes_with_source_and_seed(self):
        first = jobs.generate('music', source=self.source, license='test')
        second = jobs.generate('music', source=self.source, license='test', seed=99)
        self.source.write_bytes(b'changed')
        third = jobs.generate('music', source=self.source, license='test')
        self.assertEqual(len({first['id'], second['id'], third['id']}), 3)

    def test_prevent_provider_output_outside_generated(self):
        with self.assertRaises(ValueError):
            ManualProvider().generate(Request('music', '', 42, self.root / 'original_export/a.wav', self.source, 'test'))

    def test_retry_only_transient_failures(self):
        calls = []
        def flaky():
            calls.append(1)
            if len(calls) < 3:
                raise ConnectionError('temporary')
            return 'actual-output'
        self.assertEqual(with_retry(flaky, delay=0), 'actual-output')
        self.assertEqual(len(calls), 3)
        with self.assertRaises(NotConfigured):
            with_retry(lambda: PROVIDERS['ace-step'].generate(None), delay=0)

    def test_vendor_copy_can_rebuild_over_windows_readonly_outputs(self):
        import stat
        source = self.root / 'vendor'
        source.mkdir()
        (source / 'LICENSE').write_text('unchanged notice')
        output = self.root / 'dist'
        copy_vendor_tree(source, output)
        (output / 'LICENSE').chmod(stat.S_IREAD)
        copy_vendor_tree(source, output)
        self.assertEqual((output / 'LICENSE').read_text(), 'unchanged notice')
        (source / 'LICENSE').write_text('new upstream notice')
        copy_vendor_tree(source, output)
        self.assertEqual((output / 'LICENSE').read_text(), 'new upstream notice')


if __name__ == '__main__':
    unittest.main()
