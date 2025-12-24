import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { supabase } from "@/lib/supabase";

export async function processAndStoreDocument(
  text: string,
  metadata: Record<string, any>
) {
  // 1. Split Text
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });

  const docs = await splitter.createDocuments([text], [metadata]);
  console.log(`Generated ${docs.length} chunks from text`);

  if (docs.length > 0) {
    console.log("Sample chunk content:", docs[0].pageContent.substring(0, 100));
  }

  // 2. Embeddings
  const embeddings = new GoogleGenerativeAIEmbeddings({
    model: "text-embedding-004",
    apiKey: process.env.GOOGLE_API_KEY,
  });

  // Verify embeddings generation manually for debugging (optional, but good if Supabase fails specifically on vector)
  try {
    const sampleEmbedding = await embeddings.embedQuery("test");
    console.log("Test embedding dimension:", sampleEmbedding.length);
  } catch (e) {
    console.error("Embedding generation failed during test:", e);
  }

  // 3. Store in Supabase
  await SupabaseVectorStore.fromDocuments(docs, embeddings, {
    client: supabase,
    tableName: "documents",
    queryName: "match_documents",
  });

  return docs.length;
}
