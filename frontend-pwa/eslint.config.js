import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],

      // Chặn cứng any — bắt buộc AI dùng unknown + narrowing thay vì né lỗi
      '@typescript-eslint/no-explicit-any': 'error',

      // Chặn @ts-ignore hoàn toàn; @ts-expect-error phải kèm giải thích >= 10 ký tự
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-ignore': true,
          'ts-nocheck': true,
          'ts-check': false,
          'ts-expect-error': 'allow-with-description',
          minimumDescriptionLength: 10,
        },
      ],

      // Không cho biến/param khai báo rồi bỏ không dùng — dấu hiệu code AI generate thừa
      '@typescript-eslint/no-unused-vars': 'error',

      // Cấm non-null assertion (!) — dấu hiệu AI "ép" qua lỗi null-check
      '@typescript-eslint/no-non-null-assertion': 'error',

      // Bắt buộc khai báo return type cho function ở module dùng chung (types/, services/)
      '@typescript-eslint/explicit-module-boundary-types': 'warn',
    },
  },
)
