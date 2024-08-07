import { nodeResolve } from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import { terser } from 'rollup-plugin-terser';
import multiInput from 'rollup-plugin-multi-input';
import copy from 'rollup-plugin-copy';
import json from '@rollup/plugin-json';

export default {
  input: ['src/*.ts'],
  output: {
    format: 'esm',
    dir: 'dist/js/',
  },
  plugins: [
    json(),
    nodeResolve(),
    typescript(),
    multiInput(),
    terser(),
    copy({
      targets: [
        {
          src: ['public/*', 'public/!(manifest.json)',],
          dest: 'dist',
        },
        {
          src: 'public/manifest.json',
          dest: 'dist',
          transform: (fileBuffer) => {
            const chromeExtensionManifest = JSON.parse(fileBuffer.toString());
            chromeExtensionManifest.version = process.env.npm_package_version;
            delete chromeExtensionManifest.$schema; // not supported in dist, helps during development
            return JSON.stringify(chromeExtensionManifest, null, 2);
          }
        },
      ],
    }),
  ],
};
