import { createApp } from "vue";
import App from "./App.vue";
import "./styles.css";

// 触屏禁止缩放：iOS 的 gesture 事件与多指触摸兜底（单指点按不受影响）
for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
  document.addEventListener(type, (e) => e.preventDefault());
}
document.addEventListener(
  "touchmove",
  (e) => {
    if (e.touches.length > 1) e.preventDefault();
  },
  { passive: false }
);

createApp(App).mount("#app");
