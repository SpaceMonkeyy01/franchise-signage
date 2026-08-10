// ObjectItem.jsx
import { X } from "lucide-react";

export default function SingleObjectItem({
  obj,
  index,
  handleObjectsChange,
  handleRemoveObject,
  objectErrors,
}) {
  return (
    <div className="mb-3 border p-2 border-white/10 rounded-md relative">
      <div className="grid grid-cols-2 md:grid-cols-1 gap-4 mt-4">
        {/* Image */}
        {obj.image && (
          <div>
            <img
              src={
                obj.image.startsWith("data:image")
                  ? obj.image
                  : `data:image/png;base64,${obj.image}`
              }
              className="h-20"
            />
          </div>
        )}

        {/* Height */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            {'Height"'}
          </label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            disabled
            value={obj.height}
            onChange={(e) =>
              handleObjectsChange(index, "height", parseFloat(e.target.value))
            }
            className="w-full px-3 py-2 border border-white/10 rounded-lg 
                       focus:outline-none disabled:cursor-not-allowed focus:ring-2 focus:ring-mainthemeYello"
          />
          {objectErrors[index]?.height && (
            <p className="text-red-400 text-[13px]">
              {objectErrors[index].height}
            </p>
          )}
        </div>

        {/* Width */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            {'Width"'}
          </label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            disabled
            value={obj.width}
            onChange={(e) =>
              handleObjectsChange(index, "width", parseFloat(e.target.value))
            }
            className="w-full px-3 py-2 border border-white/10 rounded-lg 
                       focus:outline-none disabled:cursor-not-allowed focus:ring-2 focus:ring-mainthemeYello"
          />
          {objectErrors[index]?.width && (
            <p className="text-red-400 text-[13px]">
              {objectErrors[index].width}
            </p>
          )}
        </div>

        {/* Perimeter */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            {'Perimeter"'}
          </label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            disabled
            value={obj.perimeter}
            onChange={(e) =>
              handleObjectsChange(
                index,
                "perimeter",
                parseFloat(e.target.value)
              )
            }
            className="w-full px-3 py-2 border border-white/10 rounded-lg 
                       focus:outline-none disabled:cursor-not-allowed focus:ring-2 focus:ring-mainthemeYello"
          />
          {objectErrors[index]?.perimeter && (
            <p className="text-red-400 text-[13px]">
              {objectErrors[index].perimeter}
            </p>
          )}
        </div>

        {/* Area */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Filled Area (in&sup2;)
          </label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            disabled
            value={obj.area}
            onChange={(e) =>
              handleObjectsChange(index, "area", parseFloat(e.target.value))
            }
            className="w-full px-3 py-2 border border-white/10 rounded-lg 
                       focus:outline-none disabled:cursor-not-allowed focus:ring-2 focus:ring-mainthemeYello"
          />
          {objectErrors[index]?.area && (
            <p className="text-red-400 text-[13px]">
              {objectErrors[index].area}
            </p>
          )}
        </div>

        {/* Box Area */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Box Area (in&sup2;)
          </label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            disabled
            value={obj.boxArea}
            onChange={(e) =>
              handleObjectsChange(index, "boxArea", parseFloat(e.target.value))
            }
            className="w-full px-3 py-2 border border-white/10 rounded-lg 
                       focus:outline-none disabled:cursor-not-allowed focus:ring-2 focus:ring-mainthemeYello"
          />
          {objectErrors[index]?.boxArea && (
            <p className="text-red-400 text-[13px]">
              {objectErrors[index].boxArea}
            </p>
          )}
        </div>

        {/* Remove Button */}
        <div className="flex items-center justify-end absolute top-[5px] right-[5px]">
          <button
            type="button"
            disabled
            onClick={() => handleRemoveObject(index)}
            className="h-max text-foreground w-max py-[6px] px-[6px] 
                       outline-none disabled:cursor-not-allowed font-bold rounded-md 
                       bg-red-500/20 disabled:bg-red-500/20 hover:bg-red-500 text-xs cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
