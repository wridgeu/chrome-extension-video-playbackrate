'use strict';

import { nodeResolve } from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import { terser } from 'rollup-plugin-terser';
import multiInput from 'rollup-plugin-multi-input'; // @see https://github.com/alfredosalzillo/rollup-plugin-multi-input/issues/61
import copy from 'rollup-plugin-copy';
import json from '@rollup/plugin-json';

export default {
  input: ['src/*.ts', '!src/*.d.ts'],
  output: {
    format: 'esm',
    dir: 'dist/js/',
  },
  plugins: [
    json(),
    nodeResolve(),
    typescript(),
    multiInput.default(),
    terser(),
    copy({
      targets: [
        {
          src: 'public/*',
          dest: 'dist',
        },
      ],
    }),
  ],
};
