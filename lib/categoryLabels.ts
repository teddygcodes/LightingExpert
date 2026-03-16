export const CATEGORY_LABELS: Record<string, string> = {
  TROFFER: 'Troffers',
  FLAT_PANEL: 'Flat Panels',
  DOWNLIGHT: 'Downlights',
  WAFER: 'Wafers',
  RECESSED_CAN: 'Recessed Cans',
  HIGH_BAY: 'High Bays',
  LOW_BAY: 'Low Bays',
  STRIP: 'Strip Lights',
  LINEAR: 'Linear',
  WRAP: 'Wrap Fixtures',
  VAPOR_TIGHT: 'Vapor Tights',
  EXPLOSION_PROOF: 'Explosion Proof',
  AREA_LIGHT: 'Area Lights',
  WALL_PACK: 'Wall Packs',
  CANOPY: 'Canopy',
  PARKING_STRUCTURE: 'Parking Structure',
  FLOOD: 'Floodlights',
  BOLLARD: 'Bollards',
  STEP: 'Step Lights',
  UNDERWATER: 'Underwater',
  TRACK: 'Track',
  PENDANT: 'Pendants',
  CHANDELIER: 'Chandeliers',
  SCONCE: 'Sconces',
  UNDER_CABINET: 'Under Cabinet',
  COVE: 'Cove',
  OTHER: 'Other',
}

export function getCategoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat] ?? cat.replace(/_/g, ' ')
}
