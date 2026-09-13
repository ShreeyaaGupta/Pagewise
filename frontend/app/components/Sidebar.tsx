'use client';

import { useState, useEffect, Suspense } from "react";
import { SignInButton, UserButton, useUser, useAuth } from "@clerk/nextjs";
import { FileText, UploadCloud, Library, Loader2, Trash2, MessageSquarePlus, AlertCircle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

interface DocumentItem {
  id: string;
  filename: string;
  s3_key: string;
  status?: "processing" | "ready" | "failed" | "empty";
  error_message?: string;
}

function SidebarContent() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { getToken } = useAuth();
  const [status, setStatus] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeDocId = searchParams.get("docId");

  const fetchDocuments = async () => {
    if (!user) return;
    try {
      const token = await getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/documents`, {
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setDocuments(data);
      }
    } catch (err) {
      console.error("Error fetching documents:", err);
    }
  };

  useEffect(() => {
    if (isSignedIn && user) {
      fetchDocuments();
    } else {
      setDocuments([]);
    }
  }, [isSignedIn, user]);

  // Polling: if any document is processing, poll every 3s until completion
  useEffect(() => {
    const hasProcessing = documents.some((doc) => doc.status === "processing");
    if (!hasProcessing || !isSignedIn || !user) return;

    const interval = setInterval(() => {
      fetchDocuments();
    }, 3000);

    return () => clearInterval(interval);
  }, [documents, isSignedIn, user]);

  const handleDelete = async (docId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this document? This will also delete its chat history.")) return;
    
    try {
      const token = await getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/documents/${docId}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });
      if (res.ok) {
        // If the deleted document was the active one, redirect to home to clear chat
        if (activeDocId === docId) router.push("/");
        fetchDocuments();
      } else {
        alert("Failed to delete document");
      }
    } catch (err) {
      console.error("Error deleting document:", err);
      alert("Error deleting document");
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile || !user) return;

    setIsUploading(true);
    setStatus("Uploading...");

    const formData = new FormData();
    formData.append("file", selectedFile);
    if (user?.id) {
      formData.append("user_id", user.id);
    }

    try {
      const token = await getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/upload`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
        },
        body: formData,
      });

      if (res.ok) {
        setStatus("Uploaded! Generating embeddings...");
        fetchDocuments(); // Refresh document list with 'processing' state
      } else {
        let errorMsg = "Upload failed";
        try {
          const error = await res.json();
          if (typeof error.detail === "string") {
            errorMsg = error.detail;
          } else if (Array.isArray(error.detail)) {
            errorMsg = error.detail.map((d: any) => d.msg || JSON.stringify(d)).join(", ");
          } else if (error.detail) {
            errorMsg = JSON.stringify(error.detail);
          } else if (error.message) {
            errorMsg = error.message;
          }
        } catch {
          errorMsg = `HTTP Error ${res.status}: ${res.statusText}`;
        }
        setStatus(`Failed: ${errorMsg}`);
      }
    } catch (err) {
      console.error(err);
      setStatus("Connection error.");
    } finally {
      setIsUploading(false);
      setTimeout(() => setStatus(""), 4000); // Clear status banner after 4s
    }
  };

  return (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col h-full">
      {/* Branding */}
      <div className="p-4 border-b border-gray-100 cursor-pointer" onClick={() => router.push('/')}>
        <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          <Library className="text-black" size={22} />
          Pagewise
        </h1>
      </div>

      {/* Navigation / Workspace items */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Documents
          </h2>
          
          <div className="space-y-1">
            {documents.map((doc) => {
              const isProcessing = doc.status === "processing";
              const isFailed = doc.status === "failed" || doc.status === "empty";
              const isActive = activeDocId === doc.id;

              return (
                <div
                  key={doc.id}
                  onClick={() => {
                    if (!isProcessing) {
                      router.push(`/?docId=${doc.id}&docName=${encodeURIComponent(doc.filename)}`);
                    }
                  }}
                  className={`group rounded-md flex items-center justify-between p-2 text-xs font-medium transition border ${
                    isProcessing
                      ? "bg-amber-50/70 text-gray-500 border-amber-200 cursor-wait"
                      : isFailed
                      ? "bg-red-50/70 text-red-700 border-red-200 cursor-pointer"
                      : isActive
                      ? "bg-gray-100 text-gray-900 border-gray-300 shadow-sm cursor-pointer"
                      : "bg-gray-50 text-gray-800 border-transparent hover:bg-gray-100 hover:border-gray-200 cursor-pointer"
                  }`}
                  title={
                    isProcessing
                      ? "Processing document embeddings in the background..."
                      : isFailed
                      ? (doc.error_message || "Document processing failed")
                      : doc.filename
                  }
                >
                  <div className="flex items-center min-w-0 flex-1">
                    {isProcessing ? (
                      <Loader2 size={14} className="mr-2 flex-shrink-0 text-amber-500 animate-spin" />
                    ) : isFailed ? (
                      <AlertCircle size={14} className="mr-2 flex-shrink-0 text-red-500" />
                    ) : (
                      <FileText size={14} className={`mr-2 flex-shrink-0 ${isActive ? "text-blue-500" : "text-gray-500"}`} />
                    )}
                    <span className="truncate">{doc.filename}</span>
                  </div>
                  {isProcessing && (
                    <span className="text-[9px] text-amber-700 bg-amber-100/90 px-1.5 py-0.5 rounded font-normal mr-1 flex-shrink-0">
                      Embedding
                    </span>
                  )}
                  <button
                    onClick={(e) => handleDelete(doc.id, e)}
                    className="text-gray-400 hover:text-red-500 ml-2 p-0.5 rounded transition opacity-0 group-hover:opacity-100"
                    title="Delete document"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
            {isSignedIn && documents.length === 0 && (
              <p className="text-xs text-gray-400 italic p-2">No documents uploaded.</p>
            )}
          </div>
        </div>


        {/* Dynamic Contextual Upload Area inside Sidebar */}
        {isSignedIn && (
          <div className="pt-2 border-t border-gray-100">
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-lg p-4 bg-gray-50 hover:bg-gray-100 cursor-pointer transition">
              {isUploading ? (
                <Loader2 className="animate-spin text-gray-500 mb-1" size={20} />
              ) : (
                <UploadCloud className="text-gray-400 mb-1" size={20} />
              )}
              <span className="text-xs text-gray-600 font-medium text-center">
                {isUploading ? "Processing..." : "Drop or Click to Upload"}
              </span>
              <input 
                type="file" 
                accept=".pdf,.docx,.csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/csv" 
                onChange={handleFileChange} 
                disabled={isUploading} 
                className="hidden" 
              />
            </label>
            {status && (
              <p className="text-[10px] text-center mt-2 font-medium text-gray-600 bg-gray-100 py-1 rounded">
                {status}
              </p>
            )}

            <button
              onClick={() => router.push("/")}
              className="mt-3 w-full py-2 px-4 bg-black text-white text-xs font-medium rounded-lg hover:bg-gray-800 transition flex items-center justify-center gap-2 shadow-sm"
            >
              <MessageSquarePlus size={16} />
              New Chat
            </button>
          </div>
        )}
      </div>

      {/* Account Profile Footer */}
      <div className="p-4 border-t border-gray-100 bg-gray-50">
        {!isLoaded ? (
          <div className="text-xs text-gray-400">Loading auth...</div>
        ) : isSignedIn ? (
          <div className="flex items-center gap-3">
            <UserButton />
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-gray-700 truncate">{user.firstName}</span>
            </div>
          </div>
        ) : (
          <div className="w-full bg-black text-white text-xs font-medium py-2 px-3 rounded-md text-center hover:bg-gray-800 transition">
            <SignInButton mode="modal" />
          </div>
        )}
      </div>
    </div>
  );
}

// Wrapped in Suspense boundary for Next.js useSearchParams safety
export default function Sidebar() {
  return (
    <Suspense fallback={<div className="w-64 bg-white border-r border-gray-200" />}>
      <SidebarContent />
    </Suspense>
  );
}