import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Dashboard from './pages/Dashboard.jsx'
import MobileCamera from './pages/MobileCamera.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/mobile" element={<MobileCamera />} />
      </Routes>
    </BrowserRouter>
  )
}
