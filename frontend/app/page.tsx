'use client'

import { SignInButton, UserButton, useUser } from "@clerk/nextjs";
import { useState } from "react";

export default function Home() {
  const { isLoaded, isSignedIn, user } = useUser();
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    
    console.log("1. Button was clicked!");
    console.log("2. File selected:", file ? file.name : "No file");
    console.log("3. User ID:", user ? user.id : "No user");
    console.log("4. Target Backend URL:", `${process.env.NEXT_PUBLIC_API_URL}/upload`);

    if (!file || !user) {
        console.log("5. ERROR: Upload aborted because file or user is missing.");
        return;
    }
    
    console.log("6. All checks passed! Attempting to fetch backend...");
    // -----------------------------

    setIsUploading(true);
    setStatus("Uploading...");
    
    const formData = new FormData();
    formData.append("file", file);
    formData.append("user_id", user.id); 

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/upload`, {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        setStatus("Upload successful! Checked your DB and Supabase bucket.");
        setFile(null); 
      } else {
        const error = await res.json();
        setStatus(`Upload failed: ${error.detail}`);
      }
    } catch (err) {
      console.error("Fetch error:", err); // Added this to catch network errors
      setStatus("Error connecting to the backend server.");
    } finally {
      setIsUploading(false);
    }
  };

  if (!isLoaded) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gray-50">
        <p className="text-gray-500">Loading...</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg border border-gray-100 p-8 text-center">
        <h1 className="text-3xl font-bold mb-6 text-gray-900">Pagewise</h1>

        {!isSignedIn ? (
          <>
            <p className="mb-6 text-gray-600">Please sign in to upload your documents.</p>
            <div className="bg-black text-white px-4 py-2 rounded-md hover:bg-gray-800 transition inline-block">
              <SignInButton mode="modal" />
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col items-center mb-6 gap-2">
              <UserButton afterSignOutUrl="/" />
              <p className="text-sm text-gray-500">Welcome back, {user?.firstName}</p>
            </div>
            
            <form onSubmit={handleUpload} className="flex flex-col gap-4">
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="border border-gray-300 p-2 rounded-md text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-gray-50 file:text-gray-700 hover:file:bg-gray-100"
              />
              <button
                type="submit"
                disabled={!file || isUploading}
                className="bg-black text-white px-4 py-2 rounded-md disabled:bg-gray-300 disabled:cursor-not-allowed transition"
              >
                {isUploading ? "Processing..." : "Upload PDF"}
              </button>
            </form>

            {status && (
              <div className={`mt-4 p-3 rounded-md text-sm font-medium ${status.includes("successful") ? "bg-green-50 text-green-700" : "bg-blue-50 text-blue-700"}`}>
                {status}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}