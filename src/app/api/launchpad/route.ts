import OpenAI from "openai";
import { z } from "zod";
import { generateDesignSpec, generateLP, generateScaffold } from "@/lib/llm/openai";
import type { MvpPlan } from "@/lib/types";

export const maxDuration = 60;

const LaunchPadRequestSchema = z.object({
  plan: z.object({
    id: z.string(),
    title: z.string(),
    originalUrl: z.string(),
    jpTarget: z.string(),
    localization: z.string(),
    techApproach: z.string(),
    launchPlan: z.string(),
    monetization: z.string(),
  }),
});

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "OPENAI_API_KEY が未設定です" }, { status: 500 });
    }

    const body = await request.json();
    const parsed = LaunchPadRequestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "リクエストが不正です" }, { status: 400 });
    }

    const client = new OpenAI({ apiKey });
    const plan: MvpPlan = parsed.data.plan;

    // Step 1: デザイン仕様
    const design = await generateDesignSpec(client, plan);

    // Step 2: LP HTML
    const lpHtml = await generateLP(client, plan, design);

    // Step 3: スキャフォールド
    const scaffoldFiles = await generateScaffold(client, plan, design);

    return Response.json({
      spec: {
        planId: plan.id,
        designTokens: design,
        lpHtml,
        scaffoldFiles,
      },
    });
  } catch {
    return Response.json({ error: "ローンチパッド生成に失敗しました" }, { status: 500 });
  }
}
