import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  loading: false,
  error: null,
  linesTextSignage: [
    {
      mainIndexValueFromArr: 0,
      signText: "Add Text",
      signFont: "Arial",
      signHeight: 30,
      faceColor: 'black',
      returnColor: ''
    },
    // {
    //   mainIndexValueFromArr: 0,
    //   signText: "Add Text",
    //   signFont: "Arial",
    //   // faceColor: {
    //   //   hex: "blue",
    //   // },
    //   // returnColor: {
    //   //   hex: "red",
    //   // },
    //   signHeight: 12,
    // },
    // {
    //   mainIndexValueFromArr: 0,
    //   signText: "Add Text",
    //   signFont: "Arial",
    //   // faceColor: {
    //   //   hex: "blue",
    //   // },
    //   // returnColor: {
    //   //   hex: "red",
    //   // },
    //   signHeight: 12,
    // },
  ],
  selectedCanvasTextElement: 0,
  actualSignWidth: 0
};

const TextCanvasSlice = createSlice({
  name: "TextCanvas",
  initialState,
  reducers: {
    setLinesTextSignage: (state, action) => {
      state.linesTextSignage = action.payload;
    },
    setSelectedCanvasTextElement: (state, action) => {
      state.selectedCanvasTextElement = action.payload;
    },
    setActualSignWidth: (state, action) => {
      state.actualSignWidth = action.payload;
    },
    resetTextCanvas: () => initialState,
  },
  //   extraReducers: (builder) => {},
});

export const { setLinesTextSignage, setSelectedCanvasTextElement, resetTextCanvas, setActualSignWidth } =
  TextCanvasSlice.actions;

export default TextCanvasSlice.reducer;
