import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      // export/는 앱 코드가 참조하지 않는 임시 이미지 폴더인데, 안에 있는 파일이 다른 프로그램에
      // 의해 잠겨 있을 때가 있어 Vite의 파일 감시자가 EBUSY로 죽는 일이 반복됐다 — 아예 감시
      // 대상에서 뺀다.
      ignored: ['**/export/**'],
    },
  },
})
