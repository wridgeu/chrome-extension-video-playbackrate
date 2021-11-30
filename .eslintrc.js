module.exports = {
    env: {
        browser: true,
        es2021: true
    },
    extends: ['prettier', 'google'],
    parser: '@typescript-eslint/parser',
    parserOptions: {
        ecmaVersion: 13,
        sourceType: 'module'
    },
    plugins: ['@typescript-eslint'],
    rules: {
        'max-len': {
            code: 120,
            comments: 120
        }
    }
};
