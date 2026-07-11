import { buildTemporalContext } from "@/platform/time";
import type { WorldHealth } from "@/world/health";

export function buildTodayWorldView<
  TBlock extends { id: string },
  TPlace extends { id: string },
>(input: {
  observedAt: Date;
  timeZone: string;
  lastWorldTickAt: Date;
  currentScheduleBlockId: string | null;
  currentLocationId: string | null;
  schedule: TBlock[];
  places: TPlace[];
  health: WorldHealth;
}) {
  const temporal = buildTemporalContext({
    observedAt: input.observedAt,
    worldAdvancedThrough: input.lastWorldTickAt,
    timeZone: input.timeZone,
  });
  const confirmedBlock = input.schedule.find(
    (block) => block.id === input.currentScheduleBlockId,
  );
  const confirmedPlace = input.places.find(
    (place) => place.id === input.currentLocationId,
  );

  return {
    temporal,
    currentBlock: input.health.currentBlockConsistent ? confirmedBlock ?? null : null,
    currentPlace: input.health.worldStateFresh ? confirmedPlace ?? null : null,
    lastConfirmedPlace: input.health.worldStateFresh ? null : confirmedPlace ?? null,
  };
}
