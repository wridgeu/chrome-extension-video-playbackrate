import globals from "globals";
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import tseslintPlugin from "@typescript-eslint/eslint-plugin";
import eslintConfigPrettier from "eslint-config-prettier";
import jsdoc from "eslint-plugin-jsdoc";

export default [
	{
		ignores: ["**node_modules/*", "**dist/*", "**docs/*", "rollup.config.js"],
	},
	eslint.configs.recommended,
	...tseslint.configs.recommended,
	eslintConfigPrettier,
	jsdoc.configs["flat/recommended"],
	{
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: "module",
			globals: {
				...globals.browser,
			},
			parser: tseslint.parser,
			parserOptions: {
				ecmaVersion: 2022,
				sourceType: "module",
			},
		},
		plugins: {
			"@typescript-eslint": tseslintPlugin,
			jsdoc,
		},
		rules: {
			"max-len": [
				"warn",
				{
					code: 120,
					comments: 120,
				},
			],
			"linebreak-style": 0,
			"no-unused-vars": "off",
			"@typescript-eslint/no-unused-vars": "error",
			"@typescript-eslint/no-non-null-assertion": "off",
		},
	},
];
