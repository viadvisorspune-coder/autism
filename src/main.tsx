import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './app/App'
import { SessionProvider } from './state/session'
import { UIProvider } from './state/ui'
import { MaturityBridge } from './state/maturity'
import { RecordProvider } from './data/RecordProvider'

/**
 * The interface renders first and the record fills in behind it.
 *
 * Waiting for the backend before the first paint means a blank screen whenever
 * it is slow, which is the worst thing this interface could do to someone who
 * is already finding the day expensive. RecordProvider fetches in the
 * background and re-renders once; until then every screen says it is showing
 * demonstration data.
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <RecordProvider>
        <SessionProvider>
          <UIProvider>
            <MaturityBridge>
            <App />
            </MaturityBridge>
          </UIProvider>
        </SessionProvider>
      </RecordProvider>
    </BrowserRouter>
  </StrictMode>,
)
