// Several destructured params below (objects, ResponseObject, toolsOptions,
// quotationId, mainType/secondaryType/tertiaryType/optionType) map 1:1 to
// formData.append(...) calls that are intentionally commented out — disabled
// backend payload fields kept here so the call-site contract is preserved for
// when they're re-enabled. Don't delete them.
/* eslint-disable no-unused-vars */
export function buildFormData({
  options,
  objects,
  racewayData,
  ResponseObject,
  backerData,
  signOptionsValues,
  toolsOptions,
  quotationId,
  mockupCreationType,
  uploaded_file,
  mainType, secondaryType, tertiaryType, optionType,

  module_name,
  textBasedImage,
  textBasedWidth,
  textBasedDimension,
  staticDimension = null
}) {
  const formData = new FormData();

  formData.append("sign_image", module_name == 'text' ? textBasedImage : (uploaded_file ?? null));
  formData.append("sign_width_or_height", module_name == 'text' ? textBasedWidth : options.sign_height);
  formData.append("user_input_dimension", module_name == 'text' ? textBasedDimension : options.user_input_dimension);

  // append only for one line of canvas
  if (module_name == 'text' && staticDimension) {
    formData.append("override_dimensions", staticDimension?.override_dimensions);
    formData.append("static_width", staticDimension?.static_width);
    formData.append("static_height", staticDimension?.static_height);
  }


  // formData.append("main_category", mainType);
  // formData.append("secondary_category", secondaryType);
  // formData.append("tertiary_category", tertiaryType);
  // formData.append("finished_category", optionType);

  formData.append("sign_depth", options.sign_depth);

  formData.append("sign_width", options.sign_width);
  formData.append("sign_height", options.sign_height);

  // formData.append("dimension_unit", 'ft');

  formData.append("sign_type", options.sign_type);
  formData.append("mounting_type", options.mounting_type);
  formData.append("size", options.size);
  // formData.append("profit_factor", options.profit_factor);
  // formData.append("quotationId", quotationId);
  formData.append("neon_color", options.neon_color);
  formData.append("uv_printing_needed", options.uv_printing_needed);
  // formData.append("objects", JSON.stringify(objects));

  formData.append("mockupCreationType", mockupCreationType);

  // formData.append("no_of_lines", racewayData?.no_of_lines || 1);
  formData.append("raceway_depth", racewayData?.raceway_depth || 0);
  formData.append("raceway_height", racewayData?.raceway_height || 0);

  // formData.append(
  //   "width_of_line_1",
  //   racewayData?.raceway_objects?.[0]?.width_of_line ??
  //     (options.user_input_dimension == "width"
  //       ? options.sign_height
  //       : undefined) ??
  //     (ResponseObject?.data?.signWidth
  //       ? Number(+ResponseObject.data.signWidth).toFixed(2)
  //       : undefined) ??
  //     0
  // );
  // formData.append(
  //   "width_of_line_2",
  //   racewayData?.raceway_objects?.[1]?.width_of_line || 0
  // );
  // formData.append(
  //   "width_of_line_3",
  //   racewayData?.raceway_objects?.[2]?.width_of_line || 0
  // );
  // formData.append(
  //   "width_of_line_4",
  //   racewayData?.raceway_objects?.[3]?.width_of_line || 0
  // );
  // formData.append(
  //   "height_of_line_1",
  //   racewayData?.raceway_objects?.[0]?.max_height_of_line || 0
  // );
  // formData.append(
  //   "height_of_line_2",
  //   racewayData?.raceway_objects?.[1]?.max_height_of_line || 0
  // );
  // formData.append(
  //   "height_of_line_3",
  //   racewayData?.raceway_objects?.[2]?.max_height_of_line || 0
  // );
  // formData.append(
  //   "height_of_line_4",
  //   racewayData?.raceway_objects?.[3]?.max_height_of_line || 0
  // );
  formData.append("backer_offset", backerData?.backer_offset || 0);
  formData.append(
    "backboard_cabinet_depth",
    backerData?.backboard_cabinet_depth || 0
  );

  Object.entries(signOptionsValues).forEach(([key, value]) => {
    formData.append(key, value);
  });

  // Object.entries(toolsOptions).forEach(([key, value]) => {
  //   const isNumber = typeof value === "number" && !isNaN(value) && value > 0;
  //   const isNonEmptyString = typeof value === "string" && value.trim() !== "";
  //   const isBoolean = typeof value === "boolean";

  //   if (isNumber || isNonEmptyString || isBoolean) {
  //     formData.append(key, value);
  //   }
  // });

  return formData;
}
