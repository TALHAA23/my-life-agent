import { NextRequest, NextResponse } from "next/server";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import {
  GoogleGenerativeAIEmbeddings,
  ChatGoogleGenerativeAI,
} from "@langchain/google-genai";
import { supabase } from "@/lib/supabase";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import {
  AIMessage,
  HumanMessage,
  BaseMessage,
  ToolMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { RunnableSequence } from "@langchain/core/runnables";

// Import data
import projects from "@/utils/projects";
import certificates from "@/utils/certificates";
import { skills } from "@/utils/skill-set";

// --- Custom "createAgent" Adapter (Pure LCEL - No Legacy Imports) ---
async function createAgent({
  model,
  tools,
  systemPrompt,
}: {
  model: any;
  tools: any[];
  systemPrompt: any;
}) {
  const toolMap = Object.fromEntries(tools.map((t) => [t.name, t]));
  const modelWithTools = model.bindTools(tools);

  const prompt = ChatPromptTemplate.fromMessages([
    new SystemMessage(
      typeof systemPrompt === "string"
        ? systemPrompt
        : systemPrompt.content || ""
    ),
    new MessagesPlaceholder("chat_history"),
  ]);

  const chain = RunnableSequence.from([prompt, modelWithTools]);

  return {
    invoke: async ({ messages }: { messages: BaseMessage[] }) => {
      let chatHistory = [...messages];

      // Simple loop for tool execution (ReAct pattern)
      const MAX_ITERATIONS = 5;
      for (let i = 0; i < MAX_ITERATIONS; i++) {
        const result = await chain.invoke({
          chat_history: chatHistory,
        });

        // If no tool calls, we are done
        if (!result.tool_calls || result.tool_calls.length === 0) {
          return {
            messages: [...messages, result],
          };
        }

        // If there are tool calls, execute them
        const toolMessages: ToolMessage[] = [];
        for (const toolCall of result.tool_calls) {
          const tool = toolMap[toolCall.name];
          if (tool) {
            console.log(`Executing tool: ${toolCall.name}`);
            const toolOutput = await tool.invoke(toolCall.args);
            toolMessages.push(
              new ToolMessage({
                tool_call_id: toolCall.id || "",
                content: toolOutput,
                name: toolCall.name,
              })
            );
          }
        }

        // Append AIMessage (with tool calls) and ToolMessages to history
        chatHistory = [...chatHistory, result, ...toolMessages];

        // Loop triggers next iteration with updated history
      }

      return {
        messages: [
          ...messages,
          new AIMessage("Agent stopped due to max iterations."),
        ],
      };
    },
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const messages = body.messages ?? [];
    const currentMessageContent = messages[messages.length - 1]?.content;

    if (!currentMessageContent) {
      return NextResponse.json(
        { error: "No message provided" },
        { status: 400 }
      );
    }

    // 1. RAG Retrieval
    const embeddings = new GoogleGenerativeAIEmbeddings({
      model: `${process.env.NEXT_PUBLIC_GOOGLE_EMBEDDING_MODEL}`,
      apiKey: process.env.GOOGLE_API_KEY,
    });

    const vectorStore = new SupabaseVectorStore(embeddings, {
      client: supabase,
      tableName: "documents",
      queryName: "match_documents",
    });

    let context = "";
    try {
      const results = await vectorStore.similaritySearch(
        currentMessageContent,
        3
      );
      context = results.map((doc) => doc.pageContent).join("\n\n");
    } catch (err) {
      console.error("RAG Search failed (ignoring):", err);
    }

    // 2. Define Tools
    const projectTool = new DynamicStructuredTool({
      name: "getProjects",
      description:
        "Returns a list of Talha's projects. Use this when the user asks about projects, work, or portfolio.",
      schema: z.object({}),
      func: async () => JSON.stringify(projects),
    });

    const certificateTool = new DynamicStructuredTool({
      name: "getCertificates",
      description:
        "Returns a list of Talha's certificates. Use this when the user asks about certifications, learning, or skills validation.",
      schema: z.object({}),
      func: async () => JSON.stringify(certificates),
    });

    const skillTool = new DynamicStructuredTool({
      name: "getSkills",
      description:
        "Returns a detailed list of Talha's technical skills (Languages, Frontend, Backend, AI, etc.). Use this to evaluate job fit or answer skill questions.",
      schema: z.object({}),
      func: async () => JSON.stringify(skills),
    });

    const tools = [projectTool, certificateTool, skillTool];
    // 3. Initialize Model
    const model = new ChatGoogleGenerativeAI({
      model: `${process.env.NEXT_PUBLIC_GEMINI_MODEL}`,
      apiKey: process.env.GOOGLE_API_KEY,
      temperature: 0.3,
      maxRetries: 2,
    });

    // 4. Create Agent
    const systemPrompt = `You are "My Bot", an AI agent answering on behalf of Talha.

    **Persona & Style**:
    1.  Speak in the first person ("I"). Represent Talha authentically.
    2.  Be professional, friendly, and concise.

    **Knowledge Base**:
    - Use the provided context to answer questions about Talha.
    - Use 'getProjects', 'getCertificates', and 'getSkills' tools to find specific details.
    
    **Job Post Evaluation Mode**:
    If the user pastes a Job Description or asks you to evaluate a gig:
    1.  **Analyze**: Use 'getSkills', 'getProjects', and 'getCertificates' to compare Talha's profile with the requirements.
    2.  **Honesty**:
        - If I am a perfect fit (80%+ match), say so confidently.
        - If I am a good fit but missing some minor things, say "I can handle this, but I might need to brush up on [X]".
        - If I am NOT a fit or if you are unsure (e.g., they need Rust, specific Embedded Systems exp), you **MUST** suggest contacting me to discuss.
    3.  **Proof of Fit**: You MUST select 1-3 specific Projects or Certificates from your tools that prove you have the required skills. Mention them briefly in your text (e.g., "My experience with the [Project Name] proves I can handle this...")
    4.  **Output**: 
        - Answer the user normally.
        - **IMPORTANT**: Ensure the \`[REFERENCES]\` tag at the end contains the specific projects/certs you mentioned as proof.
        - Append the \`[SKILL_MATCH]\` tag (see rules below).

    **Context from Documents**:
    ${context}

    **Response Rules**:
    1.  **Unknown Answers**: If you cannot answer based on context or tools, you MUST:
        *   Politely state you don't have that specific information.
        *   Encourage the user to contact Talha directly.
        *   **CRITICAL**: Append this tag at the very end: \`[CONTACT_ACTION: <ready_to_send_message>]\`.
            *   Example: "Hi Talha, I'd like to ask about..."
    
    2.  **References**:
        *   **DO NOT** include the reference links or JSON tags inside the main text of your response.
        *   Mention the projects/certificates naturally in the text.
        *   **AT THE VERY END OF YOUR MESSAGE** (after everything else), append a single \`[REFERENCES: ...]\` tag.
        *   Format: \`[REFERENCES: <json_array_of_objects>]\`
        *   Object properties: title, type ('project' or 'certificate'), link.
        *   **LIMIT**: Max 3 most relevant references.
        *   Example: \`[REFERENCES: [{"title": "Grain de Sud", "type": "project", "link": "..."}]]\`

    3.  **Skill Match (For Job/Gig Evaluation ONLY)**:
        *   If the user shared a job/gig, append this tag at the very end (along with References/Contact).
        *   Format: \`[SKILL_MATCH: <json_object>]\`
        *   JSON Schema:
            {
               "score": <number_0_to_100>,
               "matched": ["<skill1>", "<skill2>"],
               "missing": ["<skill3>", "<skill4>"],
               "analysis": "<short_one_line_summary>"
            }
        *   Example: \`[SKILL_MATCH: {"score": 85, "matched": ["React", "Typescript"], "missing": ["AWS"], "analysis": "Strong frontend match, some backend gap."}]\`

    4.  **Analytics (ALWAYS)**:
        *   Analyze the user's input/sentiment.
        *   Append the following JSON tag at the VERY END (hidden field):
        *   Format: \`[ANALYTICS: {"sentiment": <float_-1.0_to_1.0>, "topics": ["<topic1>", "<topic2>"]}]\`
        *   Sentiment: -1.0 (Angry/Negative) to 1.0 (Happy/Positive).
        *   Topics: Extract 1-3 key topics (e.g., "Salary", "Next.js", "Contact").
    `;

    const agent = await createAgent({
      model,
      tools,
      systemPrompt,
    });

    // Process messages
    // Note: createAgent expects full BaseMessage array
    const chatHistory = messages.map((m: any) =>
      m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content)
    );

    const result = await agent.invoke({
      messages: chatHistory,
    });

    const finalMessage = result.messages[result.messages.length - 1];
    let finalContent = finalMessage.content as string;

    // --- ANALYTICS LOGGING START ---
    const conversationId = body.conversationId;

    // Extract Analytics Tag
    let sentimentScore = 0;
    let topics: string[] = [];
    const analyticsMatch = finalContent.match(/\[ANALYTICS:\s*({.*?})\]/);
    if (analyticsMatch) {
      try {
        const analyticsData = JSON.parse(analyticsMatch[1]);
        sentimentScore = analyticsData.sentiment || 0;
        topics = analyticsData.topics || [];
        // Remove tag from content sent to user
        finalContent = finalContent.replace(analyticsMatch[0], "").trim();
      } catch (e) {
        console.error("Analytics Parse Error", e);
      }
    }

    // We only log if a conversationId is provided (from frontend)
    if (conversationId) {
      try {
        const { referrer, deviceInfo } = body;

        // 1. Ensure Conversation Exists (Idempotent insert/ignore)
        const updateData: any = {
          id: conversationId,
          metadata: { last_updated: new Date() },
        };
        if (referrer) updateData.referrer = referrer;
        if (deviceInfo) updateData.device_info = deviceInfo;

        await supabase
          .from("analytics_conversations")
          .upsert(updateData, { onConflict: "id" });

        // 2. Log User Message
        await supabase.from("analytics_messages").insert({
          conversation_id: conversationId,
          role: "user",
          content: currentMessageContent,
          sentiment_score: sentimentScore,
          topics: topics,
        });

        // 3. Log AI Message
        await supabase.from("analytics_messages").insert({
          conversation_id: conversationId,
          role: "ai",
          content: finalContent,
        });

        // 4. Extract & Log Events (Skill Match)
        const skillMatch = finalContent.match(/\[SKILL_MATCH:\s*({.*?})\]/);
        if (skillMatch) {
          const payload = JSON.parse(skillMatch[1]);
          await supabase.from("analytics_events").insert({
            conversation_id: conversationId,
            event_type: "skill_match",
            event_data: payload,
          });
        }

        // 5. Extract & Log Events (Contact Action)
        const contactMatch = finalContent.match(/\[CONTACT_ACTION:\s*(.*?)\]/);
        if (contactMatch) {
          const payload = contactMatch[1];
          await supabase.from("analytics_events").insert({
            conversation_id: conversationId,
            event_type: "contact_suggestion",
            event_data: { message: payload },
          });
        }
      } catch (logParams) {
        console.error("Analytics Error:", logParams);
      }
    }
    // --- ANALYTICS LOGGING END ---

    return new NextResponse(finalContent, {
      headers: { "Content-Type": "text/plain" },
    });
  } catch (e: any) {
    console.error("Error in chat API:", e);
    // Check for Rate Limit (429)
    if (
      e.status === 429 ||
      e.message?.includes("429") ||
      e.message?.includes("Too Many Requests")
    ) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 }
      );
    }
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
