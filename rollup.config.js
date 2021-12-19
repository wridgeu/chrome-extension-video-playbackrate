import resolve from "@rollup/plugin-node-resolve";
import typescript from '@rollup/plugin-typescript';
import { terser } from 'rollup-plugin-terser';
import multiInput from 'rollup-plugin-multi-input';
import copy from 'rollup-plugin-copy';

export default {
    input: ['src/*.ts'],
    output: {
        dir: 'dist/js/',
        format: 'es'
    },
    plugins: [
        resolve(),
        typescript({
            module: 'ESNext'
        }),
        terser(),
        multiInput(),
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
