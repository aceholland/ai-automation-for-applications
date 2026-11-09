import {el,button,field,heading,info,api,busy,announce,download,formatDate} from './ui.js';
import {answerEditor} from './profile.js';

export function renderApplication(ctx,id){
  const item=ctx.state.opportunities.find(x=>x.id===id);
  if(!item)return el('section',{class:'empty'},el('h2',{},'Opportunity not found.'),button('Back to inbox',()=>ctx.go('inbox')));
  const root=el('div',{},el('a',{class:'back-link',href:'#inbox',onClick:e=>{e.preventDefault();ctx.go('inbox');}},'← Back to your inbox'));
  const prepareButton=button('Prepare from profile',()=>busy(prepareButton,()=>prepare(false)),'primary');
  const aiButton=button('Prepare with AI',()=>busy(aiButton,()=>prepare(true)));
  aiButton.disabled=!ctx.state.integrations.ai;
  if(aiButton.disabled)aiButton.title='Configure AI in Connections first.';
  const error=el('p',{class:'form-error',role:'alert'});
  async function prepare(use_ai){
    if(ctx.dirty){error.textContent='Save your edits before preparing a new version.';return;}
    try{await api(`/api/opportunities/${id}/prepare`,'POST',{use_ai});await ctx.refresh();ctx.render();announce('Application prepared. Review the draft and add any missing answers.');}
    catch(e){error.textContent=e.message;}
  }
  root.append(heading(item.category,item.title,item.organization||item.source,[prepareButton,aiButton]),error);
  const status=el('span',{class:`tag ${item.status}`},item.status);
  const select=field('Application progress','application-status',item.status,{options:ctx.state.statuses});
  const saveStatus=button('Update progress',()=>busy(saveStatus,async()=>{
    const result=await api(`/api/opportunities/${id}/status`,'POST',{status:select.querySelector('select').value});
    item.status=result.opportunity.status;item.submitted_at=result.opportunity.submitted_at;status.textContent=item.status;status.className=`tag ${item.status}`;
    select.querySelector('select').value=item.status;await ctx.refresh();
    announce(item.status==='submitted'?'Marked submitted based on your confirmation.':'Application progress updated.');
  }));
  const appUrl=item.application_url||item.url;
  const open=appUrl?el('a',{class:'button primary',href:appUrl,target:'_blank',rel:'noopener noreferrer'},'Open application ↗'):info('No application URL is recorded. Add it in Listing details below.');
  root.append(el('section',{class:'panel'},el('div',{class:'connection'},el('div',{},status,el('p',{},formatDate(item.deadline)),item.deadline_note?el('small',{},item.deadline_note):null),open),
    info('Open the application, use the browser helper to preview and fill this page, then review and click Submit yourself. Mark it submitted only after the website confirms submission.'),el('div',{class:'toolbar'},select,saveStatus)));
  const pack=item.pack;
  const assessment=item.assessment||pack?.assessment||{};
  const findings=[...(assessment.matches||[]),...(assessment.mismatches||[]),...(assessment.missing||[])];
  const evidence=el('section',{class:'panel'},el('h2',{},'Fit & eligibility'),el('span',{class:'tag'},assessment.eligibility||'unknown'),el('p',{class:'lead'},assessment.fit_note||''),
    assessment.matched_skills?.length?el('p',{},'Matching skill phrases: ',assessment.matched_skills.join(', ')):null,
    el('ul',{class:'checks'},findings.map(x=>el('li',{},x))));
  root.append(evidence);
  if(pack){
    const form=el('form',{noValidate:true});form.addEventListener('input',()=>ctx.setDirty(form));
    const answers=answerEditor(pack.answers||[],()=>ctx.setDirty(form));
    const resume=field('Resume draft','pack-resume',pack.resume,{type:'textarea',rows:14});resume.querySelector('textarea').classList.add('long');
    const statement=field('Cover letter / statement draft','pack-statement',pack.statement,{type:'textarea',rows:12});statement.querySelector('textarea').classList.add('long');
    const save=button('Save application edits',()=>{},'primary',{type:'submit'});
    const versionLabel=el('p',{class:'lead'},`Version ${pack.version} · ${pack.mode==='ai-assisted'?'AI-assisted excerpt selection':'From your saved profile'}`);
    form.append(el('section',{class:'panel'},el('h2',{},'Your application pack'),versionLabel,
      info(pack.notice),answers.node,el('details',{},el('summary',{},'Review and edit resume draft'),resume),el('details',{},el('summary',{},'Review and edit cover letter / statement'),statement),
      el('p',{class:'form-error',role:'alert'}),save));
    form.addEventListener('submit',e=>{e.preventDefault();busy(save,async()=>{
      const result=await api(`/api/opportunities/${id}/pack`,'PUT',{base_version:pack.version,answers:answers.read(),resume:resume.querySelector('textarea').value,statement:statement.querySelector('textarea').value});
      pack.version=result.opportunity.pack.version;versionLabel.textContent=`Version ${pack.version} · Saved application edits`;ctx.clearDirty(form);await ctx.refresh();announce('Application edits saved. Reopen the browser helper to load the latest version.');
    },form);});root.append(form);
    const downloads=el('div',{class:'download-list'});
    for(const kind of ['resume','statement']){
      const control=button(`Download ${kind} draft`,()=>busy(control,()=>download(`/api/opportunities/${id}/documents/${kind}`,`${kind}-draft.html`)));
      downloads.append(control);
    }
    root.append(el('section',{class:'panel'},el('h2',{},'Take it with you'),el('p',{class:'lead'},'Downloaded drafts are printable HTML. Open one in your browser and use Print → Save as PDF. Review the draft before attaching it.'),downloads));
  }else root.append(el('section',{class:'empty'},el('h3',{},'Make this application yours.'),el('p',{},'Prepare a pack from your saved profile, then add answers to this opportunity’s questions. No AI account is needed for a profile-based draft.'),button('Prepare from profile',()=>busy(prepareButton,()=>prepare(false)),'primary')));
  const metadata=el('form',{noValidate:true});metadata.addEventListener('input',()=>ctx.setDirty(metadata));
  const currentReq=item.requirements||{};
  const reqFields=['country','degree','citizenship','graduation_year'];
  metadata.append(field('Application URL','application_url',appUrl,{type:'url'}),field('Organization','organization',item.organization),field('Deadline','deadline',item.deadline,{help:'Use YYYY-MM-DD, or an ISO timestamp with timezone offset. Leave blank if unknown.'}),
    el('h3',{},'Explicit eligibility requirements'),el('p',{class:'lead'},'Copy exact requirements from the official listing. Use these simple checks only when the requirement truly has one value; otherwise review manually.'),
    el('div',{class:'form-grid'},reqFields.map(key=>field(`Required ${key.replace('_',' ')}`,`requirement-${key}`,currentReq[key]||''))),field('Your notes','notes',item.notes,{type:'textarea'}),el('p',{class:'form-error',role:'alert'}));
  const metaSave=button('Save listing details',()=>{},'primary',{type:'submit'});metadata.append(metaSave);
  metadata.addEventListener('submit',e=>{e.preventDefault();busy(metaSave,async()=>{
    const payload=Object.fromEntries(new FormData(metadata));payload.requirements={};
    for(const key of reqFields){const value=payload[`requirement-${key}`].trim();if(value)payload.requirements[key]=value;delete payload[`requirement-${key}`];}
    await api(`/api/opportunities/${id}`,'PUT',payload);ctx.clearDirty(metadata);await ctx.refresh();announce('Listing details saved. Updated eligibility appears when you reopen this application.');
  },metadata);});
  root.append(el('section',{class:'panel'},el('details',{},el('summary',{},'Listing details & eligibility requirements'),metadata)),
    el('section',{class:'panel'},el('details',{},el('summary',{},'Read the saved listing'),el('p',{class:'muted'},'Source: ',item.url?el('a',{href:item.url,target:'_blank',rel:'noopener noreferrer'},item.url):'Pasted by you'),el('pre',{},item.description))));
  return root;
}
