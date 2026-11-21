import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import { initBackend } from '@/lib/backend'
import { AuthProvider } from '@/context/AuthProvider'
import { ToastProvider } from '@/components/ui/Toast'
import App from './App'
import BootError from '@/features/common/BootError'

const root = ReactDOM.createRoot(document.getElementById('root'))

initBackend()
  .then(() => {
    root.render(
      <React.StrictMode>
        <BrowserRouter>
          <ToastProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </ToastProvider>
        </BrowserRouter>
      </React.StrictMode>
    )
  })
  .catch((e) => {
    // Never fall back to local data when a real project is configured.
    console.error(e)
    root.render(<BootError error={e} />)
  })
