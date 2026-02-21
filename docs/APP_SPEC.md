# APP_SPEC.md

作成日: 2026-02-21

## 目的

海外の新作・話題プロダクトを取得し、候補を30件に固定圧縮して、
日本市場でのトレース（ローカライズ再現）可能性を自動評価し、
上位3件のトレース計画を1画面に表示する個人用ツール。
バイブコーディングで作られた海外サービスを日本で最速ローンチするための右腕。

## スコープ（やる）

- Runボタンで1回実行し、結果を1ページに表示する
- ソースは Product Hunt / Hacker News
- 正規化、URL重複排除、30件固定圧縮
- 関門判定（通過/不通過+理由）
- 採点（通過のみ、各0〜5+理由、4軸: トレース速度/日本需要/日本空白度/リスク低）
- 上位3件のトレース計画をテンプレで生成して表示
- タイトルと短い説明は英語＋日本語で併記（日本語は翻訳）

## スコープ外（やらない）

- DB保存、Sheets/Notion出力、メール送信
- X取得、スクレイピング
- ユーザー認証、決済、定期実行（cron）

## 画面要件（1ページ）

- Runボタン
- 実行中表示（ボタン無効化、スピナー等）
- エラー表示（原因が分かる短文）
- 30件一覧（英語/日本語、関門、採点、URL）
- 上位3件のMVP計画詳細

---

## 設計

### データモデル（共通フォーマット）

- id: 文字列（source + sourceId などで一意）
- source: "producthunt" | "hackernews"
- title_en: 英語タイトル
- desc_en: 英語短い説明（取得元がない場合は空文字）
- title_ja: 日本語タイトル（Claudeで生成）
- desc_ja: 日本語短い説明（Claudeで生成）
- url: 共有URL（ない場合はHacker Newsのitem URLを生成）
- tags: 文字列配列（PHのみ。取れなければ空配列）
- publishedAt: ISO文字列
- sourceScore: 数値（HNはscore、PHはnull）
- gate: { pass: boolean, reason_ja: string }
- scores: pass=true のみ
  - traceSpeed: { score: 0..5, reason_ja: string } — トレース速度
  - jpDemand: { score: 0..5, reason_ja: string } — 日本需要
  - jpGap: { score: 0..5, reason_ja: string } — 日本空白度
  - riskLow: { score: 0..5, reason_ja: string } — リスク低
- totalScore: 数値（アプリ側で算出）

### 合計点の定義（検証済み）

totalScore は次の単純合計で算出する。
totalScore = traceSpeed + jpDemand + jpGap + riskLow

### 取得方針（スクレイピング禁止に合わせる）

- Hacker News は公式のFirebase APIを利用する（認証不要）
- Product Hunt はRSSを優先する（認証不要）
  - 取得で「タグ」「公開日」をRSSから読めない場合は tags を空配列にする
  - 今日分が不足して30件に満たない場合、取得件数を増やして必ず30件に到達させる

### 30件固定の作り方（決定ルール）

1. PHとHNからそれぞれ最大N件取得（初期N=60）
2. 正規化して1配列にする
3. URLが同一のものは統合（先にHNを残し、PHはtagsをマージする、などの優先ルールを固定）
4. 圧縮スコア（rankScore）で降順に並べる
5. 上位30件を採用する
6. それでも30件未満なら、取得Nを120に増やして再実行（同一Run内で最大2段階）

rankScore は「大まかな並び替え」専用で、最終の上位3件は LLM採点後の totalScore を優先する。

### LLMの呼び出し回数（トークン最小化）

- 呼び出し1回目（30件まとめて）: 翻訳 + 関門判定 + 採点（4軸）
- アプリ側で totalScore を計算し、上位3件idを決める
- 呼び出し2回目（上位3件のみ）: トレース計画テンプレ生成

### LLM入力の制限（短い抜粋のみ）

desc_en は最大200文字に切り詰めて送る（200を超える分は捨てる）。
tags は最大8個まで送る（8を超える分は捨てる）。

---

## 実装

### 推奨構成（最小）

```text
app/
  page.tsx                # 1ページUI
  actions.ts              # Server Action（Run）
lib/
  sources/
    hackernews.ts         # HN取得
    producthunt.ts        # PH RSS取得
  normalize.ts            # 共通化 + 重複排除 + 30件固定圧縮
  llm/
    anthropic.ts          # Claude API呼び出し
    schemas.ts            # zodスキーマ（LLM JSON検証）
  scoring.ts              # totalScore算出 + top3抽出
types.ts
```
