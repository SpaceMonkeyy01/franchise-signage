
import { useDispatch, useSelector } from "react-redux";
import { setSignOptionsValues } from "../store/Slices/SignFormSlice";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const SignMaterialOptions = ({ formErrors }) => {
  const dispatch = useDispatch();
  const { signOptionsValues, single_filtered_option } =
    useSelector((state) => state.SignForm);
  console.log("signOptionsValues", signOptionsValues);

  const handleChange = ({ name, value }) => {
    dispatch(setSignOptionsValues({ ...signOptionsValues, [name]: value }));
  };

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 mb-5">
        {/* Material */}
        {single_filtered_option?.["material"] &&
          single_filtered_option?.["material"]?.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1 mt-2">
                Material
              </label>
              <Select
                value={signOptionsValues?.material || ""}
                onValueChange={(value) =>
                  handleChange({ name: "material", value })
                }
              >
                <SelectTrigger className="w-full border border-gray-500 rounded-lg focus:ring-2 focus:ring-mainthemeYello">
                  <SelectValue placeholder="Select material" />
                </SelectTrigger>
                <SelectContent className="bg-background">
                  {single_filtered_option?.["material"]?.map((opt, idx) => (
                    <SelectItem key={idx} value={opt.name}>
                      {opt.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formErrors?.material && (
                <div>
                  <small className={`text-red-700`}>
                    {formErrors?.material || "Required"}
                  </small>
                </div>
              )}
            </div>
          )}

        {/* Application */}
        {/* {single_filtered_option?.["application"] &&
          single_filtered_option?.["application"]?.length && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1 mt-2">
                Application
              </label>
              <Select
                value={signOptionsValues?.application || ""}
                onValueChange={(value) =>
                  handleChange({ name: "application", value })
                }
              >
                <SelectTrigger className="w-full border border-gray-500 rounded-lg focus:ring-2 focus:ring-mainthemeYello">
                  <SelectValue placeholder="Select application" />
                </SelectTrigger>
                <SelectContent className="bg-background">
                  {single_filtered_option?.["application"]?.map((opt, idx) => (
                    <SelectItem key={idx} value={opt.name}>
                      {opt.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formErrors?.application && (
                <div>
                  <small className={`text-red-700`}>
                    {formErrors?.application || "Required"}
                  </small>
                </div>
              )}
            </div>
          )} */}

        {/* UL Mandatory */}
        {single_filtered_option?.["ul_mandatory"] &&
          single_filtered_option?.["ul_mandatory"]?.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1 mt-2">
                UL Mandatory
              </label>
              <Select
                value={signOptionsValues?.ul_mandatory || ""}
                onValueChange={(value) =>
                  handleChange({ name: "ul_mandatory", value })
                }
              >
                <SelectTrigger className="w-full border border-gray-500 rounded-lg focus:ring-2 focus:ring-mainthemeYello">
                  <SelectValue placeholder="Select option" />
                </SelectTrigger>
                <SelectContent className="bg-background">
                  {single_filtered_option?.["ul_mandatory"]?.map((opt, idx) => (
                    <SelectItem key={idx} value={opt.name}>
                      {opt.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formErrors?.ul_mandatory && (
                <div>
                  <small className={`text-red-700`}>
                    {formErrors?.ul_mandatory || "Required"}
                  </small>
                </div>
              )}
            </div>
          )}

        {/* Paint Finish */}
        {single_filtered_option?.["paint_finish"] &&
          single_filtered_option?.["paint_finish"]?.length && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1 mt-2">
              Paint Finish
            </label>
            <Select
              value={signOptionsValues?.paint_finish || ""}
              onValueChange={(value) =>
                handleChange({ name: "paint_finish", value })
              }
            >
              <SelectTrigger className="w-full border border-gray-500 rounded-lg focus:ring-2 focus:ring-mainthemeYello">
                <SelectValue placeholder="Select finish" />
              </SelectTrigger>
              <SelectContent className="bg-background">
                {single_filtered_option?.["paint_finish"]?.map((opt, idx) => (
                  <SelectItem key={idx} value={opt.name}>
                    {opt.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {formErrors?.paint_finish && (
              <div>
                <small className={`text-red-700`}>
                  {formErrors?.paint_finish || "Required"}
                </small>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SignMaterialOptions;
