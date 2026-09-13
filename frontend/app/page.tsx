'use client'

import { useState, useRef, useEffect, Suspense } from "react";
import { useUser, useAuth } from "@clerk/nextjs";
import { SendHorizontal, Bot, Sparkles, FileText } from "lucide-react";
import { useSearchParams } from "next/navigation";

interface DocSource {
  filename: string;
  page_number?: number | null;
  snippet?: string;
}

interface SourcesPayload {
  documents?: DocSource[];
}

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: SourcesPayload; 
}

function ChatInterface() {
  // Added isLoaded to prevent layout flash during authentication check
  const { isSignedIn, user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isThinking, setIsThinking] = useState(false);

  const searchParams = useSearchParams();
  const docId = searchParams.get("docId");
  const docName = searchParams.get("docName");

  useEffect(() => {
    let isMounted = true;

    const fetchHistory = async () => {
      if (!user?.id) return;
      
      if (docId) {
        try {
          const token = await getToken();
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/chat/history?document_id=${docId}`, {
            headers: {
              "Authorization": `Bearer ${token}`
            }
          });
          if (res.ok) {
            const data = await res.json();
            if (isMounted) setMessages(data);
          }
        } catch (err) {
          console.error("Error loading chat history:", err);
        }
      }
    };

    // Only fetch if authenticated. Depending on user?.id prevents mid-stream wipes.
    if (isSignedIn && user?.id) {
      setMessages([]);
      fetchHistory();
    } else if (isMounted) {
      setMessages([]);
    }

    return () => { isMounted = false; };
  }, [isSignedIn, user?.id, docId]); 

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isGenerating) return;

    const userMessage = input.trim();
    setInput("");
    setIsGenerating(true);
    setIsThinking(true);

    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);

    try {
      const token = await getToken();

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}` 
        },
        body: JSON.stringify({
          query: userMessage,
          top_k: 3,
          user_id: user?.id,
          document_id: docId || undefined, 
        }),
      });
      
      if (!response.ok) {
        let errMessage = `Server error (${response.status})`;
        try {
          const errData = await response.json();
          if (typeof errData.detail === "string") {
            errMessage = errData.detail;
          } else if (Array.isArray(errData.detail)) {
            errMessage = errData.detail.map((d: any) => d.msg || JSON.stringify(d)).join(", ");
          } else if (errData.detail) {
            errMessage = JSON.stringify(errData.detail);
          }
        } catch {
          const rawText = await response.text().catch(() => "");
          if (rawText) errMessage = rawText;
        }
        throw new Error(errMessage);
      }

      if (!response.body) {
        throw new Error("Empty response body from server.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let isFirstChunk = true;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunkText = decoder.decode(value, { stream: true });

        if (isFirstChunk) {
          isFirstChunk = false;
          setIsThinking(false);
          setMessages((prev) => [...prev, { role: "assistant", content: chunkText }]);
        } else {
          setMessages((prev) => {
            const updated = [...prev];
            const lastIndex = updated.length - 1;
            let newContent = updated[lastIndex].content + chunkText;
            let newSources: SourcesPayload | undefined = updated[lastIndex].sources;

            if (newContent.includes("<<<SOURCES>>>")) {
              const parts = newContent.split("<<<SOURCES>>>");
              newContent = parts[0].trim(); 
              
              try {
                const parsed = JSON.parse(parts[1]);
                newSources = parsed;
              } catch (e) {
                // Ignore parsing errors during stream
              }
            }

            updated[lastIndex] = {
              ...updated[lastIndex],
              content: newContent,
              sources: newSources,
            };
            return updated;
          });
        }
      }
    } catch (err: any) {
      console.error(err);
      setIsThinking(false);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: err?.message || "Error communicating with the generation server." },
      ]);
    } finally {
      setIsGenerating(false);
      setIsThinking(false);
    }
  };

  // Wait for Clerk to establish session state before rendering anything to prevent UI flash
  if (!isLoaded) {
    return <div className="flex-1 bg-gray-50" />;
  }

  if (!isSignedIn) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-gray-50">
        <Sparkles size={40} className="text-gray-300 mb-3" />
        <h2 className="text-xl font-bold text-gray-800 mb-1">Secure Academic Workspace</h2>
        <p className="text-sm text-gray-500 max-w-sm">
          Please sign in via the gateway sidebar to interact with your workspace documents and research archives.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">
            {docName ? `Chatting with: ${docName}` : "Your Documents, Intelligently Researched."}
          </h2>
          {docName && <p className="text-[11px] text-gray-400">Scoped Context Active</p>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 space-y-2">
            <Bot size={36} className="text-gray-300" />
            <p className="text-sm font-medium">Pagewise Ready.</p>
            <p className="text-xs text-gray-400 max-w-xs"> 
              {docId 
                ? "Ask a question to synthesize this document."
                : "Select a document from the sidebar to begin, or ask a question to search globally."}
            </p>
          </div>
        ) : (
          messages.map((msg, index) => (
            // Changed to enforce full width, center alignment of the chat area
            <div key={index} className={`flex w-full max-w-3xl mx-auto ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`w-fit max-w-full text-sm leading-relaxed ${msg.role === "user"
                  ? "bg-[#CED4DA] text-gray-900 p-4 rounded-xl"
                  : "text-gray-800 py-2 whitespace-pre-wrap"
                }`}
              >
                {msg.content || (isGenerating && index === messages.length - 1 ? "..." : "")}
                
                {msg.sources && msg.sources.documents && msg.sources.documents.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
                    {/* Local Document Citations with Page Numbers */}
                    {msg.sources.documents.map((docSource, i) => (
                      <div 
                        key={`doc-${i}`} 
                        title={docSource.snippet ? `Snippet: "${docSource.snippet}"` : docSource.filename}
                        className="flex items-center gap-1.5 bg-blue-50/90 border border-blue-200 text-blue-900 rounded-md px-2 py-1 text-xs font-medium shadow-2xs hover:bg-blue-100 transition cursor-help"
                      >
                        <FileText size={12} className="text-blue-600 flex-shrink-0" />
                        <span className="truncate max-w-[140px]">{docSource.filename}</span>
                        {docSource.page_number && (
                          <span className="bg-blue-200/80 text-blue-900 text-[10px] font-semibold px-1 py-0.2 rounded">
                            p. {docSource.page_number}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        {isThinking && (
          <div className="flex w-full max-w-3xl mx-auto animate-pulse">
            <div className="w-fit max-w-full text-sm leading-relaxed text-gray-400 py-2 flex items-center gap-2">
              <span>Pagewise is thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-white border-t border-gray-200 shadow-lg">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto flex items-center gap-2 border border-gray-200 bg-gray-50 rounded-xl p-2 focus-within:border-black transition">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isGenerating}
            placeholder={docId ? "Ask a question about this document..." : "Query your research workspace globally..."}
            className="flex-1 bg-transparent border-0 outline-none text-sm text-gray-800 px-2 py-1 placeholder-gray-400 disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={!input.trim() || isGenerating}
            className="p-2 bg-black text-white rounded-lg hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400 transition flex items-center justify-center"
          >
            <SendHorizontal size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="flex-1 bg-gray-50" />}>
      <ChatInterface />
    </Suspense>
  );
}