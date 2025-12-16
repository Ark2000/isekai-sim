import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.21.0/dist/lil-gui.esm.js'

const gui = new GUI();

// Color format helpers needed for the editor
const colorFormats = {
    string: '#ffffff',
    int: 0xffffff,
    object: { r: 1, g: 1, b: 1 },
    array: [ 1, 1, 1 ]
};

// Export GUI instance and objects for use in other files
export { gui, colorFormats };
