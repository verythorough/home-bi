import { useState } from 'react'
import Sidebar from './components/Sidebar'
import ImportPage from './pages/ImportPage'
import QueryPage from './pages/QueryPage'
import DashboardPage from './pages/DashboardPage'

export type Page = 'import' | 'query' | 'dashboard'

function App(): JSX.Element {
  const [currentPage, setCurrentPage] = useState<Page>('import')

  function renderPage(): JSX.Element {
    switch (currentPage) {
      case 'import':
        return <ImportPage />
      case 'query':
        return <QueryPage />
      case 'dashboard':
        return <DashboardPage />
    }
  }

  return (
    <div className="app">
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
      <main className="content">{renderPage()}</main>
    </div>
  )
}

export default App
