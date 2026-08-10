// `objects` and `toolsOptions` are destructured but map to lines that are
// intentionally commented out below (disabled payload fields). They're kept as
// part of this studio→pricing integration-seam contract — don't delete them.
/* eslint-disable no-unused-vars */
export function buildDataForSheet({
    options = {},
    objects = {},
    racewayData = {},
    ResponseObject = {},
    backerData = {},
    signOptionsValues = {},
    toolsOptions = {},
    epicCraftingsPricing
}) {

    let imageData = epicCraftingsPricing?.imageData || null;
    let racewayObjects = imageData?.racewayObjects || [];

    let mountingTypesInSheet = {
        "Flush/Stud mounted": "Flush/Stud mounted",
        "Standard Raceway": "Standard Raceway (6x2)",
        "Flat Backer": "Flat Backer (2.5 mm)",
        "Backerboard Cabinet": 'Backerboard Cabinet (2")'
    }

    let signTypesInSheet = {
        "Premium Face-Lit Letters (Metallic Trim)": "Face Lit Channel Letters",
        "Standard Face Lit Letters (Plastic Trim)": "Face Lit Channel Letters",
        "Double Sided Push Through Cabinet": "Fabricated Push Through Cabinet - Double Sided"
    }

    const data = {
        sign_width_or_height: options.sign_height,
        user_input_dimension: options.user_input_dimension,
        sign_depth: options.sign_depth,
        sign_type: signTypesInSheet[options.sign_type] ?? options.sign_type,
        mounting_type: mountingTypesInSheet[options.mounting_type],
        neon_color: options.neon_color,
        uv_printing_needed: options.uv_printing_needed,


        no_of_lines: imageData?.noOfLines ?? racewayData.no_of_lines ?? 1,
        raceway_depth: racewayData.raceway_depth ?? 0,
        raceway_height: racewayData.raceway_height ?? 0,


        width_of_line_1: racewayObjects?.[0]?.['widthOfLine'] ??
            racewayData?.raceway_objects?.[0]?.width_of_line ??
            (options.user_input_dimension == "width"
                ? options.sign_height
                : undefined) ??
            (ResponseObject?.data?.signWidth
                ? Number(+ResponseObject.data.signWidth).toFixed(2)
                : undefined) ??
            0,
        width_of_line_2: racewayObjects?.[1]?.['widthOfLine'] ?? racewayData?.raceway_objects?.[1]?.width_of_line ?? 0,
        width_of_line_3: racewayObjects?.[2]?.['widthOfLine'] ?? racewayData?.raceway_objects?.[2]?.width_of_line ?? 0,
        width_of_line_4: racewayObjects?.[3]?.['widthOfLine'] ?? racewayData?.raceway_objects?.[3]?.width_of_line ?? 0,
        height_of_line_1: racewayObjects?.[0]?.['maxHeightOfLine'] || racewayData?.raceway_objects?.[0]?.max_height_of_line || 0,
        height_of_line_2: racewayObjects?.[1]?.['maxHeightOfLine'] || racewayData?.raceway_objects?.[1]?.max_height_of_line || 0,
        height_of_line_3: racewayObjects?.[2]?.['maxHeightOfLine'] || racewayData?.raceway_objects?.[2]?.max_height_of_line || 0,
        height_of_line_4: racewayObjects?.[3]?.['maxHeightOfLine'] || racewayData?.raceway_objects?.[3]?.max_height_of_line || 0,
        backer_offset: backerData.backer_offset ?? 2,
        backboard_cabinet_depth: backerData.backboard_cabinet_depth ?? 2,
        // quotationId,
        // mockupCreationType,
        // objects, // include the objects directly
        // Merge signOptionsValues into the data object
        ...signOptionsValues,
        // Merge valid toolsOptions
        // ...Object.fromEntries(
        //     Object.entries(toolsOptions).filter(([key, value]) => {
        //         const isNumber = typeof value === "number" && !isNaN(value) && value > 0;
        //         const isNonEmptyString = typeof value === "string" && value.trim() !== "";
        //         const isBoolean = typeof value === "boolean";
        //         return isNumber || isNonEmptyString || isBoolean;
        //     })
        // )

        no_of_letters: imageData?.noOfLetters ?? 0,
        perimeter_of_sign: imageData?.perimeterOfSign ?? 0,
        nested_area: imageData?.nestedArea ?? 0,
        occupied_area: imageData?.occupiedArea ?? 0,
        avg_char_height: imageData?.avgCharHeight ?? 0,
        width_of_sign: imageData?.widthOfSign ?? 0,
        width_of_smaller_line: imageData?.widthOfSmallerLine ?? 0,
        other_dimension_of_sign: imageData?.otherDimensionOfSign ?? 0,
        size: options.size,
        sign_width: options.sign_width,
        sign_height: options.sign_height
    };

    return data;
}