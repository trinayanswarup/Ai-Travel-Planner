import { NextResponse } from "next/server";
import Groq from "groq-sdk";

const getGroqClient = () => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GROQ_API_KEY");
  }
  return new Groq({ apiKey });
};

type GenerateRequestBody = {
  destination: string;
  days: number | string;
  budget: string;
  style: string;
  interests: string;
};

export async function POST(req: Request) {
  try {
    const groq = getGroqClient();
    const body: GenerateRequestBody = await req.json();

    const { destination, days, budget, style, interests } = body;

    if (!destination || !days || !budget || !style || !interests) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const budgetGuide: Record<string, string> = {
      low: "Low budget: total $50–100 USD per day. Use hostels, street food, public transport.",
      medium: "Medium budget: total $150–250 USD per day. Use 3-star hotels, casual restaurants, taxis.",
      high: "High budget: total $400–700 USD per day. Use 5-star hotels, fine dining, private transfers.",
    };

    const budgetInstruction = budgetGuide[budget.toLowerCase()] ?? `Budget tier: ${budget}`;
    const numDays = Number(days);
    const dailyMin = budget.toLowerCase() === "low" ? 50 : budget.toLowerCase() === "medium" ? 150 : 400;
    const dailyMax = budget.toLowerCase() === "low" ? 100 : budget.toLowerCase() === "medium" ? 250 : 700;
    const totalMin = dailyMin * numDays;
    const totalMax = dailyMax * numDays;

    const prompt = `
Generate a personalized travel itinerary.

Trip details:
- Destination: ${destination}
- Number of days: ${days}
- Budget: ${budgetInstruction}
- Total trip budget: $${totalMin}–$${totalMax} USD (calculated as daily rate × number of days)
- Travel style: ${style}
- Interests: ${interests}

RULES:
1. All money must be in USD only. Never use INR, EUR, or any local currency.
2. Activities must match the budget tier (e.g. no luxury hotels on a low budget).
3. estimated_cost for each day must stay within the daily range ($${dailyMin}–$${dailyMax} USD).
4. total_estimated_budget must be "$${totalMin}–$${totalMax} USD".
5. All day costs must add up to the total.

Return ONLY valid JSON.
Do not include markdown.
Do not include triple backticks.
Do not include any explanation before or after the JSON.

Use exactly this format:

{
  "trip_summary": "string",
  "total_estimated_budget": "string",
  "days": [
    {
      "day": 1,
      "title": "string",
      "activities": {
        "morning": ["string", "string"],
        "afternoon": ["string", "string"],
        "evening": ["string", "string"]
      },
      "estimated_cost": "string",
      "tips": "string"
    }
  ]
}
`;

    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content:
            "You are an expert travel planner. Return only valid JSON. Never use markdown or code fences.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const text = response.choices[0]?.message?.content || "";

    const cleaned = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let parsed: unknown;

    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("Invalid JSON from AI:", text);
      return NextResponse.json(
        {
          error: "AI returned invalid JSON",
          raw: text,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(parsed);
  } catch (error) {
    console.error("Generate itinerary error:", error);
    return NextResponse.json(
      { error: "Something went wrong while generating the itinerary" },
      { status: 500 }
    );
  }
}