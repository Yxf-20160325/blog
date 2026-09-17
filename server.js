/**
 * 博客服务器（Express）：前台从 MySQL 动态渲染，后台带登录鉴权。
 * 启动：npm start  （端口取 process.env.PORT，默认 4000）
 *
 * 环境变量（Railway 中配置，切勿提交到仓库）：
 *   ADMIN_PASSWORD   后台登录密码
 *   SESSION_SECRET   会话签名密钥（可选，未设置则每次启动随机）
 *   MYSQLHOST/MYSQLPORT/MYSQLUSER/MYSQLPASSWORD/MYSQLDATABASE  Railway MySQL 自动注入
 */
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const matter = require('gray-matter');
const fs = require('fs');

const data = require('./src/data');
const R = require('./src/render');

const app = express();
app.set('trust proxy', true);
app.use(express.urlencoded({ extended: true }));
app.use('/assets', express.static(path.join(__dirname, 'public', 'assets')));

const PORT = process.env.PORT || 4000;

// ---------- 鉴权 ----------
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.ADMIN_PASSWORD) {
  console.warn('[auth] 未设置 ADMIN_PASSWORD，使用默认密码 "admin"（仅限本地开发，生产请在 Railway 配置）。');
}

const sessions = new Map(); // token -> expires(ms)

function newToken() { return crypto.randomBytes(24).toString('hex'); }
function sign(token) {
  return token + '.' + crypto.createHmac('sha256', SESSION_SECRET).update(token).digest('hex');
}
function verify(cookie) {
  if (!cookie || typeof cookie !== 'string' || !cookie.includes('.')) return false;
  const [token, mac] = cookie.split('.');
  const expect = crypto.createHmac('sha256', SESSION_SECRET).update(token).digest('hex');
  if (mac.length !== expect.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expect))) return false;
  const exp = sessions.get(token);
  if (!exp) return false;
  if (Date.now() > exp) { sessions.delete(token); return false; }
  return true;
}
function setSession(res) {
  const token = newToken();
  sessions.set(token, Date.now() + 7 * 24 * 3600 * 1000); // 7 天
  const secure = !!process.env.SESSION_SECURE || (process.env.NODE_ENV === 'production');
  res.cookie('sid', sign(token), { httpOnly: true, sameSite: 'lax', secure, maxAge: 7 * 24 * 3600 * 1000 });
}
function clearSession(res, req) {
  const c = req.cookies && req.cookies.sid;
  if (c) { const [token] = c.split('.'); sessions.delete(token); }
  res.clearCookie('sid');
}
function requireAuth(req, res, next) {
  if (verify(req.cookies && req.cookies.sid)) return next();
  return res.redirect('/admin/login');
}

// 解析 cookie（用 express 自带？express 不内置 cookie 解析，这里手动）
app.use((req, res, next) => {
  req.cookies = {};
  const raw = req.headers.cookie;
  if (raw) raw.split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) req.cookies[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  next();
});

// ---------- 前台 ----------
app.get('/', async (req, res) => {
  try {
    const posts = await data.listPosts();
    const total = posts.length;
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const slice = posts.slice((page - 1) * R.SITE.perPage, page * R.SITE.perPage);
    res.send(R.renderHome(slice, page, total));
  } catch (e) { res.status(500).send('服务器错误：' + e.message); }
});

app.get('/post/:slug', async (req, res) => {
  try {
    const post = await data.getPost(req.params.slug);
    if (!post) return res.status(404).send('文章不存在');
    const all = await data.listPosts();
    res.send(R.renderPost(post, all));
  } catch (e) { res.status(500).send('服务器错误：' + e.message); }
});

app.get('/tags', async (req, res) => {
  try { res.send(R.renderTagsIndex(await data.listTags())); }
  catch (e) { res.status(500).send('服务器错误：' + e.message); }
});

app.get('/tag/:name', async (req, res) => {
  try {
    const all = await data.listPosts();
    const name = decodeURIComponent(req.params.name);
    const list = all.filter((p) => (p.tags || []).includes(name));
    res.send(R.renderTag(name, list));
  } catch (e) { res.status(500).send('服务器错误：' + e.message); }
});

app.get('/about', (req, res) => {
  let html = '';
  const file = path.join(__dirname, 'about.md');
  if (fs.existsSync(file)) html = R.renderMarkdown(matter(fs.readFileSync(file, 'utf8')).content);
  res.send(R.renderAbout(html));
});

app.get('/search', async (req, res) => {
  try { res.send(R.renderSearch((await data.listPosts()).length)); }
  catch (e) { res.status(500).send('服务器错误：' + e.message); }
});

app.get('/search-index.json', async (req, res) => {
  try { res.json(await data.getSearchIndex()); }
  catch (e) { res.status(500).json([]); }
});

// ---------- 后台 ----------
app.get('/admin/login', (req, res) => res.send(R.renderLogin(null)));

app.post('/admin/login', (req, res) => {
  const pwd = req.body && req.body.password;
  if (!pwd || pwd !== ADMIN_PASSWORD) {
    return res.status(401).send(R.renderLogin('密码错误'));
  }
  setSession(res);
  res.redirect('/admin');
});

app.get('/admin/logout', (req, res) => { clearSession(res, req); res.redirect('/admin/login'); });

app.get('/admin', requireAuth, async (req, res) => {
  try {
    const posts = await data.listPosts();
    res.send(R.renderDashboard(posts, data.isDbConnected()));
  } catch (e) { res.status(500).send('服务器错误：' + e.message); }
});

app.get('/admin/new', requireAuth, (req, res) => res.send(R.renderEditor(null)));

app.get('/admin/edit/:id', requireAuth, async (req, res) => {
  try {
    const post = await data.getPostById(parseInt(req.params.id, 10));
    if (!post) return res.status(404).send('文章不存在');
    res.send(R.renderEditor(post));
  } catch (e) { res.status(500).send('服务器错误：' + e.message); }
});

app.post('/admin/posts', requireAuth, async (req, res) => {
  try {
    const id = await data.createPost(normalizePost(req.body));
    res.redirect('/admin');
  } catch (e) { res.status(500).send('保存失败：' + e.message); }
});

app.post('/admin/posts/:id', requireAuth, async (req, res) => {
  try {
    await data.updatePost(parseInt(req.params.id, 10), normalizePost(req.body));
    res.redirect('/admin');
  } catch (e) { res.status(500).send('保存失败：' + e.message); }
});

app.post('/admin/posts/:id/delete', requireAuth, async (req, res) => {
  try {
    await data.deletePost(parseInt(req.params.id, 10));
    res.redirect('/admin');
  } catch (e) { res.status(500).send('删除失败：' + e.message); }
});

function normalizePost(body) {
  body = body || {};
  const tags = String(body.tags || '')
    .split(',').map((t) => t.trim()).filter(Boolean);
  return {
    title: String(body.title || '').trim() || '未命名',
    date: body.date || '',
    tags,
    summary: String(body.summary || '').trim(),
    content: String(body.content || ''),
  };
}

app.use((req, res) => res.status(404).send('404 Not Found'));

// ---------- 启动 ----------
app.listen(PORT, () => {
  console.log(`博客运行中：http://localhost:${PORT}`);
});
data.initDb();

module.exports = app;
