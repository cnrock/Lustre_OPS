import os
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from api import lustre_api


class KnowledgeOverviewTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, 'lustre.db')
        self.knowledge_dir = os.path.join(self.temp_dir.name, 'knowledge')
        self.vector_path = os.path.join(self.knowledge_dir, 'vector-index.json')
        self.patches = [
            patch.object(lustre_api, 'DB_PATH', self.db_path),
            patch.object(lustre_api, 'KNOWLEDGE_DIR', self.knowledge_dir),
            patch.object(lustre_api, 'KNOWLEDGE_DOCS_DIR', os.path.join(self.knowledge_dir, 'documents')),
            patch.object(lustre_api, 'KNOWLEDGE_VECTOR_INDEX_PATH', self.vector_path),
        ]
        for item in self.patches:
            item.start()
        lustre_api.ensure_log_knowledge_table()
        self.client = lustre_api.app.test_client()

    def tearDown(self):
        for item in reversed(self.patches):
            item.stop()
        self.temp_dir.cleanup()

    def insert_case(self):
        now = '2026-07-10T11:00:00'
        conn = sqlite3.connect(self.db_path)
        conn.execute(
            """
            INSERT INTO log_knowledge_base (
                title, problem, solution, tags, feedback_score, hit_count,
                embedding_status, vector_id, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                'LNet 超时处理经验',
                '客户端出现 LNet peer timeout',
                '先确认 NID 与链路状态，再检查路由配置。',
                'lustre,LNet',
                3,
                7,
                'ready',
                'case:1',
                now,
                now,
            ),
        )
        conn.commit()
        conn.close()

    def test_overview_includes_recorded_cases_when_no_documents_exist(self):
        self.insert_case()
        lustre_api.save_vector_index({
            'vectors': [{
                'id': 'case:1',
                'kind': 'case',
                'sourceId': 1,
                'vector': [1.0],
            }],
        })

        response = self.client.get('/api/knowledge/overview')

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload['ok'])
        self.assertEqual(payload['stats']['caseCount'], 1)
        self.assertEqual(payload['stats']['documentCount'], 0)
        self.assertEqual(payload['stats']['vectorCount'], 1)
        self.assertEqual(payload['cases'][0]['title'], 'LNet 超时处理经验')
        self.assertEqual(payload['cases'][0]['embedding_status'], 'ready')
        self.assertEqual(payload['documents'], [])


if __name__ == '__main__':
    unittest.main()
