---
title: Markdown 写作速查表
date: 2026-09-07
tags: [教程, Markdown]
summary: 一份常用 Markdown 语法清单，涵盖标题、列表、代码块、表格、图片与链接。
---

# Markdown 写作速查表

本文档覆盖本站支持的全部常用语法，方便写作时查阅。

## 标题层级

```markdown
# 一级标题
## 二级标题
### 三级标题
```

## 强调与行内代码

使用 `行内代码` 包裹短代码片段，用 **加粗** 与 *斜体* 强调文字。

## 列表

无序列表：

- 苹果
- 香蕉
  - 子项也可以缩进

有序列表：

1. 第一步
2. 第二步
3. 第三步

## 代码块（带语法高亮）

```python
def fib(n):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a

print([fib(i) for i in range(10)])
```

```bash
# 构建本站
NODE_PATH=/path/to/node_modules node build.js
```

## 表格

| 语言 | 类型 | 难度 |
| --- | --- | --- |
| JavaScript | 动态 | 低 |
| Rust | 系统 | 高 |
| Python | 动态 | 低 |

## 图片与链接

![示意图](https://picsum.photos/seed/blog/800/360)

更多语法见 [CommonMark 规范](https://commonmark.org/)。
