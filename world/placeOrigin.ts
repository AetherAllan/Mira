import { isWeekendLocalDate } from "@/platform/time";

export function optionalPlaceOriginRole(localDate: string): "home" | "work" {
  return isWeekendLocalDate(localDate) ? "home" : "work";
}
