/* Pure matching plus guarded DOM writes. No clicks, form submission, or fetches. */
(function(root){
  'use strict';
  const norm=value=>String(value||'').toLowerCase().normalize('NFKC').replace(/[_-]+/g,' ').replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim().replace(/^your /,'');
  const aliases={
    name:['name','full name','applicant name','candidate name'],first_name:['first name','given name'],last_name:['last name','family name','surname'],
    email:['email','email address','contact email'],phone:['phone','phone number','telephone','telephone number','mobile','mobile number'],
    location:['location','city','current location','city of residence'],country:['country','country of residence'],
    portfolio:['website','portfolio','portfolio url','website url','personal website'],linkedin:['linkedin','linkedin url','linkedin profile'],github:['github','github url','github profile'],
    education:['education','educational background'],experience:['experience','relevant experience','work experience'],projects:['projects','relevant projects'],
    skills:['skills','technical skills'],research_interests:['research interests'],degree:['degree','highest degree'],graduation_year:['graduation year','year of graduation'],citizenship:['citizenship']
  };
  const autocomplete={name:'name','given-name':'first_name','family-name':'last_name',email:'email',tel:'phone','address-level2':'location','country-name':'country',url:'portfolio'};
  const consequential=/\b(password|passcode|social security|ssn|passport|bank|card number|credit card|cvv|captcha|signature|certif\w*|attest\w*|acknowledge\w*|agree\w*|consent|criminal|disabilit\w*|gender|ethnic\w*|race|veteran|work authoriz\w*|legally|sponsorship|assessment|exam|payment|fee|tax|reference email|referee)\b/i;
  function matchField(field,pack){
    // A visible question outranks machine identifiers such as name="name".
    // describe() already falls back to identifiers when a visible label is absent.
    const labels=[norm(field.label||(field.labels||[])[0]||'')].filter(Boolean);
    const label=field.label||labels[0]||'Unlabeled field';
    const base={...field,label,value:'',status:'unanswered',reason:'No exact saved answer or profile field matches.'};
    const type=(field.type||'text').toLowerCase();
    const allowed=['text','email','tel','url','number','search','textarea','select-one'];
    if(field.disabled||field.readOnly||field.hidden||!allowed.includes(type)||consequential.test(labels.join(' ')))return {...base,status:'skipped',reason:'Complete this field yourself; it is unsupported or needs a personal decision.'};
    if(String(field.value||'').trim())return {...base,status:'existing',reason:'Already has a value; existing entries are not overwritten.'};
    const p={...(pack.profile||{})};
    const parts=String(p.name||'').trim().split(/\s+/);
    p.first_name=p.first_name||parts[0]||'';p.last_name=p.last_name||parts.slice(1).join(' ');
    const candidates=[];
    for(const [key,names] of Object.entries(aliases))if(p[key]&&labels.some(label=>names.includes(label)))candidates.push(String(p[key]));
    const auto=(field.autocomplete||'').split(/\s+/).pop();
    if(autocomplete[auto]&&p[autocomplete[auto]])candidates.push(String(p[autocomplete[auto]]));
    for(const answer of pack.answers||[])if(labels.includes(norm(answer.question))&&String(answer.answer||'').trim())candidates.push(String(answer.answer));
    const unique=[...new Set(candidates)];
    if(unique.length>1)return {...base,status:'ambiguous',reason:'More than one saved value matches this question. Choose manually.'};
    if(!unique.length)return base;
    let value=unique[0];
    if(type==='number'&&!/^-?\d+(\.\d+)?$/.test(value))return {...base,reason:'The saved value is not a number.'};
    if(type==='url'&&!/^https?:\/\//i.test(value))return {...base,reason:'The saved value is not a complete web URL.'};
    if(type==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))return {...base,reason:'The saved value is not an email address.'};
    if(field.maxLength>0&&value.length>field.maxLength)return {...base,reason:'The saved answer exceeds this field’s length limit. Edit it before filling.'};
    if(field.tag==='select'){
      const options=(field.options||[]).filter(o=>!o.disabled&&(norm(o.value)===norm(value)||norm(o.text)===norm(value)));
      if(options.length!==1)return {...base,status:options.length?'ambiguous':'unanswered',reason:'No unique available option matches the saved answer.'};
      value=options[0].value;
    }
    return {...base,value,status:'ready',reason:'Matches a saved profile value or exact application answer.'};
  }
  function planFields(fields,pack){
    const result=fields.map(field=>matchField(field,pack));
    const counts=new Map();
    for(const field of result)if(field.status==='ready'){const key=norm(field.label);counts.set(key,(counts.get(key)||0)+1);}
    return result.map(field=>field.status==='ready'&&counts.get(norm(field.label))>1?{...field,status:'ambiguous',reason:'Duplicate visible questions. Complete these manually.'}:field);
  }
  function describe(node,index,doc){
    const labelled=(node.getAttribute('aria-labelledby')||'').split(/\s+/).map(id=>doc.getElementById(id)?.textContent||'').join(' ');
    const text=[...(node.labels||[])].map(x=>x.textContent.trim()).join(' ')||node.getAttribute('aria-label')||labelled||node.placeholder||node.name||node.id||'Unlabeled field';
    const style=doc.defaultView.getComputedStyle(node);
    const labels=[text,node.name,node.id,node.getAttribute('aria-label'),node.placeholder].filter(Boolean);
    return {index,label:text.slice(0,500),labels,tag:node.tagName.toLowerCase(),type:node.tagName==='TEXTAREA'?'textarea':node.type||'text',
      value:['password','hidden'].includes(node.type)?'':node.value||'',disabled:node.disabled,readOnly:node.readOnly,
      hidden:!node.getClientRects().length||style.display==='none'||style.visibility==='hidden',autocomplete:node.autocomplete,maxLength:node.maxLength,
      name:node.name||'',id:node.id||'',options:node.tagName==='SELECT'?[...node.options].map(o=>({value:o.value,text:o.textContent,disabled:o.disabled})):[]};
  }
  function scan(doc,pack){
    const fields=[...doc.querySelectorAll('input,textarea,select')].map((node,index)=>describe(node,index,doc));
    return planFields(fields.filter(f=>!f.hidden&&f.type!=='hidden'),pack);
  }
  function fill(doc,preview){
    const nodes=[...doc.querySelectorAll('input,textarea,select')];
    const result={filled:0,skipped:0,details:[]};
    for(const row of preview){
      if(row.status!=='ready'||row.selected===false)continue;
      const node=nodes[row.index];
      const fresh=node?describe(node,row.index,doc):null;
      if(!fresh||fresh.hidden||fresh.disabled||fresh.readOnly||fresh.label!==row.label||fresh.name!==row.name||fresh.id!==row.id||fresh.type!==row.type||String(fresh.value).trim()||consequential.test(norm(fresh.label))){
        result.skipped++;result.details.push(`${row.label}: page changed or already filled; left untouched.`);continue;
      }
      if(!['text','email','tel','url','number','search','textarea','select-one'].includes(fresh.type))continue;
      const win=doc.defaultView;
      const proto=fresh.tag==='textarea'?win.HTMLTextAreaElement.prototype:fresh.tag==='select'?win.HTMLSelectElement.prototype:win.HTMLInputElement.prototype;
      const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;
      if(!setter){result.skipped++;continue;}
      setter.call(node,String(row.value));
      node.dispatchEvent(new win.Event('input',{bubbles:true}));node.dispatchEvent(new win.Event('change',{bubbles:true}));
      if(String(node.value)===String(row.value)){result.filled++;result.details.push(`${row.label}: filled.`);}else{result.skipped++;result.details.push(`${row.label}: the page rejected the value; complete it manually.`);}
    }
    return result;
  }
  const api={norm,matchField,planFields,scan,fill};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.OpportunityAutofill=api;
})(typeof globalThis!=='undefined'?globalThis:this);
