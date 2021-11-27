import typescript from '@rollup/plugin-typescript';

export default {
  input: 'src/',
  output: {
    dir: 'dist',
    format: 'cjs'
  },
  plugins: [typescript()]
};