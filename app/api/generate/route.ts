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

    const prompt = `
Generate a personalized travel itinerary.

Trip details:
- Destination: ${destination}
- Number of days: ${days}
- Budget: ${budget}
- Travel style: ${style}
- Interests: ${interests}

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