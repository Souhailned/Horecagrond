/** Returns a Dutch label for a floor number. */
export function getFloorLabel(floor: number): string {
  if (floor < 0) return "Kelder";
  if (floor === 0) return "Begane grond";
  if (floor === 1) return "1e verdieping";
  if (floor === 2) return "2e verdieping";
  if (floor === 3) return "3e verdieping";
  return `${floor}e verdieping`;
}
