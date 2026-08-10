export const getBackgroundImageName = (mainType) => {
    if (mainType && mainType?.toLowerCase().includes('outdoor')) {
        return 'scene-outdoor.jpg';
    }

    return 'scene.png';
};