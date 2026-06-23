import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter, Routes, Route } from 'react-router-dom'
import './styles.css'
import Home from './pages/Home'
import NewGroup from './pages/NewGroup'
import Member from './pages/Member'
import Admin from './pages/Admin'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/new" element={<NewGroup />} />
        <Route path="/g/:code" element={<Member />} />
        <Route path="/g/:code/admin" element={<Admin />} />
      </Routes>
    </HashRouter>
  </React.StrictMode>
)
