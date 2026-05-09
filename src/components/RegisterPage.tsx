import { useState } from 'react'
import AppHeader from './AppHeader'
import type { StudentInfo } from '../state/useAppState'

interface Props {
  onSubmit: (info: StudentInfo) => void
  onBack: () => void
}

export default function RegisterPage({ onSubmit, onBack }: Props) {
  const [name, setName] = useState('')
  const [className, setClassName] = useState('')
  const [phone, setPhone] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    if (!name.trim()) newErrors.name = '请输入姓名'
    if (!className.trim()) newErrors.className = '请输入班级'
    if (!phone.trim()) {
      newErrors.phone = '请输入手机号'
    } else if (!/^1[3-9]\d{9}$/.test(phone)) {
      newErrors.phone = '请输入正确的11位手机号'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (validate()) {
      onSubmit({
        name: name.trim(),
        className: className.trim(),
        phone: phone.trim(),
      })
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#F7FAFC',
    }}>
      {/* Header */}
      <AppHeader />

      {/* 主体 */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
        position: 'relative',
      }}>
        {/* 返回按钮 */}
        <div style={{ position: 'absolute', top: 20, left: 20 }}>
          <button
            onClick={onBack}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 18,
              color: '#1565C0',
              cursor: 'pointer',
              padding: '8px 16px',
            }}
          >
            ← 返回首页
          </button>
        </div>

        {/* 登记卡片 */}
        <div style={{
          width: '100%',
          maxWidth: 480,
          backgroundColor: 'white',
          borderRadius: 16,
          padding: '40px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
        }}>
          <h2 style={{
            textAlign: 'center',
            fontSize: 28,
            fontWeight: 'bold',
            color: '#1A202C',
            marginBottom: 8,
          }}>
            学生信息登记
          </h2>

          <p style={{
            textAlign: 'center',
            color: '#718096',
            fontSize: 16,
            marginBottom: 32,
          }}>
            请填写以下信息开始体验
          </p>

          <form onSubmit={handleSubmit}>
            {/* 姓名 */}
            <div style={{ marginBottom: 20 }}>
              <label style={{
                display: 'block',
                marginBottom: 8,
                fontWeight: 600,
                color: '#1A202C',
                fontSize: 16,
              }}>
                姓名
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="请输入姓名"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: errors.name ? '2px solid #F56565' : '2px solid #E2E8F0',
                  borderRadius: 10,
                  fontSize: 16,
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s',
                }}
                onFocus={(e) => { if (!errors.name) e.target.style.borderColor = '#1565C0' }}
                onBlur={(e) => { if (!errors.name) e.target.style.borderColor = '#E2E8F0' }}
              />
              {errors.name && (
                <p style={{ color: '#F56565', fontSize: 13, marginTop: 4 }}>{errors.name}</p>
              )}
            </div>

            {/* 班级 */}
            <div style={{ marginBottom: 20 }}>
              <label style={{
                display: 'block',
                marginBottom: 8,
                fontWeight: 600,
                color: '#1A202C',
                fontSize: 16,
              }}>
                班级
              </label>
              <input
                type="text"
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                placeholder="请输入班级"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: errors.className ? '2px solid #F56565' : '2px solid #E2E8F0',
                  borderRadius: 10,
                  fontSize: 16,
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s',
                }}
                onFocus={(e) => { if (!errors.className) e.target.style.borderColor = '#1565C0' }}
                onBlur={(e) => { if (!errors.className) e.target.style.borderColor = '#E2E8F0' }}
              />
              {errors.className && (
                <p style={{ color: '#F56565', fontSize: 13, marginTop: 4 }}>{errors.className}</p>
              )}
            </div>

            {/* 电话 */}
            <div style={{ marginBottom: 32 }}>
              <label style={{
                display: 'block',
                marginBottom: 8,
                fontWeight: 600,
                color: '#1A202C',
                fontSize: 16,
              }}>
                电话
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                placeholder="请输入11位手机号"
                maxLength={11}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: errors.phone ? '2px solid #F56565' : '2px solid #E2E8F0',
                  borderRadius: 10,
                  fontSize: 16,
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s',
                }}
                onFocus={(e) => { if (!errors.phone) e.target.style.borderColor = '#1565C0' }}
                onBlur={(e) => { if (!errors.phone) e.target.style.borderColor = '#E2E8F0' }}
              />
              {errors.phone && (
                <p style={{ color: '#F56565', fontSize: 13, marginTop: 4 }}>{errors.phone}</p>
              )}
            </div>

            {/* 提交按钮 */}
            <button
              type="submit"
              style={{
                width: '100%',
                padding: '16px',
                backgroundColor: '#1565C0',
                color: 'white',
                border: 'none',
                borderRadius: 12,
                fontSize: 20,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'background-color 0.2s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#0D47A1' }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#1565C0' }}
            >
              确认登记 开始拍照 →
            </button>

            <p style={{
              textAlign: 'center',
              color: '#A0AEC0',
              fontSize: 13,
              marginTop: 16,
            }}>
              信息仅用于展演活动记录，不对外公开
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
