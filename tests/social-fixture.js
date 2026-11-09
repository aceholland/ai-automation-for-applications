'use strict';
document.getElementById('capture-test').addEventListener('click',async()=>{
  const result=document.getElementById('capture-result');
  try{
    const posts=OpportunityPostImport.capture(document,{href:'https://www.linkedin.com/feed/',protocol:'https:',pathname:'/feed/'});
    const post=posts[0];
    const tests={
      'exact post text captured':post.text.includes('Build accessible search tools'),
      'LinkedIn source recorded':post.source==='LinkedIn post',
      'activity permalink preserved':post.url==='https://www.linkedin.com/feed/update/urn:li:activity:1234567890123456789/',
      'application link captured':post.application_url==='https://example.org/research-application',
      'fellowship type detected':post.category==='Research fellowship',
      'one post previewed':posts.length===1
    };
    const bootstrap=await fetch('/api/bootstrap').then(r=>r.json());
    const response=await fetch('/api/intake',{method:'POST',headers:{'Content-Type':'application/json','X-Opportunity-Token':bootstrap.token},body:JSON.stringify(post)});
    const saved=await response.json();
    tests['saved into local opportunity inbox']=response.ok&&saved.opportunity.source==='LinkedIn post'&&saved.opportunity.application_url===post.application_url;
    result.textContent=`${Object.values(tests).filter(Boolean).length}/${Object.keys(tests).length} post-import checks passed.\n`+Object.entries(tests).map(([name,ok])=>`${ok?'PASS':'FAIL'} ${name}`).join('\n');
  }catch(e){result.textContent='FAIL '+e.message;}
});
