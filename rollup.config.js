import { nodeResolve } from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import { terser } from 'rollup-plugin-terser';
import multiInput from 'rollup-plugin-multi-input';
import copy from 'rollup-plugin-copy';

export default {
    input: ['src/*.ts'],
    output: {
        format: 'esm',
        dir: 'dist/js/'
    },
    plugins: [
        multiInput(),
        typescript({
            module: 'ESNext'
        }),
        nodeResolve(),
        terser(),
        copy({
            targets: [
                {
                    src: 'public/*',
                    dest: 'dist'
                }
            ]
        })
    ]
};
