import type { Budget, TravelStyle } from "@/lib/types/itinerary";

export type FormDataState = {
  tripTitle: string;
  destination: string;
  startDate: string;
  endDate: string;
  budget: Budget;
  travelStyle: TravelStyle;
  interests: string;
};

export type ItineraryDay = {
  day: number;
  title: string;
  activities: {
    morning: string[];
    afternoon: string[];
    evening: string[];
  };
  estimated_cost: string;
  tips: string;
};

export type ItineraryResponse = {
  trip_summary: string;
  total_estimated_budget: string;
  days: ItineraryDay[];
};

export type ChecklistItem = {
  id: number;
  text: string;
  done: boolean;
};

export type PersistedTripPayload = {
  formData: FormDataState;
  days: number;
  notes: string;
  checklist: ChecklistItem[];
  itinerary: ItineraryResponse;
};

export type SavedTrip = PersistedTripPayload & {
  id: string;
  createdAt: string;
  updatedAt: string;
};
