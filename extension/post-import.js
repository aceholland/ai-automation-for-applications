/* Read only the selected/current page. Saving always happens after a user preview. */
(function(root){
  'use strict';
  function safeUrl(value,base){
    const url=new URL(value,base);
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Use an ordinary web URL without embedded credentials.');
    return url.href;
  }
  const linkedin=url=>{const host=new URL(url).hostname;return host==='linkedin.com'||host.endsWith('.linkedin.com');};
  function normalisePost(row,pageUrl){
    const text=String(row.text||'').trim().slice(0,80000);
    if(text.length<10)throw new Error('Select the post text, or open the full post, and try importing again.');
    const url=safeUrl(row.url||pageUrl,pageUrl);
    const links=[];
    for(const value of row.links||[]){try{const link=safeUrl(value,url);if(!linkedin(link)&&!links.includes(link))links.push(link);}catch{ /* Unsafe links are not offered. */ }}
    const isLinkedIn=linkedin(url)||Boolean(pageUrl&&linkedin(pageUrl));
    const direct=/\/(posts\/|feed\/update\/)/.test(new URL(url).pathname);
    const category=/hackathon/i.test(text)?'Hackathon':/fellow/i.test(text)?'Research fellowship':/scholarship/i.test(text)?'Scholarship':/intern/i.test(text)?'Internship':/competition/i.test(text)?'Competition':/\bgrant\b/i.test(text)?'Grant':/\b(hiring|job|vacancy)\b/i.test(text)?'Job':'Other';
    return {text,title:(row.title||text.split('\n').find(line=>line.trim())||'Saved opportunity').trim().slice(0,180),url,
      application_url:links.length===1?links[0]:'',links,category,source:isLinkedIn?'LinkedIn post':'Browser import',
      source_id:isLinkedIn&&!direct?String(row.id||text):''};
  }
  function dedupePosts(rows,pageUrl){
    const output=[],seen=new Set();
    for(const row of rows){
      try{const post=normalisePost(row,pageUrl||row.url);const key=post.url+'\n'+post.source_id;if(!seen.has(key)){seen.add(key);output.push(post);}}catch{ /* One unparseable card should not discard the others. */ }
    }
    return output.slice(0,20);
  }
  function postUrl(node,loc){
    if(node){
      const link=node.querySelector('a[href*="/feed/update/"],a[href*="/posts/"]');
      if(link)return link.href;
      const holder=node.closest('[data-urn]')||node.querySelector('[data-urn]');
      const urn=holder?.getAttribute('data-urn')||node.getAttribute('data-urn')||'';
      if(/^urn:li:activity:\d+$/.test(urn))return 'https://www.linkedin.com/feed/update/'+urn+'/';
    }
    return loc.href;
  }
  function capture(doc,loc){
    if(!/^https?:$/.test(loc.protocol))throw new Error('Open an ordinary listing or LinkedIn post in a web tab.');
    const selected=doc.defaultView.getSelection();
    if(selected&&selected.toString().trim().length>=10){
      const parent=selected.anchorNode?.nodeType===1?selected.anchorNode:selected.anchorNode?.parentElement;
      const card=parent?.closest('article,.feed-shared-update-v2,[data-urn^="urn:li:activity:"]');
      return [normalisePost({text:selected.toString(),url:postUrl(card,loc),links:card?[...card.querySelectorAll('a[href]')].map(a=>a.href):[]},loc.href)];
    }
    if(linkedin(loc.href)){
      const cards=[...doc.querySelectorAll('article,.feed-shared-update-v2,[data-urn^="urn:li:activity:"]')].filter(node=>{
        const rect=node.getBoundingClientRect();return rect.width>0&&rect.height>0&&rect.bottom>0&&rect.top<doc.defaultView.innerHeight;
      });
      const rows=cards.map(card=>({text:(card.querySelector('.update-components-text,.feed-shared-update-v2__description,[data-test-id="main-feed-activity-card__commentary"]')||card).innerText,
        url:postUrl(card,loc),links:[...card.querySelectorAll('a[href]')].map(a=>a.href)}));
      if(!rows.length&&/\/(posts\/|feed\/update\/)/.test(loc.pathname)){
        const textNode=doc.querySelector('.update-components-text,.feed-shared-update-v2__description,main');
        if(textNode)rows.push({text:textNode.innerText,url:loc.href,links:[...textNode.querySelectorAll('a[href]')].map(a=>a.href)});
      }
      const posts=dedupePosts(rows,loc.href);
      if(!posts.length)throw new Error('No visible LinkedIn post text was found. Open the full post, expand its text, or select the post text and import again.');
      return posts;
    }
    const main=doc.querySelector('main,article')||doc.body;
    return [normalisePost({text:main.innerText,url:loc.href,title:doc.title,links:[]},loc.href)];
  }
  const api={normalisePost,dedupePosts,capture};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.OpportunityPostImport=api;
})(typeof globalThis!=='undefined'?globalThis:this);
