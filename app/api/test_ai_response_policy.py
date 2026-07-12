import json
import unittest
from unittest.mock import patch

from api import lustre_api


def log_payload(warning_count=0):
    logs = [
        {
            'id': 'info-1',
            'node': 'mds01',
            'level': 'INFO',
            'message': 'LNet initialized',
            'timestamp': '2026-07-10 10:00:00',
            'source': 'lustre',
        }
    ]
    if warning_count:
        logs.append({
            'id': 'error-1',
            'node': 'oss01',
            'level': 'ERROR',
            'message': 'LNet peer timeout',
            'timestamp': '2026-07-10 10:01:00',
            'source': 'kernel',
        })
    return {
        'summary': {
            'warningCount': warning_count,
            'normalCount': 1,
            'totalLogs': len(logs),
            'coveredNodes': 1,
            'nodeCount': 1,
            'collectionScope': '当前部署节点本机日志',
            'collectedAt': '2026-07-10T10:01:00',
            'engineStatus': '已配置',
            'engineModel': 'test-model',
        },
        'logs': logs,
    }


class FakeResponse:
    def __init__(self, answer):
        self.answer = answer

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        return False

    def read(self):
        return json.dumps({
            'choices': [{'message': {'content': self.answer}}],
            'usage': {'total_tokens': 10},
        }).encode('utf-8')


class AIResponsePolicyTests(unittest.TestCase):
    def setUp(self):
        self.settings = {
            'provider': 'custom',
            'baseUrl': 'https://model.example/v1',
            'apiKey': 'test-key',
            'modelId': 'test-model',
        }

    @patch('api.lustre_api.urllib_request.urlopen')
    def test_greeting_without_anomalies_returns_short_local_reply(self, urlopen):
        result = lustre_api.call_ai_chat(self.settings, 'hi', log_payload())

        self.assertTrue(result['ok'])
        self.assertEqual(result['responseMode'], 'greeting')
        self.assertLessEqual(len(result['answer']), 100)
        self.assertNotIn('【可能原因】', result['answer'])
        urlopen.assert_not_called()

    @patch('api.lustre_api.urllib_request.urlopen')
    def test_normal_status_question_does_not_generate_diagnostic_report(self, urlopen):
        result = lustre_api.call_ai_chat(self.settings, '当前有异常吗？', log_payload())

        self.assertTrue(result['ok'])
        self.assertEqual(result['responseMode'], 'normal_summary')
        self.assertIn('当前已采集范围内', result['answer'])
        self.assertNotIn('系统处于正常运行状态', result['answer'])
        self.assertNotIn('【建议排查步骤】', result['answer'])
        urlopen.assert_not_called()

    @patch('api.lustre_api.retrieve_log_knowledge', return_value=[])
    @patch('api.lustre_api.urllib_request.urlopen')
    def test_explicit_deep_analysis_still_calls_model(self, urlopen, _knowledge):
        urlopen.return_value = FakeResponse('详细分析结果')

        result = lustre_api.call_ai_chat(self.settings, '请详细分析当前日志', log_payload())

        self.assertTrue(result['ok'])
        self.assertEqual(result['responseMode'], 'deep_analysis')
        self.assertEqual(result['answer'], '详细分析结果')
        urlopen.assert_called_once()

    @patch('api.lustre_api.retrieve_log_knowledge', return_value=[])
    @patch('api.lustre_api.urllib_request.urlopen')
    def test_anomaly_question_uses_diagnostic_mode(self, urlopen, _knowledge):
        urlopen.return_value = FakeResponse('异常诊断结果')

        result = lustre_api.call_ai_chat(self.settings, '分析最近异常', log_payload(warning_count=1))

        self.assertTrue(result['ok'])
        self.assertEqual(result['responseMode'], 'diagnosis')
        request_object = urlopen.call_args[0][0]
        request_body = json.loads(request_object.data.decode('utf-8'))
        policy = request_body['messages'][1]['content']
        self.assertIn('完整诊断结构', policy)


if __name__ == '__main__':
    unittest.main()
