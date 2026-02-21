# Contents Hacker

Product Hunt と Hacker News から話題を取得し、30件に絞り込んで関門判定・採点・MVP計画を1ページで表示するWebアプリ。

## 機能

- Product Hunt / Hacker News からトピックを自動取得
- 30件に正規化・重複排除
- 関門判定（通過 / 不通過）
- 4軸採点（各0〜5点）
- 上位3件のMVP計画を生成
- タイトル・説明を日本語に翻訳して併記

## 技術スタック

- Next.js (App Router)
- Claude API（翻訳・判定・採点）
- TypeScript

## セットアップ

```bash
npm install
```

`.env.local` を作成して API キーを設定:

```
ANTHROPIC_API_KEY=sk-ant-...
```

## 開発

```bash
npm run dev
```

http://localhost:3000 を開いて「Run」ボタンを押すと実行されます。
