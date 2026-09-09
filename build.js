/**
 * 个人博客静态站点生成器
 * 读取 posts/*.md（含 frontmatter）与 about.md，生成完整静态站点到 public/。
 *
 * 依赖（位于受管 Node 工作区）：markdown-it, highlight.js, gray-matter
 * 运行：NODE_PATH=/Users/test/.workbuddy/binaries/node/workspace/node_modules node build.js
 */
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const MarkdownIt = require('markdown-it');
const hljs = require('highlight.js');

const ROOT = __dirname;
const POSTS_DIR = path.join(ROOT, 'posts');
const ABOUT_FILE = path.join(ROOT, 'about.md');
const OUT_DIR = path.join(ROOT, 'public');
const ASSETS_DIR = path.join(OUT_DIR, 'assets');

const SITE = {
  title: '清风博客',
  author: '清风',
  description: '一个记录开发、设计与思考的个人博客',
  perPage: 5,
};

// ---------- Markdown 渲染（带语法高亮） ----------
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  highlight(str, lang) {
    let code;
    if (lang && hljs.getLanguage(lang)) {
      try {
        code = hljs.highlight(str, { language: lang, ignoreIllegals: true }).value;
      } catch (e) { /* ignore */ }
    } else {
      try {
        code = hljs.highlightAuto(str).value;
      } catch (e) { /* ignore */ }
    }
    if (!code) code = md.utils.escapeHtml(str);
    return '<pre class="hljs"><code>' + code + '</code></pre>\n';
  },
});

// ---------- 工具函数 ----------
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

function fmtDate(d) {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function readingTime(text) {
  const cjk = (text.match(/[一-龥]/g) || []).length;
  const words = (text.replace(/[一-龥]/g, ' ').match(/[A-Za-z0-9]+/g) || []).length;
  const mins = Math.ceil(cjk / 300 + words / 200);
  return Math.max(1, mins);
}

function plainText(mdText) {
  return mdText
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_~|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tagSlug(tag) { return encodeURIComponent(tag); }
function tagUrl(tag, base) { return `${base}tags/${tagSlug(tag)}.html`; }

// ---------- 数据加载 ----------
function loadPosts() {
  if (!fs.existsSync(POSTS_DIR)) return [];
  const files = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md'));
  const posts = files.map((f) => {
    const raw = fs.readFileSync(path.join(POSTS_DIR, f), 'utf8');
    const { data, content } = matter(raw);
    const slug = f.replace(/\.md$/, '');
    const date = data.date ? new Date(data.date) : new Date();
    return {
      slug,
      title: data.title || slug,
      date,
      dateStr: fmtDate(data.date || date),
      tags: Array.isArray(data.tags) ? data.tags : (data.tags ? [data.tags] : []),
      summary: data.summary || plainText(content).slice(0, 130),
      content,
      html: md.render(content),
      text: plainText(content),
      reading: readingTime(content),
    };
  });
  posts.sort((a, b) => b.date.getTime() - a.date.getTime());
  return posts;
}

// ---------- 布局 ----------
function layout({ title, body, base = '', active = '', extraHead = '' }) {
  const nav = (href, label, key) =>
    `<a href="${base}${href}" class="${active === key ? 'active' : ''}">${label}</a>`;
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · ${esc(SITE.title)}</title>
<meta name="description" content="${esc(SITE.description)}">
<link rel="stylesheet" href="${base}assets/style.css">
${extraHead}
</head>
<body>
<header class="site-header">
  <div class="container nav">
    <a class="brand" href="${base}index.html">${esc(SITE.title)}</a>
    <button class="nav-toggle" aria-label="菜单">☰</button>
    <nav class="nav-links">
      ${nav('index.html', '首页', 'home')}
      ${nav('tags/index.html', '标签', 'tags')}
      ${nav('about.html', '关于', 'about')}
      ${nav('search.html', '搜索', 'search')}
    </nav>
  </div>
</header>
<main class="container main">
${body}
</main>
<footer class="site-footer">
  <div class="container">
    <p>© ${new Date().getFullYear()} ${esc(SITE.author)} · ${esc(SITE.title)}</p>
    <p class="muted">使用静态站点生成器构建 · 支持 Markdown 写作</p>
  </div>
</footer>
<script src="${base}assets/main.js"></script>
</body>
</html>`;
}

// ---------- 渲染片段 ----------
function postCard(post, base) {
  const tags = post.tags.map((t) =>
    `<a class="tag" href="${tagUrl(t, base)}">${esc(t)}</a>`).join('');
  return `<article class="post-card">
  <h2 class="post-title"><a href="${base}posts/${post.slug}.html">${esc(post.title)}</a></h2>
  <div class="post-meta">
    <time>${post.dateStr}</time>
    <span class="dot">·</span>
    <span>${post.reading} 分钟阅读</span>
  </div>
  <p class="post-summary">${esc(post.summary)}</p>
  <div class="tags">${tags}</div>
</article>`;
}

function pagination(cur, total, base) {
  if (total <= 1) return '';
  let prev = '', next = '';
  if (cur > 1) {
    const href = cur === 2 ? `${base}index.html` : `${base}page/${cur - 1}.html`;
    prev = `<a class="page-btn" href="${href}">← 上一页</a>`;
  }
  if (cur < total) {
    const href = `${base}page/${cur + 1}.html`;
    next = `<a class="page-btn" href="${href}">下一页 →</a>`;
  }
  return `<nav class="pagination">
    ${prev}
    <span class="page-info">第 ${cur} / ${total} 页</span>
    ${next}
  </nav>`;
}

function relatedPosts(post, all, base) {
  const scored = all
    .filter((p) => p.slug !== post.slug)
    .map((p) => {
      const shared = p.tags.filter((t) => post.tags.includes(t)).length;
      return { p, shared };
    })
    .sort((a, b) => b.shared - a.shared || b.p.date.getTime() - a.p.date.getTime());
  const top = scored.filter((x) => x.shared > 0).slice(0, 3);
  const fill = scored.filter((x) => x.shared === 0).slice(0, 3 - top.length);
  const list = [...top, ...fill].map((x) => x.p);
  if (!list.length) return '';
  const items = list.map((p) => `<li><a href="${base}posts/${p.slug}.html">${esc(p.title)}</a>
    <span class="muted"> · ${p.dateStr}</span></li>`).join('');
  return `<aside class="related">
    <h3>相关文章</h3>
    <ul>${items}</ul>
  </aside>`;
}

// ---------- 各页面 ----------
function buildIndex(posts) {
  const total = Math.max(1, Math.ceil(posts.length / SITE.perPage));
  for (let page = 1; page <= total; page++) {
    const slice = posts.slice((page - 1) * SITE.perPage, page * SITE.perPage);
    const cards = slice.map((p) => postCard(p, '')).join('');
    const body = `<div class="page-head">
  <h1>最新文章</h1>
  <p class="muted">共 ${posts.length} 篇文章</p>
</div>
${cards || '<p>暂无文章。</p>'}
${pagination(page, total, '')}`;
    const html = layout({ title: page === 1 ? '首页' : `第 ${page} 页`, body, active: 'home' });
    const out = page === 1
      ? path.join(OUT_DIR, 'index.html')
      : path.join(OUT_DIR, 'page', `${page}.html`);
    fs.writeFileSync(out, html);
  }
}

function buildPost(post, all) {
  const tags = post.tags.map((t) =>
    `<a class="tag" href="${tagUrl(t, '../')}">${esc(t)}</a>`).join('');
  const body = `<article class="post">
  <header class="post-header">
    <h1>${esc(post.title)}</h1>
    <div class="post-meta">
      <time>${post.dateStr}</time>
      <span class="dot">·</span>
      <span>${post.reading} 分钟阅读</span>
    </div>
    <div class="tags">${tags}</div>
  </header>
  <div class="post-content">
${post.html}
  </div>
  ${relatedPosts(post, all, '../')}
  <p class="back"><a href="../index.html">← 返回文章列表</a></p>
</article>`;
  const html = layout({
    title: post.title,
    body,
    base: '../',
    active: 'home',
  });
  fs.writeFileSync(path.join(OUT_DIR, 'posts', `${post.slug}.html`), html);
}

function buildTags(posts) {
  const map = {};
  posts.forEach((p) => p.tags.forEach((t) => { map[t] = (map[t] || 0) + 1; }));
  const tags = Object.keys(map).sort((a, b) => map[b] - map[a] || a.localeCompare(b));
  const items = tags.map((t) =>
    `<a class="tag tag-lg" href="${tagUrl(t, '')}">${esc(t)} <span class="count">${map[t]}</span></a>`).join('');
  const body = `<div class="page-head"><h1>标签总览</h1>
    <p class="muted">共 ${tags.length} 个标签</p></div>
    <div class="tag-cloud">${items || '<p>暂无标签。</p>'}</div>`;
  fs.writeFileSync(path.join(OUT_DIR, 'tags', 'index.html'),
    layout({ title: '标签', body, active: 'tags' }));

  // 每个标签一个筛选页
  tags.forEach((tag) => {
    const list = posts.filter((p) => p.tags.includes(tag));
    const cards = list.map((p) => postCard(p, '../')).join('');
    const body = `<div class="page-head"><h1>标签：${esc(tag)}</h1>
      <p class="muted">${list.length} 篇文章</p></div>
      ${cards}
      <p class="back"><a href="../tags/index.html">← 返回标签总览</a></p>`;
    fs.writeFileSync(path.join(OUT_DIR, 'tags', `${tagSlug(tag)}.html`),
      layout({ title: `标签 ${tag}`, body, base: '../', active: 'tags' }));
  });
}

function buildAbout() {
  let html = '<p>博主暂未填写关于页内容。</p>';
  if (fs.existsSync(ABOUT_FILE)) {
    const raw = fs.readFileSync(ABOUT_FILE, 'utf8');
    html = md.render(matter(raw).content);
  }
  const body = `<div class="page-head"><h1>关于</h1></div>
  <div class="post-content about">${html}</div>`;
  fs.writeFileSync(path.join(OUT_DIR, 'about.html'),
    layout({ title: '关于', body, active: 'about' }));
}

function buildSearch(posts) {
  const index = posts.map((p) => ({
    title: p.title,
    url: `posts/${p.slug}.html`,
    tags: p.tags,
    summary: p.summary,
    text: p.text,
  }));
  fs.writeFileSync(path.join(ASSETS_DIR, 'search-index.json'), JSON.stringify(index));
  const body = `<div class="page-head"><h1>搜索</h1></div>
  <div class="search-box">
    <input id="q" type="search" placeholder="输入关键词，按标题或内容检索…" autofocus>
    <p class="muted" id="hint">共 ${posts.length} 篇可检索文章</p>
  </div>
  <div id="results" class="search-results"></div>`;
  fs.writeFileSync(path.join(OUT_DIR, 'search.html'),
    layout({ title: '搜索', body, active: 'search',
      extraHead: '<script>window.__SEARCH__ = true;</script>' }));
}

// ---------- 资源 ----------
function buildAssets() {
  const candidates = [
    path.join(ROOT, 'node_modules', 'highlight.js', 'styles', 'github-dark.css'),
    '/Users/test/.workbuddy/binaries/node/workspace/node_modules/highlight.js/styles/github-dark.css',
    (() => { try { return path.join(path.dirname(require.resolve('highlight.js/package.json')), 'styles', 'github-dark.css'); } catch (e) { return ''; } })(),
  ].filter(Boolean);
  const themePath = candidates.find((p) => { try { return fs.existsSync(p); } catch (e) { return false; } });
  if (!themePath) throw new Error('找不到 highlight.js 主题文件，请确认依赖已安装');
  const hljsTheme = fs.readFileSync(themePath, 'utf8'); // 作用于 .hljs 容器与 .hljs-* 令牌
  const css = BASE_CSS + '\n/* highlight.js github-dark */\n' + hljsTheme;
  fs.writeFileSync(path.join(ASSETS_DIR, 'style.css'), css);
  fs.writeFileSync(path.join(ASSETS_DIR, 'main.js'), MAIN_JS);
}

const BASE_CSS = `:root{
  --bg:#fbfbfa; --surface:#ffffff; --text:#23272e; --muted:#8a909a;
  --accent:#3b6ef5; --accent-soft:#eaf0ff; --border:#ececf0; --radius:12px;
  --maxw:760px;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
  line-height:1.7;font-size:16px;}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
.container{max-width:var(--maxw);margin:0 auto;padding:0 20px}
.site-header{position:sticky;top:0;z-index:10;background:rgba(255,255,255,.85);
  backdrop-filter:saturate(180%) blur(10px);border-bottom:1px solid var(--border)}
.nav{display:flex;align-items:center;gap:18px;height:58px}
.brand{font-weight:700;font-size:18px;color:var(--text);margin-right:auto}
.nav-links{display:flex;gap:18px}
.nav-links a{color:var(--muted);font-size:15px}
.nav-links a.active,.nav-links a:hover{color:var(--accent);text-decoration:none}
.nav-toggle{display:none;background:none;border:0;font-size:22px;cursor:pointer;color:var(--text)}
.main{padding:36px 20px 64px;min-height:60vh}
.site-footer{border-top:1px solid var(--border);padding:28px 0;color:var(--muted);font-size:14px;text-align:center}
.site-footer .muted{margin:4px 0 0}
.muted{color:var(--muted)}
.dot{margin:0 8px;color:var(--muted)}

.page-head{margin-bottom:24px}
.page-head h1{font-size:26px;margin:0 0 4px}

.post-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);
  padding:20px 22px;margin-bottom:16px;transition:box-shadow .2s,transform .2s}
.post-card:hover{box-shadow:0 6px 22px rgba(30,40,80,.08);transform:translateY(-2px)}
.post-title{font-size:20px;margin:0 0 8px;line-height:1.4}
.post-title a{color:var(--text)}
.post-meta{color:var(--muted);font-size:14px;margin-bottom:10px}
.post-summary{margin:0 0 14px;color:#4a505a}
.tags{display:flex;flex-wrap:wrap;gap:8px}
.tag{display:inline-block;background:var(--accent-soft);color:var(--accent);
  font-size:13px;padding:3px 10px;border-radius:999px}
.tag:hover{text-decoration:none;filter:brightness(.97)}
.tag-lg{font-size:15px;padding:6px 14px}
.tag .count{opacity:.7;font-size:12px}
.tag-cloud{display:flex;flex-wrap:wrap;gap:12px}

.pagination{display:flex;align-items:center;justify-content:space-between;margin-top:28px}
.page-btn{background:var(--surface);border:1px solid var(--border);border-radius:999px;
  padding:8px 16px;color:var(--text);font-size:14px}
.page-btn:hover{text-decoration:none;border-color:var(--accent);color:var(--accent)}
.page-info{color:var(--muted);font-size:14px}

.post{max-width:var(--maxw)}
.post-header{margin-bottom:28px;border-bottom:1px solid var(--border);padding-bottom:20px}
.post-header h1{font-size:30px;margin:0 0 10px;line-height:1.3}
.post-content{font-size:17px;line-height:1.85}
.post-content h2{font-size:24px;margin:36px 0 14px;padding-top:6px}
.post-content h3{font-size:20px;margin:28px 0 12px}
.post-content p{margin:14px 0}
.post-content img{max-width:100%;border-radius:8px;display:block;margin:18px 0}
.post-content blockquote{margin:18px 0;padding:10px 18px;border-left:4px solid var(--accent);
  background:var(--accent-soft);color:#3a4250;border-radius:0 8px 8px 0}
.post-content ul,.post-content ol{padding-left:24px;margin:14px 0}
.post-content li{margin:6px 0}
.post-content table{border-collapse:collapse;width:100%;margin:18px 0;font-size:15px}
.post-content th,.post-content td{border:1px solid var(--border);padding:9px 12px;text-align:left}
.post-content th{background:var(--accent-soft);font-weight:600}
.post-content pre.hljs{padding:16px 18px;border-radius:10px;overflow:auto;font-size:14px;line-height:1.6;margin:18px 0}
.post-content pre.hljs code{font-family:"SFMono-Regular",Consolas,"Liberation Mono",Menlo,monospace;background:none;padding:0}
.post-content :not(pre) > code{background:#f1f2f4;color:#c0341d;padding:2px 6px;border-radius:5px;font-size:14px;
  font-family:"SFMono-Regular",Consolas,Menlo,monospace}
.related{margin-top:40px;background:var(--surface);border:1px solid var(--border);
  border-radius:var(--radius);padding:18px 22px}
.related h3{margin:0 0 10px;font-size:18px}
.related ul{margin:0;padding-left:20px}
.related li{margin:8px 0}
.back{margin-top:28px}
.about{max-width:var(--maxw)}

.search-box input{width:100%;padding:14px 16px;font-size:16px;border:1px solid var(--border);
  border-radius:10px;background:var(--surface);color:var(--text);margin-bottom:8px}
.search-box input:focus{outline:none;border-color:var(--accent)}
.search-results{margin-top:20px}
.result-item{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);
  padding:16px 18px;margin-bottom:14px}
.result-item h3{margin:0 0 6px;font-size:18px}
.result-item .post-meta{margin-bottom:8px}
mark{background:#fff3a8;padding:0 2px;border-radius:3px}

@media (max-width:640px){
  body{font-size:15px}
  .nav-toggle{display:block}
  .nav-links{display:none;position:absolute;top:58px;left:0;right:0;flex-direction:column;
    background:var(--surface);border-bottom:1px solid var(--border);padding:10px 20px;gap:4px}
  .nav-links.open{display:flex}
  .main{padding:24px 16px 48px}
  .post-content{font-size:16px}
  .post-header h1{font-size:24px}
}`;

const MAIN_JS = `(function(){
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
    var re=new RegExp('('+kw.replace(/[.*+?^\${}()|[\]\\\\]/g,'\\\\$&')+')','gi');
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
})();`;

// ---------- 主流程 ----------
function main() {
  const posts = loadPosts();
  ensureDir(OUT_DIR);
  ensureDir(ASSETS_DIR);
  ensureDir(path.join(OUT_DIR, 'posts'));
  ensureDir(path.join(OUT_DIR, 'page'));
  ensureDir(path.join(OUT_DIR, 'tags'));
  buildAssets();
  buildIndex(posts);
  posts.forEach((p) => buildPost(p, posts));
  buildTags(posts);
  buildAbout();
  buildSearch(posts);
  console.log(`构建完成：${posts.length} 篇文章 -> public/`);
}

main();
