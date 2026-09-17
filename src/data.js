/**
 * 数据层：文章读写。
 * 优先使用 MySQL（Railway 注入的环境变量）；若数据库不可用，前台读操作回退到 posts/*.md 文件，
 * 保证博客始终可访问。后台写操作依赖数据库。
 *
 * 凭据来源（切勿写死在代码里）：
 *   MYSQLHOST / MYSQLPORT / MYSQLUSER / MYSQLPASSWORD / MYSQLDATABASE
 */
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const mysql = require('mysql2/promise');

const ROOT = path.join(__dirname, '..');
const POSTS_DIR = path.join(ROOT, 'posts');

let pool = null;
let dbConnected = false;

function buildPool() {
  const host = process.env.MYSQLHOST || process.env.DB_HOST;
  const port = parseInt(process.env.MYSQLPORT || process.env.DB_PORT || '3306', 10);
  const user = process.env.MYSQLUSER || process.env.DB_USER || 'root';
  const password = process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || '';
  const database = process.env.MYSQLDATABASE || process.env.DB_NAME;
  if (!host || !database) return null;
  return mysql.createPool({
    host, port, user, password, database,
    waitForConnections: true,
    connectionLimit: 5,
    charset: 'utf8mb4',
    timezone: 'local',
  });
}

async function initDb() {
  pool = buildPool();
  if (!pool) {
    console.warn('[data] 未检测到 MySQL 环境变量，前台将使用 posts/*.md 文件回退模式。');
    return false;
  }
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS posts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      slug VARCHAR(255) NOT NULL UNIQUE,
      title VARCHAR(255) NOT NULL,
      date DATETIME NOT NULL,
      tags TEXT,
      summary TEXT,
      content LONGTEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`);
    dbConnected = true;
    await seedFromFiles();
    console.log('[data] MySQL 连接成功，文章表已就绪。');
    return true;
  } catch (e) {
    console.error('[data] MySQL 连接失败，前台回退到文件模式：', e.message);
    dbConnected = false;
    pool = null;
    return false;
  }
}

// 首次启动：把 posts/*.md 播种进库（已存在 slug 跳过）
async function seedFromFiles() {
  if (!fs.existsSync(POSTS_DIR)) return;
  const files = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md'));
  for (const f of files) {
    const raw = fs.readFileSync(path.join(POSTS_DIR, f), 'utf8');
    const { data, content } = matter(raw);
    const slug = f.replace(/\.md$/, '');
    const date = toSqlDate(data.date);
    const tags = Array.isArray(data.tags) ? data.tags : (data.tags ? [data.tags] : []);
    const summary = data.summary || '';
    try {
      await pool.query(
        `INSERT IGNORE INTO posts (slug, title, date, tags, summary, content)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [slug, data.title || slug, date, JSON.stringify(tags), summary, content]
      );
    } catch (e) { /* 忽略单条错误，继续 */ }
  }
}

// ---------- 文件回退加载 ----------
function loadFromFile() {
  if (!fs.existsSync(POSTS_DIR)) return [];
  const files = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md'));
  const posts = files.map((f) => {
    const { data, content } = matter(fs.readFileSync(path.join(POSTS_DIR, f), 'utf8'));
    const slug = f.replace(/\.md$/, '');
    const date = data.date ? new Date(data.date) : new Date();
    return {
      id: 0, slug,
      title: data.title || slug,
      date, dateStr: fmtDate(date),
      tags: Array.isArray(data.tags) ? data.tags : (data.tags ? [data.tags] : []),
      summary: data.summary || '',
      content,
    };
  });
  posts.sort((a, b) => b.date - a.date);
  return posts;
}

function fmtDate(d) {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
// 存库用确定性字符串，避免 Date -> DATETIME 的时区漂移
function toSqlDate(d) {
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d + ' 00:00:00';
  const dt = d ? new Date(d) : new Date();
  if (isNaN(dt.getTime())) return new Date().toISOString().slice(0, 19).replace('T', ' ');
  const p = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())} ${p(dt.getHours())}:${p(dt.getMinutes())}:${p(dt.getSeconds())}`;
}

// ---------- 行 -> 文章对象 ----------
function rowToPost(r) {
  const date = new Date(r.date);
  let tags = [];
  try { tags = JSON.parse(r.tags || '[]'); } catch (e) { tags = []; }
  return {
    id: r.id, slug: r.slug,
    title: r.title,
    date, dateStr: fmtDate(date),
    tags, summary: r.summary || '', content: r.content || '',
  };
}

// ---------- 读取（DB 优先，失败回退文件） ----------
async function listPosts() {
  if (pool) {
    try {
      const [rows] = await pool.query('SELECT * FROM posts ORDER BY date DESC');
      if (rows.length) return rows.map(rowToPost);
    } catch (e) { /* fallthrough */ }
  }
  return loadFromFile();
}

async function getPost(slug) {
  if (pool) {
    try {
      const [rows] = await pool.query('SELECT * FROM posts WHERE slug = ?', [slug]);
      if (rows[0]) return rowToPost(rows[0]);
    } catch (e) { /* fallthrough */ }
  }
  return loadFromFile().find((p) => p.slug === slug) || null;
}

async function listTags() {
  const posts = await listPosts();
  const map = {};
  posts.forEach((p) => p.tags.forEach((t) => { map[t] = (map[t] || 0) + 1; }));
  return Object.keys(map)
    .sort((a, b) => map[b] - map[a] || a.localeCompare(b))
    .map((t) => ({ name: t, count: map[t] }));
}

async function getPostById(id) {
  if (!pool) return null;
  try {
    const [rows] = await pool.query('SELECT * FROM posts WHERE id = ?', [id]);
    return rows[0] ? rowToPost(rows[0]) : null;
  } catch (e) { return null; }
}

async function getSearchIndex() {
  const posts = await listPosts();
  return posts.map((p) => ({
    title: p.title,
    url: `post/${p.slug}`,
    tags: p.tags,
    summary: p.summary,
    text: plainText(p.content),
  }));
}

// ---------- 写入（仅数据库） ----------
function assertDb() {
  if (!pool) throw new Error('数据库未连接，无法执行写操作');
}

async function createPost({ title, date, tags, summary, content }) {
  assertDb();
  const slug = (await uniqueSlug(title));
  const d = toSqlDate(date);
  const [r] = await pool.query(
    `INSERT INTO posts (slug, title, date, tags, summary, content) VALUES (?, ?, ?, ?, ?, ?)`,
    [slug, title, d, JSON.stringify(tags || []), summary || '', content || '']
  );
  return r.insertId;
}

async function updatePost(id, { title, date, tags, summary, content }) {
  assertDb();
  const d = toSqlDate(date);
  await pool.query(
    `UPDATE posts SET title=?, date=?, tags=?, summary=?, content=? WHERE id=?`,
    [title, d, JSON.stringify(tags || []), summary || '', content || '', id]
  );
}

async function deletePost(id) {
  assertDb();
  await pool.query('DELETE FROM posts WHERE id = ?', [id]);
}

async function uniqueSlug(title) {
  let base = (title || 'post').toString().trim().toLowerCase()
    .replace(/\s+/g, '-').replace(/[^\w一-龥-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!base) base = 'post';
  let slug = base, i = 1;
  // 检查冲突
  const exists = async (s) => {
    const [rows] = await pool.query('SELECT id FROM posts WHERE slug = ?', [s]);
    return rows.length > 0;
  };
  while (await exists(slug)) { slug = `${base}-${i++}`; }
  return slug;
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

module.exports = {
  initDb, listPosts, getPost, getPostById, listTags, getSearchIndex,
  createPost, updatePost, deletePost,
  isDbConnected: () => dbConnected,
};
