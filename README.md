# toylee

교보생명 상품 약관 PDF 모음과, 이 약관을 이용해 **고객용 보장 안내문**을 자동으로 만들어 주는
프로그램(`insurance_note/`)이 들어 있는 저장소입니다.

## 폴더 안내

| 경로 | 설명 |
|---|---|
| `*.pdf` | 상품별 약관 · 상품요약서 · 사업방법서 (교보평생건강보험 PLUS, 교보실속건강종신보험, 교보K-밸류업종신보험, 교보더안심치매·간병보험, 마이플랜 등) |
| `insurance_note/` | 고객정보 + 상품제안서(스캔 가능) → A4 보장 안내문 자동 작성 프로그램 |

## 빠른 시작

```bash
cd insurance_note
pip install -r requirements.txt
python3 build_index.py      # 약관 PDF 색인(처음 한 번, 1~2분)
python3 app.py              # http://127.0.0.1:5000
```

자세한 사용법은 [`insurance_note/README.md`](insurance_note/README.md) 를 참고하세요.
