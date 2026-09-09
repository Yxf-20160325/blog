---
title: 纯前端实现博客全文搜索
date: 2026-09-03
tags: [前端, Node.js]
summary: 不依赖后端，用一份 JSON 索引加几十行 JS 完成标题与内容关键词检索。
---

# 纯前端实现博客全文搜索

静态站点没有后端，但搜索依然可以纯前端完成。

## 生成索引

构建时把每篇文章的标题、摘要、纯文本导出为 `search-index.json`：

```javascript
const index = posts.map(p => ({
  title: p.title,
  url: `posts/${p.slug}.html`,
  tags: p.tags,
  summary: p.summary,
  text: plainText(p.content)
}));
```

## 客户端检索

搜索页读取 JSON，按关键词过滤并高亮：

```javascript
const kw = input.toLowerCase();
const res = data.filter(p =>
  p.title.toLowerCase().includes(kw) ||
  p.text.toLowerCase().includes(kw)
);
```

## 小技巧

- 把 Markdown 先转成纯文本再入库，避免匹配到语法符号
- 用 `<mark>` 高亮命中关键词
- 输入即搜，无需回车

| 方案 | 优点 | 缺点 |
| --- | --- | --- |
| 纯前端 | 零后端、易部署 | 全量索引下发 |
| 服务端 | 可扩展 | 需运行环境 |

对于个人博客，纯前端方案完全够用。
