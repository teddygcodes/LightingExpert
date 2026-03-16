'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import * as pdfjsLib from 'pdfjs-dist'

pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

type Tool = 'cursor' | 'highlight' | 'text'

interface Highlight {
  id: string; pageNum: number; x: number; y: number; w: number; h: number
}

interface TextBox {
  id: string; pageNum: number; x: number; y: number; text: string; color: string; fontSize: number; width: number; height: number
}

interface PendingRect {
  pageNum: number; startX: number; startY: number; x: number; y: number; w: number; h: number
}

// alias
type PendingHighlight = PendingRect

interface PageInfo {
  scale: number; width: number; height: number
}

interface DragState {
  id: string; startMouseX: number; startMouseY: number; startTbX: number; startTbY: number
}

const TEXT_COLORS = [
  { hex: '#000000', label: 'Black' },
  { hex: '#1e4d78', label: 'Dark Blue' },
  { hex: '#c00000', label: 'Red' },
  { hex: '#375623', label: 'Dark Green' },
  { hex: '#7030a0', label: 'Purple' },
  { hex: '#c55a11', label: 'Orange' },
]

const FONT = '"Segoe UI", system-ui, -apple-system, sans-serif'

function uid() { return Math.random().toString(36).slice(2) }

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  return rgb(r, g, b)
}

export default function PdfAnnotator({ pdfUrl }: { pdfUrl: string }) {
  const [numPages, setNumPages] = useState(0)
  const [tool, setTool] = useState<Tool>('cursor')
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [textBoxes, setTextBoxes] = useState<TextBox[]>([])
  const [pending, setPending] = useState<PendingHighlight | null>(null)
  const [pendingTextBox, setPendingTextBox] = useState<PendingRect | null>(null)
  const [focusedTextId, setFocusedTextId] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [hoveredHighlight, setHoveredHighlight] = useState<string | null>(null)
  const [history, setHistory] = useState<Array<{ highlights: Highlight[]; textBoxes: TextBox[] }>>([])
  const [isDragging, setIsDragging] = useState(false)

  const dragRef = useRef<DragState | null>(null)
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([])
  const pageInfos = useRef<PageInfo[]>([])
  const containerRef = useRef<HTMLDivElement>(null)

  // ── Global drag tracking ─────────────────────────────────────────────────────

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragRef.current) return
      const { id, startMouseX, startMouseY, startTbX, startTbY } = dragRef.current
      setTextBoxes(prev => prev.map(x =>
        x.id === id
          ? { ...x, x: startTbX + (e.clientX - startMouseX), y: startTbY + (e.clientY - startMouseY) }
          : x
      ))
    }
    function onMouseUp() {
      if (dragRef.current) {
        dragRef.current = null
        setIsDragging(false)
      }
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  // ── History ──────────────────────────────────────────────────────────────────

  function saveToHistory(hl = highlights, tb = textBoxes) {
    setHistory(prev => [...prev, { highlights: hl, textBoxes: tb }])
  }

  function undo() {
    setHistory(prev => {
      if (prev.length === 0) return prev
      const last = prev[prev.length - 1]
      setHighlights(last.highlights)
      setTextBoxes(last.textBoxes)
      return prev.slice(0, -1)
    })
  }

  // ── PDF Loading ──────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false
    async function loadPdf() {
      const pdf = await pdfjsLib.getDocument(pdfUrl).promise
      if (cancelled) return
      setNumPages(pdf.numPages)
      canvasRefs.current = new Array(pdf.numPages).fill(null)
      pageInfos.current = new Array(pdf.numPages).fill(null)
      const containerWidth = containerRef.current?.clientWidth ?? 900
      const targetWidth = Math.max(containerWidth - 16, 400)
      for (let i = 1; i <= pdf.numPages; i++) {
        if (cancelled) break
        const page = await pdf.getPage(i)
        const naturalViewport = page.getViewport({ scale: 1 })
        const scale = targetWidth / naturalViewport.width
        const viewport = page.getViewport({ scale })
        const canvas = canvasRefs.current[i - 1]
        if (!canvas) continue
        canvas.width = viewport.width
        canvas.height = viewport.height
        const ctx = canvas.getContext('2d')
        if (!ctx) continue
        await page.render({ canvasContext: ctx, viewport }).promise
        pageInfos.current[i - 1] = { scale: viewport.scale, width: viewport.width, height: viewport.height }
      }
    }
    loadPdf().catch(console.error)
    return () => { cancelled = true }
  }, [pdfUrl])

  // ── Highlight handlers ───────────────────────────────────────────────────────

  function getRelativeCoords(e: React.MouseEvent<HTMLDivElement>, pageNum: number) {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top, pageNum }
  }

  function onOverlayMouseDown(e: React.MouseEvent<HTMLDivElement>, pageNum: number) {
    const { x, y } = getRelativeCoords(e, pageNum)
    if (tool === 'highlight') {
      setPending({ pageNum, startX: x, startY: y, x, y, w: 0, h: 0 })
    } else if (tool === 'text') {
      setPendingTextBox({ pageNum, startX: x, startY: y, x, y, w: 0, h: 0 })
    }
  }

  function onOverlayMouseMove(e: React.MouseEvent<HTMLDivElement>, pageNum: number) {
    const { x, y } = getRelativeCoords(e, pageNum)
    if (tool === 'highlight' && pending?.pageNum === pageNum) {
      setPending({
        ...pending,
        x: Math.min(x, pending.startX), y: Math.min(y, pending.startY),
        w: Math.abs(x - pending.startX), h: Math.abs(y - pending.startY),
      })
    } else if (tool === 'text' && pendingTextBox?.pageNum === pageNum) {
      setPendingTextBox({
        ...pendingTextBox,
        x: Math.min(x, pendingTextBox.startX), y: Math.min(y, pendingTextBox.startY),
        w: Math.abs(x - pendingTextBox.startX), h: Math.abs(y - pendingTextBox.startY),
      })
    }
  }

  function onOverlayMouseUp(e: React.MouseEvent<HTMLDivElement>, pageNum: number) {
    const { x, y } = getRelativeCoords(e, pageNum)
    if (tool === 'highlight' && pending?.pageNum === pageNum) {
      const rx = Math.min(x, pending.startX), ry = Math.min(y, pending.startY)
      const rw = Math.abs(x - pending.startX), rh = Math.abs(y - pending.startY)
      if (rw > 5 && rh > 5) {
        saveToHistory()
        setHighlights(prev => [...prev, { id: uid(), pageNum, x: rx, y: ry, w: rw, h: rh }])
      }
      setPending(null)
    } else if (tool === 'text' && pendingTextBox?.pageNum === pageNum) {
      const rx = Math.min(x, pendingTextBox.startX), ry = Math.min(y, pendingTextBox.startY)
      const rw = Math.abs(x - pendingTextBox.startX), rh = Math.abs(y - pendingTextBox.startY)
      if (rw > 10 && rh > 10) {
        const id = uid()
        saveToHistory()
        setTextBoxes(prev => [...prev, { id, pageNum, x: rx, y: ry, text: '', color: '#000000', fontSize: 12, width: rw, height: rh }])
        setFocusedTextId(id)
      }
      setPendingTextBox(null)
    }
  }

  function deleteTextBox(id: string) {
    saveToHistory()
    setTextBoxes(prev => prev.filter(x => x.id !== id))
    setFocusedTextId(null)
  }

  function updateTextBox(id: string, patch: Partial<TextBox>) {
    setTextBoxes(prev => prev.map(x => x.id === id ? { ...x, ...patch } : x))
  }

  function onDragHandleMouseDown(e: React.MouseEvent, tb: TextBox) {
    e.stopPropagation()
    e.preventDefault()
    dragRef.current = {
      id: tb.id,
      startMouseX: e.clientX, startMouseY: e.clientY,
      startTbX: tb.x, startTbY: tb.y,
    }
    setIsDragging(true)
    setFocusedTextId(tb.id)
  }

  // ── Download ─────────────────────────────────────────────────────────────────

  const handleDownload = useCallback(async () => {
    setDownloading(true)
    try {
      const bytes = await fetch(pdfUrl).then(r => r.arrayBuffer())
      const pdfDoc = await PDFDocument.load(bytes)
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
      const pages = pdfDoc.getPages()

      for (const h of highlights) {
        const info = pageInfos.current[h.pageNum]
        if (!info) continue
        const page = pages[h.pageNum]
        const { height } = page.getSize()
        page.drawRectangle({
          x: h.x / info.scale, y: height - (h.y + h.h) / info.scale,
          width: h.w / info.scale, height: h.h / info.scale,
          color: rgb(1, 0.95, 0), opacity: 0.45,
        })
      }

      for (const tb of textBoxes) {
        if (!tb.text.trim()) continue
        const info = pageInfos.current[tb.pageNum]
        if (!info) continue
        const page = pages[tb.pageNum]
        const { height } = page.getSize()
        // tb.y = top of container; add 14px drag handle + 5px textarea padding + font baseline
        const textBaselineCanvas = tb.y + 14 + 5 + tb.fontSize * 0.75
        page.drawText(tb.text, {
          x: tb.x / info.scale,
          y: height - textBaselineCanvas / info.scale,
          size: tb.fontSize, font, color: hexToRgb(tb.color),
        })
      }

      const blob = new Blob([await pdfDoc.save() as unknown as ArrayBuffer], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = pdfUrl.split('/').pop()?.replace('.pdf', '-annotated.pdf') ?? 'annotated.pdf'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Download failed:', err)
    } finally {
      setDownloading(false)
    }
  }, [pdfUrl, highlights, textBoxes])

  // ── Render ───────────────────────────────────────────────────────────────────

  const pageLayers = Array.from({ length: numPages }, (_, i) => {
    const pageNum = i
    const pageHighlights = highlights.filter(h => h.pageNum === pageNum)
    const pageTextBoxes = textBoxes.filter(tb => tb.pageNum === pageNum)
    const isPendingPage = pending?.pageNum === pageNum
    const isPendingTextPage = pendingTextBox?.pageNum === pageNum

    return (
      <div
        key={i}
        style={{
          position: 'relative', display: 'inline-block',
          background: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.13), 0 6px 24px rgba(0,0,0,0.09)',
          marginBottom: 28,
        }}
      >
        <canvas ref={el => { canvasRefs.current[i] = el }} style={{ display: 'block' }} />

        <div
          style={{
            position: 'absolute', inset: 0,
            cursor: isDragging ? 'grabbing' : tool === 'highlight' || tool === 'text' ? 'crosshair' : 'default',
          }}
          onMouseDown={e => onOverlayMouseDown(e, pageNum)}
          onMouseMove={e => onOverlayMouseMove(e, pageNum)}
          onMouseUp={e => onOverlayMouseUp(e, pageNum)}
        >
          {/* Highlights */}
          {pageHighlights.map(h => (
            <div
              key={h.id}
              onMouseEnter={() => setHoveredHighlight(h.id)}
              onMouseLeave={() => setHoveredHighlight(null)}
              style={{
                position: 'absolute', left: h.x, top: h.y, width: h.w, height: h.h,
                background: 'rgba(255,242,0,0.42)',
                border: hoveredHighlight === h.id && tool === 'cursor' ? '1px solid #e6b800' : '1px solid transparent',
                pointerEvents: tool === 'cursor' ? 'auto' : 'none',
                cursor: tool === 'cursor' ? 'pointer' : 'default',
                boxSizing: 'border-box',
              }}
            >
              {tool === 'cursor' && hoveredHighlight === h.id && (
                <button
                  onClick={e => { e.stopPropagation(); saveToHistory(); setHighlights(prev => prev.filter(x => x.id !== h.id)); setHoveredHighlight(null) }}
                  style={{
                    position: 'absolute', top: -9, right: -9, width: 18, height: 18,
                    borderRadius: '50%', background: '#c00000', border: 'none',
                    color: '#fff', fontSize: 10, lineHeight: '18px', textAlign: 'center',
                    cursor: 'pointer', padding: 0, userSelect: 'none', zIndex: 10,
                  }}
                >✕</button>
              )}
            </div>
          ))}

          {/* Pending highlight */}
          {isPendingPage && pending && pending.w > 2 && pending.h > 2 && (
            <div style={{
              position: 'absolute', left: pending.x, top: pending.y, width: pending.w, height: pending.h,
              background: 'rgba(255,242,0,0.25)', border: '1px dashed #c9a800',
              pointerEvents: 'none', boxSizing: 'border-box',
            }} />
          )}

          {/* Pending text box draw preview */}
          {pendingTextBox?.pageNum === pageNum && pendingTextBox.w > 2 && pendingTextBox.h > 2 && (
            <div style={{
              position: 'absolute',
              left: pendingTextBox.x, top: pendingTextBox.y,
              width: pendingTextBox.w, height: pendingTextBox.h,
              border: '2px dashed #0078d4',
              background: 'rgba(0,120,212,0.04)',
              pointerEvents: 'none', boxSizing: 'border-box',
            }} />
          )}

          {/* Text boxes */}
          {pageTextBoxes.map(tb => {
            const isFocused = focusedTextId === tb.id
            const isBeingDragged = isDragging && dragRef.current?.id === tb.id

            return (
              <div
                key={tb.id}
                style={{
                  position: 'absolute', left: tb.x, top: tb.y,
                  zIndex: isFocused ? 10 : 5,
                  boxShadow: isFocused
                    ? '0 0 0 1.5px #0078d4, 0 4px 16px rgba(0,120,212,0.18)'
                    : '0 0 0 1px #bdbdbd',
                  background: '#fff',
                }}
              >
                {/* Mini floating toolbar — appears above when focused */}
                {isFocused && (
                  <div
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => e.stopPropagation()}
                    style={{
                      position: 'absolute', bottom: '100%', left: 0, marginBottom: 5,
                      display: 'flex', alignItems: 'center', gap: 5,
                      background: '#1b1b1b', border: '1px solid #3a3a3a',
                      borderRadius: 4, padding: '4px 8px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
                      whiteSpace: 'nowrap', zIndex: 30,
                      fontFamily: FONT,
                    }}
                  >
                    <button
                      onMouseDown={e => { e.preventDefault(); e.stopPropagation() }}
                      onClick={e => { e.stopPropagation(); deleteTextBox(tb.id) }}
                      title="Delete text box"
                      style={{ background: 'none', border: 'none', color: '#ff6b6b', cursor: 'pointer', fontSize: 13, padding: '0 2px', lineHeight: 1 }}
                    >✕</button>

                    <div style={{ width: 1, height: 14, background: '#444' }} />

                    {TEXT_COLORS.map(({ hex, label }) => (
                      <span
                        key={hex}
                        title={label}
                        onMouseDown={e => { e.preventDefault(); e.stopPropagation() }}
                        onClick={e => { e.stopPropagation(); updateTextBox(tb.id, { color: hex }) }}
                        style={{
                          display: 'inline-block', width: 13, height: 13,
                          borderRadius: 2, background: hex, cursor: 'pointer',
                          border: tb.color === hex ? '2px solid #fff' : '1px solid #555',
                          boxSizing: 'border-box', flexShrink: 0,
                        }}
                      />
                    ))}

                    <div style={{ width: 1, height: 14, background: '#444' }} />

                    <button
                      onMouseDown={e => { e.preventDefault(); e.stopPropagation() }}
                      onClick={e => { e.stopPropagation(); updateTextBox(tb.id, { fontSize: Math.max(8, tb.fontSize - 1) }) }}
                      style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: 11, padding: '0 1px', lineHeight: 1, fontFamily: FONT }}
                    >A−</button>
                    <span style={{ color: '#ccc', fontSize: 11, minWidth: 16, textAlign: 'center', fontFamily: FONT }}>{tb.fontSize}</span>
                    <button
                      onMouseDown={e => { e.preventDefault(); e.stopPropagation() }}
                      onClick={e => { e.stopPropagation(); updateTextBox(tb.id, { fontSize: Math.min(48, tb.fontSize + 1) }) }}
                      style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: 11, padding: '0 1px', lineHeight: 1, fontFamily: FONT }}
                    >A+</button>
                  </div>
                )}

                {/* Drag handle bar */}
                <div
                  onMouseDown={e => onDragHandleMouseDown(e, tb)}
                  onClick={e => e.stopPropagation()}
                  title="Drag to move"
                  style={{
                    height: 14,
                    background: isFocused ? '#0078d4' : '#e8e8e8',
                    borderBottom: isFocused ? 'none' : '1px solid #d0d0d0',
                    cursor: isBeingDragged ? 'grabbing' : 'grab',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    userSelect: 'none',
                  }}
                >
                  <span style={{ fontSize: 8, color: isFocused ? 'rgba(255,255,255,0.7)' : '#aaa', letterSpacing: 3, userSelect: 'none' }}>
                    ••••••
                  </span>
                </div>

                {/* Text area */}
                <textarea
                  value={tb.text}
                  autoFocus={isFocused && !isBeingDragged}
                  onChange={e => updateTextBox(tb.id, { text: e.target.value })}
                  onFocus={() => setFocusedTextId(tb.id)}
                  onBlur={() => setFocusedTextId(null)}
                  onClick={e => e.stopPropagation()}
                  onMouseUp={e => {
                    const el = e.currentTarget
                    if (el.offsetWidth !== tb.width || el.offsetHeight !== tb.height) {
                      updateTextBox(tb.id, { width: el.offsetWidth, height: el.offsetHeight })
                    }
                  }}
                  style={{
                    display: 'block',
                    width: tb.width,
                    height: tb.height,
                    background: 'transparent',
                    border: 'none', outline: 'none',
                    padding: '5px 7px',
                    fontSize: tb.fontSize,
                    fontFamily: FONT,
                    color: tb.color,
                    resize: 'both',
                    lineHeight: 1.5,
                    overflow: 'auto',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            )
          })}
        </div>
      </div>
    )
  })

  return (
    <div ref={containerRef} style={{ fontFamily: FONT, userSelect: isDragging ? 'none' : 'auto' }}>

      {/* ── Ribbon-style toolbar ── */}
      <div style={{
        position: 'sticky', top: 44, zIndex: 20,
        background: '#ffffff',
        borderBottom: '1px solid #d6d6d6',
        display: 'flex', alignItems: 'stretch',
        boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
        marginBottom: 0,
      }}>

        {/* Tool group */}
        <div style={{ display: 'flex', alignItems: 'stretch', padding: '0 6px', gap: 1, borderRight: '1px solid #e5e5e5' }}>
          {([
            { t: 'cursor' as Tool, label: 'Select', icon: '↖' },
            { t: 'highlight' as Tool, label: 'Highlight', icon: '▌' },
            { t: 'text' as Tool, label: 'Text Box', icon: 'A' },
          ] as const).map(({ t, label, icon }) => (
            <button
              key={t}
              onClick={() => setTool(t)}
              title={label}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 2, padding: '6px 12px', minWidth: 50,
                fontSize: 10, fontFamily: FONT, cursor: 'pointer',
                background: tool === t ? '#deecf9' : 'transparent',
                color: tool === t ? '#0078d4' : '#444',
                border: 'none',
                borderBottom: tool === t ? '2px solid #0078d4' : '2px solid transparent',
                fontWeight: tool === t ? 600 : 400,
                userSelect: 'none',
              }}
            >
              <span style={{ fontSize: 15, lineHeight: 1 }}>{icon}</span>
              <span style={{ fontSize: 10 }}>{label}</span>
            </button>
          ))}
        </div>

        {/* Actions group */}
        <div style={{ display: 'flex', alignItems: 'stretch', padding: '0 6px', gap: 1, borderRight: '1px solid #e5e5e5' }}>
          <button
            onClick={undo}
            disabled={history.length === 0}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 2, padding: '6px 12px', minWidth: 50,
              fontSize: 10, fontFamily: FONT, cursor: history.length === 0 ? 'default' : 'pointer',
              background: 'transparent', border: 'none', borderBottom: '2px solid transparent',
              color: history.length === 0 ? '#bbb' : '#444', userSelect: 'none',
            }}
          >
            <span style={{ fontSize: 15, lineHeight: 1 }}>↩</span>
            <span>Undo</span>
          </button>
          <button
            onClick={() => { saveToHistory(); setHighlights([]); setTextBoxes([]) }}
            disabled={highlights.length === 0 && textBoxes.length === 0}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 2, padding: '6px 12px', minWidth: 50,
              fontSize: 10, fontFamily: FONT,
              cursor: highlights.length === 0 && textBoxes.length === 0 ? 'default' : 'pointer',
              background: 'transparent', border: 'none', borderBottom: '2px solid transparent',
              color: highlights.length === 0 && textBoxes.length === 0 ? '#bbb' : '#c00000',
              userSelect: 'none',
            }}
          >
            <span style={{ fontSize: 15, lineHeight: 1 }}>🗑</span>
            <span>Clear All</span>
          </button>
        </div>

        {/* Download */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 12px' }}>
          <button
            onClick={handleDownload}
            disabled={downloading}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 16px',
              fontSize: 12, fontFamily: FONT, fontWeight: 600,
              cursor: downloading ? 'wait' : 'pointer',
              background: downloading ? '#ccc' : '#0078d4',
              color: '#fff', border: 'none', borderRadius: 2,
              userSelect: 'none',
            }}
          >
            <span>⬇</span>
            <span>{downloading ? 'Saving…' : 'Download PDF'}</span>
          </button>
        </div>
      </div>

      {/* ── Page canvas area ── */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        background: '#c8c8c8',
        padding: '32px 0',
        minHeight: 400,
        overflowX: 'auto',
        userSelect: tool === 'highlight' ? 'none' : 'auto',
      }}>
        {numPages === 0
          ? <div style={{ color: '#777', fontSize: 13, paddingTop: 40, fontFamily: FONT }}>Loading PDF…</div>
          : pageLayers
        }
      </div>
    </div>
  )
}
