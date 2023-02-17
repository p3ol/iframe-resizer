import terser from '@rollup/plugin-terser';
import babel from '@rollup/plugin-babel';

export default [{
  input: 'src/iframeResizer.js',
  output: [{ file: 'js/iframeResizer.js' }],
  plugins: [],
}, {
  input: 'src/iframeResizer.contentWindow.js',
  output: [{ file: 'js/iframeResizer.contentWindow.js' }],
  plugins: [],
}, {
  input: 'src/iframeResizer.contentWindow.js',
  output: [{
    file: 'js/iframeResizer.contentWindow.min.js',
    sourcemap: true,
  }],
  plugins: [babel(), terser()],
}, {
  input: 'src/iframeResizer.js',
  output: [{
    file: 'js/iframeResizer.min.js',
    sourcemap: true,
  }],
  plugins: [babel(), terser()],
}];
