import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  try {
    // 1. Fetch Conversations Stats
    // Ideally we use count(), but fetch is okay for small scale
    const { data: conversations, error: convError } = await supabase
      .from("analytics_conversations")
      .select("*");

    if (convError) throw convError;

    const totalConversations = conversations.length;
    const referrers: Record<string, number> = {};
    const devices: Record<string, number> = {};
    const activeLast24h = conversations.filter((c) => {
      const lastUpdated = new Date(c.metadata?.last_updated || c.created_at);
      return new Date().getTime() - lastUpdated.getTime() < 24 * 60 * 60 * 1000;
    }).length;

    conversations.forEach((c) => {
      // Referrer
      const ref = c.referrer || "Direct";
      referrers[ref] = (referrers[ref] || 0) + 1;

      // Device (check agent)
      const agent = c.device_info?.userAgent || "Unknown";
      let deviceType = "Desktop";
      if (/mobile/i.test(agent)) deviceType = "Mobile";
      devices[deviceType] = (devices[deviceType] || 0) + 1;
    });

    // 2. Fetch Messages Stats (Sentiment & Topics)
    const { data: messages, error: msgError } = await supabase
      .from("analytics_messages")
      .select("sentiment_score, topics, created_at");

    if (msgError) throw msgError;

    const totalMessages = messages.length;
    let totalSentiment = 0;
    let scoredMessages = 0;
    const topicCounts: Record<string, number> = {};
    const dailySentiment: Record<string, { total: number; count: number }> = {};

    messages.forEach((m) => {
      // Sentiment
      if (m.sentiment_score !== null && m.sentiment_score !== undefined) {
        totalSentiment += m.sentiment_score;
        scoredMessages++;

        // Daily Sentiment
        const date = new Date(m.created_at).toISOString().split("T")[0];
        if (!dailySentiment[date])
          dailySentiment[date] = { total: 0, count: 0 };
        dailySentiment[date].total += m.sentiment_score;
        dailySentiment[date].count++;
      }

      // Topics
      if (m.topics && Array.isArray(m.topics)) {
        m.topics.forEach((t: string) => {
          const topic = t.trim();
          if (topic) topicCounts[topic] = (topicCounts[topic] || 0) + 1;
        });
      }
    });

    const avgSentiment =
      scoredMessages > 0 ? totalSentiment / scoredMessages : 0;

    // Format Daily Sentiment for Chart
    const sentimentTrend = Object.keys(dailySentiment)
      .sort()
      .map((date) => ({
        date,
        sentiment: dailySentiment[date].total / dailySentiment[date].count,
      }));

    // Format Top Topics
    const topTopics = Object.entries(topicCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([topic, count]) => ({ topic, count }));

    // 3. Fetch Events
    const { data: events, error: evtError } = await supabase
      .from("analytics_events")
      .select("event_type");

    if (evtError) throw evtError;

    const eventCounts: Record<string, number> = {};
    events.forEach((e) => {
      eventCounts[e.event_type] = (eventCounts[e.event_type] || 0) + 1;
    });

    return NextResponse.json({
      kpi: {
        totalConversations,
        totalMessages,
        activeLast24h,
        avgSentiment,
        mostCommonReferrer:
          Object.entries(referrers).sort(([, a], [, b]) => b - a)[0]?.[0] ||
          "None",
      },
      charts: {
        sentimentTrend,
        topTopics,
        deviceSplit: Object.entries(devices).map(([name, value]) => ({
          name,
          value,
        })),
        events: Object.entries(eventCounts).map(([name, value]) => ({
          name,
          value,
        })),
      },
    });
  } catch (error: any) {
    console.error("Stats API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
