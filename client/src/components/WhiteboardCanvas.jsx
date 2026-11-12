import React, { useRef, useEffect, useState, useCallback } from 'react';
import { PenTool, Eraser, Trash2, Undo2, Download } from 'lucide-react';

const COLORS = ['#ffffff', '#a78bfa', '#22d3ee', '#34d399', '#fbbf24', '#fb7185'];

export function WhiteboardCanvas({ socket, roomId, strokes = [], setStrokes, readOnly = false }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  const [tool, setTool] = useState('pen'); // 'pen' | 'eraser'
  const [color, setColor] = useState('#a78bfa');
  const [width, setWidth] = useState(3);
  const [isDrawing, setIsDrawing] = useState(false);

  const activePointsRef = useRef([]);

  const drawStroke = useCallback((ctx, w, h, stroke) => {
    if (!stroke?.points || stroke.points.length < 2) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = stroke.width || 3;
    if (stroke.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.lineWidth = (stroke.width || 3) * 3;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = stroke.color || '#a78bfa';
    }

    ctx.beginPath();
    ctx.moveTo(stroke.points[0][0] * w, stroke.points[0][1] * h);
    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i][0] * w, stroke.points[i][1] * h);
    }
    ctx.stroke();
    ctx.restore();
  }, []);

  const redrawAll = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { width: cw, height: ch } = canvas;
    ctx.clearRect(0, 0, cw, ch);
    strokes.forEach((s) => drawStroke(ctx, cw, ch, s));
  }, [strokes, drawStroke]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        canvas.width = Math.floor(rect.width);
        canvas.height = Math.floor(rect.height);
        redrawAll();
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
  }, [redrawAll]);

  useEffect(() => {
    redrawAll();
  }, [strokes, redrawAll]);

  const getNormalizedPoint = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return [
      Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1),
      Math.min(Math.max((clientY - rect.top) / rect.height, 0), 1)
    ];
  };

  const handlePointerDown = (e) => {
    if (readOnly) return;
    e.preventDefault();
    const pt = getNormalizedPoint(e);
    activePointsRef.current = [pt];
    setIsDrawing(true);
  };

  const handlePointerMove = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const pt = getNormalizedPoint(e);
    activePointsRef.current.push(pt);

    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      const len = activePointsRef.current.length;
      if (len >= 2) {
        drawStroke(ctx, canvas.width, canvas.height, {
          points: [activePointsRef.current[len - 2], activePointsRef.current[len - 1]],
          color,
          width,
          tool
        });
      }
    }
  };

  const finishStroke = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const pts = activePointsRef.current;
    activePointsRef.current = [];
    if (pts.length < 2) return;

    const stroke = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      points: pts,
      color,
      width,
      tool
    };
    setStrokes((prev) => [...prev, stroke]);
    socket?.emit('whiteboard-stroke', { roomId, stroke });
  };

  const handleExport = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height;
    const ctx = exportCanvas.getContext('2d');
    ctx.fillStyle = '#0b0e14';
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    ctx.drawImage(canvas, 0, 0);
    const a = document.createElement('a');
    a.href = exportCanvas.toDataURL('image/png');
    a.download = `studyhub-board-${roomId.slice(0, 8)}.png`;
    a.click();
  };

  return (
    <div className="glass-panel rounded-2xl border border-white/10 flex flex-col overflow-hidden h-full min-h-[240px]">
      {/* Toolbar */}
      <div className="px-3 py-2 border-b border-white/10 bg-dark-950/60 flex flex-wrap items-center justify-between gap-2">
        {readOnly ? (
          <span className="text-[11px] font-semibold text-amber-300">
            Live Whiteboard (Read-only in Guest Mode)
          </span>
        ) : (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setTool('pen')}
            className={`p-1.5 rounded-lg text-xs flex items-center gap-1 ${
              tool === 'pen' ? 'bg-brand-purple text-white' : 'text-slate-400 hover:text-white hover:bg-white/10'
            }`}
            title="Pen"
          >
            <PenTool className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setTool('eraser')}
            className={`p-1.5 rounded-lg text-xs flex items-center gap-1 ${
              tool === 'eraser' ? 'bg-brand-purple text-white' : 'text-slate-400 hover:text-white hover:bg-white/10'
            }`}
            title="Eraser"
          >
            <Eraser className="w-3.5 h-3.5" />
          </button>

          <div className="h-4 w-px bg-white/10 mx-1" />

          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setColor(c);
                setTool('pen');
              }}
              style={{ backgroundColor: c }}
              className={`w-4 h-4 rounded-full transition-transform ${
                color === c && tool === 'pen' ? 'scale-125 ring-2 ring-white' : 'opacity-75 hover:opacity-100'
              }`}
            />
          ))}

          <select
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
            className="ml-1 bg-dark-900 border border-white/10 rounded-lg px-1.5 py-0.5 text-[10px] text-slate-200"
          >
            <option value={2}>Thin</option>
            <option value={4}>Medium</option>
            <option value={8}>Bold</option>
          </select>
        </div>
        )}

        <div className="flex items-center gap-1">
          {!readOnly && (
            <>
              <button
                type="button"
                onClick={() => socket?.emit('whiteboard-undo', { roomId })}
                title="Undo Last Stroke"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => socket?.emit('whiteboard-clear', { roomId })}
                title="Clear Board for All"
                className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/15"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={handleExport}
            title="Download PNG"
            className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/15"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Live Canvas Area */}
      <div ref={containerRef} className="flex-1 relative bg-dark-950/75 cursor-crosshair touch-none">
        <canvas
          ref={canvasRef}
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={finishStroke}
          onMouseLeave={finishStroke}
          onTouchStart={handlePointerDown}
          onTouchMove={handlePointerMove}
          onTouchEnd={finishStroke}
          className="w-full h-full block"
        />
        {strokes.length === 0 && !isDrawing && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center text-xs text-slate-500">
            Draw diagrams, formulas, or brainstorm together — synced live across the room!
          </div>
        )}
      </div>
    </div>
  );
}
