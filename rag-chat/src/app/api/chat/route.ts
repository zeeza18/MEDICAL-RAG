import { NextRequest } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REQUIRED_ENV_KEYS = [
  "OPENAI_API_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY"
] as const;

type EnvKey = (typeof REQUIRED_ENV_KEYS)[number];

type RetrievedChunk = {
  id?: number | string;
  doc_id?: string;
  chunk_index?: number;
  content?: string;
  metadata?: Record<string, unknown> | null;
  similarity?: number;
};

const STOPWORDS = new Set([
  'what',
  'which',
  'where',
  'when',
  'who',
  'whom',
  'whose',
  'why',
  'how',
  'about',
  'into',
  'from',
  'their',
  'there',
  'this',
  'that',
  'with',
  'will',
  'would',
  'could',
  'should',
  'have',
  'has',
  'had',
  'does',
  'did',
  'been',
  'being',
  'also',
  'such',
  'than',
  'then',
  'into',
  'over',
  'under',
  'between',
  'among',
  'across',
  'your',
  'yours',
  'ours',
  'very',
  'more',
  'less',
  'most',
  'some',
  'any',
  'each',
  'many',
  'much'
]);

type SourcePayload = {
  id: number | string;
  order: number;
  docId: string | null;
  chunkIndex: number | null;
  page: number | string | null;
  similarity: number | null;
  content: string;
  preview: string;
  metadata: Record<string, unknown>;
};

const sanitizeText = (value: string, limit = 1200) => {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
};

const buildMissingEnvResponse = (missing: EnvKey[]) =>
  new Response(
    JSON.stringify({
      error: `Missing required environment variables: ${missing.join(", ")}`
    }),
    {
      status: 500,
      headers: { "content-type": "application/json" }
    }
  );

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const message = (body?.message ?? "").toString().trim();

    if (!message) {
      return new Response(JSON.stringify({ error: "Empty query" }), {
        status: 400,
        headers: { "content-type": "application/json" }
      });
    }

    const missing = REQUIRED_ENV_KEYS.filter((key) => !process.env[key]);
    if (missing.length) {
      console.error("/api/chat missing env", missing);
      return buildMissingEnvResponse(missing);
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: message
    });
    const queryEmbedding = embeddingResponse.data[0].embedding;

    const { data: rawChunks, error } = await supabase.rpc("match_documents", {
      query_embedding: queryEmbedding,
      match_count: 8,
      filter: { source: "human-nutrition-text.pdf" }
    });

    if (error) {
      throw error;
    }

    const sources: SourcePayload[] =
      (rawChunks as RetrievedChunk[] | null | undefined)?.map((chunk, index) => {
        const id = chunk?.id ?? `${chunk?.doc_id ?? "doc"}-${chunk?.chunk_index ?? index}`;
        const metadata =
          chunk?.metadata && typeof chunk.metadata === "object"
            ? (chunk.metadata as Record<string, unknown>)
            : {};
        const rawPage = metadata["page"];
        const page =
          typeof rawPage === "number" || typeof rawPage === "string" ? rawPage : null;
        const content = sanitizeText(chunk?.content ?? "");
        return {
          id,
          order: index + 1,
          docId: chunk?.doc_id ?? null,
          chunkIndex: chunk?.chunk_index ?? null,
          page,
          similarity: typeof chunk?.similarity === "number" ? chunk.similarity : null,
          content,
          preview: content.length > 260 ? `${content.slice(0, 240)}...` : content,
          metadata,
        } satisfies SourcePayload;
      }) ?? [];

    if (!sources.length) {
      return new Response(
        JSON.stringify({
          answer:
            "I couldn't find this in the provided document. Try rephrasing or asking about a different section.",
          sources: []
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    const keywords = message
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .map((token) => token.trim())
      .filter((token) => token.length > 2 && !STOPWORDS.has(token));

    const rerankedSources = sources
      .map((source) => {
        const haystack = source.content.toLowerCase();
        const keywordHits = keywords.reduce((acc, keyword) => (haystack.includes(keyword) ? acc + 1 : acc), 0);
        const similarity = source.similarity ?? 0;
        const keywordScore = keywords.length ? keywordHits / keywords.length : keywordHits > 0 ? 1 : 0;
        const score = similarity + keywordScore * 0.35;
        return { source, score, keywordHits };
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.keywordHits !== a.keywordHits) return b.keywordHits - a.keywordHits;
        return (b.source.similarity ?? 0) - (a.source.similarity ?? 0);
      })
      .map((entry, index) => ({
        ...entry.source,
        order: index + 1,
      }));

    const finalSources = rerankedSources.slice(0, Math.min(6, rerankedSources.length));
    const contextSources = finalSources.length ? finalSources : sources;

    const context = contextSources
      .map((source) => `[${source.order}] (page ${source.page ?? "?"}) ${source.content}`)
      .join("\n\n");
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: [
            "You are a strict Retrieval-Augmented Generation assistant.",
            "Respond ONLY with facts pulled from the provided CONTEXT.",
            "Each claim that uses the context MUST cite the relevant snippet using square brackets like [1] or [2].",
            "Include page numbers when available (format: p. X).",
            "If the answer is absent from the context, reply with: 'I couldn't find this in the provided document.'"
          ].join(" ")
        },
        {
          role: "user",
          content: `QUESTION: ${message}\n\nCONTEXT:\n${context}`
        }
      ]
    });

    const answer = completion.choices[0]?.message?.content?.trim() ?? "";

    return new Response(
      JSON.stringify({
        answer,
        sources: contextSources
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("/api/chat error", err);
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: { "content-type": "application/json" }
      }
    );
}
}
