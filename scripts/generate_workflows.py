"""Regenerate portable n8n workflows; no credentials or personal data included."""
import json
import uuid
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent
SERVICE_CREDENTIAL={"httpHeaderAuth":{"id":"", "name":"Opportunity Desk service"}}
WEBHOOK_CREDENTIAL={"httpHeaderAuth":{"id":"", "name":"Opportunity webhook access"}}


def node(name,kind,parameters,position,version=1,**extra):
    return {"id":uuid.uuid5(uuid.NAMESPACE_URL,'opportunity-desk:'+name).hex,"name":name,"type":"n8n-nodes-base."+kind,
            "typeVersion":version,"position":position,"parameters":parameters,**extra}


def main():
    output=ROOT/'workflows';output.mkdir(exist_ok=True)
    for kind in ('discover','intake','prepare'):
        title='Opportunity Desk — '+kind.title()
        notes=("## Setup\n1. Run the companion service. Compose URL: http://agent:8765. If n8n and the service both run directly on the host, edit the HTTP URL to http://127.0.0.1:8765. Use the bundled Compose agent when n8n runs in Docker.\n"
               "2. Select a Header Auth credential named Opportunity Desk service, with header X-Opportunity-Token and the token shown in Connections.\n"
               "3. Intake/Prepare webhooks also require a separate Header Auth credential named Opportunity webhook access. Set header X-Workflow-Token to a separate random value.\n"
               "4. Workflows ship inactive. Discovery schedule also ships disabled. Configure sources, test manually, then enable the schedule and publish only when you want recurring runs.\n"
               "5. Provider failures are visible in discovery errors or the error response. Nothing in these workflows submits an application.")
        nodes=[node('Read before running','stickyNote',{"content":notes,"height":470,"width":600},[-260,-540],1)]
        conn={}
        if kind=='discover':
            nodes.extend([node('Run discovery manually','manualTrigger',{},[0,0]),
                          node('Daily discovery — enable when ready','scheduleTrigger',{"rule":{"interval":[{"field":"cronExpression","expression":"0 9 * * *"}]}},[0,180],1.2,disabled=True)])
            url='http://agent:8765/api/discover';body='={{ {} }}'
            for name in ('Run discovery manually','Daily discovery — enable when ready'):
                conn[name]={"main":[[{"node":"Call local assistant","type":"main","index":0}]]}
        else:
            nodes.append(node('Application request','webhook',{"httpMethod":"POST","path":"opportunity-"+kind,"authentication":"headerAuth","responseMode":"responseNode","options":{}},[0,0],2.1,webhookId=uuid.uuid5(uuid.NAMESPACE_URL,title).hex,credentials=WEBHOOK_CREDENTIAL))
            conn['Application request']={"main":[[{"node":"Call local assistant","type":"main","index":0}]]}
            url='http://agent:8765/api/intake' if kind=='intake' else "={{ 'http://agent:8765/api/opportunities/' + encodeURIComponent($json.body.opportunity_id || '') + '/prepare' }}"
            body='={{ $json.body }}' if kind=='intake' else '={{ { use_ai: $json.body.use_ai === true } }}'
        nodes.append(node('Call local assistant','httpRequest',{"method":"POST","url":url,"authentication":"genericCredentialType","genericAuthType":"httpHeaderAuth","sendBody":True,"specifyBody":"json","jsonBody":body,"options":{"timeout":300000}},[300,0],4.2,credentials=SERVICE_CREDENTIAL,onError='continueErrorOutput'))
        if kind!='discover':
            nodes.extend([node('Return prepared result','respondToWebhook',{"respondWith":"json","responseBody":"={{ $json }}","options":{"responseCode":200}},[600,-70],1.4),
                          node('Return service error','respondToWebhook',{"respondWith":"json","responseBody":"={{ { error: 'The local assistant could not process this request. Check its address, pairing credential, input, and provider settings; prior saved data is retained.' } }}","options":{"responseCode":502}},[600,110],1.4)])
            conn['Call local assistant']={"main":[[{"node":"Return prepared result","type":"main","index":0}],[{"node":"Return service error","type":"main","index":0}]]}
        else:
            nodes.append(node('Discovery service unavailable','stopAndError',{"errorMessage":"Discovery could not reach the companion service. Check its address, pairing credential, and local service logs."},[600,110]))
            conn['Call local assistant']={"main":[[],[{"node":"Discovery service unavailable","type":"main","index":0}]]}
        workflow={"name":title,"nodes":nodes,"connections":conn,"active":False,"settings":{"executionOrder":"v1","timezone":"Asia/Calcutta","saveDataSuccessExecution":"none","saveDataErrorExecution":"none"},"pinData":{},"tags":[]}
        (output/f'{kind}.json').write_text(json.dumps(workflow,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')


if __name__=='__main__':main()
