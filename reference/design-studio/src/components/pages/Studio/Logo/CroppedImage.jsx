import { useEffect, useState } from "react";
import { cropBase64Image } from "../../../../utils/cropCenterSquareBase64";

export default function CroppedImage({ base64 }) {
  const [cropped, setCropped] = useState(null);

  useEffect(() => {
    if (base64) {
      cropBase64Image(base64, {  size: 125, left: 500, top: 430 }).then((result) => setCropped(result));
    }
  }, [base64]);

  if (!cropped) return null;

  return (
    <div className="bg-white/0 relative backdrop-blur-md  md:flex hidden border border-white/20 rounded-xl overflow-hidden shadow-lg">
      <div className="absolute top-0 left-0 bg-gray-500 p-2 text-sm w-full text-center text-white ">Closeup View</div>
      <img
        src={cropped}
        alt="Cropped"
        className="object-fill w-full h-full"
      />
    </div>
  );
}
