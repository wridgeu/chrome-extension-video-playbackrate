module.exports = {
    printWidth: 120,
    trailingComma: 'none',
    tabWidth: 4,
    semi: true,
    singleQuote: true,
    overrides: [
        {
            files: '*.json',
            options: {
                tabWidth: 2
            }
        },
        {
            files: '*.yaml',
            options: {
                tabWidth: 2
            }
        }
    ]
};
