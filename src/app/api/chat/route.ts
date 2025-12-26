import { NextRequest, NextResponse } from "next/server";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import {
  GoogleGenerativeAIEmbeddings,
  ChatGoogleGenerativeAI,
} from "@langchain/google-genai";
import { supabase } from "@/lib/supabase";
import { tool } from "langchain";
import { z } from "zod";
import {
  SystemMessage,
  HumanMessage,
  AIMessage,
  BaseMessage,
} from "@langchain/core/messages";
import {
  StateGraph,
  START,
  END,
  MessagesAnnotation,
  Annotation,
} from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { MemorySaver } from "@langchain/langgraph"; // Try root import first for standard

// OR import { MemorySaver } from "@langchain/langgraph/checkpoint";

// Import data
import projects from "@/utils/projects";
import certificates from "@/utils/certificates";
import { skills } from "@/utils/skill-set";

// 1. Define Tools
const projectTool = tool(async () => JSON.stringify(projects), {
  name: "getProjects",
  description:
    "Returns a list of Talha's projects. Use this when the user asks about projects, work, or portfolio.",
  schema: z.object({}),
});
const certificateTool = tool(async () => JSON.stringify(certificates), {
  name: "getCertificates",
  description:
    "Returns a list of Talha's certificates. Use this when the user asks about certifications, learning, or skills validation.",
  schema: z.object({}),
});

const skillTool = tool(async () => JSON.stringify(skills), {
  name: "getSkills",
  description:
    "Returns a detailed list of Talha's technical skills (Languages, Frontend, Backend, AI, etc.). Use this to evaluate job fit or answer skill questions.",
  schema: z.object({}),
});

const tools = [projectTool, certificateTool, skillTool];
const toolNode = new ToolNode(tools);

// 2. Initialize Model
const model = new ChatGoogleGenerativeAI({
  model: `${process.env.NEXT_PUBLIC_GEMINI_MODEL}`,
  apiKey: process.env.GOOGLE_API_KEY,
  temperature: 0.3,
  maxRetries: 2,
}).bindTools(tools);

// 3. Global Checkpointer (Must be shared to persist memory across requests)
const checkpointer = new MemorySaver();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const messages = body.messages ?? [];
    const currentMessageContent = messages[messages.length - 1]?.content;
    const conversationId = body.conversationId || "default-session"; // Default if missing

    if (!currentMessageContent) {
      return NextResponse.json(
        { error: "No message provided" },
        { status: 400 }
      );
    }

    // A. RAG Retrieval
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

    // B. Re-Construct System Prompt (Dynamic)
    const systemPromptText = `You are "My Bot", an AI agent answering on behalf of Talha.

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

    // C. Define Graph LOCALLY (to capture systemPromptText)

    type AgentState = typeof MessagesAnnotation.State;

    async function callModel(state: AgentState) {
      // PREPEND the system message to the history.
      // We filter out any previous SystemMessages to avoid duplication or confusion.
      const history = state.messages.filter((m) => m._getType() !== "system");

      // This ensures SystemMessage is ALWAYS first and CONTAINS the RAG context
      const messagesWithSystem = [
        new SystemMessage(systemPromptText),
        ...history,
      ];

      const response = await model.invoke(messagesWithSystem);
      return { messages: [response] };
    }

    function shouldContinue(state: typeof MessagesAnnotation.State) {
      const messages = state.messages;
      const lastMessage = messages[messages.length - 1] as AIMessage;
      if (lastMessage.tool_calls?.length) {
        return "tools";
      }
      return END;
    }

    const workflow = new StateGraph(MessagesAnnotation)
      .addNode("agent", callModel)
      .addNode("tools", toolNode)
      .addEdge(START, "agent")
      .addConditionalEdges("agent", shouldContinue, ["tools", END])
      .addEdge("tools", "agent")
      .compile({ checkpointer });

    const config = { configurable: { thread_id: conversationId } };

    // Invoke with ONLY the new message. The rest comes from MemorySaver.
    const inputs = {
      messages: [new HumanMessage(currentMessageContent)],
    };

    const result = await workflow.invoke(inputs, config);

    // Get final message
    const finalMessage = result.messages[result.messages.length - 1];
    let finalContent = finalMessage.content as string;

    // --- ANALYTICS LOGGING START ---

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
