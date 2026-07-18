'use client'

import { useState, useEffect, Suspense } from "react";
import { SignInButton, UserButton, useUser } from "@clerk/nextjs";
import { Folder, FileText, UploadCloud, Library, Loader2, Trash2, MessageSquarePlus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

function SidebarContent() {
  const { isLoaded, isSignedIn, user } = useUser();
  const [status, setStatus] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const [documents, setDocuments] = useState<{ id: string; filename: string; s3_key: string }[]>([]);
  
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeDocId = searchParams.get("docId");

  const fetchDocuments = async () => {
    if (!user) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/documents?user_id=${user.id}`);
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

  const handleDelete = async (docId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this document? This will also delete its chat history.")) return;
    
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/documents/${docId}`, {
        method: "DELETE",
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
    formData.append("user_id", user.id);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/upload`, {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        setStatus("Upload successful!");
        fetchDocuments(); // Refresh document list
      } else {
        const error = await res.json();
        setStatus(`Failed: ${error.detail}`);
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
            {documents.map((doc) => (
              <div
                key={doc.id}
                onClick={() => router.push(`/?docId=${doc.id}&docName=${encodeURIComponent(doc.filename)}`)}
                className={`group rounded-md flex items-center justify-between p-2 text-xs font-medium cursor-pointer transition border ${
                  activeDocId === doc.id 
                    ? "bg-gray-100 text-gray-900 border-gray-300 shadow-sm" 
                    : "bg-gray-50 text-gray-800 border-transparent hover:bg-gray-100 hover:border-gray-200"
                }`}
              >
                <div className="flex items-center min-w-0 flex-1">
                  <FileText size={14} className={`mr-2 flex-shrink-0 ${activeDocId === doc.id ? "text-blue-500" : "text-gray-500"}`} />
                  <span className="truncate">{doc.filename}</span>
                </div>
                <button
                  onClick={(e) => handleDelete(doc.id, e)}
                  className="text-gray-400 hover:text-red-500 ml-2 p-0.5 rounded transition opacity-0 group-hover:opacity-100"
                  title="Delete document"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
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
                accept="application/pdf" 
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