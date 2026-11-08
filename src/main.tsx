import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import './home-display.css'
import './core.css'
import './admin.css'
import CoreProvider from './core'
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><CoreProvider><App /></CoreProvider></React.StrictMode>)
if('serviceWorker' in navigator && import.meta.env.PROD)void navigator.serviceWorker.register('/sw.js')
