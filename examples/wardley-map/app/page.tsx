"use client";

import { useState } from "react";
import { WardleyCanvas } from "./components/WardleyCanvas";
import type { WardleyMapData } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";

// Sample data for demonstration
const SAMPLE_MAP: WardleyMapData = {
  title: "Example Wardley Map",
  components: [
    { id: uuidv4(), name: "User", evolution: 0.15, visibility: 0.95 },
    { id: uuidv4(), name: "Web Application", evolution: 0.45, visibility: 0.75 },
    { id: uuidv4(), name: "API Gateway", evolution: 0.55, visibility: 0.55 },
    { id: uuidv4(), name: "Database", evolution: 0.7, visibility: 0.35, inertia: true },
    { id: uuidv4(), name: "Cloud Hosting", evolution: 0.85, visibility: 0.15 },
  ],
  connections: [],
  pipelines: [],
  anchors: [],
};

// Add connections based on component IDs
SAMPLE_MAP.connections = [
  { id: uuidv4(), from: SAMPLE_MAP.components[0].id, to: SAMPLE_MAP.components[1].id },
  { id: uuidv4(), from: SAMPLE_MAP.components[1].id, to: SAMPLE_MAP.components[2].id },
  { id: uuidv4(), from: SAMPLE_MAP.components[2].id, to: SAMPLE_MAP.components[3].id },
  { id: uuidv4(), from: SAMPLE_MAP.components[3].id, to: SAMPLE_MAP.components[4].id },
];

const EMPTY_MAP: WardleyMapData = {
  title: "Untitled Map",
  components: [],
  connections: [],
  pipelines: [],
  anchors: [],
};

export default function Home() {
  const [mapData, setMapData] = useState<WardleyMapData>(SAMPLE_MAP);
  const [showSidebar, setShowSidebar] = useState(true);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMapData((prev) => ({ ...prev, title: e.target.value }));
  };

  const handleNewMap = () => {
    setMapData({ ...EMPTY_MAP, title: "Untitled Map" });
  };

  const handleLoadSample = () => {
    // Regenerate IDs for sample map
    const newComponents = SAMPLE_MAP.components.map((c) => ({ ...c, id: uuidv4() }));
    const newConnections = [
      { id: uuidv4(), from: newComponents[0].id, to: newComponents[1].id },
      { id: uuidv4(), from: newComponents[1].id, to: newComponents[2].id },
      { id: uuidv4(), from: newComponents[2].id, to: newComponents[3].id },
      { id: uuidv4(), from: newComponents[3].id, to: newComponents[4].id },
    ];
    setMapData({
      ...SAMPLE_MAP,
      components: newComponents,
      connections: newConnections,
    });
  };

  const handleExport = () => {
    const dataStr = JSON.stringify(mapData, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${mapData.title.replace(/\s+/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const data = JSON.parse(e.target?.result as string);
            setMapData(data);
          } catch {
            alert("Invalid JSON file");
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      {showSidebar && (
        <div className="w-72 bg-amber-50 border-r border-amber-200 flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-amber-200">
            <h1 className="text-xl font-bold text-amber-900 font-sketch">
              Wardley Map
            </h1>
            <p className="text-sm text-amber-700 mt-1">
              Strategic mapping tool
            </p>
          </div>

          {/* Map title */}
          <div className="p-4 border-b border-amber-200">
            <label className="block text-sm font-medium text-amber-800 mb-2">
              Map Title
            </label>
            <input
              type="text"
              value={mapData.title}
              onChange={handleTitleChange}
              className="w-full px-3 py-2 bg-white border border-amber-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 font-sketch text-lg"
            />
          </div>

          {/* Actions */}
          <div className="p-4 space-y-2">
            <button
              onClick={handleNewMap}
              className="w-full px-4 py-2 bg-white border border-amber-300 rounded-md hover:bg-amber-100 text-amber-800 font-medium text-sm"
            >
              New Map
            </button>
            <button
              onClick={handleLoadSample}
              className="w-full px-4 py-2 bg-white border border-amber-300 rounded-md hover:bg-amber-100 text-amber-800 font-medium text-sm"
            >
              Load Sample
            </button>
            <div className="flex gap-2">
              <button
                onClick={handleImport}
                className="flex-1 px-4 py-2 bg-white border border-amber-300 rounded-md hover:bg-amber-100 text-amber-800 font-medium text-sm"
              >
                Import
              </button>
              <button
                onClick={handleExport}
                className="flex-1 px-4 py-2 bg-amber-500 text-white rounded-md hover:bg-amber-600 font-medium text-sm"
              >
                Export
              </button>
            </div>
          </div>

          {/* Legend */}
          <div className="p-4 border-t border-amber-200 flex-1">
            <h3 className="text-sm font-medium text-amber-800 mb-3">Legend</h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full border-2 border-gray-600 bg-white" />
                <span className="text-amber-700">Component</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full border-2 border-gray-600 bg-amber-400" />
                <span className="text-amber-700">Component with Inertia</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-6 border-t-2 border-gray-600" />
                <span className="text-amber-700">Dependency</span>
              </div>
            </div>

            <h3 className="text-sm font-medium text-amber-800 mt-6 mb-3">
              Evolution Stages
            </h3>
            <div className="space-y-2 text-xs text-amber-600">
              <div className="flex justify-between">
                <span>Genesis</span>
                <span>Novel, uncertain</span>
              </div>
              <div className="flex justify-between">
                <span>Custom</span>
                <span>Emerging, learning</span>
              </div>
              <div className="flex justify-between">
                <span>Product</span>
                <span>Feature competition</span>
              </div>
              <div className="flex justify-between">
                <span>Commodity</span>
                <span>Utility, standard</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-amber-200 text-xs text-amber-600">
            Inspired by Simon Wardley&apos;s mapping technique
          </div>
        </div>
      )}

      {/* Main canvas area */}
      <div className="flex-1 flex flex-col">
        {/* Toggle sidebar button */}
        <button
          onClick={() => setShowSidebar(!showSidebar)}
          className="absolute top-2 left-2 z-10 w-8 h-8 bg-amber-100 border border-amber-300 rounded flex items-center justify-center hover:bg-amber-200"
          style={{ left: showSidebar ? "280px" : "8px" }}
        >
          {showSidebar ? "◀" : "▶"}
        </button>

        {/* Canvas */}
        <WardleyCanvas data={mapData} onChange={setMapData} />
      </div>
    </div>
  );
}
