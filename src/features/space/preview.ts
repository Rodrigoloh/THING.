export function recentThingItems<T extends { thing_id: string }>(items: T[], thingId: string, limit: number): T[] {
  return items.filter((item) => item.thing_id === thingId).slice(0, limit);
}
