import React, { useEffect } from 'react'
import { create } from 'zustand'
import { User, AuthState, LoginCredentials } from '../types'

interface AuthStore extends AuthState {
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  setUser: (user: User | null) => void
  setToken: (token: string | null) => void
}

const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  token: localStorage.getItem('token'),
  isAuthenticated: !!localStorage.getItem('token'),
  isLoading: false,
  error: null,

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })

      if (!response.ok) throw new Error('Login failed')

      const data = await response.json()
      localStorage.setItem('token', data.data.accessToken)
      
      set({
        user: data.data.user,
        token: data.data.accessToken,
        isAuthenticated: true,
        isLoading: false
      })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Login failed',
        isLoading: false
      })
      throw error
    }
  },

  logout: () => {
    localStorage.removeItem('token')
    set({
      user: null,
      token: null,
      isAuthenticated: false,
      error: null
    })
  },

  setUser: (user) => set({ user }),
  setToken: (token) => set({ token, isAuthenticated: !!token })
}))

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, setUser } = useAuthStore()

  useEffect(() => {
    // Validate token on mount
    if (token) {
      // Here we would validate the token
      // For now, we just assume it's valid
    }
  }, [token, setUser])

  return <>{children}</>
}

export default useAuthStore
