import { identityCropLimits } from "@/utils/constant"
import { useEffect, useRef, useState } from "react"
import {
  Stage,
  Layer,
  Image as KonvaImage,
  Circle,
  Line,
  Text,
} from "react-konva"
import { RotateCw, RotateCcw, RefreshCw, X } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { defaults, fullCorners, validCorners } from "@/lib/identify/model"

export default function CardEditor({ value, label, onClose, onApply, onAuto }) {
  const [image, setImage] = useState(null),
    [points, setPoints] = useState(value.points ?? fullCorners),
    [settings, setSettings] = useState(value.settings ?? defaults),
    [zoom, setZoom] = useState(1),
    [pan, setPan] = useState({ x: 0, y: 0 }),
    [width, setWidth] = useState(500),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("")
  const box = useRef(null)
  useEffect(() => {
    let active = true
    const img = new window.Image()
    img.onload = () => {
      if (active) setImage(img)
    }
    img.src = value.sourceUrl
    return () => {
      active = false
      img.onload = null
    }
  }, [value.sourceUrl])
  useEffect(() => {
    const observer = new ResizeObserver((entries) =>
      setWidth(Math.max(240, entries[0].contentRect.width))
    )
    if (box.current) observer.observe(box.current)
    return () => observer.disconnect()
  }, [])
  const height = image
    ? Math.min(420, (width * image.height) / image.width)
    : 300
  const initial = value.points ?? fullCorners
  const minX = Math.min(0, ...initial.map((p) => p.x)) - 0.08,
    minY = Math.min(0, ...initial.map((p) => p.y)) - 0.08
  const maxX = Math.max(1, ...initial.map((p) => p.x)) + 0.08,
    maxY = Math.max(1, ...initial.map((p) => p.y)) + 0.08
  const fit = image
    ? Math.min(
        width / (image.width * (maxX - minX)),
        height / (image.height * (maxY - minY))
      )
    : 1
  const w = image ? image.width * fit : width,
    h = image ? image.height * fit : height
  const setPoint = (i, p) =>
    setPoints((old) =>
      old.map((v, j) =>
        i === j
          ? {
              x: Math.max(
                -identityCropLimits.outsideMargin,
                Math.min(1 + identityCropLimits.outsideMargin, p.x)
              ),
              y: Math.max(
                -identityCropLimits.outsideMargin,
                Math.min(1 + identityCropLimits.outsideMargin, p.y)
              ),
            }
          : v
      )
    )
  async function apply() {
    if (!validCorners(points, true)) {
      setError(
        "Bốn góc không hợp lệ hoặc giao nhau. Hãy kiểm tra thứ tự 1–2–3–4."
      )
      return
    }
    setBusy(true)
    setError("")
    try {
      await onApply(points, settings)
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="max-h-[92svh] overflow-auto sm:max-w-4xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <DialogTitle>Chỉnh sửa {label.toLowerCase()}</DialogTitle>
            <DialogDescription>
              Kéo bốn góc theo thứ tự quanh thẻ; có thể đặt góc ngoài ảnh để bù
              phần bị chụp mất. Ảnh xuất luôn có khổ 85,60 × 53,98 mm.
            </DialogDescription>
          </div>
          <Button
            size="icon"
            variant="ghost"
            disabled={busy}
            aria-label="Đóng chỉnh sửa"
            onClick={onClose}
          >
            <X />
          </Button>
        </div>
        <div className="grid gap-5 md:grid-cols-[1fr_240px]">
          <div className="min-w-0 space-y-3">
            <p className="text-xs text-muted-foreground">
              Kéo nền để di chuyển. Phóng to bằng thanh bên dưới. Góc 1–2 là
              cạnh trên.
            </p>
            <div
              ref={box}
              className="overflow-hidden rounded-xl bg-zinc-900"
              aria-label="Vùng chỉnh bốn góc"
            >
              <Stage
                width={width}
                height={height}
                draggable
                x={pan.x}
                y={pan.y}
                scaleX={zoom}
                scaleY={zoom}
                onDragEnd={(e) => {
                  if (e.target === e.target.getStage())
                    setPan(e.target.position())
                }}
              >
                <Layer>
                  {image && (
                    <KonvaImage
                      image={image}
                      x={-minX * w}
                      y={-minY * h}
                      width={w}
                      height={h}
                    />
                  )}
                  <Line
                    points={points.flatMap((p) => [
                      (p.x - minX) * w,
                      (p.y - minY) * h,
                    ])}
                    closed
                    stroke="#22d3ee"
                    strokeWidth={2 / zoom}
                  />
                  {points.map((p, i) => (
                    <Circle
                      key={i}
                      x={(p.x - minX) * w}
                      y={(p.y - minY) * h}
                      radius={9 / zoom}
                      fill="#0891b2"
                      stroke="white"
                      strokeWidth={2 / zoom}
                      draggable
                      onDragMove={(e) => {
                        e.cancelBubble = true
                        setPoint(i, {
                          x: e.target.x() / w + minX,
                          y: e.target.y() / h + minY,
                        })
                      }}
                      onDragEnd={(e) => {
                        e.cancelBubble = true
                        setPoint(i, {
                          x: e.target.x() / w + minX,
                          y: e.target.y() / h + minY,
                        })
                      }}
                    />
                  ))}
                  {points.map((p, i) => (
                    <Text
                      key={i}
                      text={String(i + 1)}
                      x={(p.x - minX) * w + 10 / zoom}
                      y={(p.y - minY) * h - 20 / zoom}
                      fill="white"
                      fontSize={16 / zoom}
                    />
                  ))}
                </Layer>
              </Stage>
            </div>
            <Label id="editor-zoom">Phóng to ảnh: {zoom.toFixed(1)}×</Label>
            <Slider
              value={[zoom]}
              min={1}
              max={3}
              step={0.1}
              onValueChange={(v) => setZoom(Array.isArray(v) ? v[0] : v)}
              aria-labelledby="editor-zoom"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setSettings((s) => ({ ...s, rotation: (s.rotation + 3) % 4 }))
                }
              >
                <RotateCcw />
                Trái
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setSettings((s) => ({ ...s, rotation: (s.rotation + 1) % 4 }))
                }
              >
                <RotateCw />
                Phải
              </Button>
              <span className="self-center text-xs">
                Xoay {settings.rotation * 90}°
              </span>
            </div>
            <details>
              <summary className="cursor-pointer text-sm">
                Nhập tọa độ góc theo phần trăm
              </summary>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {points.map((p, i) => (
                  <div key={i} className="space-y-1">
                    <Label>Góc {i + 1}</Label>
                    {["x", "y"].map((axis) => (
                      <Input
                        key={axis}
                        type="number"
                        aria-label={`Góc ${i + 1} trục ${axis}`}
                        min={-identityCropLimits.outsideMargin * 100}
                        max={(1 + identityCropLimits.outsideMargin) * 100}
                        step={0.1}
                        value={+(p[axis] * 100).toFixed(1)}
                        onChange={(e) =>
                          setPoint(i, {
                            ...p,
                            [axis]: Number(e.target.value) / 100,
                          })
                        }
                      />
                    ))}
                  </div>
                ))}
              </div>
            </details>
          </div>
          <div className="space-y-4">
            {[
              ["brightness", "Độ sáng", -25, 25, 1],
              ["contrast", "Tương phản", 0.75, 1.3, 0.01],
              ["sharpness", "Độ nét", 0, 0.5, 0.01],
            ].map(([key, text, min, max, step]) => (
              <div key={key} className="space-y-3">
                <Label id={`editor-${key}`}>
                  {text}: {settings[key]}
                </Label>
                <Slider
                  aria-labelledby={`editor-${key}`}
                  value={[settings[key]]}
                  min={min}
                  max={max}
                  step={step}
                  onValueChange={(v) =>
                    setSettings((s) => ({
                      ...s,
                      [key]: Array.isArray(v) ? v[0] : v,
                    }))
                  }
                />
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                setPoints(fullCorners())
                setSettings({ ...defaults })
                setZoom(1)
                setPan({ x: 0, y: 0 })
                setError("")
              }}
            >
              Khôi phục ảnh gốc
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  await onAuto()
                  onClose()
                } catch (e) {
                  setError(e.message)
                } finally {
                  setBusy(false)
                }
              }}
            >
              <RefreshCw />
              Nhận diện lại
            </Button>
            {value.outputUrl && (
              <div>
                <p className="mb-2 text-xs text-muted-foreground">
                  Kết quả đã lưu
                </p>
                <img
                  src={value.outputUrl}
                  alt="Kết quả đã xử lý"
                  className="rounded-lg border"
                />
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Độ sáng, nét và xoay được áp dụng khi xác nhận. Kiểm tra lại bản
              xem trước A4 sau khi lưu.
            </p>
          </div>
        </div>
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Hủy
          </Button>
          <Button disabled={busy} onClick={apply}>
            {busy ? "Đang áp dụng…" : "Cắt và lưu kết quả"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
