import { motion } from 'framer-motion'
import { useMemo } from 'react'

interface Particle {
  id: number
  x: number
  y: number
  isStrand: boolean
  width: number
  height: number
  opacity: number
  driftX: number
  driftY: number
  durationX: number
  durationY: number
  delay: number
  rotate: number
}

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min
}

const PARTICLE_COUNT = 18

export default function FloatingCatkins() {
  const particles = useMemo<Particle[]>(() => {
    return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
      const isStrand = Math.random() > 0.4
      return {
        id: i,
        x: rand(0, 100),
        y: rand(0, 100),
        isStrand,
        width: isStrand ? rand(4, 7) : rand(3, 6),
        height: isStrand ? rand(12, 22) : rand(3, 6),
        opacity: rand(0.5, 0.9),
        driftX: rand(30, 80) * (Math.random() > 0.5 ? 1 : -1),
        driftY: rand(20, 50),
        durationX: rand(8, 15),
        durationY: rand(6, 12),
        delay: rand(0, 5),
        rotate: rand(-30, 30),
      }
    })
  }, [])

  return (
    <div className="fixed inset-0 z-50 pointer-events-none overflow-hidden">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          style={{
            position: 'absolute',
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.width,
            height: p.height,
            borderRadius: p.isStrand ? '40%' : '50%',
            background: p.isStrand
              ? 'rgba(255,255,255,0.85)'
              : 'rgba(255,255,255,0.7)',
            opacity: p.opacity,
            boxShadow: '0 0 6px rgba(255,255,255,0.4)',
            rotate: p.rotate,
            willChange: 'transform',
          }}
          animate={{
            x: [0, p.driftX, 0],
            y: [0, -p.driftY, 0],
          }}
          transition={{
            x: {
              duration: p.durationX,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: p.delay,
            },
            y: {
              duration: p.durationY,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: p.delay + 1,
            },
          }}
        />
      ))}
    </div>
  )
}
