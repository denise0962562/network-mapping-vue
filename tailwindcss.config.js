/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,js}", // 修改为你的文件路径
  ],
  theme: {
    extend: {
        colors: {
            errorbg: '#FFF3F4',
            errortext: '#FF63A0',
        }
    },
  },
  plugins: [],
}
