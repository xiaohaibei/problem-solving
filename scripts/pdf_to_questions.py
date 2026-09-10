#!/usr/bin/env python3
"""
从 PDF 题库提取题目，生成 data/questions.json

用法:
  1. 将 PDF 放入 source/ 目录
  2. pip install pymupdf
  3. python scripts/pdf_to_questions.py

支持格式:
  1. 题干内容
  A. 选项A  B. 选项B  C. 选项C  D. 选项D
  答案：B
  解析：...

  2. 选项内标注 (正确答案) 的格式（如养老护理员题库）:
  1. 题干 [单选题]
  A 选项A(正确答案)
  B 选项B
  ...
"""

import json
import re
import sys
from pathlib import Path
from typing import List, Optional, Tuple, Union

ROOT = Path(__file__).resolve().parent.parent
SOURCE_DIR = ROOT / "source"
OUTPUT = ROOT / "data" / "questions.json"

OPTION_RE = re.compile(r"^([A-Ea-e])(.+)$")
INLINE_OPTIONS_RE = re.compile(
    r"(?:^|\s)([A-E])(.+?)(?=(?:\s+[A-E]\S)|$)"
)
JUDGE_OPTION_RE = re.compile(r"^(正确|错误)\s*(\(\s*正\s*确\s*答\s*案\s*\))?$")
ANSWER_RE = re.compile(
    r"^(?:答案|正确答案|参考答案)\s*[：:]\s*([A-Ea-d,，、\s]+)",
    re.IGNORECASE,
)
EXPLAIN_RE = re.compile(
    r"^(?:解析|说明|解答)\s*[：:]\s*(.+)$",
    re.IGNORECASE,
)
QUESTION_START_RE = re.compile(r"^(\d+)[\.、．)]\s*(.+)$")
CORRECT_MARKER_RE = re.compile(r"\(\s*正\s*确\s*答\s*案\s*\)")
TYPE_TAG_RE = re.compile(r"\[(?:单选题|多选题|判断题)\]")
SKIP_HEADER_RE = re.compile(
    r"^(?:\(\s*答案仅供参考\s*\)|\d{4}\s*年|理论复习|竞赛|资料)$"
)


def extract_text(pdf_path: Path) -> str:
    try:
        import fitz  # pymupdf
    except ImportError:
        print("请先安装依赖: pip install pymupdf")
        sys.exit(1)

    doc = fitz.open(pdf_path)
    parts = [page.get_text() for page in doc]
    doc.close()
    return "\n".join(parts)


def clean_question(text: str) -> str:
    text = TYPE_TAG_RE.sub("", text)
    text = re.sub(r"\[\s*单\s*选\s*题\s*\]", "", text)
    text = re.sub(r"\[\s*多\s*选\s*题\s*\]", "", text)
    text = re.sub(r"\[\s*判\s*断\s*题\s*\]", "", text)
    return re.sub(r"\s+", " ", text).strip()


def parse_option_text(text: str) -> Tuple[str, bool]:
    is_correct = bool(CORRECT_MARKER_RE.search(text))
    cleaned = CORRECT_MARKER_RE.sub("", text)
    cleaned = re.sub(r"^[\.、．)\s]+", "", cleaned).strip()
    return cleaned, is_correct


def extract_inline_options(question: str) -> Tuple[str, List[str], List[int]]:
    matches = list(INLINE_OPTIONS_RE.finditer(question))
    if len(matches) < 2:
        return question, [], []

    stem = question[: matches[0].start()].strip()
    options = []
    correct_indices = []
    for idx, match in enumerate(matches):
        text_part, is_correct = parse_option_text(match.group(2).strip())
        options.append(text_part)
        if is_correct:
            correct_indices.append(idx)
    return stem, options, correct_indices


def resolve_answer(current: dict) -> Optional[Union[int, List[int]]]:
    if current.get("answer") is not None:
        return current["answer"]
    correct_indices = current.get("correct_indices", [])
    if not correct_indices:
        return None
    if len(correct_indices) == 1:
        return correct_indices[0]
    return sorted(correct_indices)


def parse_questions(text: str) -> List[dict]:
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    questions = []
    current = None

    def flush():
        nonlocal current
        if not current:
            return

        opts = current.get("options", [])
        question = clean_question(current.get("question", ""))

        if not opts:
            question, opts, inline_correct = extract_inline_options(question)
            if inline_correct and not current.get("correct_indices"):
                current["correct_indices"] = inline_correct

        answer = resolve_answer(current)

        if question and len(opts) >= 2 and answer is not None:
            item = {
                "id": len(questions) + 1,
                "question": question,
                "options": opts,
                "answer": answer,
            }
            if current.get("explanation"):
                item["explanation"] = current["explanation"]
            if current.get("type"):
                item["type"] = current["type"]
            questions.append(item)
        current = None

    for line in lines:
        if SKIP_HEADER_RE.match(line):
            continue

        qm = QUESTION_START_RE.match(line)
        if qm:
            flush()
            current = {"question": qm.group(2).strip(), "options": [], "correct_indices": []}
            if "[多选题]" in line or re.search(r"\[\s*多\s*选\s*题\s*\]", line):
                current["type"] = "multi"
            elif "[判断题]" in line or re.search(r"\[\s*判\s*断\s*题\s*\]", line):
                current["type"] = "judge"
            else:
                current["type"] = "single"
            continue

        if not current:
            continue

        om = OPTION_RE.match(line)
        if om:
            text_part, is_correct = parse_option_text(om.group(2).strip())
            idx = len(current["options"])
            current["options"].append(text_part)
            if is_correct:
                current["correct_indices"].append(idx)
            continue

        jm = JUDGE_OPTION_RE.match(line)
        if jm:
            text_part, is_correct = jm.group(1), bool(jm.group(2))
            idx = len(current["options"])
            current["options"].append(text_part)
            if is_correct:
                current["correct_indices"].append(idx)
            continue

        am = ANSWER_RE.match(line)
        if am:
            letters = re.findall(r"[A-Ea-e]", am.group(1).upper())
            indices = [ord(ch) - ord("A") for ch in letters]
            current["answer"] = indices[0] if len(indices) == 1 else indices
            continue

        em = EXPLAIN_RE.match(line)
        if em:
            current["explanation"] = em.group(1).strip()
            continue

        if not current.get("options"):
            current["question"] += " " + line
            if "[多选题]" in line:
                current["type"] = "multi"
            elif "[判断题]" in line:
                current["type"] = "judge"
        elif current.get("options"):
            idx = len(current["options"]) - 1
            combined = f"{current['options'][idx]} {line}".strip()
            cleaned, is_correct = parse_option_text(combined)
            current["options"][idx] = cleaned
            if is_correct and idx not in current["correct_indices"]:
                current["correct_indices"].append(idx)
        elif current.get("answer") is not None or current.get("correct_indices"):
            current["explanation"] = current.get("explanation", "") + " " + line

    flush()
    return questions


def find_pdf() -> Optional[Path]:
    if not SOURCE_DIR.exists():
        SOURCE_DIR.mkdir(parents=True, exist_ok=True)
        return None
    pdfs = sorted(SOURCE_DIR.glob("*.pdf"), key=lambda p: p.stat().st_mtime, reverse=True)
    return pdfs[0] if pdfs else None


def main():
    pdf = find_pdf()
    if not pdf:
        print(f"未找到 PDF，请将题库 PDF 放入: {SOURCE_DIR}")
        sys.exit(1)

    print(f"正在解析: {pdf.name}")
    text = extract_text(pdf)
    questions = parse_questions(text)

    if not questions:
        print("未能从 PDF 中识别题目，请检查格式或手动编辑 data/questions.json")
        print("--- PDF 文本预览 (前 800 字符) ---")
        print(text[:800])
        sys.exit(1)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    data = {
        "title": pdf.stem,
        "source": pdf.name,
        "questions": questions,
    }
    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"成功提取 {len(questions)} 道题，已写入 {OUTPUT}")


if __name__ == "__main__":
    main()
