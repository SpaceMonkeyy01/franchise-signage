
import { useLocation, Link } from "react-router-dom";
import { Image, Type } from "lucide-react";
import { resetFormStates } from "../../../utils/resetFormStates";
import { useDispatch, useSelector } from "react-redux";
import { setModuleName } from "../../../store/Slices/SignFormSlice";

const PathSelector = ({ onSignTypeChange }) => {
  const location = useLocation();
  const dispatch = useDispatch();

  const { options } = useSelector((state) => state.SignForm);

  return (
    <div className="path-selector">
      <Link
        to={"/studio/logo"}
        onClick={(e) => {
          if (location.pathname === "/studio/logo") {
            e.preventDefault(); // stop navigation
            return;
          }
          resetFormStates(options?.sign_type, onSignTypeChange);
          dispatch(setModuleName("logo"));
        }}
        className={
          location.pathname == "/studio/logo"
            ? "path-option active"
            : "path-option"
        }
        id="logoPath"
      >
        <div className="path-icon">
          <Image size={20} />
        </div>
        <div className="path-label">Logo/Image</div>
      </Link>
      <Link
        // onClick={() => toast.warning("Text feature coming soon.")}
        to={"/studio/text"}
        onClick={(e) => {
          if (location.pathname === "/studio/text") {
      e.preventDefault(); // stop navigation
      return;
    }
          resetFormStates(options?.sign_type, onSignTypeChange);
          dispatch(setModuleName("text"));
        }}
        className={
          location.pathname == "/studio/text"
            ? "path-option active"
            : "path-option"
        }
        id="textPath"
      >
        <div className="path-icon">
          <Type size={20} />
        </div>
        <div className="path-label">Text Sign</div>
      </Link>
    </div>
  );
};

export default PathSelector;
