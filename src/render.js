/**
 * 渲染层：Markdown -> HTML、布局与各个页面（前台 + 后台）的 HTML 构建。
 * 复用自原 build.js 的逻辑，改为返回字符串供 Express 直接发送。
 */
const MarkdownIt = require('markdown-it');
const hljs = require('highlight.js');

const SITE = {
  title: '清风博客',
  author: '清风',
  description: '一个记录开发、设计与思考的个人博客',
  perPage: 5,
};

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  highlight(str, lang) {
    let code;
    if (lang && hljs.getLanguage(lang)) {
      try { code = hljs.highlight(str, { language: lang, ignoreIllegals: true }).value; }
      catch (e) { /* ignore */ }
    } else {
      try { code = hljs.highlightAuto(str).value; } catch (e) { /* ignore */ }
    }
    if (!code) code = md.utils.escapeHtml(str);
    return '<pre class="hljs"><code>' + code + '</code></pre>\n';
  },
});

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function fmtDate(d) {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  const y = dt.getFullYear(), m = String(dt.getMonth() + 1).padStart(2, '0'), day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function readingTime(text) {
  const cjk = (text.match(/[一-龥]/g) || []).length;
  const words = (text.replace(/[一-龥]/g, ' ').match(/[A-Za-z0-9]+/g) || []).length;
  return Math.max(1, Math.ceil(cjk / 300 + words / 200));
}
function plainText(mdText) {
  return mdText
    .replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ').replace(/[#>*_~|-]/g, ' ').replace(/\s+/g, ' ').trim();
}
function tagSlug(tag) { return encodeURIComponent(tag); }
function tagUrl(tag) { return `/tag/${tagSlug(tag)}`; }
function postUrl(slug) { return `/post/${slug}`; }

function renderMarkdown(content) { return md.render(content || ''); }

// ---------- 布局 ----------
function layout({ title, body, active = '', isAdmin = false, extraHead = '' }) {
  const nav = (href, label, key) =>
    `<a href="${href}" class="${active === key ? 'active' : ''}">${label}</a>`;
  const adminLink = isAdmin
    ? `<a href="/admin">后台</a><a href="/admin/logout">登出</a>`
    : `<a href="/admin/login">登录</a>`;
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · ${esc(SITE.title)}</title>
<meta name="description" content="${esc(SITE.description)}">
<link rel="stylesheet" href="/assets/style.css">
${extraHead}
</head>
<body>
<header class="site-header">
  <div class="container nav">
    <a class="brand" href="/">${esc(SITE.title)}</a>
    <button class="nav-toggle" aria-label="菜单">☰</button>
    <nav class="nav-links">
      ${nav('/', '首页', 'home')}
      ${nav('/tags', '标签', 'tags')}
      ${nav('/about', '关于', 'about')}
      ${nav('/search', '搜索', 'search')}
      ${adminLink}
    </nav>
  </div>
</header>
<main class="container main">
${body}
</main>
<footer class="site-footer">
  <div class="container">
    <p>© ${new Date().getFullYear()} ${esc(SITE.author)} · ${esc(SITE.title)}</p>
    <p class="muted">使用 Markdown 写作 · 支持标签 / 搜索 / 响应式</p>
  </div>
</footer>
<script src="/assets/main.js"></script>
</body>
</html>`;
}

// ---------- 前台片段 ----------
function postCard(post) {
  const tags = post.tags.map((t) => `<a class="tag" href="${tagUrl(t)}">${esc(t)}</a>`).join('');
  return `<article class="post-card">
  <h2 class="post-title"><a href="${postUrl(post.slug)}">${esc(post.title)}</a></h2>
  <div class="post-meta">
    <time>${post.dateStr}</time>
    <span class="dot">·</span>
    <span>${readingTime(post.content || post.summary)} 分钟阅读</span>
  </div>
  <p class="post-summary">${esc(post.summary)}</p>
  <div class="tags">${tags}</div>
</article>`;
}

function pagination(cur, total) {
  if (total <= 1) return '';
  let prev = '', next = '';
  if (cur > 1) {
    const href = cur === 2 ? '/' : `/?page=${cur - 1}`;
    prev = `<a class="page-btn" href="${href}">← 上一页</a>`;
  }
  if (cur < total) {
    const href = `/?page=${cur + 1}`;
    next = `<a class="page-btn" href="${href}">下一页 →</a>`;
  }
  return `<nav class="pagination">${prev}
    <span class="page-info">第 ${cur} / ${total} 页</span>${next}</nav>`;
}

function relatedPosts(post, all) {
  const scored = all.filter((p) => p.slug !== post.slug)
    .map((p) => ({ p, shared: p.tags.filter((t) => post.tags.includes(t)).length }))
    .sort((a, b) => b.shared - a.shared || b.p.date - a.p.date);
  const top = scored.filter((x) => x.shared > 0).slice(0, 3);
  const fill = scored.filter((x) => x.shared === 0).slice(0, 3 - top.length);
  const list = [...top, ...fill].map((x) => x.p);
  if (!list.length) return '';
  const items = list.map((p) =>
    `<li><a href="${postUrl(p.slug)}">${esc(p.title)}</a><span class="muted"> · ${p.dateStr}</span></li>`).join('');
  return `<aside class="related"><h3>相关文章</h3><ul>${items}</ul></aside>`;
}

// ---------- 前台页面 ----------
function renderHome(posts, page, total) {
  const cards = posts.map(postCard).join('');
  const body = `<div class="page-head"><h1>最新文章</h1>
    <p class="muted">共 ${total} 篇文章</p></div>
  ${cards || '<p>暂无文章。</p>'}${pagination(page, Math.max(1, Math.ceil(total / SITE.perPage)))}`;
  return layout({ title: page === 1 ? '首页' : `第 ${page} 页`, body, active: 'home' });
}

function renderPost(post, all) {
  const tags = post.tags.map((t) => `<a class="tag" href="${tagUrl(t)}">${esc(t)}</a>`).join('');
  const body = `<article class="post">
  <header class="post-header">
    <h1>${esc(post.title)}</h1>
    <div class="post-meta"><time>${post.dateStr}</time><span class="dot">·</span>
      <span>${readingTime(post.content)} 分钟阅读</span></div>
    <div class="tags">${tags}</div>
  </header>
  <div class="post-content">${renderMarkdown(post.content)}</div>
  ${relatedPosts(post, all)}
  <p class="back"><a href="/">← 返回文章列表</a></p>
</article>`;
  return layout({ title: post.title, body, active: 'home' });
}

function renderTagsIndex(tags) {
  const items = tags.map((t) =>
    `<a class="tag tag-lg" href="${tagUrl(t.name)}">${esc(t.name)} <span class="count">${t.count}</span></a>`).join('');
  const body = `<div class="page-head"><h1>标签总览</h1>
    <p class="muted">共 ${tags.length} 个标签</p></div>
    <div class="tag-cloud">${items || '<p>暂无标签。</p>'}</div>`;
  return layout({ title: '标签', body, active: 'tags' });
}

function renderTag(tag, list) {
  const cards = list.map(postCard).join('');
  const body = `<div class="page-head"><h1>标签：${esc(tag)}</h1>
    <p class="muted">${list.length} 篇文章</p></div>
  ${cards}<p class="back"><a href="/tags">← 返回标签总览</a></p>`;
  return layout({ title: `标签 ${tag}`, body, active: 'tags' });
}

function renderAbout(html) {
  const body = `<div class="page-head"><h1>关于</h1></div>
    <div class="post-content about">${html || '<p>博主暂未填写关于页内容。</p>'}</div>`;
  return layout({ title: '关于', body, active: 'about' });
}

function renderSearch(count) {
  const body = `<div class="page-head"><h1>搜索</h1></div>
  <div class="search-box">
    <input id="q" type="search" placeholder="输入关键词，按标题或内容检索…" autofocus>
    <p class="muted" id="hint">共 ${count} 篇可检索文章</p>
  </div>
  <div id="results" class="search-results"></div>`;
  return layout({ title: '搜索', body, active: 'search',
    extraHead: '<script>window.__SEARCH__ = true;</script>' });
}

// ---------- 后台页面 ----------
const ADMIN_CSS = `<style>
.admin-wrap{max-width:880px;margin:0 auto}
.admin-bar{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px}
.admin-table{width:100%;border-collapse:collapse;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}
.admin-table th,.admin-table td{border-bottom:1px solid var(--border);padding:12px 14px;text-align:left;font-size:15px}
.admin-table th{background:var(--accent-soft);font-weight:600}
.admin-table tr:last-child td{border-bottom:0}
.btn{display:inline-block;padding:8px 16px;border-radius:8px;border:1px solid var(--accent);background:var(--accent);color:#fff;font-size:14px;cursor:pointer}
.btn:hover{text-decoration:none;filter:brightness(1.05)}
.btn.ghost{background:var(--surface);color:var(--accent)}
.btn.danger{border-color:#d9534f;background:#d9534f}
.form-row{margin-bottom:16px}
.form-row label{display:block;font-weight:600;margin-bottom:6px}
.form-row input,.form-row textarea{width:100%;padding:10px 12px;font-size:15px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-family:inherit}
.form-row textarea{min-height:280px;font-family:"SFMono-Regular",Consolas,Menlo,monospace;line-height:1.6}
.form-row .hint{color:var(--muted);font-size:13px;margin-top:4px}
.login-box{max-width:360px;margin:60px auto;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:28px}
.alert{background:#fdecea;color:#b94a48;border:1px solid #f5c6cb;padding:10px 14px;border-radius:8px;margin-bottom:16px;font-size:14px}
.tags-input::placeholder{color:var(--muted)}
</style>`;

function renderLogin(error) {
  const body = `<div class="login-box">
  <h2 style="margin-top:0">后台登录</h2>
  ${error ? `<div class="alert">${esc(error)}</div>` : ''}
  <form method="post" action="/admin/login">
    <div class="form-row"><label>密码</label>
      <input type="password" name="password" autofocus required></div>
    <button class="btn" type="submit">登录</button>
  </form>
</div>`;
  return layout({ title: '登录', body, active: '', extraHead: ADMIN_CSS });
}

function renderDashboard(posts, dbOk) {
  const rows = posts.map((p) => `<tr>
    <td><a href="${postUrl(p.slug)}">${esc(p.title)}</a></td>
    <td class="muted">${p.dateStr}</td>
    <td class="muted">${esc((p.tags || []).join(', '))}</td>
    <td>
      <a class="btn ghost" href="/admin/edit/${p.id}">编辑</a>
      <form method="post" action="/admin/posts/${p.id}/delete" style="display:inline" onsubmit="return confirm('确定删除？')">
        <button class="btn danger" type="submit">删除</button>
      </form>
    </td>
  </tr>`).join('');
  const dbNote = dbOk ? '' : `<div class="alert">当前为文件回退模式，无法保存修改。请配置 MySQL 环境变量。</div>`;
  const body = `<div class="admin-wrap">
  <div class="admin-bar"><h1 style="margin:0">文章管理</h1>
    <a class="btn" href="/admin/new">+ 新建文章</a></div>
  ${dbNote}
  <table class="admin-table"><thead><tr><th>标题</th><th>日期</th><th>标签</th><th>操作</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="4" class="muted">暂无文章</td></tr>'}</tbody></table>
</div>`;
  return layout({ title: '后台', body, active: '', isAdmin: true, extraHead: ADMIN_CSS });
}

function renderEditor(post) {
  const p = post || { title: '', date: fmtDate(new Date()), tags: [], summary: '', content: '' };
  const dateVal = post ? p.dateStr : fmtDate(new Date());
  const body = `<div class="admin-wrap">
  <div class="admin-bar"><h1 style="margin:0">${post ? '编辑文章' : '新建文章'}</h1>
    <a class="btn ghost" href="/admin">← 返回</a></div>
  <form method="post" action="${post ? `/admin/posts/${post.id}` : '/admin/posts'}">
    <div class="form-row"><label>标题</label>
      <input name="title" value="${esc(p.title)}" required></div>
    <div class="form-row"><label>日期</label>
      <input name="date" type="date" value="${esc(dateVal)}"></div>
    <div class="form-row"><label>标签（逗号分隔，可多个）</label>
      <input class="tags-input" name="tags" value="${esc((p.tags || []).join(', '))}" placeholder="Node.js, 教程"></div>
    <div class="form-row"><label>摘要</label>
      <textarea name="summary" style="min-height:70px">${esc(p.summary)}</textarea></div>
    <div class="form-row"><label>正文（Markdown）</label>
      <textarea name="content" required>${esc(p.content)}</textarea>
      <p class="hint">支持标题、列表、代码块、表格、图片、链接等 Markdown 语法。</p></div>
    <button class="btn" type="submit">保存</button>
  </form>
</div>`;
  return layout({ title: post ? '编辑文章' : '新建文章', body, active: '', isAdmin: true, extraHead: ADMIN_CSS });
}

module.exports = {
  SITE, renderMarkdown, esc, fmtDate, readingTime, plainText,
  postUrl, tagUrl, tagSlug,
  layout, postCard, pagination, relatedPosts,
  renderHome, renderPost, renderTagsIndex, renderTag, renderAbout, renderSearch,
  renderLogin, renderDashboard, renderEditor,
};
