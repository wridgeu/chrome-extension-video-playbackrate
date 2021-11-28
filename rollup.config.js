import resolve from 'rollup-plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import copy from 'rollup-plugin-copy';

export default {
  input: ['./src/options.ts', './src/popup.ts', './src/sw.ts', './src/actions/playbackrate.ts'],
  output: {
    dir: 'dist/js/',
    format: 'cjs'
  },
  plugins: [
    resolve(),
    typescript({
      module: "ESNext"
    }),
    copy({
      targets: [{
        src: 'public/*', dest: 'dist'
      }]
    })
  ]
};