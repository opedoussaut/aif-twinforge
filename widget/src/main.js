import { createApp } from 'vue';
import App from './App.vue';
import css from './styles.css?inline';
import { onLoad, registerPreferences, widget } from './platform';

onLoad(() => {
  // One bundle, no separate stylesheet: the dashboard only loads bundle.js.
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  widget.setTitle('AI factory agent');
  registerPreferences();
  createApp(App).mount('#app');
});
