const {test}=require('node:test');
const assert=require('node:assert/strict');
const {matchField,planFields}=require('../extension/autofill.js');
const pack={profile:{name:'Asha Rao',email:'asha@example.org',skills:'Python, SQL',country:'India'},answers:[{question:'Why this program?',answer:'I want to study accessible search.'}]};
const field=(label,extra={})=>({label,labels:[label],tag:'input',type:'text',value:'',...extra});

test('matches contact labels and autocomplete, without guessing company name',()=>{
  assert.equal(matchField(field('Email address'),pack).value,'asha@example.org');
  assert.equal(matchField(field('Contact',{autocomplete:'given-name'}),pack).value,'Asha');
  assert.equal(matchField(field('Company name'),pack).status,'unanswered');
  assert.equal(matchField(field('Company name',{labels:['Company name','name']}),pack).status,'unanswered');
  assert.equal(matchField(field('Company name',{autocomplete:'name'}),pack).status,'unanswered');
});
test('uses exact saved application answers',()=>{
  assert.equal(matchField(field('Why this program?'),pack).value,'I want to study accessible search.');
  assert.equal(matchField(field('Why the other program?'),pack).status,'unanswered');
});
test('never writes consequential or unsupported controls, even if an answer exists',()=>{
  for(const type of ['submit','checkbox','radio','file','password','hidden']) assert.equal(matchField(field('Email address',{type}),pack).status,'skipped');
  assert.equal(matchField(field('I certify these statements are true'),{...pack,answers:[{question:'I certify these statements are true',answer:'yes'}]}).status,'skipped');
});
test('leaves existing user-entered values alone',()=>{
  assert.equal(matchField(field('Email',{value:'other@example.org'}),pack).status,'existing');
});
test('native select matches only a unique available value or text',()=>{
  assert.equal(matchField(field('Country',{tag:'select',type:'select-one',options:[{value:'',text:'Choose'},{value:'IN',text:'India'}]}),pack).value,'IN');
  assert.equal(matchField(field('Country',{tag:'select',type:'select-one',options:[{value:'US',text:'United States'}]}),pack).status,'unanswered');
});
test('duplicate visible labels and conflicting profile/answer values are ambiguous',()=>{
  const plan=planFields([field('Email'),field('Email')],pack);
  assert.equal(plan[0].status,'ambiguous');assert.equal(plan[1].status,'ambiguous');
  const partiallyFilled=planFields([field('Email',{value:'reference@example.org'}),field('Email')],pack);
  assert.equal(partiallyFilled[1].status,'ambiguous');
  assert.equal(matchField(field('Email'),{...pack,answers:[{question:'Email',answer:'different@example.org'}]}).status,'ambiguous');
});
test('mismatched numeric and URL controls stay unanswered',()=>{
  assert.equal(matchField(field('Name',{type:'number'}),pack).status,'unanswered');
  assert.equal(matchField(field('Name',{type:'url'}),pack).status,'unanswered');
});
