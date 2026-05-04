import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router/index.ts';
import { bootstrapRequestRateLimit } from '@/utils/request';
import './assets/theme.css';
import './style.css';
import './assets/main.css';
import 'github-markdown-css/github-markdown.css';
import 'driver.js/dist/driver.css';

const bootstrap = async (): Promise<void> => {
  await bootstrapRequestRateLimit();

  const app = createApp(App);

  app.use(createPinia());
  app.use(router);

  app.mount('#app');
};

void bootstrap();
