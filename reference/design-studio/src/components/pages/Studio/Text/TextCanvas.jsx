import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import * as fabric from "fabric";
import { useDispatch, useSelector } from "react-redux";
import { setActualSignWidth, setLinesTextSignage, setSelectedCanvasTextElement } from "../../../../store/Slices/TextCanvasSlice";
import Toggle from "@/components/ui/Toggle";

const TextCanvas = forwardRef(({ containerWidth,
  containerHeight,
  removeIndex,
  setRemoveIndex,
  viewMockupOverCanvas,
  setViewMockupOverCanvas,
  canvasActualZoom,
  setCanvasActualZoom
}, ref) => {
  const canvasRef = useRef(null);
  const [canvas, setCanvas] = useState(null);
  const { linesTextSignage, selectedCanvasTextElement, actualSignWidth } = useSelector(
    (state) => state.TextCanvas
  );

  const storedPositions = useRef({});

  console.log('canvasActualZoom', canvasActualZoom)

  const { options, single_filtered_option, uploaded_scene_baseUrl, created_background_mockup_URL } = useSelector(
    (state) => state.SignForm
  );

  const mounting = options?.mounting_type || '';

  const [canvasWidthDim, setCanvasWidthDim] = useState(0)
  const [canvasFullWidth, setCanvasFullWidth] = useState(0)

  const dispatch = useDispatch();
  const timeoutRef = useRef(null);

  useEffect(() => {
    const handleBeforeUnload = () => {
      dispatch(setLinesTextSignage([]));
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);


  // This effect listens for a removeIndex trigger coming from outside (e.g., TextCanvasForm).
  // Since the canvas instance exists only in this component, we handle all side effects here:
  // 1. Remove the corresponding line from the Redux state
  // 2. Update the selected text index safely
  // 3. Find and remove the related object from the canvas
  // 4. Re-render the canvas to reflect changes
  // After execution, the trigger (removeIndex) is reset to avoid repeated runs.
  useEffect(() => {
    if (removeIndex === null) return;
    const updatedLines = linesTextSignage.filter(
      (_, i) => i !== removeIndex
    );
    dispatch(setLinesTextSignage(updatedLines));
    const newIndex =
      removeIndex > 0
        ? removeIndex - 1
        : updatedLines.length > 0
          ? 0
          : null;
    dispatch(setSelectedCanvasTextElement(newIndex));
    canvas?.getObjects().forEach((obj) => {
      if (String(obj.mainIndexValueFromArr) === String(removeIndex)) {
        removeTextObjectElements(obj);
      }
    });
    canvas?.renderAll();
    setRemoveIndex(null); // reset
  }, [removeIndex]);


  useEffect(() => {
    const fabricCanvas = new fabric.Canvas(canvasRef.current, {
      width: containerWidth,
      height: containerHeight,
      selection: false,
      // preserveObjectStacking : false,
    });
    setCanvas(fabricCanvas);
    // fabricCanvas.setBackgroundColor('lightblue', canvas.renderAll.bind(canvas));
    // Accessing the lower canvas element directly
    // const lowerCanvasEl = fabricCanvas.lowerCanvasEl;
    // lowerCanvasEl.focus();
    // // Set the background of the lower canvas if needed
    // lowerCanvasEl.style.backgroundColor = "green";
    // lowerCanvasEl.style.width = windowWidth;
    return () => fabricCanvas.dispose();
  }, []);

  const createArrow = (x1, y1, x2, y2) => {
    const angle = 300; // Calculate the angle of the line

    // Arrowhead size
    const headLength = 10;

    // Coordinates of the arrowhead
    const arrowPoints = [
      { x: 500, y: 700 },
      {
        x: 1800 - headLength * Math.cos(angle - Math.PI / 6),
        y: 1200 - headLength * Math.sin(angle - Math.PI / 6),
      },
      {
        x: -1800 - headLength * Math.cos(angle + Math.PI / 6),
        y: -1200 - headLength * Math.sin(angle + Math.PI / 6),
      },
    ];

    const arrow = new fabric.Polyline(arrowPoints, {
      fill: "black",
      stroke: "black",
      strokeWidth: 2,
      selectable: false,
      evented: false,
    });

    const line = new fabric.Line([x1, y1, x2, y2], {
      stroke: "black",
      selectable: false,
      evented: false,
    });

    return { line, arrow };
  };

  const updateArrowPosition = (arrow, x1, y1, x2, y2) => {
    const angle = Math.atan2(y2 - y1, x2 - x1); // Recalculate the angle for movement

    // console.log("======================================================");
    // console.log("arrow", arrow);
    // console.log("x-coordinate of the starting point of the arrow", x1);
    // console.log("y-coordinate of the starting point of the arrow", y1);
    // console.log("x-coordinate of the ending point of the arrow", x2);
    // console.log("y-coordinate of the ending point of the arrow", y2);
    // console.log("======================================================");

    // Update arrowhead points
    const headLength = 10;
    const arrowPoints = [
      { x: x2, y: y2 },
      {
        x: x2 - headLength * Math.cos(angle - Math.PI / 6),
        y: y2 - headLength * Math.sin(angle - Math.PI / 6),
      },
      {
        x: x2 - headLength * Math.cos(angle + Math.PI / 6),
        y: y2 - headLength * Math.sin(angle + Math.PI / 6),
      },
    ];

    console.log("arrowPoints", arrowPoints);

    arrow.set({
      points: arrowPoints,
    });

    canvas.renderAll();
  };

  // eslint-disable-next-line no-unused-vars
  function createRacewayLine(signText, canvas) {
    const textBoundaries = signText.getBoundingRect();
    console.log("sign text textBoundaries", textBoundaries);

    let x = signText.left;
    let y = textBoundaries.top + textBoundaries.height / 2; // Center of the text
    let width = textBoundaries.width;
    let height = 35;
    let color = "rgba(128,128,128,0.3)";

    // Calculate line endpoints
    const x1 = x - width / 2;
    const x2 = x + width / 2;
    const y1 = y;
    const y2 = y;

    // Create a line object
    const line = new fabric.Line([x1, y1, x2, y2], {
      stroke: color, // Line color
      strokeWidth: height, // Line thickness
      selectable: false, // Make the line draggable
      visible: false,
      originX: "center",
      originY: "center",
    });

    return line;
  }

  // eslint-disable-next-line no-unused-vars
  function createBackBoard(signText, canvas) {
    const textBoundaries = signText.getBoundingRect();
    console.log("sign text textBoundaries", textBoundaries);

    let x = signText.left;
    let y = textBoundaries.top + textBoundaries.height / 2; // Center of the text
    let width = textBoundaries.width;
    let height = signText.height - 20;
    let color = "gray";

    // Calculate line endpoints
    const x1 = x - width / 2 - 10;
    const x2 = x + width / 2 + 10;
    const y1 = y;
    const y2 = y;

    // Create a line object
    const line = new fabric.Line([x1, y1, x2, y2], {
      stroke: color, // Line color
      strokeWidth: height, // Line thickness
      selectable: false, // Make the line draggable
      visible: false,
      originX: "center",
      originY: "center",
    });
    return line;
  }

  const calculateWidthInches = (widthPX, heightPX, heightIn) => {
    const widthInInches = (widthPX / heightPX) * heightIn;
    return widthInInches.toFixed(2);
  };

  const findAMountingType = (key) => {
    // Intentionally short-circuited: mounting-type lookup is disabled for now.
    // The logic below is kept for re-enabling — leave the early return in place.
    return null;

    /* eslint-disable no-unreachable */
    let availableMountings = single_filtered_option?.mounting_type?.length > 0 ? single_filtered_option?.mounting_type : [];
    let availableMounting = availableMountings.find(item => item.var_name == key);
    if (availableMounting) {
      return availableMounting?.name
    } else {
      null;
    }
    /* eslint-enable no-unreachable */
  }

  useEffect(() => {
    if (canvasActualZoom && canvasWidthDim) {
      setCanvasFullWidth(canvasWidthDim / canvasActualZoom)
    }
  }, [canvasActualZoom, canvasWidthDim])

  // console.log("mountingmountingmounting", mounting);
  const changePositionWidthHeight = (textObject) => {
    const textBoundaries = textObject.getBoundingRect();

    console.log("textBoundaries", textObject);

    let scaledWidth;
    let scaledHeight;

    scaledWidth = textObject.width * textObject.scaleX;
    scaledHeight = textObject.height * textObject.scaleY;

    const textHeight = scaledHeight || textObject.height;
    const textWidth = scaledWidth || textObject.width;
    // const textFont = textObject.fontSize;

    console.log("widthhhhhhhhhh", textObject.width?.toFixed(2));

    console.log("textObjecttextObject", textObject);

    const signageSignHeight = textObject?.signHeight;

    const calcultedWidth = calculateWidthInches(
      getCharacterWidths(textObject) || textObject.width?.toFixed(2),
      textObject.height - ((50 / 120) * textObject?.fontSize),
      +signageSignHeight
    );

    if (textObject?.text?.trim() !== "" && true) {
      if (!textObject.widthLabel) {
        // Create width label
        textObject.widthLabel = new fabric.Text(`${Math.ceil(calcultedWidth)?.toFixed(2)} in`, {
          left: textBoundaries.left + textWidth / 2 - 23,
          top: textBoundaries.top - 10,
          fontSize: 14,
          backgroundColor: "transparent",
          fill: "black",
          selectable: false,
          // backgroundColor: "white",
        });
        // Create left and right arrows
        const leftArrowObjects = createArrow(
          textBoundaries.left + textWidth / 2 - 40,
          textBoundaries.top - 0,
          textBoundaries.left - 0,
          textBoundaries.top - 0
        );

        const rightArrowObjects = createArrow(
          textBoundaries.left + textWidth / 2 + 30,
          textBoundaries.top - 0,
          textBoundaries.left + textWidth - 5,
          textBoundaries.top - 0
        );

        textObject.leftArrow = leftArrowObjects.line;
        textObject.leftArrowHead = leftArrowObjects.arrow;

        textObject.rightArrow = rightArrowObjects.line;
        textObject.rightArrowHead = rightArrowObjects.arrow;

        // Create height label
        textObject.heightLabel = new fabric.Text(`${signageSignHeight} in`, {
          left: textBoundaries.left - 30,
          top: textBoundaries.top + textHeight / 2 + 18,
          fontSize: 14,
          fill: "black",
          selectable: false,
          angle: -90,
        });

        // Create top and bottom arrows
        const topArrowObjects = createArrow(
          textBoundaries.left - 20,
          textBoundaries.top +
          (textHeight / 2 - textObject.heightLabel.width / 2 - 5),
          textBoundaries.left - 20,
          textBoundaries.top + 20
        );

        const bottomArrowObjects = createArrow(
          textBoundaries.left - 20,
          textBoundaries.top +
          (textHeight / 2 + textObject.heightLabel.width / 2),
          textBoundaries.left - 20,
          textBoundaries.top + textHeight - 24
        );

        textObject.topArrow = topArrowObjects.line;
        textObject.topArrowHead = topArrowObjects.arrow;

        textObject.bottomArrow = bottomArrowObjects.line;
        textObject.bottomArrowHead = bottomArrowObjects.arrow;

        textObject.backboard = createBackBoard(textObject);
        textObject.raceWayLine = createRacewayLine(textObject);

        // Add everything to canvas
        canvas.add(
          textObject.widthLabel,
          // textObject.removeLabel,
          textObject.leftArrow,
          textObject.leftArrowHead,
          textObject.rightArrow,
          textObject.rightArrowHead,
          textObject.heightLabel,
          textObject.topArrow,
          textObject.topArrowHead,
          textObject.bottomArrow,
          textObject.bottomArrowHead,
          textObject.backboard,
          textObject.raceWayLine
        );
      } else {
        // Update positions if they already exist
        textObject.widthLabel.set({
          left: textBoundaries.left + textWidth / 2 - 23,
          top: textBoundaries.top - 10,
          text: `${Math.ceil(calcultedWidth)?.toFixed(2)} in`,
        });
        textObject.leftArrow.set({
          x1: textBoundaries.left + textWidth / 2 - 30,
          y1: textBoundaries.top - 0,
          x2: textBoundaries.left - 0,
          y2: textBoundaries.top - 0,
        });
        textObject.rightArrow.set({
          x1: textBoundaries.left + textWidth / 2 + 40,
          y1: textBoundaries.top - 0,
          x2: textBoundaries.left + textWidth - 5,
          y2: textBoundaries.top - 0,
        });
        textObject.heightLabel.set({
          left: textBoundaries.left - 30,
          top: textBoundaries.top + textHeight / 2 + 12,
          text: `${signageSignHeight} in`,
        });

        // Update arrowhead positions
        updateArrowPosition(
          textObject.leftArrowHead,
          textBoundaries.left + textWidth / 2 - 40,
          textBoundaries.top - 0,
          textBoundaries.left - 0,
          textBoundaries.top - 0
        );
        updateArrowPosition(
          textObject.rightArrowHead,
          textBoundaries.left + textWidth / 2 + 30,
          textBoundaries.top - 0,
          textBoundaries.left + textWidth - 5,
          textBoundaries.top - 0
        );

        textObject.topArrow.set({
          x1: textBoundaries.left - 20,
          y1:
            textBoundaries.top +
            (textHeight / 2 - textObject.heightLabel.width / 2 - 5),
          x2: textBoundaries.left - 20,
          y2: textBoundaries.top + 20,
        });
        textObject.bottomArrow.set({
          x1: textBoundaries.left - 20,
          y1:
            textBoundaries.top +
            (textHeight / 2 + textObject.heightLabel.width / 2 - 2),
          x2: textBoundaries.left - 20,
          y2: textBoundaries.top + textHeight - 24,
        });

        updateArrowPosition(
          textObject.topArrowHead,
          textBoundaries.left - 20,
          textBoundaries.top +
          (textHeight / 2 - textObject.heightLabel.width / 2 - 5),
          textBoundaries.left - 20,
          textBoundaries.top + 20
        );
        updateArrowPosition(
          textObject.bottomArrowHead,
          textBoundaries.left - 20,
          textBoundaries.top +
          (textHeight / 2 + textObject.heightLabel.width / 2),
          textBoundaries.left - 20,
          textBoundaries.top + textHeight - 24
        );

        if (textObject?.backboard) {
          // canvas.remove(textObject.backboard);
          // textObject.backboard = createRacewayLine(textObject);
          // canvas.add(textObject.backboard);
          textObject.backboard.set({
            x1: textBoundaries.left - 10,
            y1: textBoundaries.top + textHeight / 2,
            x2: textBoundaries.left + textWidth + 10,
            y2: textBoundaries.top + textHeight / 2,
          });
        }

        if (textObject?.raceWayLine) {
          // canvas.remove(textObject.raceWayLine);
          // textObject.raceWayLine = createRacewayLine(textObject);
          // canvas.add(textObject.raceWayLine);
          textObject.raceWayLine.set({
            x1: textBoundaries.left + 0,
            y1: textBoundaries.top + textHeight / 2,
            x2: textBoundaries.left + textWidth,
            y2: textBoundaries.top + textHeight / 2,
          });
        }
      }

      if (mounting === findAMountingType('mounting_type_flush_stud_mounted')) {
        if (textObject.raceWayLine) {
          textObject.raceWayLine.set({
            visible: false,
          });
        }
        if (textObject.backboard) {
          textObject.backboard.set({
            visible: false,
          });
        }
      }

      if (mounting === findAMountingType('mounting_type_standard_raceway_6x2')) {
        if (textObject.backboard) {
          textObject.backboard.set({
            visible: false,
          });
        }
        textObject.raceWayLine.set({
          visible: true,
        });
      }

      if (mounting === findAMountingType('mounting_type_flat_backer_2_5_mm') || mounting === findAMountingType('mounting_type_backerboard_cabinet_2_inch')) {
        if (textObject.raceWayLine) {
          textObject.raceWayLine.set({
            visible: false,
          });
        }

        textObject.backboard.set({
          visible: true,
        });
      }
    }
    canvas.renderAll();
  };

  const removeTextObjectElements = (textObject) => {
    canvas.remove(
      textObject.widthLabel,
      textObject.leftArrow,
      textObject.leftArrowHead,
      textObject.rightArrow,
      textObject.rightArrowHead,
      textObject.heightLabel,
      textObject.topArrow,
      textObject.topArrowHead,
      textObject.bottomArrow,
      textObject.bottomArrowHead,
      textObject.backboard,
      textObject.raceWayLine,
      // textObject.removeLabel, // Ensure removeLabel is also removed
      textObject
    );

    // Clean up references
    textObject.widthLabel = null;
    textObject.leftArrow = null;
    textObject.leftArrowHead = null;
    textObject.rightArrow = null;
    textObject.rightArrowHead = null;
    textObject.heightLabel = null;
    textObject.topArrow = null;
    textObject.topArrowHead = null;
    textObject.bottomArrow = null;
    textObject.bottomArrowHead = null;
    textObject.backboard = null;
    textObject.raceWayLine = null;
    // textObject.removeLabel = null; // Clean up removeLabel reference
  };

  const adjustFontSizeToFit = (textObject) => {
    const canvasWidth = canvas.getWidth();
    const textWidth = textObject.width * textObject.scaleX;

    if (textWidth > canvasWidth - 100) {
      const zoom = (canvasWidth - 100) / textWidth;
      storeITextPositions(canvas); // *** NEW *** store before zoom
      fabric.util.animate({
        startValue: canvas.getZoom(),
        endValue: zoom,
        duration: 20,
        onChange: (value) => {
          let canvasZoom = canvas.getZoom();
          if (value < canvasZoom) {
            setCanvasActualZoom(value);
            canvas.setZoom(value);
            canvas.requestRenderAll();
          }
        },
        onComplete: () => {               // *** NEW *** restore after animation
          restoreITextPositions(canvas);
        },
      });
    } else {
      // if (isWrittenObj) {
      //   storeITextPositions(canvas);      // *** NEW ***
      //   setCanvasActualZoom(1);
      //   canvas.setZoom(1);
      //   restoreITextPositions(canvas);    // *** NEW ***
      // }

      // Get all iText objects
      const allITexts = canvas.getObjects().filter(obj => obj.type === 'i-text');

      // Check if ANY text still exceeds canvas width
      const anyOverflowing = allITexts.some(obj => {
        const objWidth = obj.width * obj.scaleX;
        return objWidth > canvasWidth - 100;
      });

      // If NONE are overflowing, reset zoom
      if (!anyOverflowing) {
        storeITextPositions(canvas);
        setCanvasActualZoom(1);
        canvas.setZoom(1);
        restoreITextPositions(canvas);
      }
    }

    canvas.requestRenderAll();
    changePositionWidthHeight(textObject);
    restrictMovementToCanvas(textObject);
  };

  const restrictMovementToCanvas = (textObject) => {
    const zoom = canvas.getZoom();

    const canvasWidth = canvas.getWidth() / zoom;
    const canvasHeight = canvas.getHeight() / zoom;
    const objectWidth = textObject.width * textObject.scaleX;
    const objectHeight = textObject.height * textObject.scaleY;

    console.log("canvas width", canvasWidth);
    console.log("canvas Height", canvasHeight);
    console.log("Text Width ", textObject.width);
    console.log("Text Height", textObject.height);
    console.log("Text Font Size", textObject.fontSize);

    if (textObject.left - objectWidth / 2 < 40) {
      textObject.left = objectWidth / 2 + 40;
    } else if (
      textObject.left - objectWidth / 2 + objectWidth >=
      canvasWidth - 40
    ) {
      textObject.left = canvasWidth + objectWidth / 2 - objectWidth - 40;
    }

    if (textObject.top - objectHeight / 2 < 80) {
      textObject.top = objectHeight / 2 + 80;
    } else if (
      textObject.top - objectHeight / 2 + objectHeight >=
      canvasHeight - 15
    ) {
      textObject.top = canvasHeight + objectHeight / 2 - objectHeight - 15;
    }

    textObject.setCoords();
  };

  const debounceMap = new Map();

  function debounce(func, delay) {
    return function (id, ...args) {
      // Clear the previous timeout for this specific id
      if (debounceMap.has(id)) {
        clearTimeout(debounceMap.get(id));
      }

      // Set a new timeout
      const timeoutId = setTimeout(() => {
        func.apply(this, args);
        debounceMap.delete(id); // Clean up the map entry
      }, delay);

      debounceMap.set(id, timeoutId);
    };
  }
  const debouncedChangePositionWidthHeight = debounce((object) => {
    changePositionWidthHeight(object);
  }, 300);

  function getScaledFontSize(signHeight) {

    // const dataHeight = Math.max(
    //   ...linesTextSignage.map(item => item.signHeight)
    // );

    // console.log(dataHeight); // 



    // const minHeight = 12;
    // const maxHeight = 45;

    // const maxFont = 10; // when height = 12
    // const minFont = 4;  // when height = 45

    // // Clamp input (optional but safe)
    // const height = Math.max(minHeight, Math.min(maxHeight, dataHeight));

    // // Inverse linear mapping
    // const ratio = (height - minHeight) / (maxHeight - minHeight);
    // const fontSize = maxFont - ratio * (maxFont - minFont);

    // console.log('fontSizefontSize', fontSize)


    let baseSize = 4;

    if (!signHeight) return 12 * baseSize

    return signHeight * baseSize
  }


  const mapHeightOfCharacters = (signHeight, linesDataa) => {
    // Given values
    const values = [...linesDataa];
    const target = signHeight; // Desired adjusted value for the highest value

    // Find the highest value
    const maxValue = Math.max(...values.map((obj) => obj.height));
    console.log("Highest Value:", maxValue);

    // Calculate the exact percentage adjustment to make maxValue equal to the target
    const percentageAdjustment = ((maxValue - target) / maxValue) * 100;

    // Adjust all values using the calculated percentage
    const adjustedValues = values.map((obj) => ({
      ...obj, // Keep other properties intact
      height: +(obj.height - (obj.height * percentageAdjustment) / 100).toFixed(
        2
      ),
    }));

    return adjustedValues;
    // console.log(
    //   "Percentage Adjustment:",
    //   percentageAdjustment.toFixed(2) + "%"
    // );
    // console.log("Adjusted Values:", adjustedValues);
  };

  // console.log("linesDataInches", linesDataInches);
  const getCharacterWidths = (iTextObject) => {
    const ctx = canvas?.getContext("2d"); // Canvas rendering context
    ctx.font = `${iTextObject.fontSize}px ${iTextObject.fontFamily}`;
    const widths = [];

    console.log(
      "iTextObject.mainIndexValueFromArr",
      iTextObject.mainIndexValueFromArr
    );

    let initialWidth = 0;
    for (let i = 0; i < iTextObject.text.length; i++) {
      const char = iTextObject.text[i];
      const metrics = ctx.measureText(char);
      const charWidth = metrics.width;
      const charHeight =
        Math.abs(metrics.actualBoundingBoxAscent) +
        Math.abs(metrics.actualBoundingBoxDescent);

      // if (char?.trim() !== "") {
      //   initialWidth = initialWidth + charWidth;
      // }
      widths.push({
        char,
        width: charWidth,
        height: charHeight,
      });
    }

    let dataInInches = widths.map((item) => {
      let widthInches = calculateWidthInches(
        item.width,
        iTextObject.height - 50,
        +iTextObject?.signHeight
      );
      let heightInches = calculateWidthInches(
        item.height,
        iTextObject.height - 50,
        +iTextObject?.signHeight
      );

      return {
        char: item.char,
        width: +widthInches,
        height: +heightInches,
      };
    });

    dataInInches = dataInInches.filter((item) => item.char.trim() !== "");
    console.log(
      "dataInInches",
      iTextObject.mainIndexValueFromArr,
      dataInInches
    );
    dataInInches = mapHeightOfCharacters(
      +iTextObject?.signHeight,
      dataInInches
    );
    console.log(
      "dataInInches",
      iTextObject.mainIndexValueFromArr,
      dataInInches
    );

    // console.log("fdfjkdfjkdjfkdfjkd", {
    //   ...linesDataInches,
    //   [String(iTextObject.mainIndexValueFromArr)]: dataInInches,
    // });

    // setLinesDataInches((dataVal) => ({
    //   ...dataVal,
    //   [String(iTextObject.mainIndexValueFromArr)]: dataInInches,
    // }));

    // linesDataInches[iTextObject.mainIndexValueFromArr] = dataInInches;

    console.log(
      "Line Width: Line " +
      (Number(iTextObject.mainIndexValueFromArr) + 1) +
      ": ",
      dataInInches,
      "totalWidth",
      dataInInches.reduce((a, b) => a + b.width, 0)?.toFixed(2)
    );
    return initialWidth;
  };

  const calculateAndSetDimensions = (textObject) => {
    if (!canvas || !textObject) return;

    const canvasWidth = canvas.getWidth();

    const calculatedCanvasWidth = calculateWidthInches(
      +canvasWidth,
      textObject.height - ((50 / 120) * textObject?.fontSize),
      +textObject?.signHeight
    );

    setCanvasWidthDim(calculatedCanvasWidth);

    const croppedCanvasDim = exportOnlyTextClean(canvas, 'dimensions');
    if (croppedCanvasDim) {
      const calculatedCroppedCanvasWidth = calculateWidthInches(
        +croppedCanvasDim?.cropWidth,
        textObject.height - ((50 / 120) * textObject?.fontSize),
        +textObject?.signHeight
      );
      console.log('calculatedCroppedCanvasWidth',calculatedCroppedCanvasWidth)
      if (calculatedCroppedCanvasWidth) dispatch(setActualSignWidth(Math.round(calculatedCroppedCanvasWidth)?.toFixed(2)));
    }
  };

  const useDebouncedCallback = (callback, delay) => {
    const timeoutRef = useRef(null);

    const debouncedFunction = useCallback((...args) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        callback(...args);
      }, delay);
    }, [callback, delay]);

    return debouncedFunction;
  };

  function storeITextPositions(canvas) {
    const zoom = canvas.getZoom();
    const vpt = canvas.viewportTransform;
    const canvasWidth = canvas.getWidth();
    const canvasHeight = canvas.getHeight();
    const canvasCenterX = canvasWidth / 2;
    const canvasCenterY = canvasHeight / 2;

    canvas.getObjects("i-text").forEach((obj) => {
      // Assign a stable id if missing
      if (!obj._posId) obj._posId = `itext_${Date.now()}_${Math.random()}`;

      const objCenter = obj.getCenterPoint();
      const renderedX = objCenter.x * zoom + vpt[4];
      const renderedY = objCenter.y * zoom + vpt[5];

      console.log('dfsdfsdfsdfsdfsd', {
        xPercent: ((renderedX - canvasCenterX) / canvasWidth) * 100,
        yPercent: ((renderedY - canvasCenterY) / canvasHeight) * 100,
      })

      storedPositions.current[obj._posId] = {
        xPercent: ((renderedX - canvasCenterX) / canvasWidth) * 100,
        yPercent: ((renderedY - canvasCenterY) / canvasHeight) * 100,
      };
    });
  }

  // *** NEW ***
  function restoreITextPositions(canvas) {
    const zoom = canvas.getZoom();
    const vpt = canvas.viewportTransform;
    const canvasWidth = canvas.getWidth();
    const canvasHeight = canvas.getHeight();
    const canvasCenterX = canvasWidth / 2;
    const canvasCenterY = canvasHeight / 2;

    canvas.getObjects("i-text").forEach((obj) => {
      if (!obj._posId || !storedPositions.current[obj._posId]) return;

      const { xPercent, yPercent } = storedPositions.current[obj._posId];

      // Convert % → rendered pixel → fabric coordinate space
      const renderedX = (xPercent / 100) * canvasWidth + canvasCenterX;
      const renderedY = (yPercent / 100) * canvasHeight + canvasCenterY;

      const fabricX = (renderedX - vpt[4]) / zoom;
      const fabricY = (renderedY - vpt[5]) / zoom;

      // obj uses originX/Y: "center" so set left/top directly to center point
      obj.set({ left: fabricX, top: fabricY });
      obj.setCoords();
      changePositionWidthHeight(obj)
      restrictMovementToCanvas(obj)
    });

    canvas.requestRenderAll();
  }

  const debouncedCalculateAndSetDimensions = useDebouncedCallback(
    calculateAndSetDimensions,
    200 // Adjust delay as needed
  );



  const debouncedStoreITextPositions = useDebouncedCallback(
    storeITextPositions,
    200
  );

  // console.log("linesDataInches", linesDataInches);
  // 
  useEffect(() => {
    if (canvas && linesTextSignage.length > 0) {

      linesTextSignage.forEach((item, index) => {
        const existingObject = canvas
          .getObjects()
          .find((obj) => obj.mainIndexValueFromArr === index);

        if (existingObject) {
          // Update the properties of the existing object
          existingObject.set({
            text: item.signText,
            fontFamily: item?.signFont?.trim(),
            fontSize: getScaledFontSize(+item?.signHeight),
            fill: item?.faceColor || "black",
            // stroke: item.outlineColor || "white",
            shadow: new fabric.Shadow({
              color: item?.returnColor || "",
              // blur: depth,
              offsetX: 5,
              offsetY: 3,
            }),
          });

          existingObject.signHeight = +item?.signHeight;

          existingObject.on("changed", function () {
            console.log('first change')
            clearTimeout(timeoutRef.current);
            timeoutRef.current = setTimeout(() => {
              const newLinesTextSignage = [...linesTextSignage].map(
                (eachLine, index) => {
                  if (index == existingObject.mainIndexValueFromArr) {
                    return { ...eachLine, signText: existingObject.text };
                  }
                  return eachLine;
                }
              );
              dispatch(setLinesTextSignage(newLinesTextSignage));
            }, 300);

            debouncedChangePositionWidthHeight(
              existingObject.mainIndexValueFromArr,
              existingObject
            );

            debouncedCalculateAndSetDimensions(existingObject);
            debouncedStoreITextPositions(canvas)


            // adjustFontSizeToFit(existingObject);
            // restrictMovementToCanvas(existingObject);
          });

          existingObject.on("moving", function () {
            // restrictMovementToCanvas(existingObject);
            debouncedChangePositionWidthHeight(
              existingObject.mainIndexValueFromArr,
              existingObject
            );

            debouncedCalculateAndSetDimensions(existingObject);
          });

          adjustFontSizeToFit(existingObject);
          // changePositionWidthHeight(existingObject);
          // getCharacterWidths(existingObject)
          // debouncedChangePositionWidthHeight(
          //   existingObject.mainIndexValueFromArr,
          //   existingObject
          // );
          existingObject.setCoords(); // Update coordinates in case position changed
          calculateAndSetDimensions(existingObject);
        } else if (!existingObject && item?.signText?.trim() !== "") {
          // If the object doesn't exist yet, create a new one

          console.log('creating new itext')

          const signText = new fabric.IText(item.signText, {
            left: canvas.width / 2,
            top: (index * 150) + 150,
            fontFamily: item.signFont.trim(),
            fill: item?.faceColor || "black",
            fontSize: getScaledFontSize(+item?.signHeight),
            padding: 0, // Removes padding around the text object
            lineHeight: 1,
            // textAlign: "center",
            originX: "center",
            originY: "center",
            lockScalingX: true,
            lockScalingY: true,
            lockRotation: false,
            lockMovementX: false,
            lockMovementY: false,
            hasControls: true,
            width: 800,
            // stroke: item?.outlineColor || "white",
            // strokeWidth: 1,
            hasBorders: false,
            shadow: new fabric.Shadow({
              color: item?.returnColor || "",
              // blur: depth,
              offsetX: 5,
              offsetY: 3,
            }),
          });

          signText.setControlsVisibility({
            mtr: true,
            mt: false, // Hide middle top control
            mb: false, // Hide middle bottom control
            ml: false, // Hide middle left control
            mr: false, // Hide middle right control
            bl: false, // Hide bottom left control
            br: false, // Hide bottom right control
            tl: false, // Hide top left control
            tr: false, // Hide top right control
          });

          signText.mainIndexValueFromArr = index;
          signText.signHeight = +item?.signHeight;

          signText.on("changed", function () {
            clearTimeout(timeoutRef.current);

            timeoutRef.current = setTimeout(() => {
              const newLinesTextSignage = [...linesTextSignage].map(
                (eachLine, index) => {
                  if (index == signText.mainIndexValueFromArr) {
                    return { ...eachLine, signText: signText.text };
                  }
                  return eachLine;
                }
              );
              dispatch(setLinesTextSignage(newLinesTextSignage));
              debouncedCalculateAndSetDimensions(signText);

              // adjustFontSizeToFit(signText);
              // restrictMovementToCanvas(signText);
            }, 300);
          });

          signText.on("moving", function () {
            // debouncedChangePositionWidthHeight(
            //   signText.mainIndexValueFromArr,
            //   signText
            // );

            debouncedCalculateAndSetDimensions(signText);
            changePositionWidthHeight(signText);

            restrictMovementToCanvas(signText);

            debouncedStoreITextPositions(canvas)
          });

          restrictMovementToCanvas(signText);
          changePositionWidthHeight(signText);
          adjustFontSizeToFit(signText);
          dispatch(setSelectedCanvasTextElement(signText.mainIndexValueFromArr))

          debouncedStoreITextPositions(canvas)

          canvas.add(signText);
          storeITextPositions(canvas);
          calculateAndSetDimensions(signText);
        }
      });

      canvas.getObjects().forEach((obj) => {
        if (obj.mainIndexValueFromArr == selectedCanvasTextElement) {
          obj.set("active", true);
          canvas.setActiveObject(obj);
        }
      });

      canvas.renderAll(); // Re-render the canvas after making changes
    }

    canvas?.on("mouse:move", function (event) {
      const target = canvas.findTarget(event.e);
      if (target && target.text === "Remove") {
        canvas.hoverCursor = "pointer"; // Set cursor to pointer
      } else {
        canvas.hoverCursor = "default"; // Reset to default cursor
      }
    });
  }, [canvas, linesTextSignage, mounting]);

  canvas?.on("text:editing:entered", (opt) => {
    // console.log("text is being editing", opt);

    const activeObject = opt.target;

    if (activeObject && activeObject.type === "i-text") {
      const disableEnterKey = (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          return false; // Prevents the default behavior of the Enter key
        }
      };

      // Add keydown event listener to the document when editing starts
      document.addEventListener("keydown", disableEnterKey);

      // Remove the keydown listener when editing stops
      canvas.on("text:editing:exited", () => {
        document.removeEventListener("keydown", disableEnterKey);
      });
    }
  });


  canvas?.on("mouse:down", function (e) {

    // console.log("mouse:down called", e);
    const target = canvas.findTarget(e);
    if (target && target.type === "i-text") {
      console.log('yes clicked')
      // console.log("index", index);
      dispatch(setSelectedCanvasTextElement(String(e.target.mainIndexValueFromArr)))
    }
  });

  function exportOnlyTextClean(canvas, approach) {
    const textObjects = canvas?.getObjects().filter(obj => obj.type === 'i-text');
    if (!textObjects?.length) return;

    const hiddenObjects = [];
    const originalStyles = [];

    // 👉 Store styles + hide helpers (NO style override yet)
    textObjects.forEach(textObject => {
      originalStyles.push({
        obj: textObject,
        fill: textObject.fill,
        shadow: textObject.shadow
      });

      [
        'widthLabel',
        'heightLabel',
        'leftArrow',
        'leftArrowHead',
        'rightArrow',
        'rightArrowHead',
        'topArrow',
        'topArrowHead',
        'bottomArrow',
        'bottomArrowHead',
      ].forEach(key => {
        if (textObject[key]) {
          hiddenObjects.push(textObject[key]);
          textObject[key].set({ visible: false });
        }
      });
    });

    canvas.backgroundColor = '#ffffff';
    canvas.renderAll();

    // ✅ Calculate bounds
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    textObjects.forEach(obj => {
      const bound = obj.getBoundingRect(true, true);
      minX = Math.min(minX, bound.left);
      minY = Math.min(minY, bound.top);
      maxX = Math.max(maxX, bound.left + bound.width);
      maxY = Math.max(maxY, bound.top + bound.height);
    });

    const padding = 0;
    const cropWidth = maxX - minX;
    const cropHeight = maxY - minY;

    const exportOptions = {
      format: "jpeg",
      quality: 0.9,
      multiplier: 2,
      left: (minX - padding) * canvasActualZoom,
      top: (minY - padding) * canvasActualZoom,
      width: (cropWidth + padding * 2) * canvasActualZoom,
      height: (cropHeight + padding * 2) * canvasActualZoom,
    };

    // =========================
    // 🖼️ ORIGINAL IMAGE (with styles)
    // =========================
    const originalDataURL = canvas.toDataURL(exportOptions);

    // =========================
    // 🎯 CLEAN IMAGE (black, no shadow)
    // =========================
    textObjects.forEach(obj => {
      obj.set({
        fill: 'black',
        shadow: null
      });
    });

    canvas.renderAll();

    const cleanDataURL = canvas.toDataURL(exportOptions);

    // =========================
    // 🔁 RESTORE EVERYTHING
    // =========================
    hiddenObjects.forEach(obj => obj.set({ visible: true }));

    originalStyles.forEach(({ obj, fill, shadow }) => {
      obj.set({ fill, shadow });
    });

    canvas.backgroundColor = 'transparent';
    canvas.renderAll();

    // =========================
    // 🎁 RETURN BASED ON APPROACH
    // =========================
    if (approach === 'dimensions') {
      return {
        cropWidth,
        cropHeight,
        originalDataURL,
        cleanDataURL
      };
    }

    if (approach === 'showImage') {
      const newTab = window.open();
      if (newTab) {
        newTab.document.write(`
        <style>
          body {
            margin:0;
            display:flex;
            gap:20px;
            justify-content:center;
            align-items:center;
            height:100vh;
            background:#222;
          }
          img {
            max-width:45%;
            max-height:90%;
            background:white;
          }
        </style>
        <img src="${originalDataURL}" />
        <img src="${cleanDataURL}" />
      `);
      }
    }

    // 👉 default return (useful)
    return {
      originalDataURL,
      cleanDataURL,
      cropWidth,
      cropHeight
    };
  }

  const getCanvasDataForCalculation = () => {
    let data = exportOnlyTextClean(canvas, 'dimensions')
    return {
      image: data?.cleanDataURL || null,
      coloredImage: data?.originalDataURL || null,
      actualSignWidth,
      linesTextSignage
    }
  }

  useImperativeHandle(ref, () => ({
    getCanvasDataForCalculation
  }));

  const getCanvasBgStyle = () => {
    if (uploaded_scene_baseUrl) {
      return {
        backgroundImage: `url(${uploaded_scene_baseUrl})`,
        backgroundSize: 'contain',
        backgroundRepeat: "no-repeat",
        backgroundPosition: 'center',
        // backgroundColor: "transparent"
      }
    }
  }
  return (
    <div className={`w-full relative  ${uploaded_scene_baseUrl ? "bg-background" : "grayprint-grid"}`}
      style={getCanvasBgStyle()}
      id="main-canvas-container-div "
    >
      <div className="bg-black py-2 px-5 absolute w-full z-10">
        <div className="flex items-center justify-between  ">
          <div>
            <h1 className="text-md"><span className="font-bold">Canvas width:</span> <span className="font-bold text-md">{canvasFullWidth?.toFixed(0)}</span>{"   "}inches</h1>
            <h1 className="text-md"><span className="font-bold">Sign width:</span> <span className="font-bold text-md">{actualSignWidth}</span>{"   "}inches</h1>
          </div>
          {created_background_mockup_URL && <Toggle
            enabled={viewMockupOverCanvas}
            onChange={setViewMockupOverCanvas}
            label="View Mockup"
          />}
          {!import.meta.env.PROD && <button onClick={() => exportOnlyTextClean(canvas, 'showImage')} >Show</button>}
        </div>
      </div>

      <span style={{ fontFamily: "Goudy Extra Bold" }}></span>
      <span style={{ fontFamily: "Helvetica" }}></span>
      <span style={{ fontFamily: "Helvetica Bold" }}></span>
      <span style={{ fontFamily: "Arial Bold" }}></span>
      <span style={{ fontFamily: "Times Bold" }}></span>
      <span style={{ fontFamily: "Futura" }}></span>
      <span style={{ fontFamily: "Architectural" }}></span>
      <span style={{ fontFamily: "Futura Bold" }}></span>
      <span style={{ fontFamily: "Bodoni" }}></span>
      <span style={{ fontFamily: "Verdana" }}></span>
      <span style={{ fontFamily: "Verdana Bold" }}></span>
      <span style={{ fontFamily: "Garamond" }}></span>
      <span style={{ fontFamily: "Franklin Gothic" }}></span>
      <span style={{ fontFamily: "Alexa" }}></span>

      <canvas
        ref={canvasRef}
        className="border border-black upper--canvas-class "
      />
    </div>
  );
});

TextCanvas.displayName = "TextCanvas";

export default TextCanvas;