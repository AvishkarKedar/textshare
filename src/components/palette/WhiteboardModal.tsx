"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Pen,
  Highlighter,
  Eraser,
  Trash2,
  Download,
  Undo2,
} from "lucide-react";
import { useAnon, type WhiteboardStroke } from "@/lib/store";
import { toast } from "sonner";

const COLORS = [
  "#4c8dff",
  "#3ddc84",
  "#e8b339",
  "#ff5c4d",
  "#c792ea",
  "#f472b6",
  "#ffffff",
];

const SIZES = [2, 4, 8, 14];

export function WhiteboardModal() {
  const s = useAnon();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<WhiteboardStroke | null>(null);
  const [history, setHistory] = useState<WhiteboardStroke[]>([]);

  // redraw on strokes change
  useEffect(() => {
    if (!s.whiteboardOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = cssVar("--anon-bg");
    ctx.fillRect(0, 0, rect.width, rect.height);
    // grid
    ctx.strokeStyle = cssVar("--anon-line");
    ctx.lineWidth = 1;
    const grid = 24;
    for (let x = 0; x < rect.width; x += grid) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, rect.height);
      ctx.stroke();
    }
    for (let y = 0; y < rect.height; y += grid) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(rect.width, y);
      ctx.stroke();
    }

    const all = [...s.whiteboardStrokes, ...(currentStroke ? [currentStroke] : [])];
    for (const stroke of all) {
      if (stroke.points.length < 2) continue;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (stroke.tool === "eraser") {
        ctx.strokeStyle = cssVar("--anon-bg");
        ctx.lineWidth = stroke.size * 4;
      } else if (stroke.tool === "highlighter") {
        ctx.strokeStyle = stroke.color;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = stroke.size * 2.5;
      } else {
        ctx.strokeStyle = stroke.color;
        ctx.globalAlpha = 1;
        ctx.lineWidth = stroke.size;
      }
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }, [s.whiteboardOpen, s.whiteboardStrokes, currentStroke]);

  function pos(e: React.PointerEvent): { x: number; y: number } {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = pos(e);
    setDrawing(true);
    setCurrentStroke({
      id: "st" + Date.now(),
      tool: s.whiteboardTool,
      color: s.whiteboardColor,
      size: s.whiteboardSize,
      points: [p],
    });
  }

  function onMove(e: React.PointerEvent) {
    if (!drawing || !currentStroke) return;
    const p = pos(e);
    setCurrentStroke({ ...currentStroke, points: [...currentStroke.points, p] });
  }

  function onUp() {
    if (!drawing || !currentStroke) return;
    if (currentStroke.points.length >= 2) {
      setHistory((h) => [...h, currentStroke]);
      s.addStroke(currentStroke);
    }
    setCurrentStroke(null);
    setDrawing(false);
  }

  function undo() {
    if (s.whiteboardStrokes.length === 0) return;
    const last = s.whiteboardStrokes[s.whiteboardStrokes.length - 1];
    // remove last stroke
    useAnon.setState((st) => ({
      whiteboardStrokes: st.whiteboardStrokes.slice(0, -1),
    }));
    void last;
  }

  function exportPng() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `anonshare-whiteboard-${s.roomCode || "ABC123"}.png`;
    a.click();
    toast.success("Whiteboard exported", { description: "Saved as PNG to your downloads." });
  }

  if (!s.whiteboardOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={() => s.toggleWhiteboard()}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 8 }}
          transition={{ duration: 0.16, ease: [0.22, 0.61, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="flex h-[80vh] w-full max-w-5xl flex-col hairline anon-panel shadow-2xl shadow-black/50"
        >
          {/* header */}
          <div className="flex h-10 items-center justify-between hairline-b px-3">
            <div className="anon-mono inline-flex items-center gap-2 text-xs">
              <Pen className="h-3.5 w-3.5 anon-accent" /> whiteboard · {s.roomCode || "ABC123"}
            </div>
            <div className="anon-mono text-[10px] anon-dim">
              {s.whiteboardStrokes.length} strokes · live sync
            </div>
            <button onClick={() => s.toggleWhiteboard()} className="anon-mut hover:anon-fg">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* toolbar */}
          <div className="flex h-10 items-center gap-2 hairline-b px-3">
            <div className="flex items-center gap-0.5">
              <ToolBtn icon={Pen} active={s.whiteboardTool === "pen"} onClick={() => s.setWhiteboardTool("pen")} label="Pen" />
              <ToolBtn icon={Highlighter} active={s.whiteboardTool === "highlighter"} onClick={() => s.setWhiteboardTool("highlighter")} label="Highlighter" />
              <ToolBtn icon={Eraser} active={s.whiteboardTool === "eraser"} onClick={() => s.setWhiteboardTool("eraser")} label="Eraser" />
            </div>
            <div className="hairline-l h-5" />
            <div className="flex items-center gap-1">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    s.setWhiteboardColor(c);
                    if (s.whiteboardTool === "eraser") s.setWhiteboardTool("pen");
                  }}
                  className={`h-5 w-5 transition-transform hover:scale-110 ${s.whiteboardColor === c ? "ring-2 ring-offset-1 ring-offset-[var(--anon-panel)]" : ""}`}
                  style={{
                    background: c,
                    outline: s.whiteboardColor === c ? `1.5px solid var(--anon-fg)` : "none",
                    outlineOffset: 1,
                  }}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
            <div className="hairline-l h-5" />
            <div className="flex items-center gap-1">
              {SIZES.map((sz) => (
                <button
                  key={sz}
                  onClick={() => s.setWhiteboardSize(sz)}
                  className={`flex h-6 w-6 items-center justify-center hairline ${s.whiteboardSize === sz ? "bg-[var(--anon-panel)]" : "hover:bg-[var(--anon-panel)]"}`}
                  aria-label={`Size ${sz}`}
                >
                  <span
                    className="rounded-full"
                    style={{
                      background: "var(--anon-fg)",
                      width: sz + 1,
                      height: sz + 1,
                    }}
                  />
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={undo}
                className="anon-mono inline-flex items-center gap-1 px-2 py-1 text-[10px] anon-mut hover:anon-fg hairline"
                title="Undo last stroke"
              >
                <Undo2 className="h-3 w-3" /> undo
              </button>
              <button
                onClick={() => {
                  if (confirm("Clear the whiteboard? This syncs to everyone.")) {
                    s.clearWhiteboard();
                    setHistory([]);
                  }
                }}
                className="anon-mono inline-flex items-center gap-1 px-2 py-1 text-[10px] anon-mut hover:anon-fg hairline"
              >
                <Trash2 className="h-3 w-3" /> clear
              </button>
              <button
                onClick={exportPng}
                className="anon-mono inline-flex items-center gap-1 px-2 py-1 text-[10px] bg-[var(--anon-accent)] text-[var(--anon-accent-fg)] hover:brightness-110"
              >
                <Download className="h-3 w-3" /> png
              </button>
            </div>
          </div>

          {/* canvas */}
          <div className="relative flex-1 bg-[var(--anon-bg)]">
            <canvas
              ref={canvasRef}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerLeave={onUp}
              className="h-full w-full touch-none"
              style={{ cursor: s.whiteboardTool === "eraser" ? "cell" : "crosshair" }}
            />
            {/* collaborator cursor ghosts */}
            <div
              className="pointer-events-none absolute h-4 w-4 rounded-full anim-pulse-ring"
              style={{ top: "30%", left: "60%", background: "#3ddc84" }}
            />
            <span
              className="anon-mono pointer-events-none absolute -top-3 left-2 px-1 text-[9px] text-black"
              style={{ background: "#3ddc84", top: "30%", left: "60%", transform: "translate(8px, -16px)" }}
            >
              AV
            </span>
          </div>

          <div className="hairline-t px-3 py-1.5 anon-mono text-[10px] anon-dim flex items-center justify-between">
            <span>tool: {s.whiteboardTool} · {s.whiteboardSize}px</span>
            <span className="hidden sm:inline">drag to draw · eraser uses bg color</span>
            <span>3 collaborators viewing</span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function ToolBtn({
  icon: Icon,
  active,
  onClick,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex h-7 w-7 items-center justify-center hairline ${active ? "bg-[var(--anon-accent)] text-[var(--anon-accent-fg)] border-[var(--anon-accent)]" : "anon-mut hover:bg-[var(--anon-panel)]"}`}
      title={label}
      aria-label={label}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function cssVar(name: string): string {
  if (typeof window === "undefined") return "#000";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#000";
}
