---
title: 给博客加上多标签分类
date: 2026-09-04
tags: [前端, 教程]
summary: 一篇文章关联多个标签，并实现标签总览页与标签筛选页的完整方案。
---

# 给博客加上多标签分类

单一分类太局限，多标签才是现代博客的标配。

## 数据模型

每篇文章在 frontmatter 里声明一个标签数组：

```yaml
title: 示例文章
tags: [前端, 教程, CSS]
```

## 聚合标签

构建时统计每个标签的文章数，生成总览页：

```javascript
const map = {};
posts.forEach(p => p.tags.forEach(t => { map[t] = (map[t] || 0) + 1; }));
```

## 生成筛选页

每个标签对应一个 `tags/<encodeURIComponent(tag)>.html` 页面，列出该标签下全部文章。

## 注意事项

- URL 中的中文标签要用 `encodeURIComponent` 编码
- 标签链接要带上相对路径前缀（详情页在子目录）
- 空标签需做兜底处理

> 标签让内容之间形成网络，而不是孤立的线。
