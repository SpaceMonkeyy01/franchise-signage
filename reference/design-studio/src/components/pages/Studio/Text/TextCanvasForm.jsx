import { useSelector, useDispatch } from "react-redux";
import { Input } from "@/components/ui/input";

import {
  setLinesTextSignage,
  setSelectedCanvasTextElement,
} from "../../../../store/Slices/TextCanvasSlice";
import { Button } from "@/components/ui/button";
import SelectFont from "./SelectFont";
import SelectHeight from "./SelectHeight";
import { X } from "lucide-react";
import SelectColor from "./SelectColor";
import { useRef, useState, useEffect } from "react";


const TextCanvasForm = ({ setRemoveIndex }) => {
  const dispatch = useDispatch();

  const { linesTextSignage, selectedCanvasTextElement } = useSelector(
    (state) => state.TextCanvas
  );
  const debounceTimer = useRef(null);

  // Local state for the text input
  const [localText, setLocalText] = useState(
    linesTextSignage[selectedCanvasTextElement]?.signText || ""
  );

  // Sync local state when switching between lines
  useEffect(() => {
    setLocalText(linesTextSignage[selectedCanvasTextElement]?.signText || "");
  }, [selectedCanvasTextElement]);

  const handleTextChange = (index, value) => {
    // Update local state immediately → no input lag
    setLocalText(value);

    // Debounce the Redux dispatch
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      const updatedLines = [...linesTextSignage];
      updatedLines[index] = {
        ...updatedLines[index],
        signText: value,
      };
      dispatch(setLinesTextSignage(updatedLines));
    }, 200);
  };


  const fontOptions = [
    { value: "Arial", label: "Arial" },
    { value: "Arial Bold", label: "Arial Bold" },
    { value: "Times Bold", label: "Times Bold" },
    { value: "Helvetica Bold", label: "Helvetica Bold" },
    { value: "Helvetica", label: "Helvetica" },
    { value: "Futura", label: "Futura" },
    { value: "Futura Bold", label: "Futura Bold" },
    { value: "Goudy Extra Bold", label: "Goudy Extra Bold" },
    { value: "Times New Roman", label: "Times New Roman" },
    { value: "Verdana", label: "Verdana" },
    { value: "Verdana Bold", label: "Verdana Bold" },
    { value: "Garamond", label: "Garamond" },
    { value: "Franklin Gothic", label: "Franklin Gothic" },
    { value: "Bodoni", label: "Bodoni" },
  ];

  const colorOptions = [
    { value: "Unselect", label: "Unselect" },
    { value: "black", label: "Black" },
    { value: "white", label: "White" },
    { value: "red", label: "Red" },
    { value: "blue", label: "Blue" },
    { value: "green", label: "Green" },
    { value: "yellow", label: "Yellow" },
    { value: "orange", label: "Orange" },
    { value: "purple", label: "Purple" },
    { value: "pink", label: "Pink" },
    { value: "gray", label: "Gray" },
    { value: "brown", label: "Brown" },
    { value: "cyan", label: "Cyan" },
    { value: "magenta", label: "Magenta" },
    { value: "lime", label: "Lime" },
  ];

  // universal update handler
  const updateField = (index, field, value) => {
    const updatedLines = [...linesTextSignage];
    updatedLines[index] = {
      ...updatedLines[index],
      [field]: value,
    };
    dispatch(setLinesTextSignage(updatedLines));
  };

  return (
    <div className="bg-background mb-0">

      <div className="mb-3 grid grid-cols-3 gap-2">
        <Button
          className="btn-primary col-span-3 mb-3 disabled:cursor-not-allowed"
          disabled={linesTextSignage?.length >= 3}
          size="md"
          type="button"
          onClick={() => {
            if (linesTextSignage?.length >= 3) {
              return;
            }
            dispatch(setLinesTextSignage([...linesTextSignage, {
              mainIndexValueFromArr: linesTextSignage.length,
              signText: "Add Text",
              signFont: "Arial",
              signHeight: 30,
              faceColor: 'black',
              returnColor: ''
            }]))
          }}
        >
          Add Line
        </Button>
        {linesTextSignage.map((item, index) => {
          return (
            <div
              key={index}
              className={`border p-2 rounded-sm flex items-center justify-between ${selectedCanvasTextElement == index ? "bg-primary text-black" : "border-white"}   font-bold text-sm`}
              size="md"
              onClick={() => {
                dispatch(setSelectedCanvasTextElement(index));
              }}
            >
              Line {index + 1}
              {(index !== 0 && index == linesTextSignage?.length - 1) &&
                <button
                  className="ml-2 p-1 rounded-full hover:bg-red-500/20 hover:text-red-600 transition-colors cursor-pointer"
                  title="remove object"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRemoveIndex(index)
                  }}
                >
                  <X className="h-4 w-4" />
                </button>}
            </div>
          );
        })}
      </div>


      {
        linesTextSignage?.map((line, index) => {
          if (index != selectedCanvasTextElement) return null;
          return (
            <div key={index} className="mb-5 p-3 rounded-xl shadow-sm shadow-gray-600">
              <h2 className="text-xl font-semibold mb-3 flex items-center">
                {index == selectedCanvasTextElement && <div className="h-3 w-3 me-2 rounded-full bg-green-500"></div>}
                Line {index + 1}:
              </h2>

              <form className="grid grid-cols-2 gap-3 w-full ">
                {/* TEXT */}
                <div className=" flex flex-col gap-1 col-span-2">
                  Text:
                  <Input
                    type="text"
                    value={localText}
                    className="border-white/10"
                    onChange={(e) =>
                      handleTextChange(index, e.target.value)   // ← local update is instant
                    }
                    placeholder="Enter Text"
                  />
                </div>

                {/* HEIGHT */}
                <div className="flex flex-col gap-1">
                  Height:
                  <SelectHeight
                    value={line.signHeight}
                    onChange={(val) => updateField(index, "signHeight", val)}
                  />
                </div>

                {/* FONT */}
                <div className=" flex flex-col gap-1">
                  Font:
                  <SelectFont
                    value={line.signFont}
                    onChange={(val) => updateField(index, "signFont", val)}
                    options={fontOptions}
                  />
                </div>

                <div className=" flex flex-col gap-1">
                  Color:
                  <SelectColor
                    value={line.faceColor}
                    onChange={(val) => updateField(index, "faceColor", val)}
                    options={colorOptions}
                  />
                </div>

                {/* <div className=" flex flex-col gap-1">
                  Return Color:
                  <SelectColor
                    value={line.returnColor || ""}
                    onChange={(val) => updateField(index, "returnColor", val)}
                    options={colorOptions}
                  />
                </div> */}
              </form>
            </div>
          );
        })
      }
    </div >
  );
};

export default TextCanvasForm;
