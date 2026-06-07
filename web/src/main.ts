import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import '@fontsource/press-start-2p'
import './assets/styles/main.css'
import App from './App.vue'
import router from './router'
import { initAppKit } from './lib/appkit'

import en from './locales/en.json'
import fr from './locales/fr.json'

initAppKit()

const savedLocale = localStorage.getItem('voting-locale') || 'fr'

const i18n = createI18n({
  legacy: false,
  locale: savedLocale,
  fallbackLocale: 'en',
  messages: { en, fr },
})

const pinia = createPinia()
const app = createApp(App)

app.use(pinia)
app.use(router)
app.use(i18n)

app.mount('#app')
