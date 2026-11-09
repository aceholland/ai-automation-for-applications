import {el, button, field, heading, info, api, busy, announce, formatDate, showDialog, formError} from './ui.js';

export function addOpportunity(ctx) {
  const form = el('form', {noValidate:true});
  form.append(field('Listing URL', 'url', '', {type:'url', placeholder:'https://…', help:'For pages that require sign-in, paste the description below.'}),
    field('Or paste the listing', 'text', '', {type:'textarea', placeholder:'Title, description, requirements, and application questions…'}),
    el('div', {class:'form-grid'}, field('Title', 'title', '', {help:'Optional; taken from the listing when available.'}),
      field('Type', 'category', 'Other', {options:ctx.state.categories}),
      field('Organization', 'organization'), field('Deadline', 'deadline', '', {placeholder:'2027-01-15 or ISO time with offset', help:'Leave blank if unknown. A date alone has no known closing time.'})),
    el('p', {class:'form-error',role:'alert'}));
  const save = button('Add opportunity', () => {}, 'primary', {type:'submit'});
  form.append(el('div', {class:'actions'}, save));
  const dialog = showDialog('Add an opportunity', form);
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.elements.url.value.trim() && !form.elements.text.value.trim()) { formError(form, 'Paste a listing URL or its description.'); form.elements.url.focus(); return; }
    busy(save, async () => {
      const data = await api('/api/intake', 'POST', Object.fromEntries(new FormData(form)));
      dialog.close(); await ctx.refresh(); await ctx.go('application', data.opportunity.id);
      announce(data.created ? 'Opportunity added. Review the listing and prepare your application.' : 'This opportunity is already in your workspace.');
    }, form);
  });
}

export function renderInbox(ctx) {
  const items = ctx.state.opportunities;
  const root = el('div');
  const discover = button('Find opportunities ↗', () => busy(discover, async () => {
    const data = await api('/api/discover','POST',{});
    await ctx.refresh(); ctx.render();
    const summary = `${data.added} added · ${data.duplicates} already saved · ${data.checked} sources checked.`;
    announce(summary + (data.errors.length ? ' Some sources need attention; see Connections.' : ''));
  }));
  root.append(heading('YOUR NEXT CHAPTER', ['Good opportunities.',el('br'),el('em', {}, 'Less busywork.')],
    'Jobs, research, hackathons, and whatever comes next. One profile. An application that still sounds like you.',
    [button('+ Add opportunity', () => addOpportunity(ctx),'primary'), discover]));
  const haveProfile = Boolean(ctx.state.profile.name && ctx.state.profile.email);
  const steps = [['Profile', 'Your starting point',haveProfile],['Discover','Find your fit',items.length > 0],['Prepare','Make it yours',items.some(x => x.pack)],['Review & submit','The last word is yours',items.some(x => x.status === 'submitted')]];
  root.append(el('section', {class:'hero-path', 'aria-label':'Your application workflow'},
    el('div', {}, el('h2', {}, 'A little structure. A lot of possibility.'), el('p', {}, 'Let the assistant handle the repetition. Keep your attention on the opportunity.')),
    el('ol', {class:'path'}, steps.map(([title,caption,done],i) => el('li', {}, el('span', {class:`path-dot ${done ? 'done' : ''}`,'aria-label':done?'Complete':`Step ${i+1}`}, done?'✓':i+1), title, el('small', {}, caption))))));
  const list = el('div',{class:'opportunity-list'});
  const pagination = el('div',{class:'pagination'});
  const counter = el('span',{class:'count'});
  const search = field('Search opportunities','search','',{placeholder:'Title or organization'});
  search.classList.add('search-wrap');
  const clear = button('×', () => { search.querySelector('input').value=''; page=1; update(); search.querySelector('input').focus(); },'clear-search',{'aria-label':'Clear search'});
  clear.className='clear-search'; clear.hidden=true; search.append(clear);
  const category = field('Type','filter-category','all',{options:[{value:'all',label:'All types'},...ctx.state.categories]});
  const status = field('Progress','filter-status','active',{options:[{value:'active',label:'All active'},{value:'all',label:'Include archived'},...ctx.state.statuses.map(x=>({value:x,label:x.charAt(0).toUpperCase()+x.slice(1)}))]});
  let page = 1;
  function update() {
    const query=search.querySelector('input').value.trim().toLowerCase();
    clear.hidden=!query;
    const cat=category.querySelector('select').value;
    const state=status.querySelector('select').value;
    const filtered=items.filter(x=>(cat==='all'||x.category===cat)&&(state==='all'||(state==='active'?x.status!=='archived':x.status===state))&&`${x.title} ${x.organization} ${x.category}`.toLowerCase().includes(query));
    const pages=Math.max(1,Math.ceil(filtered.length/20)); page=Math.min(page,pages);
    counter.textContent=`${filtered.length} ${filtered.length===1?'opportunity':'opportunities'}`;
    list.replaceChildren();
    if (!filtered.length) {
      list.append(el('section',{class:'empty'},el('div',{class:'empty-symbol','aria-hidden':'true'},'↗'),el('h3',{},items.length?'Nothing matches yet.':'Your next chapter starts here.'),
        el('p',{},items.length?'Try another search or clear your filters.':'Add a listing you like, or connect a source to find opportunities. Your workspace will grow from there.'),
        button(items.length?'Clear filters':'+ Add your first opportunity',()=>{if(items.length){search.querySelector('input').value='';category.querySelector('select').value='all';status.querySelector('select').value='active';update();}else addOpportunity(ctx);},'primary')));
    }
    for(const item of filtered.slice((page-1)*20,page*20)){
      const link=el('a',{href:`#application/${item.id}`,onClick:event=>{event.preventDefault();ctx.go('application',item.id);}},item.title);
      list.append(el('article',{class:'opportunity'},el('div',{class:'opportunity-top'},el('span',{class:'tag'},item.category),el('span',{class:`tag ${item.status}`},item.status)),
        el('h3',{},link),el('p',{},item.organization||item.source||'Added by you'),
        el('div',{class:'opportunity-foot'},el('span',{class:'muted'},formatDate(item.deadline)),button('Open application →',()=>ctx.go('application',item.id),'ghost'))));
    }
    const previous=button('← Previous',()=>{page--;update();});previous.disabled=page<=1;
    const next=button('Next →',()=>{page++;update();});next.disabled=page>=pages;
    pagination.replaceChildren(previous,el('span',{},`Page ${page} of ${pages}`),next);
    pagination.hidden=filtered.length<=20;
  }
  for(const input of [search.querySelector('input'),category.querySelector('select'),status.querySelector('select')]){
    input.addEventListener('input',event=>{if(!event.isComposing){page=1;update();}});
    input.addEventListener('compositionend',()=>{page=1;update();});
  }
  root.append(el('div',{class:'queue-header'},el('h2',{},'Your opportunity inbox'),counter),el('div',{class:'toolbar'},search,category,status),
    el('div',{class:'inbox-grid'},el('section',{'aria-label':'Opportunities'},list,pagination),
      el('aside',{class:'aside-note'},el('div',{class:'large-arrow','aria-hidden':'true'},'↗'),el('h3',{},haveProfile?'Better inputs. Better applications.':'Start with your story.'),
        el('p',{},haveProfile?'Add real projects, achievements, and reusable answers to your profile. Every draft starts with those facts.':'Your profile is the foundation for every application. Add your background once, then build on it.'),button(haveProfile?'Update your profile':'Set up your profile',()=>ctx.go('profile'),'ghost'))));
  if(ctx.state.last_discovery?.errors?.length) root.append(info('Your last discovery run had source errors. Open Connections for details.',true));
  update(); return root;
}
