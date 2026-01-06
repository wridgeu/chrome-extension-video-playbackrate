import { nodeResolve } from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';
import copy from 'rollup-plugin-copy';
import json from '@rollup/plugin-json';
import { globSync } from 'glob';
import path from 'path';

// Get all TypeScript files in src/ (excluding test files and subdirectories)
const inputFiles = globSync('src/*.ts').reduce((acc, file) => {
  const name = path.basename(file, '.ts');
  acc[name] = file;
  return acc;
}, {});

export default {
  input: inputFiles,
  output: {
    format: 'esm',
    dir: 'dist/js/',
    entryFileNames: '[name].js',
    chunkFileNames: '[name]-[hash].js',
  },
  plugins: [
    json(),
    nodeResolve(),
    typescript(),
    terser(),
    copy({
      targets: [
        {
          src: ['public/*', 'public/!(manifest.json)'],
          dest: 'dist',
        },
        {
          src: 'public/manifest.json',
          dest: 'dist',
          transform: (fileBuffer) => {
            const chromeExtensionManifest = JSON.parse(fileBuffer.toString());
            chromeExtensionManifest.version = process.env.npm_package_version;
            delete chromeExtensionManifest.$schema;
            return JSON.stringify(chromeExtensionManifest, null, 2);
          },
        },
      ],
    }),
  ],
};
