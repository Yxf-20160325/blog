(function(){
  var toggle=document.querySelector('.nav-toggle');
  var links=document.querySelector('.nav-links');
  if(toggle&&links){toggle.addEventListener('click',function(){links.classList.toggle('open');});}
  if(!window.__SEARCH__)return;
  var q=document.getElementById('q');
  var box=document.getElementById('results');
  var hint=document.getElementById('hint');
  var data=null;
  fetch('assets/search-index.json').then(function(r){return r.json();}).then(function(j){data=j;}).catch(function(e){
    box.innerHTML='<p class="muted">搜索索引加载失败。</p>';
  });
  function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  function hl(text,kw){if(!kw)return esc(text);
    var re=new RegExp('('+kw.replace(/[.*+?^${}()|[]\\]/g,'\\$&')+')','gi');
    return esc(text).replace(re,'<mark>$1</mark>');}
  function search(kw){
    if(!data)return;kw=kw.trim().toLowerCase();
    if(!kw){box.innerHTML='';hint.textContent='共 '+data.length+' 篇可检索文章';return;}
    var res=data.filter(function(p){
      return p.title.toLowerCase().indexOf(kw)>=0||p.text.toLowerCase().indexOf(kw)>=0||p.tags.join(' ').toLowerCase().indexOf(kw)>=0;
    });
    hint.textContent='找到 '+res.length+' 条结果';
    if(!res.length){box.innerHTML='<p class="muted">没有匹配的文章。</p>';return;}
    box.innerHTML=res.map(function(p){
      return '<div class="result-item"><h3><a href="'+p.url+'">'+hl(p.title,kw)+'</a></h3>'+
        '<div class="post-meta"><span class="muted">'+esc(p.summary.slice(0,90))+'</span></div>'+
        '<div class="tags">'+p.tags.map(function(t){return '<span class="tag">'+esc(t)+'</span>';}).join('')+'</div></div>';
    }).join('');
  }
  q.addEventListener('input',function(){search(q.value);});
})();