// client/src/context/NarrationContext.jsx
//
// Estado global y liviano para el "Narrador de Seguridad IA":
//  - enabled: interruptor maestro (ON/OFF para todo el sistema)
//  - intervalMs: cada cuánto se captura/analiza un frame por cámara
//  - activeAudioCameraId: qué cámara "tiene el micrófono" en este momento.
//    Solo una cámara reproduce audio a la vez para evitar que varias voces
//    se superpongan; el resto sigue mostrando subtítulos en silencio.
//    El operador puede "tomar el micrófono" de otra cámara con un clic.

import React, { createContext, useContext, useState, useCallback } from 'react'

const NarrationContext = createContext(null)

const DEFAULT_INTERVAL_MS = Number(import.meta.env.VITE_NARRATION_INTERVAL_MS) || 6000

export function NarrationProvider({ children }) {
  const [enabled, setEnabled] = useState(true)
  const [intervalMs, setIntervalMs] = useState(DEFAULT_INTERVAL_MS)
  const [activeAudioCameraId, setActiveAudioCameraId] = useState(null)

  const toggleEnabled = useCallback(() => setEnabled((v) => !v), [])

  return (
    <NarrationContext.Provider
      value={{
        enabled,
        toggleEnabled,
        intervalMs,
        setIntervalMs,
        activeAudioCameraId,
        setActiveAudioCameraId,
      }}
    >
      {children}
    </NarrationContext.Provider>
  )
}

export function useNarrationSettings() {
  const ctx = useContext(NarrationContext)
  if (!ctx) {
    throw new Error('useNarrationSettings debe usarse dentro de <NarrationProvider>')
  }
  return ctx
}
