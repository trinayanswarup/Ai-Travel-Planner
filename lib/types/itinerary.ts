export type Budget = "low" | "medium" | "high";

export type TravelStyle =
  | "relaxed"
  | "packed"
  | "nightlife"
  | "cultural"
  | "nature";

export interface ItineraryRequest {
  destination: string;
  numberOfDays: number;
  budget: Budget;
  travelStyle: TravelStyle;
  interests: string;
}

export interface ItineraryDay {
  day: number;
  title: string;
  activities: string[];
}

export interface ItineraryResponse {
  destination: string;
  summary: string;
  totalDays: number;
  budget: Budget;
  travelStyle: TravelStyle;
  days: ItineraryDay[];
}
