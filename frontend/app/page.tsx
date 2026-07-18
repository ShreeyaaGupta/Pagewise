'use client'

import { useState, useRef, useEffect, Suspense } from "react";
import { useUser, useAuth } from "@clerk/nextjs";
import { SendHorizontal, Bot, Sparkles } from "lucide-react";
import { useSearchParams } from "next/navigation";

interface Source {
  title: string;
  url: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: Source[]; 
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
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/chat/history?user_id=${user.id}&document_id=${docId}`);
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
      
      if (!response.ok || !response.body) {
        throw new Error("Failed to initialize text stream from backend.");
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
            let newSources = updated[lastIndex].sources;

            if (newContent.includes("<<<SOURCES>>>")) {
              const parts = newContent.split("<<<SOURCES>>>");
              newContent = parts[0].trim(); 
              
              try {
                newSources = JSON.parse(parts[1]);
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
    } catch (err) {
      console.error(err);
      setIsThinking(false);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Error communicating with the generation server." },
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
                
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                    {msg.sources.map((source, i) => (
                      <a 
                        key={i} 
                        href={source.url} 
                        title={source.url} // Browser tooltip for URL
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center justify-center bg-gray-50 border border-gray-200 rounded-md p-1.5 hover:bg-gray-100 hover:border-gray-300 transition shadow-sm"
                      >
                        <img 
                          src={`https://www.google.com/s2/favicons?domain=${new URL(source.url).hostname}&sz=32`} 
                          alt="source favicon" 
                          className="w-4 h-4 rounded-sm flex-shrink-0"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71'%3E%3C/path%3E%3Cpath d='M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'%3E%3C/path%3E%3C/svg%3E";
                          }}
                        />
                      </a>
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