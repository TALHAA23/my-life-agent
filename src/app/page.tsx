"use client";
import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import {
  Folder,
  Briefcase,
  Award,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import ReactMarkdown from "react-markdown";

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

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

      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }
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

        // 2. Check for References (Global Regex Replace)
        // Match all occurrences of [REFERENCES: ... ]
        // We use a regex that matches [REFERENCES: followed by non-greedy anything until ]] or ]
        // Ideally JSON ends with ]].
        const refRegex = /\[REFERENCES:\s*(\[.*?\])\]/g;
        let match;
        const allRefs = [];

        // We might have multiple tags, we want to extract them all and remove them all from text.
        // We clone displayContent to modify it cleanly.
        let finalDisplayContent = displayContent;

        while ((match = refRegex.exec(displayContent)) !== null) {
          const jsonString = match[1];
          try {
            const refs = JSON.parse(jsonString);
            if (Array.isArray(refs)) {
              allRefs.push(...refs);
            }
            // Remove this specific match from final content
            finalDisplayContent = finalDisplayContent.replace(match[0], "");
          } catch (e) {
            // console.log("Parsing error", e);
          }
        }

        // Trim strictly
        finalDisplayContent = finalDisplayContent.trim();

        // Deduplicate references by link
        const uniqueRefs = Array.from(
          new Map(allRefs.map((item) => [item["link"], item])).values()
        );

        // Limit to 3
        if (uniqueRefs.length > 0) {
          referencesPayload = uniqueRefs.slice(0, 3);
        }

        setMessages((prev) => {
          const newMessages = [...prev];
          const lastMsg = newMessages[newMessages.length - 1];
          lastMsg.content = finalDisplayContent;
          if (contactPayload) lastMsg.contactPayload = contactPayload;
          if (referencesPayload && referencesPayload.length > 0)
            lastMsg.references = referencesPayload;
          return newMessages;
        });
      }
    } catch (error: any) {
      console.error("Error:", error);
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        const errorMsg = {
          role: "system",
          content: `Error: ${error.message || "Something went wrong."}`,
        };
        if (last.role === "ai" && !last.content) {
          return [...prev.slice(0, -1), errorMsg];
        }
        return [...prev, errorMsg];
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`;
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 font-sans relative">
      {/* Social Sidebar (Fixed Right) */}
      <div className="fixed right-4 top-1/2 -translate-y-1/2 flex flex-col gap-4 z-20 hidden md:flex">
        {process.env.NEXT_PUBLIC_GITHUB && (
          <a
            href={process.env.NEXT_PUBLIC_GITHUB}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 bg-white rounded-full shadow-md hover:shadow-lg hover:scale-110 transition-all border border-gray-100"
          >
            <Image
              src="/github-142-svgrepo-com.svg"
              alt="GitHub"
              width={24}
              height={24}
            />
          </a>
        )}
        {process.env.NEXT_PUBLIC_LINKEDIN && (
          <a
            href={process.env.NEXT_PUBLIC_LINKEDIN}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 bg-white rounded-full shadow-md hover:shadow-lg hover:scale-110 transition-all border border-gray-100"
          >
            <Image
              src="/linkedin-svgrepo-com.svg"
              alt="LinkedIn"
              width={24}
              height={24}
            />
          </a>
        )}
        {process.env.NEXT_PUBLIC_UPWORK && (
          <a
            href={process.env.NEXT_PUBLIC_UPWORK}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 bg-white rounded-full shadow-md hover:shadow-lg hover:scale-110 transition-all border border-gray-100"
          >
            <Image
              src="/upwork-svgrepo-com.svg"
              alt="Upwork"
              width={24}
              height={24}
            />
          </a>
        )}
      </div>

      <header className="px-4 py-3 bg-white border-b border-gray-200 sticky top-0 z-10 flex justify-between items-center shadow-sm">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
          <h1 className="text-sm font-semibold text-gray-900">AskTalha</h1>
        </div>
        <span className="text-[10px] text-gray-400 uppercase tracking-widest font-medium">
          My Bot
        </span>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-md mx-auto space-y-6">
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`flex flex-col ${
                msg.role === "user" ? "items-end" : "items-start"
              } ${msg.role === "system" ? "items-center w-full" : ""}`}
            >
              {msg.role === "system" ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-lg text-xs font-medium border border-red-100"
                >
                  <AlertCircle size={14} />
                  {msg.content}
                </motion.div>
              ) : (
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
                  <div
                    className={`prose prose-sm max-w-none ${
                      msg.role === "user" ? "prose-invert" : ""
                    }`}
                  >
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                </motion.div>
              )}

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
                          <span className="text-xs font-semibold text-gray-800 group-hover:text-blue-600 leading-tight line-clamp-1 max-w-[150px]">
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

      <div className="p-4 bg-white border-t border-gray-100">
        <div className="max-w-md mx-auto relative">
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              rows={1}
              className="w-full pl-4 pr-12 py-3 text-black bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-gray-900/5 focus:bg-white transition-all text-sm outline-none placeholder:text-gray-400 resize-none max-h-[150px] overflow-y-auto"
              disabled={isLoading}
            />
            <button
              onClick={() => handleSubmit()}
              disabled={!input.trim() || isLoading}
              className="absolute right-2 bottom-2 p-2 bg-gray-900 text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-800 transition-colors"
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
          </div>
          <p className="text-[10px] text-center text-gray-400 mt-2">
            Responses are generated by AI and may be inaccurate.
          </p>
        </div>
      </div>

      {/* Mobile Social Links */}
      <div className="md:hidden fixed top-14 right-4 flex flex-col gap-2 z-20">
        {process.env.NEXT_PUBLIC_GITHUB && (
          <a
            href={process.env.NEXT_PUBLIC_GITHUB}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 bg-white rounded-full shadow-sm border border-gray-100"
          >
            <Image
              src="/github-142-svgrepo-com.svg"
              alt="GitHub"
              width={20}
              height={20}
            />
          </a>
        )}
        {process.env.NEXT_PUBLIC_LINKEDIN && (
          <a
            href={process.env.NEXT_PUBLIC_LINKEDIN}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 bg-white rounded-full shadow-sm border border-gray-100"
          >
            <Image
              src="/linkedin-svgrepo-com.svg"
              alt="LinkedIn"
              width={20}
              height={20}
            />
          </a>
        )}
        {process.env.NEXT_PUBLIC_UPWORK && (
          <a
            href={process.env.NEXT_PUBLIC_UPWORK}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 bg-white rounded-full shadow-sm border border-gray-100"
          >
            <Image
              src="/upwork-svgrepo-com.svg"
              alt="Upwork"
              width={20}
              height={20}
            />
          </a>
        )}
      </div>
    </div>
  );
}
