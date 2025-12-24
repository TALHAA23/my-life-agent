"use client";
import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import { Folder, Briefcase, Award, ExternalLink } from "lucide-react";

export default function Home() {
  const [messages, setMessages] = useState<
    {
      role: string;
      content: string;
      contactPayload?: string;
      references?: any[];
    }[]
  >([
    {
      role: "ai",
      content:
        "Hi! I see you found my personal bot. I am busy right now, but feel free to ask questions about me. My bot will try its best to answer it!",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(({ role, content }) => ({
            role,
            content,
          })),
        }),
      });

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let aiMessageContent = "";

      setMessages((prev) => [...prev, { role: "ai", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        aiMessageContent += text;

        let contactPayload = undefined;
        let referencesPayload = undefined;
        let displayContent = aiMessageContent;

        // 1. Check for Contact Action
        const contactMatch = displayContent.match(
          /\[CONTACT_ACTION:\s*(.*?)\]/
        );
        if (contactMatch) {
          contactPayload = contactMatch[1];
          displayContent = displayContent.replace(contactMatch[0], "").trim();
        }

        // 2. Check for References (Robust Parsing via Split)
        const refTag = "[REFERENCES:";
        const refIndex = displayContent.lastIndexOf(refTag);

        if (refIndex !== -1) {
          const rawRefString = displayContent.substring(refIndex);
          const closingIndex = rawRefString.lastIndexOf("]");

          if (closingIndex !== -1) {
            // Try to extract JSON part: [REFERENCES: ... ]
            // rawRefString: "[REFERENCES: [{"title":...}]]"
            // slice(refTag.length, closingIndex) -> " [{"title":...}]"
            // Parse it.

            // Note: The ending might be "]]" so lastIndexOf("]") is the last character.
            // If it is "]]", then we need to cut up to that.
            // Safest to cut from start of content to lastIndexOf("]").
            const jsonCandidate = rawRefString.slice(
              refTag.length,
              rawRefString.lastIndexOf("]")
            );

            try {
              referencesPayload = JSON.parse(jsonCandidate);
              // Remove the entire tag string from displayContent
              // Substring to remove is from refIndex to (refIndex + closingIndex + 1)
              // Wait, rawRefString is a substring.
              // So we remove rawRefString.substring(0, closingIndex + 1)

              const tagString = rawRefString.substring(0, closingIndex + 1);
              // Replace only the last occurrence (which is what refIndex points to)
              // String.replace might replace first occurrence if strings are identical, which is rare for full content match but safer to use slice.
              displayContent =
                displayContent.slice(0, refIndex) +
                displayContent.slice(refIndex + tagString.length);
              displayContent = displayContent.trim();
            } catch (e) {
              // JSON partial or invalid, ignore
            }
          }
        }

        setMessages((prev) => {
          const newMessages = [...prev];
          const lastMsg = newMessages[newMessages.length - 1];
          lastMsg.content = displayContent;
          lastMsg.contactPayload = contactPayload;
          lastMsg.references = referencesPayload;
          return newMessages;
        });
      }
    } catch (error) {
      console.error("Error:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          content: "Sorry, I encountered an error. Please try again.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 font-sans">
      {/* Compact Header */}
      <header className="px-4 py-3 bg-white border-b border-gray-200 sticky top-0 z-10 flex justify-between items-center shadow-sm">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
          <h1 className="text-sm font-semibold text-gray-900">AskTalha</h1>
        </div>
        <span className="text-[10px] text-gray-400 uppercase tracking-widest font-medium">
          My Bot
        </span>
      </header>

      {/* Chat Area - Max Width for Compact Look */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-md mx-auto space-y-6">
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`flex flex-col ${
                msg.role === "user" ? "items-end" : "items-start"
              }`}
            >
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={`max-w-[90%] px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm ${
                  msg.role === "user"
                    ? "bg-gray-900 text-white rounded-br-sm"
                    : "bg-white text-gray-800 border border-gray-100 rounded-bl-sm"
                }`}
              >
                <div className="markdown-body whitespace-pre-wrap">
                  {msg.content}
                </div>
              </motion.div>

              {/* References Cards (Compact) */}
              {msg.role === "ai" &&
                msg.references &&
                msg.references.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2 w-full max-w-[90%]">
                    {msg.references.map((ref: any, idx: number) => (
                      <motion.a
                        key={idx}
                        href={ref.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: idx * 0.1 }}
                        className="bg-white px-3 py-2 rounded-xl border border-gray-200 shadow-sm flex items-center gap-2 hover:shadow-md hover:border-blue-200 transition-all text-decoration-none group"
                      >
                        <div
                          className={`p-1.5 rounded-lg ${
                            ref.type === "certificate"
                              ? "bg-orange-50 text-orange-600"
                              : "bg-blue-50 text-blue-600"
                          }`}
                        >
                          {ref.type === "certificate" ? (
                            <Award size={14} />
                          ) : (
                            <Folder size={14} />
                          )}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-gray-800 group-hover:text-blue-600 leading-tight">
                            {ref.title}
                          </span>
                          <span className="text-[9px] text-gray-400 font-medium capitalize mt-0.5">
                            {ref.type}
                          </span>
                        </div>
                        <ExternalLink
                          size={12}
                          className="ml-1 text-gray-300 group-hover:text-blue-400"
                        />
                      </motion.a>
                    ))}
                  </div>
                )}

              {/* Contact Options */}
              {msg.role === "ai" && msg.contactPayload && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="mt-3 pl-1 flex flex-wrap gap-2"
                >
                  <a
                    href={`https://wa.me/${
                      process.env.NEXT_PUBLIC_WHATSAPP_NUMBER
                    }?text=${encodeURIComponent(msg.contactPayload)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 text-xs font-medium rounded-full transition-colors border border-green-200"
                  >
                    <Image
                      src="/whatsapp-whats-app-svgrepo-com.svg"
                      alt="WhatsApp"
                      width={14}
                      height={14}
                    />
                    WhatsApp
                  </a>
                  <a
                    href={`mailto:${
                      process.env.NEXT_PUBLIC_GMAIL
                    }?subject=${encodeURIComponent(
                      "Inquiry via AskTalha Bot"
                    )}&body=${encodeURIComponent(msg.contactPayload)}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-medium rounded-full transition-colors border border-red-200"
                  >
                    <Image
                      src="/gmail-svgrepo-com.svg"
                      alt="Gmail"
                      width={14}
                      height={14}
                    />
                    Email
                  </a>
                </motion.div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="flex items-center gap-2 text-gray-400 text-xs pl-2">
              <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
              <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
              <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-gray-100">
        <form onSubmit={handleSubmit} className="relative max-w-md mx-auto">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="w-full px-4 py-3 text-black bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-gray-900/5 focus:bg-white transition-all text-sm outline-none placeholder:text-gray-400"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-gray-900 text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-800 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-4 h-4"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18"
              />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
