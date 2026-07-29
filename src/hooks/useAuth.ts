import { useEffect, useState } from "react"
import { checkAuth, login as authLogin, logout as authLogout, subscribeAuthChange } from "../lib/auth"

export interface User {
  id: number
  name: string
  avatar: {
    medium: string
  }
}

// Rewritten from the extension's useAuth.ts: there's no background worker to
// RPC into anymore, so this calls lib/auth.ts directly instead of
// chrome.runtime.sendMessage, and listens for BroadcastChannel auth-change
// events instead of chrome.runtime.onMessage.
export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshAuthStatus = async () => {
    const { user: storedUser, token } = await checkAuth()
    setUser(storedUser ?? null)
    setAccessToken(token ?? null)
    setLoading(false)
  }

  useEffect(() => {
    refreshAuthStatus()
    return subscribeAuthChange(() => {
      refreshAuthStatus()
    })
  }, [])

  const login = () => {
    // Full-page redirect — control never returns here on success.
    authLogin()
  }

  const logout = async () => {
    setLoading(true)
    await authLogout()
    setUser(null)
    setAccessToken(null)
    setLoading(false)
  }

  return { user, loading, login, logout, accessToken }
}
