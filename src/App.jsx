import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [isEnabled, setIsEnabled] = useState(false)
  const [templates, setTemplates] = useState([])
  const [newTemplate, setNewTemplate] = useState({ name: '', subject: '', body: '', keywords: '' })
  const [showAddForm, setShowAddForm] = useState(false)

  useEffect(() => {
    // Load settings from Chrome storage
    chrome.storage.sync.get(['autoResponderEnabled', 'emailTemplates'], (result) => {
      setIsEnabled(result.autoResponderEnabled || false)
      setTemplates(result.emailTemplates || [])
    })
  }, [])

  const toggleExtension = () => {
    const newState = !isEnabled
    setIsEnabled(newState)
    chrome.storage.sync.set({ autoResponderEnabled: newState })
    
    // Notify content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { 
        action: 'toggleAutoResponder', 
        enabled: newState 
      })
    })
  }

  const addTemplate = () => {
    if (!newTemplate.name || !newTemplate.body) return
    
    const template = {
      id: Date.now(),
      name: newTemplate.name,
      subject: newTemplate.subject || 'Auto Response',
      body: newTemplate.body,
      keywords: newTemplate.keywords.split(',').map(k => k.trim()).filter(k => k)
    }
    
    const updatedTemplates = [...templates, template]
    setTemplates(updatedTemplates)
    chrome.storage.sync.set({ emailTemplates: updatedTemplates })
    
    setNewTemplate({ name: '', subject: '', body: '', keywords: '' })
    setShowAddForm(false)
  }

  const deleteTemplate = (id) => {
    const updatedTemplates = templates.filter(t => t.id !== id)
    setTemplates(updatedTemplates)
    chrome.storage.sync.set({ emailTemplates: updatedTemplates })
  }

  return (
    <div className="app">
      <div className="header">
        <h2>Email Auto Responder</h2>
        <div className="toggle-container">
          <label className="switch">
            <input 
              type="checkbox" 
              checked={isEnabled} 
              onChange={toggleExtension}
            />
            <span className="slider"></span>
          </label>
          <span className={`status ${isEnabled ? 'enabled' : 'disabled'}`}>
            {isEnabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
      </div>

      <div className="templates-section">
        <div className="section-header">
          <h3>Response Templates</h3>
          <button 
            className="add-btn"
            onClick={() => setShowAddForm(!showAddForm)}
          >
            +
          </button>
        </div>

        {showAddForm && (
          <div className="add-form">
            <input
              type="text"
              placeholder="Template name"
              value={newTemplate.name}
              onChange={(e) => setNewTemplate({...newTemplate, name: e.target.value})}
            />
            <input
              type="text"
              placeholder="Email subject (optional)"
              value={newTemplate.subject}
              onChange={(e) => setNewTemplate({...newTemplate, subject: e.target.value})}
            />
            <textarea
              placeholder="Response message"
              value={newTemplate.body}
              onChange={(e) => setNewTemplate({...newTemplate, body: e.target.value})}
              rows="3"
            />
            <input
              type="text"
              placeholder="Keywords (comma-separated, optional)"
              value={newTemplate.keywords}
              onChange={(e) => setNewTemplate({...newTemplate, keywords: e.target.value})}
            />
            <div className="form-buttons">
              <button onClick={addTemplate} className="save-btn">Save</button>
              <button onClick={() => setShowAddForm(false)} className="cancel-btn">Cancel</button>
            </div>
          </div>
        )}

        <div className="templates-list">
          {templates.length === 0 ? (
            <p className="no-templates">No templates yet. Add one to get started!</p>
          ) : (
            templates.map(template => (
              <div key={template.id} className="template-item">
                <div className="template-info">
                  <h4>{template.name}</h4>
                  <p className="template-subject">Subject: {template.subject}</p>
                  <p className="template-body">{template.body.substring(0, 100)}...</p>
                  {template.keywords.length > 0 && (
                    <div className="keywords">
                      Keywords: {template.keywords.join(', ')}
                    </div>
                  )}
                </div>
                <button 
                  className="delete-btn"
                  onClick={() => deleteTemplate(template.id)}
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="info">
        <p className="help-text">
          When enabled, this extension will automatically respond to emails based on your templates and keywords.
        </p>
      </div>
    </div>
  )
}

export default App