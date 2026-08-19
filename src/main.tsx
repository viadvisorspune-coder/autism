import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './app/App'
import { SessionProvider } from './state/session'
import { UIProvider } from './state/ui'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <UIProvider>
          <App />
        </UIProvider>
      </SessionProvider>
    </BrowserRouter>
  </StrictMode>,
)
