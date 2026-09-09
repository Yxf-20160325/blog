---
title: 用 Node.js 写一个极简静态站点生成器
date: 2026-09-05
tags: [Node.js, 教程, 前端]
summary: 从零实现一个读取 Markdown 并生成 HTML 的静态博客生成器，理解其工作原理。
---

# 用 Node.js 写一个极简静态站点生成器

静态站点生成器的本质只有三步：读源文件、转换、写输出。

## 读取 Markdown

使用 `gray-matter` 解析 frontmatter，`markdown-it` 渲染正文。

```javascript
const matter = require('gray-matter');
const fs = require('fs');

const raw = fs.readFileSync('posts/a.md', 'utf8');
const { data, content } = matter(raw);
console.log(data.title, data.tags);
```

## 渲染与高亮

```javascript
const MarkdownIt = require('markdown-it');
const hljs = require('highlight.js');
const md = new MarkdownIt({
  html: true,
  highlight(str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(str, { language: lang }).value;
    }
    return '';
  }
});
```

## 写出页面

遍历文章数组，套用布局模板，写入 `public/` 目录即可。

| 步骤 | 输入 | 输出 |
| --- | --- | --- |
| 解析 | `posts/*.md` | 文章对象数组 |
| 渲染 | 文章对象 | HTML 字符串 |
| 发布 | HTML 字符串 | `public/*.html` |

整个过程无需数据库，部署到任意静态托管即可。
