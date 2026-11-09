import {el,button,api,setToken,announce,confirmDiscard,heading,info} from './ui.js';
import {renderInbox} from './inbox.js';
import {renderProfile} from './profile.js';
import {renderConnections} from './connections.js';
import {renderApplication} from './application.js';

const workspace=document.getElementById('workspace');
const nav=document.getElementById('navigation');
const routes=[['inbox','↗','Opportunity inbox'],['profile','○','Your profile'],['connections','⌁','Connections'],['guide','?','How it works']];
const ctx={state:null,dirtyScopes:new Set(),get dirty(){return this.dirtyScopes.size>0;},view:'inbox',id:'',setDirty(scope='page'){this.dirtyScopes.add(scope);},clearDirty(scope){if(scope)this.dirtyScopes.delete(scope);else this.dirtyScopes.clear();},
  async refresh(){this.state=await api('/api/state');},
  async go(view,id=''){
    if(this.dirty){if(!await confirmDiscard())return;this.clearDirty();}
    this.view=view;this.id=id;history.pushState(null,'',`#${view}${id?'/'+id:''}`);this.render();
    document.getElementById('content').focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});
  },
  render(){
    nav.replaceChildren(...routes.map(([view,icon,label])=>el('a',{href:`#${view}`,class:'nav-link',...(this.view===view?{'aria-current':'page'}:{}),onClick:e=>{e.preventDefault();this.go(view);}},el('span',{class:'nav-icon','aria-hidden':'true'},icon),label)));
    const screen=this.view==='profile'?renderProfile(this):this.view==='connections'?renderConnections(this):this.view==='application'?renderApplication(this,this.id):this.view==='guide'?renderGuide(this):renderInbox(this);
    workspace.replaceChildren(screen);
    document.title=`${this.view==='application'?'Application':routes.find(x=>x[0]===this.view)?.[2]||'Inbox'} — Opportunity Desk`;
  }
};

function renderGuide(ctx){
  const steps=[['Tell your story','Save contact information, real experience, projects, skills, and reusable answers in Profile. Paste resume text so it can be used in preparation.'],
    ['Bring in opportunities','Add a listing link or paste its text. Use Import LinkedIn posts / this page in the browser helper to preview and save a post you opened. Connect RSS/Atom feeds, Greenhouse or Lever boards, and optional web search. Opportunities can be jobs, fellowships, hackathons, competitions, or anything else.'],
    ['Prepare and review','Open an opportunity and prepare a pack from your profile. With AI configured, the assistant prioritizes relevant profile excerpts. Review and edit answers, resume, and cover letter drafts.'],
    ['Fill a page, then submit yourself','Load the browser extension, pair it in Connections, select an application pack, and preview fields. Fill only the fields you select. Navigate multi-page applications yourself, then preview the next page. Review, attach files, and submit on the website.'],
    ['Keep a clear record','When the website confirms submission, mark the application submitted in your tracker. Filling is recorded separately. Export your tracker at any time.']];
  return el('div',{},heading('A HELPFUL ASSISTANT. YOUR DECISIONS.','From possibility to application.','A repeatable workflow, with you in control of the final step.'),el('section',{class:'panel'},el('ol',{class:'steps'},steps.map(([title,text])=>el('li',{},el('h3',{},title),el('p',{},text))))),
    el('section',{class:'panel'},el('h2',{},'What needs your attention'),info('The helper supports ordinary visible text fields, textareas, and native selects. File uploads, consent, declarations, sign-in, CAPTCHA, assessments, payments, custom widgets, and cross-origin frames may require manual completion.'),
      el('p',{class:'lead'},'A match is a clue to investigate, not proof of eligibility. Check the official listing for deadlines and requirements. Missing information stays visible rather than being invented.'),el('div',{class:'actions'},button('Set up your profile',()=>ctx.go('profile'),'primary'),button('Connect the helper',()=>ctx.go('connections')))));
}

document.querySelectorAll('[data-view]').forEach(link=>link.addEventListener('click',e=>{e.preventDefault();ctx.go(link.dataset.view);}));
window.addEventListener('beforeunload',e=>{if(ctx.dirty){e.preventDefault();e.returnValue='';}});
window.addEventListener('popstate',async()=>{const [view,id]=location.hash.slice(1).split('/');await ctx.go(view||'inbox',id||'');});
document.getElementById('today').textContent=new Intl.DateTimeFormat(undefined,{day:'numeric',month:'short',year:'numeric'}).format(new Date());

async function start(){
  try{
    const bootstrap=await fetch('/api/bootstrap').then(r=>{if(!r.ok)throw new Error('Open the agent at its localhost address.');return r.json();});
    setToken(bootstrap.token);await ctx.refresh();
    const [view,id]=location.hash.slice(1).split('/');ctx.view=view||'inbox';ctx.id=id||'';ctx.render();
  }catch(e){workspace.replaceChildren(el('section',{class:'empty'},el('h2',{},'Your workspace could not open.'),el('p',{},e.message),button('Retry',start,'primary')));announce('Connection unavailable. Keep the agent running and retry.','error');}
}
start();
