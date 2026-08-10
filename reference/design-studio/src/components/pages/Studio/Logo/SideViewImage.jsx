// import SideViews from "../../../../json/SideViews.json";
import { useSelector } from "react-redux";

const SideViewImage = () => {
  const {
    ResponseObject,
    // default_options
  } = useSelector((state) => state.SignForm);

  // let sideViewImage = SideViews?.find(
  //   (singleSide) =>
  //     (singleSide.sign_type ==
  //       default_options?.sign_type?.find(
  //         (singleDefault) =>
  //           singleDefault?.name == ResponseObject?.data?.sign_type
  //       )?.key &&
  //       singleSide.mounting_type ==
  //         default_options?.mounting_type?.find(
  //           (singleDefault) =>
  //             singleDefault?.name ==
  //             (ResponseObject?.data?.mounting_type || "Flush/Stud mounted")
  //         )?.key) ||
  //     ""
  // )?.image;

  return (
    <div className="bg-white/0 relative pt-8 backdrop-blur-md md:flex hidden border border-white/20 rounded-xl overflow-hidden shadow-lg">
      <div className="absolute top-0 left-0 bg-gray-500 p-2 text-sm w-full text-center text-white">
        Side View
      </div>

      <a
        href={ResponseObject?.data?.sideViewImage}
        target="_blank"
        rel="noopener noreferrer"
      >
        <img
          src={ResponseObject?.data?.sideViewImage}
          alt="Cropped"
          className="object-contain bg-[#9D9F9C] p-2 w-full h-full cursor-pointer"
        />
      </a>
    </div>
  );
};

export default SideViewImage;
