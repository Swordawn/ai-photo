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
  selectedFrame: null,
  resultImage: null,
  mockMode: false,
}

// sessionStorage keys
const STORAGE_KEYS = {
  STUDENT_INFO: 'photoBooth_studentInfo',
  CAPTURED_PHOTO: 'photoBooth_capturedPhoto',
  SELECTED_BG: 'photoBooth_selectedBg',
  SELECTED_STYLE: 'photoBooth_selectedStyle',
  SELECTED_FRAME: 'photoBooth_selectedFrame',
  RESULT_IMAGE: 'photoBooth_resultImage',
}

function saveToStorage(key: string, value: unknown) {
  try {
    if (value === null || value === undefined) {
      sessionStorage.removeItem(key)
    } else if (typeof value === 'string') {
      sessionStorage.setItem(key, value)
    } else {
      sessionStorage.setItem(key, JSON.stringify(value))
    }
  } catch (e) {
    console.warn('sessionStorage write failed:', e)
  }
}

function clearStorage() {
  Object.values(STORAGE_KEYS).forEach(key => {
    sessionStorage.removeItem(key)
  })
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
        clearStorage()
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
    saveToStorage(STORAGE_KEYS.STUDENT_INFO, info)
    setState(prev => ({ ...prev, studentInfo: info, page: 'camera' }))
  }, [])

  const setCapturedPhoto = useCallback((photo: string) => {
    if (!photo) {
      saveToStorage(STORAGE_KEYS.CAPTURED_PHOTO, null)
      setState(prev => ({ ...prev, capturedPhoto: null }))
    } else {
      saveToStorage(STORAGE_KEYS.CAPTURED_PHOTO, photo)
      setState(prev => ({ ...prev, capturedPhoto: photo }))
    }
  }, [])

  const setSelectedBg = useCallback((bg: string) => {
    saveToStorage(STORAGE_KEYS.SELECTED_BG, bg)
    setState(prev => ({ ...prev, selectedBg: bg }))
  }, [])

  const setSelectedStyle = useCallback((style: string) => {
    saveToStorage(STORAGE_KEYS.SELECTED_STYLE, style)
    setState(prev => ({ ...prev, selectedStyle: style }))
  }, [])

  const setSelectedFrame = useCallback((frame: string) => {
    saveToStorage(STORAGE_KEYS.SELECTED_FRAME, frame)
    setState(prev => ({ ...prev, selectedFrame: frame }))
  }, [])

  const setResultImage = useCallback((image: string) => {
    saveToStorage(STORAGE_KEYS.RESULT_IMAGE, image)
    setState(prev => ({ ...prev, resultImage: image, page: 'print' }))
  }, [])

  const toggleMockMode = useCallback(() => {
    setState(prev => ({ ...prev, mockMode: !prev.mockMode }))
  }, [])

  const reset = useCallback(() => {
    clearStorage()
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
