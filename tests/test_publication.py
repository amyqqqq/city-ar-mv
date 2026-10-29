import contextlib
import io
import unittest
from scripts.public_audit import inspect_payload
from scripts.check_publish import check


class PublicationTests(unittest.TestCase):
    def test_secret_scanner_recognizes_tokens_without_printing_values(self):
        content = ('ghp_' + 'A' * 40).encode()
        findings = inspect_payload('example.txt', content)
        self.assertEqual(findings[0]['rule'],'github-token')
        self.assertNotIn(content.decode(), str(findings))

    def test_secret_scanner_recognizes_private_keys(self):
        key = b'-----BEGIN ' + b'PRIVATE KEY-----'
        self.assertEqual(inspect_payload('example.key',key)[0]['rule'],'private-key')

    def test_workflow_variable_is_not_a_literal_secret(self):
        self.assertEqual(inspect_payload('pages.yml',b'token: ${{ secrets.GITHUB_TOKEN }}'),[])

    def test_public_artifact_has_real_ar_and_relative_paths(self):
        with contextlib.redirect_stdout(io.StringIO()):
            check()
