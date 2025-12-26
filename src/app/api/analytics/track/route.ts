import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { conversationId, eventType, eventData } = await req.json();

    if (!conversationId || !eventType) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // 1. Ensure Conversation Exists (if not already created by chat)
    // For simple tracking without chat (e.g. just landing page clicks),
    // we might need to insert it. But usually page load could trigger this.
    // We will just do a safe upsert here too.
    await supabase
      .from("analytics_conversations")
      .upsert(
        { id: conversationId, metadata: { last_updated: new Date() } },
        { onConflict: "id" }
      );

    // 2. Log Event
    const { error } = await supabase.from("analytics_events").insert({
      conversation_id: conversationId,
      event_type: eventType,
      event_data: eventData || {},
    });

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Analytics Track Error:", error);
    return NextResponse.json(
      { error: "Failed to track event" },
      { status: 500 }
    );
  }
}
