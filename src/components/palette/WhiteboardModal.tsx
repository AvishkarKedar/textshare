"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useAnon } from "@/lib/store";
import { addWhiteboardStroke, clearWhiteboardStrokes } from "@/lib/session";
import {
  X,
  Pencil,
  Highlighter,
  Eraser,
  Square,
  Circle,
  Minus,
  Download,
  Trash2,
  Undo2,
  Redo2,
  Grid,
  Maximize2,
  Minimize2,
  Palette,
} from "lucide-react";

export interface Point {
  x: number;
  y: number;
}

export interface WhiteboardStroke {
  id: string;
  tool: "pen" | "highlighter" | "eraser" | "line" | "rect" | "circle";
  color: string;
  size: number;
  points: Point[];
}

const COLORS = [
  "#ffffff",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#bd93f9",
  "#ec4899",
  "#94a3b8",
];

const SIZES = [
  { label: "S", val: 2 },
  { label: "M", val: 5 },
  { label: "L", val: 12 },
  { label: "XL", val: 24 },
];

export function WhiteboardModal() {
  const s = useAnon();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<WhiteboardStroke["tool"]>("pen");
  const [color, setColor] = useState<string>("#3b82f6");
  const [size, setSize] = useState<number>(5);
  const [gridMode, setGridMode] = useState<"grid" | "dots" | "none">("grid");
  const [currentStroke, setCurrentStroke] = useState<Point[] | null>(null);
  const [undoneStrokes, setUndoneStrokes] = useState<WhiteboardStroke[]>([]);
  const [fullscreen, setFullscreen] = useState(false);

  const strokes = s.whiteboardStrokes || [];

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Reset transform & clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw grid background
    if (gridMode === "grid") {
      ctx.save();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
      ctx.lineWidth = 1;
      const gridSize = 32;
      for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
      ctx.restore();
    } else if (gridMode === "dots") {
      ctx.save();
      ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
      const dotSpacing = 32;
      for (let x = 16; x < canvas.width; x += dotSpacing) {
        for (let y = 16; y < canvas.height; y += dotSpacing) {
          ctx.beginPath();
          ctx.arc(x, y, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    // Helper to render a single stroke
    function drawStroke(st: WhiteboardStroke) {
      if (!ctx || st.points.length === 0) return;
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = st.size;

      if (st.tool === "eraser") {
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = "rgba(0,0,0,1)";
      } else if (st.tool === "highlighter") {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = st.color;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = st.size * 2.5;
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = st.color;
        ctx.globalAlpha = 1;
      }

      if (st.tool === "line") {
        if (st.points.length >= 2) {
          const p1 = st.points[0];
          const p2 = st.points[st.points.length - 1];
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      } else if (st.tool === "rect") {
        if (st.points.length >= 2) {
          const p1 = st.points[0];
          const p2 = st.points[st.points.length - 1];
          ctx.beginPath();
          ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
        }
      } else if (st.tool === "circle") {
        if (st.points.length >= 2) {
          const p1 = st.points[0];
          const p2 = st.points[st.points.length - 1];
          const rx = Math.abs(p2.x - p1.x) / 2;
          const ry = Math.abs(p2.y - p1.y) / 2;
          const cx = Math.min(p1.x, p2.x) + rx;
          const cy = Math.min(p1.y, p2.y) + ry;
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else {
        // Freehand pen / highlighter / eraser
        ctx.beginPath();
        ctx.moveTo(st.points[0].x, st.points[0].y);
        for (let i = 1; i < st.points.length; i++) {
          ctx.lineTo(st.points[i].x, st.points[i].y);
        }
        ctx.stroke();
      }

      ctx.restore();
    }

    // Render committed strokes
    strokes.forEach(drawStroke);

    // Render active drawing stroke
    if (currentStroke && currentStroke.length > 0) {
      drawStroke({
        id: "active",
        tool,
        color,
        size,
        points: currentStroke,
      });
    }
  }, [strokes, currentStroke, tool, color, size, gridMode]);

  // Adjust canvas pixel resolution to container size
  useEffect(() => {
    if (!s.whiteboardOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const rect = parent.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    redrawCanvas();

    const handleResize = () => {
      const r = parent.getBoundingClientRect();
      canvas.width = r.width;
      canvas.height = r.height;
      redrawCanvas();
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [s.whiteboardOpen, fullscreen, redrawCanvas]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  if (!s.whiteboardOpen) return null;

  function getCanvasCoords(e: React.PointerEvent<HTMLCanvasElement>): Point {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const pt = getCanvasCoords(e);
    setCurrentStroke([pt]);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!currentStroke) return;
    const pt = getCanvasCoords(e);
    setCurrentStroke((prev) => (prev ? [...prev, pt] : [pt]));
  }

  function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch (err) {}

    if (!currentStroke || currentStroke.length === 0) {
      setCurrentStroke(null);
      return;
    }

    const stroke: WhiteboardStroke = {
      id: `stroke_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      tool,
      color,
      size,
      points: currentStroke,
    };

    addWhiteboardStroke(stroke);
    s.addWhiteboardStrokeLocal(stroke);
    setUndoneStrokes([]);
    setCurrentStroke(null);
  }

  function handleUndo() {
    if (strokes.length === 0) return;
    const last = strokes[strokes.length - 1];
    setUndoneStrokes((prev) => [...prev, last]);
    s.popWhiteboardStrokeLocal();
  }

  function handleRedo() {
    if (undoneStrokes.length === 0) return;
    const next = undoneStrokes[undoneStrokes.length - 1];
    setUndoneStrokes((prev) => prev.slice(0, -1));
    addWhiteboardStroke(next);
    s.addWhiteboardStrokeLocal(next);
  }

  function handleClear() {
    if (confirm("Clear all whiteboard drawings?")) {
      clearWhiteboardStrokes();
      s.clearWhiteboardStrokesLocal();
      setUndoneStrokes([]);
    }
  }

  function handleExport() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `whiteboard-${s.roomCode || "draft"}-${Date.now()}.png`;
    a.click();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 animate-in fade-in">
      <div
        className={`relative flex flex-col bg-[var(--anon-panel)] hairline-all rounded-lg shadow-2xl overflow-hidden transition-all duration-200 ${
          fullscreen ? "w-full h-full m-0 rounded-none" : "w-full max-w-5xl h-[85vh]"
        }`}
      >
        {/* Top Control Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 hairline-b bg-[var(--anon-raise)]">
          {/* Tool selectors */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setTool("pen")}
              className={`p-1.5 rounded transition-colors ${
                tool === "pen" ? "bg-[var(--anon-panel)] anon-accent font-semibold" : "anon-mut hover:anon-fg"
              }`}
              title="Pen tool"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={() => setTool("highlighter")}
              className={`p-1.5 rounded transition-colors ${
                tool === "highlighter" ? "bg-[var(--anon-panel)] anon-accent font-semibold" : "anon-mut hover:anon-fg"
              }`}
              title="Highlighter"
            >
              <Highlighter className="h-4 w-4" />
            </button>
            <button
              onClick={() => setTool("line")}
              className={`p-1.5 rounded transition-colors ${
                tool === "line" ? "bg-[var(--anon-panel)] anon-accent font-semibold" : "anon-mut hover:anon-fg"
              }`}
              title="Line"
            >
              <Minus className="h-4 w-4" />
            </button>
            <button
              onClick={() => setTool("rect")}
              className={`p-1.5 rounded transition-colors ${
                tool === "rect" ? "bg-[var(--anon-panel)] anon-accent font-semibold" : "anon-mut hover:anon-fg"
              }`}
              title="Rectangle"
            >
              <Square className="h-4 w-4" />
            </button>
            <button
              onClick={() => setTool("circle")}
              className={`p-1.5 rounded transition-colors ${
                tool === "circle" ? "bg-[var(--anon-panel)] anon-accent font-semibold" : "anon-mut hover:anon-fg"
              }`}
              title="Circle / Ellipse"
            >
              <Circle className="h-4 w-4" />
            </button>
            <button
              onClick={() => setTool("eraser")}
              className={`p-1.5 rounded transition-colors ${
                tool === "eraser" ? "bg-[var(--anon-panel)] anon-accent font-semibold" : "anon-mut hover:anon-fg"
              }`}
              title="Eraser"
            >
              <Eraser className="h-4 w-4" />
            </button>
          </div>

          {/* Color palette */}
          <div className="flex items-center gap-1.5 hairline-l pl-2">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`h-5 w-5 rounded-full border border-black/30 transition-transform ${
                  color === c ? "scale-125 ring-2 ring-[var(--anon-accent)]" : "hover:scale-110"
                }`}
                style={{ background: c }}
                title={`Color ${c}`}
              />
            ))}
          </div>

          {/* Stroke size selector */}
          <div className="flex items-center gap-1 hairline-l pl-2">
            {SIZES.map((s) => (
              <button
                key={s.label}
                onClick={() => setSize(s.val)}
                className={`px-2 py-0.5 anon-mono text-[10px] rounded transition-colors ${
                  size === s.val ? "bg-[var(--anon-panel)] anon-accent font-bold" : "anon-mut hover:anon-fg"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Utility actions */}
          <div className="flex items-center gap-1 ml-auto">
            <button
              onClick={handleUndo}
              disabled={strokes.length === 0}
              className="p-1.5 rounded anon-mut hover:anon-fg disabled:opacity-40 transition-colors"
              title="Undo (⌘Z)"
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              onClick={handleRedo}
              disabled={undoneStrokes.length === 0}
              className="p-1.5 rounded anon-mut hover:anon-fg disabled:opacity-40 transition-colors"
              title="Redo (⌘⇧Z)"
            >
              <Redo2 className="h-4 w-4" />
            </button>
            <button
              onClick={() => setGridMode((g) => (g === "grid" ? "dots" : g === "dots" ? "none" : "grid"))}
              className="p-1.5 rounded anon-mut hover:anon-fg transition-colors"
              title={`Grid mode: ${gridMode}`}
            >
              <Grid className="h-4 w-4" />
            </button>
            <button
              onClick={handleExport}
              className="p-1.5 rounded anon-mut hover:anon-fg transition-colors"
              title="Export as PNG"
            >
              <Download className="h-4 w-4" />
            </button>
            <button
              onClick={handleClear}
              className="p-1.5 rounded text-[var(--anon-danger)] hover:bg-[var(--anon-danger)]/10 transition-colors"
              title="Clear Whiteboard"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              onClick={() => setFullscreen((f) => !f)}
              className="p-1.5 rounded anon-mut hover:anon-fg transition-colors hidden sm:inline-block"
              title="Toggle Fullscreen"
            >
              {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
            <button
              onClick={() => s.toggleWhiteboard()}
              className="p-1.5 rounded anon-mut hover:anon-fg transition-colors ml-1"
              title="Close Whiteboard (Esc)"
              aria-label="Close Whiteboard"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Canvas Body */}
        <div className="relative flex-1 bg-[var(--anon-bg)] cursor-crosshair overflow-hidden touch-none">
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="w-full h-full block"
          />
        </div>
      </div>
    </div>
  );
}
