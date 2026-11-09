const {test}=require('node:test');
const assert=require('node:assert/strict');
const {normalisePost,dedupePosts}=require('../extension/post-import.js');

test('turns a LinkedIn post into a reviewable intake object',()=>{
  const row=normalisePost({text:'Research fellowship applications are open.\nWork on accessible search.',url:'https://www.linkedin.com/feed/update/urn:li:activity:123/',links:['https://lab.example/apply']},'https://www.linkedin.com/feed/');
  assert.equal(row.source,'LinkedIn post');
  assert.equal(row.category,'Research fellowship');
  assert.equal(row.application_url,'https://lab.example/apply');
  assert.match(row.url,/activity:123/);
});
test('rejects unsafe links and leaves multiple application links for the user',()=>{
  assert.throws(()=>normalisePost({text:'A useful opportunity',url:'javascript:alert(1)'},'https://www.linkedin.com/feed/'));
  const row=normalisePost({text:'Hackathon applications open',links:['https://a.example/apply','https://b.example/apply','javascript:alert(1)']},'https://www.linkedin.com/feed/');
  assert.equal(row.application_url,'');
  assert.equal(row.links.length,2);
  assert.equal(row.category,'Hackathon');
});
test('different selected posts from one feed remain distinct',()=>{
  const rows=dedupePosts([{text:'First competition post with details',url:'https://www.linkedin.com/feed/'},{text:'Second competition post with details',url:'https://www.linkedin.com/feed/'},{text:'First competition post with details',url:'https://www.linkedin.com/feed/'}]);
  assert.equal(rows.length,2);
  assert.notEqual(rows[0].source_id,rows[1].source_id);
});
