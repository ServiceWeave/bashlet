// Wardley Map Types

export interface WardleyComponent {
  id: string;
  name: string;
  // X position: 0 = Genesis, 1 = Commodity
  evolution: number;
  // Y position: 0 = Invisible (Infrastructure), 1 = Visible (User)
  visibility: number;
  // Optional properties
  inertia?: boolean;
  label?: string;
}

export interface WardleyConnection {
  id: string;
  from: string; // Component ID
  to: string; // Component ID
}

export interface WardleyPipeline {
  id: string;
  componentId: string;
  evolutionStart: number;
  evolutionEnd: number;
}

export interface WardleyAnchor {
  id: string;
  name: string;
  visibility: number;
}

export interface WardleyMapData {
  title: string;
  components: WardleyComponent[];
  connections: WardleyConnection[];
  pipelines: WardleyPipeline[];
  anchors: WardleyAnchor[];
}

export type Tool = "select" | "component" | "connection" | "pipeline" | "anchor" | "pan";

export interface CanvasState {
  zoom: number;
  panX: number;
  panY: number;
  selectedId: string | null;
  tool: Tool;
}

// Evolution stages on X-axis
export const EVOLUTION_STAGES = [
  { label: "Genesis", position: 0 },
  { label: "Custom", position: 0.25 },
  { label: "Product", position: 0.55 },
  { label: "Commodity", position: 0.85 },
] as const;

// Value chain labels on Y-axis
export const VALUE_CHAIN_LABELS = [
  { label: "Visible", position: 1 },
  { label: "Invisible", position: 0 },
] as const;
