"use client";

import { useState } from "react";
import type { LaunchPadSpec } from "@/lib/types";
import { createProjectZip } from "@/lib/launchpad-zip";
import { X, Download, FileCode, Eye, FolderTree, Loader2 } from "lucide-react";

export function LaunchPadPanel({
  spec,
  isLoading,
  onClose,
}: {
  spec: LaunchPadSpec | null;
  isLoading: boolean;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"preview" | "files">("preview");
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (!spec) return;
    setDownloading(true);
    try {
      const blob = await createProjectZip(
        spec.lpHtml,
        spec.scaffoldFiles,
        spec.designTokens.heroHeadline.replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "project"
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `launchpad-${spec.planId}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("ZIPダウンロードに失敗しました");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-surface-base border border-border-default rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
          <h3 className="font-bold text-sm flex items-center gap-2">
            <FileCode size={16} className="text-primary-light" />
            ローンチパッド
          </h3>
          <div className="flex items-center gap-2">
            {spec && (
              <>
                <button
                  onClick={() => setActiveTab("preview")}
                  className={`text-xs px-2 py-1 rounded cursor-pointer transition-colors ${
                    activeTab === "preview" ? "bg-primary text-white" : "bg-surface-overlay text-text-secondary hover:bg-surface-hover"
                  }`}
                >
                  <Eye size={12} className="inline mr-1" />
                  プレビュー
                </button>
                <button
                  onClick={() => setActiveTab("files")}
                  className={`text-xs px-2 py-1 rounded cursor-pointer transition-colors ${
                    activeTab === "files" ? "bg-primary text-white" : "bg-surface-overlay text-text-secondary hover:bg-surface-hover"
                  }`}
                >
                  <FolderTree size={12} className="inline mr-1" />
                  ファイル
                </button>
                <button
                  onClick={handleDownload}
                  disabled={downloading}
                  className="text-xs px-3 py-1 rounded bg-cta hover:bg-cta-hover text-white cursor-pointer transition-colors flex items-center gap-1 disabled:opacity-50"
                >
                  {downloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                  ZIP
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-surface-hover text-text-muted cursor-pointer transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto">
          {isLoading && (
            <div className="flex flex-col items-center justify-center h-64 gap-3">
              <Loader2 size={32} className="animate-spin text-primary-light" />
              <div className="text-sm text-text-secondary">LP + スキャフォールド生成中...</div>
              <div className="text-[10px] text-text-muted">3段階の生成を実行しています（通常20〜40秒）</div>
            </div>
          )}

          {!isLoading && spec && activeTab === "preview" && (
            <div className="p-4">
              {/* Design Tokens Summary */}
              <div className="flex gap-3 mb-3 text-[10px] text-text-muted flex-wrap">
                <span className="flex items-center gap-1">
                  <span
                    className="w-3 h-3 rounded-full border border-border-default"
                    style={{ backgroundColor: spec.designTokens.primaryColor }}
                  />
                  {spec.designTokens.primaryColor}
                </span>
                <span>{spec.designTokens.fontFamily}</span>
                <span>{spec.scaffoldFiles.length} scaffold files</span>
              </div>

              {/* iframe Preview */}
              <div className="border border-border-default rounded-lg overflow-hidden bg-white">
                <iframe
                  srcDoc={spec.lpHtml}
                  sandbox=""
                  title="LP Preview"
                  className="w-full h-[500px]"
                />
              </div>

              <p className="text-[10px] text-text-muted mt-2 text-center">
                * このLPはAIにより自動生成されました。実際の利用前に内容を確認してください。
              </p>
            </div>
          )}

          {!isLoading && spec && activeTab === "files" && (
            <div className="p-4 space-y-3">
              <div className="text-xs text-text-muted mb-2">
                scaffold/ ディレクトリ内のファイル一覧（{spec.scaffoldFiles.length}ファイル）
              </div>
              {spec.scaffoldFiles.map((f) => (
                <details key={f.path} className="bg-surface-raised border border-border-default rounded-lg">
                  <summary className="px-3 py-2 cursor-pointer text-xs font-mono text-primary-light hover:bg-surface-hover transition-colors">
                    {f.path}
                  </summary>
                  <pre className="px-3 py-2 text-[10px] text-text-secondary overflow-x-auto border-t border-border-default/50 max-h-60">
                    {f.content}
                  </pre>
                </details>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
