import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './store/auth'

// Pages
import LoginPage from './pages/LoginPage'
import ManagerDashboard from './pages/Manager/Dashboard'
import AdminDashboard from './pages/Admin/Dashboard'

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          
          {/* Manager Routes */}
          <Route path="/manager/*" element={<ManagerDashboard />} />
          
          {/* Admin Routes */}
          <Route path="/admin/*" element={<AdminDashboard />} />
          
          {/* Default redirect */}
          <Route path="/" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </Router>
  )
}

export default App
