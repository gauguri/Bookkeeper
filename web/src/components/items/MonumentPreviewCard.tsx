import { useEffect, useMemo, useRef, useState, type MouseEvent, type WheelEvent } from "react";

type MonumentPreviewProps = {
  item: {
    color?: string | null;
    monument_type?: string | null;
    shape?: string | null;
    finish?: string | null;
    category?: string | null;
    description?: string | null;
    sales_description?: string | null;
    lr_feet?: number | null;
    lr_inches?: number | null;
    fb_feet?: number | null;
    fb_inches?: number | null;
    tb_feet?: number | null;
    tb_inches?: number | null;
  };
};

type Vec3 = { x: number; y: number; z: number };
type Projected = Vec3 & { sx: number; sy: number; visible: boolean };

const COLOR_MAP: Array<{ match: string[]; top: string; left: string; right: string; front: string; accent: string }> = [
  { match: ["black", "dark", "jet"], top: "#586071", left: "#2b313f", right: "#444c5e", front: "#353c4d", accent: "#aeb8cb" },
  { match: ["grey", "gray", "silver"], top: "#bcc3cb", left: "#7e8794", right: "#a2abb7", front: "#9099a6", accent: "#eef2f6" },
  { match: ["white", "light"], top: "#efe9e0", left: "#ccc1b4", right: "#dfd5c8", front: "#d7ccbf", accent: "#fffdf7" },
  { match: ["red", "rainbow", "aurora"], top: "#8b5960", left: "#553339", right: "#72474d", front: "#643d43", accent: "#d9a9b2" },
  { match: ["blue"], top: "#7592b0", left: "#4f6784", right: "#67809d", front: "#5c7492", accent: "#d5e1ef" },
  { match: ["brown"], top: "#8b6c57", left: "#5f4739", right: "#765848", front: "#6c5142", accent: "#d9c1ae" },
  { match: ["green"], top: "#7d9184", left: "#56655c", right: "#687b71", front: "#5f7168", accent: "#ced9d2" },
];

function stonePalette(color: string | null | undefined) {
  const normalized = (color || "").toLowerCase();
  return COLOR_MAP.find((entry) => entry.match.some((token) => normalized.includes(token)))
    ?? { top: "#a79f98", left: "#746d67", right: "#8a837c", front: "#80776f", accent: "#f1ebe3" };
}

function toFeet(feet?: number | null, inches?: number | null) {
  return Number(feet || 0) + (Number(inches || 0) / 12);
}

function finishLabel(finish: string | null | undefined) {
  const normalized = (finish || "").toUpperCase();
  if (!normalized) return "Standard stone finish";
  if (normalized.includes("ALL POL")) return "All polished faces";
  if (normalized.includes("POL MRG")) return "Polished margin finish";
  if (normalized.includes("PT SS")) return "Polished top / sawn sides";
  if (normalized.includes("SPECIAL")) return "Special finish treatment";
  return normalized;
}

function rotatePoint(point: Vec3, rotX: number, rotY: number): Vec3 {
  const cosY = Math.cos(rotY);
  const sinY = Math.sin(rotY);
  const x1 = point.x * cosY + point.z * sinY;
  const z1 = -point.x * sinY + point.z * cosY;

  const cosX = Math.cos(rotX);
  const sinX = Math.sin(rotX);
  const y2 = point.y * cosX - z1 * sinX;
  const z2 = point.y * sinX + z1 * cosX;

  return { x: x1, y: y2, z: z2 };
}

export default function MonumentPreviewCard({ item }: MonumentPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{ dragging: boolean; mode: "orbit" | "pan"; x: number; y: number }>({
    dragging: false,
    mode: "orbit",
    x: 0,
    y: 0,
  });

  const [view, setView] = useState({
    rotX: -0.42,
    rotY: 0.72,
    zoom: 1,
    panX: 0,
    panY: 8,
  });

  const widthFeet = Math.max(toFeet(item.lr_feet, item.lr_inches), 0.5);
  const depthFeet = Math.max(toFeet(item.fb_feet, item.fb_inches), 0.4);
  const heightFeet = Math.max(toFeet(item.tb_feet, item.tb_inches), 0.15);
  const palette = stonePalette(item.color);
  const shape = (item.shape || item.monument_type || "stone").toUpperCase();
  const finish = (item.finish || "").toUpperCase();
  const description = `${item.description || ""} ${item.sales_description || ""}`.toUpperCase();
  const polishedMargin = finish.includes("POL MRG") || description.includes("POL MARGIN");
  const allPolished = finish.includes("ALL POL");
  const sawnSides = finish.includes("SS");

  const geometry = useMemo(() => {
    const sx = widthFeet * 60;
    const sy = heightFeet * 90;
    const sz = depthFeet * 60;
    const halfX = sx / 2;
    const halfY = sy / 2;
    const halfZ = sz / 2;

    const vertices: Vec3[] = [
      { x: -halfX, y: -halfY, z: -halfZ },
      { x: halfX, y: -halfY, z: -halfZ },
      { x: halfX, y: halfY, z: -halfZ },
      { x: -halfX, y: halfY, z: -halfZ },
      { x: -halfX, y: -halfY, z: halfZ },
      { x: halfX, y: -halfY, z: halfZ },
      { x: halfX, y: halfY, z: halfZ },
      { x: -halfX, y: halfY, z: halfZ },
    ];

    const faces = [
      { name: "back", points: [0, 1, 2, 3], fill: sawnSides && !allPolished ? "#676f77" : palette.left },
      { name: "front", points: [4, 5, 6, 7], fill: allPolished ? palette.accent : palette.front },
      { name: "left", points: [0, 4, 7, 3], fill: sawnSides && !allPolished ? "#6f767d" : palette.left },
      { name: "right", points: [1, 5, 6, 2], fill: allPolished ? palette.accent : palette.right },
      { name: "top", points: [3, 2, 6, 7], fill: palette.top },
      { name: "bottom", points: [0, 1, 5, 4], fill: "#444" },
    ];

    return { vertices, faces, sx, sy, sz };
  }, [allPolished, depthFeet, heightFeet, palette, sawnSides, widthFeet]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const width = rect.width;
    const height = rect.height;
    ctx.clearRect(0, 0, width, height);

    const centerX = width * 0.48 + view.panX;
    const centerY = height * 0.53 + view.panY;
    const cameraDistance = 560;
    const scale = 1.2 * view.zoom;

    const projected: Projected[] = geometry.vertices.map((vertex) => {
      const rotated = rotatePoint(vertex, view.rotX, view.rotY);
      const perspective = cameraDistance / (cameraDistance - rotated.z);
      return {
        ...rotated,
        sx: centerX + rotated.x * perspective * scale,
        sy: centerY + rotated.y * perspective * scale,
        visible: perspective > 0,
      };
    });

    const renderedFaces = geometry.faces
      .map((face) => {
        const pts = face.points.map((index) => projected[index]);
        const avgZ = pts.reduce((sum, point) => sum + point.z, 0) / pts.length;
        return { ...face, pts, avgZ };
      })
      .sort((a, b) => a.avgZ - b.avgZ);

    for (const face of renderedFaces) {
      ctx.beginPath();
      ctx.moveTo(face.pts[0].sx, face.pts[0].sy);
      face.pts.slice(1).forEach((point) => ctx.lineTo(point.sx, point.sy));
      ctx.closePath();
      ctx.fillStyle = face.fill;
      ctx.fill();
      ctx.strokeStyle = "rgba(41,52,70,0.08)";
      ctx.lineWidth = 0.6;
      ctx.stroke();

      if (face.name === "top" && polishedMargin) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(face.pts[0].sx, face.pts[0].sy);
        face.pts.slice(1).forEach((point) => ctx.lineTo(point.sx, point.sy));
        ctx.closePath();
        ctx.clip();
        ctx.strokeStyle = palette.accent;
        ctx.lineWidth = 8;
        ctx.strokeRect(
          Math.min(...face.pts.map((point) => point.sx)) + 10,
          Math.min(...face.pts.map((point) => point.sy)) + 8,
          Math.max(...face.pts.map((point) => point.sx)) - Math.min(...face.pts.map((point) => point.sx)) - 20,
          Math.max(...face.pts.map((point) => point.sy)) - Math.min(...face.pts.map((point) => point.sy)) - 14,
        );
        ctx.restore();
      }
    }

    ctx.fillStyle = "#52627c";
    ctx.font = "600 12px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("CONCEPT PREVIEW", centerX, height - 18);
  }, [geometry, palette.accent, polishedMargin, view]);

  const handleMouseDown = (event: MouseEvent<HTMLCanvasElement>) => {
    dragRef.current = {
      dragging: true,
      mode: event.shiftKey ? "pan" : "orbit",
      x: event.clientX,
      y: event.clientY,
    };
  };

  const handleMouseMove = (event: MouseEvent<HTMLCanvasElement>) => {
    if (!dragRef.current.dragging) return;
    const dx = event.clientX - dragRef.current.x;
    const dy = event.clientY - dragRef.current.y;
    dragRef.current.x = event.clientX;
    dragRef.current.y = event.clientY;

    if (dragRef.current.mode === "pan") {
      setView((prev) => ({
        ...prev,
        panX: prev.panX + dx,
        panY: prev.panY + dy,
      }));
      return;
    }

    setView((prev) => ({
      ...prev,
      rotY: prev.rotY + dx * 0.012,
      rotX: Math.max(-1.35, Math.min(1.35, prev.rotX + dy * 0.01)),
    }));
  };

  const handleMouseUp = () => {
    dragRef.current.dragging = false;
  };

  const handleWheel = (event: WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.08 : 0.08;
    setView((prev) => ({
      ...prev,
      zoom: Math.max(0.55, Math.min(2.2, prev.zoom + delta)),
    }));
  };

  return (
    <div className="mt-5 overflow-hidden rounded-3xl border border-border/70 bg-[linear-gradient(135deg,#eef3fb_0%,#f7f4ef_58%,#efe9df_100%)]">
      <div className="grid gap-0 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="relative min-h-[340px] overflow-hidden px-6 py-6">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(255,255,255,0.9),transparent_35%),radial-gradient(circle_at_80%_25%,rgba(255,255,255,0.5),transparent_28%)]" />
          <canvas
            ref={canvasRef}
            className="relative z-10 h-[320px] w-full cursor-grab active:cursor-grabbing"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
          />
        </div>

        <div className="border-t border-border/60 bg-white/65 px-5 py-5 lg:border-l lg:border-t-0">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">3D Preview</p>
          <h3 className="mt-2 text-lg font-semibold">Interactive Monument Viewer</h3>
          <p className="mt-2 text-sm text-muted">
            Drag to orbit the model, hold <span className="font-medium">Shift</span> while dragging to pan, and use the mouse wheel to zoom.
          </p>

          <div className="mt-4 grid gap-3">
            <div className="rounded-2xl border border-border/60 bg-white/80 px-3 py-3 text-sm">
              <p className="text-xs text-muted">Overall size</p>
              <p className="mt-1 font-medium">
                {`${item.lr_feet ?? 0}-${item.lr_inches ?? 0} x ${item.fb_feet ?? 0}-${item.fb_inches ?? 0} x ${item.tb_feet ?? 0}-${item.tb_inches ?? 0}`}
              </p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-white/80 px-3 py-3 text-sm">
              <p className="text-xs text-muted">Stone finish</p>
              <p className="mt-1 font-medium">{finishLabel(item.finish)}</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-white/80 px-3 py-3 text-sm">
              <p className="text-xs text-muted">Shape interpretation</p>
              <p className="mt-1 font-medium">{shape || "Standard block form"}</p>
            </div>
            <div className="rounded-2xl border border-dashed border-border/70 bg-white/55 px-3 py-3 text-xs text-muted">
              This is a real interactive perspective viewer for the inferred monument block, but it is still an approximation rather than a fabrication-grade CAD model.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
