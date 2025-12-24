"use client";

import { useState } from "react";
import { motion } from "framer-motion";

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState("Resume");
  const [tags, setTags] = useState("");
  const [importance, setImportance] = useState("5");
  const [referenceDate, setReferenceDate] = useState("");
  const [uploadStatus, setUploadStatus] = useState<
    "idle" | "uploading" | "success" | "error"
  >("idle");
  const [statusMessage, setStatusMessage] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.success) {
        setIsAuthenticated(true);
      } else {
        setError("Invalid password");
      }
    } catch {
      setError("Something went wrong");
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setUploadStatus("uploading");
    setStatusMessage("Processing document...");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("category", category);
    formData.append("tags", tags);
    formData.append("importance", importance);
    formData.append("referenceDate", referenceDate);

    try {
      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Upload failed");

      setUploadStatus("success");
      setStatusMessage(`Success! ${data.chunks} chunks created and stored.`);
      setFile(null);
      setTags("");
    } catch (err: any) {
      setUploadStatus("error");
      setStatusMessage(err.message);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <form
          onSubmit={handleLogin}
          className="p-8 bg-white rounded-lg shadow-md w-80"
        >
          <h1 className="text-xl font-bold mb-4 text-center">Admin Access</h1>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter Password"
            className="w-full p-2 border rounded mb-4 focus:ring-2 focus:ring-blue-500 outline-none"
          />
          {error && (
            <p className="text-red-500 text-sm mb-4 text-center">{error}</p>
          )}
          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition"
          >
            Unlock
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <header className="mb-8 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-800">
            Knowledge Base Manager
          </h1>
          <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
            Secure Mode
          </span>
        </header>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <h2 className="text-xl font-semibold mb-6">Upload New Knowledge</h2>

          <form onSubmit={handleUpload} className="space-y-6">
            {/* File Input */}
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors cursor-pointer relative">
              <input
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                accept=".pdf,.txt,.md"
              />
              <div className="space-y-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-10 w-10 mx-auto text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
                <p className="text-gray-600 font-medium">
                  {file ? file.name : "Drop PDF, TXT or Markdown here"}
                </p>
                <p className="text-xs text-gray-400">up to 10MB</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full p-2 border rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="Resume">Resume / CV</option>
                  <option value="Bio">Biography / Personal</option>
                  <option value="Project">Project Documentation</option>
                  <option value="Thoughts">Thoughts / Blog</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {/* Reference Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reference Date
                </label>
                <input
                  type="date"
                  value={referenceDate}
                  onChange={(e) => setReferenceDate(e.target.value)}
                  className="w-full p-2 border rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tags (comma separated)
              </label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="e.g. react, startup, 2024, leadership"
                className="w-full p-2 border rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            {/* Importance */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Importance Weight (1-10)
              </label>
              <div className="flex items-center space-x-4">
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={importance}
                  onChange={(e) => setImportance(e.target.value)}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
                <span className="font-bold text-blue-600 w-8">
                  {importance}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Higher weight info might be prioritized in future (not
                implemented yet).
              </p>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={!file || uploadStatus === "uploading"}
              className={`w-full py-3 rounded-lg font-semibold text-white transition-all transform hover:scale-[1.01] ${
                !file || uploadStatus === "uploading"
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-gradient-to-r from-blue-600 to-indigo-600 shadow-md hover:shadow-lg"
              }`}
            >
              {uploadStatus === "uploading"
                ? "Processing & Embedding..."
                : "Upload & Process"}
            </button>

            {/* Status Feedback */}
            {statusMessage && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-4 rounded-lg text-sm text-center ${
                  uploadStatus === "error"
                    ? "bg-red-50 text-red-600"
                    : uploadStatus === "success"
                    ? "bg-green-50 text-green-700"
                    : "bg-blue-50 text-blue-600"
                }`}
              >
                {statusMessage}
              </motion.div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
