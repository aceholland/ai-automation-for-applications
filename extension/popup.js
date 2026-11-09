'use strict';
const $=id=>document.getElementById(id);
let connection={base:'http://127.0.0.1:8765',token:''};
let opportunities=[];let preview=[];let targetTab=null;let busyState=false;
let posts=[];let categories=[];
function say(text,error=false){$('message').textContent=text;$('message').className=error?'error':'';}
function clearPreview(){preview=[];targetTab=null;$('preview-list').replaceChildren();$('fill').hidden=true;}
async function run(button,operation){
  if(busyState)return;busyState=true;
  const buttons=[...document.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);button.setAttribute('aria-busy','true');
  try{await operation();}catch(e){say(e.message||'The helper could not complete this action.',true);}finally{busyState=false;buttons.forEach(b=>b.disabled=false);button.removeAttribute('aria-busy');}
}
function validateConnection(){
  let url;try{url=new URL(connection.base);}catch{throw new Error('Enter a valid local service URL.');}
  if(url.protocol!=='http:'||!['127.0.0.1','localhost'].includes(url.hostname)||url.username||url.password)throw new Error('Use http://127.0.0.1:8765 or your localhost service address.');
  connection.base=url.origin;
  if(!connection.token)throw new Error('Copy the pairing token from Connections in your dashboard.');
}
async function api(path,method='GET',data){
  validateConnection();const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);
  try{
    const response=await fetch(connection.base+path,{method,headers:{'Content-Type':'application/json','X-Opportunity-Token':connection.token},...(data===undefined?{}:{body:JSON.stringify(data)}),signal:controller.signal});
    const result=await response.json();if(!response.ok)throw new Error(result.error||'Local request failed.');return result;
  }catch(e){if(e.name==='AbortError'||e instanceof TypeError)throw new Error('The local service is unavailable. Start the agent, check its address, and retry.');throw e;}finally{clearTimeout(timer);}
}
async function load(){
  const state=await api('/api/state');opportunities=state.opportunities.filter(o=>o.pack&&o.status!=='archived');categories=state.categories;
  $('opportunity').replaceChildren();
  for(const item of opportunities){const option=document.createElement('option');option.value=item.id;option.textContent=`${item.title} · ${item.status}`;$('opportunity').append(option);}
  $('connected').hidden=false;$('pairing').open=false;$('dashboard').href=connection.base;
  clearPreview();selectionNote();say(opportunities.length?`${opportunities.length} prepared application pack${opportunities.length===1?'':'s'} available.`:'Import an opportunity from this page, or prepare one in your dashboard.');
}
function selectionNote(){const item=opportunities.find(x=>x.id===$('opportunity').value);$('selection-note').textContent=item?`Pack version ${item.pack.version}. ${item.status==='submitted'?'Already marked submitted; check before using it again.':'You choose the fields and submit yourself.'}`:'No prepared application selected.';}
$('pair-form').addEventListener('submit',event=>{event.preventDefault();run($('connect'),async()=>{
  connection={base:$('base-url').value.trim(),token:$('pair-token').value.trim()};validateConnection();await load();await chrome.storage.local.set({connection});
});});
$('reload').addEventListener('click',()=>run($('reload'),load));
$('opportunity').addEventListener('change',()=>{clearPreview();selectionNote();});
function showPost(){
  const post=posts[Number($('post-choice').value)];if(!post)return;
  $('post-title').value=post.title;$('post-text').value=post.text;$('post-source').value=post.url;$('post-application').value=post.application_url;$('post-category').value=post.category;
  $('post-links').textContent=post.links.length>1?'Links found in this post (choose the application link):\n'+post.links.join('\n'):'';
}
$('post-choice').addEventListener('change',showPost);
$('capture-page').addEventListener('click',()=>run($('capture-page'),async()=>{
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(!tab?.id||!/^https?:\/\//.test(tab.url||''))throw new Error('Open a LinkedIn post or opportunity page first.');
  await chrome.scripting.executeScript({target:{tabId:tab.id},files:['post-import.js']});
  const result=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>globalThis.OpportunityPostImport.capture(document,location)});
  posts=result[0].result||[];if(!posts.length)throw new Error('Select the post text or open the full post and try importing again.');
  $('post-choice').replaceChildren(...posts.map((post,index)=>{const option=document.createElement('option');option.value=String(index);option.textContent=post.title;return option;}));
  $('post-category').replaceChildren(...categories.map(category=>{const option=document.createElement('option');option.value=category;option.textContent=category;return option;}));
  $('post-review').hidden=false;showPost();say(`${posts.length} post${posts.length===1?'':'s'} found. Review the text, type, and source before saving. Expand “see more” on LinkedIn before importing if needed.`);
}));
$('save-post').addEventListener('click',()=>run($('save-post'),async()=>{
  const original=posts[Number($('post-choice').value)];if(!original)throw new Error('Import a post first.');
  const payload={...original,title:$('post-title').value.trim(),text:$('post-text').value.trim(),url:$('post-source').value.trim(),category:$('post-category').value,application_url:$('post-application').value.trim()};
  if(!payload.title||!payload.text)throw new Error('Keep an opportunity title and the relevant post text.');
  const result=await api('/api/intake','POST',payload);
  say(result.created?'Post saved to your opportunity inbox. Open the dashboard to prepare the application.':'This post is already in your opportunity inbox.');
}));
$('preview').addEventListener('click',()=>run($('preview'),async()=>{
  clearPreview();
  const item=opportunities.find(x=>x.id===$('opportunity').value);if(!item)throw new Error('Prepare an application in your dashboard first.');
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(!tab?.id||!/^https?:\/\//.test(tab.url||''))throw new Error('Open an ordinary application web page, then invoke the helper there.');
  await chrome.scripting.executeScript({target:{tabId:tab.id},files:['autofill.js']});
  const results=await chrome.scripting.executeScript({target:{tabId:tab.id},func:pack=>globalThis.OpportunityAutofill.scan(document,pack),args:[item.pack]});
  preview=results[0].result||[];targetTab={id:tab.id,url:tab.url,opportunity:item.id};
  let ready=0;
  for(const row of preview){
    const wrapper=document.createElement('div');wrapper.className='preview-row';
    const status=document.createElement('span');status.className='preview-status';status.textContent=row.status;
    const label=document.createElement('label');label.textContent=row.label;
    if(row.status==='ready'){ready++;row.selected=true;const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=true;checkbox.addEventListener('change',()=>row.selected=checkbox.checked);label.prepend(checkbox);}
    const answer=document.createElement('p');answer.textContent=row.status==='ready'?row.value:row.reason;
    wrapper.append(status,label,answer);$('preview-list').append(wrapper);
  }
  $('fill').hidden=ready===0;say(`${ready} fields ready. ${preview.length-ready} need no change or your attention. Review each proposed answer before filling.`);
}));
$('fill').addEventListener('click',()=>run($('fill'),async()=>{
  if(!targetTab)throw new Error('Preview this page first.');
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(tab?.id!==targetTab.id||tab.url!==targetTab.url){clearPreview();throw new Error('The application page changed. Preview the current page again.');}
  const results=await chrome.scripting.executeScript({target:{tabId:tab.id},func:rows=>globalThis.OpportunityAutofill.fill(document,rows),args:[preview]});
  const result=results[0].result;
  $('fill').hidden=true;
  let tracker='';
  if(result.filled){try{await api(`/api/opportunities/${targetTab.opportunity}/status`,'POST',{status:'filled'});}catch{tracker=' Fields were filled, but the tracker could not update. Mark progress in your dashboard.';}}
  say(`${result.filled} fields filled. ${result.skipped} skipped after rechecking. Review the form, choose attachments, and submit yourself.${tracker}`);
}));
(async()=>{
  const saved=await chrome.storage.local.get('connection');
  if(saved.connection){connection=saved.connection;$('base-url').value=connection.base;$('pair-token').value=connection.token;await run($('connect'),load);}
  else{$('pairing').open=true;say('Connect your local workspace to get started.');}
})();
