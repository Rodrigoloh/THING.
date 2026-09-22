import type { Thing } from "@/types/thing";

// Display-only fixtures. These do not simulate auth, membership, or persistence.
type MockThing = Thing & { otherPerson: string; activity: string };

export const mockThings: MockThing[] = [
  { id: "mariana", charm: "🍒", otherPerson: "Mariana", activity: "12 day streak", createdAt: "2026-09-01T00:00:00Z" },
  { id: "memo", charm: "🐒", otherPerson: "Memo", activity: "challenged you", createdAt: "2026-09-02T00:00:00Z" },
  { id: "ana", charm: "🌙", otherPerson: "Ana", activity: "3 moments", createdAt: "2026-09-03T00:00:00Z" },
];

export const mockJoinCode = "demo";
