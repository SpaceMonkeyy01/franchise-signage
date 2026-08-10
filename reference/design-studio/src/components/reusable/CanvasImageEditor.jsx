import { useState, useRef, useEffect, useCallback } from "react";
import { Edit3, X, Maximize2, RotateCcw, Download, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogClose } from "@/components/ui/dialog";
import { setImagePreview, setUpload_file } from "../../store/Slices/SignFormSlice";
import { useDispatch } from "react-redux";
import { base64ToFile } from "../../utils/base64ToFile";

const CanvasImageEditor = ({ imageUrl, toolsOptions }) => {
  const dispatch = useDispatch();

  const canvasRef = useRef(null);
  const [tool, setTool] = useState("move");
  const [lineColor] = useState("#c24646ff");
  const [lineThickness] = useState(1.5);
  const [eraseSize, setEraseSize] = useState(5);
  const [isDrawing, setIsDrawing] = useState(false);
  const [lastPos, setLastPos] = useState({ x: 0, y: 0 });

  const [backgroundRemovedImage, setBackgroundRemovedImage] = useState(null);

  const [canvasSize, setCanvasSize] = useState({
    width: window.innerWidth > 1200 ? 950 : Math.max(400, window.innerWidth * (window.innerWidth < 768 ? 0.9 : 0.7)),
    height: window.innerWidth < 768 ? 400 : 600,
  });
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [imagePos, setImagePos] = useState({ x: 0, y: 0 });
  const [imageSize, setImageSize] = useState({ width: 400, height: 300 });
  const [originalImageSize, setOriginalImageSize] = useState({ width: 0, height: 0 });
  const [scaleFactor, setScaleFactor] = useState(1);

  const [operations, setOperations] = useState({ lines: [], erasedAreas: [] });

  const undoStackRef = useRef([]);
  const eraseUndoSessionActiveRef = useRef(false);

  const cloneOperations = useCallback((ops) => {
    if (typeof structuredClone === "function") return structuredClone(ops);
    return JSON.parse(JSON.stringify(ops));
  }, []);

  const pushUndoSnapshot = useCallback(
    (opsSnapshot) => {
      const MAX_UNDO = 100;
      undoStackRef.current.push(cloneOperations(opsSnapshot));
      if (undoStackRef.current.length > MAX_UNDO) {
        undoStackRef.current.shift();
      }
    },
    [cloneOperations]
  );

  console.log("operations", operations, zoom, imagePos);

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isMiddleMousePressed, setIsMiddleMousePressed] = useState(false);
  const [middleMouseStart, setMiddleMouseStart] = useState({ x: 0, y: 0 });
  const [movingLineIndex, setMovingLineIndex] = useState(-1);
  const [lineDragStart, setLineDragStart] = useState({ x: 0, y: 0 });
  const [hoveredIconIndex, setHoveredIconIndex] = useState(-1);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const imageRef = useRef(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [logoWidthInches, setLogoWidthInches] = useState(toolsOptions?.width_of_sign || "");
  const [showMeasurements] = useState(true);
  let logoBoundsCache = null;

  const [tempLine, setTempLine] = useState(null);

  const canvasToImageCoords = useCallback(
    (canvasX, canvasY) => {
      const scaledImageX = (canvasX - panOffset.x - imagePos.x) / zoom;
      const scaledImageY = (canvasY - panOffset.y - imagePos.y) / zoom;
      const originalImageX = scaledImageX / scaleFactor;
      const originalImageY = scaledImageY / scaleFactor;
      return { x: originalImageX, y: originalImageY };
    },
    [panOffset, imagePos, zoom, scaleFactor]
  );

  const imageToCanvasCoords = useCallback(
    (imageX, imageY) => {
      const scaledImageX = imageX * scaleFactor;
      const scaledImageY = imageY * scaleFactor;
      const canvasX = scaledImageX * zoom + imagePos.x + panOffset.x;
      const canvasY = scaledImageY * zoom + imagePos.y + panOffset.y;
      return { x: canvasX, y: canvasY };
    },
    [panOffset, imagePos, zoom, scaleFactor]
  );

  const getMousePos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageUrl) return;
    canvas.getContext("2d");
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imageRef.current = img;
      setBackgroundRemovedImage(null);
      handleImageLoad();
    };
    img.src = imageUrl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl]);

  const removeImageBackground = async (image) => {
    return new Promise((resolve, reject) => {
      try {
        const MAX_PROCESSING_SIZE = 1024;
        const EXTREME_SIZE_THRESHOLD = 4096;

        let processingWidth = image.width;
        let processingHeight = image.height;

        if (image.width > EXTREME_SIZE_THRESHOLD || image.height > EXTREME_SIZE_THRESHOLD) {
          const aspectRatio = image.width / image.height;
          if (image.width > image.height) {
            processingWidth = MAX_PROCESSING_SIZE / 2;
            processingHeight = MAX_PROCESSING_SIZE / 2 / aspectRatio;
          } else {
            processingHeight = MAX_PROCESSING_SIZE / 2;
            processingWidth = (MAX_PROCESSING_SIZE / 2) * aspectRatio;
          }
        } else if (image.width > MAX_PROCESSING_SIZE || image.height > MAX_PROCESSING_SIZE) {
          const aspectRatio = image.width / image.height;
          if (image.width > image.height) {
            processingWidth = MAX_PROCESSING_SIZE;
            processingHeight = MAX_PROCESSING_SIZE / aspectRatio;
          } else {
            processingHeight = MAX_PROCESSING_SIZE;
            processingWidth = MAX_PROCESSING_SIZE * aspectRatio;
          }
        }

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { alpha: true });
        canvas.width = processingWidth;
        canvas.height = processingHeight;

        ctx.drawImage(image, 0, 0, processingWidth, processingHeight);
        const imageData = ctx.getImageData(0, 0, processingWidth, processingHeight);
        const data = imageData.data;

        const corners = [
          [0, 0], [processingWidth - 1, 0], [0, processingHeight - 1],
          [processingWidth - 1, processingHeight - 1],
          [Math.floor(processingWidth * 0.1), 0], [Math.floor(processingWidth * 0.9), 0],
          [0, Math.floor(processingHeight * 0.1)], [0, Math.floor(processingHeight * 0.9)],
          [processingWidth - 1, Math.floor(processingHeight * 0.1)],
          [processingWidth - 1, Math.floor(processingHeight * 0.9)],
        ];

        let bgR = 0, bgG = 0, bgB = 0;
        corners.forEach(([x, y]) => {
          const idx = (y * image.width + x) * 4;
          bgR += data[idx];
          bgG += data[idx + 1];
          bgB += data[idx + 2];
        });

        bgR = Math.round(bgR / corners.length);
        bgG = Math.round(bgG / corners.length);
        bgB = Math.round(bgB / corners.length);

        const tolerance = 45;

        for (let y = 0; y < processingHeight; y++) {
          for (let x = 0; x < processingWidth; x++) {
            const idx = (y * processingWidth + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            const a = data[idx + 3];
            if (a < 128) continue;
            const diff = Math.sqrt(Math.pow(r - bgR, 2) + Math.pow(g - bgG, 2) + Math.pow(b - bgB, 2));
            if (diff <= tolerance) data[idx + 3] = 0;
          }
        }

        ctx.putImageData(imageData, 0, 0);

        let finalCanvas = canvas;
        if (processingWidth !== image.width || processingHeight !== image.height) {
          finalCanvas = document.createElement("canvas");
          finalCanvas.width = image.width;
          finalCanvas.height = image.height;
          const finalCtx = finalCanvas.getContext("2d", { alpha: true });
          finalCtx.drawImage(canvas, 0, 0, processingWidth, processingHeight, 0, 0, image.width, image.height);
        }

        const newImage = new Image();
        newImage.onload = () => resolve(newImage);
        newImage.onerror = reject;
        newImage.src = finalCanvas.toDataURL("image/png");
      } catch (error) {
        console.error("Error removing background:", error);
        reject(error);
      }
    });
  };

  const handleImageLoad = async () => {
    const img = imageRef.current;
    if (!img) return;

    const SKIP_BACKGROUND_REMOVAL_THRESHOLD = 8000;
    const shouldSkipBackgroundRemoval =
      img.naturalWidth > SKIP_BACKGROUND_REMOVAL_THRESHOLD ||
      img.naturalHeight > SKIP_BACKGROUND_REMOVAL_THRESHOLD;

    let processedImage;

    if (shouldSkipBackgroundRemoval) {
      processedImage = img;
    } else {
      if (backgroundRemovedImage) {
        processedImage = backgroundRemovedImage;
      } else {
        try {
          setIsProcessing(true);
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error("Background removal timeout")), 15000);
          });
          processedImage = await Promise.race([removeImageBackground(img), timeoutPromise]);
          setBackgroundRemovedImage(processedImage);
        } catch (error) {
          console.warn("Background removal failed or timed out, using original image:", error.message);
          processedImage = img;
        } finally {
          setIsProcessing(false);
        }
      }
    }

    imageRef.current = processedImage;

    const originalWidth = img.naturalWidth;
    const originalHeight = img.naturalHeight;

    setOriginalImageSize({ width: originalWidth, height: originalHeight });

    const maxCanvasWidth = window.innerWidth > 1200 ? 950 : window.innerWidth * 0.7;
    const maxCanvasHeight = 600;

    const padding = 40;
    const availableWidth = maxCanvasWidth - padding * 2;
    const availableHeight = maxCanvasHeight - padding * 2;

    const scaleX = availableWidth / originalWidth;
    const scaleY = availableHeight / originalHeight;
    const scale = Math.min(scaleX, scaleY, 1);

    setScaleFactor(scale);

    const scaledWidth = originalWidth * scale;
    const scaledHeight = originalHeight * scale;

    setCanvasSize({ width: maxCanvasWidth, height: maxCanvasHeight });
    setImagePos({ x: (maxCanvasWidth - scaledWidth) / 2, y: (maxCanvasHeight - scaledHeight) / 2 });
    setImageSize({ width: scaledWidth, height: scaledHeight });
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });

    setTimeout(() => {
      logoBoundsCache = detectLogoBoundsSync(processedImage);
      console.log("Foreground bounds detected and cached:", logoBoundsCache);
    }, 100);
  };

  const handleWheel = useCallback(
    (e) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;

      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.1, Math.min(5, zoom * zoomFactor));

      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const newPanX = mouseX - (mouseX - panOffset.x) * (newZoom / zoom);
      const newPanY = mouseY - (mouseY - panOffset.y) * (newZoom / zoom);

      setZoom(newZoom);
      setPanOffset({ x: newPanX, y: newPanY });
    },
    [zoom, panOffset]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  useEffect(() => {
    const checkIsMobile = () => setIsMobile(window.innerWidth < 768);
    checkIsMobile();
    window.addEventListener("resize", checkIsMobile);
    return () => window.removeEventListener("resize", checkIsMobile);
  }, []);

  // ============ KEYBOARD SHORTCUTS (ESC + Ctrl+Z / Cmd+Z) ============
  const undoLastAction = useCallback(() => {
    const prevSnapshot = undoStackRef.current.pop();
    if (!prevSnapshot) return;
    setTempLine(null);
    setIsDrawing(false);
    setIsDragging(false);
    setMovingLineIndex(-1);
    setHoveredIconIndex(-1);
    eraseUndoSessionActiveRef.current = false;
    setOperations(prevSnapshot);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      // ESC — close editor
      if (e.key === "Escape" || e.keyCode === 27) {
        const closeButton = document.getElementById("closeStrokeModal");
        if (closeButton) closeButton.click();
      }

      // Ctrl+Z (Windows/Linux) or Cmd+Z (Mac) — undo
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        // Don't intercept when user is typing in an input or textarea
        if (
          document.activeElement?.tagName === "INPUT" ||
          document.activeElement?.tagName === "TEXTAREA"
        ) {
          return;
        }
        e.preventDefault();
        undoLastAction();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [undoLastAction]);

  // ============ GETCLICKEDMOVEICON ============
  const getClickedMoveIcon = (pos) => {
    console.log("Checking move icons for click at:", pos, "zoom:", zoom, "panOffset:", panOffset);

    for (let i = 0; i < operations.lines.length; i++) {
      const line = operations.lines[i];
      if (line.type === "custom") {
        const startCanvas = imageToCanvasCoords(line.startX, line.startY);
        const endCanvas = imageToCanvasCoords(line.endX, line.endY);

        const midX = (startCanvas.x + endCanvas.x) / 2;
        const midY = (startCanvas.y + endCanvas.y) / 2;

        const lineThickness = line.thickness || 1.5;
        const baseFontSize = 10;
        const fontSize = Math.max(10, Math.min(18, baseFontSize + lineThickness * 2));

        const textY = midY - fontSize / 2 - 5;
        const iconSize = 12;
        const iconX = midX;
        const iconY = textY + fontSize / 2 + 8;
        const iconRadius = iconSize / 2;

        const distance = Math.sqrt(Math.pow(pos.x - iconX, 2) + Math.pow(pos.y - iconY, 2));
        if (distance <= iconRadius) return i;
      }
    }
    return -1;
  };

  // ============ HANDLEMOUSEDOWN ============
  const handleMouseDown = (e) => {
    const pos = getMousePos(e);
    setLastPos(pos);

    const clickedIconIndex = getClickedMoveIcon(pos);
    if (clickedIconIndex !== -1) {
      e.preventDefault();
      e.stopPropagation();
      pushUndoSnapshot(operations);
      setMovingLineIndex(clickedIconIndex);
      setLineDragStart(pos);
      return;
    }

    if (e.button === 1) {
      e.preventDefault();
      setIsMiddleMousePressed(true);
      setMiddleMouseStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
      return;
    }

    if (tool === "line") {
      const imageCoords = canvasToImageCoords(pos.x, pos.y);
      setTempLine({
        type: "custom",
        startX: imageCoords.x,
        startY: imageCoords.y,
        endX: imageCoords.x,
        endY: imageCoords.y,
        color: lineColor,
        thickness: lineThickness,
      });
      setIsDrawing(true);
      return;
    }

    setIsDrawing(true);

    if (tool === "move") {
      const imageCoords = canvasToImageCoords(pos.x, pos.y);
      if (
        imageCoords.x >= 0 &&
        imageCoords.x <= originalImageSize.width &&
        imageCoords.y >= 0 &&
        imageCoords.y <= originalImageSize.height
      ) {
        setIsDragging(true);
        setDragStart({ x: pos.x - panOffset.x, y: pos.y - panOffset.y });
      }
    } else if (tool === "erase") {
      if (!eraseUndoSessionActiveRef.current) {
        pushUndoSnapshot(operations);
        eraseUndoSessionActiveRef.current = true;
      }
    }
  };

  // ============ HANDLEMOUSEMOVE ============
  const handleMouseMove = (e) => {
    const pos = getMousePos(e);

    if (movingLineIndex === -1) {
      const hoveredIndex = getClickedMoveIcon(pos);
      if (hoveredIndex !== hoveredIconIndex) setHoveredIconIndex(hoveredIndex);
    }

    if (movingLineIndex !== -1) {
      const deltaX = pos.x - lineDragStart.x;
      const deltaY = pos.y - lineDragStart.y;
      const deltaImageX = deltaX / zoom / scaleFactor;
      const deltaImageY = deltaY / zoom / scaleFactor;

      setOperations((prev) => {
        const newLines = [...prev.lines];
        const line = { ...newLines[movingLineIndex] };
        line.startX += deltaImageX;
        line.startY += deltaImageY;
        line.endX += deltaImageX;
        line.endY += deltaImageY;
        newLines[movingLineIndex] = line;
        return { ...prev, lines: newLines };
      });

      setLineDragStart(pos);
      return;
    }

    if (isMiddleMousePressed) {
      setPanOffset({ x: e.clientX - middleMouseStart.x, y: e.clientY - middleMouseStart.y });
      return;
    }

    if (tool === "line" && isDrawing && tempLine) {
      const imageCoords = canvasToImageCoords(pos.x, pos.y);
      const dx = imageCoords.x - tempLine.startX;
      const dy = imageCoords.y - tempLine.startY;
      let angle = Math.atan2(dy, dx) * (180 / Math.PI);
      if (angle < 0) angle += 360;
      const angle180 = ((angle % 180) + 180) % 180;
      const distToHorizontal = Math.min(angle180, 180 - angle180);
      const distToVertical = Math.abs(angle180 - 90);
      const SNAP_ANGLE_THRESHOLD = 3;

      let endX = imageCoords.x;
      let endY = imageCoords.y;
      let snapAxis = null;

      if (distToHorizontal < SNAP_ANGLE_THRESHOLD || distToVertical < SNAP_ANGLE_THRESHOLD) {
        if (distToHorizontal <= distToVertical) {
          endY = tempLine.startY;
          snapAxis = "horizontal";
        } else {
          endX = tempLine.startX;
          snapAxis = "vertical";
        }
      }

      setTempLine({ ...tempLine, endX, endY, snapAxis });
      return;
    }

    if (!isDrawing) return;

    if (tool === "move" && isDragging) {
      setPanOffset({ x: pos.x - dragStart.x, y: pos.y - dragStart.y });
    } else if (tool === "erase") {
      const imageCoords = canvasToImageCoords(pos.x, pos.y);
      const lastImageCoords = canvasToImageCoords(lastPos.x, lastPos.y);

      if (
        imageCoords.x >= 0 &&
        imageCoords.x <= originalImageSize.width &&
        imageCoords.y >= 0 &&
        imageCoords.y <= originalImageSize.height
      ) {
        const adjustedSize = eraseSize / zoom;
        const dx = imageCoords.x - lastImageCoords.x;
        const dy = imageCoords.y - lastImageCoords.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const steps = Math.max(1, Math.floor(distance / (adjustedSize / 4)));

        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const interpX = lastImageCoords.x + dx * t;
          const interpY = lastImageCoords.y + dy * t;
          setOperations((prev) => ({
            ...prev,
            erasedAreas: [
              ...prev.erasedAreas,
              {
                x: interpX - adjustedSize / 2,
                y: interpY - adjustedSize / 2,
                width: adjustedSize,
                height: adjustedSize,
                shape: "circle",
              },
            ],
          }));
        }
      }
    }

    setLastPos(pos);
  };

  // ============ HANDLEMOUSEUP ============
  const handleMouseUp = () => {
    if (movingLineIndex !== -1) {
      setMovingLineIndex(-1);
      setHoveredIconIndex(-1);
      return;
    }

    if (isMiddleMousePressed) {
      setIsMiddleMousePressed(false);
      return;
    }

    if (tool === "line" && isDrawing && tempLine) {
      const lineLength = Math.sqrt(
        Math.pow(tempLine.endX - tempLine.startX, 2) + Math.pow(tempLine.endY - tempLine.startY, 2)
      );

      if (lineLength > 5 / zoom) {
        pushUndoSnapshot(operations);
        setOperations((prev) => ({ ...prev, lines: [...prev.lines, tempLine] }));
      }

      setTempLine(null);
    }

    setIsDrawing(false);
    setIsDragging(false);
    eraseUndoSessionActiveRef.current = false;
  };

  // ============ REDRAWCANVAS ============
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const img = imageRef.current;

    if (!canvas || !ctx || !img) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = isDarkMode ? "#1e293b" : "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(panOffset.x, panOffset.y);

    ctx.strokeStyle = isDarkMode ? "#334155" : "#e5e7eb";
    ctx.lineWidth = 1;
    const gridSize = 20;

    for (let x = -panOffset.x; x <= canvas.width - panOffset.x; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, -panOffset.y);
      ctx.lineTo(x, canvas.height - panOffset.y);
      ctx.stroke();
    }

    for (let y = -panOffset.y; y <= canvas.height - panOffset.y; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(-panOffset.x, y);
      ctx.lineTo(canvas.width - panOffset.x, y);
      ctx.stroke();
    }

    ctx.drawImage(img, imagePos.x, imagePos.y, imageSize.width * zoom, imageSize.height * zoom);

    const finalizedLines = [...operations.lines];
    if (tempLine) {
      finalizedLines.push({ ...tempLine, isDrawing: true });
    }

    if (tempLine && tool === "line" && isDrawing) {
      const startCanvas = imageToCanvasCoords(tempLine.startX, tempLine.startY);

      const showHorizontal = tempLine.snapAxis === "horizontal";
      const showVertical = tempLine.snapAxis === "vertical";

      if (showHorizontal || showVertical) {
        ctx.save();
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = isDarkMode ? "#d15e5eff" : "#000000";
        ctx.lineWidth = 2;

        if (showHorizontal) {
          ctx.beginPath();
          ctx.moveTo(-panOffset.x, startCanvas.y - panOffset.y);
          ctx.lineTo(canvas.width - panOffset.x, startCanvas.y - panOffset.y);
          ctx.stroke();
        }

        if (showVertical) {
          ctx.beginPath();
          ctx.moveTo(startCanvas.x - panOffset.x, -panOffset.y);
          ctx.lineTo(startCanvas.x - panOffset.x, canvas.height - panOffset.y);
          ctx.stroke();
        }

        ctx.restore();
      }
    }

    finalizedLines.forEach((line) => {
      ctx.beginPath();
      ctx.strokeStyle = line.color || "#d15e5eff";
      ctx.lineWidth = line.thickness || 1.5;
      ctx.lineCap = "round";

      if (line.type === "custom") {
        const startCanvas = imageToCanvasCoords(line.startX, line.startY);
        const endCanvas = imageToCanvasCoords(line.endX, line.endY);
        ctx.moveTo(startCanvas.x - panOffset.x, startCanvas.y - panOffset.y);
        ctx.lineTo(endCanvas.x - panOffset.x, endCanvas.y - panOffset.y);
      }

      ctx.stroke();

      if (logoWidthInches && line.type === "custom" && !line.isPreview && !line.isDrawing) {
        const measurement = calculateLineMeasurement(line, imageSize.width, logoWidthInches);
        if (measurement) {
          const startCanvas = imageToCanvasCoords(line.startX, line.startY);
          const endCanvas = imageToCanvasCoords(line.endX, line.endY);
          const midX = (startCanvas.x + endCanvas.x) / 2 - panOffset.x;
          const midY = (startCanvas.y + endCanvas.y) / 2 - panOffset.y;

          const lineThickness = line.thickness || 1.5;
          const baseFontSize = 10;
          const fontSize = Math.max(10, Math.min(18, baseFontSize + lineThickness * 2));
          ctx.font = `${fontSize}px Arial`;
          ctx.fillStyle = "#000000";
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          const measurementValue = parseFloat(measurement.inches);
          const formattedValue = measurementValue % 1 === 0 ? measurementValue.toFixed(0) : measurementValue.toFixed(1);
          const millimeters = measurementValue * 25.4;
          const formattedMm = millimeters % 1 === 0 ? millimeters.toFixed(0) : millimeters.toFixed(1);
          const text = `${formattedValue}''(${formattedMm} mm)`.trim();

          ctx.measureText(text);

          const textX = midX;
          const textY = midY - fontSize / 2 - 5;

          ctx.strokeStyle = isDarkMode ? "#000000" : "#ffffff";
          ctx.lineWidth = 2;
          ctx.strokeText(text, textX, textY);

          ctx.fillStyle = isDarkMode ? "#ffffff" : "#000000";
          ctx.fillText(text, textX, textY);

          const iconSize = 12;
          const iconX = textX;
          const iconY = textY + fontSize / 2 + 8;

          ctx.fillStyle = isDarkMode ? "rgba(59, 130, 246, 0.9)" : "rgba(59, 130, 246, 0.8)";
          ctx.beginPath();
          ctx.arc(iconX, iconY, iconSize / 2, 0, 2 * Math.PI);
          ctx.fill();

          ctx.strokeStyle = "white";
          ctx.lineWidth = 1.5;
          ctx.lineCap = "round";

          ctx.beginPath();
          ctx.moveTo(iconX, iconY - 3);
          ctx.lineTo(iconX, iconY - 6);
          ctx.moveTo(iconX - 2, iconY - 5);
          ctx.lineTo(iconX, iconY - 6);
          ctx.lineTo(iconX + 2, iconY - 5);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(iconX, iconY + 3);
          ctx.lineTo(iconX, iconY + 6);
          ctx.moveTo(iconX - 2, iconY + 5);
          ctx.lineTo(iconX, iconY + 6);
          ctx.lineTo(iconX + 2, iconY + 5);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(iconX - 3, iconY);
          ctx.lineTo(iconX - 6, iconY);
          ctx.moveTo(iconX - 5, iconY - 2);
          ctx.lineTo(iconX - 6, iconY);
          ctx.lineTo(iconX - 5, iconY + 2);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(iconX + 3, iconY);
          ctx.lineTo(iconX + 6, iconY);
          ctx.moveTo(iconX + 5, iconY - 2);
          ctx.lineTo(iconX + 6, iconY);
          ctx.lineTo(iconX + 5, iconY + 2);
          ctx.stroke();
        }
      }
    });

    ctx.globalCompositeOperation = "destination-out";
    operations.erasedAreas.forEach((area) => {
      ctx.fillStyle = "rgba(0, 0, 0, 1)";
      if (area.shape === "rectangle") {
        const canvasCoords = imageToCanvasCoords(area.x, area.y);
        ctx.fillRect(
          canvasCoords.x - panOffset.x,
          canvasCoords.y - panOffset.y,
          area.width * zoom,
          area.height * zoom
        );
      } else if (area.shape === "circle") {
        const centerCanvas = imageToCanvasCoords(area.x + area.width / 2, area.y + area.height / 2);
        const radius = (Math.min(area.width, area.height) / 2) * zoom;
        ctx.beginPath();
        ctx.arc(centerCanvas.x - panOffset.x, centerCanvas.y - panOffset.y, radius, 0, 2 * Math.PI);
        ctx.fill();
      }
    });

    ctx.restore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    imagePos, imageSize, operations, logoWidthInches, showMeasurements,
    tempLine, zoom, panOffset, imageToCanvasCoords, isDarkMode,
  ]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas, isDarkMode]);

  const resetZoom = () => {
    const canvas = canvasRef.current;
    if (!canvas || !imageRef.current) return;
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const centerX = (canvasWidth - imageSize.width) / 2;
    const centerY = (canvasHeight - imageSize.height) / 2;
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
    setImagePos({ x: centerX, y: centerY });
  };

  const zoomExtent = () => {
    const canvas = canvasRef.current;
    if (!canvas || !imageRef.current) return;
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const padding = 0.05;
    const availableWidth = canvasWidth * (1 - padding);
    const availableHeight = canvasHeight * (1 - padding);
    const zoomX = availableWidth / imageSize.width;
    const zoomY = availableHeight / imageSize.height;
    const newZoom = Math.min(zoomX, zoomY, 5);
    const scaledWidth = imageSize.width * newZoom;
    const scaledHeight = imageSize.height * newZoom;
    const centerX = (canvasWidth - scaledWidth) / 2;
    const centerY = (canvasHeight - scaledHeight) / 2;
    setZoom(newZoom);
    setPanOffset({ x: 0, y: 0 });
    setImagePos({ x: centerX, y: centerY });
  };

  const resetMeasurements = () => {
    setOperations({ lines: [], erasedAreas: [] });
    setTempLine(null);
    setIsDrawing(false);
    setIsDragging(false);
    setIsMiddleMousePressed && setIsMiddleMousePressed(false);
    undoStackRef.current = [];
  };

  const toggleDarkMode = () => setIsDarkMode((prev) => !prev);

  const detectLogoBoundsSync = (image) => {
    if (!image) return { x: 0, y: 0, width: image?.width || 0, height: image?.height || 0 };

    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = image.width;
      canvas.height = image.height;
      ctx.drawImage(image, 0, 0);
      const imageData = ctx.getImageData(0, 0, image.width, image.height);
      const data = imageData.data;

      const corners = [
        [0, 0], [image.width - 1, 0], [0, image.height - 1],
        [image.width - 1, image.height - 1],
        [Math.floor(image.width * 0.1), 0], [Math.floor(image.width * 0.9), 0],
        [0, Math.floor(image.height * 0.1)], [0, Math.floor(image.height * 0.9)],
      ];

      let bgR = 0, bgG = 0, bgB = 0;
      corners.forEach(([x, y]) => {
        const idx = (y * image.width + x) * 4;
        bgR += data[idx];
        bgG += data[idx + 1];
        bgB += data[idx + 2];
      });
      bgR = Math.round(bgR / corners.length);
      bgG = Math.round(bgG / corners.length);
      bgB = Math.round(bgB / corners.length);

      let minX = image.width, maxX = 0, minY = image.height, maxY = 0;
      let foregroundPixelsFound = 0;
      const tolerance = 45;

      for (let y = 0; y < image.height; y++) {
        for (let x = 0; x < image.width; x++) {
          const idx = (y * image.width + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const a = data[idx + 3];
          if (a < 128) continue;
          const diff = Math.sqrt(Math.pow(r - bgR, 2) + Math.pow(g - bgG, 2) + Math.pow(b - bgB, 2));
          if (diff > tolerance) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
            foregroundPixelsFound++;
          }
        }
      }

      if (foregroundPixelsFound === 0) return { x: 0, y: 0, width: image.width, height: image.height };

      const paddingPx = Math.min(image.width, image.height) * 0.01;
      return {
        x: Math.max(0, minX - paddingPx),
        y: Math.max(0, minY - paddingPx),
        width: Math.min(image.width, maxX + paddingPx) - Math.max(0, minX - paddingPx),
        height: Math.min(image.height, maxY + paddingPx) - Math.max(0, minY - paddingPx),
      };
    } catch (error) {
      console.error("Sync foreground detection error:", error);
      return { x: 0, y: 0, width: image.width, height: image.height };
    }
  };

  const calculateLineMeasurement = (line, imageWidth, logoWidthInches) => {
    if (!logoWidthInches || logoWidthInches <= 0) return null;
    if (!imageRef.current) return null;

    if (!logoBoundsCache) {
      logoBoundsCache = detectLogoBoundsSync(imageRef.current);
    }

    const foregroundBounds = logoBoundsCache;
    const foregroundPixelWidth = foregroundBounds.width;

    let lineLength = 0;
    if (line.type === "custom") {
      const dx = line.endX - line.startX;
      const dy = line.endY - line.startY;
      lineLength = Math.sqrt(dx * dx + dy * dy);
    }

    const measurementInches = (lineLength / foregroundPixelWidth) * parseFloat(logoWidthInches);
    return {
      inches: measurementInches.toFixed(2),
      pixels: Math.round(lineLength),
      percentage: ((lineLength / foregroundPixelWidth) * 100).toFixed(1),
      foregroundBounds,
    };
  };

  const handleReset = () => {
    setOperations({ lines: [], erasedAreas: [] });
    resetZoom();
    if (backgroundRemovedImage) {
      imageRef.current = backgroundRemovedImage;
      const originalWidth = backgroundRemovedImage.naturalWidth || backgroundRemovedImage.width;
      const originalHeight = backgroundRemovedImage.naturalHeight || backgroundRemovedImage.height;
      const maxCanvasWidth = window.innerWidth > 1200 ? 950 : window.innerWidth * 0.7;
      const maxCanvasHeight = 600;
      const padding = 40;
      const availableWidth = maxCanvasWidth - padding * 2;
      const availableHeight = maxCanvasHeight - padding * 2;
      const scaleX = availableWidth / originalWidth;
      const scaleY = availableHeight / originalHeight;
      const scale = Math.min(scaleX, scaleY, 1);
      const scaledWidth = originalWidth * scale;
      const scaledHeight = originalHeight * scale;
      setScaleFactor(scale);
      setCanvasSize({ width: maxCanvasWidth, height: maxCanvasHeight });
      setImagePos({ x: (maxCanvasWidth - scaledWidth) / 2, y: (maxCanvasHeight - scaledHeight) / 2 });
      setImageSize({ width: scaledWidth, height: scaledHeight });
      setZoom(1);
      setPanOffset({ x: 0, y: 0 });
    } else if (imageRef.current) {
      handleImageLoad();
    }
  };

  const handleSave = async (getBase64 = false) => {
    if (!imageUrl) return;
    setIsProcessing(true);
    try {
      const originalImg = imageRef.current;
      const saveCanvas = document.createElement("canvas");
      const saveCtx = saveCanvas.getContext("2d", { alpha: true, willReadFrequently: false });
      const finalWidth = originalImageSize.width;
      const finalHeight = originalImageSize.height;
      saveCanvas.width = finalWidth;
      saveCanvas.height = finalHeight;
      saveCtx.clearRect(0, 0, finalWidth, finalHeight);
      saveCtx.drawImage(originalImg, 0, 0, finalWidth, finalHeight);

      operations.lines.forEach((line) => {
        saveCtx.beginPath();
        saveCtx.strokeStyle = line.color || "#ff0000";
        saveCtx.lineWidth = line.thickness || 2;
        saveCtx.lineCap = "round";
        saveCtx.moveTo(line.startX, line.startY);
        saveCtx.lineTo(line.endX, line.endY);
        saveCtx.stroke();

        if (logoWidthInches && !line.isSeamLine) {
          const measurement = calculateLineMeasurement(line, imageSize.width, logoWidthInches);
          if (measurement) {
            const midX = (line.startX + line.endX) / 2;
            const midY = (line.startY + line.endY) / 2;
            const fontSize = Math.max(18, Math.min(22, finalWidth / 50));
            saveCtx.font = `bold ${fontSize}px Arial`;
            saveCtx.textAlign = "center";
            saveCtx.textBaseline = "middle";

            const measurementValue = parseFloat(measurement.inches);
            const formattedValue = measurementValue % 1 === 0 ? measurementValue.toFixed(0) : measurementValue.toFixed(1);
            const millimeters = measurementValue * 25.4;
            const formattedMm = millimeters % 1 === 0 ? millimeters.toFixed(0) : millimeters.toFixed(1);
            const text = `${formattedValue}''(${formattedMm} mm)`.trim();

            const textMetrics = saveCtx.measureText(text);
            const p = 2;
            saveCtx.fillStyle = "rgba(0, 0, 0, 0.8)";
            saveCtx.fillRect(midX - textMetrics.width / 2 - p, midY - fontSize / 2 - p / 2, textMetrics.width + p * 2, fontSize + p);
            saveCtx.fillStyle = "white";
            saveCtx.fillText(text, midX, midY);
          }
        }
      });

      saveCtx.save();
      saveCtx.globalCompositeOperation = "destination-out";
      operations.erasedAreas.forEach((area) => {
        saveCtx.fillStyle = "rgba(0, 0, 0, 1)";
        if (area.shape === "circle") {
          saveCtx.beginPath();
          saveCtx.arc(area.x + area.width / 2, area.y + area.height / 2, area.width / 2, 0, 2 * Math.PI);
          saveCtx.fill();
        } else {
          saveCtx.fillRect(area.x, area.y, area.width, area.height);
        }
      });
      saveCtx.restore();

      if (getBase64) {
        const base64Image = saveCanvas.toDataURL("image/png", 1.0);
        return base64Image;
      }

      saveCanvas.toBlob(
        (blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `edited-image-${Date.now()}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        },
        "image/png",
        1.0
      );
    } catch (error) {
      console.error("Error saving image:", error);
      alert("Failed to save image. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const styles = {
    modal: {
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: "rgba(0, 0, 0, 0.8)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50,
    },
    container: {
      backgroundColor: "white",
      borderRadius: isMobile ? "12px" : "16px",
      boxShadow: "0 25px 50px rgba(0, 0, 0, 0.25)",
      maxWidth: isMobile ? "100vw" : "1400px",
      width: "100%",
      maxHeight: isMobile ? "100vh" : "95vh",
      height: isMobile ? "100vh" : "95vh",
      overflow: "hidden", display: "flex", flexDirection: "column",
    },
    zoomButton: {
      padding: "8px", backgroundColor: "#3b82f6", color: "white",
      border: "none", borderRadius: "4px", cursor: "pointer",
      display: "flex", alignItems: "center", justifyContent: "center",
      transition: "all 0.2s", minWidth: "36px", minHeight: "36px",
    },
    zoomInfo: { fontSize: "12px", textAlign: "center", color: "#666", padding: "4px 8px" },
  };

  return (
    <div style={styles.modal}>
      <div style={styles.container}>
        {/* Header */}
        <div
          className="bg-background"
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: isMobile ? "16px" : "24px", borderBottom: "1px solid #e5e5e5",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ padding: "8px", backgroundColor: "#2563eb", borderRadius: "8px", color: "white" }}>
              <Edit3 size={24} />
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <h2 style={{ fontSize: isMobile ? "18px" : "24px", fontWeight: "bold", color: "white", margin: 0 }}>
                {isMobile ? "Editor" : "Canvas Image Editor"}
              </h2>
              <p style={{ fontSize: isMobile ? "12px" : "14px", color: "white", margin: 0, display: isMobile ? "none" : "block" }}>
                Edit, annotate, and enhance your image
              </p>
            </div>
          </div>
          <DialogClose id="closeStrokeModal" asChild>
            <button
              style={{
                padding: "8px", backgroundColor: "transparent", border: "none",
                borderRadius: "50%", cursor: "pointer", transition: "all 0.2s", color: "#6b7280",
              }}
              title="Close editor"
            >
              <X size={24} />
            </button>
          </DialogClose>
        </div>

        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* Main Canvas Area */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
            <div
              className="bg-background blueprint-grid"
              style={{
                flex: "1 1 auto", display: "flex", alignItems: "center", justifyContent: "center",
                padding: isMobile ? "16px" : "32px",
                minHeight: isMobile ? "300px" : "400px", position: "relative",
              }}
            >
              {/* Controls Overlay - RIGHT SIDE */}
              <div
                className="backfround-transparent"
                style={{
                  position: "absolute", top: isMobile ? "5px" : "10px", right: isMobile ? "5px" : "10px",
                  display: "flex", flexDirection: "column", gap: isMobile ? "4px" : "8px",
                  zIndex: 10, borderRadius: "8px", padding: isMobile ? "4px" : "8px",
                  width: "max-content", textAlign: "right", justifyContent: "end", alignItems: "end",
                }}
              >
                <Button onClick={zoomExtent} className="btn-secondary w-max" title="Fit to View">
                  <Maximize2 size={16} />
                </Button>

                <div style={{ height: "1px", backgroundColor: "#d1d5db", margin: "4px 0" }}> </div>

                <Button onClick={() => setTool("line")} className="btn-primary w-max" title="Stroke Measurement">
                  {isMobile && <Edit3 size={20} />}
                  {!isMobile && "Stroke Measurement"}
                </Button>

                <Button onClick={() => setTool("erase")} className="btn-primary w-max" id="btn-mn" title="Add Seam Lines">
                  {isMobile && (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
                    </svg>
                  )}
                  {!isMobile && "Add Seam Line"}
                </Button>

                <div className="text-center text-sm">{(zoom * 100).toFixed(0)}%</div>

                {tool === "line" && (
                  <div className={`bg-black ${isMobile ? "p-2" : "p-3"}`}>
                    <div>
                      <label className={`text-sm font-medium text-white mb-2 block ${isMobile ? "text-xs" : ""}`}>
                        Logo Width (in)
                      </label>
                      <input
                        type="number"
                        value={logoWidthInches}
                        onChange={(e) => setLogoWidthInches(e.target.value)}
                        placeholder="Enter logo width"
                        className={`border border-white rounded-sm p-2 ${isMobile ? "w-24 text-sm" : "w-32"}`}
                        step="0.1"
                        min="0"
                      />
                    </div>
                  </div>
                )}

                {tool === "erase" && (
                  <div className={`bg-black ${isMobile ? "p-2" : "p-3"}`}>
                    <div>
                      <label style={{ display: "block", fontSize: isMobile ? "12px" : "14px", fontWeight: "500", marginBottom: isMobile ? "6px" : "8px", color: "white" }}>
                        Erase Size: <span className={`text-md ${isMobile ? "text-sm" : ""}`}>{eraseSize}px</span>
                      </label>
                      <input
                        type="range" min="5" max="50" value={eraseSize}
                        onChange={(e) => setEraseSize(parseInt(e.target.value))}
                        style={{ width: "100%", height: isMobile ? "6px" : "8px", borderRadius: "4px", appearance: "none", cursor: "pointer", backgroundColor: "white" }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div style={{ position: "relative" }}>
                <canvas
                  ref={canvasRef}
                  width={canvasSize.width}
                  height={canvasSize.height}
                  style={{
                    borderRadius: "8px",
                    boxShadow: "0 10px 15px rgba(0, 0, 0, 0.1)",
                    backgroundColor: "white",
                    transition: "border-color 0.2s",
                    cursor:
                      hoveredIconIndex !== -1 ? "grab"
                        : movingLineIndex !== -1 ? "grabbing"
                          : tool === "move" ? "grab"
                            : tool === "line" ? "crosshair"
                              : "pointer",
                  }}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={() => setHoveredIconIndex(-1)}
                  onContextMenu={(e) => e.preventDefault()}
                />
                <div
                  style={{
                    position: "absolute", bottom: isMobile ? "-24px" : "-32px",
                    left: "50%", transform: "translateX(-50%)",
                    fontSize: isMobile ? "10px" : "12px", color: "#6b7280",
                    fontFamily: "monospace", textAlign: "center",
                    maxWidth: "90%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}
                >
                  {isMobile
                    ? `${(zoom * 100).toFixed(0)}%`
                    : `${canvasSize.width} × ${canvasSize.height} • Zoom: ${(zoom * 100).toFixed(0)}% • Use mouse wheel to zoom • Ctrl+Z to undo`}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Actions Panel */}
        <div
          className="bg-background flex items-center justify-center"
          style={{ padding: isMobile ? "16px" : "24px", flexShrink: 0 }}
        >
          <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: isMobile ? "8px" : "16px", width: "100%", maxWidth: "100%" }}>

            {/* Dark/Light Mode Toggle */}
            <Button onClick={toggleDarkMode} className="btn-primary" size="lg" title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}>
              {isDarkMode ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
              {!isMobile && (isDarkMode ? "Light" : "Dark")}
            </Button>

            {/* Reset Measurements */}
            <Button onClick={resetMeasurements} className="btn-primary" size="lg" title="Reset Measurements">
              <RotateCcw size={16} />
              {!isMobile && "Reset"}
            </Button>

            {/* Undo — also triggered by Ctrl+Z */}
            <Button onClick={undoLastAction} className="btn-primary" size="lg" title="Undo Last Action (Ctrl+Z)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
              </svg>
              {!isMobile && "Undo"}
            </Button>

            {/* Reset View & Operations */}
            <Button onClick={handleReset} className="btn-primary" size="lg">
              <RotateCcw size={16} />
              {!isMobile && "Reset View & Operations"}
            </Button>

            {/* Download */}
            <Button onClick={() => handleSave(false)} disabled={isProcessing} className="btn-primary" size="lg">
              {isProcessing ? (
                <>
                  <div style={{ border: "3px solid rgba(255,255,255,0.3)", borderTop: "3px solid #fff", borderRadius: "50%", width: "16px", height: "16px", animation: "spin 1s linear infinite", marginRight: "5px" }}></div>
                  Saving...
                </>
              ) : (
                <>
                  <Download size={16} />
                  {!isMobile && "Download Edited Image"}
                </>
              )}
            </Button>

            {/* Set to Default */}
            <Button
              onClick={async () => {
                setOperations({ lines: [], erasedAreas: [] });
                setTimeout(() => {
                  const canvas = canvasRef.current;
                  if (canvas) {
                    const ctx = canvas.getContext("2d");
                    if (ctx) { ctx.clearRect(0, 0, canvas.width, canvas.height); redrawCanvas(); }
                  }
                }, 0);

                try {
                  const tempCanvas = document.createElement("canvas");
                  const tempCtx = tempCanvas.getContext("2d");
                  tempCanvas.width = originalImageSize.width;
                  tempCanvas.height = originalImageSize.height;

                  if (imageRef.current) {
                    tempCtx.drawImage(imageRef.current, 0, 0, originalImageSize.width, originalImageSize.height);
                    tempCtx.save();
                    tempCtx.globalCompositeOperation = "destination-out";
                    operations.erasedAreas.forEach((area) => {
                      tempCtx.fillStyle = "rgba(0, 0, 0, 1)";
                      if (area.shape === "circle") {
                        tempCtx.beginPath();
                        tempCtx.arc(area.x + area.width / 2, area.y + area.height / 2, area.width / 2, 0, 2 * Math.PI);
                        tempCtx.fill();
                      } else {
                        tempCtx.fillRect(area.x, area.y, area.width, area.height);
                      }
                    });
                    tempCtx.restore();

                    const cleanBase64 = tempCanvas.toDataURL("image/png");
                    dispatch(setUpload_file(base64ToFile(cleanBase64, "sign.png")))
                    dispatch(setImagePreview(cleanBase64));
                    // dispatch(imageToTextThunk({ file: base64ToFile(cleanBase64, "sign.png") }));
                    document.getElementById("closeStrokeModal")?.click();
                  }
                } catch (error) {
                  console.error("Error creating clean image:", error);
                  if (imageUrl) {
                    const response = await fetch(imageUrl);
                    const blob = await response.blob();
                    const reader = new FileReader();
                    reader.onload = () => {
                      const base64String = reader.result;
                      dispatch(setUpload_file(base64ToFile(base64String, "sign.png")))
                      dispatch(setImagePreview(base64String));
                      // dispatch(imageToTextThunk({ file: base64ToFile(base64String, "sign.png") }));
                      document.getElementById("closeStrokeModal")?.click();
                    };
                    reader.readAsDataURL(blob);
                  }
                }
              }}
              disabled={isProcessing}
              className="btn-primary"
              size="lg"
            >
              <Star size={16} />
              {!isMobile && "Set to default"}
            </Button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default CanvasImageEditor;
