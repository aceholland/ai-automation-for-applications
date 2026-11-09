import json
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent


class WorkflowTests(unittest.TestCase):
    def test_three_workflows_are_inactive_and_have_authenticated_calls(self):
        files=list((ROOT/'workflows').glob('*.json'))
        self.assertEqual(len(files),3)
        for file in files:
            wf=json.loads(file.read_text(encoding='utf-8'))
            self.assertFalse(wf['active'])
            names={n['name'] for n in wf['nodes']}
            http=[n for n in wf['nodes'] if n['type']=='n8n-nodes-base.httpRequest']
            self.assertEqual(len(http),1)
            self.assertEqual(http[0]['parameters']['genericAuthType'],'httpHeaderAuth')
            self.assertIn('httpHeaderAuth',http[0]['credentials'])
            self.assertNotIn('test-pairing-token',file.read_text())
            for name,outputs in wf['connections'].items():
                self.assertIn(name,names)
                for branch in outputs['main']:
                    for edge in branch:self.assertIn(edge['node'],names)

    def test_webhooks_require_auth_and_respond_on_both_outcomes(self):
        for name in ('intake','prepare'):
            wf=json.loads((ROOT/'workflows'/f'{name}.json').read_text())
            trigger=next(n for n in wf['nodes'] if n['type']=='n8n-nodes-base.webhook')
            self.assertEqual(trigger['parameters']['authentication'],'headerAuth')
            http=next(n for n in wf['nodes'] if n['type']=='n8n-nodes-base.httpRequest')
            self.assertEqual(http['onError'],'continueErrorOutput')
            self.assertEqual(len(wf['connections'][http['name']]['main']),2)

    def test_schedule_is_disabled_until_user_enables_it(self):
        wf=json.loads((ROOT/'workflows'/'discover.json').read_text())
        schedule=next(n for n in wf['nodes'] if n['type']=='n8n-nodes-base.scheduleTrigger')
        self.assertTrue(schedule['disabled'])


if __name__=='__main__':unittest.main()
