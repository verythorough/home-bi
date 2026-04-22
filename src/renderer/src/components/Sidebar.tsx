import type { Page } from '../App'

interface SidebarProps {
  currentPage: Page
  onNavigate: (page: Page) => void
}

const navItems: { page: Page; label: string; icon: string }[] = [
  { page: 'import', label: 'Import', icon: '📂' },
  { page: 'query', label: 'Query', icon: '🔍' },
  { page: 'reports', label: 'Reports', icon: '📋' },
]

function Sidebar({ currentPage, onNavigate }: SidebarProps): JSX.Element {
  return (
    <nav className="sidebar">
      <div className="sidebar-title">Finance BI</div>
      <ul className="sidebar-nav">
        {navItems.map(({ page, label, icon }) => (
          <li key={page}>
            <button
              className={currentPage === page ? 'active' : ''}
              onClick={() => onNavigate(page)}
            >
              <span className="nav-icon">{icon}</span>
              {label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export default Sidebar
