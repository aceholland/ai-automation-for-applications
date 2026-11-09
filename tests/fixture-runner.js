/* Browser-run behavioral checks against the exact distributed autofill core. */
'use strict';
let submitted=0;
document.getElementById('application').addEventListener('submit',e=>{e.preventDefault();submitted++;});
document.getElementById('run-test').addEventListener('click',()=>{
  const pack={profile:{name:'Asha Rao',email:'asha@example.org',country:'India',phone:'+91 00000 00000'},answers:[{question:'Why this program?',answer:'I want to study accessible search.'}]};
  const preview=OpportunityAutofill.scan(document,pack);
  const result=OpportunityAutofill.fill(document,preview);
  const tests={
    'name filled':document.getElementById('name').value==='Asha Rao',
    'email filled':document.getElementById('email').value==='asha@example.org',
    'native select filled':document.getElementById('country').value==='IN',
    'saved essay filled':document.getElementById('why').value==='I want to study accessible search.',
    'unknown company left blank':document.getElementById('company').value==='',
    'ambiguous phones left blank':document.getElementById('dup1').value===''&&document.getElementById('dup2').value==='',
    'existing value preserved':document.getElementById('existing').value==='https://existing.example.org',
    'consent untouched':!document.getElementById('consent').checked,
    'file upload untouched':document.getElementById('resume').files.length===0,
    'password untouched':document.getElementById('password').value==='',
    'hidden field untouched':document.querySelector('input[type=hidden]').value==='leave-hidden-alone',
    'form never submitted':submitted===0,
    'four values written':result.filled===4
  };
  const passed=Object.values(tests).filter(Boolean).length;
  document.getElementById('fixture-result').textContent=`${passed}/${Object.keys(tests).length} browser autofill checks passed.\n`+Object.entries(tests).map(([name,ok])=>`${ok?'PASS':'FAIL'} ${name}`).join('\n')+'\n'+result.details.join('\n');
  document.getElementById('run-test').disabled=true;
});
