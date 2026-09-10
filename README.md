# 在线刷题网站

单页刷题应用：开始做题 → 逐题作答 → 选择后显示答案 → 上一题 / 下一题切换（切换后默认不展示答案）。

## 快速开始

```bash
# 启动本地服务（需要 HTTP 服务才能加载 JSON）
python -m http.server 8080
```

浏览器打开 http://localhost:8080

## 从 PDF 导入题库

1. 将 PDF 文件放入 `source/` 目录
2. 安装依赖并运行解析脚本：

```bash
pip install pymupdf
python scripts/pdf_to_questions.py
```

3. 刷新页面即可使用新题库

### PDF 格式要求

每道题建议按以下格式排版：

```
1. 题干内容
A. 选项A
B. 选项B
C. 选项C
D. 选项D
答案：B
解析：这里是解析内容
```

若自动解析失败，可直接编辑 `data/questions.json`。

## 题库 JSON 格式

```json
{
  "title": "题库名称",
  "questions": [
    {
      "id": 1,
      "question": "题干",
      "options": ["选项A", "选项B", "选项C", "选项D"],
      "answer": 0,
      "explanation": "解析（可选）"
    }
  ]
}
```

`answer` 为正确选项的索引（0 = A，1 = B，以此类推）。
