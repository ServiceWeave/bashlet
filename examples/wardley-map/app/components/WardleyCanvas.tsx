"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import rough from "roughjs";
import type { RoughCanvas } from "roughjs/bin/canvas";
import type {
  WardleyMapData,
  WardleyComponent,
  WardleyConnection,
  CanvasState,
  Tool,
} from "@/lib/types";
import { EVOLUTION_STAGES } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";

interface WardleyCanvasProps {
  data: WardleyMapData;
  onChange: (data: WardleyMapData) => void;
}

const PADDING = 60;
const COMPONENT_RADIUS = 6;

export function WardleyCanvas({ data, onChange }: WardleyCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const roughCanvasRef = useRef<RoughCanvas | null>(null);

  const [canvasState, setCanvasState] = useState<CanvasState>({
    zoom: 1,
    panX: 0,
    panY: 0,
    selectedId: null,
    tool: "select",
  });

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [connectionStart, setConnectionStart] = useState<string | null>(null);
  const [editingComponent, setEditingComponent] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  // Convert map coordinates to canvas coordinates
  const mapToCanvas = useCallback(
    (evolution: number, visibility: number, width: number, height: number) => {
      const drawWidth = width - PADDING * 2;
      const drawHeight = height - PADDING * 2;
      return {
        x: PADDING + evolution * drawWidth + canvasState.panX,
        y: PADDING + (1 - visibility) * drawHeight + canvasState.panY,
      };
    },
    [canvasState.panX, canvasState.panY]
  );

  // Convert canvas coordinates to map coordinates
  const canvasToMap = useCallback(
    (x: number, y: number, width: number, height: number) => {
      const drawWidth = width - PADDING * 2;
      const drawHeight = height - PADDING * 2;
      const evolution = Math.max(0, Math.min(1, (x - PADDING - canvasState.panX) / drawWidth));
      const visibility = Math.max(0, Math.min(1, 1 - (y - PADDING - canvasState.panY) / drawHeight));
      return { evolution, visibility };
    },
    [canvasState.panX, canvasState.panY]
  );

  // Find component at position
  const findComponentAt = useCallback(
    (x: number, y: number, width: number, height: number): WardleyComponent | null => {
      for (const component of data.components) {
        const pos = mapToCanvas(component.evolution, component.visibility, width, height);
        const dx = x - pos.x;
        const dy = y - pos.y;
        if (Math.sqrt(dx * dx + dy * dy) < COMPONENT_RADIUS + 10) {
          return component;
        }
      }
      return null;
    },
    [data.components, mapToCanvas]
  );

  // Draw the canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rc = rough.canvas(canvas);
    roughCanvasRef.current = rc;

    const width = canvas.width;
    const height = canvas.height;
    const drawWidth = width - PADDING * 2;
    const drawHeight = height - PADDING * 2;

    // Clear canvas
    ctx.fillStyle = "#faf9f6";
    ctx.fillRect(0, 0, width, height);

    // Draw rough paper texture background
    ctx.save();
    ctx.globalAlpha = 0.03;
    for (let i = 0; i < 100; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      ctx.fillStyle = "#000";
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.restore();

    // Draw sketch-style border
    rc.rectangle(PADDING - 5, PADDING - 5, drawWidth + 10, drawHeight + 10, {
      roughness: 1.5,
      stroke: "#666",
      strokeWidth: 1.5,
      bowing: 2,
    });

    // Draw evolution axis labels
    ctx.font = "14px Caveat, cursive, sans-serif";
    ctx.fillStyle = "#444";
    ctx.textAlign = "center";

    EVOLUTION_STAGES.forEach((stage) => {
      const x = PADDING + stage.position * drawWidth + canvasState.panX;

      // Draw tick mark
      rc.line(x, PADDING + drawHeight + canvasState.panY, x, PADDING + drawHeight + 10 + canvasState.panY, {
        roughness: 1,
        stroke: "#888",
      });

      ctx.fillText(stage.label, x, PADDING + drawHeight + 30 + canvasState.panY);
    });

    // Draw evolution axis line
    rc.line(
      PADDING + canvasState.panX,
      PADDING + drawHeight + canvasState.panY,
      PADDING + drawWidth + canvasState.panX,
      PADDING + drawHeight + canvasState.panY,
      { roughness: 1.2, stroke: "#666", strokeWidth: 1.5 }
    );

    // Draw evolution axis arrow and label
    ctx.save();
    ctx.font = "16px Caveat, cursive, sans-serif";
    ctx.fillStyle = "#555";
    ctx.textAlign = "center";
    ctx.fillText("Evolution", PADDING + drawWidth / 2, height - 10);
    ctx.restore();

    // Draw value chain axis (Y-axis)
    rc.line(
      PADDING + canvasState.panX,
      PADDING + canvasState.panY,
      PADDING + canvasState.panX,
      PADDING + drawHeight + canvasState.panY,
      { roughness: 1.2, stroke: "#666", strokeWidth: 1.5 }
    );

    // Draw value chain labels
    ctx.save();
    ctx.font = "14px Caveat, cursive, sans-serif";
    ctx.fillStyle = "#444";
    ctx.textAlign = "right";
    ctx.fillText("Visible", PADDING - 15 + canvasState.panX, PADDING + 5 + canvasState.panY);
    ctx.fillText("Invisible", PADDING - 15 + canvasState.panX, PADDING + drawHeight + 5 + canvasState.panY);

    // Value chain label (rotated)
    ctx.save();
    ctx.translate(15, PADDING + drawHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.font = "16px Caveat, cursive, sans-serif";
    ctx.fillStyle = "#555";
    ctx.textAlign = "center";
    ctx.fillText("Value Chain", 0, 0);
    ctx.restore();
    ctx.restore();

    // Draw dashed evolution stage separator lines
    EVOLUTION_STAGES.slice(1).forEach((stage) => {
      const x = PADDING + stage.position * drawWidth + canvasState.panX;
      rc.line(x, PADDING + canvasState.panY, x, PADDING + drawHeight + canvasState.panY, {
        roughness: 0.8,
        stroke: "#ccc",
        strokeWidth: 0.5,
        strokeLineDash: [5, 5],
      });
    });

    // Draw connections
    data.connections.forEach((conn) => {
      const fromComponent = data.components.find((c) => c.id === conn.from);
      const toComponent = data.components.find((c) => c.id === conn.to);
      if (!fromComponent || !toComponent) return;

      const from = mapToCanvas(fromComponent.evolution, fromComponent.visibility, width, height);
      const to = mapToCanvas(toComponent.evolution, toComponent.visibility, width, height);

      rc.line(from.x, from.y, to.x, to.y, {
        roughness: 1.2,
        stroke: canvasState.selectedId === conn.id ? "#3b82f6" : "#666",
        strokeWidth: canvasState.selectedId === conn.id ? 2 : 1.5,
      });

      // Draw arrow head
      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      const arrowLength = 10;
      const arrowAngle = Math.PI / 6;

      const arrowX = to.x - COMPONENT_RADIUS * Math.cos(angle);
      const arrowY = to.y - COMPONENT_RADIUS * Math.sin(angle);

      rc.line(
        arrowX,
        arrowY,
        arrowX - arrowLength * Math.cos(angle - arrowAngle),
        arrowY - arrowLength * Math.sin(angle - arrowAngle),
        { roughness: 1, stroke: "#666", strokeWidth: 1.5 }
      );
      rc.line(
        arrowX,
        arrowY,
        arrowX - arrowLength * Math.cos(angle + arrowAngle),
        arrowY - arrowLength * Math.sin(angle + arrowAngle),
        { roughness: 1, stroke: "#666", strokeWidth: 1.5 }
      );
    });

    // Draw pipelines
    data.pipelines.forEach((pipeline) => {
      const component = data.components.find((c) => c.id === pipeline.componentId);
      if (!component) return;

      const start = mapToCanvas(pipeline.evolutionStart, component.visibility, width, height);
      const end = mapToCanvas(pipeline.evolutionEnd, component.visibility, width, height);

      rc.rectangle(
        start.x,
        start.y - 15,
        end.x - start.x,
        30,
        {
          roughness: 1.5,
          stroke: canvasState.selectedId === pipeline.id ? "#3b82f6" : "#888",
          strokeWidth: canvasState.selectedId === pipeline.id ? 2 : 1,
          fill: "rgba(200, 200, 200, 0.2)",
          fillStyle: "hachure",
          hachureGap: 8,
        }
      );
    });

    // Draw components
    data.components.forEach((component) => {
      const pos = mapToCanvas(component.evolution, component.visibility, width, height);
      const isSelected = canvasState.selectedId === component.id;

      // Draw component circle
      rc.circle(pos.x, pos.y, COMPONENT_RADIUS * 2, {
        roughness: 1.5,
        stroke: isSelected ? "#3b82f6" : "#333",
        strokeWidth: isSelected ? 2.5 : 2,
        fill: component.inertia ? "#fbbf24" : "#fff",
        fillStyle: "solid",
      });

      // Draw inertia indicator
      if (component.inertia) {
        rc.line(pos.x + COMPONENT_RADIUS + 5, pos.y, pos.x + COMPONENT_RADIUS + 20, pos.y, {
          roughness: 1,
          stroke: "#666",
          strokeWidth: 1.5,
        });
        rc.line(pos.x + COMPONENT_RADIUS + 15, pos.y - 5, pos.x + COMPONENT_RADIUS + 20, pos.y, {
          roughness: 1,
          stroke: "#666",
          strokeWidth: 1.5,
        });
        rc.line(pos.x + COMPONENT_RADIUS + 15, pos.y + 5, pos.x + COMPONENT_RADIUS + 20, pos.y, {
          roughness: 1,
          stroke: "#666",
          strokeWidth: 1.5,
        });
      }

      // Draw component label
      ctx.font = "14px Caveat, cursive, sans-serif";
      ctx.fillStyle = "#333";
      ctx.textAlign = "left";
      ctx.fillText(component.name, pos.x + COMPONENT_RADIUS + 8, pos.y - 10);
    });

    // Draw anchors
    data.anchors.forEach((anchor) => {
      const pos = mapToCanvas(0, anchor.visibility, width, height);

      ctx.font = "bold 14px Caveat, cursive, sans-serif";
      ctx.fillStyle = "#666";
      ctx.textAlign = "left";
      ctx.fillText(anchor.name, pos.x - 50, pos.y);

      // Draw anchor bracket
      rc.line(pos.x - 55, pos.y - 15, pos.x - 55, pos.y + 5, {
        roughness: 1,
        stroke: "#888",
        strokeWidth: 1,
      });
    });

    // Draw title
    ctx.font = "bold 24px Caveat, cursive, sans-serif";
    ctx.fillStyle = "#333";
    ctx.textAlign = "center";
    ctx.fillText(data.title, width / 2, 30);

  }, [data, canvasState, mapToCanvas]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      draw();
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [draw]);

  // Redraw on data or state change
  useEffect(() => {
    draw();
  }, [draw]);

  // Mouse event handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (canvasState.tool === "select") {
      const component = findComponentAt(x, y, canvas.width, canvas.height);
      if (component) {
        setCanvasState((prev) => ({ ...prev, selectedId: component.id }));
        setIsDragging(true);
        setDragStart({ x, y });
      } else {
        setCanvasState((prev) => ({ ...prev, selectedId: null }));
      }
    } else if (canvasState.tool === "component") {
      const { evolution, visibility } = canvasToMap(x, y, canvas.width, canvas.height);
      const newComponent: WardleyComponent = {
        id: uuidv4(),
        name: "New Component",
        evolution,
        visibility,
      };
      onChange({
        ...data,
        components: [...data.components, newComponent],
      });
      setCanvasState((prev) => ({ ...prev, selectedId: newComponent.id, tool: "select" }));
      setEditingComponent(newComponent.id);
      setEditingName("New Component");
    } else if (canvasState.tool === "connection") {
      const component = findComponentAt(x, y, canvas.width, canvas.height);
      if (component) {
        if (!connectionStart) {
          setConnectionStart(component.id);
        } else if (connectionStart !== component.id) {
          const newConnection: WardleyConnection = {
            id: uuidv4(),
            from: connectionStart,
            to: component.id,
          };
          onChange({
            ...data,
            connections: [...data.connections, newConnection],
          });
          setConnectionStart(null);
          setCanvasState((prev) => ({ ...prev, tool: "select" }));
        }
      }
    } else if (canvasState.tool === "pan") {
      setIsDragging(true);
      setDragStart({ x, y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (canvasState.tool === "select" && canvasState.selectedId) {
      const { evolution, visibility } = canvasToMap(x, y, canvas.width, canvas.height);
      const updatedComponents = data.components.map((c) =>
        c.id === canvasState.selectedId ? { ...c, evolution, visibility } : c
      );
      onChange({ ...data, components: updatedComponents });
    } else if (canvasState.tool === "pan") {
      const dx = x - dragStart.x;
      const dy = y - dragStart.y;
      setCanvasState((prev) => ({
        ...prev,
        panX: prev.panX + dx,
        panY: prev.panY + dy,
      }));
      setDragStart({ x, y });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const component = findComponentAt(x, y, canvas.width, canvas.height);
    if (component) {
      setEditingComponent(component.id);
      setEditingName(component.name);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Delete" || e.key === "Backspace") {
      if (canvasState.selectedId && !editingComponent) {
        // Delete selected component
        const isComponent = data.components.some((c) => c.id === canvasState.selectedId);
        if (isComponent) {
          onChange({
            ...data,
            components: data.components.filter((c) => c.id !== canvasState.selectedId),
            connections: data.connections.filter(
              (conn) => conn.from !== canvasState.selectedId && conn.to !== canvasState.selectedId
            ),
          });
        } else {
          // Delete connection
          onChange({
            ...data,
            connections: data.connections.filter((c) => c.id !== canvasState.selectedId),
          });
        }
        setCanvasState((prev) => ({ ...prev, selectedId: null }));
      }
    } else if (e.key === "Escape") {
      setConnectionStart(null);
      setEditingComponent(null);
      setCanvasState((prev) => ({ ...prev, tool: "select" }));
    }
  };

  const handleNameSubmit = () => {
    if (editingComponent) {
      const updatedComponents = data.components.map((c) =>
        c.id === editingComponent ? { ...c, name: editingName } : c
      );
      onChange({ ...data, components: updatedComponents });
      setEditingComponent(null);
    }
  };

  const setTool = (tool: Tool) => {
    setCanvasState((prev) => ({ ...prev, tool }));
    setConnectionStart(null);
  };

  const toggleInertia = () => {
    if (canvasState.selectedId) {
      const updatedComponents = data.components.map((c) =>
        c.id === canvasState.selectedId ? { ...c, inertia: !c.inertia } : c
      );
      onChange({ ...data, components: updatedComponents });
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-3 bg-amber-50 border-b border-amber-200">
        <div className="flex items-center gap-1 mr-4">
          <ToolButton
            icon="↖"
            label="Select"
            active={canvasState.tool === "select"}
            onClick={() => setTool("select")}
          />
          <ToolButton
            icon="◯"
            label="Component"
            active={canvasState.tool === "component"}
            onClick={() => setTool("component")}
          />
          <ToolButton
            icon="→"
            label="Connection"
            active={canvasState.tool === "connection"}
            onClick={() => setTool("connection")}
          />
          <ToolButton
            icon="✋"
            label="Pan"
            active={canvasState.tool === "pan"}
            onClick={() => setTool("pan")}
          />
        </div>

        <div className="h-6 w-px bg-amber-300 mx-2" />

        <button
          onClick={toggleInertia}
          disabled={!canvasState.selectedId}
          className="px-3 py-1.5 text-sm bg-amber-100 hover:bg-amber-200 disabled:opacity-50 disabled:cursor-not-allowed rounded border border-amber-300 font-medium"
          title="Toggle Inertia"
        >
          ⚡ Inertia
        </button>

        {connectionStart && (
          <span className="ml-4 text-sm text-amber-700">
            Click target component to complete connection...
          </span>
        )}
      </div>

      {/* Canvas container */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 cursor-crosshair"
          style={{
            cursor:
              canvasState.tool === "pan"
                ? "grab"
                : canvasState.tool === "select"
                ? "default"
                : "crosshair",
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onDoubleClick={handleDoubleClick}
        />

        {/* Edit component name input */}
        {editingComponent && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white p-4 rounded-lg shadow-lg border border-amber-300">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Component Name
            </label>
            <input
              type="text"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleNameSubmit();
                if (e.key === "Escape") setEditingComponent(null);
              }}
              className="w-64 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => setEditingComponent(null)}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleNameSubmit}
                className="px-3 py-1.5 text-sm bg-amber-500 text-white rounded hover:bg-amber-600"
              >
                Save
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-amber-50 border-t border-amber-200 text-sm text-amber-800">
        <span>
          {data.components.length} components, {data.connections.length} connections
        </span>
        <span className="text-amber-600">
          Double-click to edit • Delete/Backspace to remove • Escape to cancel
        </span>
      </div>
    </div>
  );
}

interface ToolButtonProps {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
}

function ToolButton({ icon, label, active, onClick }: ToolButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`w-9 h-9 flex items-center justify-center rounded border transition-colors ${
        active
          ? "bg-amber-500 text-white border-amber-600"
          : "bg-white text-amber-800 border-amber-300 hover:bg-amber-100"
      }`}
      title={label}
    >
      {icon}
    </button>
  );
}
