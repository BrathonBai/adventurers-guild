import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// The palette follows the system. `?theme=dark|light` overrides it for
// screenshots and for anyone who wants to pin one theme.
const forced = new URLSearchParams(window.location.search).get('theme')
if (forced === 'dark' || forced === 'light') {
  document.documentElement.dataset.theme = forced
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
