import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './style.css'
import './assets/main.css'
import '@fortawesome/fontawesome-free/css/all.min.css'
import 'github-markdown-css/github-markdown.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
