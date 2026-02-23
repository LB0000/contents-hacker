import type { ScaffoldFile } from "./types";

/**
 * LP HTML + scaffold files を JSZip で ZIP 化し Blob を返す
 * JSZip は dynamic import で遅延読み込み
 */
export async function createProjectZip(
  lpHtml: string,
  scaffoldFiles: ScaffoldFile[],
  projectName: string
): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();

  const safeName = projectName.replace(/-+/g, "-").replace(/^-|-$/g, "") || "project";
  const root = zip.folder(safeName);
  if (!root) throw new Error("ZIP folder creation failed");

  // LP HTML
  root.file("lp/index.html", lpHtml);

  // Scaffold files
  for (const f of scaffoldFiles) {
    root.file(`scaffold/${f.path}`, f.content);
  }

  // README
  root.file(
    "README.md",
    `# ${projectName}

## 構成

- \`lp/index.html\` — AI生成ランディングページ（ブラウザで直接開けます）
- \`scaffold/\` — Next.js MVPスキャフォールド

## セットアップ（scaffold）

\`\`\`bash
cd scaffold
npm install
npm run dev
\`\`\`

---

> このプロジェクトは Contents Hacker のローンチパッド機能によりAI生成されました。
`
  );

  return zip.generateAsync({ type: "blob" });
}
