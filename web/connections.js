import {el,button,field,heading,info,api,busy,announce,getToken,download} from './ui.js';

export function renderConnections(ctx){
  const root=el('div',{},heading('MAKE IT WORK FOR YOU','A few useful connections.','Start with links and your profile. Add discovery sources or AI when you are ready.'));
  const integrations=ctx.state.integrations;
  root.append(el('section',{class:'panel'},el('h2',{},'What is connected'),
    ...[['Local workspace',true,'Your profile, application queue, and drafts stay on this computer.'],['AI preparation',integrations.ai,integrations.ai?`Using ${integrations.ai_model}. Profile excerpts are sent to your configured provider when you choose Prepare with AI.`:'Not configured. Profile-based drafts and autofill are available.'],['Web search',integrations.search,integrations.search?'Saved queries run when you start discovery or enable the n8n schedule.':'Not configured. RSS/Atom and company boards do not need a search API key.']].map(([name,ready,desc])=>
      el('div',{class:'connection'},el('div',{},el('strong',{},name),el('p',{},desc)),el('span',{class:'tag'},ready?'Ready':'Setup needed')))));
  const sourceForm=el('form',{noValidate:true});
  const rows=el('div');let sourceId=0;
  function addSource(source={type:'rss',enabled:true,category:'Other'}){
    const id=sourceId++;
    const row=el('div',{class:'source-row'},field('Source name',`source-name-${id}`,source.name||''),field('Source type',`source-type-${id}`,source.type,{options:[{value:'rss',label:'RSS / Atom feed'},{value:'greenhouse',label:'Greenhouse board'},{value:'lever',label:'Lever board'}]}),
      field('Feed URL or company board slug',`source-url-${id}`,source.url||'',{help:'For company boards, enter the company slug only.'}),field('Opportunity type',`source-category-${id}`,source.category,{options:ctx.state.categories}));
    const enabled=el('input',{type:'checkbox',checked:source.enabled!==false,'aria-label':'Enable source'});
    row.append(el('div',{class:'actions'},el('label',{class:'label-row'},enabled,'Enabled'),button('Remove source',()=>{row.remove();ctx.setDirty(sourceForm);},'ghost')));
    rows.append(row);
  }
  ctx.state.settings.sources.forEach(addSource);
  const queries=field('Search queries','search_queries',ctx.state.settings.search_queries.join('\n'),{type:'textarea',help:'One query per line, up to 10. For example: computer vision research fellowship applications. Requires your Brave Search API key.'});
  const save=button('Save sources',()=>{},'primary',{type:'submit'});
  sourceForm.append(el('section',{class:'panel'},el('h2',{},'Find opportunities from your sources'),el('p',{class:'lead'},'Feeds can cover hackathons, grants, fellowships, and other opportunities. Company boards cover jobs and internships.'),rows,button('+ Add a source',()=>{addSource();ctx.setDirty(sourceForm);}),el('div',{class:'divider'}),queries,el('p',{class:'form-error',role:'alert'}),save));
  sourceForm.addEventListener('input',()=>ctx.setDirty(sourceForm));
  sourceForm.addEventListener('submit',event=>{event.preventDefault();busy(save,async()=>{
    const sources=[...rows.children].map(row=>{const controls=row.querySelectorAll('input,select');return {name:controls[0].value||'Source',type:controls[1].value,url:controls[2].value,category:controls[3].value,enabled:controls[4].checked};});
    await api('/api/settings','PUT',{sources,search_queries:queries.querySelector('textarea').value.split('\n').filter(x=>x.trim())});ctx.clearDirty(sourceForm);await ctx.refresh();announce('Sources saved. Use Find opportunities in your inbox to run discovery.');
  },sourceForm);});root.append(sourceForm);
  if(ctx.state.last_discovery?.errors?.length)root.append(el('section',{class:'panel'},el('h2',{},'Last discovery run'),el('ul',{class:'checks'},ctx.state.last_discovery.errors.map(x=>el('li',{},`${x.source}: ${x.error}`)))));
  const token=el('input',{type:'password',readOnly:true,value:getToken(),'aria-label':'Local pairing token'});
  const show=button('Show token',()=>{token.type=token.type==='password'?'text':'password';show.textContent=token.type==='password'?'Show token':'Hide token';});
  const copy=button('Copy token',()=>busy(copy,async()=>{await navigator.clipboard.writeText(getToken());announce('Local pairing token copied. Paste it only into your local extension or n8n credential.');}));
  root.append(el('section',{class:'panel'},el('h2',{},'Pair the browser helper'),el('p',{class:'lead'},'Load the extension folder in Chrome or Edge, then enter this local service address and pairing token in its popup.'),
    info('The helper previews supported fields before filling. It does not select files, accept declarations, or click Submit.'),
    el('p',{},'Service address: ',el('code',{},location.origin)),el('div',{class:'field'},el('label',{},'Pairing token'),token),el('div',{class:'actions'},show,copy)));
  root.append(el('section',{class:'panel'},el('h2',{},'Enable optional AI and web search'),el('p',{class:'lead'},'Edit .env in the source folder and restart the agent. Keep API keys there; the dashboard never displays them.'),
    el('pre',{},'AI_ENABLED=1\nAI_API_KEY=your-provider-key\nAI_MODEL=your-model-id\nAI_BASE_URL=https://api.openai.com/v1\n\nBRAVE_SEARCH_API_KEY=your-search-key'),
    info('Only configure providers you intend to use. AI preparation sends profile excerpts and the listing to your chosen AI provider. Discovery sends saved query text to Brave. Provider charges follow your account settings.')));
  const exportButton=button('Export application tracker',()=>busy(exportButton,()=>download('/api/export.csv','opportunities.csv')));
  root.append(el('section',{class:'panel'},el('h2',{},'n8n & portability'),el('p',{class:'lead'},'Import the three workflow JSON files from the workflows folder into your local n8n instance. Follow README.md for credentials, local Docker setup, and scheduling.'),el('div',{class:'actions'},el('a',{class:'button',href:'http://127.0.0.1:5678',target:'_blank',rel:'noopener'},'Open local n8n ↗'),exportButton)));
  return root;
}
