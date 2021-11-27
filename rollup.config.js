import typescript from '@rollup/plugin-typescript';
import copy from 'rollup-plugin-copy';

export default {
  input: ['./src/options.ts', './src/popup.ts', './src/sw.ts'],
  output: {
    dir: 'dist/public/js/',
    format: 'cjs'
  },
  plugins: [
    typescript({
      target: "esnext"
    }),
    copy({
      targets: [{
        src: 'public', dest: 'dist'
      }]
    })
  ]
};