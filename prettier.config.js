module.exports = {
    trailingComma: 'none',
    tabWidth: 4,
    semi: false,
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
}
