"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type Source = {
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

type CitationState = {
  index: number;
  anchor: { x: number; y: number };
};

const SAMPLE_PROMPTS: readonly string[] = [
  "How does the document describe water-soluble vitamins?",
  "Summarize the recommended nutrition for infants.",
  "What are the warning signs of pellagra?",
  "Explain how saliva contributes to digestion.",
];

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\$&");

const getHighlightedNodes = (snippet: string, query: string): ReactNode => {
  const keywords = Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .filter((token) => token.length > 3)
    )
  );

  if (!keywords.length) {
    return snippet;
  }

  const pattern = new RegExp(`(${keywords.map(escapeRegExp).join("|")})`, "gi");
  const segments = snippet.split(pattern);

  return segments.map((segment, index) => {
    if (index % 2 === 1) {
      return (
        <mark
          key={`highlight-${index}`}
          className="rounded-[4px] bg-indigo-500/25 px-1 text-indigo-100"
        >
          {segment}
        </mark>
      );
    }
    return <span key={`text-${index}`}>{segment}</span>;
  });
};

const renderAssistantContent = (
  text: string,
  onCitationClick: (
    event: MouseEvent<HTMLButtonElement>,
    citationNumber: number
  ) => void
): ReactNode => {
  const nodes: ReactNode[] = [];
  const regex = /\[(\d+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const citationNumber = Number(match[1]);
    nodes.push(
      <button
        key={`citation-${match.index}`}
        type="button"
        onClick={(event) => onCitationClick(event, citationNumber)}
        className="mx-0.5 inline-flex h-6 min-w-[1.6rem] items-center justify-center rounded-full border border-indigo-400/60 bg-indigo-500/10 px-2 text-xs font-semibold text-indigo-200 transition hover:border-indigo-300 hover:bg-indigo-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/40"
      >
        [{citationNumber}]
      </button>
    );
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
};

const TypingIndicator = () => (
  <div className="flex justify-start">
    <div className="flex items-center gap-1 rounded-full border border-indigo-400/40 bg-slate-800/60 px-3 py-2 text-slate-200/90">
      <span className="sr-only">Assistant is typing</span>
      <span className="typing-dot" />
      <span className="typing-dot" />
      <span className="typing-dot" />
    </div>
  </div>
);

export default function Home() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [busy, setBusy] = useState(false);
  const [activeQuery, setActiveQuery] = useState("");
  const [citationState, setCitationState] = useState<CitationState | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const toneTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const focusInput = useCallback(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  useEffect(() => {
    const updateViewport = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.style.height = "auto";
    inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 200)}px`;
  }, [input]);

  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;
    container.scrollTo({
      top: container.scrollHeight,
      behavior: messages.length <= 1 ? "auto" : "smooth",
    });
  }, [messages, busy]);

  useEffect(
    () => () => {
      if (toneTimeoutRef.current) {
        clearTimeout(toneTimeoutRef.current);
      }
    },
    []
  );

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCitationState(null);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);

  useEffect(() => {
    if (!citationState) return;
    const handleScroll = () => setCitationState(null);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [citationState]);

  const ensureAudioContext = useCallback(() => {
    if (typeof window === "undefined") {
      return null;
    }
    if (audioCtxRef.current) {
      return audioCtxRef.current;
    }
    const AudioContextCtor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextCtor) {
      return null;
    }
    const context = new AudioContextCtor();
    audioCtxRef.current = context;
    return context;
  }, []);

  const playTone = useCallback(
    async (frequency: number, duration: number, volume: number) => {
      const context = ensureAudioContext();
      if (!context) {
        return;
      }
      try {
        if (context.state === "suspended") {
          await context.resume();
        }
      } catch {
        // ignore resume errors
      }
      const now = context.currentTime;
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, now);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(volume, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      oscillator.connect(gain);
      gain.connect(context.destination);

      oscillator.start(now);
      oscillator.stop(now + duration);
    },
    [ensureAudioContext]
  );

  const playTypingCue = useCallback(() => {
    void playTone(760, 0.14, 0.045);
  }, [playTone]);

  const playAnswerCue = useCallback(() => {
    void playTone(420, 0.2, 0.055);
    if (toneTimeoutRef.current) {
      clearTimeout(toneTimeoutRef.current);
    }
    toneTimeoutRef.current = window.setTimeout(() => {
      void playTone(640, 0.14, 0.04);
    }, 110);
  }, [playTone]);

  const handleCitationClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>, citationNumber: number) => {
      event.stopPropagation();
      const sourceIndex = citationNumber - 1;
      if (!sources[sourceIndex]) {
        return;
      }
      const rect = event.currentTarget.getBoundingClientRect();
      setCitationState((prev) => {
        if (prev && prev.index === sourceIndex) {
          return null;
        }
        return {
          index: sourceIndex,
          anchor: {
            x: rect.left + rect.width / 2,
            y: rect.bottom + 16,
          },
        };
      });
    },
    [sources]
  );

  const send = useCallback(async () => {
    if (!input.trim() || busy) {
      return;
    }
    const question = input.trim();
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setInput("");
    focusInput();
    setBusy(true);
    setActiveQuery(question);
    setCitationState(null);
    setSources([]);
    playTypingCue();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error ?? "Unable to generate a response.");
      }

      const normalizedSources: Source[] = Array.isArray(data?.sources)
        ? data.sources
            .map((raw: unknown, index: number) => {
              if (!raw || typeof raw !== "object") {
                return null;
              }
              const record = raw as Record<string, unknown>;
              const metadataRaw = record["metadata"];
              const metadata =
                metadataRaw && typeof metadataRaw === "object" && !Array.isArray(metadataRaw)
                  ? (metadataRaw as Record<string, unknown>)
                  : {} as Record<string, unknown>;
              const contentRaw = record["content"];
              const rawText = typeof contentRaw === "string" ? contentRaw : "";
              const content = rawText.replace(/\s+/g, " ").trim();
              const previewRaw = record["preview"];
              const preview =
                typeof previewRaw === "string" && previewRaw
                  ? previewRaw
                  : content.slice(0, 220);
              const orderRaw = record["order"];
              const orderValue =
                typeof orderRaw === "number" && orderRaw > 0
                  ? orderRaw
                  : index + 1;
              const pageCandidate = record["page"] ?? metadata["page"];
              const page =
                typeof pageCandidate === "number" || typeof pageCandidate === "string"
                  ? pageCandidate
                  : null;
              const similarityRaw = record["similarity"];
              const similarity =
                typeof similarityRaw === "number" ? similarityRaw : null;
              const idRaw = record["id"];
              const id =
                typeof idRaw === "string" || typeof idRaw === "number"
                  ? idRaw
                  : typeof crypto !== "undefined" && crypto.randomUUID
                    ? crypto.randomUUID()
                    : `${Date.now()}-${Math.random()}`;
              const docIdRaw = record["docId"];
              const docIdLegacy = record["doc_id"];
              const docId =
                typeof docIdRaw === "string" && docIdRaw.length > 0
                  ? docIdRaw
                  : typeof docIdLegacy === "string" && docIdLegacy.length > 0
                    ? docIdLegacy
                    : null;
              const chunkIndexRaw = record["chunkIndex"];
              const chunkIndexLegacy = record["chunk_index"];
              const chunkIndex =
                typeof chunkIndexRaw === "number"
                  ? chunkIndexRaw
                  : typeof chunkIndexLegacy === "number"
                    ? chunkIndexLegacy
                    : null;
              return {
                id,
                order: orderValue,
                docId,
                chunkIndex,
                page,
                similarity,
                content,
                preview,
                metadata,
              } satisfies Source;
            })
            .filter((source): source is Source => Boolean(source))
            .sort((a, b) => a.order - b.order)
        : [];

      const answerText =
        typeof data?.answer === "string" ? data.answer.trim() : "";

      setSources(normalizedSources);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            answerText ||
            "I couldn't find this in the provided document. Try asking in a different way.",
        },
      ]);
      playAnswerCue();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Something went wrong while generating a response.";
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Warning: ${message}. Please confirm your API credentials and try again.`,
        },
      ]);
      playAnswerCue();
    } finally {
      setBusy(false);
    }
  }, [input, busy, focusInput, playTypingCue, playAnswerCue]);

  const activeSource = useMemo(
    () => (citationState ? sources[citationState.index] ?? null : null),
    [citationState, sources]
  );

  const popoverPosition = useMemo(() => {
    if (!citationState) {
      return null;
    }
    const width = viewport.width;
    const height = viewport.height;
    const horizontalMargin = 160;
    const left = width
      ? Math.min(
          Math.max(citationState.anchor.x, horizontalMargin),
          width - horizontalMargin
        )
      : citationState.anchor.x;
    const topLimit = height ? height - 280 : citationState.anchor.y;
    const topBase = Math.max(90, citationState.anchor.y);
    const top = Math.min(topBase, topLimit);
    return { left, top };
  }, [citationState, viewport]);

  const highlightedSnippet = useMemo(() => {
    if (!activeSource) {
      return null;
    }
    return getHighlightedNodes(activeSource.content, activeQuery);
  }, [activeSource, activeQuery]);

  return (
    <main className="relative flex min-h-screen w-full flex-col items-center px-4 py-12 sm:py-16">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-x-0 top-0 h-[360px] bg-[radial-gradient(ellipse_at_top,_rgba(110,120,255,0.3),_transparent_70%)] blur-3xl" />
      </div>

      <section className="w-full max-w-5xl space-y-10">
        <header className="text-center space-y-4">
          <p className="text-xs uppercase tracking-[0.65em] text-slate-300/80">
            Presented by Zeeza AI Labs
          </p>
          <h1 className="text-3xl font-semibold text-slate-100 sm:text-4xl md:text-5xl">
            RAG Nutritional Chatbot: Build from Scratch
          </h1>
          <p className="mx-auto max-w-2xl text-sm text-slate-300/90 sm:text-base">
            Explore the human nutrition textbook through a Retrieval-Augmented Generation pipeline. Ask focused questions and follow the citations to see the exact supporting passages.
          </p>
        </header>

        <div className="relative overflow-hidden rounded-[32px] border border-indigo-500/25 bg-[#0b1127]/75 shadow-[0_30px_80px_rgba(5,6,18,0.65)] backdrop-blur-2xl">
          <div className="pointer-events-none absolute inset-0 opacity-70">
            <div
              className="absolute inset-0 opacity-60"
              style={{
                backgroundImage:
                  "linear-gradient(0deg, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
                backgroundSize: "26px 26px",
              }}
            />
            <div className="absolute -top-32 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-indigo-500/30 blur-[100px]" />
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/15 via-transparent to-transparent" />
          </div>

          <div className="relative flex flex-col gap-6 px-5 py-6 sm:px-8 sm:py-8">
            <div
              ref={chatContainerRef}
              className="flex min-h-[280px] max-h-[55vh] flex-col gap-4 overflow-y-auto pr-1 text-[15px] leading-relaxed sm:max-h-[60vh]"
            >
              {messages.length === 0 ? (
                <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6 rounded-3xl border border-indigo-400/20 bg-white/5 p-6 text-center text-slate-200 sm:p-10">
                  <p className="max-w-2xl text-base text-slate-300">
                    Uploads from the Vizuara RAG pipeline are live. Ask about nutrients, digestion, micronutrients, or recommendations. Citations stay tethered to Supabase chunks for quick verification.
                  </p>
                  <div className="flex flex-wrap justify-center gap-3">
                    {SAMPLE_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => {
                          setInput(prompt);
                          focusInput();
                        }}
                        className="rounded-full border border-indigo-400/40 bg-indigo-500/10 px-4 py-2 text-sm text-indigo-100 transition hover:border-indigo-300 hover:bg-indigo-500/20"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((message, index) => {
                  const isUser = message.role === "user";
                  return (
                    <div
                      key={`${message.role}-${index}-${message.content.slice(0, 12)}`}
                      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-3xl border px-4 py-3 shadow-[0_14px_40px_rgba(8,12,35,0.35)] sm:px-5 sm:py-4 ${
                          isUser
                            ? "border-indigo-400/40 bg-indigo-500/20 text-indigo-50"
                            : "border-indigo-400/20 bg-slate-900/70 text-slate-100"
                        }`}
                      >
                        {isUser
                          ? message.content
                          : renderAssistantContent(message.content, handleCitationClick)}
                      </div>
                    </div>
                  );
                })
              )}

              {busy && <TypingIndicator />}
            </div>

            <div className="space-y-4">
              <div className="flex flex-col gap-3 rounded-2xl border border-indigo-500/20 bg-white/5 p-4 sm:flex-row sm:items-end sm:gap-4 sm:p-5">
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                  placeholder="Ask about the nutrition PDF..."
                  className="w-full resize-none rounded-2xl border border-indigo-400/25 bg-slate-900/70 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-indigo-300/60 focus:ring-2 focus:ring-indigo-400/40 disabled:opacity-60"
                  disabled={busy}
                />
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={busy}
                  className="inline-flex items-center justify-center rounded-2xl border border-indigo-400/60 bg-indigo-500/20 px-5 py-3 text-sm font-semibold text-indigo-100 transition hover:bg-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy ? "Thinking..." : "Send"}
                </button>
              </div>

              {sources.length > 0 && (
                <div className="space-y-3">
                  <div className="flex flex-col gap-1 text-xs uppercase tracking-[0.4em] text-slate-400/80 sm:flex-row sm:items-center sm:justify-between">
                    <span>Source Context</span>
                    <span className="text-[10px] tracking-[0.35em] text-slate-500">
                      Tap the citations to preview highlights
                    </span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {sources.map((source) => (
                      <div
                        key={String(source.id)}
                        className="group relative flex flex-col gap-2 rounded-2xl border border-indigo-400/20 bg-slate-900/60 p-4 text-xs leading-relaxed text-slate-200 transition hover:border-indigo-300/40 hover:bg-slate-900/70"
                      >
                        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.3em] text-indigo-200">
                          <span>Source {source.order}</span>
                          <span>p. {source.page ?? "?"}</span>
                        </div>
                        <p className="text-[11px] text-slate-400">
                          sim {source.similarity !== null ? source.similarity.toFixed(3) : "—"}
                        </p>
                        <p className="text-[13px] leading-relaxed text-slate-100">
                          {getHighlightedNodes(source.preview || source.content, activeQuery)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {citationState && popoverPosition && activeSource && highlightedSnippet && (
        <>
          <button
            type="button"
            aria-label="Close citation preview"
            className="fixed inset-0 z-40 cursor-default bg-black/40 backdrop-blur-sm"
            onClick={() => setCitationState(null)}
          />
          <div
            className="fixed z-50 w-[min(90vw,420px)] -translate-x-1/2 rounded-3xl border border-indigo-400/25 bg-[#0b1028]/95 p-5 text-sm text-slate-100 shadow-[0_25px_60px_rgba(8,12,35,0.7)] backdrop-blur-xl"
            style={{ left: popoverPosition.left, top: popoverPosition.top }}
          >
            <div className="flex items-start justify-between gap-4 pb-3">
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-indigo-200">
                  Source {activeSource.order}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Page {activeSource.page ?? "?"} · sim {activeSource.similarity !== null ? activeSource.similarity.toFixed(3) : "—"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCitationState(null)}
                className="rounded-full border border-indigo-400/40 px-2 py-1 text-xs text-slate-300 transition hover:border-indigo-300 hover:text-indigo-100"
              >
                Close
              </button>
            </div>
            <div className="rounded-2xl border border-indigo-400/15 bg-slate-900/60 p-3 text-sm leading-relaxed text-slate-100">
              {highlightedSnippet}
            </div>
          </div>
        </>
      )}
    </main>
  );
}
