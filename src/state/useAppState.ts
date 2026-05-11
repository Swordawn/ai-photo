import { useState, useCallback, useRef, useEffect } from 'react'

export type AppPage = 'home' | 'camera' | 'compose' | 'print'

export interface StudentInfo {
  name: string
  className: string
  phone: string
}

export interface AppState {
  page: AppPage
  studentInfo: StudentInfo | null
  capturedPhoto: string | null
  selectedBg: string | null
  selectedStyle: string | null
  selectedFrame: string | null
  resultImage: string | null
  mockMode: boolean
}

const INITIAL_STATE: AppState = {
  page: 'home',
  studentInfo: null,
  capturedPhoto: null,
  selectedBg: null,
  selectedStyle: null,
  selectedFrame: 'frame1',  // 默认选中第一个边框
  resultImage: null,
  mockMode: false,
}

export function useAppState() {
  const [state, setState] = useState<AppState>(() => {
    // 每次刷新都从首页开始，清除旧状态
    try { sessionStorage.clear() } catch {}
    return INITIAL_STATE
  })

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const resetIdleTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (state.page !== 'home' && state.page !== 'compose') {
      timerRef.current = setTimeout(() => {
        setState(INITIAL_STATE)
      }, 120000) // 2分钟无操作回到首页
    }
  }, [state.page])

  useEffect(() => {
    resetIdleTimer()
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [state.page, resetIdleTimer])

  const goTo = useCallback((page: AppPage) => {
    setState(prev => ({ ...prev, page }))
  }, [])

  const setStudentInfo = useCallback((info: StudentInfo) => {
    setState(prev => ({ ...prev, studentInfo: info, page: 'camera' }))
  }, [])

  const setCapturedPhoto = useCallback((photo: string) => {
    if (!photo) {
      setState(prev => ({ ...prev, capturedPhoto: null }))
    } else {
      setState(prev => ({ ...prev, capturedPhoto: photo }))
    }
  }, [])

  const setSelectedBg = useCallback((bg: string) => {
    setState(prev => ({ ...prev, selectedBg: bg }))
  }, [])

  const setSelectedStyle = useCallback((style: string) => {
    setState(prev => ({ ...prev, selectedStyle: style }))
  }, [])

  const setSelectedFrame = useCallback((frame: string) => {
    setState(prev => ({ ...prev, selectedFrame: frame }))
  }, [])

  const setResultImage = useCallback((image: string) => {
    setState(prev => ({ ...prev, resultImage: image, page: 'print' }))
  }, [])

  const toggleMockMode = useCallback(() => {
    setState(prev => ({ ...prev, mockMode: !prev.mockMode }))
  }, [])

  const reset = useCallback(() => {
    setState(INITIAL_STATE)
  }, [])

  return {
    state,
    goTo,
    setStudentInfo,
    setCapturedPhoto,
    setSelectedBg,
    setSelectedStyle,
    setSelectedFrame,
    setResultImage,
    toggleMockMode,
    reset,
    resetIdleTimer,
  }
}
