import  { useEffect } from "react";
import MainLayout from "../components/pages/Studio/Logo/MainLayout";
import { useDispatch } from "react-redux";
import { useLocation } from "react-router-dom";
import { setModuleName } from "../store/Slices/SignFormSlice";

const StudioText = () => {
  const dispatch = useDispatch();
  const location = useLocation();

  useEffect(() => {
    if (
      location.pathname == "/studio/text" ||
      location.pathname == "/studio/text/"
    ) {
      dispatch(setModuleName("text"));
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  return (
    <div className="h-full">
      <MainLayout />
      {/* <BottomBar /> */}
    </div>
  );
};

export default StudioText;
