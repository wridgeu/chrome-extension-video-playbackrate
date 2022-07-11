module.exports = {
    env: {
        browser: true,
        es2021: true,
        node: true,
    },
    extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'google', 'prettier'],
    parser: '@typescript-eslint/parser',
    parserOptions: {
        ecmaVersion: 13,
        sourceType: 'module',
    },
    plugins: ['@typescript-eslint'],
    rules: {
        'max-len': ['warn', {
            code: 120,
            comments: 120,
        }],
        'linebreak-style': 0,
        "no-unused-vars": "off",
        "@typescript-eslint/no-unused-vars": "error"
    },
};
