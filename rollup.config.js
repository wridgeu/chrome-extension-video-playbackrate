import typescript from '@rollup/plugin-typescript';
import { terser } from "rollup-plugin-terser";
import multiInput from 'rollup-plugin-multi-input';
import resolve from 'rollup-plugin-node-resolve';
import copy from 'rollup-plugin-copy';

export default {
  input: ['src/*.ts'],
  output: {
    dir: 'dist/js/',
    format: 'cjs'
  },
  plugins: [
    resolve(),
    terser(),
    multiInput(),
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