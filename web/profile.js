import {el,button,field,heading,info,api,busy,announce,validate,formError,download} from './ui.js';

export function answerEditor(answers, changed) {
  const list=el('div');
  let index=0;
  function add(answer={}){
    const id=index++;
    const row=el('div',{class:'answer-row'},field('Question',`question-${id}`,answer.question||''),field('Your answer',`answer-${id}`,answer.answer||'',{type:'textarea'}));
    row.append(button('Remove answer',()=>{row.remove();changed();},'ghost'));
    row.addEventListener('input',changed); list.append(row);
  }
  answers.forEach(add);
  const root=el('div',{},el('div',{class:'answer-toolbar'},el('h3',{},'Reusable answers'),button('+ Add answer',()=>{add();changed();})) ,list);
  return {node:root, read:()=>[...list.children].map(row=>({question:row.querySelector('input').value.trim(),answer:row.querySelector('textarea').value.trim()})).filter(x=>x.question&&x.answer)};
}

export function renderProfile(ctx){
  const p=ctx.state.profile;
  const root=el('div',{},heading('YOUR STARTING POINT','Your story, in one place.','Use your real experience. The assistant reuses these facts and leaves unknown answers for you.'));
  const form=el('form',{noValidate:true});
  form.addEventListener('input',()=>ctx.setDirty(form));
  const contact=el('div',{class:'panel'},el('h2',{},'The essentials'),el('p',{class:'lead'},'Your name and email are required to prepare an application.'),el('div',{class:'form-grid'},
    field('Full name','name',p.name,{required:true}),field('Email','email',p.email,{type:'email',required:true}),
    field('First name','first_name',p.first_name,{help:'Optional; otherwise taken from your full name.'}),field('Last name','last_name',p.last_name),
    field('Phone','phone',p.phone,{type:'tel'}),field('City / location','location',p.location),field('Country of residence','country',p.country),field('Portfolio / website','portfolio',p.portfolio,{type:'url'}),
    field('LinkedIn','linkedin',p.linkedin,{type:'url'}),field('GitHub','github',p.github,{type:'url'})));
  const background=el('div',{class:'panel'},el('h2',{},'What you bring'),el('p',{class:'lead'},'Use one fact or achievement per line. Numbers, names, and outcomes stay exactly as you enter them.'),el('div',{class:'form-grid'},
    ...[['Education','education'],['Experience','experience'],['Projects','projects'],['Achievements','achievements'],['Research interests','research_interests'],['Skills','skills']].map(([label,name])=>field(label,name,p[name],{type:'textarea',help:name==='skills'?'Separate skill phrases with commas or new lines.':''})),
    field('What are you looking for?','preferences',p.preferences,{type:'textarea',full:true,help:'Types of roles, topics, locations, availability, or other priorities.'})));
  const eligibility=el('div',{class:'panel'},el('h2',{},'Optional eligibility facts'),el('p',{class:'lead'},'Only enter facts you want stored locally. The assistant does not infer them from your name or location.'),el('div',{class:'form-grid'},
    field('Degree','degree',p.degree,{placeholder:'For example: BSc or PhD'}),field('Graduation year','graduation_year',p.graduation_year),field('Citizenship','citizenship',p.citizenship,{help:'Optional. Used only against explicitly recorded requirements.'})));
  const resume=el('div',{class:'panel'},el('h2',{},'Your resume'),field('Resume text','resume_text',p.resume_text,{type:'textarea',help:'Paste the text so preparation can use it. Attaching a file alone does not extract its text.'}));
  const upload=field('Attach your existing resume','attachment','',{type:'file',help:'PDF, DOCX, or TXT · up to 5 MB. You select attachments yourself on application websites.'});
  upload.querySelector('input').accept='.pdf,.docx,.txt';
  const fileStatus=el('p',{class:'muted'},ctx.state.resume?`Attached: ${ctx.state.resume.filename}`:'No file attached.');
  const uploadButton=button('Save attachment',()=>busy(uploadButton,async()=>{
    const file=upload.querySelector('input').files[0];
    if(!file||file.size>5000000)throw new Error('Choose a PDF, DOCX, or TXT file up to 5 MB.');
    const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(new Error('The file could not be read.'));reader.readAsDataURL(file);});
    const result=await api('/api/resume','POST',{filename:file.name,data});ctx.state.resume=result.resume;fileStatus.textContent=`Attached: ${result.resume.filename}`;announce('Resume attachment saved.');
  },form));
  resume.append(upload,el('div',{class:'actions'},uploadButton,button('Download attachment',()=>busy(uploadButton,()=>download('/api/resume/raw',ctx.state.resume?.filename||'resume.pdf'),form),'ghost')),fileStatus);
  const answers=answerEditor(p.answers||[],()=>ctx.setDirty(form));
  const save=button('Save profile',()=>{},'primary',{type:'submit'});
  form.append(contact,background,eligibility,resume,el('div',{class:'panel'},answers.node),el('p',{class:'form-error',role:'alert'}),el('div',{class:'actions'},save,el('small',{},'Saved locally on this computer.')));
  form.addEventListener('submit',event=>{
    event.preventDefault();if(!validate(form))return;
    busy(save,async()=>{
      const values=Object.fromEntries(new FormData(form));delete values.attachment;
      values.answers=answers.read();
      await api('/api/profile','PUT',values);ctx.clearDirty(form);await ctx.refresh();announce('Profile saved. Your next application starts here.');
    },form);
  });
  root.append(form);return root;
}
